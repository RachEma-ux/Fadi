/**
 * État de connexion d'une variante Studio, tel que le bandeau l'affiche : en ligne, hors ligne, enveloppes en attente,
 * conflit. Le conflit prime (une action est attendue), puis les enveloppes en attente, puis la connexion. Pur.
 */
export type CodeHorsLigne = "en-ligne" | "hors-ligne" | "en-attente" | "conflit";

export interface EntreeEtatHorsLigne {
  enLigne: boolean;
  /** Enveloppes non confirmées (lots du plan d'envoi restant à accuser). */
  enAttente: number;
  conflit: boolean;
  /** Le brouillon conservé a été modifié dans un autre onglet (comparer-puis-écrire refusé). */
  autreOnglet?: boolean;
  /** Le brouillon est conservé sur cet appareil (IndexedDB). */
  conserve: boolean;
  /** Version lue depuis le cache de l'appareil faute de réseau. */
  depuisCache: boolean;
}

export interface EtatHorsLigne { code: CodeHorsLigne; texte: string; detail: string | null }

export function etatHorsLigne(e: EntreeEtatHorsLigne): EtatHorsLigne {
  if (e.autreOnglet) return { code: "conflit", texte: "Conflit", detail: "Brouillon modifié dans un autre onglet : rien n’a été écrasé." };
  if (e.conflit) {
    // Conflit en ligne (A.5-06) : le brouillon reste dans cette page, il n'est pas écrit sur l'appareil.
    return { code: "conflit", texte: "Conflit", detail: e.conserve || !e.enLigne ? "Brouillon hors ligne conservé : une autre révision est devenue la version courante. Rien n’a été écrasé." : "Brouillon conservé dans cette page : une autre révision est devenue la version courante. Rien n’a été écrasé." };
  }
  if (e.enAttente > 0) {
    return {
      code: "en-attente",
      texte: `${e.enAttente} en attente`,
      detail: e.enLigne ? "Envoi des enveloppes conservées, mêmes identifiants de requête." : "Hors ligne : les enveloppes conservées sur cet appareil partiront au retour du réseau, avec les mêmes identifiants.",
    };
  }
  if (!e.enLigne) return { code: "hors-ligne", texte: "Hors ligne", detail: e.depuisCache ? "Dernière version lue sur cet appareil. Le brouillon est conservé localement jusqu’à l’enregistrement." : "Le brouillon est conservé sur cet appareil jusqu’à l’enregistrement." };
  return { code: "en-ligne", texte: "En ligne", detail: e.conserve ? "Brouillon hors ligne conservé sur cet appareil jusqu’à l’enregistrement." : null };
}
