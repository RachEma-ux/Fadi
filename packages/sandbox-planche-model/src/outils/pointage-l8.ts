/**
 * Cas 2 du catalogue, lot 8 — outils de pointage (machines pures) lancés par les commandes des panneaux du lot 8 ; les
 * réglages se font dans la vue plutôt que par des listes ou des commandes ajoutées :
 * - Caler par deux points (n° 50) : A, B sur l'objet, puis A', B' cibles ; translation, rotation et échelle uniforme
 *   calculées, un pas ;
 * - Boîte 3D (n° 100) : deux coins opposés à plat ; les altitudes saisies bornent la hauteur, sinon un troisième clic
 *   (ou une hauteur tapée au champ Mesures) la donne ;
 * - Miroir lisible (n° 104) : deux points de l'axe du miroir (plan vertical passant par eux) ;
 * - Pose d'une baie dans un mur plein (n° 79) : un clic sur le mur donne le milieu de la largeur, l'allège est saisie ;
 * - Pose d'un garde-corps (n° 61) : deux clics, ses extrémités (une longueur saisie l'emporte, dans la direction cliquée).
 * Chaque point est accroché comme pour les autres outils ; Échap annule et rend la Sélection.
 */
import { calerParDeuxPoints, boiteDeCoins, miroirLisible, objetsDansBoite, ErreurL8 } from "../modelisation-l8.js";
import { poserComposant } from "../composants-l8.js";
import { type Inference, geometrieVisible, inferer } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, normalize } from "../vecteur.js";
import { appliquer, contexte, matriceMonde, positionsFace, transformerNormale } from "../geometrie-libre.js";
import { intersectionPlanDeTravail } from "../reperes.js";
import { axesDeSaisie, mesures, contexteSaisie } from "./commun-formes.js";
import { vueModif } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";

export const ID_CALER = "pointage-caler";
export const ID_BOITE = "pointage-boite";
export const ID_MIROIR = "pointage-miroir";
export const ID_POSER_BAIE = "pointage-baie";
export const ID_POSER_GARDE_CORPS = "pointage-garde-corps";
/** Outils de pointage du lot 8 (hors catalogue, lancés par leur commande). */
export const IDS_POINTAGE_L8: readonly string[] = [ID_CALER, ID_BOITE, ID_MIROIR, ID_POSER_BAIE, ID_POSER_GARDE_CORPS];

export interface EtatPointage {
  readonly points: readonly Vec3[];
  readonly inference: Inference | null;
  readonly erreur: string | null;
}

const initial = (): EtatPointage => ({ points: [], inference: null, erreur: null });

function viser(ctx: ContexteOutil, rayon: Rayon, tolerance: number, depart?: Vec3): Inference {
  return inferer({ rayon, tolerance, geometrie: geometrieVisible(ctx.modele), ...(depart ? { depart } : {}), ...axesDeSaisie(ctx) });
}

export const CONSIGNES_CALER = [
  "Cliquez le premier point de l'objet (A).",
  "Cliquez le second point de l'objet (B).",
  "Cliquez la cible du premier point (A').",
  "Cliquez la cible du second point (B') : l'objet est calé.",
] as const;
export const CONSIGNES_BOITE = ["Cliquez un coin de la boîte.", "Cliquez le coin opposé : les objets compris sont sélectionnés."] as const;
export const CONSIGNES_BOITE_HAUTEUR = ["Cliquez un coin de la boîte.", "Cliquez le coin opposé, à plat.", "Cliquez la hauteur de la boîte, ou tapez-la : les objets compris sont sélectionnés."] as const;
export const CONSIGNES_MIROIR = ["Cliquez un point de l'axe du miroir.", "Cliquez un second point de l'axe : la sélection est retournée, textes et cotes restent lisibles."] as const;
export const CONSIGNES_BAIE = ["Cliquez sur le mur le milieu de la baie : l'allège saisie en donne la hauteur."] as const;
export const CONSIGNES_GARDE_CORPS = ["Cliquez le début du garde-corps.", "Cliquez sa fin (une longueur saisie l'emporte) : le garde-corps est posé."] as const;
export const ERREUR_CALER_SELECTION = "Sélectionnez d'abord l'objet à caler.";
export const ERREUR_MIROIR_SELECTION = "Sélectionnez d'abord ce qu'il faut retourner.";
export const ERREUR_POSE_SANS_COMPOSANT = "Choisissez d'abord le composant au panneau « Composants dynamiques ».";

