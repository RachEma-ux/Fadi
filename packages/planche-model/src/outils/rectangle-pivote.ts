/**
 * Machine Rectangle pivoté / tourné (cahier-planche §4.7, relevé outils-dessin §6).
 *
 * - 3 clics : coin 1 (plan inféré : face survolée, sinon sol ; flèches avant le clic = axe du rapporteur) ;
 *   coin 2 (1er côté dans ce plan : longueur et angle depuis la ligne de base du rapporteur, l'axe rouge projeté) ;
 *   coin 3 (largeur et angle du 2e côté autour du 1er). Face créée ; l'outil reste actif.
 * - Saisies : étape 2 « Longueur, angle » (`3` seul accepté), étape 3 « Largeur, angle » (`2;90`).
 * - Angle du 2e côté : mesuré depuis la normale du plan de départ, autour du 1er côté ; 90° = dans le plan de
 *   départ, à gauche du 1er côté (CA-RTO-1 : `2;90` → rectangle posé au sol). Le relevé affiche « 0,0 » au
 *   survol de l'étape 3 : la référence exacte de l'angle affiché n'est pas établie (écart signalé).
 * - Après la création : « Dimensions » `3,00 m ; 2,00 m`.
 * - Alt (plan / ligne de base du rapporteur), Maj, cliquer-glisser : textes relevés, effets non vérifiés — non
 *   implémentés.
 */
import { ajouterRectangle } from "../geometrie-libre.js";
import type { Inference } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, AXE_Z, ORIGINE, TOL, add, cross, dot, len, normalize, scale, sub, tourner } from "../vecteur.js";
import {
  APERCU_VIDE,
  angleSigne,
  axeDeFleche,
  axesDuPlan,
  contexteSaisie,
  estFleche,
  etape,
  fermer,
  formaterAngle,
  formaterLongueur,
  marquerContraint,
  mesures,
  messageErreur,
  outil,
  prefixe,
  sepListe,
  viserLibre,
  viserSurPlan,
  vue,
} from "./commun-formes.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Touche, Transition, VueOutil } from "./machine.js";

export const ID_RECTANGLE_PIVOTE = "rectangle-pivote";
const DEG = Math.PI / 180;

export interface EtatRectanglePivote {
  readonly etape: 1 | 2 | 3;
  readonly verrouFleche: { readonly normale: Vec3; readonly touche: Touche } | null;
  readonly normaleSurvol: Vec3;
  readonly p1: Vec3 | null;
  readonly normale: Vec3;
  /** Ligne de base du rapporteur (dans le plan). */
  readonly base: Vec3;
  /** 1er côté : longueur signée et angle (radians) depuis la base ; vecteur figé après l'étape 2. */
  readonly longueur: number | null;
  readonly angle1: number | null;
  readonly cote1: Vec3 | null;
  /** 2e côté : largeur et angle (radians) depuis la normale autour du 1er côté. */
  readonly largeur: number | null;
  readonly angle2: number | null;
  readonly inference: Inference | null;
  readonly texte: string | null;
  readonly erreur: string | null;
  readonly dimensions: readonly [number, number] | null;
}

function initial(): EtatRectanglePivote {
  return {
    etape: 1,
    verrouFleche: null,
    normaleSurvol: AXE_Z,
    p1: null,
    normale: AXE_Z,
    base: axesDuPlan(AXE_Z).u,
    longueur: null,
    angle1: null,
    cote1: null,
    largeur: null,
    angle2: null,
    inference: null,
    texte: null,
    erreur: null,
    dimensions: null,
  };
}

const retour = (e: EtatRectanglePivote): EtatRectanglePivote => ({
  ...e,
  etape: 1,
  p1: null,
  longueur: null,
  angle1: null,
  cote1: null,
  largeur: null,
  angle2: null,
});

/** Vecteur du 1er côté : base tournée de `angle` autour de la normale, longueur `l`. */
export function premierCote(base: Vec3, normale: Vec3, l: number, angle: number): Vec3 {
  return scale(tourner(base, ORIGINE, normale, angle), l);
}

