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
  | "terminer-polyligne" | "fermer-polyligne"
  | "zoom-avant" | "zoom-arriere" | "cadrer" | "plein-ecran" | "vue-3d" | "navigation-3d" | "coupe-3d"
  | "accrochage-sommets" | "accrochage-grille"
  | "accrochage-milieu" | "accrochage-centre" | "accrochage-quadrant" | "accrochage-intersection"
  | "accrochage-perpendiculaire" | "accrochage-tangente" | "accrochage-proche"
  | "reperage-orthogonal" | "reperage-polaire" | "pas-polaire"
  | "importer-dxf" | "exporter-svg" | "exporter-dxf" | "exporter-ifc" | "feuille"
  | "exporter-png"
  | "outils" | "palette"
  | "exigences";
export type GroupeCommande = "edition" | "vue" | "accrochage" | "reperage" | "visualisation" | "import" | "export" | "presentation" | "catalogue" | "exigences";
export type BarreStudio = StudioToolGroup | GroupeCommande;
export type IconeCommande =
  | "studio-undo" | "studio-redo" | "studio-cancel" | "studio-save" | "studio-select-all"
  | "studio-polyline-finish" | "studio-polyline-close"
  | "studio-zoom-in" | "studio-zoom-out" | "studio-frame" | "studio-fullscreen" | "studio-view-3d" | "studio-nav-plan" | "studio-section-plane"
  | "studio-snap-vertex" | "studio-snap-grid"
  | "studio-snap-midpoint" | "studio-snap-center" | "studio-snap-quadrant" | "studio-snap-intersection"
  | "studio-snap-perpendicular" | "studio-snap-tangent" | "studio-snap-nearest"
  | "studio-track-ortho" | "studio-track-polar" | "studio-track-polar-step"
  | "studio-import-dxf" | "studio-export-svg" | "studio-export-dxf" | "studio-export-ifc" | "studio-sheet"
  | "studio-export-png"
  | "studio-catalog" | "studio-palette"
  | "studio-requirements";

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
  readonly telechargement?: "svg" | "dxf" | "ifc";
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
  // Polyligne en cours : Entrée la termine ouverte, Maj+Entrée la ferme sur son premier sommet (hors des champs de saisie).
  { id: "terminer-polyligne", libelleFR: "Terminer la polyligne", raccourci: "Enter", iconeSymbolique: "studio-polyline-finish", groupe: "edition", ecrit: true },
  { id: "fermer-polyligne", libelleFR: "Fermer la polyligne", raccourci: "Shift+Enter", iconeSymbolique: "studio-polyline-close", groupe: "edition", ecrit: true },
  { id: "zoom-avant", libelleFR: "Zoom avant", raccourci: "=", autres: ["Shift+=", "+", "Shift++"], iconeSymbolique: "studio-zoom-in", groupe: "vue", ecrit: false },
  { id: "zoom-arriere", libelleFR: "Zoom arrière", raccourci: "-", iconeSymbolique: "studio-zoom-out", groupe: "vue", ecrit: false },
  { id: "cadrer", libelleFR: "Cadrer", raccourci: "Shift+Z", iconeSymbolique: "studio-frame", groupe: "vue", ecrit: false },
  { id: "plein-ecran", libelleFR: "Plein écran / Quitter", raccourci: "Ctrl+Shift+F", iconeSymbolique: "studio-fullscreen", groupe: "vue", ecrit: false },
  // F3 est réservé (recherche du navigateur) et Maj+3 dépend de la disposition du clavier : Maj+D (« 3D »).
  { id: "vue-3d", libelleFR: "Vue 3D", raccourci: "Shift+D", iconeSymbolique: "studio-view-3d", groupe: "vue", ecrit: false, bascule: true },
  // Vue 3D : navigation en plan (vue de dessus, panoramique) ou en orbite (Maj+G) ; coupe horizontale dérivée (Maj+K).
  { id: "navigation-3d", libelleFR: "Vue en plan (3D)", raccourci: "Shift+G", iconeSymbolique: "studio-nav-plan", groupe: "vue", ecrit: false, bascule: true },
  { id: "coupe-3d", libelleFR: "Coupe horizontale (3D)", raccourci: "Shift+K", iconeSymbolique: "studio-section-plane", groupe: "vue", ecrit: false, bascule: true },
  { id: "accrochage-sommets", libelleFR: "Accrocher aux sommets", raccourci: "Shift+S", iconeSymbolique: "studio-snap-vertex", groupe: "accrochage", ecrit: false, bascule: true },
  { id: "accrochage-grille", libelleFR: "Accrocher à la grille", raccourci: "F9", iconeSymbolique: "studio-snap-grid", groupe: "accrochage", ecrit: false, bascule: true },
  // Modes d'accrochage aux objets (moteur `accrochage/`), actifs quand « Accrocher aux sommets » l'est. Raccourcis Fadi
  // (aucun relevé SketchUp pour ces modes) : Maj+H (« half », milieu), Maj+Q (quadrant), Maj+J (« juste à côté », plus
  // proche) ; Maj+R, Maj+T, Maj+A et Maj+G appartenant à Rotation, Texte, Cote angulaire et Vue en plan (3D), les autres
  // modes prennent une lettre seule libre, hors des lettres d'outils SketchUp (Q reste libre) : Y (centre), X (croix :
  // intersection), N (normale : perpendiculaire), U (tangente).
  { id: "accrochage-milieu", libelleFR: "Accrocher aux milieux", raccourci: "Shift+H", iconeSymbolique: "studio-snap-midpoint", groupe: "accrochage", ecrit: false, bascule: true },
  { id: "accrochage-centre", libelleFR: "Accrocher aux centres", raccourci: "Y", iconeSymbolique: "studio-snap-center", groupe: "accrochage", ecrit: false, bascule: true },
  { id: "accrochage-quadrant", libelleFR: "Accrocher aux quadrants", raccourci: "Shift+Q", iconeSymbolique: "studio-snap-quadrant", groupe: "accrochage", ecrit: false, bascule: true },
  { id: "accrochage-intersection", libelleFR: "Accrocher aux intersections", raccourci: "X", iconeSymbolique: "studio-snap-intersection", groupe: "accrochage", ecrit: false, bascule: true },
  { id: "accrochage-perpendiculaire", libelleFR: "Accrocher en perpendiculaire", raccourci: "N", iconeSymbolique: "studio-snap-perpendicular", groupe: "accrochage", ecrit: false, bascule: true },
  { id: "accrochage-tangente", libelleFR: "Accrocher en tangente", raccourci: "U", iconeSymbolique: "studio-snap-tangent", groupe: "accrochage", ecrit: false, bascule: true },
  { id: "accrochage-proche", libelleFR: "Accrocher au plus proche", raccourci: "Shift+J", iconeSymbolique: "studio-snap-nearest", groupe: "accrochage", ecrit: false, bascule: true },
  // Repérage depuis le dernier point : orthogonal (F8, comme les logiciels de DAO ; Maj tenue l'impose le temps du
  // geste), polaire (F10) et son pas 15° / 30° / 45° / 90° (Maj+Y le fait tourner).
  { id: "reperage-orthogonal", libelleFR: "Mode orthogonal", raccourci: "F8", iconeSymbolique: "studio-track-ortho", groupe: "reperage", ecrit: false, bascule: true },
  { id: "reperage-polaire", libelleFR: "Repérage polaire", raccourci: "F10", iconeSymbolique: "studio-track-polar", groupe: "reperage", ecrit: false, bascule: true },
  { id: "pas-polaire", libelleFR: "Pas polaire suivant", raccourci: "Shift+Y", iconeSymbolique: "studio-track-polar-step", groupe: "reperage", ecrit: false },
  // Rendu du modèle (lot E.5-03) : image PNG de la vue 3D, provenance incluse ; F4, libre et non réservé (F3 l'est).
  { id: "exporter-png", libelleFR: "Exporter le rendu PNG", raccourci: "F4", iconeSymbolique: "studio-export-png", groupe: "visualisation", ecrit: false },
  // Import DXF vers le brouillon (aperçu, unité, entités non prises) : Maj+U (U comme « upload »), libre et non réservé.
  { id: "importer-dxf", libelleFR: "Importer DXF", raccourci: "Shift+U", iconeSymbolique: "studio-import-dxf", groupe: "import", ecrit: true },
  { id: "exporter-svg", libelleFR: "Exporter SVG", raccourci: "Shift+V", iconeSymbolique: "studio-export-svg", groupe: "export", ecrit: false, telechargement: "svg" },
  { id: "exporter-dxf", libelleFR: "Exporter DXF", raccourci: "Shift+X", iconeSymbolique: "studio-export-dxf", groupe: "export", ecrit: false, telechargement: "dxf" },
  // IFC4X3 des seuls objets extrudés (Maj+I : I comme IFC, libre et non réservé).
  { id: "exporter-ifc", libelleFR: "Exporter IFC", raccourci: "Shift+I", iconeSymbolique: "studio-export-ifc", groupe: "export", ecrit: false, telechargement: "ifc" },
  // Feuille de présentation (format, échelle, cartouche) : Maj+P (P comme page) ; Ctrl+P reste l'impression du navigateur.
  { id: "feuille", libelleFR: "Feuille", raccourci: "Shift+P", iconeSymbolique: "studio-sheet", groupe: "presentation", ecrit: false },
  { id: "outils", libelleFR: "Outils", raccourci: "Shift+O", iconeSymbolique: "studio-catalog", groupe: "catalogue", ecrit: false },
  { id: "palette", libelleFR: "Palette de commandes", raccourci: "Ctrl+K", iconeSymbolique: "studio-palette", groupe: "catalogue", ecrit: false, dansUnChamp: true },
  // Exigences et écarts (E.1) : F comme « fiche d’exigences » (lettre seule libre et non réservée ; V appartient à la Visualisation) ; lecture admise.
  { id: "exigences", libelleFR: "Exigences et écarts", raccourci: "F", iconeSymbolique: "studio-requirements", groupe: "exigences", ecrit: false },
] as const);

