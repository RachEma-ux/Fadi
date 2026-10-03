/**
 * Géométrie des caractéristiques nommées (cahier §5.2), en repère local du projet, mètres. Fonctions pures,
 * sans arrondi ; les seuils sont les tolérances D-012 (`TOLERANCES`).
 *
 * Conventions retenues (L1.3) — à confirmer par le chef de projet, voir le rapport de la tâche :
 * - normale gauche de l'axe a→b : n = (−dy, dx) / L (rotation de +90°), cohérente avec DA-02-07
 *   (mur vertical montant centré en x = 5, épaisseur 0,20 m → `mur:face-gauche` en x = 4,90) ;
 * - `alignement` : `axe` → faces à ±e/2 ; `gauche` → l'axe tracé est la face gauche (corps du mur à droite) ;
 *   `droite` → l'axe tracé est la face droite (corps du mur à gauche). Le miroir de L1.2 permute
 *   gauche / droite, ce qui est cohérent avec cette lecture ;
 * - `mur:arete-debut` / `mur:arete-fin` : segment de la face gauche vers la face droite, à `a` / `b` ;
 * - `ouverture:centre` : point de l'axe du mur hôte au paramètre `t` ;
 * - `escalier:depart` / `escalier:arrivee` : extrémités `a` / `b` de l'axe (sens de montée) — un point, pas
 *   la ligne de nez de marche (aucune convention de largeur supposée) ;
 * - `poteau:centre` : `point` ;
 * - `dalle:contour[i]` : arête du sommet i au sommet (i + 1) mod n du contour.
 */
import { TOLERANCES } from "../contrats/tolerances.js";
import type { GeometrieCaracteristique } from "../contrats/references.js";
import { distance, pt, scalaire, sous, type Vec } from "../commandes/geometrie.js";
import { CARACTERISTIQUES_PAR_CLASSE, indiceContourDalle } from "../ontologie/caracteristiques.js";
import type { ClasseObjet, IdObjet, ObjetModele, ObjetMur } from "../ontologie/classes.js";
import type { PointLocal, Segment } from "../ontologie/reperes.js";
import { REPERE_LOCAL_PROJET } from "../ontologie/reperes.js";

/** Vue minimale de l'état nécessaire à la résolution (l'`EtatModele` complet convient). */
export interface VueObjets {
  readonly objets: Readonly<Record<IdObjet, ObjetModele>>;
}

export type GeometrieOuMotif = { readonly ok: true; readonly geometrie: GeometrieCaracteristique } | { readonly ok: false; readonly motif: "caracteristique-absente" | "classe-incompatible" | "geometrie-degeneree"; readonly detail: string };

const fini = (p: Vec | undefined): p is Vec => p !== undefined && Number.isFinite(p.x) && Number.isFinite(p.y);
const duProjet = (p: PointLocal): boolean => (p.repereLocal ?? REPERE_LOCAL_PROJET) === REPERE_LOCAL_PROJET;

const point = (p: Vec): GeometrieOuMotif => ({ ok: true, geometrie: { nature: "point", point: pt(p.x, p.y) } });
const segment = (a: Vec, b: Vec): GeometrieOuMotif => ({ ok: true, geometrie: { nature: "segment", segment: { a: pt(a.x, a.y), b: pt(b.x, b.y) } } });
const degeneree = (detail: string): GeometrieOuMotif => ({ ok: false, motif: "geometrie-degeneree", detail });

/** Décalages (le long de la normale gauche) des faces gauche et droite d'un mur. */
export function decalagesFaces(mur: ObjetMur): { readonly gauche: number; readonly droite: number } | null {
  const e = mur.params.epaisseur?.value;
  if (typeof e !== "number" || !Number.isFinite(e) || e <= 0) return null;
  switch (mur.params.alignement) {
    case "axe":
      return { gauche: e / 2, droite: -e / 2 };
    case "gauche":
      return { gauche: 0, droite: -e };
    case "droite":
      return { gauche: e, droite: 0 };
    default:
      return null;
  }
}

function geometrieMur(mur: ObjetMur, c: string): GeometrieOuMotif {
  const axe = mur.params.axe;
  if (!axe || !fini(axe.a) || !fini(axe.b) || !duProjet(axe.a) || !duProjet(axe.b)) return degeneree(`axe du mur ${mur.id} mal formé ou hors du repère local du projet`);
  const L = distance(axe.a, axe.b);
  if (L < TOLERANCES.longueurMin) return degeneree(`axe du mur ${mur.id} plus court que ${TOLERANCES.longueurMin} m`);
  if (c === "mur:axe") return segment(axe.a, axe.b);
  const f = decalagesFaces(mur);
  if (!f) return degeneree(`épaisseur ou alignement du mur ${mur.id} inexploitable`);
  const n = { x: -(axe.b.y - axe.a.y) / L, y: (axe.b.x - axe.a.x) / L };
  const dec = (p: Vec, k: number): Vec => ({ x: p.x + n.x * k, y: p.y + n.y * k });
  switch (c) {
    case "mur:face-gauche":
      return segment(dec(axe.a, f.gauche), dec(axe.b, f.gauche));
    case "mur:face-droite":
      return segment(dec(axe.a, f.droite), dec(axe.b, f.droite));
    case "mur:arete-debut":
      return segment(dec(axe.a, f.gauche), dec(axe.a, f.droite));
    case "mur:arete-fin":
      return segment(dec(axe.b, f.gauche), dec(axe.b, f.droite));
    default:
      return { ok: false, motif: "classe-incompatible", detail: `« ${c} » n'est pas une caractéristique de mur` };
  }
}

