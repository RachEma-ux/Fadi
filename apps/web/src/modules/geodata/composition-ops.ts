/**
 * Opérations pures de la page GeoData sur la composition locale (aucun DOM, aucun appel serveur) : ajout, retrait, ordre,
 * visibilité, opacité, style et filtre d'une couche, et état d'enregistrement. La composition locale n'est écrite au
 * serveur que par l'action « Enregistrer » ; déplacer la carte la rend seulement « non enregistrée ».
 */
import { calculerSeuils, couleurCategorie, couleurPixel, couleursPalette, formatNombre, PALETTE_PAR_DEFAUT, type DescriptionRaster, type IdPalette, memeComposition, type CoucheComposee, type EntreeLegende, type Composition, type FiltreCouche, type MethodeClassification, type StyleCouche, type ValeurIndicateur } from "@parcours/geodata-model";

export type EtatEnregistrement =
  | { readonly etat: "nouvelle" }
  | { readonly etat: "enregistree" }
  | { readonly etat: "non-enregistree" }
  | { readonly etat: "enregistrement" }
  | { readonly etat: "erreur"; readonly message: string }
  | { readonly etat: "conflit"; readonly revisionCourante: number };

export const LIBELLES_ENREGISTREMENT: Record<EtatEnregistrement["etat"], string> = {
  nouvelle: "Carte non enregistrée",
  enregistree: "Enregistrée",
  "non-enregistree": "Modifications non enregistrées",
  enregistrement: "Enregistrement…",
  erreur: "Échec de l'enregistrement",
  conflit: "Conflit : la carte a changé ailleurs",
};

/** État d'enregistrement déduit de la composition locale et de la dernière composition relue au serveur. */
export function etatDepuis(locale: Composition, serveur: Composition | null): EtatEnregistrement {
  if (!serveur) return { etat: "nouvelle" };
  return memeComposition(locale, serveur) ? { etat: "enregistree" } : { etat: "non-enregistree" };
}

const avecCouches = (c: Composition, couches: readonly CoucheComposee[]): Composition => ({ ...c, couches });

/** Ajoute une couche au-dessus des autres ; une couche déjà présente n'est pas dupliquée. */
export function ajouterCouche(c: Composition, coucheId: string, versionId: string, style: StyleCouche): Composition {
  if (c.couches.some((k) => k.coucheId === coucheId)) return c;
  return avecCouches(c, [...c.couches, { coucheId, versionId, visible: true, opacite: 0.8, style, filtre: null }]);
}

export const retirerCouche = (c: Composition, coucheId: string): Composition => avecCouches(c, c.couches.filter((k) => k.coucheId !== coucheId));

const modifier = (c: Composition, coucheId: string, f: (k: CoucheComposee) => CoucheComposee): Composition => avecCouches(c, c.couches.map((k) => (k.coucheId === coucheId ? f(k) : k)));

export const basculerVisibilite = (c: Composition, coucheId: string) => modifier(c, coucheId, (k) => ({ ...k, visible: !k.visible }));
export const definirOpacite = (c: Composition, coucheId: string, opacite: number) => modifier(c, coucheId, (k) => ({ ...k, opacite: Math.max(0, Math.min(1, Math.round(opacite * 100) / 100)) }));
export const definirStyle = (c: Composition, coucheId: string, style: StyleCouche) => modifier(c, coucheId, (k) => ({ ...k, style }));
export const definirFiltre = (c: Composition, coucheId: string, filtre: FiltreCouche | null) => modifier(c, coucheId, (k) => ({ ...k, filtre }));

/** Libellés d'une couche (lot C, D-GD-24) : affichés ↔ masqués ; « masqués » n'écrit aucune clé dans la composition. */
export const basculerEtiquettes = (c: Composition, coucheId: string) => modifier(c, coucheId, ({ etiquettes, ...k }) => (etiquettes ? k : { ...k, etiquettes: true as const }));

/**
 * Bouton « Libellés » de la barre d'outils (Alt+L) : sur les couches vectorielles visibles, affiche tous les libellés si
 * l'une d'elles n'en a pas, sinon les masque tous. Sans couche admissible, la composition est rendue telle quelle.
 */
export function basculerToutesEtiquettes(c: Composition, admissibles: ReadonlySet<string>): Composition {
  const cibles = c.couches.filter((k) => k.visible && admissibles.has(k.coucheId));
  if (!cibles.length) return c;
  const afficher = cibles.some((k) => !k.etiquettes);
  const ids = new Set(cibles.map((k) => k.coucheId));
  return avecCouches(c, c.couches.map((k) => {
    if (!ids.has(k.coucheId)) return k;
    const { etiquettes: _e, ...reste } = k;
    return afficher ? { ...reste, etiquettes: true as const } : reste;
  }));
}

/** Les libellés de toutes les couches vectorielles visibles sont-ils affichés ? (état du bouton de la barre d'outils) */
export const etiquettesToutesAffichees = (c: Composition, admissibles: ReadonlySet<string>): boolean => {
  const cibles = c.couches.filter((k) => k.visible && admissibles.has(k.coucheId));
  return cibles.length > 0 && cibles.every((k) => k.etiquettes);
};

/** Monte (+1, vers le dessus) ou descend (−1) une couche dans l'ordre d'affichage. */
export function deplacerCouche(c: Composition, coucheId: string, sens: 1 | -1): Composition {
  const i = c.couches.findIndex((k) => k.coucheId === coucheId);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= c.couches.length) return c;
  const couches = [...c.couches];
  [couches[i], couches[j]] = [couches[j]!, couches[i]!];
  return avecCouches(c, couches);
}