interface Regles {
  readonly consignes: (ctx: ContexteOutil) => readonly string[];
  /** Message si l'outil ne peut pas commencer (sélection ou composant absent). */
  readonly prealable?: (ctx: ContexteOutil) => string | null;
  /** Saisie au champ Mesures à la dernière étape (hauteur de la boîte). */
  readonly saisie?: { readonly libelle: string; readonly valeur: (pts: readonly Vec3[], ctx: ContexteOutil, texte: number) => readonly Vec3[] };
  readonly fin: (pts: readonly Vec3[], ctx: ContexteOutil) => Transition<EtatPointage>;
  /** Plan visé (monde) : le point est pris sur ce plan, pas sur la géométrie devant lui (mur choisi). */
  readonly plan?: (ctx: ContexteOutil) => { readonly origine: Vec3; readonly normale: Vec3 } | null;
}

function machine(id: string, r: Regles): MachineOutil<EtatPointage> {
  const point = (ctx: ContexteOutil, rayon: Rayon, tolerance: number, depart?: Vec3): Inference => {
    const inf = viser(ctx, rayon, tolerance, depart);
    const pl = r.plan?.(ctx) ?? null;
    const p = pl ? intersectionPlanDeTravail(rayon.origine, rayon.direction, pl) : null;
    return p ? { ...inf, point: p } : inf;
  };
  const terminer = (etat: EtatPointage, points: readonly Vec3[], ctx: ContexteOutil): Transition<EtatPointage> => {
    if (points.length < r.consignes(ctx).length) return { etat: { ...etat, points, erreur: null } };
    try {
      return r.fin(points, ctx);
    } catch (e) {
      return { etat: { ...initial(), erreur: e instanceof Error ? e.message : String(e) } };
    }
  };
  return {
    id,
    initial,
    traiter(etat, ev, ctx): Transition<EtatPointage> {
      switch (ev.genre) {
        case "survol":
          return { etat: { ...etat, inference: point(ctx, ev.rayon, ev.tolerance, etat.points[etat.points.length - 1]) } };
        case "clic": {
          const motif = r.prealable?.(ctx) ?? null;
          if (motif) return { etat: { ...etat, erreur: motif } };
          const p = point(ctx, ev.rayon, ev.tolerance, etat.points[etat.points.length - 1]).point;
          return terminer(etat, [...etat.points, p], ctx);
        }
        case "saisie": {
          if (!r.saisie || etat.points.length !== r.consignes(ctx).length - 1) return { etat };
          const res = analyserSaisie(ev.texte, contexteSaisie("longueur", ctx));
          if (res.genre !== "longueur") return { etat: { ...etat, erreur: res.genre === "erreur" ? res.message : `Saisie « ${ev.texte} » non reconnue.` } };
          return terminer(etat, r.saisie.valeur(etat.points, ctx, res.valeur), ctx);
        }
        case "echap":
          return etat.points.length ? { etat: initial() } : { etat: initial(), outil: "selection" };
        default:
          return { etat };
      }
    },
    vue(etat, ctx): VueOutil {
      const pts = etat.points;
      const consignes = r.consignes(ctx);
      const lignes: Vec3[][] = [];
      const curseur = etat.inference?.point ?? null;
      if (id === ID_CALER) {
        if (pts.length >= 2) lignes.push([pts[0]!, pts[1]!]);
        if (pts.length >= 3) lignes.push([pts[0]!, pts[2]!]);
        if (pts.length === 3 && curseur) lignes.push([pts[2]!, curseur], [pts[1]!, curseur]);
        else if (pts.length && curseur) lignes.push([pts[pts.length - 1]!, curseur]);
      } else if (id === ID_BOITE && pts.length >= 1) {
        const a = pts[0]!;
        const b = pts[1] ?? curseur;
        if (b) lignes.push([a, { x: b.x, y: a.y, z: a.z }, { x: b.x, y: b.y, z: a.z }, { x: a.x, y: b.y, z: a.z }, a]);
        if (pts.length === 2 && curseur) lignes.push([pts[1]!, { x: pts[1]!.x, y: pts[1]!.y, z: curseur.z }]);
      } else if (pts.length && curseur) lignes.push([pts[pts.length - 1]!, curseur]);
      const derniere = pts.length === consignes.length - 1;
      const v = vueModif({
        consigne: consignes[Math.min(pts.length, consignes.length - 1)]!,
        mesures: mesures(r.saisie && derniere ? r.saisie.libelle : "Mesures", "", contexteSaisie(r.saisie && derniere ? "longueur" : "aucune", ctx)),
        inference: etat.inference,
        apercu: { lignes, faces: [] },
        ctx,
        erreur: etat.erreur,
      });
      return { ...v, references: pts };
    },
  };
}

const dans = (ctx: ContexteOutil) => (ctx.dans !== undefined ? { dans: ctx.dans } : {});

