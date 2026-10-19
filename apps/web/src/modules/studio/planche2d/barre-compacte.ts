/**
 * Barre compacte de la planche 2D (une seule rangée) : familles d'outils et disposition. Pur : ni React ni DOM.
 *
 * - Familles (`FAMILLES_STUDIO`) : Sélection, Dessin, Courbes, Annotation, Modification, Calques, Volume, Vue /
 *   Accrochage, Présentation, Importer / Exporter, Édition, Catalogue. Chaque outil du registre `STUDIO_TOOLS` et
 *   chaque commande de l'éditeur appartient à une seule famille : placement explicite, sinon d'après sa barre
 *   (`groupe`) — un outil ajouté au registre a donc toujours une famille (règle d'or, `regle-or.test.ts`).
 * - Chaque famille a son bouton « ▾ » à icône propre (tracé ci-dessous, distinct de toute icône d'outil).
 * - `disposerBarre` : selon la largeur disponible, la famille de l'outil actif montre ses outils les plus utilisés
 *   dans la rangée, puis les autres familles par priorité ; ce qui ne tient pas reste dans le menu de sa famille, et
 *   les familles qui ne tiennent pas du tout passent dans le menu « Plus ».
 */
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import { COMMANDES_EDITEUR, type BarreStudio, type IdCommandeEditeur, type StudioToolId } from "./raccourcis";

export type IdFamille =
  | "selection" | "dessin" | "courbes" | "annotation" | "modification" | "calques" | "volume" | "architecture"
  | "vue" | "presentation" | "echanges" | "edition" | "catalogue";

export type ElementBarre = { type: "outil"; id: StudioToolId } | { type: "commande"; id: IdCommandeEditeur };

export interface FamilleStudio {
  readonly id: IdFamille;
  readonly libelleFR: string;
  /** Tracé de l'icône du bouton de famille (grille 24, trait), propre à la famille. */
  readonly trace: string;
}

