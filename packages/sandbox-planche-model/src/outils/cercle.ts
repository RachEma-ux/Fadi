/**
 * Machines Cercle (§4.8, relevé outils-dessin §7) et, par la même fabrique, Polygone (§4.9, §8).
 *
 * - 2 clics : centre, point du bord ; le 1er sommet est dans la direction du curseur (cercle, polygone inscrit) ;
 *   face créée ; une seule courbe.
 * - Côtés : nombre (ou « Ns ») avant le 1er clic ; « Ns » pendant le tracé ; Ctrl + / Ctrl − (±1) à tout moment ;
 *   bornes 3 à 999 (erreur relevée, rien n'est modifié) ; mémorisé pour la forme suivante.
 * - Rayon : saisie à l'étape 2 ; juste après la création, un rayon ou « Ns » reconstruit la dernière forme
 *   (`remplaceDernier`, un seul pas d'annulation).
 * - Flèches avant le 1er clic (bascule) : normale sur l'axe → rouge, ← vert, ↑ bleu, ↓ normale inférée.
 *   Maj maintenue : normale inférée verrouillée.
 * - Polygone : Ctrl (bascule) rayon inscrit (centre → sommet, défaut) / circonscrit (centre → milieu d'un côté).
 */
import { ajouterPolygone } from "../geometrie-libre.js";
import type { Inference } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, AXE_Z, ORIGINE, TOL, add, dot, len, normalize, scale, sub, tourner } from "../vecteur.js";
import {
  type Derniere,
  APERCU_VIDE,
  ajusterSegments,
  axeDeFleche,
  axesDuPlan,
  contexteSaisie,
  corrigeable,
  cotesParDefaut,
  estFleche,
  etape,
  fermer,
  formaterLongueur,
  marquerContraint,
  mesures,
  messageErreur,
  outil,
  prefixe,
  viserLibre,
  viserSurPlan,
  vue,
} from "./commun-formes.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Touche, Transition, VueOutil } from "./machine.js";

export type ModeRayon = "inscrit" | "circonscrit";

interface ParamsCirculaire {
  readonly centre: Vec3;
  readonly normale: Vec3;
  /** Direction centre → curseur (dans le plan). */
  readonly direction: Vec3;
  /** Rayon mesuré (cercle, polygone inscrit) ou apothème (polygone circonscrit). */
  readonly valeur: number;
  readonly mode: ModeRayon;
  readonly cotes: number;
}

export interface EtatCirculaire {
  readonly etape: 1 | 2;
  readonly cotes: number;
  readonly mode: ModeRayon;
  readonly verrouFleche: { readonly normale: Vec3; readonly touche: Touche } | null;
  readonly verrouMaj: Vec3 | null;
  readonly normaleSurvol: Vec3;
  readonly centre: Vec3 | null;
  readonly normale: Vec3;
  readonly contraint: boolean;
  readonly direction: Vec3 | null;
  readonly valeur: number | null;
  readonly inference: Inference | null;
  readonly texte: string | null;
  readonly erreur: string | null;
  readonly derniere: Derniere<ParamsCirculaire> | null;
}

/** Rayon au sommet et direction du 1er sommet selon le mode (circonscrit : milieu d'un côté vers le curseur). */
export function sommetPolygone(p: { normale: Vec3; direction: Vec3; valeur: number; mode: ModeRayon; cotes: number }): {
  rayon: number;
  depart: Vec3;
} {
  if (p.mode === "inscrit") return { rayon: p.valeur, depart: p.direction };
  const a = Math.PI / p.cotes;
  return { rayon: p.valeur / Math.cos(a), depart: tourner(p.direction, ORIGINE, p.normale, a) };
}

function sommetsApercu(p: ParamsCirculaire): Vec3[] {
  const { rayon, depart } = sommetPolygone(p);
  const u = normalize(depart);
  const r: Vec3[] = [];
  for (let i = 0; i < p.cotes; i++) {
    const q = add(p.centre, scale(u, rayon));
    r.push(tourner(q, p.centre, p.normale, (2 * Math.PI * i) / p.cotes));
  }
  return r;
}

export interface OptionsCirculaire {
  readonly id: "cercle" | "polygone";
  readonly polygone: boolean;
}

