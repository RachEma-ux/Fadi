/**
 * Outils et commandes de la Planche 2D de Studio. Règle d'or appliquée à Studio (comme à la Planche de l'Atelier,
 * AGENTS.md) : chaque outil et chaque commande a sa propre icône, sa barre et son raccourci — contrôlé par test.
 * Les outils viennent du registre unique de Studio (`studioRegistre`, domaine-modèle) : identifiant, libellé et
 * raccourci y sont déclarés une seule fois ; icône, barre et droit d'écriture relèvent de l'interface, ici.
 * Raccourcis : relevé SketchUp (Espace, L, R, M, Maj+Z), sinon couche Fadi (Maj+C pour la cotation, comme la Planche).
 * Pur : ni React ni DOM.
 */
import { studioRegistre } from "@parcours/domain-model";

export type IdOutil2D = "selection" | "ligne" | "rectangle" | "cote" | "deplacer";
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
  /** Entrée du registre de Studio d'un outil (`studio.dessin.<outil>`). */
  registre?: string;
}

/** Présentation propre à l'interface de chaque outil ; l'ordre est celui de la barre « Outils ». */
const PRESENTATION_OUTILS: readonly { id: IdOutil2D; registre: string; icone: string; ecrit: boolean }[] = [
  { id: "selection", registre: "studio.dessin.selection", icone: "M5 3l13 8-6 1.5L9 19 5 3Z", ecrit: false },
  { id: "ligne", registre: "studio.dessin.ligne", icone: "M4 20 20 4M4 20h0M20 4h0", ecrit: true },
  { id: "rectangle", registre: "studio.dessin.rectangle", icone: "M4 6h16v12H4Z", ecrit: true },
  { id: "cote", registre: "studio.dessin.cote", icone: "M4 8v8m16-8v8M4 12h16M7 9l-3 3 3 3m10-6 3 3-3 3", ecrit: true },
  { id: "deplacer", registre: "studio.dessin.deplacer", icone: "M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3", ecrit: true },
];

export const OUTILS_2D: readonly Entree2D<IdOutil2D>[] = PRESENTATION_OUTILS.map((p) => {
  const outil = studioRegistre.outilStudio(p.registre);
  if (!outil) throw new Error(`Outil absent du registre de Studio : ${p.registre}`);
  return { id: p.id, libelle: outil.libelle, raccourci: outil.raccourci, barre: "outils", icone: p.icone, ecrit: p.ecrit, registre: outil.id };
});

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

/**
 * Un raccourci global ne doit jamais détourner l'activation au clavier : dans un champ de saisie, toute touche
 * revient au champ ; sur un bouton ou un lien, une touche sans Ctrl (Espace, Retour, lettres) revient à l'élément.
 * Échap reste lu partout : il n'active rien et interrompt le geste en cours.
 */
export function raccourciIgnore(cible: { tagName: string; isContentEditable?: boolean; role?: string | null } | null, c: string): boolean {
  if (!cible) return false;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName) || cible.isContentEditable) return true;
  const activable = cible.tagName === "BUTTON" || cible.tagName === "A" || cible.role === "button";
  return activable && c !== "Échap" && !c.startsWith("Ctrl+");
}
