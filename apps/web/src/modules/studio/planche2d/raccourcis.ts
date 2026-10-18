/**
 * Barres et raccourcis de la planche 2D de Studio V1. Règle d'or (AGENTS.md, D-202) appliquée à Studio : chaque outil
 * du registre (`STUDIO_TOOLS`) et chaque commande de l'éditeur a sa propre icône, sa barre et un raccourci unique —
 * contrôlé par `regle-or.test.ts`. Les raccourcis des outils viennent du registre, jamais d'une seconde table.
 * Pur : ni React ni DOM.
 */
import { STUDIO_TOOLS, type StudioToolGroup } from "@parcours/atelier-model";

export type StudioToolEntry = (typeof STUDIO_TOOLS)[number];
export type StudioToolId = StudioToolEntry["toolId"];
export type IdCommandeEditeur =
  | "annuler" | "retablir" | "annuler-trace" | "enregistrer" | "tout-selectionner"
  | "zoom-avant" | "zoom-arriere" | "cadrer" | "plein-ecran"
  | "accrochage-sommets" | "accrochage-grille"
  | "exporter-svg" | "exporter-dxf"
  | "outils" | "palette";
export type GroupeCommande = "edition" | "vue" | "accrochage" | "export" | "catalogue";
export type BarreStudio = StudioToolGroup | GroupeCommande;
export type IconeCommande =
  | "studio-undo" | "studio-redo" | "studio-cancel" | "studio-save" | "studio-select-all"
  | "studio-zoom-in" | "studio-zoom-out" | "studio-frame" | "studio-fullscreen"
  | "studio-snap-vertex" | "studio-snap-grid"
  | "studio-export-svg" | "studio-export-dxf"
  | "studio-catalog" | "studio-palette";

export interface CommandeEditeur {
  readonly id: IdCommandeEditeur;
  readonly libelleFR: string;
  /** Même format que le registre : `Ctrl+` / `Shift+` en tête, touche au format `KeyboardEvent.key`. */
  readonly raccourci: string;
  /** Raccourcis équivalents (Ctrl+Shift+Z pour rétablir). */
  readonly autres?: readonly string[];
  readonly iconeSymbolique: IconeCommande;
  readonly groupe: GroupeCommande;
  /** Indisponible en lecture seule. */
  readonly ecrit: boolean;
  /** Bascule (bouton enfoncé ou non) : accrochages. */
  readonly bascule?: boolean;
  /** Téléchargement par un lien (export) plutôt qu'une action de la page. */
  readonly telechargement?: "svg" | "dxf";
  /** Le raccourci reste actif quand le focus est dans un champ de saisie. */
  readonly dansUnChamp?: boolean;
}

/** Commandes de l'éditeur : elles ne sont pas des commandes de document (aucune n'est envoyée au serveur telle quelle). */
export const COMMANDES_EDITEUR: readonly CommandeEditeur[] = Object.freeze([
  { id: "annuler", libelleFR: "Annuler", raccourci: "Ctrl+Z", iconeSymbolique: "studio-undo", groupe: "edition", ecrit: true },
  { id: "retablir", libelleFR: "Rétablir", raccourci: "Ctrl+Y", autres: ["Ctrl+Shift+Z"], iconeSymbolique: "studio-redo", groupe: "edition", ecrit: true },
  { id: "annuler-trace", libelleFR: "Annuler / Désélectionner", raccourci: "Escape", iconeSymbolique: "studio-cancel", groupe: "edition", ecrit: false },
  { id: "enregistrer", libelleFR: "Enregistrer", raccourci: "Ctrl+S", iconeSymbolique: "studio-save", groupe: "edition", ecrit: true, dansUnChamp: true },
  { id: "tout-selectionner", libelleFR: "Tout sélectionner", raccourci: "Ctrl+A", iconeSymbolique: "studio-select-all", groupe: "edition", ecrit: false },
  { id: "zoom-avant", libelleFR: "Zoom avant", raccourci: "=", iconeSymbolique: "studio-zoom-in", groupe: "vue", ecrit: false },
  { id: "zoom-arriere", libelleFR: "Zoom arrière", raccourci: "-", iconeSymbolique: "studio-zoom-out", groupe: "vue", ecrit: false },
  { id: "cadrer", libelleFR: "Cadrer", raccourci: "Shift+Z", iconeSymbolique: "studio-frame", groupe: "vue", ecrit: false },
  { id: "plein-ecran", libelleFR: "Plein écran / Quitter", raccourci: "Ctrl+Shift+F", iconeSymbolique: "studio-fullscreen", groupe: "vue", ecrit: false },
  { id: "accrochage-sommets", libelleFR: "Accrocher aux sommets", raccourci: "Shift+S", iconeSymbolique: "studio-snap-vertex", groupe: "accrochage", ecrit: false, bascule: true },
  { id: "accrochage-grille", libelleFR: "Accrocher à la grille", raccourci: "F9", iconeSymbolique: "studio-snap-grid", groupe: "accrochage", ecrit: false, bascule: true },
  { id: "exporter-svg", libelleFR: "Exporter SVG", raccourci: "Shift+V", iconeSymbolique: "studio-export-svg", groupe: "export", ecrit: false, telechargement: "svg" },
  { id: "exporter-dxf", libelleFR: "Exporter DXF", raccourci: "Shift+X", iconeSymbolique: "studio-export-dxf", groupe: "export", ecrit: false, telechargement: "dxf" },
  { id: "outils", libelleFR: "Outils", raccourci: "Shift+O", iconeSymbolique: "studio-catalog", groupe: "catalogue", ecrit: false },
  { id: "palette", libelleFR: "Palette de commandes", raccourci: "Ctrl+K", iconeSymbolique: "studio-palette", groupe: "catalogue", ecrit: false, dansUnChamp: true },
] as const);