/** Vecteur du 2e côté : cos α · n + sin α · (n × d1), largeur `w`. */
export function secondCote(cote1: Vec3, normale: Vec3, w: number, alpha: number): Vec3 {
  const n = normalize(normale);
  const perp = normalize(cross(n, normalize(cote1)));
  return scale(add(scale(n, Math.cos(alpha)), scale(perp, Math.sin(alpha))), w);
}

function creer(etat: EtatRectanglePivote, ctx: ContexteOutil, cote2: Vec3, texte: string | null): Transition<EtatRectanglePivote> {
  const p1 = etat.p1 as Vec3;
  const cote1 = etat.cote1 as Vec3;
  if (len(cote2) < TOL) return { etat: { ...etat, texte, erreur: "La largeur doit être non nulle." } };
  try {
    const r = ajouterRectangle(ctx.modele, p1, cote1, cote2);
    return {
      etat: { ...retour(etat), texte, erreur: null, dimensions: [len(cote1), len(cote2)] },
      modele: r.modele,
      operation: outil(ID_RECTANGLE_PIVOTE).libelle,
    };
  } catch (e) {
    return { etat: { ...etat, texte, erreur: messageErreur(e) } };
  }
}

function traiter(etat0: EtatRectanglePivote, ev: EvenementOutil, ctx: ContexteOutil): Transition<EtatRectanglePivote> {
  const etat: EtatRectanglePivote = { ...etat0, erreur: null };
  switch (ev.genre) {
    case "survol":
    case "clic": {
      if (etat.etape === 1) {
        const { inference, normale } = viserLibre(ctx, ev);
        const verrou = etat.verrouFleche?.normale ?? null;
        const inf = verrou ? marquerContraint(inference) : inference;
        if (ev.genre === "survol") return { etat: { ...etat, inference: inf, normaleSurvol: normale } };
        const n = normalize(verrou ?? normale);
        return {
          etat: { ...retour(etat), etape: 2, p1: inf.point, normale: n, base: axesDuPlan(n).u, inference: inf, texte: null, dimensions: null },
        };
      }
      const p1 = etat.p1 as Vec3;
      if (etat.etape === 2) {
        const inf = viserSurPlan(ctx, ev, { origine: p1, normale: etat.normale }, p1, etat.verrouFleche !== null);
        const v = sub(inf.point, p1);
        const l = len(v);
        const angle1 = l > TOL ? angleSigne(etat.base, v, etat.normale) : etat.angle1;
        const suivant: EtatRectanglePivote = { ...etat, inference: inf, longueur: l, angle1, texte: null };
        if (ev.genre === "survol" || l <= TOL) return { etat: suivant };
        return { etat: { ...suivant, etape: 3, cote1: v, largeur: null, angle2: null } };
      }
      const cote1 = etat.cote1 as Vec3;
      const coin2 = add(p1, cote1);
      const { inference } = viserLibre(ctx, ev, coin2);
      const d1 = normalize(cote1);
      const q = sub(inference.point, coin2);
      const r = sub(q, scale(d1, dot(q, d1)));
      const largeur = len(r);
      const perp = normalize(cross(etat.normale, d1));
      const angle2 = largeur > TOL ? Math.atan2(dot(r, perp), dot(r, etat.normale)) : etat.angle2;
      const suivant: EtatRectanglePivote = { ...etat, inference, largeur, angle2, texte: null };
      if (ev.genre === "survol" || largeur <= TOL || angle2 === null) return { etat: suivant };
      return creer(suivant, ctx, secondCote(cote1, etat.normale, largeur, angle2), null);
    }
    case "touche": {
      if (ev.etat !== "enfoncee") return { etat };
      const t = ev.touche;
      if (etat.etape === 1 && estFleche(t)) {
        if (etat.verrouFleche?.touche === t) return { etat: { ...etat, verrouFleche: null } };
        return { etat: { ...etat, verrouFleche: { normale: axeDeFleche(t) ?? etat.normaleSurvol, touche: t } } };
      }
      return { etat };
    }
    case "saisie": {
      const texte = ev.texte;
      if (etat.etape === 1) return { etat: { ...etat, texte, erreur: "Cliquez d'abord pour placer le premier coin." } };
      const r = analyserSaisie(texte, contexteSaisie("longueur-angle", ctx));
      if (r.genre === "erreur") return { etat: { ...etat, texte, erreur: r.message } };
      if (r.genre !== "longueur-angle") return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
      if (etat.etape === 2) {
        const l = r.longueur ?? etat.longueur;
        if (l === null || Math.abs(l) < TOL) return { etat: { ...etat, texte, erreur: "La longueur doit être non nulle." } };
        const a = r.angle ? r.angle.radians : (etat.angle1 ?? 0);
        const cote1 = premierCote(etat.base, etat.normale, l, a);
        return { etat: { ...etat, etape: 3, longueur: Math.abs(l), angle1: a, cote1, largeur: null, angle2: null, texte } };
      }
      const w = r.longueur ?? etat.largeur;
      if (w === null || Math.abs(w) < TOL) return { etat: { ...etat, texte, erreur: "La largeur doit être non nulle." } };
      const alpha = r.angle ? r.angle.radians : (etat.angle2 ?? 90 * DEG);
      return creer(etat, ctx, secondCote(etat.cote1 as Vec3, etat.normale, w, alpha), texte);
    }
    case "echap":
      return { etat: { ...retour(etat), texte: null } };
    default:
      return { etat };
  }
}

