/**
 * Machine Arc 2 points (cahier-planche §4.11, relevés outils-dessin §10 et complements-modification §8).
 *
 * - 3 clics : départ, fin (corde ; saisie « Longueur »), flèche (saisie « Flèche » = distance corde → milieu de
 *   l'arc ; « Nr » = rayon, arc mineur). Courbe sans face. « Ns » juste après la création reconstruit l'arc.
 * - Arc tangent : en partant de l'extrémité d'un arc existant, l'aperçu de l'étape 2 est l'arc tangent
 *   (« Tangente au sommet ») ;
 *   · double-clic au point final : crée directement l'arc tangent, sans étape de flèche, puis étape 1 (pas
 *     d'enchaînement) ; un clic simple passe à l'étape de flèche (retour au mode à 3 clics). Le rendu peut
 *     émettre « clic » puis « clic double » au même point : le clic double à l'étape 3, au point du clic
 *     précédent, crée aussi l'arc tangent ;
 *   · Alt (bascule « Verrouiller la tangence ») : 2 clics suffisent et l'outil enchaîne depuis la dernière
 *     extrémité ; Échap termine la chaîne.
 * - Côtés : 12 par défaut (catalogue), Ctrl ±, « Ns ». Après une création, l'étape 1 affiche la dernière flèche.
 * - Inférence « Demi-cercle » et congé par double-clic sur un coin : documentation seule (nv), non implémentés.
 */
import { type Modele, ajouterArc } from "../geometrie-libre.js";
import type { Inference } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, AXE_Z, TOL, add, cross, dist, dot, egal, normalize, scale, sub } from "../vecteur.js";
import {
  type ArcGeo,
  type Derniere,
  APERCU_VIDE,
  ajusterSegments,
  arcParFleche,
  arcTangent,
  axesDuPlan,
  contexteSaisie,
  corrigeable,
  cotesParDefaut,
  etape,
  finArc,
  formaterLongueur,
  inferenceTangente,
  intersectionRayonPlan,
  mesures,
  messageErreur,
  outil,
  perpendiculaireCorde,
  pointsArc,
  prefixe,
  projeterSurPlan,
  tangenteArc,
  viserLibre,
  viserSurPlan,
  vue,
} from "./commun-formes.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Transition, VueOutil } from "./machine.js";

export const ID_ARC_2_POINTS = "arc-2-points";
const ALT_FR = "Alt = Verrouiller la tangence.";

interface ParamsArc2 {
  readonly arc: ArcGeo;
  readonly cotes: number;
  readonly fleche: number;
}

export interface EtatArc2Points {
  readonly etape: 1 | 2 | 3;
  readonly cotes: number;
  /** Alt : verrouillage de la tangence (bascule). */
  readonly verrouTangence: boolean;
  readonly normaleSurvol: Vec3;
  readonly debut: Vec3 | null;
  readonly normale: Vec3;
  /** Tangente au départ si l'on part de l'extrémité d'un arc (sens de prolongement). */
  readonly tangente: Vec3 | null;
  readonly fin: Vec3 | null;
  /** Étape 3 : direction de la flèche (⟂ corde) et flèche signée. */
  readonly perp: Vec3 | null;
  readonly fleche: number | null;
  readonly apercu: ArcGeo | null;
  readonly inference: Inference | null;
  readonly texte: string | null;
  readonly erreur: string | null;
  readonly derniereFleche: number | null;
  readonly derniere: Derniere<ParamsArc2> | null;
}

/** Tangente de prolongement à l'extrémité libre d'une courbe d'arc de la racine, et normale de son plan. */
export function tangenteDepuisExtremite(m: Modele, p: Vec3): { tangente: Vec3; normale: Vec3 } | null {
  const c = m.racine;
  const s = Object.values(c.sommets).find((x) => egal(x.position, p));
  if (!s) return null;
  const incidentes = Object.values(c.aretes).filter((a) => (a.a === s.id || a.b === s.id) && a.courbe !== undefined);
  for (const a of incidentes) {
    const k = c.courbes[a.courbe as string];
    if (!k || k.genre !== "arc") continue;
    if (incidentes.filter((b) => b.courbe === k.id).length !== 1) continue; // sommet intérieur de la courbe
    const autre = c.sommets[a.a === s.id ? a.b : a.a];
    if (!autre) continue;
    let t = normalize(cross(k.normale, sub(s.position, k.centre)));
    if (dot(t, sub(s.position, autre.position)) < 0) t = scale(t, -1);
    return { tangente: t, normale: normalize(k.normale) };
  }
  return null;
}

