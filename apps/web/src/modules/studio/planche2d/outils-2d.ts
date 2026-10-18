/**
 * Outils et commandes de la Planche 2D de Studio. Règle d'or appliquée à Studio (comme à la Planche de l'Atelier,
 * AGENTS.md) : chaque outil et chaque commande a sa propre icône, sa barre et son raccourci — contrôlé par test.
 * Raccourcis : relevé SketchUp (Espace, L, Maj+Z), sinon couche Fadi (Maj+C pour la cotation, comme la Planche).
 * Pur : ni React ni DOM.
 */

export type IdOutil2D = "selection" | "ligne" | "cote";
export type IdCommande2D = "annuler" | "retablir" | "supprimer" | "enregistrer" | "cadrer";
export type Barre2D = "outils" | "edition" | "vue";

export interface Entree2D<Id extends string> {
  id: Id;
  libelle: string;
  /** Raccourci canonique : « Ctrl+Z », « Maj+C », « Espace », « Suppr ». */
  raccourci: string;
  /** Raccourcis équivalents acceptés (Ctrl+Maj+Z pour rétablir). */
  autres?: string[];
  barre: Barre2D;
  icone: string;
  /** Une commande ou un outil qui écrit le document est indisponible en lecture seule. */
  ecrit: boolean;
}

export const OUTILS_2D: readonly Entree2D<IdOutil2D>[] = [
  { id: "selection", libelle: "Sélection", raccourci: "Espace", barre: "outils", icone: "M5 3l13 8-6 1.5L9 19 5 3Z", ecrit: false },
  { id: "ligne", libelle: "Ligne", raccourci: "L", barre: "outils", icone: "M4 20 20 4M4 20h0M20 4h0", ecrit: true },
  { id: "cote", libelle: "Cote", raccourci: "Maj+C", barre: "outils", icone: "M4 8v8m16-8v8M4 12h16M7 9l-3 3 3 3m10-6 3 3-3 3", ecrit: true },
];

export const COMMANDES_2D: readonly Entree2D<IdCommande2D>[] = [
  { id: "annuler", libelle: "Annuler", raccourci: "Ctrl+Z", barre: "edition", icone: "M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2", ecrit: true },
  { id: "retablir", libelle: "Rétablir", raccourci: "Ctrl+Y", autres: ["Ctrl+Maj+Z"], barre: "edition", icone: "m15 7 5 5-5 5m5-5H9a5 5 0 0 0 0 10h2", ecrit: true },
  { id: "supprimer", libelle: "Supprimer", raccourci: "Suppr", autres: ["Retour"], barre: "edition", icone: "M5 7h14M10 7V4h4v3m-7 0 1 13h8l1-13", ecrit: true },
  { id: "enregistrer", libelle: "Enregistrer", raccourci: "Ctrl+S", barre: "edition", icone: "M5 4h11l3 3v13H5V4Zm3 0v5h7V4M8 20v-6h8v6", ecrit: true },
  { id: "cadrer", libelle: "Cadrer", raccourci: "Maj+Z", barre: "vue", icone: "M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5", ecrit: false },
];

/** Combinaison canonique d'un événement clavier ; `null` pour une touche de modification seule. */
export function combinaison(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): string | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  const touche = e.key === " " ? "Espace" : e.key === "Delete" ? "Suppr" : e.key === "Backspace" ? "Retour" : e.key === "Escape" ? "Échap" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [e.ctrlKey || e.metaKey ? "Ctrl" : null, e.altKey ? "Alt" : null, e.shiftKey ? "Maj" : null, touche].filter(Boolean).join("+");
}

export function entreeParRaccourci(c: string): { type: "outil"; id: IdOutil2D } | { type: "commande"; id: IdCommande2D } | null {
  const o = OUTILS_2D.find((x) => x.raccourci === c || x.autres?.includes(c));
  if (o) return { type: "outil", id: o.id };
  const k = COMMANDES_2D.find((x) => x.raccourci === c || x.autres?.includes(c));
  return k ? { type: "commande", id: k.id } : null;
}
