/**
 * Liaison React d'une tâche de Studio : soumet la tâche à l'ordonnanceur quand sa clé ou son empreinte change, garde
 * la dernière valeur remise (affichée pendant le calcul suivant) et ne remet jamais un résultat périmé : seule la tâche
 * courante de sa clé appelle `surResultat` (D.2-03). Démontage ou nouvelle empreinte : la tâche précédente est
 * abandonnée (son résultat éventuel sera périmé).
 *
 * Sans Worker (rendu serveur, tests), la valeur initiale est calculée directement (`initial`), comme le Worker l'aurait
 * fait : mêmes fonctions, mêmes résultats.
 */
import { useEffect, useRef, useState } from "react";
import { texteEmpreinte } from "./empreinte";
import { messageTache } from "./messages";
import type { DemandeTache, EtatTache, Ordonnanceur } from "./ordonnanceur";
import { ordonnanceurStudio } from "./pool-studio";

export interface EtatLieTache<R> {
  /** Dernière valeur remise (peut correspondre à une révision antérieure tant que le calcul suivant tourne). */
  valeur: R | undefined;
  /** État de la dernière tâche soumise ; `inactive` sans demande. */
  etat: EtatTache | "inactive";
  /** Message d'échec (français source) ou `null`. */
  message: string | null;
  /** Révision d'entrée de la valeur remise. */
  revision: string | null;
}

export type DemandeLiee<C, R> = Omit<DemandeTache<C, R>, "surResultat" | "signal">;

export function useTache<C, R>(demande: DemandeLiee<C, R> | null, o: { initial?: () => R; ordonnanceur?: Ordonnanceur } = {}): EtatLieTache<R> {
  const cle = demande ? `${demande.cle}|${texteEmpreinte(demande.empreinte)}` : null;
  const calculeeDirectement = useRef<string | null>(null);
  const [etat, setEtat] = useState<EtatLieTache<R>>(() => {
    if (demande && o.initial && typeof Worker === "undefined") {
      calculeeDirectement.current = cle;
      return { valeur: o.initial(), etat: "done", message: null, revision: demande.empreinte.revision };
    }
    return { valeur: undefined, etat: demande ? "queued" : "inactive", message: null, revision: null };
  });
  const derniere = useRef(demande);
  derniere.current = demande;
  const ordonnanceur = o.ordonnanceur;

  useEffect(() => {
    const d = derniere.current;
    if (!d || cle === null) { setEtat((v) => (v.etat === "inactive" ? v : { ...v, etat: "inactive", message: null })); return; }
    if (calculeeDirectement.current === cle) return;
    calculeeDirectement.current = null;
    let actif = true;
    const p = (ordonnanceur ?? ordonnanceurStudio()).soumettre<C, R>({
      ...d,
      surResultat: (valeur) => { if (actif) setEtat({ valeur, etat: "done", message: null, revision: d.empreinte.revision }); },
    });
    setEtat((v) => (v.etat === p.tache.etat && v.message === null ? v : { ...v, etat: p.tache.etat, message: null }));
    void p.issue.then((i) => {
      if (actif && i.etat !== "done" && i.etat !== "cancelled") setEtat((v) => ({ ...v, etat: i.etat, message: messageTache(i) }));
    });
    return () => { actif = false; p.abandonner(); };
  }, [cle, ordonnanceur]);

  return etat;
}
