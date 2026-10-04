/** Construction du `ContexteAtelier` à partir du bus local (L2.4). Contrat figé au lot 3a. */
import { appliquerLot, CONTRAT_COMMANDES, type Commande, type IdObjet } from "@parcours/atelier-model";
import type { DetailErreur } from "../../../lib/api/atelier-commandes";
import type { BusAtelier } from "../bus";
import type { ContexteAtelier, ErreurLisible, ResultatValidation, SelectionAtelier } from "./contrats";

export function erreurLisible(d: Pick<DetailErreur, "objet" | "cause" | "action" | "message" | "objetIds">): ErreurLisible {
  return { objet: d.objet, cause: d.cause, action: d.action, message: d.message, ...(d.objetIds ? { objetIds: d.objetIds } : {}) };
}

const MODELE_ABSENT: ErreurLisible = { objet: "Modèle", cause: "non chargé", action: "ouvrir le projet en ligne une première fois", message: "Modèle : non chargé — ouvrir le projet en ligne une première fois" };

export interface OptionsContexte {
  readonly projetId: string;
  /** Sous-ensemble du bus utilisé (injectable en test). */
  readonly bus: Pick<BusAtelier, "etatLocal" | "executer">;
  readonly selection: SelectionAtelier;
  readonly niveauActifId: IdObjet | null;
  readonly calqueActifId: IdObjet | null;
  readonly ecriture: ContexteAtelier["ecriture"];
  /** Générateur d'identifiants (défaut : `crypto.randomUUID`). */
  readonly genererId?: () => string;
}

export function creerContexte(o: OptionsContexte): ContexteAtelier {
  const genererId = o.genererId ?? (() => crypto.randomUUID());
  return {
    projetId: o.projetId,
    etat: () => o.bus.etatLocal(),
    niveauActifId: o.niveauActifId,
    calqueActifId: o.calqueActifId,
    selection: o.selection,
    ecriture: o.ecriture,
    async valider(label: string, commandes: readonly Commande[]): Promise<ResultatValidation> {
      if (!o.ecriture.permise) return { ok: false, erreurs: [{ objet: "Projet", cause: o.ecriture.motif, action: "ouvrir une copie de travail ou demander l'accès", message: `Projet : ${o.ecriture.motif}` }] };
      const r = await o.bus.executer(label, commandes);
      return r.ok ? { ok: true, etat: r.etat } : { ok: false, erreurs: r.erreurs.map(erreurLisible) };
    },
    essayer(commandes: readonly Commande[]): ResultatValidation {
      const etat = o.bus.etatLocal();
      if (!etat) return { ok: false, erreurs: [MODELE_ABSENT] };
      const r = appliquerLot(etat, { contract: CONTRAT_COMMANDES, requestId: "essai-local", label: "Essai", baseRevision: etat.revision, commands: commandes });
      return r.ok ? { ok: true, etat: r.etat } : { ok: false, erreurs: r.erreurs.map(erreurLisible) };
    },
    nouvelId: (prefixe: string) => `${prefixe}-${genererId()}`,
  };
}
