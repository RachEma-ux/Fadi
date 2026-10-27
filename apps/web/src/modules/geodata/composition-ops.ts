/**
 * Opérations pures de la page GeoData sur la composition locale (aucun DOM, aucun appel serveur) : ajout, retrait, ordre,
 * visibilité, opacité, style et filtre d'une couche, et état d'enregistrement. La composition locale n'est écrite au
 * serveur que par l'action « Enregistrer » ; déplacer la carte la rend seulement « non enregistrée ».
 */
import { couleurCategorie, couleurPixel, formatNombre, type DescriptionRaster, memeComposition, type CoucheComposee, type EntreeLegende, type Composition, type FiltreCouche, type StyleCouche } from "@parcours/geodata-model";

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

/**
 * Coloration d'une carte enregistrée avant D-GD-32 : un ancien style « thématique » (classes de couleurs d'un indicateur)
 * n'est plus rendu ; la couche revient à la couleur unie par défaut. Aucun code ne colore une couche d'après un indicateur.
 */
export function sansColorationThematique(c: Composition): Composition {
  if (!c.couches.some((k) => k.style.mode === "thematique")) return c;
  return avecCouches(c, c.couches.map((k) => (k.style.mode === "thematique" ? { ...k, style: { mode: "simple", couleur: "#2b8cbe" } } : k)));
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