/**
 * Géométrie d'une caractéristique d'un objet existant, ou motif d'échec (caractéristique absente, classe
 * incompatible, géométrie dégénérée). Ne cherche jamais une autre cible.
 */
export function geometrieCaracteristique(vue: VueObjets, o: ObjetModele, c: string): GeometrieOuMotif {
  const i = indiceContourDalle(c);
  const admise = o.classe === "dalle" ? i !== null : (CARACTERISTIQUES_PAR_CLASSE[o.classe]?.includes(c) ?? false);
  if (!admise) {
    const nommee = i !== null || Object.values(CARACTERISTIQUES_PAR_CLASSE).some((l) => l?.includes(c));
    return nommee
      ? { ok: false, motif: "classe-incompatible", detail: `« ${c} » n'existe pas pour la classe ${o.classe}` }
      : { ok: false, motif: "caracteristique-absente", detail: `« ${c} » n'est pas une caractéristique nommée` };
  }
  switch (o.classe) {
    case "mur":
      return geometrieMur(o, c);
    case "porte":
    case "fenetre":
    case "ouverture": {
      const hote = vue.objets[o.params.murHoteId];
      if (!hote || hote.classe !== "mur") return degeneree(`mur hôte ${o.params.murHoteId} de ${o.id} introuvable`);
      const axe = geometrieMur(hote, "mur:axe");
      if (!axe.ok || axe.geometrie.nature !== "segment") return axe.ok ? degeneree(`axe du mur hôte ${hote.id} inexploitable`) : axe;
      const t = o.params.position?.t;
      if (typeof t !== "number" || !Number.isFinite(t)) return degeneree(`position de ${o.id} mal formée`);
      const s = axe.geometrie.segment;
      return point({ x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t });
    }
    case "escalier": {
      const axe = o.params.axe;
      if (!axe || !fini(axe.a) || !fini(axe.b) || !duProjet(axe.a) || !duProjet(axe.b)) return degeneree(`axe de l'escalier ${o.id} mal formé`);
      return point(c === "escalier:depart" ? axe.a : axe.b);
    }
    case "poteau": {
      const p = o.params.point;
      if (!fini(p) || !duProjet(p)) return degeneree(`point du poteau ${o.id} mal formé`);
      return point(p);
    }
    case "dalle": {
      const contour = o.params.contour ?? [];
      const n = contour.length;
      if (i === null || i >= n) return { ok: false, motif: "caracteristique-absente", detail: `la dalle ${o.id} n'a que ${n} arêtes (indices 0 à ${n - 1})` };
      const a = contour[i];
      const b = contour[(i + 1) % n];
      if (!fini(a) || !fini(b) || !duProjet(a as PointLocal) || !duProjet(b as PointLocal)) return degeneree(`arête ${i} de la dalle ${o.id} mal formée`);
      if (n < 3 || distance(a, b) < TOLERANCES.longueurMin) return degeneree(`arête ${i} de la dalle ${o.id} plus courte que ${TOLERANCES.longueurMin} m`);
      return segment(a, b);
    }
    default:
      return { ok: false, motif: "classe-incompatible", detail: `la classe ${o.classe} n'a pas de caractéristique nommée` };
  }
}

/** Caractéristiques candidates d'un objet (dalle : une par arête du contour). */
export function caracteristiquesDe(o: ObjetModele): readonly string[] {
  if (o.classe === "dalle") return (o.params.contour ?? []).map((_, i) => `dalle:contour[${i}]`);
  return CARACTERISTIQUES_PAR_CLASSE[o.classe] ?? [];
}

/** Classes qui portent une caractéristique (d'après son préfixe). */
export function classesPortant(c: string): readonly ClasseObjet[] {
  if (indiceContourDalle(c) !== null) return ["dalle"];
  return (Object.entries(CARACTERISTIQUES_PAR_CLASSE) as [ClasseObjet, readonly string[] | undefined][]).filter(([, l]) => l?.includes(c)).map(([k]) => k);
}

/** Projection d'un point sur un segment, bornée aux extrémités. */
export function projeterSurSegment(s: Segment<PointLocal>, p: Vec): Vec {
  const d = sous(s.b, s.a);
  const l2 = scalaire(d, d);
  const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, scalaire(sous(p, s.a), d) / l2));
  return { x: s.a.x + d.x * t, y: s.a.y + d.y * t };
}

/** Écart (m) entre un point et une géométrie de caractéristique. */
export function ecart(g: GeometrieCaracteristique, p: Vec): number {
  return g.nature === "point" ? distance(g.point, p) : distance(projeterSurSegment(g.segment, p), p);
}
