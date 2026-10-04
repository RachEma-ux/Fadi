/**
 * Représentation d'une référence externe (DA-05-11) : le plan du niveau source à la révision publiée épinglée,
 * converti explicitement dans le repère local du projet (rotation puis translation, R5), réduit à des traits
 * (segments) en lecture seule — ni objet, ni seconde géométrie canonique (R15). Textes et pochés omis.
 */
import type { ModeleAtelier } from "../modele.js";
import { versRepereProjet, type ParamsReferenceExterne } from "../commandes/refexterne.js";
import { empreinteDe } from "./empreinte.js";
import { genererVue } from "./vues.js";

export interface TraitExterne {
  a: { x: number; y: number };
  b: { x: number; y: number };
  coupe: boolean;
}

export interface RepresentationExterne {
  traits: TraitExterne[];
  empreinte: string;
  niveauSourceNom: string | null;
}

export function representationReferenceExterne(source: ModeleAtelier, ref: ParamsReferenceExterne): RepresentationExterne {
  const niveau = source.niveaux[ref.niveauSourceId];
  if (!niveau) return { traits: [], empreinte: empreinteDe([]), niveauSourceNom: null };
  const vue = genererVue(source, { type: "plan", titre: "Référence externe", echelle: 100, niveauId: ref.niveauSourceId, hauteurCoupe: null, ligneA: null, ligneB: null, profondeur: null, orientation: null, cadreMin: null, cadreMax: null, lignesCachees: false, phases: null });
  const traits: TraitExterne[] = [];
  const T = (p: { x: number; y: number }) => versRepereProjet(p, ref);
  for (const p of vue.primitives) {
    if (p.type === "ligne") traits.push({ a: T(p.a), b: T(p.b), coupe: p.trait === "coupe" });
    else if (p.type === "poly" && p.trait) {
      const pts = p.points;
      for (let i = 0; i + 1 < pts.length; i++) traits.push({ a: T(pts[i]!), b: T(pts[i + 1]!), coupe: p.trait === "coupe" });
      if (p.ferme && pts.length > 2) traits.push({ a: T(pts[pts.length - 1]!), b: T(pts[0]!), coupe: p.trait === "coupe" });
    }
    if (traits.length > 20000) break;
  }
  return { traits, empreinte: empreinteDe(traits), niveauSourceNom: niveau.nom };
}
