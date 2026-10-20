/**
 * Outil Plan de coupe (cahier-planche §4.32, relevé mesure-camera-panneaux §1.6) — machine pure.
 *
 * Le survol d'une face montre un rectangle à languettes qui l'épouse (couleur de l'axe de la normale) ; le clic pose
 * le plan sur la face, la coupe est active aussitôt (le demi-espace du côté de la normale est caché), l'outil passe
 * à Sélection avec le plan sélectionné. Maj maintenue avant le clic : orientation verrouillée sur la face survolée ;
 * flèches → ← ↑ : orientation perpendiculaire à l'axe rouge / vert / bleu (bascules), ↓ : parallèle à la face.
 * Inverser et Coupe active se règlent sur le plan sélectionné (interface ; `modifierPlanDeCoupe`).
 */
import { type Id, modifierAnnotations } from "../geometrie-libre.js";
import { type Inference, COULEURS, geometrieVisible, inferer } from "../inference.js";
import { type Vec3, AXE_X, AXE_Y, AXE_Z, add, dot, normalize, scale, sub } from "../vecteur.js";
import { axesDuPlan, contexteSaisie, mesures, messageErreur } from "./commun-formes.js";
import { consigneDe, vueModif } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Touche, Transition, VueOutil } from "./machine.js";
import type { PlanDeCoupe } from "../annotations.js";

export const ID_PLAN_DE_COUPE = "plan-de-coupe";

export interface ApercuPlan {
  readonly origine: Vec3;
  readonly normale: Vec3;
  readonly u: Vec3;
  readonly w: Vec3;
  readonly demiU: number;
  readonly demiW: number;
}

export interface EtatPlanDeCoupe {
  readonly inference: Inference | null;
  readonly apercu: ApercuPlan | null;
  readonly fleche: Touche | null;
  readonly verrouMaj: ApercuPlan | null;
  readonly erreur: string | null;
}

const initial = (): EtatPlanDeCoupe => ({ inference: null, apercu: null, fleche: null, verrouMaj: null, erreur: null });

/** Rectangle du plan : étendue de la face visée dans son plan, sinon 1 m autour du point. */
function apercuSurFace(ctx: ContexteOutil, i: Inference): ApercuPlan {
  const g = geometrieVisible(ctx.modele);
  const f = i.type === "sur-face" && i.entite !== undefined ? g.faces.find((x) => x.id === i.entite) : undefined;
  const normale = normalize(f ? f.normale : AXE_Z);
  const { u, w } = axesDuPlan(normale);
  if (!f) return { origine: i.point, normale, u, w, demiU: 1, demiW: 1 };
  let minU = Infinity, maxU = -Infinity, minW = Infinity, maxW = -Infinity;
  for (const p of f.exterieur) {
    const du = dot(sub(p, i.point), u);
    const dw = dot(sub(p, i.point), w);
    minU = Math.min(minU, du);
    maxU = Math.max(maxU, du);
    minW = Math.min(minW, dw);
    maxW = Math.max(maxW, dw);
  }
  const centre = add(i.point, add(scale(u, (minU + maxU) / 2), scale(w, (minW + maxW) / 2)));
  return { origine: centre, normale, u, w, demiU: Math.max(0.05, (maxU - minU) / 2 + 0.05), demiW: Math.max(0.05, (maxW - minW) / 2 + 0.05) };
}

function apercuDe(etat: EtatPlanDeCoupe, ctx: ContexteOutil, i: Inference): ApercuPlan {
  if (etat.verrouMaj) return { ...etat.verrouMaj, origine: i.point };
  const axe = etat.fleche === "FlecheDroite" ? AXE_X : etat.fleche === "FlecheGauche" ? AXE_Y : etat.fleche === "FlecheHaut" ? AXE_Z : null;
  if (axe) {
    const { u, w } = axesDuPlan(axe);
    return { origine: i.point, normale: axe, u, w, demiU: 1, demiW: 1 };
  }
  return apercuSurFace(ctx, i);
}

