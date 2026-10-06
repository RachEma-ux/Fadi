/**
 * Machine Arc 3 points (cahier-planche §4.12, relevé outils-dessin §11).
 *
 * - 3 clics : départ ; 2e point par lequel l'arc passe toujours (saisie « Longueur » : distance départ → 2e
 *   point, dans la direction du curseur) ; fin (saisie « Angle » = angle balayé, degrés). Courbe sans face.
 * - Angle saisi (choix Fadi, comportement exact non relevé) : sur le cercle de l'aperçu courant (départ, 2e point,
 *   curseur) si le curseur en définit un, sinon sur le cercle dont le 2e point est le milieu de l'arc, dans le
 *   plan inféré au départ ; l'angle doit dépasser celui du 2e point (l'arc passe toujours par lui).
 * - Côtés : 12 par défaut (catalogue), Ctrl ±, « Ns » ; « Ns » juste après la création reconstruit l'arc.
 * - Alt (verrouiller la tangence) : Instructor seulement, non implémenté.
 */
import { ajouterArc } from "../geometrie-libre.js";
import type { Inference } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, AXE_Z, TOL, add, cross, dist, normalize, scale, sub } from "../vecteur.js";
import {
  type ArcGeo,
  type Derniere,
  APERCU_VIDE,
  ajusterSegments,
  angleSigne,
  arcParTroisPoints,
  axesDuPlan,
  contexteSaisie,
  corrigeable,
  cotesParDefaut,
  etape,
  formaterAngle,
  formaterLongueur,
  mesures,
  messageErreur,
  outil,
  pointsArc,
  prefixe,
  viserLibre,
  vue,
} from "./commun-formes.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Transition, VueOutil } from "./machine.js";

export const ID_ARC_3_POINTS = "arc-3-points";
export const MSG_ANGLE_3P = "L'angle doit être compris strictement entre 0 et 360 degrés.";
export const MSG_PASSE_PAR = "L'arc doit passer par le deuxième point : angle trop petit.";

interface ParamsArc3 {
  readonly arc: ArcGeo;
  readonly cotes: number;
}

export interface EtatArc3Points {
  readonly etape: 1 | 2 | 3;
  readonly cotes: number;
  readonly normaleSurvol: Vec3;
  readonly debut: Vec3 | null;
  readonly normale: Vec3;
  readonly second: Vec3 | null;
  readonly curseur: Vec3 | null;
  readonly apercu: ArcGeo | null;
  readonly inference: Inference | null;
  readonly texte: string | null;
  readonly erreur: string | null;
  readonly derniere: Derniere<ParamsArc3> | null;
}

function initial(): EtatArc3Points {
  return {
    etape: 1,
    cotes: cotesParDefaut(ID_ARC_3_POINTS),
    normaleSurvol: AXE_Z,
    debut: null,
    normale: AXE_Z,
    second: null,
    curseur: null,
    apercu: null,
    inference: null,
    texte: null,
    erreur: null,
    derniere: null,
  };
}

const retour = (e: EtatArc3Points): EtatArc3Points => ({ ...e, etape: 1, debut: null, second: null, curseur: null, apercu: null });

/** Angle (0 ; 2π) du point P sur l'arc a, depuis le départ. */
function angleDe(a: ArcGeo, P: Vec3): number {
  let x = angleSigne(a.depart, sub(P, a.centre), a.normale);
  if (x <= 0) x += 2 * Math.PI;
  return x;
}

/** Arc de A d'angle θ dont le 2e point P est le milieu, dans le plan de normale n0. */
export function arcMilieu(A: Vec3, P: Vec3, n0: Vec3, theta: number): ArcGeo | null {
  const d = sub(P, A);
  const L = Math.hypot(d.x, d.y, d.z);
  if (L < TOL) return null;
  const R = L / (2 * Math.sin(theta / 4));
  const gauche = normalize(cross(normalize(n0), d));
  const centre = add(scale(add(A, P), 0.5), scale(gauche, R * Math.cos(theta / 4)));
  return { centre, normale: normalize(n0), rayon: R, depart: normalize(sub(A, centre)), angle: theta };
}

function creer(etat: EtatArc3Points, ctx: ContexteOutil, p: ParamsArc3, texte: string | null, remplace: Derniere<ParamsArc3> | null): Transition<EtatArc3Points> {
  const base = remplace ? remplace.avant : ctx.modele;
  try {
    const r = ajouterArc(base, pointsArc(p.arc, p.cotes), { centre: p.arc.centre, rayon: p.arc.rayon, normale: p.arc.normale });
    return {
      etat: { ...retour(etat), cotes: p.cotes, texte, erreur: null, derniere: { avant: base, apres: r.modele, params: p } },
      modele: r.modele,
      operation: outil(ID_ARC_3_POINTS).libelle,
      ...(remplace ? { remplaceDernier: true } : {}),
    };
  } catch (e) {
    return { etat: { ...etat, texte, erreur: messageErreur(e) } };
  }
}