function initial(): EtatArc2Points {
  return {
    etape: 1,
    cotes: cotesParDefaut(ID_ARC_2_POINTS),
    verrouTangence: false,
    normaleSurvol: AXE_Z,
    debut: null,
    normale: AXE_Z,
    tangente: null,
    fin: null,
    perp: null,
    fleche: null,
    apercu: null,
    inference: null,
    texte: null,
    erreur: null,
    derniereFleche: null,
    derniere: null,
  };
}

const retour = (etat: EtatArc2Points): EtatArc2Points => ({
  ...etat,
  etape: 1,
  debut: null,
  tangente: null,
  fin: null,
  perp: null,
  fleche: null,
  apercu: null,
});

/** Flèche d'un arc (distance du milieu de la corde au milieu de l'arc). */
function flecheDe(a: ArcGeo): number {
  return a.rayon * (1 - Math.cos(a.angle / 2));
}

function creer(
  etat: EtatArc2Points,
  ctx: ContexteOutil,
  a: ArcGeo,
  texte: string | null,
  opts: { enchainer: boolean; remplace?: Derniere<ParamsArc2> | null; cotes?: number },
): Transition<EtatArc2Points> {
  const remplace = opts.remplace ?? null;
  const cotes = opts.cotes ?? etat.cotes;
  const base = remplace ? remplace.avant : ctx.modele;
  try {
    const r = ajouterArc(base, pointsArc(a, cotes), { centre: a.centre, rayon: a.rayon, normale: a.normale });
    const fleche = flecheDe(a);
    const derniere = { avant: base, apres: r.modele, params: { arc: a, cotes, fleche } };
    const fin = finArc(a);
    const suivant: EtatArc2Points = opts.enchainer
      ? { ...retour(etat), etape: 2, debut: fin, normale: a.normale, tangente: tangenteArc(a, fin) }
      : retour(etat);
    return {
      etat: { ...suivant, cotes, texte, erreur: null, derniereFleche: fleche, derniere },
      modele: r.modele,
      operation: outil(ID_ARC_2_POINTS).libelle,
      ...(remplace ? { remplaceDernier: true } : {}),
    };
  } catch (e) {
    return { etat: { ...etat, texte, erreur: messageErreur(e) } };
  }
}

/** Étape 3 : direction de la flèche et plan de visée (contenant la corde et la flèche). */
function geometrieFleche(debut: Vec3, fin: Vec3, n0: Vec3): { perp: Vec3; plan: { origine: Vec3; normale: Vec3 } } {
  const corde = sub(fin, debut);
  const perp = perpendiculaireCorde(corde, n0);
  return { perp, plan: { origine: scale(add(debut, fin), 0.5), normale: normalize(cross(corde, perp)) } };
}

function passerEtape3(etat: EtatArc2Points, fin: Vec3, texte: string | null): EtatArc2Points {
  const { perp } = geometrieFleche(etat.debut as Vec3, fin, etat.normale);
  return { ...etat, etape: 3, fin, perp, fleche: null, apercu: null, texte };
}

