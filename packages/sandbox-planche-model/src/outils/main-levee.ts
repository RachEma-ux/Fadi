/**
 * Outil Main levée (cahier-planche §4.5, relevé outils-dessin §13) — machine d'états pure.
 *
 * Appuyer, glisser, relâcher → UNE courbe (suite d'arêtes) le long du trajet, dans le plan de dessin : plan de la face
 * visée à l'appui, sinon le sol (z = 0), ou plan verrouillé par les flèches avant le tracé (→ ← ↑ : plan
 * perpendiculaire à l'axe rouge / vert / bleu, ↓ : plan de la face survolée) — bascules. L'outil reste actif.
 * Juste après un tracé : Ctrl − / Ctrl + diminue / augmente le nombre de segments de la dernière courbe (instr ;
 * ré-échantillonnage du trajet, pas d'annulation remplacé). Boucle fermée → face si plane (doc [S12], nv).
 *
 * Choix Fadi déclaré : échantillonnage du trajet à une distance minimale égale à la tolérance d'accrochage reçue
 * (au moins 1 mm).
 */
import { type Modele, ajouterCourbeLibre } from "../geometrie-libre.js";
import { geometrieVisible, inferer } from "../inference.js";
import { type Vec3, AXE_X, AXE_Y, AXE_Z, EPS, TOL, add, dist, dot, lerp, normalize, scale, sub } from "../vecteur.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Rayon, Touche, Transition, VueOutil } from "./machine.js";
import { etapeCatalogue, mesuresVides, optionsDans, versContexteEdition } from "./selection.js";

/** Segment de consigne ajouté juste après un tracé (cahier-planche §4.5, relevé `Ctrl '-' / Ctrl '+' = …`). */
export const CONSIGNE_SEGMENTS = "Ctrl − / Ctrl + = Diminuer / augmenter les segments.";

export interface PlanDessin {
  readonly origine: Vec3;
  readonly normale: Vec3;
}

export interface EtatMainLevee {
  /** Points du tracé en cours (null au repos). */
  readonly points: readonly Vec3[] | null;
  readonly plan: PlanDessin | null;
  readonly pas: number;
  /** Verrou de plan des flèches (normale), avant le tracé. */
  readonly verrou: { readonly touche: Touche; readonly normale: Vec3 } | null;
  /** Normale de la dernière face survolée (référence de ↓). */
  readonly faceSurvolee: Vec3 | null;
  /** Dernière courbe créée, modifiable par Ctrl − / Ctrl + tant qu'aucune autre action n'a eu lieu. */
  readonly derniere: {
    readonly modeleAvant: Modele;
    readonly trajet: readonly Vec3[];
    readonly segments: number;
    readonly fermee: boolean;
  } | null;
  readonly ignorerClic: boolean;
}

function intersection(r: Rayon, p: PlanDessin): Vec3 | null {
  const V = normalize(r.direction);
  const den = dot(p.normale, V);
  if (Math.abs(den) < EPS) return null;
  const t = dot(p.normale, sub(p.origine, r.origine)) / den;
  return t > 0 ? add(r.origine, scale(V, t)) : null;
}

/** Ré-échantillonne un trajet en `n` segments de même longueur d'arc. */
export function reechantillonner(trajet: readonly Vec3[], n: number): Vec3[] {
  const cumul: number[] = [0];
  for (let i = 1; i < trajet.length; i++) cumul.push((cumul[i - 1] as number) + dist(trajet[i - 1] as Vec3, trajet[i] as Vec3));
  const total = cumul[cumul.length - 1] as number;
  const r: Vec3[] = [];
  let j = 1;
  for (let k = 0; k <= n; k++) {
    const s = (total * k) / n;
    while (j < trajet.length - 1 && (cumul[j] as number) < s) j++;
    const s0 = cumul[j - 1] as number;
    const s1 = cumul[j] as number;
    const t = s1 - s0 > EPS ? (s - s0) / (s1 - s0) : 0;
    r.push(lerp(trajet[j - 1] as Vec3, trajet[j] as Vec3, Math.min(1, Math.max(0, t))));
  }
  return r;
}

function creer(ctx: ContexteOutil, modeleAvant: Modele, points: readonly Vec3[], fermee: boolean): Modele {
  const L = versContexteEdition({ ...ctx, modele: modeleAvant });
  return ajouterCourbeLibre(modeleAvant, points.map(L), { ...optionsDans(ctx), fermee }).modele;
}

const SEGMENTS_MIN = 2;
const SEGMENTS_MAX = 999;

