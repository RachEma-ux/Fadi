/**
 * Machines Arc par le centre (§4.10, relevé outils-dessin §9) et, par la même fabrique, Secteur (§4.13, §12).
 *
 * - 3 clics : centre, 1er point (rayon et direction de départ), 2e point (angle balayé) ; ou saisies « rayon »
 *   (étape 2, « Longueur ») puis « angle » en degrés (étape 3).
 * - L'angle balayé suit le curseur de façon continue (au-delà de 180°) ; une saisie d'angle prend le sens du
 *   balayage courant (sens direct autour de la normale par défaut), un angle négatif inverse ce sens.
 * - Arc : courbe seule, sans face ni rayons. Secteur : arc + 2 rayons, face automatique.
 * - Côtés (12 par défaut, catalogue) : nombre ou « Ns » avant le 1er clic, « Ns » pendant le tracé, Ctrl ± ;
 *   « Ns » juste après la création reconstruit la dernière courbe (`remplaceDernier`).
 * - Flèches avant le 1er clic (bascule) : axe du rapporteur (normale) → rouge, ← vert, ↑ bleu, ↓ normale inférée.
 */
import { ajouterArc, ajouterSecteur } from "../geometrie-libre.js";
import type { Inference } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, AXE_Z, TOL, add, dot, len, normalize, scale, sub, tourner } from "../vecteur.js";
import {
  type ArcGeo,
  type Derniere,
  APERCU_VIDE,
  ajusterSegments,
  angleSigne,
  arc,
  axeDeFleche,
  axesDuPlan,
  contexteSaisie,
  corrigeable,
  cotesParDefaut,
  ecartAngulaire,
  estFleche,
  etape,
  formaterAngle,
  formaterLongueur,
  marquerContraint,
  mesures,
  messageErreur,
  outil,
  pointsArc,
  prefixe,
  viserLibre,
  viserSurPlan,
  vue,
} from "./commun-formes.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Touche, Transition, VueOutil } from "./machine.js";

interface ParamsArc {
  readonly arc: ArcGeo;
  readonly cotes: number;
}

export interface EtatArcCentre {
  readonly etape: 1 | 2 | 3;
  readonly cotes: number;
  readonly verrouFleche: { readonly normale: Vec3; readonly touche: Touche } | null;
  readonly verrouMaj: Vec3 | null;
  readonly normaleSurvol: Vec3;
  readonly centre: Vec3 | null;
  readonly normale: Vec3;
  readonly contraint: boolean;
  readonly rayon: number | null;
  /** Direction unitaire centre → départ. */
  readonly depart: Vec3 | null;
  /** Angle balayé signé (radians), suivi en continu ; et dernier angle brut du curseur. */
  readonly balayage: number;
  readonly angleBrut: number;
  readonly inference: Inference | null;
  readonly texte: string | null;
  readonly erreur: string | null;
  readonly derniere: Derniere<ParamsArc> | null;
}

export const MSG_ANGLE = "L'angle doit être compris strictement entre 0 et 360 degrés.";

export interface OptionsArcCentre {
  readonly id: "arc" | "secteur";
  readonly secteur: boolean;
}