function vuePivote(etat: EtatRectanglePivote, ctx: ContexteOutil): VueOutil {
  const sep = ctx.separateurDecimal;
  const e = etape(ID_RECTANGLE_PIVOTE, etat.etape - 1);
  const deg = (x: number | null) => formaterAngle(((x ?? 0) * 180) / Math.PI, sep);
  let m: VueOutil["mesures"];
  if (etat.etape === 1) {
    // Après la création : « Dimensions » (relevé) ; aucune correction après coup relevée pour cet outil.
    m = etat.dimensions
      ? mesures(
          outil("rectangle").etapes[0]?.libelleMesures ?? "Dimensions",
          etat.texte ?? `${formaterLongueur(etat.dimensions[0], sep)}${sepListe(sep)}${formaterLongueur(etat.dimensions[1], sep)}`,
          contexteSaisie("aucune", ctx),
        )
      : mesures(e.libelleMesures, etat.texte ?? "", contexteSaisie("aucune", ctx));
  } else {
    const l = etat.etape === 2 ? etat.longueur : etat.largeur;
    const a = etat.etape === 2 ? etat.angle1 : etat.angle2;
    const valeur = etat.texte ?? (l !== null ? `${prefixe(etat.inference)}${formaterLongueur(l, sep)}${sepListe(sep)}${deg(a)}` : "");
    m = mesures(e.libelleMesures, valeur, contexteSaisie(e.saisie?.attendu ?? "aucune", ctx));
  }
  let apercu = APERCU_VIDE;
  if (etat.p1) {
    if (etat.etape === 2 && etat.longueur !== null && etat.angle1 !== null) {
      apercu = { lignes: [[etat.p1, add(etat.p1, premierCote(etat.base, etat.normale, etat.longueur, etat.angle1))]], faces: [] };
    } else if (etat.etape === 3 && etat.cote1) {
      const c2 = etat.largeur !== null && etat.angle2 !== null ? secondCote(etat.cote1, etat.normale, etat.largeur, etat.angle2) : null;
      const a = etat.p1;
      const b = add(a, etat.cote1);
      if (c2 && len(c2) > TOL) {
        const pts = [a, b, add(b, c2), add(a, c2)];
        apercu = { lignes: [fermer(pts)], faces: [pts] };
      } else apercu = { lignes: [[a, b]], faces: [] };
    }
  }
  return vue(e.consigne ?? "", m, etat.inference, apercu, ctx, etat.erreur);
}

export const MACHINE_RECTANGLE_PIVOTE: MachineOutil<EtatRectanglePivote> = {
  id: ID_RECTANGLE_PIVOTE,
  initial,
  traiter,
  vue: vuePivote,
};