/** Ordre et nom des barres, toutes rangées dans la barre « Outils de dessin ». */
export const BARRES_STUDIO: readonly { id: BarreStudio; libelleFR: string }[] = Object.freeze([
  { id: "dessin", libelleFR: "Dessin" },
  { id: "modification", libelleFR: "Modification" },
  { id: "calques", libelleFR: "Calques" },
  { id: "volume", libelleFR: "Volume" },
  { id: "volume-libre", libelleFR: "Volume libre" },
  { id: "architecture", libelleFR: "Architecture" },
  { id: "proprietes", libelleFR: "Propriétés" },
  { id: "exigences", libelleFR: "Exigences" },
  { id: "edition", libelleFR: "Édition" },
  { id: "vue", libelleFR: "Vue" },
  { id: "accrochage", libelleFR: "Accrochage" },
  { id: "reperage", libelleFR: "Repérage" },
  { id: "visualisation", libelleFR: "Visualisation" },
  { id: "import", libelleFR: "Importer" },
  { id: "export", libelleFR: "Exporter" },
  { id: "presentation", libelleFR: "Présentation" },
  { id: "catalogue", libelleFR: "Catalogue" },
]);

/**
 * Combinaisons que le navigateur se réserve (fenêtre, onglet, navigation, recherche, impression, outils de
 * développement, zoom de la page) : aucun outil ni aucune commande de l'éditeur ne les prend (`regle-or.test.ts`).
 */