function traiter(etat0: EtatArc3Points, ev: EvenementOutil, ctx: ContexteOutil): Transition<EtatArc3Points> {
  const etat: EtatArc3Points = { ...etat0, erreur: null };
  switch (ev.genre) {
    case "survol":
    case "clic": {
      const { inference, normale } = viserLibre(ctx, ev, etat.etape === 3 ? (etat.second ?? undefined) : (etat.debut ?? undefined));
      if (etat.etape === 1) {
        if (ev.genre === "survol") return { etat: { ...etat, inference, normaleSurvol: normale } };
        return { etat: { ...retour(etat), etape: 2, debut: inference.point, normale, inference, texte: null, derniere: null } };
      }
      const debut = etat.debut as Vec3;
      if (etat.etape === 2) {
        const suivant: EtatArc3Points = { ...etat, inference, curseur: inference.point, texte: null };
        if (ev.genre === "survol" || dist(inference.point, debut) <= TOL) return { etat: suivant };
        return { etat: { ...suivant, etape: 3, second: inference.point, curseur: null, apercu: null } };
      }
      const apercu = arcParTroisPoints(debut, etat.second as Vec3, inference.point);
      const suivant: EtatArc3Points = { ...etat, inference, curseur: inference.point, apercu, texte: null };
      if (ev.genre === "survol" || !apercu) return { etat: suivant };
      return creer(suivant, ctx, { arc: apercu, cotes: etat.cotes }, null, null);
    }
    case "touche": {
      if (ev.etat !== "enfoncee") return { etat };
      if (ev.touche === "CtrlPlus" || ev.touche === "CtrlMoins") {
        const r = ajusterSegments(etat.cotes, ev.touche === "CtrlPlus" ? 1 : -1);
        return { etat: { ...etat, cotes: r.cotes, erreur: r.erreur, texte: null } };
      }
      return { etat };
    }
    case "saisie": {
      const texte = ev.texte;
      if (etat.etape === 1) {
        const r = analyserSaisie(texte, contexteSaisie("cotes", ctx));
        if (r.genre === "erreur") return { etat: { ...etat, texte, erreur: r.message } };
        if (r.genre !== "segments") return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
        if (corrigeable(etat.derniere, ctx) && /s\s*$/i.test(texte)) {
          return creer(etat, ctx, { ...etat.derniere.params, cotes: r.nombre }, texte, etat.derniere);
        }
        return { etat: { ...etat, cotes: r.nombre, texte } };
      }
      const debut = etat.debut as Vec3;
      if (etat.etape === 2) {
        // « Ns » d'abord (la forme « longueur » du catalogue ne le couvre pas).
        const s = analyserSaisie(texte, contexteSaisie("cotes", ctx));
        if (s.genre === "segments" && /s\s*$/i.test(texte)) return { etat: { ...etat, cotes: s.nombre, texte } };
        const r = analyserSaisie(texte, contexteSaisie("longueur", ctx));
        if (r.genre === "erreur") return { etat: { ...etat, texte, erreur: r.message } };
        if (r.genre !== "longueur") return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
        if (!(r.valeur > TOL)) return { etat: { ...etat, texte, erreur: "La longueur doit être strictement positive." } };
        const vers = etat.curseur && dist(etat.curseur, debut) > TOL ? normalize(sub(etat.curseur, debut)) : axesDuPlan(etat.normale).u;
        return { etat: { ...etat, etape: 3, second: add(debut, scale(vers, r.valeur)), curseur: null, apercu: null, texte } };
      }
      const r = analyserSaisie(texte, contexteSaisie("angle-arc", ctx));
      if (r.genre === "erreur") return { etat: { ...etat, texte, erreur: r.message } };
      if (r.genre === "segments") return { etat: { ...etat, cotes: r.nombre, texte } };
      if (r.genre !== "angle") return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
      const theta = Math.abs(r.radians);
      if (theta === 0 || Math.abs(r.degres) >= 360) return { etat: { ...etat, texte, erreur: MSG_ANGLE_3P } };
      const second = etat.second as Vec3;
      let a: ArcGeo | null;
      if (etat.apercu) {
        if (theta < angleDe(etat.apercu, second) - 1e-12) return { etat: { ...etat, texte, erreur: MSG_PASSE_PAR } };
        a = { ...etat.apercu, angle: theta };
      } else {
        a = arcMilieu(debut, second, etat.normale, theta);
      }
      if (!a) return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
      return creer(etat, ctx, { arc: a, cotes: etat.cotes }, texte, null);
    }
    case "echap":
      return { etat: { ...retour(etat), texte: null } };
    default:
      return { etat };
  }
}

function vueArc3(etat: EtatArc3Points, ctx: ContexteOutil): VueOutil {
  const sep = ctx.separateurDecimal;
  const e = etape(ID_ARC_3_POINTS, etat.etape - 1);
  let valeur = etat.texte;
  let attendu = e.saisie?.attendu ?? "aucune";
  if (etat.etape === 1) valeur ??= String(etat.cotes);
  else if (etat.etape === 2) valeur ??= etat.debut && etat.curseur ? `${prefixe(etat.inference)}${formaterLongueur(dist(etat.debut, etat.curseur), sep)}` : "";
  else valeur ??= etat.apercu ? `${prefixe(etat.inference)}${formaterAngle((etat.apercu.angle * 180) / Math.PI, sep)}` : "";
  if (etat.etape === 1 && corrigeable(etat.derniere, ctx)) attendu = "cotes";
  let apercu = APERCU_VIDE;
  if (etat.debut) {
    const lignes: Vec3[][] = [];
    if (etat.etape === 2 && etat.curseur) lignes.push([etat.debut, etat.curseur]);
    if (etat.etape === 3 && etat.second) {
      if (etat.apercu) lignes.push(pointsArc(etat.apercu, etat.cotes));
      else lignes.push([etat.debut, etat.second]);
      if (etat.curseur) lignes.push([etat.second, etat.curseur]);
    }
    apercu = { lignes, faces: [] };
  }
  return vue(e.consigne ?? "", mesures(e.libelleMesures, valeur, contexteSaisie(attendu, ctx)), etat.inference, apercu, ctx, etat.erreur);
}

export const MACHINE_ARC_3_POINTS: MachineOutil<EtatArc3Points> = {
  id: ID_ARC_3_POINTS,
  initial,
  traiter,
  vue: vueArc3,
};
