/**
 * Barres et raccourcis de la planche 2D de Studio V1. Règle d'or (AGENTS.md, D-202) appliquée à Studio : chaque outil
 * du registre (`STUDIO_TOOLS`) et chaque commande de l'éditeur a sa propre icône, sa barre et un raccourci unique —
 * contrôlé par `regle-or.test.ts`. Les raccourcis des outils viennent du registre, jamais d'une seconde table.
 * Pur : ni React ni DOM.
 */
import { STUDIO_TOOLS, type StudioToolGroup } from "@parcours/atelier-model";

export type StudioToolEntry = (typeof STUDIO_TOOLS)[number];
export type StudioToolId = StudioToolEntry["toolId"];
export type IdCommandeEditeur = "annuler" | "retablir" | "annuler-trace" | "enregistrer" | "cadrer" | "plein-ecran";
export type BarreStudio = StudioToolGroup | "edition" | "vue";

export interface CommandeEditeur {
  readonly id: IdCommandeEditeur;
  readonly libelleFR: string;
  /** Même format que le registre : `Ctrl+` / `Shift+` en tête, touche au format `KeyboardEvent.key`. */
  readonly raccourci: string;
  /** Raccourcis équivalents (Ctrl+Shift+Z pour rétablir). */
  readonly autres?: readonly string[];
  readonly iconeSymbolique: "studio-undo" | "studio-redo" | "studio-cancel" | "studio-save" | "studio-frame" | "studio-fullscreen";
  readonly groupe: "edition" | "vue";
  /** Indisponible en lecture seule. */
  readonly ecrit: boolean;
}

/** Commandes de l'éditeur : elles ne sont pas des commandes de document (aucune n'est envoyée au serveur telle quelle). */
export const COMMANDES_EDITEUR: readonly CommandeEditeur[] = Object.freeze([
  { id: "annuler", libelleFR: "Annuler", raccourci: "Ctrl+Z", iconeSymbolique: "studio-undo", groupe: "edition", ecrit: true },
  { id: "retablir", libelleFR: "Rétablir", raccourci: "Ctrl+Y", autres: ["Ctrl+Shift+Z"], iconeSymbolique: "studio-redo", groupe: "edition", ecrit: true },
  { id: "annuler-trace", libelleFR: "Annuler le tracé", raccourci: "Escape", iconeSymbolique: "studio-cancel", groupe: "edition", ecrit: false },
  { id: "enregistrer", libelleFR: "Enregistrer", raccourci: "Ctrl+S", iconeSymbolique: "studio-save", groupe: "edition", ecrit: true },
  { id: "cadrer", libelleFR: "Cadrer", raccourci: "Shift+Z", iconeSymbolique: "studio-frame", groupe: "vue", ecrit: false },
  { id: "plein-ecran", libelleFR: "Plein écran / Quitter", raccourci: "Ctrl+Shift+F", iconeSymbolique: "studio-fullscreen", groupe: "vue", ecrit: false },
] as const);

/** Ordre et nom des barres, toutes rangées dans la barre « Outils de dessin ». */
export const BARRES_STUDIO: readonly { id: BarreStudio; libelleFR: string }[] = Object.freeze([
  { id: "dessin", libelleFR: "Dessin" },
  { id: "modification", libelleFR: "Modification" },
  { id: "calques", libelleFR: "Calques" },
  { id: "edition", libelleFR: "Édition" },
  { id: "vue", libelleFR: "Vue" },
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

/** Libellé affiché d'un raccourci (Maj, Suppr, Espace, Échap), traduit ensuite par le dictionnaire anglais. */
export function libelleRaccourci(r: string): string {
  return r.split("+").map((p) => ({ Shift: "Maj", Delete: "Suppr", Space: "Espace", Escape: "Échap" })[p] ?? p).join("+");
}

/** Valeur `aria-keyshortcuts` (WAI-ARIA : Control, Shift, Delete, Space, Escape). */
export function ariaRaccourci(r: string): string {
  return r.split("+").map((p) => (p === "Ctrl" ? "Control" : p)).join("+");
}