export const RACCOURCIS_RESERVES: readonly string[] = Object.freeze([
  "Ctrl+N", "Ctrl+T", "Ctrl+W", "Ctrl+Shift+N", "Ctrl+Shift+T", "Ctrl+Shift+W", "Ctrl+Q", "Ctrl+Tab", "Ctrl+Shift+Tab",
  "Ctrl+L", "Ctrl+R", "Ctrl+Shift+R", "Ctrl+P", "Ctrl+F", "Ctrl+G", "Ctrl+H", "Ctrl+J", "Ctrl+D", "Ctrl+U", "Ctrl+O",
  "Ctrl+Shift+I", "Ctrl+Shift+J", "Ctrl+Shift+C", "Ctrl+Shift+Delete",
  // Outils de développement de Firefox : réseau (Ctrl+Maj+E) et console (Ctrl+Maj+K).
  "Ctrl+Shift+E", "Ctrl+Shift+K", "Ctrl+=", "Ctrl+-", "Ctrl+0",
  "F1", "F3", "F5", "F6", "F7", "F11", "F12",
]);

/** Outils « mode » (on les choisit, puis on agit sur la planche ou le formulaire) ; les autres agissent aussitôt. */
export const OUTILS_MODES: ReadonlySet<StudioToolId> = new Set<StudioToolId>([
  "studio.dessin.selection", "studio.dessin.ligne", "studio.dessin.rectangle", "studio.dessin.cercle", "studio.dessin.arc", "studio.dessin.polyligne",
  "studio.dessin.cote", "studio.dessin.deplacer", "studio.dessin.modifier", "studio.dessin.decaler",
  // Volume libre : modes de la vue 3D (poser une boîte, un prisme sur profil, déplacer un solide).
  "studio.solide.boite", "studio.solide.prisme", "studio.solide.deplacer",
  "studio.dessin.copier", "studio.dessin.rotation", "studio.dessin.symetrie", "studio.dessin.echelle",
  "studio.dessin.cote-angulaire", "studio.dessin.texte",
  // Architecture (A.4) : poser l'axe d'un mur, désigner le mur d'une ouverture.
  "studio.architecture.mur", "studio.architecture.ouverture",
]);
/** Outils du volume libre : ils agissent dans la vue 3D, qu'ils ouvrent. */
export const OUTILS_VOLUME_LIBRE: ReadonlySet<StudioToolId> = new Set<StudioToolId>(["studio.solide.boite", "studio.solide.prisme", "studio.solide.deplacer", "studio.solide.supprimer"]);
/** Outils qui posent des points sur la planche. */
export const OUTILS_TRACE: ReadonlySet<StudioToolId> = new Set<StudioToolId>(["studio.dessin.ligne", "studio.dessin.rectangle", "studio.dessin.cercle", "studio.dessin.arc", "studio.dessin.polyligne", "studio.dessin.cote", "studio.dessin.cote-angulaire", "studio.dessin.texte", "studio.architecture.mur", "studio.architecture.ouverture"]);

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
  return r.split("+").map((p) => ({ Shift: "Maj", Delete: "Suppr", Space: "Espace", Escape: "Échap", Enter: "Entrée ↵" })[p] ?? p).join("+");
}

/** Valeur `aria-keyshortcuts` (WAI-ARIA : Control, Shift, Delete, Space, Escape). */
export function ariaRaccourci(r: string): string {
  return r.split("+").map((p) => (p === "Ctrl" ? "Control" : p)).join("+");
}
