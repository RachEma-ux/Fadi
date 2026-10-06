/**
 * Menu principal de l'Atelier (D-160, ergonomie SketchUp pour le Web) : état d'enregistrement lisible et condition du
 * partage. Pur : aucun DOM. Le partage n'est proposé que lorsque tout est enregistré sur le serveur (R9).
 */
export interface EtatEnregistrement {
  /** Lots locaux ou en cours d'envoi. */
  enAttente: number;
  /** Lots en conflit ou refusés. */
  aTraiter: number;
  enLigne: boolean;
  joignable: boolean;
  lecture: boolean;
  revision: number;
}

export function messageEnregistrement(e: EtatEnregistrement): { enregistre: boolean; message: string } {
  if (e.lecture) return { enregistre: true, message: "Lecture seule : rien à enregistrer." };
  if (e.aTraiter) return { enregistre: false, message: `${e.aTraiter} lot(s) à traiter (panneau Modifications) avant que tout soit enregistré.` };
  if (!e.enLigne) return { enregistre: false, message: `Hors-ligne : ${e.enAttente} modification(s) gardée(s) sur cet appareil, envoyée(s) au retour du réseau.` };
  if (!e.joignable) return { enregistre: false, message: `Serveur injoignable : ${e.enAttente} modification(s) gardée(s) sur cet appareil.` };
  if (e.enAttente) return { enregistre: false, message: `${e.enAttente} modification(s) encore en cours d'envoi.` };
  return { enregistre: true, message: `Tout est enregistré (révision r${e.revision}).` };
}

/** Partage : seulement quand tout est enregistré ; sinon, le motif. */
export function partagePossible(e: EtatEnregistrement): { possible: boolean; motif: string } {
  const m = messageEnregistrement(e);
  if (e.lecture) return { possible: true, motif: "" };
  return m.enregistre ? { possible: true, motif: "" } : { possible: false, motif: `Partage différé : ${m.message.charAt(0).toLowerCase()}${m.message.slice(1)}` };
}
