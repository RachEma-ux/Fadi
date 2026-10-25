/**
 * Opérations pures de la page GeoData sur la composition locale (aucun DOM, aucun appel serveur) : ajout, retrait, ordre,
 * visibilité, opacité, style et filtre d'une couche, et état d'enregistrement. La composition locale n'est écrite au
 * serveur que par l'action « Enregistrer » ; déplacer la carte la rend seulement « non enregistrée ».
 */
import { calculerSeuils, couleursPour, memeComposition, type CoucheComposee, type Composition, type FiltreCouche, type MethodeClassification, type StyleCouche, type ValeurIndicateur } from "@parcours/geodata-model";

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

/** Monte (+1, vers le dessus) ou descend (−1) une couche dans l'ordre d'affichage. */
export function deplacerCouche(c: Composition, coucheId: string, sens: 1 | -1): Composition {
  const i = c.couches.findIndex((k) => k.coucheId === coucheId);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= c.couches.length) return c;
  const couches = [...c.couches];
  [couches[i], couches[j]] = [couches[j]!, couches[i]!];
  return avecCouches(c, couches);
}

/** Style thématique d'un indicateur : seuils calculés (quantiles par défaut) sur les valeurs présentes seulement. */
export function styleThematique(indicateurId: string, valeurs: readonly ValeurIndicateur[], methode: Exclude<MethodeClassification, "manuel"> = "quantiles", classes = 5): StyleCouche {
  const seuils = calculerSeuils(valeurs, methode, classes);
  return { mode: "thematique", indicateurId, methode, seuils, couleurs: couleursPour(seuils.length + 1) };
}

/** Seuils saisis à la main (« 10 ; 20 ; 50 ») : nombres strictement croissants, sinon `null`. */
export function lireSeuilsManuels(texte: string): number[] | null {
  const xs = texte.split(/[;\s]+/).filter(Boolean).map((s) => Number(s.replace(",", ".")));
  if (!xs.length || xs.length > 9 || xs.some((x) => !Number.isFinite(x))) return null;
  return xs.every((x, i) => i === 0 || x > xs[i - 1]!) ? xs : null;
}

/** Identifiant de demande d'un import (idempotence côté serveur). */
export const nouvelIdDemande = () => `imp-${(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "")}`;
