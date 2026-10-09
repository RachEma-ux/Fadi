/**
 * Références topologiques (Architecture V4 §5.2, T05) : résolution d'une caractéristique nommée en un point du
 * repère local, et propositions de réparation pour une référence « à réparer » (caractéristiques voisines du même
 * niveau). Jamais de rattachement silencieux : les propositions sont présentées, la réparation est une commande.
 */
import { add, centroide, distance, facesMur, mul, sub } from "./geometrie.js";
import type { ModeleAtelier, OccurrenceQuelconque, Reference } from "./modele.js";
import { CLASSES } from "./ontologie.js";
import { sommetsBloc } from "./blocs-places.js";
import { pt, type Point2 } from "./unites.js";
import { intersectionsTrame } from "./ontologies/structure/trame.js";

const milieu = (a: Point2, b: Point2): Point2 => pt((a.x + b.x) / 2, (a.y + b.y) / 2);

/** Point porté par une caractéristique nommée d'un objet ; `null` si la caractéristique n'existe pas (ou plus). */
export function pointCaracteristique(etat: ModeleAtelier, objetId: string, caracteristique: string): Point2 | null {
  const o = etat.objets[objetId];
  if (!o) return null;
  const indexe = /^(\w[\w-]*)\[(\d+)\]$/.exec(caracteristique);
  const nom = indexe ? indexe[1]! : caracteristique;
  const index = indexe ? Number(indexe[2]) : null;
  switch (o.classe) {
    case "mur": {
      const { a, b, epaisseur, alignement } = o.params;
      if (nom === "arete-debut") return a;
      if (nom === "arete-fin") return b;
      if (nom === "axe") return milieu(a, b);
      if (nom === "face-gauche" || nom === "face-droite") {
        const f = facesMur(a, b, epaisseur.value, alignement);
        const face = nom === "face-gauche" ? f.gauche : f.droite;
        return pt((face[0].x + face[1].x) / 2, (face[0].y + face[1].y) / 2);
      }
      return null;
    }
    case "porte":
    case "fenetre":
    case "ouverture": {
      if (nom !== "centre") return null;
      const hote = etat.objets[o.params.murHoteId];
      if (!hote || hote.classe !== "mur") return null;
      const c = add(hote.params.a, mul(sub(hote.params.b, hote.params.a), o.params.position));
      return pt(c.x, c.y);
    }
    case "dalle":
    case "toiture":
    case "zone":
    case "solide":
    case "reference-plan":
    case "piece": {
      if (nom !== "contour") return null;
      if (index === null) {
        const c = centroide(o.params.contour);
        return pt(c.x, c.y);
      }
      return o.params.contour[index] ?? null;
    }
    case "espace": {
      if (nom !== "contour") return null;
      const premier = o.params.polygones[0];
      if (!premier) return null;
      if (index === null) {
        const c = centroide(premier.contour);
        return pt(c.x, c.y);
      }
      return premier.contour[index] ?? null;
    }
    case "escalier":
      return nom === "depart" ? o.params.a : nom === "arrivee" ? o.params.b : null;
    case "poteau":
      return nom === "centre" ? o.params.point : null;
    case "esquisse": {
      if (nom === "centre") return o.params.centre ?? (o.params.points.length ? (() => { const c = centroide(o.params.points); return pt(c.x, c.y); })() : null);
      if (nom === "sommet" && index !== null) return o.params.points[index] ?? null;
      if (nom === "segment" && index !== null) {
        const a = o.params.points[index];
        const b = o.params.points[(index + 1) % o.params.points.length];
        return a && b ? milieu(a, b) : null;
      }
      return null;
    }
    case "bloc-occurrence":
      // Sommets du contenu placé (D-102) : une cote rattachée suit l'occurrence déplacée, tournée ou mise à l'échelle.
      if (nom === "sommet" && index !== null) return sommetsBloc(etat, o)[index] ?? null;
      return nom === "centre" ? o.params.position : null;
    case "garde-corps":
      return nom === "sommet" && index !== null ? (o.params.points[index] ?? null) : null;
    case "objet-importe":
      return nom === "centre" && o.params.empreinte.length ? (() => { const c = centroide(o.params.empreinte); return pt(c.x, c.y); })() : null;
    case "solide-exact":
      return nom === "centre" && o.params.emprise.length ? (() => { const c = centroide(o.params.emprise); return pt(c.x, c.y); })() : null;
    case "piece-mecanique":
      return nom === "centre" && o.params.emprise.length ? (() => { const c = centroide(o.params.emprise); return pt(c.x, c.y); })() : null;
    case "assemblage":
      return nom === "centre" ? o.params.position : null;
    case "liaison":
      return null;
    case "poutre":
      if (nom === "arete-debut") return o.params.a;
      if (nom === "arete-fin") return o.params.b;
      if (nom === "axe" || nom === "centre") return milieu(o.params.a, o.params.b);
      return null;
    case "trame":
      if (nom === "centre") return o.params.origine;
      if (nom === "sommet" && index !== null) return intersectionsTrame(o.params)[index]?.point ?? null;
      return null;
    case "plaque":
      return nom === "centre" || nom === "contour" ? (() => { const c = centroide(o.params.contour); return pt(c.x, c.y); })() : null;
    case "assemblage-structurel":
    case "soudure":
      return nom === "centre" ? o.params.position : null;
    case "armature":
      if (nom === "sommet" && index !== null) return o.params.points[index] ?? null;
      return nom === "centre" ? (() => { const c = centroide(o.params.points); return pt(c.x, c.y); })() : null;
    case "coulage":
      return null;
    case "element-bois":
      if (nom === "arete-debut") return o.params.a;
      if (nom === "arete-fin") return o.params.b;
      if (nom === "axe" || nom === "centre") return milieu(o.params.a, o.params.b);
      return null;
    case "ossature":
    case "assemblage-bois":
    case "tole":
      return nom === "centre" ? o.params.position : null;
    case "raccord-reseau":
    case "vanne":
    case "equipement-reseau":
    case "support-reseau":
      return nom === "centre" ? o.params.position : null;
    case "segment-reseau": {
      const s = o.params.sommets, a = s[0]!, b = s[s.length - 1]!;
      const P = (q: { x: number; y: number }): Point2 => ({ x: q.x, y: q.y, frame: "local", unit: "m" });
      return nom === "arete-debut" || nom === "sommet" ? P(a) : nom === "arete-fin" ? P(b) : nom === "axe" ? milieu(P(a), P(b)) : null;
    }
    case "panneau-clt":
      if (o.params.pose === "mur" && o.params.a && o.params.b) return nom === "centre" || nom === "contour" ? milieu(o.params.a, o.params.b) : null;
      return nom === "centre" || nom === "contour" ? (() => { const c = centroide(o.params.contour); return pt(c.x, c.y); })() : null;
    case "cotation":
    case "texte":
    case "etiquette":
      return null;
  }
}

