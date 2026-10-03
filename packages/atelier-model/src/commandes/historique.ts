/**
 * Annuler / rétablir local avec `CommandHistory` de `@parcours/domain-model` (cahier §5.1, §5.3).
 *
 * Chaque lot accepté devient une `Command<EtatModele>` : `apply` rejoue l'enveloppe sur la révision courante,
 * `undo` applique l'inverse du lot (restauration exacte). Annuler et rétablir sont de nouvelles microversions
 * (révision + 1, comme `POST /commands/annuler` et `/retablir`) ; l'empreinte revient à celle d'avant.
 *
 * Un lot refusé, ou qui ne change pas le modèle (D-024), n'entre pas dans l'historique. `CommandHistory` dépile une commande avant de l'appliquer :
 * pour qu'un échec (état divergé) ne la perde pas, l'annulation et le rétablissement sont d'abord préparés
 * (calcul pur), puis seulement confiés à `CommandHistory`, qui réutilise le résultat préparé. En cas d'échec,
 * `ErreurHistorique` est levée avec les erreurs motivées et rien ne change.
 */
import { CommandHistory, type Command, type CommandHistoryOptions } from "@parcours/domain-model";
import type { Commande } from "../contrats/commandes.js";
import type { EnveloppeCommandes } from "../contrats/enveloppe.js";
import type { EtatModele } from "../contrats/etat.js";
import type { ErreurCommande, ResultatLot } from "../contrats/reducteurs.js";
import { appliquerLot, enveloppeInverse } from "./moteur.js";

export class ErreurHistorique extends Error {
  constructor(
    message: string,
    readonly erreurs: readonly ErreurCommande[],
  ) {
    super(message);
    this.name = "ErreurHistorique";
  }
}

type LotAccepte = Extract<ResultatLot, { ok: true }>;

function exiger(r: ResultatLot, quoi: string): LotAccepte {
  if (!r.ok) throw new ErreurHistorique(`${quoi} impossible : ${r.erreurs.map((e) => `${e.chemin} — ${e.message}`).join(" ; ")}`, r.erreurs);
  return r;
}

/** Lot de l'historique : commande `CommandHistory` dont l'application et l'annulation se préparent à part. */
class CommandeLot implements Command<EtatModele> {
  readonly label: string;
  private inverse: readonly Commande[];
  private prepare: { readonly entree: EtatModele; readonly sens: "apply" | "undo"; readonly resultat: LotAccepte } | null;
  private compteur = 0;

  constructor(
    private readonly lot: EnveloppeCommandes,
    entree: EtatModele,
    resultat: LotAccepte,
  ) {
    this.label = lot.label;
    this.inverse = resultat.inverse;
    this.prepare = { entree, sens: "apply", resultat };
  }

  /** Calcule (sans rien changer) le résultat de `apply` ou `undo` sur `etat` ; lève `ErreurHistorique` si refusé. */
  preparer(etat: EtatModele, sens: "apply" | "undo"): void {
    if (this.prepare && this.prepare.entree === etat && this.prepare.sens === sens) return;
    const n = ++this.compteur;
    const r =
      sens === "apply"
        ? exiger(appliquerLot(etat, { ...this.lot, requestId: `${this.lot.requestId}#retablir-${n}`, baseRevision: etat.revision }), `Rétablir « ${this.label} »`)
        : exiger(appliquerLot(etat, enveloppeInverse(this.lot, this.inverse, etat.revision, `${this.lot.requestId}#annuler-${n}`)), `Annuler « ${this.label} »`);
    this.prepare = { entree: etat, sens, resultat: r };
  }

  private executer(etat: EtatModele, sens: "apply" | "undo"): EtatModele {
    this.preparer(etat, sens);
    const r = this.prepare?.resultat;
    this.prepare = null;
    if (!r) throw new ErreurHistorique(`${this.label} : résultat préparé absent`, []);
    if (sens === "apply") this.inverse = r.inverse;
    return r.etat;
  }

  apply(etat: EtatModele): EtatModele {
    return this.executer(etat, "apply");
  }

  undo(etat: EtatModele): EtatModele {
    return this.executer(etat, "undo");
  }
}

export class HistoriqueAtelier {
  private readonly historique: CommandHistory<EtatModele>;
  private readonly maxEntrees: number | undefined;
  private readonly annulables: CommandeLot[] = [];
  private readonly retablissables: CommandeLot[] = [];

  constructor(etat: EtatModele, options: CommandHistoryOptions = {}) {
    this.historique = new CommandHistory<EtatModele>(etat, options);
    this.maxEntrees = options.maxEntries;
  }

  etat(): EtatModele {
    return this.historique.getState();
  }

  /** Applique un lot ; accepté, il entre dans l'historique (la pile « rétablir » est vidée). */
  executer(lot: EnveloppeCommandes): ResultatLot {
    const entree = this.etat();
    const resultat = appliquerLot(entree, lot);
    if (!resultat.ok) return resultat;
    // Lot sans changement du modèle (D-024) : rien à annuler, il n'entre pas dans l'historique.
    if (resultat.inverse.length === 0) return resultat;
    const c = new CommandeLot(lot, entree, resultat);
    this.historique.do(c);
    this.annulables.push(c);
    this.retablissables.length = 0;
    if (this.maxEntrees !== undefined && this.annulables.length > this.maxEntrees) this.annulables.splice(0, this.annulables.length - this.maxEntrees);
    return resultat;
  }

  peutAnnuler(): boolean {
    return this.historique.canUndo();
  }

  peutRetablir(): boolean {
    return this.historique.canRedo();
  }

  libellesAnnulables(): string[] {
    return this.historique.undoLabels();
  }

  libellesRetablissables(): string[] {
    return this.historique.redoLabels();
  }

  /** Annule le dernier lot ; lève `ErreurHistorique` (historique inchangé) si l'état ne le permet plus. */
  annuler(): EtatModele {
    const c = this.annulables[this.annulables.length - 1];
    if (!c) return this.etat();
    c.preparer(this.etat(), "undo");
    this.annulables.pop();
    this.retablissables.push(c);
    return this.historique.undo();
  }

  /** Rétablit le dernier lot annulé ; lève `ErreurHistorique` (historique inchangé) si impossible. */
  retablir(): EtatModele {
    const c = this.retablissables[this.retablissables.length - 1];
    if (!c) return this.etat();
    c.preparer(this.etat(), "apply");
    this.retablissables.pop();
    this.annulables.push(c);
    return this.historique.redo();
  }
}