export const MACHINE_CALER = machine(ID_CALER, {
  consignes: () => CONSIGNES_CALER,
  prealable: (ctx) => (ctx.selection.length === 0 ? ERREUR_CALER_SELECTION : null),
  fin: (pts, ctx) => {
    const r = calerParDeuxPoints(ctx.modele, ctx.selection, [pts[0]!, pts[1]!, pts[2]!, pts[3]!], { echelle: true, ...dans(ctx) });
    return { etat: initial(), modele: r.modele, selection: ctx.selection, operation: "Caler par deux points", outil: "selection" };
  },
});

export const MACHINE_BOITE = machine(ID_BOITE, {
  consignes: (ctx) => (ctx.altitudesBoite ? CONSIGNES_BOITE : CONSIGNES_BOITE_HAUTEUR),
  // Hauteur tapée : comptée depuis le premier coin, vers le haut (négative : vers le bas).
  saisie: { libelle: "Hauteur", valeur: (pts, _ctx, h) => [...pts, { ...pts[1]!, z: pts[0]!.z + h }] },
  fin: (pts, ctx) => {
    let altitudes = ctx.altitudesBoite ?? null;
    if (!altitudes) {
      const z0 = pts[0]!.z, z1 = pts[2]!.z;
      if (Math.abs(z1 - z0) <= 1e-9) throw new ErreurL8("hauteur-boite");
      altitudes = { zmin: Math.min(z0, z1), zmax: Math.max(z0, z1) };
    }
    const ids = objetsDansBoite(ctx.modele, boiteDeCoins(pts[0]!, pts[1]!, altitudes));
    if (ids.length === 0) throw new ErreurL8("selection-vide");
    return { etat: initial(), selection: ids, outil: "selection" };
  },
});

export const MACHINE_MIROIR = machine(ID_MIROIR, {
  consignes: () => CONSIGNES_MIROIR,
  prealable: (ctx) => (ctx.lecture ? null : ctx.selection.length === 0 ? ERREUR_MIROIR_SELECTION : null),
  fin: (pts, ctx) => {
    if (ctx.lecture) return { etat: initial(), outil: "selection" };
    const r = miroirLisible(ctx.modele, ctx.selection, { a: pts[0]!, b: pts[1]! }, dans(ctx));
    return { etat: initial(), modele: r.modele, selection: ctx.selection, operation: "Miroir lisible", outil: "selection" };
  },
});

const poser = (pts: readonly Vec3[], ctx: ContexteOutil, cible: { readonly face?: string; readonly point?: Vec3; readonly segment?: { readonly a: Vec3; readonly b: Vec3 } }): Transition<EtatPointage> => {
  const p = ctx.poseComposant;
  if (!p) throw new Error(ERREUR_POSE_SANS_COMPOSANT);
  if (ctx.lecture) return { etat: initial(), outil: "selection" };
  const r = poserComposant(ctx.modele, p.pose, { ...cible, ...dans(ctx) });
  void pts;
  return { etat: initial(), modele: r.modele, selection: [r.occurrence], operation: "Ajuster à la baie", outil: "selection" };
};

/** Plan (monde) de la face visée par la pose d'une baie. */
function planFace(ctx: ContexteOutil): { readonly origine: Vec3; readonly normale: Vec3 } | null {
  const id = ctx.poseComposant?.face;
  const c = contexte(ctx.modele, ctx.dans);
  const f = id ? c.faces[id] : undefined;
  if (!f) return null;
  const M = ctx.dans !== undefined ? matriceMonde(ctx.modele, ctx.dans) : null;
  const p0 = positionsFace(c, f).exterieur[0]!;
  return { origine: M ? appliquer(M, p0) : p0, normale: normalize(M ? transformerNormale(M, f.normale) : f.normale) };
}

export const MACHINE_POSER_BAIE = machine(ID_POSER_BAIE, {
  consignes: () => CONSIGNES_BAIE,
  plan: planFace,
  prealable: (ctx) => (ctx.poseComposant?.face ? null : ERREUR_POSE_SANS_COMPOSANT),
  fin: (pts, ctx) => poser(pts, ctx, { face: ctx.poseComposant!.face!, point: pts[0]! }),
});

export const MACHINE_POSER_GARDE_CORPS = machine(ID_POSER_GARDE_CORPS, {
  consignes: () => CONSIGNES_GARDE_CORPS,
  prealable: (ctx) => (ctx.poseComposant ? null : ERREUR_POSE_SANS_COMPOSANT),
  fin: (pts, ctx) => poser(pts, ctx, { segment: { a: pts[0]!, b: pts[1]! } }),
});

export const MACHINES_POINTAGE_L8: readonly MachineOutil<EtatPointage>[] = [MACHINE_CALER, MACHINE_BOITE, MACHINE_MIROIR, MACHINE_POSER_BAIE, MACHINE_POSER_GARDE_CORPS];
