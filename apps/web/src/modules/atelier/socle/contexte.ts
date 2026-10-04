/** Construction du `ContexteAtelier` à partir du bus local (L2.4) et du client des routes §5.4. Contrat figé au lot 3a. */
import { appliquerLot, CONTRAT_COMMANDES, type Commande } from "@parcours/atelier-model";
import type { ClientAtelierCommandes, DetailErreur, ResultatEcriture } from "../../../lib/api/atelier-commandes";
import type { BusAtelier } from "../bus";
import type { ContexteAtelier, ErreurLisible, EtatInterface, ResultatValidation, SelectionAtelier } from "./contrats";

export function erreurLisible(d: Pick<DetailErreur, "objet" | "cause" | "action" | "message" | "objetIds">): ErreurLisible {
  return { objet: d.objet, cause: d.cause, action: d.action, message: d.message, ...(d.objetIds ? { objetIds: d.objetIds } : {}) };
}

const lisible = (objet: string, cause: string, action: string): ErreurLisible => ({ objet, cause, action, message: `${objet} : ${cause} — ${action}` });

const MODELE_ABSENT = lisible("Modèle", "non chargé", "ouvrir le projet en ligne une première fois");

export interface OptionsContexte {
  readonly projetId: string;
  /** Sous-ensemble du bus utilisé (injectable en test). */
  readonly bus: Pick<BusAtelier, "etatLocal" | "etatConfirme" | "executer" | "entrees" | "joignabilite" | "rafraichir">;
  /** Routes annuler / rétablir (`creerClientAtelierCommandes()`). */
  readonly client: Pick<ClientAtelierCommandes, "annuler" | "retablir">;
  readonly selection: SelectionAtelier;
  readonly vue: EtatInterface;
  readonly ecriture: ContexteAtelier["ecriture"];
  /** Générateur d'identifiants (défaut : `crypto.randomUUID`). */
  readonly genererId?: () => string;
}

/** Traduction d'une réponse d'écriture du serveur en erreurs lisibles (annuler / rétablir). */
function erreursEcriture(r: Exclude<ResultatEcriture, { statut: "accepte" }>): readonly ErreurLisible[] {
  switch (r.statut) {
    case "invalide":
      return r.details.length ? r.details.map(erreurLisible) : [lisible("Historique", r.message, "vérifier qu'une modification est annulable")];
    case "conflit":
      return [lisible("Historique", "le modèle a changé entre-temps", "relire le modèle puis réessayer")];
    case "interdit":
    case "reserve":
      return [lisible("Projet", r.message, "demander l'accès ou attendre la fin de la réservation")];
    case "injoignable":
      return [lisible("Serveur", "injoignable", "réessayer une fois en ligne")];
    default:
      return [lisible("Serveur", r.message, "réessayer")];
  }
}

export function creerContexte(o: OptionsContexte): ContexteAtelier {
  const genererId = o.genererId ?? (() => crypto.randomUUID());
  const refusEcriture = (): ResultatValidation | null =>
    o.ecriture.permise ? null : { ok: false, erreurs: [lisible("Projet", o.ecriture.motif, "ouvrir une copie de travail ou demander l'accès")] };

  /** Annuler / rétablir passent par le serveur : en ligne, file vide, puis relecture du modèle. */
  const inverse = async (sens: "annuler" | "retablir"): Promise<ResultatValidation> => {
    const refus = refusEcriture();
    if (refus) return refus;
    if (o.bus.joignabilite() !== "en-ligne") return { ok: false, erreurs: [lisible("Historique", "hors ligne", "annuler ou rétablir une fois en ligne")] };
    if (o.bus.entrees().length > 0) return { ok: false, erreurs: [lisible("Historique", "des modifications attendent leur envoi", "attendre la fin de la synchronisation")] };
    const confirme = o.bus.etatConfirme();
    if (!confirme) return { ok: false, erreurs: [MODELE_ABSENT] };
    const r = await o.client[sens](o.projetId, { requestId: genererId(), baseRevision: confirme.revision });
    if (r.statut !== "accepte") return { ok: false, erreurs: erreursEcriture(r) };
    await o.bus.rafraichir();
    const etat = o.bus.etatLocal();
    return etat ? { ok: true, etat } : { ok: false, erreurs: [MODELE_ABSENT] };
  };

  return {
    projetId: o.projetId,
    etat: () => o.bus.etatLocal(),
    niveauActif: () => o.vue.lire().niveauActifId,
    calqueActif: () => o.vue.lire().calqueActifId,
    selection: o.selection,
    ecriture: o.ecriture,
    async valider(label: string, commandes: readonly Commande[]): Promise<ResultatValidation> {
      const refus = refusEcriture();
      if (refus) return refus;
      const r = await o.bus.executer(label, commandes);
      return r.ok ? { ok: true, etat: r.etat } : { ok: false, erreurs: r.erreurs.map(erreurLisible) };
    },
    essayer(commandes: readonly Commande[]): ResultatValidation {
      const etat = o.bus.etatLocal();
      if (!etat) return { ok: false, erreurs: [MODELE_ABSENT] };
      const r = appliquerLot(etat, { contract: CONTRAT_COMMANDES, requestId: "essai-local", label: "Essai", baseRevision: etat.revision, commands: commandes });
      return r.ok ? { ok: true, etat: r.etat } : { ok: false, erreurs: r.erreurs.map(erreurLisible) };
    },
    annuler: () => inverse("annuler"),
    retablir: () => inverse("retablir"),
    nouvelId: (prefixe: string) => `${prefixe}-${genererId()}`,
  };
}
