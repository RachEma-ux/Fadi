/**
 * Cas 2 du catalogue, lot 8 — outils de pointage (machines pures) lancés par les commandes du panneau « Soustraire et
 * garder » : Caler par deux points (n° 50 : A, B sur l'objet, puis A', B' cibles ; translation, rotation et échelle
 * uniforme calculées, un pas) et Boîte 3D (n° 100 : deux coins opposés ; tracée à plat, les altitudes saisies bornent la
 * hauteur). Chaque point est accroché comme pour les autres outils ; Échap annule et rend la Sélection.
 */
import { calerParDeuxPoints, boiteDeCoins, objetsDansBoite, ErreurL8 } from "../modelisation-l8.js";
import { type Inference, geometrieVisible, inferer } from "../inference.js";
import type { Vec3 } from "../vecteur.js";
import { axesDeSaisie, mesures, contexteSaisie } from "./commun-formes.js";
import { vueModif } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";

export const ID_CALER = "pointage-caler";
export const ID_BOITE = "pointage-boite";

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
export const ERREUR_CALER_SELECTION = "Sélectionnez d'abord l'objet à caler.";

function machine(id: string, consignes: readonly string[], fin: (pts: readonly Vec3[], ctx: ContexteOutil) => Transition<EtatPointage>): MachineOutil<EtatPointage> {
  return {
    id,
    initial,
    traiter(etat, ev, ctx): Transition<EtatPointage> {
      switch (ev.genre) {
        case "survol":
          return { etat: { ...etat, inference: viser(ctx, ev.rayon, ev.tolerance, etat.points[etat.points.length - 1]) } };
        case "clic": {
          if (id === ID_CALER && ctx.selection.length === 0) return { etat: { ...etat, erreur: ERREUR_CALER_SELECTION } };
          const p = viser(ctx, ev.rayon, ev.tolerance, etat.points[etat.points.length - 1]).point;
          const points = [...etat.points, p];
          if (points.length < consignes.length) return { etat: { ...etat, points, erreur: null } };
          try {
            return fin(points, ctx);
          } catch (e) {
            return { etat: { ...initial(), erreur: e instanceof Error ? e.message : String(e) } };
          }
        }
        case "echap":
          return etat.points.length ? { etat: initial() } : { etat: initial(), outil: "selection" };
        default:
          return { etat };
      }
    },
    vue(etat, ctx): VueOutil {
      const pts = etat.points;
      const lignes: Vec3[][] = [];
      if (id === ID_CALER) {
        if (pts.length >= 2) lignes.push([pts[0]!, pts[1]!]);
        if (pts.length >= 3) lignes.push([pts[0]!, pts[2]!]);
        if (pts.length === 3 && etat.inference) lignes.push([pts[2]!, etat.inference.point], [pts[1]!, etat.inference.point]);
        else if (pts.length && etat.inference) lignes.push([pts[pts.length - 1]!, etat.inference.point]);
      } else if (pts.length === 1 && etat.inference) {
        const a = pts[0]!, b = etat.inference.point;
        lignes.push([a, { x: b.x, y: a.y, z: a.z }, { x: b.x, y: b.y, z: a.z }, { x: a.x, y: b.y, z: a.z }, a], [a, b]);
      }
      const v = vueModif({
        consigne: consignes[Math.min(pts.length, consignes.length - 1)]!,
        mesures: mesures("Mesures", "", contexteSaisie("aucune", ctx)),
        inference: etat.inference,
        apercu: { lignes, faces: [] },
        ctx,
        erreur: etat.erreur,
      });
      return { ...v, references: pts };
    },
  };
}

export const MACHINE_CALER = machine(ID_CALER, CONSIGNES_CALER, (pts, ctx) => {
  const r = calerParDeuxPoints(ctx.modele, ctx.selection, [pts[0]!, pts[1]!, pts[2]!, pts[3]!], { echelle: true, ...(ctx.dans !== undefined ? { dans: ctx.dans } : {}) });
  return { etat: initial(), modele: r.modele, selection: ctx.selection, operation: "Caler par deux points", outil: "selection" };
});

export const MACHINE_BOITE = machine(ID_BOITE, CONSIGNES_BOITE, (pts, ctx) => {
  const b = boiteDeCoins(pts[0]!, pts[1]!, ctx.altitudesBoite ?? null);
  const ids = objetsDansBoite(ctx.modele, b);
  if (ids.length === 0) throw new ErreurL8("selection-vide");
  return { etat: initial(), selection: ids, outil: "selection" };
});

export const MACHINES_POINTAGE_L8: readonly MachineOutil<EtatPointage>[] = [MACHINE_CALER, MACHINE_BOITE];