export function couleurPlan(n: Vec3): string {
  const a = Math.abs(n.x), b = Math.abs(n.y), c = Math.abs(n.z);
  if (a > 0.99) return COULEURS["axe-x"];
  if (b > 0.99) return COULEURS["axe-y"];
  if (c > 0.99) return COULEURS["axe-z"];
  return "#555555";
}

/** Inverser / Coupe active / nom d'un plan de coupe existant (interface). */
export function modifierPlanDeCoupe(ctx: ContexteOutil, id: Id, patch: Partial<Pick<PlanDeCoupe, "actif" | "inverse" | "nom">>): Transition<unknown> {
  const existant = ctx.modele.annotations?.plansDeCoupe[id];
  if (!existant) return { etat: null };
  const r = modifierAnnotations(ctx.modele, (a) => {
    a.plansDeCoupe[id] = { ...existant, ...patch };
  });
  return { etat: null, modele: r.modele, selection: ctx.selection, operation: patch.inverse !== undefined ? "Inverser la coupe" : patch.actif !== undefined ? (patch.actif ? "Coupe active" : "Coupe inactive") : "Plan de coupe" };
}

export const machinePlanDeCoupe: MachineOutil<EtatPlanDeCoupe> = {
  id: ID_PLAN_DE_COUPE,
  initial,

  traiter(etat, ev, ctx): Transition<EtatPlanDeCoupe> {
    switch (ev.genre) {
      case "survol": {
        const i = inferer({ rayon: ev.rayon, tolerance: ev.tolerance, geometrie: geometrieVisible(ctx.modele), ...(ctx.repere ? { axes: ctx.repere } : {}) });
        return { etat: { ...etat, inference: i, apercu: apercuDe(etat, ctx, i), erreur: null } };
      }
      case "clic": {
        const i = inferer({ rayon: ev.rayon, tolerance: ev.tolerance, geometrie: geometrieVisible(ctx.modele), ...(ctx.repere ? { axes: ctx.repere } : {}) });
        const a = apercuDe(etat, ctx, i);
        try {
          const r = modifierAnnotations(ctx.modele, (an, id) => {
            const p = id("p");
            const n = Object.keys(an.plansDeCoupe).length + 1;
            an.plansDeCoupe[p] = { id: p, origine: a.origine, normale: a.normale, u: a.u, w: a.w, demiU: a.demiU, demiW: a.demiW, actif: true, inverse: false, nom: `Plan de coupe ${n}` };
            return p;
          });
          return { etat: initial(), modele: r.modele, selection: [r.extra], operation: "Plan de coupe", outil: "selection" };
        } catch (err) {
          return { etat: { ...etat, erreur: messageErreur(err) } };
        }
      }
      case "touche": {
        const t = ev.touche;
        if (t === "Maj") {
          if (ev.etat === "relachee") return { etat: { ...etat, verrouMaj: null } };
          return { etat: { ...etat, verrouMaj: etat.apercu } };
        }
        if (ev.etat !== "enfoncee") return { etat };
        if (t === "FlecheDroite" || t === "FlecheGauche" || t === "FlecheHaut" || t === "FlecheBas") {
          const fleche = etat.fleche === t ? null : t;
          const e2 = { ...etat, fleche };
          return { etat: etat.inference ? { ...e2, apercu: apercuDe(e2, ctx, etat.inference) } : e2 };
        }
        return { etat };
      }
      case "saisie":
        return { etat: { ...etat, erreur: "Le champ Mesures n'est pas utilisé par l'outil Plan de coupe." } };
      case "echap":
        return { etat: { ...initial(), inference: etat.inference } };
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const a = etat.apercu;
    return vueModif({
      consigne: consigneDe(ID_PLAN_DE_COUPE, 0),
      mesures: mesures(null, "", contexteSaisie("aucune", ctx)),
      inference: etat.inference,
      apercu: { lignes: [], faces: [], ...(a ? { plan: { ...a, couleur: couleurPlan(a.normale) } } : {}) } as VueOutil["apercu"],
      ctx,
      erreur: etat.erreur,
    });
  },
};
