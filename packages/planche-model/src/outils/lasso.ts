/**
 * Outil Lasso (cahier-planche §4.2, relevé outils-dessin §2) — machine d'états pure.
 *
 * Mode polygonal (obs) : clics successifs = sommets à l'écran ; le double-clic ferme le contour et applique.
 * Contour libre (instr) : appuyer, glisser, relâcher. Sens HORAIRE à l'écran = fenêtre (entièrement inclus),
 * ANTI-HORAIRE = croisée (touché) — le relevé fait foi contre [DOC §1.2]. Le rendu fournit les ids par
 * `ctx.entitesDansContour`. Modificateurs comme la Sélection (Maj, Ctrl, Maj + Ctrl, maintenus).
 * Clic simple sur un objet « comme Sélection » : interprété comme un contour fermé avec moins de trois sommets
 * distincts (clic puis double-clic au même endroit) → sélection de l'objet visé.
 * Échap avant fermeture : aucun changement de sélection.
 */
import type { Id } from "../geometrie-libre.js";
import type { EvenementOutil, MachineOutil, Transition, VueOutil } from "./machine.js";
import {
  type Point2,
  SEUIL_GLISSER,
  clicSelection,
  combiner,
  distance2,
  etapeCatalogue,
  mesuresVides,
  normaliserIds,
} from "./selection.js";

export interface EtatLasso {
  readonly maj: boolean;
  readonly ctrl: boolean;
  /** Sommets du contour à l'écran (pixels). */
  readonly points: readonly Point2[];
  /** Position écran courante du pointeur (élastique). */
  readonly curseur: Point2 | null;
  readonly appui: Point2 | null;
  /** Contour libre en cours (cliquer-glisser). */
  readonly libre: boolean;
  readonly ignorerClic: boolean;
}

/** Aire signée à l'écran (y vers le bas) : > 0 ⇔ sens horaire visuel. */
export function aireEcran(p: readonly Point2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i] as Point2;
    const b = p[(i + 1) % p.length] as Point2;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const genreContour = (p: readonly Point2[]): "fenetre" | "croisee" => (aireEcran(p) > 0 ? "fenetre" : "croisee");

function distincts(p: readonly Point2[]): Point2[] {
  const r: Point2[] = [];
  for (const x of p) if (!r.some((y) => distance2(x, y) <= 1)) r.push(x);
  return r;
}

const repos = (etat: EtatLasso): EtatLasso => ({ ...etat, points: [], appui: null, libre: false });

function appliquerContour(etat: EtatLasso, points: readonly Point2[], ctx: Parameters<MachineOutil<EtatLasso>["traiter"]>[2]): Transition<EtatLasso> {
  const genre = genreContour(points);
  const bruts = ctx.entitesDansContour?.(points, genre) ?? [];
  const ids: Id[] = normaliserIds(ctx.modele, ctx.dans, bruts, genre);
  return { etat: repos(etat), selection: combiner(ctx.selection, ids, etat) };
}

export const machineLasso: MachineOutil<EtatLasso> = {
  id: "lasso",
  initial: () => ({ maj: false, ctrl: false, points: [], curseur: null, appui: null, libre: false, ignorerClic: false }),

  traiter(etat, ev: EvenementOutil, ctx): Transition<EtatLasso> {
    switch (ev.genre) {
      case "touche": {
        const bas = ev.etat === "enfoncee";
        if (ev.touche === "Maj") return { etat: { ...etat, maj: bas } };
        if (ev.touche === "Ctrl") return { etat: { ...etat, ctrl: bas } };
        return { etat };
      }
      case "survol":
        return { etat: { ...etat, curseur: ev.ecran ?? etat.curseur, ignorerClic: false } };
      case "appui":
        return { etat: { ...etat, appui: ev.ecran, curseur: ev.ecran, ignorerClic: false } };
      case "glisser": {
        if (!etat.appui || (etat.points.length > 0 && !etat.libre)) return { etat: { ...etat, curseur: ev.ecran } };
        if (!etat.libre) {
          if (distance2(etat.appui, ev.ecran) <= SEUIL_GLISSER) return { etat };
          return { etat: { ...etat, libre: true, points: [etat.appui, ev.ecran], curseur: ev.ecran } };
        }
        const dernier = etat.points[etat.points.length - 1];
        const points = dernier && distance2(dernier, ev.ecran) < 2 ? etat.points : [...etat.points, ev.ecran];
        return { etat: { ...etat, points, curseur: ev.ecran } };
      }
      case "relache": {
        if (!etat.libre) return { etat: { ...etat, appui: null } };
        const pts = distincts([...etat.points, ev.ecran]);
        const t = pts.length >= 3 ? appliquerContour(etat, pts, ctx) : { etat: repos(etat) };
        return { ...t, etat: { ...t.etat, ignorerClic: true } };
      }
      case "clic": {
        if (etat.ignorerClic) return { etat: { ...etat, ignorerClic: false } };
        const p = ev.ecran ?? etat.appui ?? etat.curseur;
        if (ev.double) {
          const pts = distincts(p ? [...etat.points, p] : etat.points);
          if (pts.length >= 3) return appliquerContour(etat, pts, ctx);
          // Pas de contour : clic sur un objet, comme la Sélection.
          return clicSelection(repos(etat), { ...ev, double: false }, ctx, etat);
        }
        if (!p) return { etat };
        return { etat: { ...etat, points: [...etat.points, p], curseur: p } };
      }
      case "echap":
        return { etat: repos(etat) };
      case "saisie":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const e = etapeCatalogue("lasso", etat.points.length > 0 ? 1 : 0);
    const pts = etat.curseur && etat.points.length > 0 && !etat.libre ? [...etat.points, etat.curseur] : etat.points;
    return {
      consigne: e.consigne ?? "",
      mesures: mesuresVides(e, ctx),
      inference: null,
      apercu: {
        lignes: [],
        faces: [],
        ...(pts.length > 0 ? { contour: { points: pts, genre: genreContour(pts) } } : {}),
      },
      selection: ctx.selection,
      survol: [],
      erreur: null,
    };
  },
};