export function resoudreReference(etat: ModeleAtelier, ref: Reference): Point2 | null {
  if (ref.etat !== "ok" || !ref.objetId || !ref.caracteristique) return null;
  return pointCaracteristique(etat, ref.objetId, ref.caracteristique);
}

export interface PropositionReference {
  objetId: string;
  caracteristique: string;
  distance: number;
}

/** Caractéristiques énumérables d'un objet (sans les index au-delà de ses sommets). */
export function caracteristiquesDe(o: OccurrenceQuelconque, etat?: ModeleAtelier): string[] {
  const base = CLASSES[o.classe].caracteristiques;
  const out: string[] = [];
  for (const c of base) {
    if (c === "contour") {
      const n = o.classe === "espace" ? (o.params.polygones[0]?.contour.length ?? 0) : "contour" in o.params ? (o.params as { contour: Point2[] }).contour.length : 0;
      out.push("contour");
      for (let i = 0; i < n; i++) out.push(`contour[${i}]`);
    } else if (c === "sommet" || c === "segment") {
      const n = o.classe === "esquisse" || o.classe === "garde-corps" ? o.params.points.length : o.classe === "bloc-occurrence" && etat ? sommetsBloc(etat, o).length : 0;
      for (let i = 0; i < n; i++) out.push(`${c}[${i}]`);
    } else out.push(c);
  }
  return out;
}

