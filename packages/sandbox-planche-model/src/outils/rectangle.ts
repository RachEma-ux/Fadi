/**
 * Machine de l'outil Rectangle (cahier-planche §4.6, relevé outils-dessin §5).
 *
 * - 2 clics sur le plan inféré (face survolée, sinon sol) ; face créée ; l'outil reste actif.
 * - Champ Mesures « Dimensions » : « l;w » (ou « l,w » en locale à point décimal) ; sens = quadrant du curseur,
 *   valeur négative = sens inverse ; composante vide = valeur courante du curseur (doc, nv).
 * - Correction après coup : une saisie juste après la création remplace le dernier rectangle (`remplaceDernier`).
 * - Ctrl (bascule persistante) : depuis le centre, dimensions totales.
 * - Flèches avant le 1er clic (bascule) : → plan ⟂ rouge, ← ⟂ vert, ↑ ⟂ bleu, ↓ plan inféré courant ;
 *   Maj maintenue : plan inféré courant verrouillé.
 * - Inférence « Carré » (relevée). « Section dorée » : documentation seule, non relevée → non implémentée.
 */
import { ajouterRectangle } from "../geometrie-libre.js";
import type { Inference } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, AXE_Z, TOL, add, dot, scale, sub } from "../vecteur.js";
import {
  type Derniere,
  APERCU_VIDE,
  axeDeFleche,
  axesDuPlan,
  contexteSaisie,
  corrigeable,
  etape,
  fermer,
  formaterLongueur,
  inferenceCarre,
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
import type { ContexteOutil, MachineOutil, Touche, Transition } from "./machine.js";

export const ID_RECTANGLE = "rectangle";

interface ParamsRectangle {
  readonly premier: Vec3;
  readonly u: Vec3;
  readonly w: Vec3;
  readonly centre: boolean;
  readonly signeA: number;
  readonly signeB: number;
  readonly a: number;
  readonly b: number;
}

export interface EtatRectangle {
  readonly etape: 1 | 2;
  /** Ctrl : dessin depuis le centre (bascule persistante). */
  readonly centre: boolean;
  /** Plan verrouillé par une flèche (normale) et la flèche qui l'a posé. */
  readonly verrouFleche: { readonly normale: Vec3; readonly touche: Touche } | null;
  /** Plan verrouillé tant que Maj est maintenue. */
  readonly verrouMaj: Vec3 | null;
  /** Normale du plan inféré sous le curseur (étape 1). */
  readonly normaleSurvol: Vec3;
  readonly premier: Vec3 | null;
  readonly normale: Vec3;
  readonly u: Vec3;
  readonly w: Vec3;
  /** Dimensions signées courantes (étape 2) selon u et w (totales en mode centre). */
  readonly a: number | null;
  readonly b: number | null;
  readonly contraint: boolean;
  readonly inference: Inference | null;
  readonly texte: string | null;
  readonly erreur: string | null;
  readonly derniere: Derniere<ParamsRectangle> | null;
}

function initial(): EtatRectangle {
  return {
    etape: 1,
    centre: false,
    verrouFleche: null,
    verrouMaj: null,
    normaleSurvol: AXE_Z,
    premier: null,
    normale: AXE_Z,
    u: axesDuPlan(AXE_Z).u,
    w: axesDuPlan(AXE_Z).w,
    a: null,
    b: null,
    contraint: false,
    inference: null,
    texte: null,
    erreur: null,
    derniere: null,
  };
}

/** Coin, côté 1, côté 2 du rectangle (mode centre : `premier` est le centre, a et b sont les dimensions totales). */
export function geometrieRectangle(p: { premier: Vec3; u: Vec3; w: Vec3; centre: boolean; a: number; b: number }): {
  coin: Vec3;
  cote1: Vec3;
  cote2: Vec3;
} {
  const cote1 = scale(p.u, p.a);
  const cote2 = scale(p.w, p.b);
  const coin = p.centre ? sub(p.premier, add(scale(cote1, 0.5), scale(cote2, 0.5))) : p.premier;
  return { coin, cote1, cote2 };
}

function coins(p: { premier: Vec3; u: Vec3; w: Vec3; centre: boolean; a: number; b: number }): Vec3[] {
  const g = geometrieRectangle(p);
  return [g.coin, add(g.coin, g.cote1), add(add(g.coin, g.cote1), g.cote2), add(g.coin, g.cote2)];
}

const signe = (x: number | null): number => (x !== null && x < 0 ? -1 : 1);

function creer(etat: EtatRectangle, ctx: ContexteOutil, p: ParamsRectangle, texte: string | null, remplace: Derniere<ParamsRectangle> | null): Transition<EtatRectangle> {
  if (Math.abs(p.a) < TOL || Math.abs(p.b) < TOL) {
    return { etat: { ...etat, erreur: "Les deux dimensions du rectangle doivent être non nulles.", texte } };
  }
  const base = remplace ? remplace.avant : ctx.modele;
  try {
    const g = geometrieRectangle(p);
    const r = ajouterRectangle(base, g.coin, g.cote1, g.cote2);
    return {
      etat: {
        ...etat,
        etape: 1,
        premier: null,
        a: null,
        b: null,
        contraint: false,
        texte,
        erreur: null,
        derniere: { avant: base, apres: r.modele, params: p },
      },
      modele: r.modele,
      operation: outil(ID_RECTANGLE).libelle,
      ...(remplace ? { remplaceDernier: true } : {}),
    };
  } catch (e) {
    return { etat: { ...etat, erreur: messageErreur(e), texte } };
  }
}

function normaleVerrouillee(etat: EtatRectangle): Vec3 | null {
  return etat.verrouMaj ?? etat.verrouFleche?.normale ?? null;
}

function traiter(etat0: EtatRectangle, ev: Parameters<MachineOutil<EtatRectangle>["traiter"]>[1], ctx: ContexteOutil): Transition<EtatRectangle> {
  const etat: EtatRectangle = { ...etat0, erreur: null };
  switch (ev.genre) {
    case "survol":
    case "clic": {
      if (etat.etape === 1) {
        const { inference, normale } = viserLibre(ctx, ev);
        const verrou = normaleVerrouillee(etat);
        const inf = verrou ? marquerContraint(inference) : inference;
        if (ev.genre === "survol") return { etat: { ...etat, inference: inf, normaleSurvol: normale } };
        const n = verrou ?? normale;
        const { u, w } = axesDuPlan(n);
        return {
          etat: {
            ...etat,
            etape: 2,
            premier: inf.point,
            normale: n,
            u,
            w,
            a: null,
            b: null,
            contraint: verrou !== null,
            inference: inf,
            texte: null,
            derniere: null,
          },
        };
      }
      const premier = etat.premier as Vec3;
      let inf = viserSurPlan(ctx, ev, { origine: premier, normale: etat.normale }, premier, etat.contraint);
      const d = sub(inf.point, premier);
      const k = etat.centre ? 2 : 1;
      let a = k * dot(d, etat.u);
      let b = k * dot(d, etat.w);
      // Inférence « Carré » : dimensions égales à la tolérance d'accrochage près (point non accroché seulement).
      if ((inf.type === "aucune" || inf.type === "sur-face") && Math.abs(a) > TOL && Math.abs(Math.abs(a) - Math.abs(b)) <= ev.tolerance * k) {
        const m = (Math.abs(a) + Math.abs(b)) / 2;
        a = signe(a) * m;
        b = signe(b) * m;
        const pt = add(premier, add(scale(etat.u, a / k), scale(etat.w, b / k)));
        inf = etat.contraint ? marquerContraint(inferenceCarre(pt)) : inferenceCarre(pt);
      }
      const suivant: EtatRectangle = { ...etat, a, b, inference: inf, texte: null };
      if (ev.genre === "survol") return { etat: suivant };
      return creer(suivant, ctx, { premier, u: etat.u, w: etat.w, centre: etat.centre, signeA: signe(a), signeB: signe(b), a, b }, null, null);
    }
    case "touche": {
      const t = ev.touche;
      if (t === "Maj") {
        if (ev.etat === "enfoncee") return { etat: etat.etape === 1 ? { ...etat, verrouMaj: etat.normaleSurvol } : etat };
        return { etat: { ...etat, verrouMaj: null } };
      }
      if (ev.etat !== "enfoncee") return { etat };
      if (t === "Ctrl") return { etat: { ...etat, centre: !etat.centre, a: null, b: null } };
      if (etat.etape === 1 && (t === "FlecheDroite" || t === "FlecheGauche" || t === "FlecheHaut" || t === "FlecheBas")) {
        if (etat.verrouFleche?.touche === t) return { etat: { ...etat, verrouFleche: null } };
        const n = axeDeFleche(t) ?? etat.normaleSurvol;
        return { etat: { ...etat, verrouFleche: { normale: n, touche: t } } };
      }
      return { etat };
    }
    case "saisie": {
      const texte = ev.texte;
      let cible: { premier: Vec3; u: Vec3; w: Vec3; centre: boolean; sA: number; sB: number; a: number | null; b: number | null };
      let remplace: Derniere<ParamsRectangle> | null = null;
      if (etat.etape === 2) {
        cible = { premier: etat.premier as Vec3, u: etat.u, w: etat.w, centre: etat.centre, sA: signe(etat.a), sB: signe(etat.b), a: etat.a, b: etat.b };
      } else if (corrigeable(etat.derniere, ctx)) {
        const p = etat.derniere.params;
        remplace = etat.derniere;
        cible = { premier: p.premier, u: p.u, w: p.w, centre: p.centre, sA: p.signeA, sB: p.signeB, a: p.a, b: p.b };
      } else {
        return { etat: { ...etat, texte, erreur: "Cliquez d'abord pour placer le premier coin." } };
      }
      const r = analyserSaisie(texte, contexteSaisie("dimensions2", ctx));
      if (r.genre === "erreur") return { etat: { ...etat, texte, erreur: r.message } };
      if (r.genre !== "dimensions") return { etat: { ...etat, texte, erreur: "Saisie non reconnue." } };
      const [l, w] = r.valeurs;
      const a = l === null || l === undefined ? cible.a : cible.sA * l;
      const b = w === null || w === undefined ? cible.b : cible.sB * w;
      if (a === null || b === null) {
        return { etat: { ...etat, texte, erreur: "Dimension manquante : saisissez longueur et largeur." } };
      }
      return creer(
        etat,
        ctx,
        { premier: cible.premier, u: cible.u, w: cible.w, centre: cible.centre, signeA: signe(a), signeB: signe(b), a, b },
        texte,
        remplace,
      );
    }
    case "echap":
      return { etat: { ...etat, etape: 1, premier: null, a: null, b: null, contraint: false, texte: null } };
    default:
      return { etat };
  }
}

function vueRectangle(etat: EtatRectangle, ctx: ContexteOutil) {
  const sep = ctx.separateurDecimal;
  const i = (etat.etape === 1 ? 0 : 1) + (etat.centre ? 2 : 0);
  const e = etape(ID_RECTANGLE, i);
  const dims = (a: number, b: number) => `${formaterLongueur(Math.abs(a), sep)}${sepListe(sep)}${formaterLongueur(Math.abs(b), sep)}`;
  let valeur = etat.texte ?? "";
  let attendu = e.saisie?.attendu ?? "aucune";
  if (etat.etape === 2 && etat.texte === null && etat.a !== null && etat.b !== null) valeur = `${prefixe(etat.inference)}${dims(etat.a, etat.b)}`;
  if (etat.etape === 1 && corrigeable(etat.derniere, ctx)) {
    attendu = "dimensions2";
    if (etat.texte === null) valeur = dims(etat.derniere.params.a, etat.derniere.params.b);
  }
  let apercu = APERCU_VIDE;
  if (etat.etape === 2 && etat.premier && etat.a !== null && etat.b !== null) {
    const p = { premier: etat.premier, u: etat.u, w: etat.w, centre: etat.centre, a: etat.a, b: etat.b };
    const c = coins(p);
    const lignes: Vec3[][] = [fermer(c)];
    if (etat.centre && c[2]) lignes.push([etat.premier, c[2]]);
    if (etat.inference?.libelle.en === "Square" && c[0] && c[2]) lignes.push([c[0], c[2]]);
    apercu = { lignes, faces: Math.abs(etat.a) > TOL && Math.abs(etat.b) > TOL ? [c] : [] };
  }
  return vue(e.consigne ?? "", mesures(e.libelleMesures, valeur, contexteSaisie(attendu, ctx)), etat.inference, apercu, ctx, etat.erreur);
}

export const MACHINE_RECTANGLE: MachineOutil<EtatRectangle> = {
  id: ID_RECTANGLE,
  initial,
  traiter,
  vue: vueRectangle,
};