function traiter(etat0: EtatArc2Points, ev: EvenementOutil, ctx: ContexteOutil): Transition<EtatArc2Points> {
  const etat: EtatArc2Points = { ...etat0, erreur: null };
  switch (ev.genre) {
    case "survol":
    case "clic": {
      if (etat.etape === 1) {
        const { inference, normale } = viserLibre(ctx, ev);
        if (ev.genre === "survol") return { etat: { ...etat, inference, normaleSurvol: normale } };
        const t = inference.type === "extremite" ? tangenteDepuisExtremite(ctx.modele, inference.point) : null;
        return {
          etat: {
            ...retour(etat),
            etape: 2,
            debut: inference.point,
            normale: t ? t.normale : normale,
            tangente: t ? t.tangente : null,
            inference,
            texte: null,
            derniere: null,
          },
        };
      }
      const debut = etat.debut as Vec3;
      if (etat.etape === 2) {
        const inf0 = viserSurPlan(ctx, ev, { origine: debut, normale: etat.normale }, debut, false);
        const apercu = etat.tangente ? arcTangent(debut, etat.tangente, inf0.point) : null;
        const inf = apercu && etat.tangente && inf0.type === "aucune" ? inferenceTangente(inf0.point, etat.tangente, debut) : inf0;
        const suivant: EtatArc2Points = { ...etat, inference: inf, fin: inf.point, apercu, texte: null };
        if (ev.genre === "survol" || dist(inf.point, debut) <= TOL) return { etat: suivant };
        if (apercu && (ev.double === true || etat.verrouTangence)) {
          return creer(suivant, ctx, apercu, null, { enchainer: !ev.double && etat.verrouTangence });
        }
        return { etat: passerEtape3(suivant, inf.point, null) };
      }
      // étape 3 : flèche
      const fin = etat.fin as Vec3;
      if (ev.genre === "clic" && ev.double === true && etat.tangente) {
        const pointClic = viserSurPlan(ctx, ev, { origine: debut, normale: etat.normale }, debut, false).point;
        if (dist(pointClic, fin) <= Math.max(ev.tolerance, TOL)) {
          const t = arcTangent(debut, etat.tangente, fin);
          if (t) return creer(etat, ctx, t, null, { enchainer: false });
        }
      }
      const { perp, plan } = geometrieFleche(debut, fin, etat.normale);
      const q = intersectionRayonPlan(ev.rayon, plan) ?? projeterSurPlan(viserLibre(ctx, ev).inference.point, plan);
      const h = dot(sub(q, plan.origine), perp);
      const apercu = arcParFleche(debut, fin, perp, h);
      const inf = { ...viserLibre(ctx, ev, debut).inference, point: add(plan.origine, scale(perp, h)) };
      const suivant: EtatArc2Points = { ...etat, perp, fleche: h, apercu, inference: inf, texte: null };
      if (ev.genre === "survol" || !apercu) return { etat: suivant };
      return creer(suivant, ctx, apercu, null, { enchainer: false });
    }
    case "touche": {
      if (ev.etat !== "enfoncee") return { etat };
      const t = ev.touche;
      if (t === "CtrlPlus" || t === "CtrlMoins") {
        const r = ajusterSegments(etat.cotes, t === "CtrlPlus" ? 1 : -1);
        return { etat: { ...etat, cotes: r.cotes, erreur: r.erreur, texte: null } };
      }
      if (t === "Alt") return { etat: { ...etat, verrouTangence: !etat.verrouTangence } };
      return { etat };
    }
    case "saisie": {
      const texte = ev.texte;
      if (etat.etape === 1) {
        const d = etat.derniere;
        if (corrigeable(d, ctx)) {
          const r = analyserSaisie(texte, contexteSaisie("arc", ctx));
          if (r.genre === "erreur") return { etat: { ...etat, texte, erreur: r.message } };
          if (r.genre === "segments") return creer(etat, ctx, d.params.arc, texte, { enchainer: false, remplace: d, cotes: r.nombre });
          return { etat: { ...etat, texte, erreur: "Seul un nombre de segments (ex. 6s) corrige le dernier arc." } };
        }
        const r = analyserSaisie(texte, contexteSaisie("cotes", ctx));
        if (r.genre === "erreur") return { etat: { ...etat, texte, erreur: r.message } };
        if (r.genre === "segments") return { etat: { ...etat, cotes: r.nombre, texte } };
        return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
      }
      const r = analyserSaisie(texte, contexteSaisie("arc", ctx));
      if (r.genre === "erreur") return { etat: { ...etat, texte, erreur: r.message } };
      if (r.genre === "segments") return { etat: { ...etat, cotes: r.nombre, texte } };
      const debut = etat.debut as Vec3;
      if (etat.etape === 2) {
        if (r.genre !== "longueur") return { etat: { ...etat, texte, erreur: "Saisissez la longueur de la corde (le rayon « Nr » se donne à l'étape de la flèche)." } };
        if (!(r.valeur > TOL)) return { etat: { ...etat, texte, erreur: "La longueur doit être strictement positive." } };
        const vers = etat.fin && dist(etat.fin, debut) > TOL ? normalize(sub(etat.fin, debut)) : (etat.tangente ?? axesDuPlan(etat.normale).u);
        const fin = add(debut, scale(vers, r.valeur));
        if (etat.tangente && etat.verrouTangence) {
          const t = arcTangent(debut, etat.tangente, fin);
          if (t) return creer(etat, ctx, t, texte, { enchainer: true });
        }
        return { etat: passerEtape3(etat, fin, texte) };
      }
      const fin = etat.fin as Vec3;
      const perp = etat.perp ?? geometrieFleche(debut, fin, etat.normale).perp;
      const sens = etat.fleche !== null && etat.fleche < 0 ? -1 : 1;
      let h: number;
      if (r.genre === "longueur") {
        if (r.valeur === 0) return { etat: { ...etat, texte, erreur: "La flèche doit être non nulle." } };
        h = sens * r.valeur;
      } else if (r.genre === "rayon") {
        const demi = dist(debut, fin) / 2;
        if (r.valeur < demi - 1e-12) return { etat: { ...etat, texte, erreur: "Le rayon doit être au moins égal à la demi-corde." } };
        h = sens * (r.valeur - Math.sqrt(Math.max(0, r.valeur * r.valeur - demi * demi)));
      } else return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
      const a = arcParFleche(debut, fin, perp, h);
      if (!a) return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
      return creer(etat, ctx, a, texte, { enchainer: false });
    }
    case "echap":
      return { etat: { ...retour(etat), texte: null } };
    default:
      return { etat };
  }
}