/** Propositions de réparation : caractéristiques du même niveau à moins de `rayon` du dernier point connu. */
export function propositionsReparation(etat: ModeleAtelier, ref: Reference, dernierPoint: Point2 | null, niveauId: string | null, rayon = 1): PropositionReference[] {
  const out: PropositionReference[] = [];
  for (const o of Object.values(etat.objets)) {
    if (o.id === ref.proprietaireId) continue;
    if (niveauId !== null && o.niveauId !== niveauId) continue;
    for (const c of caracteristiquesDe(o, etat)) {
      const p = pointCaracteristique(etat, o.id, c);
      if (!p) continue;
      const d = dernierPoint ? distance(dernierPoint, p) : Infinity;
      if (dernierPoint && d > rayon) continue;
      out.push({ objetId: o.id, caracteristique: c, distance: d });
    }
  }
  return out.sort((u, v) => u.distance - v.distance).slice(0, 10);
}

export function referencesAReparer(etat: ModeleAtelier): Reference[] {
  return Object.values(etat.references).filter((r) => r.etat === "a-reparer");
}

/**
 * Caractéristique nommée d'un objet portée exactement par un point (accrochage d'une extrémité de cotation sur
 * l'extrémité d'un mur, le sommet d'une dalle…) ; `null` si aucune ne coïncide à la tolérance de geste.
 */
export function caracteristiqueAuPoint(etat: ModeleAtelier, objetId: string, p: { x: number; y: number }, tol = 0.01): string | null {
  const o = etat.objets[objetId];
  if (!o) return null;
  let meilleure: { c: string; d: number } | null = null;
  for (const c of caracteristiquesDe(o, etat)) {
    const q = pointCaracteristique(etat, objetId, c);
    if (!q) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= tol && (!meilleure || d < meilleure.d)) meilleure = { c, d };
  }
  return meilleure?.c ?? null;
}

/** Identifiant de la référence d'une extrémité de cotation (convention : `<cotation>~a`, `<cotation>~b`). */
export const referenceExtremite = (cotationId: string, extremite: "a" | "b"): string => `${cotationId}~${extremite}`;

/**
 * Extrémités effectives d'une cotation : une extrémité rattachée suit sa caractéristique (cote associative) ;
 * libre, elle garde son point ; « à réparer », elle garde son dernier point et le signale.
 */
export function extremitesCotation(etat: ModeleAtelier, cotationId: string): { a: Point2; b: Point2; aReparer: boolean; rattachees: number } | null {
  const o = etat.objets[cotationId];
  if (!o || o.classe !== "cotation") return null;
  let a = o.params.a;
  let b = o.params.b;
  // Cote sur une référence externe dont la source a été réépinglée (D-153) : à vérifier.
  let aReparer = !!o.params.externe?.aVerifier;
  let rattachees = 0;
  for (const ref of Object.values(etat.references)) {
    if (ref.proprietaireId !== cotationId) continue;
    if (ref.etat === "a-reparer") aReparer = true;
    const p = resoudreReference(etat, ref);
    if (!p) continue;
    if (ref.id === referenceExtremite(cotationId, "a")) {
      a = p;
      rattachees++;
    } else if (ref.id === referenceExtremite(cotationId, "b")) {
      b = p;
      rattachees++;
    }
  }
  return { a, b, aReparer, rattachees };
}