export function creerMachineArcCentre(o: OptionsArcCentre): MachineOutil<EtatArcCentre> {
  const libelleOperation = outil(o.id).libelle;
  const cotes0 = cotesParDefaut(o.id);

  const initial = (): EtatArcCentre => ({
    etape: 1,
    cotes: cotes0,
    verrouFleche: null,
    verrouMaj: null,
    normaleSurvol: AXE_Z,
    centre: null,
    normale: AXE_Z,
    contraint: false,
    rayon: null,
    depart: null,
    balayage: 0,
    angleBrut: 0,
    inference: null,
    texte: null,
    erreur: null,
    derniere: null,
  });

  const retour = (etat: EtatArcCentre): EtatArcCentre => ({
    ...etat,
    etape: 1,
    centre: null,
    rayon: null,
    depart: null,
    balayage: 0,
    angleBrut: 0,
    contraint: false,
  });

  function creer(etat: EtatArcCentre, ctx: ContexteOutil, p: ParamsArc, texte: string | null, remplace: Derniere<ParamsArc> | null): Transition<EtatArcCentre> {
    const base = remplace ? remplace.avant : ctx.modele;
    try {
      const pts = pointsArc(p.arc, p.cotes);
      const infos = { centre: p.arc.centre, rayon: p.arc.rayon, normale: p.arc.normale };
      const r = o.secteur ? ajouterSecteur(base, p.arc.centre, pts, infos) : ajouterArc(base, pts, infos);
      return {
        etat: { ...retour(etat), cotes: p.cotes, texte, erreur: null, derniere: { avant: base, apres: r.modele, params: p } },
        modele: r.modele,
        operation: libelleOperation,
        ...(remplace ? { remplaceDernier: true } : {}),
      };
    } catch (e) {
      return { etat: { ...etat, texte, erreur: messageErreur(e) } };
    }
  }

  function arcCourant(etat: EtatArcCentre, angle: number): ArcGeo | null {
    if (!etat.centre || !etat.depart || etat.rayon === null) return null;
    return arc(etat.centre, etat.normale, etat.rayon, etat.depart, angle);
  }

  function traiter(etat0: EtatArcCentre, ev: EvenementOutil, ctx: ContexteOutil): Transition<EtatArcCentre> {
    const etat: EtatArcCentre = { ...etat0, erreur: null };
    switch (ev.genre) {
      case "survol":
      case "clic": {
        if (etat.etape === 1) {
          const { inference, normale } = viserLibre(ctx, ev);
          const verrou = etat.verrouMaj ?? etat.verrouFleche?.normale ?? null;
          const inf = verrou ? marquerContraint(inference) : inference;
          if (ev.genre === "survol") return { etat: { ...etat, inference: inf, normaleSurvol: normale } };
          return {
            etat: {
              ...etat,
              etape: 2,
              centre: inf.point,
              normale: normalize(verrou ?? normale),
              contraint: verrou !== null,
              rayon: null,
              depart: null,
              inference: inf,
              texte: null,
              derniere: null,
            },
          };
        }
        const centre = etat.centre as Vec3;
        const inf = viserSurPlan(ctx, ev, { origine: centre, normale: etat.normale }, centre, etat.contraint);
        const d = sub(inf.point, centre);
        const v = sub(d, scale(etat.normale, dot(d, etat.normale)));
        if (etat.etape === 2) {
          const rayon = len(v);
          const depart = rayon > TOL ? normalize(v) : etat.depart;
          const suivant: EtatArcCentre = { ...etat, inference: inf, rayon, depart, texte: null };
          if (ev.genre === "survol" || rayon <= TOL) return { etat: suivant };
          return { etat: { ...suivant, etape: 3, balayage: 0, angleBrut: 0 } };
        }
        // étape 3 : balayage continu
        let { balayage, angleBrut } = etat;
        if (len(v) > TOL && etat.depart) {
          const brut = angleSigne(etat.depart, v, etat.normale);
          balayage += ecartAngulaire(brut - angleBrut);
          angleBrut = brut;
          balayage = Math.max(-2 * Math.PI + 1e-9, Math.min(2 * Math.PI - 1e-9, balayage));
        }
        const suivant: EtatArcCentre = { ...etat, inference: inf, balayage, angleBrut, texte: null };
        if (ev.genre === "survol") return { etat: suivant };
        const a = arcCourant(suivant, balayage);
        if (!a || a.angle < 1e-9) return { etat: suivant };
        return creer(suivant, ctx, { arc: a, cotes: etat.cotes }, null, null);
      }
      case "touche": {
        const t = ev.touche;
        if (t === "Maj") {
          if (ev.etat === "enfoncee") return { etat: etat.etape === 1 ? { ...etat, verrouMaj: etat.normaleSurvol } : etat };
          return { etat: { ...etat, verrouMaj: null } };
        }
        if (ev.etat !== "enfoncee") return { etat };
        if (t === "CtrlPlus" || t === "CtrlMoins") {
          const r = ajusterSegments(etat.cotes, t === "CtrlPlus" ? 1 : -1);
          return { etat: { ...etat, cotes: r.cotes, erreur: r.erreur, texte: null } };
        }
        if (etat.etape === 1 && estFleche(t)) {
          if (etat.verrouFleche?.touche === t) return { etat: { ...etat, verrouFleche: null } };
          return { etat: { ...etat, verrouFleche: { normale: axeDeFleche(t) ?? etat.normaleSurvol, touche: t } } };
        }
        return { etat };
      }
      case "saisie": {
        const texte = ev.texte;
        if (etat.etape === 1) {
          if (corrigeable(etat.derniere, ctx)) {
            const d = etat.derniere;
            const r = analyserSaisie(texte, contexteSaisie("cotes", ctx));
            if (r.genre === "erreur") return { etat: { ...etat, texte, erreur: r.message } };
            if (r.genre === "segments" && /s\s*$/i.test(texte)) return creer(etat, ctx, { ...d.params, cotes: r.nombre }, texte, d);
            if (r.genre === "segments") return { etat: { ...etat, cotes: r.nombre, texte } };
            return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
          }
          const r = analyserSaisie(texte, contexteSaisie("cotes", ctx));
          if (r.genre === "erreur") return { etat: { ...etat, texte, erreur: r.message } };
          if (r.genre === "segments") return { etat: { ...etat, cotes: r.nombre, texte } };
          return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
        }
        if (etat.etape === 2) {
          const r = analyserSaisie(texte, contexteSaisie("arc", ctx));
          if (r.genre === "erreur") return { etat: { ...etat, texte, erreur: r.message } };
          if (r.genre === "segments") return { etat: { ...etat, cotes: r.nombre, texte } };
          const valeur = r.genre === "longueur" ? r.valeur : r.genre === "rayon" ? r.valeur : null;
          if (valeur === null) return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
          if (!(valeur > TOL)) return { etat: { ...etat, texte, erreur: "Le rayon doit être strictement positif." } };
          const depart = etat.depart ?? axesDuPlan(etat.normale).u;
          return { etat: { ...etat, etape: 3, rayon: valeur, depart, balayage: 0, angleBrut: 0, texte } };
        }
        const r = analyserSaisie(texte, contexteSaisie("angle-arc", ctx));
        if (r.genre === "erreur") return { etat: { ...etat, texte, erreur: r.message } };
        if (r.genre === "segments") return { etat: { ...etat, cotes: r.nombre, texte } };
        if (r.genre !== "angle") return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
        if (r.degres === 0 || Math.abs(r.degres) >= 360) return { etat: { ...etat, texte, erreur: MSG_ANGLE } };
        const sens = etat.balayage < 0 ? -1 : 1;
        const a = arcCourant(etat, sens * r.radians);
        if (!a) return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
        return creer(etat, ctx, { arc: a, cotes: etat.cotes }, texte, null);
      }
      case "echap":
        return { etat: { ...retour(etat), texte: null } };
      default:
        return { etat };
    }
  }

  function vueArc(etat: EtatArcCentre, ctx: ContexteOutil): VueOutil {
    const sep = ctx.separateurDecimal;
    const e = etape(o.id, etat.etape - 1);
    let valeur = etat.texte;
    if (etat.etape === 1) valeur ??= String(etat.cotes);
    else if (etat.etape === 2) valeur ??= etat.rayon !== null ? `${prefixe(etat.inference)}${formaterLongueur(etat.rayon, sep)}` : "";
    else valeur ??= `${prefixe(etat.inference)}${formaterAngle(Math.abs((etat.balayage * 180) / Math.PI), sep)}`;
    let apercu = APERCU_VIDE;
    if (etat.centre && etat.depart && etat.rayon !== null && etat.rayon > TOL) {
      const p0 = add(etat.centre, scale(etat.depart, etat.rayon));
      const lignes: Vec3[][] = [[etat.centre, p0]];
      const a = etat.etape === 3 ? arcCourant(etat, etat.balayage) : null;
      let faces: Vec3[][] = [];
      if (a && a.angle > 1e-9) {
        const pts = pointsArc(a, etat.cotes);
        lignes.push(pts);
        const fin = tourner(p0, a.centre, a.normale, a.angle);
        lignes.push([etat.centre, fin]);
        if (o.secteur) faces = [[etat.centre, ...pts]];
      }
      apercu = { lignes, faces };
    }
    return vue(e.consigne ?? "", mesures(e.libelleMesures, valeur, contexteSaisie(e.saisie?.attendu ?? "aucune", ctx)), etat.inference, apercu, ctx, etat.erreur);
  }

  return { id: o.id, initial, traiter, vue: vueArc };
}

export const MACHINE_ARC: MachineOutil<EtatArcCentre> = creerMachineArcCentre({ id: "arc", secteur: false });