function vueArc2(etat: EtatArc2Points, ctx: ContexteOutil): VueOutil {
  const sep = ctx.separateurDecimal;
  const e = etape(ID_ARC_2_POINTS, etat.etape - 1);
  let libelle = e.libelleMesures;
  let attendu = e.saisie?.attendu ?? "aucune";
  let valeur = etat.texte;
  if (etat.etape === 1) {
    if (corrigeable(etat.derniere, ctx) && etat.derniereFleche !== null) {
      libelle = etape(ID_ARC_2_POINTS, 2).libelleMesures;
      attendu = "arc";
      valeur ??= formaterLongueur(etat.derniereFleche, sep);
    }
    valeur ??= String(etat.cotes);
  } else if (etat.etape === 2) {
    valeur ??= etat.debut && etat.fin ? `${prefixe(etat.inference)}${formaterLongueur(dist(etat.debut, etat.fin), sep)}` : "";
  } else {
    valeur ??= etat.fleche !== null ? `${prefixe(etat.inference)}${formaterLongueur(Math.abs(etat.fleche), sep)}` : "";
  }
  let consigne = e.consigne ?? "";
  if (etat.etape === 2 && etat.tangente) consigne = `${consigne} | ${ALT_FR}`;
  let apercu = APERCU_VIDE;
  if (etat.debut && etat.fin) {
    const lignes: Vec3[][] = [];
    if (etat.apercu) lignes.push(pointsArc(etat.apercu, etat.cotes));
    else lignes.push([etat.debut, etat.fin]);
    if (etat.etape === 3 && etat.perp && etat.fleche !== null) {
      const m = scale(add(etat.debut, etat.fin), 0.5);
      lignes.push([m, add(m, scale(etat.perp, etat.fleche))]);
    }
    apercu = { lignes, faces: [] };
  }
  return vue(consigne, mesures(libelle, valeur, contexteSaisie(attendu, ctx)), etat.inference, apercu, ctx, etat.erreur);
}

export const MACHINE_ARC_2_POINTS: MachineOutil<EtatArc2Points> = {
  id: ID_ARC_2_POINTS,
  initial,
  traiter,
  vue: vueArc2,
};

/** Exposé pour les tests : longueur de la flèche d'un arc. */
export const flecheArc = flecheDe;