/** Ordre affiché dans la rangée. */
export const FAMILLES_STUDIO: readonly FamilleStudio[] = Object.freeze([
  { id: "selection", libelleFR: "Sélection", trace: "M4 4h4M4 4v4M20 4h-4M20 4v4M4 20h4M4 20v-4M20 20h-4M20 20v-4M10 9l6 3-3 1-1 3Z" },
  { id: "dessin", libelleFR: "Dessin", trace: "M4 20l3-1L19 7l-2-2L5 17ZM15 7l2 2M4 20h16" },
  { id: "courbes", libelleFR: "Courbes", trace: "M3 18c3-12 6-12 9-6s6 6 9-6M3 18h2M19 6h2" },
  { id: "annotation", libelleFR: "Annotation", trace: "M4 5h16v11H9l-5 4ZM8 9h8M8 12h5" },
  { id: "modification", libelleFR: "Modification", trace: "M14 4l6 6-9 9H5v-6ZM12 6l6 6M3 21h18" },
  { id: "calques", libelleFR: "Calques", trace: "M12 3l9 5-9 5-9-5ZM3 13l9 5 9-5M3 17.5l9 4.5 9-4.5" },
  { id: "volume", libelleFR: "Volume", trace: "M12 3l8 4.5v9L12 21l-8-4.5v-9ZM12 12l8-4.5M12 12v9M12 12 4 7.5" },
  // Architecture (A.4) : plan d'angle de deux murs avec une baie.
  { id: "architecture", libelleFR: "Architecture", trace: "M3 3h4v18H3ZM7 17h14v4H7ZM12 17v4M17 17v4" },
  { id: "vue", libelleFR: "Vue / Accrochage", trace: "M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12ZM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5" },
  { id: "presentation", libelleFR: "Présentation", trace: "M4 4h16v12H4ZM12 16v4M8 20h8M7 8h6M7 11h10" },
  { id: "echanges", libelleFR: "Importer / Exporter", trace: "M7 3v12M3 11l4 4 4-4M17 21V9M13 13l4-4 4 4" },
  { id: "edition", libelleFR: "Édition", trace: "M5 3h10l4 4v14H5ZM15 3v4h4M8 12h8M8 15h8M8 18h5" },
  { id: "catalogue", libelleFR: "Catalogue", trace: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3ZM5 17a3 3 0 0 1 3-3h11M9 8h6" },
]);

/** Icône du menu « Plus » (familles qui ne tiennent pas dans la rangée). */
export const TRACE_PLUS = "M5 12h.01M12 12h.01M19 12h.01M4 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0M11 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0M18 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0";

/** Placements explicites ; les autres suivent leur barre (`DEPUIS_BARRE`). */
const PLACEMENT: Readonly<Record<string, IdFamille>> = Object.freeze({
  "studio.dessin.selection": "selection",
  "tout-selectionner": "selection",
  "studio.dessin.arc": "courbes",
  "studio.dessin.polyligne": "courbes",
  "terminer-polyligne": "courbes",
  "fermer-polyligne": "courbes",
  "studio.dessin.cote": "annotation",
  "studio.dessin.cote-angulaire": "annotation",
  "studio.dessin.texte": "annotation",
});
const DEPUIS_BARRE: Readonly<Record<BarreStudio, IdFamille>> = Object.freeze({
  dessin: "dessin", modification: "modification", calques: "calques", volume: "volume", "volume-libre": "volume", architecture: "architecture",
  // Propriétés BIM et exigences (E.1) : rangées avec l'architecture, leur périmètre pilote.
  proprietes: "architecture", exigences: "architecture",
  edition: "edition", vue: "vue", accrochage: "vue", reperage: "vue", import: "echanges", export: "echanges", presentation: "presentation", catalogue: "catalogue",
});

export const familleDe = (id: string, barre: BarreStudio): IdFamille => PLACEMENT[id] ?? DEPUIS_BARRE[barre];

/** Éléments de chaque famille, dans l'ordre du registre puis des commandes (les plus utilisés en tête). */
export const ELEMENTS_FAMILLE: ReadonlyMap<IdFamille, readonly ElementBarre[]> = (() => {
  const m = new Map<IdFamille, ElementBarre[]>(FAMILLES_STUDIO.map((f) => [f.id, []]));
  for (const t of STUDIO_TOOLS) m.get(familleDe(t.toolId, t.groupe))!.push({ type: "outil", id: t.toolId });
  for (const c of COMMANDES_EDITEUR) m.get(familleDe(c.id, c.groupe))!.push({ type: "commande", id: c.id });
  return m;
})();

export const familleDeOutil = (toolId: StudioToolId): IdFamille => {
  const t = STUDIO_TOOLS.find((x) => x.toolId === toolId);
  return t ? familleDe(t.toolId, t.groupe) : "selection";
};

/**
 * Priorité de mise en rangée après la famille active : le catalogue (porte d'entrée de tous les outils), l'édition
 * (annuler, enregistrer), puis les familles les plus utilisées. Les dernières passent les premières dans « Plus ».
 */
export const PRIORITE_FAMILLES: readonly IdFamille[] = Object.freeze([
  "catalogue", "edition", "selection", "dessin", "courbes", "modification", "annotation", "vue", "calques", "volume", "architecture", "presentation", "echanges",
]);
/** Familles jamais envoyées dans « Plus » (leur bouton reste dans la rangée, quitte à être replié). */
export const FAMILLES_EPINGLEES: ReadonlySet<IdFamille> = new Set<IdFamille>(["catalogue", "edition"]);

export interface MesureFamille {
  id: IdFamille;
  /** Largeur du bouton « ▾ » de la famille (écart compris). */
  menu: number;
  /** Largeur de chacun de ses éléments en rangée (écart compris), dans l'ordre de la famille. */
  elements: readonly number[];
}

export interface EntreeDisposee {
  id: IdFamille;
  /** Nombre d'éléments (les premiers de la famille) montrés dans la rangée. */
  enLigne: number;
  /** Bouton « ▾ » présent : la famille garde des éléments dans son menu. */
  menu: boolean;
}

export interface Disposition {
  /** Familles de la rangée, dans l'ordre affiché. */
  rangee: EntreeDisposee[];
  /** Familles du menu « Plus », dans l'ordre affiché (vide : pas de bouton « Plus »). */
  plus: IdFamille[];
}

export interface OptionsDisposition {
  /** Largeur disponible de la rangée (px) ; `Infinity` : tout en rangée. */
  largeur: number;
  /** Familles présentes (au moins un élément visible), dans l'ordre affiché. */
  familles: readonly MesureFamille[];
  active: IdFamille;
  /** Largeur du bouton « Plus » (écart compris). */
  plus: number;
  /** Largeur du séparateur qui remplace le bouton « ▾ » d'une famille entièrement en rangée. */
  separateur: number;
}

const somme = (l: readonly number[]) => l.reduce((a, b) => a + b, 0);

/**
 * Disposition d'une rangée unique. 1) Chaque famille a d'abord son seul bouton « ▾ » ; si tous ne tiennent pas, les
 * familles de plus faible priorité (jamais l'active ni les épinglées) passent dans « Plus ». 2) La place restante
 * déplie les familles, la famille active d'abord : entièrement si possible (le bouton « ▾ » devient un séparateur),
 * sinon — pour l'active seulement — ses premiers éléments. Ne dépasse jamais la largeur donnée tant que les boutons
 * indispensables y tiennent.
 */
export function disposerBarre(o: OptionsDisposition): Disposition {
  const ordre = [o.active, ...PRIORITE_FAMILLES.filter((f) => f !== o.active)];
  const rang = (id: IdFamille) => { const i = ordre.indexOf(id); return i < 0 ? ordre.length : i; };
  const presentes = o.familles;
  const dansRangee = new Set(presentes.map((f) => f.id));
  const coutMenus = () => somme(presentes.filter((f) => dansRangee.has(f.id)).map((f) => f.menu));
  const plus: IdFamille[] = [];
  if (coutMenus() > o.largeur) {
    const retirables = presentes.filter((f) => f.id !== o.active && !FAMILLES_EPINGLEES.has(f.id)).sort((a, b) => rang(b.id) - rang(a.id));
    for (const f of retirables) {
      if (coutMenus() + o.plus <= o.largeur) break;
      dansRangee.delete(f.id);
      plus.push(f.id);
    }
  }
  let reste = o.largeur - coutMenus() - (plus.length ? o.plus : 0);
  const enLigne = new Map<IdFamille, { n: number; menu: boolean }>();
  for (const f of presentes) if (dansRangee.has(f.id)) enLigne.set(f.id, { n: 0, menu: true });
  for (const f of [...presentes].filter((x) => dansRangee.has(x.id)).sort((a, b) => rang(a.id) - rang(b.id))) {
    const total = somme(f.elements);
    if (f.elements.length > 0 && total + o.separateur - f.menu <= reste) {
      enLigne.set(f.id, { n: f.elements.length, menu: false });
      reste -= total + o.separateur - f.menu;
    } else if (f.id === o.active) {
      let n = 0;
      while (n < f.elements.length && f.elements[n]! <= reste) { reste -= f.elements[n]!; n += 1; }
      enLigne.set(f.id, { n, menu: true });
    }
  }
  return {
    rangee: presentes.filter((f) => dansRangee.has(f.id)).map((f) => ({ id: f.id, enLigne: enLigne.get(f.id)!.n, menu: enLigne.get(f.id)!.menu })),
    plus: presentes.filter((f) => plus.includes(f.id)).map((f) => f.id),
  };
}

/** Index de l'élément suivant d'une liste navigable au clavier (flèches, Début, Fin), en boucle ; `null` sinon. */
export function indexNavigation(touche: string, courant: number, nombre: number): number | null {
  if (nombre <= 0) return null;
  if (touche === "ArrowDown" || touche === "ArrowRight") return courant < 0 ? 0 : (courant + 1) % nombre;
  if (touche === "ArrowUp" || touche === "ArrowLeft") return courant < 0 ? nombre - 1 : (courant - 1 + nombre) % nombre;
  if (touche === "Home") return 0;
  if (touche === "End") return nombre - 1;
  return null;
}

/**
 * Position d'un menu ouvert (coordonnées de la fenêtre) : sous son bouton, ramené dans la fenêtre (8 px de marge),
 * hauteur bornée au bas de la fenêtre, jamais moins de 120 px.
 */
export function placementMenu(bouton: { left: number; bottom: number }, largeurMenu: number, fenetre: { largeur: number; hauteur: number }): { left: number; top: number; hauteurMax: number } {
  const left = Math.max(8, Math.min(bouton.left, fenetre.largeur - largeurMenu - 8));
  const top = Math.round(bouton.bottom + 4);
  return { left: Math.round(left), top, hauteurMax: Math.max(120, Math.floor(fenetre.hauteur - top - 8)) };
}