export const machineMainLevee: MachineOutil<EtatMainLevee> = {
  id: "main-levee",
  initial: () => ({ points: null, plan: null, pas: 0.001, verrou: null, faceSurvolee: null, derniere: null, ignorerClic: false }),

  traiter(etat, ev: EvenementOutil, ctx): Transition<EtatMainLevee> {
    switch (ev.genre) {
      case "touche": {
        if (ev.etat !== "enfoncee") return { etat };
        const t = ev.touche;
        if ((t === "CtrlPlus" || t === "CtrlMoins") && etat.derniere) {
          const d = etat.derniere;
          const n = Math.min(SEGMENTS_MAX, Math.max(SEGMENTS_MIN, d.segments + (t === "CtrlPlus" ? 1 : -1)));
          if (n === d.segments) return { etat };
          const pts = reechantillonner(d.trajet, n);
          if (d.fermee) pts[pts.length - 1] = pts[0] as Vec3;
          return {
            etat: { ...etat, derniere: { ...d, segments: n } },
            modele: creer(ctx, d.modeleAvant, pts, d.fermee),
            remplaceDernier: true,
            operation: "Main levée",
          };
        }
        if (etat.points) return { etat };
        if (t === "FlecheDroite" || t === "FlecheGauche" || t === "FlecheHaut" || t === "FlecheBas") {
          if (etat.verrou?.touche === t) return { etat: { ...etat, verrou: null } };
          const normale = t === "FlecheDroite" ? AXE_X : t === "FlecheGauche" ? AXE_Y : t === "FlecheHaut" ? AXE_Z : etat.faceSurvolee;
          return normale ? { etat: { ...etat, verrou: { touche: t, normale } } } : { etat };
        }
        return { etat };
      }
      case "survol": {
        const i = inferer({ rayon: ev.rayon, tolerance: ev.tolerance, geometrie: geometrieVisible(ctx.modele), ...(ctx.repere ? { axes: ctx.repere } : {}) });
        const f = i.type === "sur-face" ? geometrieVisible(ctx.modele).faces.find((x) => x.id === i.entite) : undefined;
        return { etat: { ...etat, faceSurvolee: f ? normalize(f.normale) : etat.faceSurvolee, ignorerClic: false } };
      }
      case "appui": {
        const geo = geometrieVisible(ctx.modele);
        const i = inferer({ rayon: ev.rayon, tolerance: ev.tolerance, geometrie: geo, ...(ctx.repere ? { axes: ctx.repere } : {}) });
        const face = i.type === "sur-face" ? geo.faces.find((x) => x.id === i.entite) : undefined;
        const normale = etat.verrou?.normale ?? (face ? normalize(face.normale) : AXE_Z);
        const plan: PlanDessin = { origine: i.point, normale };
        return {
          etat: { ...etat, points: [i.point], plan, pas: Math.max(ev.tolerance, 0.001), derniere: null, ignorerClic: false },
        };
      }
      case "glisser": {
        if (!etat.points || !etat.plan) return { etat };
        const p = intersection(ev.rayon, etat.plan);
        const der = etat.points[etat.points.length - 1] as Vec3;
        if (!p || dist(p, der) < etat.pas) return { etat };
        return { etat: { ...etat, points: [...etat.points, p] } };
      }
      case "relache": {
        if (!etat.points || !etat.plan) return { etat };
        const p = intersection(ev.rayon, etat.plan);
        const pts = [...etat.points];
        if (p && dist(p, pts[pts.length - 1] as Vec3) > TOL) pts.push(p);
        const repos: EtatMainLevee = { ...etat, points: null, plan: null, verrou: null, ignorerClic: true };
        if (pts.length < 2) return { etat: repos };
        const premier = pts[0] as Vec3;
        const fermee = pts.length >= 4 && dist(pts[pts.length - 1] as Vec3, premier) <= etat.pas;
        if (fermee) pts[pts.length - 1] = premier;
        return {
          etat: { ...repos, derniere: { modeleAvant: ctx.modele, trajet: pts, segments: pts.length - 1, fermee } },
          modele: creer(ctx, ctx.modele, pts, fermee),
          operation: "Main levée",
        };
      }
      case "clic":
        return { etat: { ...etat, ignorerClic: false } };
      case "echap":
        return { etat: { ...etat, points: null, plan: null, derniere: null } };
      case "saisie":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const e = etapeCatalogue("main-levee", 0);
    let consigne = e.consigne ?? "";
    if (etat.derniere && !etat.points) {
      const s = consigne.split(" | ");
      consigne = [s[0] ?? "", CONSIGNE_SEGMENTS, ...s.slice(1)].join(" | ");
    }
    return {
      consigne,
      mesures: mesuresVides(e, ctx),
      inference: null,
      apercu: { lignes: etat.points && etat.points.length > 1 ? [etat.points] : [], faces: [] },
      selection: ctx.selection,
      survol: [],
      erreur: null,
    };
  },
};