/** Ordre et nom des barres, toutes rangées dans la barre « Outils de dessin ». */
export const BARRES_STUDIO: readonly { id: BarreStudio; libelleFR: string }[] = Object.freeze([
  { id: "dessin", libelleFR: "Dessin" },
  { id: "modification", libelleFR: "Modification" },
  { id: "calques", libelleFR: "Calques" },
  { id: "edition", libelleFR: "Édition" },
  { id: "vue", libelleFR: "Vue" },
  { id: "accrochage", libelleFR: "Accrochage" },
  { id: "export", libelleFR: "Exporter" },
  { id: "catalogue", libelleFR: "Catalogue" },
]);

/**
 * Combinaisons que le navigateur se réserve (fenêtre, onglet, navigation, recherche, impression, outils de
 * développement, zoom de la page) : aucun outil ni aucune commande de l'éditeur ne les prend (`regle-or.test.ts`).
 */
export const RACCOURCIS_RESERVES: readonly string[] = Object.freeze([
  "Ctrl+N", "Ctrl+T", "Ctrl+W", "Ctrl+Shift+N", "Ctrl+Shift+T", "Ctrl+Shift+W", "Ctrl+Q", "Ctrl+Tab", "Ctrl+Shift+Tab",
  "Ctrl+L", "Ctrl+R", "Ctrl+Shift+R", "Ctrl+P", "Ctrl+F", "Ctrl+G", "Ctrl+H", "Ctrl+J", "Ctrl+D", "Ctrl+U", "Ctrl+O",
  "Ctrl+Shift+I", "Ctrl+Shift+J", "Ctrl+Shift+C", "Ctrl+Shift+Delete", "Ctrl+=", "Ctrl+-", "Ctrl+0",
  "F1", "F3", "F5", "F6", "F7", "F11", "F12",
]);

/** Outils « mode » (on les choisit, puis on agit sur la planche ou le formulaire) ; les autres agissent aussitôt. */
export const OUTILS_MODES: ReadonlySet<StudioToolId> = new Set<StudioToolId>([
  "studio.dessin.selection", "studio.dessin.ligne", "studio.dessin.rectangle", "studio.dessin.cote", "studio.dessin.deplacer", "studio.dessin.modifier",
]);
/** Outils qui posent des points sur la planche. */
export const OUTILS_TRACE: ReadonlySet<StudioToolId> = new Set<StudioToolId>(["studio.dessin.ligne", "studio.dessin.rectangle", "studio.dessin.cote"]);

export const outilsDeBarre = (barre: BarreStudio): StudioToolEntry[] => STUDIO_TOOLS.filter((t) => t.groupe === barre);
export const commandesDeBarre = (barre: BarreStudio): CommandeEditeur[] => COMMANDES_EDITEUR.filter((c) => c.groupe === barre);

interface Touche { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }

/** Combinaison d'un événement clavier au format du registre ; `null` pour un modificateur seul ou avec Alt. */
export function combinaison(e: Touche): string | null {
  if (["Control", "Shift", "Alt", "Meta", "AltGraph"].includes(e.key) || e.altKey) return null;
  const touche = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return `${e.ctrlKey || e.metaKey ? "Ctrl+" : ""}${e.shiftKey ? "Shift+" : ""}${touche}`;
}

export type CibleRaccourci = { type: "outil"; toolId: StudioToolId } | { type: "commande"; id: IdCommandeEditeur };

/** Table clavier de l'éditeur : dérivée du registre et des commandes, une combinaison n'y figure qu'une fois. */
export const TABLE_CLAVIER: ReadonlyMap<string, CibleRaccourci> = (() => {
  const table = new Map<string, CibleRaccourci>();
  const poser = (c: string, cible: CibleRaccourci) => {
    if (table.has(c)) throw new Error(`Raccourci en double : ${c}`);
    table.set(c, cible);
  };
  for (const t of STUDIO_TOOLS) poser(t.raccourci, { type: "outil", toolId: t.toolId });
  for (const c of COMMANDES_EDITEUR) for (const r of [c.raccourci, ...(c.autres ?? [])]) poser(r, { type: "commande", id: c.id });
  return table;
})();

export const cibleRaccourci = (c: string | null): CibleRaccourci | null => (c ? TABLE_CLAVIER.get(c) ?? null : null);

/** Le raccourci reste actif quand le focus est dans un champ de saisie (Enregistrer, Palette de commandes). */
export function actifDansUnChamp(c: string | null): boolean {
  const cible = cibleRaccourci(c);
  return cible?.type === "commande" && COMMANDES_EDITEUR.some((x) => x.id === cible.id && x.dansUnChamp === true);
}

/** Libellé affiché d'un raccourci (Maj, Suppr, Espace, Échap), traduit ensuite par le dictionnaire anglais. */
export function libelleRaccourci(r: string): string {
  return r.split("+").map((p) => ({ Shift: "Maj", Delete: "Suppr", Space: "Espace", Escape: "Échap" })[p] ?? p).join("+");
}

/** Valeur `aria-keyshortcuts` (WAI-ARIA : Control, Shift, Delete, Space, Escape). */
export function ariaRaccourci(r: string): string {
  return r.split("+").map((p) => (p === "Ctrl" ? "Control" : p)).join("+");
}
