/**
 * Adaptateurs du bus vers les composants existants, réutilisés sans changer leurs usages actuels (props
 * facultatives) : `SyncIndicator` (`atelier: SourceSynchroAtelier`) et `ConflictPanel`
 * (`atelier: SourceConflitsAtelier`). Branchés par le nouvel Atelier au lot 3a ; au lot 2, aucun écran ne
 * les passe (l'Atelier visible reste l'ancien).
 *
 * Les instantanés rendus par `get()` sont mis en cache et ne changent qu'à un événement du bus
 * (exigence de `useSyncExternalStore`).
 */
import type { ConflitAtelierAffiche, SourceConflitsAtelier } from "../../../components/ConflictPanel";
import type { SourceSynchroAtelier } from "../../../components/SyncIndicator";
import type { BusAtelier } from "./bus";
import type { DonneesConflit } from "./conflits";

/** Conflit du bus → ligne du panneau (objet, champ, valeur du serveur, votre version). */
export function conflitAffiche(d: DonneesConflit): ConflitAtelierAffiche {
  const bloques = d.lotsBloques > 0 ? ` ${d.lotsBloques} lot(s) suivant(s) attendent votre décision.` : "";
  return {
    id: d.requestId,
    at: d.recuLe,
    libelle: d.label,
    message: `fondé sur la révision ${d.baseRevision}, le serveur est à la révision ${d.revisionCourante}.${bloques}`,
    lignes: d.objets.flatMap((o) =>
      o.ecarts.length > 0
        ? o.ecarts.map((e) => ({ objet: o.objetId, champ: e.cle, serveur: e.serveur, local: e.local }))
        : [{ objet: o.objetId, champ: o.motif || "—", serveur: o.serveur ? "modifié" : "supprimé", local: o.local ? "présent" : "absent" }],
    ),
    erreurs: d.erreursRevalidation.map((e) => e.message),
  };
}

export function sourceSynchro(bus: BusAtelier): SourceSynchroAtelier {
  let cache: { enAttente: number; conflits: number } | null = null;
  const lire = () => {
    const r = bus.resume();
    if (!cache || cache.enAttente !== r.enAttente || cache.conflits !== r.conflits) cache = { enAttente: r.enAttente, conflits: r.conflits };
    return cache;
  };
  return {
    subscribe: (fn) => bus.on("etat", () => fn()),
    get: lire,
    synchroniser: () => bus.synchroniser(),
  };
}

export function sourceConflits(bus: BusAtelier): SourceConflitsAtelier {
  let cache: readonly ConflitAtelierAffiche[] = [];
  let cle = "";
  const lire = () => {
    const donnees = bus.conflits();
    const nouvelle = JSON.stringify(donnees);
    if (nouvelle !== cle) {
      cle = nouvelle;
      cache = donnees.map(conflitAffiche);
    }
    return cache;
  };
  return {
    subscribe: (fn) => {
      const a = bus.on("etat", () => fn());
      const b = bus.on("conflit", () => fn());
      return () => {
        a();
        b();
      };
    },
    get: lire,
    garderServeur: (id) => bus.resoudreConflit(id, "garder-serveur"),
    rejouer: (id) => bus.resoudreConflit(id, "rejouer"),
  };
}