type Thematique = Extract<StyleCouche, { mode: "thematique" }>;
const avecPalette = (palette: IdPalette, inverser: boolean) => ({ ...(palette !== PALETTE_PAR_DEFAUT ? { palette } : {}), ...(inverser ? { inverser: true as const } : {}) });

/** Style thématique d'un indicateur : seuils calculés (quantiles par défaut) sur les valeurs présentes seulement. */
export function styleThematique(indicateurId: string, valeurs: readonly ValeurIndicateur[], methode: Exclude<MethodeClassification, "manuel"> = "quantiles", classes = 5, palette: IdPalette = PALETTE_PAR_DEFAUT, inverser = false): StyleCouche {
  const seuils = calculerSeuils(valeurs, methode, classes);
  return { mode: "thematique", indicateurId, methode, seuils, couleurs: couleursPalette(palette, seuils.length + 1, inverser), ...avecPalette(palette, inverser) };
}

/**
 * Reclassement (lot D) : méthode, nombre de classes, palette ou inversion changés. Les seuils ne sont recalculés que si la
 * méthode ou le nombre de classes change (jamais en seuils manuels) : changer de palette ou l'inverser ne modifie pas le
 * regroupement des données. Les couleurs sont reprises de la palette (une couleur choisie à la main est remplacée).
 */
export function reclasser(style: Thematique, valeurs: readonly ValeurIndicateur[], o: { methode?: MethodeClassification; classes?: number; palette?: IdPalette; inverser?: boolean }): Thematique {
  const methode = o.methode ?? style.methode;
  const palette = o.palette ?? style.palette ?? PALETTE_PAR_DEFAUT;
  const inverser = o.inverser ?? !!style.inverser;
  const classes = o.classes ?? style.seuils.length + 1;
  const recalculer = methode !== "manuel" && (methode !== style.methode || (o.classes !== undefined && o.classes !== style.seuils.length + 1));
  const seuils = recalculer ? calculerSeuils(valeurs, methode, classes) : [...style.seuils];
  const { palette: _p, inverser: _i, ...base } = style;
  return { ...base, methode, seuils, couleurs: couleursPalette(palette, seuils.length + 1, inverser), ...avecPalette(palette, inverser) };
}

/** Couleur d'une classe choisie à la main (#rrggbb) ; les autres classes et les seuils ne changent pas. */
export function recolorerClasse(style: Thematique, classe: number, couleur: string): Thematique {
  if (!/^#[0-9a-fA-F]{6}$/.test(couleur) || classe < 0 || classe >= style.couleurs.length) return style;
  return { ...style, couleurs: style.couleurs.map((c, i) => (i === classe ? couleur.toLowerCase() : c)) };
}

/** Seuils saisis à la main (« 10 ; 20 ; 50 ») : nombres strictement croissants, sinon `null`. */
export function lireSeuilsManuels(texte: string): number[] | null {
  const xs = texte.split(/[;\s]+/).filter(Boolean).map((s) => Number(s.replace(",", ".")));
  if (!xs.length || xs.length > 9 || xs.some((x) => !Number.isFinite(x))) return null;
  return xs.every((x, i) => i === 0 || x > xs[i - 1]!) ? xs : null;
}

/** Identifiant de demande d'un import (idempotence côté serveur). */
export const nouvelIdDemande = () => `imp-${(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "")}`;

/** Unité d'une couche au style « une couleur par entité », telle que servie par `/couches/:id/categories`. */
export interface Categorie { readonly code: string; readonly nom: string | null; readonly rang: number }

/** Légende « une couleur par entité » : une entrée par unité (ordre des noms), au plus `max`, puis une ligne de reste sans pastille. */
export function entreesCategories(cs: readonly Categorie[], max = 60): EntreeLegende[] {
  const tries = [...cs].sort((a, b) => (a.nom ?? a.code).localeCompare(b.nom ?? b.code, "fr") || a.code.localeCompare(b.code));
  const entrees: EntreeLegende[] = tries.slice(0, max).map((c, i) => ({ classe: i, couleur: couleurCategorie(c.rang), libelle: c.nom ?? c.code, effectif: 1 }));
  if (tries.length > max) entrees.push({ classe: max, couleur: "", libelle: `… et ${tries.length - max} autres entités (couleurs visibles sur la carte)`, effectif: tries.length - max });
  return entrees;
}

/** Légende d'une couche raster : classes déclarées, ou cinq paliers de la palette entre ses bornes (unité comprise). */
export function entreesRaster(d: DescriptionRaster): EntreeLegende[] {
  const hex = (c: readonly number[]) => `#${c.slice(0, 3).map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  if (d.classes) return d.classes.map((c, i) => ({ classe: i, couleur: c.couleur, libelle: c.libelle, effectif: 0 }));
  const fmt = (x: number) => `${formatNombre(x, Math.abs(x) >= 100 ? 0 : 2)}${d.unite ? ` ${d.unite}` : ""}`;
  return [0, 0.25, 0.5, 0.75, 1].map((t, i) => {
    const v = d.min + (d.max - d.min) * t;
    return { classe: i, couleur: hex(couleurPixel(v, d)), libelle: `${i === 0 ? "≤ " : i === 4 ? "≥ " : ""}${fmt(v)}`, effectif: 0 };
  });
}