export function creerMachineCirculaire(o: OptionsCirculaire): MachineOutil<EtatCirculaire> {
  const libelleOperation = outil(o.id).libelle;
  const cotes0 = cotesParDefaut(o.id);

  const initial = (): EtatCirculaire => ({
    etape: 1,
    cotes: cotes0,
    mode: "inscrit",
    verrouFleche: null,
    verrouMaj: null,
    normaleSurvol: AXE_Z,
    centre: null,
    normale: AXE_Z,
    contraint: false,
    direction: null,
    valeur: null,
    inference: null,
    texte: null,
    erreur: null,
    derniere: null,
  });

  function creer(etat: EtatCirculaire, ctx: ContexteOutil, p: ParamsCirculaire, texte: string | null, remplace: Derniere<ParamsCirculaire> | null): Transition<EtatCirculaire> {
    if (!(p.valeur > TOL)) return { etat: { ...etat, texte, erreur: "Le rayon doit être strictement positif." } };
    const base = remplace ? remplace.avant : ctx.modele;
    try {
      const { rayon, depart } = sommetPolygone(p);
      const r = ajouterPolygone(base, p.centre, p.normale, rayon, p.cotes, { genre: o.id, depart });
      return {
        etat: {
          ...etat,
          etape: 1,
          cotes: p.cotes,
          centre: null,
          direction: null,
          valeur: null,
          contraint: false,
          texte,
          erreur: null,
          derniere: { avant: base, apres: r.modele, params: p },
        },
        modele: r.modele,
        operation: libelleOperation,
        ...(remplace ? { remplaceDernier: true } : {}),
      };
    } catch (e) {
      return { etat: { ...etat, texte, erreur: messageErreur(e) } };
    }
  }

  const contextePolygone = (cotes: number, mode: ModeRayon) =>
    o.polygone ? { polygone: { mode, cotes } } : {};

  function traiter(etat0: EtatCirculaire, ev: EvenementOutil, ctx: ContexteOutil): Transition<EtatCirculaire> {
    const etat: EtatCirculaire = { ...etat0, erreur: null };
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
              direction: null,
              valeur: null,
              inference: inf,
              texte: null,
              derniere: null,
            },
          };
        }
        const centre = etat.centre as Vec3;
        const inf = viserSurPlan(ctx, ev, { origine: centre, normale: etat.normale }, centre, etat.contraint);
        const d = sub(inf.point, centre);
        const plan = sub(d, scale(etat.normale, dot(d, etat.normale)));
        const valeur = len(plan);
        const direction = valeur > TOL ? normalize(plan) : etat.direction;
        const suivant: EtatCirculaire = { ...etat, inference: inf, valeur, direction, texte: null };
        if (ev.genre === "survol" || !direction) return { etat: suivant };
        return creer(suivant, ctx, { centre, normale: etat.normale, direction, valeur, mode: etat.mode, cotes: etat.cotes }, null, null);
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
        if (t === "Ctrl" && o.polygone) return { etat: { ...etat, mode: etat.mode === "inscrit" ? "circonscrit" : "inscrit" } };
        if (etat.etape === 1 && estFleche(t)) {
          if (etat.verrouFleche?.touche === t) return { etat: { ...etat, verrouFleche: null } };
          return { etat: { ...etat, verrouFleche: { normale: axeDeFleche(t) ?? etat.normaleSurvol, touche: t } } };
        }
        return { etat };
      }
      case "saisie": {
        const texte = ev.texte;
        if (etat.etape === 2) {
          const r = analyserSaisie(texte, contexteSaisie("rayon", ctx, contextePolygone(etat.cotes, etat.mode)));
          if (r.genre === "erreur") return { etat: { ...etat, texte, erreur: r.message } };
          if (r.genre === "segments") return { etat: { ...etat, cotes: r.nombre, texte } };
          if (r.genre !== "rayon") return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
          const direction = etat.direction ?? axesDuPlan(etat.normale).u;
          return creer(etat, ctx, { centre: etat.centre as Vec3, normale: etat.normale, direction, valeur: r.valeur, mode: etat.mode, cotes: etat.cotes }, texte, null);
        }
        if (corrigeable(etat.derniere, ctx)) {
          const d = etat.derniere;
          const r = analyserSaisie(texte, contexteSaisie("rayon", ctx, contextePolygone(d.params.cotes, d.params.mode)));
          if (r.genre === "erreur") return { etat: { ...etat, texte, erreur: r.message } };
          if (r.genre === "segments") return creer(etat, ctx, { ...d.params, cotes: r.nombre }, texte, d);
          if (r.genre === "rayon") return creer(etat, ctx, { ...d.params, valeur: r.valeur }, texte, d);
          return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
        }
        const r = analyserSaisie(texte, contexteSaisie("cotes", ctx));
        if (r.genre === "erreur") return { etat: { ...etat, texte, erreur: r.message } };
        if (r.genre === "segments") return { etat: { ...etat, cotes: r.nombre, texte } };
        return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
      }
      case "echap":
        return { etat: { ...etat, etape: 1, centre: null, direction: null, valeur: null, contraint: false, texte: null } };
      default:
        return { etat };
    }
  }

  function vueCirculaire(etat: EtatCirculaire, ctx: ContexteOutil): VueOutil {
    const sep = ctx.separateurDecimal;
    const i = etat.etape === 1 ? 0 : o.polygone && etat.mode === "circonscrit" ? 2 : 1;
    const e = etape(o.id, i);
    let valeur = etat.texte;
    let saisie = contexteSaisie(e.saisie?.attendu ?? "aucune", ctx, contextePolygone(etat.cotes, etat.mode));
    if (etat.etape === 1) {
      if (corrigeable(etat.derniere, ctx)) {
        saisie = contexteSaisie("rayon", ctx, contextePolygone(etat.derniere.params.cotes, etat.derniere.params.mode));
      }
      valeur ??= String(etat.cotes);
    } else {
      valeur ??= etat.valeur !== null ? `${prefixe(etat.inference)}${formaterLongueur(etat.valeur, sep)}` : "";
    }
    let apercu = APERCU_VIDE;
    if (etat.etape === 2 && etat.centre && etat.direction && etat.valeur !== null && etat.valeur > TOL) {
      const p: ParamsCirculaire = { centre: etat.centre, normale: etat.normale, direction: etat.direction, valeur: etat.valeur, mode: etat.mode, cotes: etat.cotes };
      const s = sommetsApercu(p);
      const bord = add(etat.centre, scale(etat.direction, etat.valeur));
      apercu = { lignes: [fermer(s), [etat.centre, bord]], faces: [s] };
    }
    return vue(e.consigne ?? "", mesures(e.libelleMesures, valeur, saisie), etat.inference, apercu, ctx, etat.erreur);
  }

  return { id: o.id, initial, traiter, vue: vueCirculaire };
}

export const MACHINE_CERCLE: MachineOutil<EtatCirculaire> = creerMachineCirculaire({ id: "cercle", polygone: false });
