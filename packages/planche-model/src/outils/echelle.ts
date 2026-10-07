/**
 * Outil Échelle (cahier-planche §4.18, relevé outils-modification §4) — machine pure.
 *
 * Boîte englobante jaune et 26 poignées (8 coins, 12 milieux d'arêtes, 6 centres de faces) autour de la sélection ;
 * sans sélection, un clic choisit l'objet. Un clic sur une poignée l'active : l'ancrage est le point OPPOSÉ (ou le
 * centre avec Ctrl). Coin = 3 axes uniforme ; milieu d'arête = 2 axes, centre de face = 1 axe, NON uniformes ; Maj
 * (maintenue) inverse le mode de la poignée. Facteur au curseur, ou saisie : « 2 » = facteur, « 3m » = dimension
 * cible exacte (sur l'axe de la poignée, ou la plus grande dimension pour une poignée uniforme), « 2;3;4 » =
 * facteurs par axe actif, négatif = miroir. Après : étape 1, sélection et poignées gardées ; une saisie corrige
 * (un seul pas). Échap au repos avec sélection : vide la sélection.
 */
import { type Id, mettreAEchelle } from "../geometrie-libre.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, EPS, add, dot, len, normalize, scale, sub, v3 } from "../vecteur.js";
import {
  type Derniere,
  contexteSaisie,
  corrigeable,
  mesures,
  messageErreur,
} from "./commun-formes.js";
import {
  type Boite,
  boiteDe,
  consigneDe,
  enLocal,
  filaireBoite,
  libelleMesuresDe,
  pointsDe,
  selectionValide,
  vueModif,
  viseeElement,
} from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Rayon, Touche, Transition, VueOutil } from "./machine.js";
import { idsDuClic, optionsDans } from "./selection.js";

export const ID_ECHELLE = "echelle";
type Axe = "x" | "y" | "z";
const AXES: readonly Axe[] = ["x", "y", "z"];

export interface Poignee {
  readonly id: string;
  readonly genre: "coin" | "arete" | "face";
  readonly position: Vec3;
  /** Point opposé (axes inactifs : milieu de la boîte). */
  readonly ancre: Vec3;
  /** Axes mis à l'échelle par la poignée. */
  readonly axes: readonly Axe[];
}

/**
 * Les 26 poignées de la boîte (3 × 3 × 3 − centre). Une sélection PLATE dans un axe (face au sol, arête…) n'a pas
 * d'épaisseur à mettre à l'échelle : cet axe ne porte aucune poignée (comme les 8 poignées d'une forme 2D dans
 * SketchUp), sinon trois poignées coïncideraient et celle qui porte l'axe plat refuserait toute dimension cible.
 */
export function poignees(b: Boite): Poignee[] {
  const coord = (axe: Axe, i: number): number => (i === 0 ? b.min[axe] : i === 2 ? b.max[axe] : b.centre[axe]);
  const plats = AXES.filter((a) => b.max[a] - b.min[a] < EPS);
  const actifs = AXES.filter((a) => !plats.includes(a));
  const r: Poignee[] = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) {
        if (i === 1 && j === 1 && k === 1) continue;
        const idx = { x: i, y: j, z: k };
        if (plats.some((a) => idx[a] !== 1)) continue;
        const axes = AXES.filter((a) => idx[a] !== 1);
        const opp = (a: Axe): number => (idx[a] === 1 ? coord(a, 1) : coord(a, 2 - idx[a]));
        r.push({
          id: `${i}${j}${k}`,
          genre: axes.length === actifs.length ? "coin" : axes.length === 1 ? "face" : "arete",
          position: v3(coord("x", i), coord("y", j), coord("z", k)),
          ancre: v3(opp("x"), opp("y"), opp("z")),
          axes,
        });
      }
  return r;
}

const uniformeParDefaut = (p: Poignee): boolean => p.genre === "coin";

interface ParamsEchelle {
  readonly entites: readonly Id[];
  readonly ancre: Vec3;
  readonly facteurs: Vec3;
}

export interface EtatEchelle {
  readonly etape: 1 | 2;
  readonly entites: readonly Id[];
  readonly survol: string | null;
  readonly poignee: Poignee | null;
  readonly boite: Boite | null;
  /** Ctrl : ancrage au centre (bascule). */
  readonly depuisCentre: boolean;
  /** Maj maintenue : inverse uniforme / non uniforme. */
  readonly inverse: boolean;
  readonly facteurs: Vec3;
  readonly texte: string | null;
  readonly erreur: string | null;
  readonly derniere: Derniere<ParamsEchelle> | null;
}

function initial(): EtatEchelle {
  return { etape: 1, entites: [], survol: null, poignee: null, boite: null, depuisCentre: false, inverse: false, facteurs: v3(1, 1, 1), texte: null, erreur: null, derniere: null };
}

const retour = (e: EtatEchelle): EtatEchelle => ({ ...e, etape: 1, poignee: null, boite: null, facteurs: v3(1, 1, 1) });

const uniforme = (e: EtatEchelle): boolean => (e.poignee ? uniformeParDefaut(e.poignee) !== e.inverse : false);
const ancreDe = (e: EtatEchelle): Vec3 => (e.depuisCentre ? (e.boite as Boite).centre : (e.poignee as Poignee).ancre);

/** Ids à mettre à l'échelle : ceux de l'état, sinon la sélection de l'interface. */
function cibles(e: EtatEchelle, ctx: ContexteOutil): Id[] {
  return e.entites.length ? [...e.entites] : selectionValide(ctx);
}

function boiteCourante(e: EtatEchelle, ctx: ContexteOutil): Boite | null {
  return e.boite ?? boiteDe(pointsDe(ctx.modele, cibles(e, ctx)));
}

/** Poignée la plus proche du rayon, dans une tolérance double de celle d'accrochage. */
function poigneeVisee(b: Boite, r: Rayon, tolerance: number): Poignee | null {
  const V = normalize(r.direction);
  let meilleur: { p: Poignee; d: number; t: number } | null = null;
  for (const p of poignees(b)) {
    const w = sub(p.position, r.origine);
    const t = dot(w, V);
    if (t <= 0) continue;
    const d = len(sub(w, scale(V, t)));
    // À égale distance au rayon (poignées alignées sur la visée), la plus proche de la caméra gagne.
    if (d <= 2 * tolerance && (!meilleur || d < meilleur.d - 1e-9 || (d <= meilleur.d + 1e-9 && t < meilleur.t))) meilleur = { p, d, t };
  }
  return meilleur ? meilleur.p : null;
}

/** Facteurs déduits de la position du curseur (point du plan de l'écran passant par la poignée). */
function facteursAuCurseur(e: EtatEchelle, r: Rayon): Vec3 {
  const p = e.poignee as Poignee;
  const V = normalize(r.direction);
  const den = dot(V, V);
  const t = dot(sub(p.position, r.origine), V) / den;
  const P = add(r.origine, scale(V, t));
  const A = ancreDe(e);
  if (uniforme(e)) {
    const u = sub(p.position, A);
    const l2 = dot(u, u);
    if (l2 < EPS) return v3(1, 1, 1);
    const f = dot(sub(P, A), u) / l2;
    return v3(f, f, f);
  }
  const f: Record<Axe, number> = { x: 1, y: 1, z: 1 };
  for (const a of p.axes) {
    const d = p.position[a] - A[a];
    if (Math.abs(d) > EPS) f[a] = (P[a] - A[a]) / d;
  }
  return v3(f.x, f.y, f.z);
}

function facteursSaisis(e: EtatEchelle, texte: string, ctx: ContexteOutil): { facteurs: Vec3 } | { erreur: string } {
  const p = e.poignee as Poignee;
  const b = e.boite as Boite;
  const res = analyserSaisie(texte, contexteSaisie("echelle", ctx));
  if (res.genre === "erreur") return { erreur: res.message };
  const etendue = (a: Axe): number => b.max[a] - b.min[a];
  const actifs = uniforme(e) ? AXES : p.axes;
  if (res.genre === "echelle") {
    const vals = res.facteurs;
    if (vals.length === 1 || uniforme(e)) {
      const f = vals.find((x): x is number => x !== null);
      if (f === undefined) return { erreur: "Facteur d'échelle manquant." };
      const r: Record<Axe, number> = { x: 1, y: 1, z: 1 };
      for (const a of actifs) r[a] = f;
      return { facteurs: v3(r.x, r.y, r.z) };
    }
    if (vals.length !== p.axes.length) return { erreur: `Cette poignée met ${p.axes.length} axe(s) à l'échelle : saisissez ${p.axes.length} facteur(s) séparés par « ; ».` };
    const r: Record<Axe, number> = { x: 1, y: 1, z: 1 };
    p.axes.forEach((a, i) => {
      r[a] = vals[i] ?? e.facteurs[a];
    });
    return { facteurs: v3(r.x, r.y, r.z) };
  }
  if (res.genre === "echelle-cible") {
    const r: Record<Axe, number> = { x: 1, y: 1, z: 1 };
    if (uniforme(e)) {
      const cible = res.longueurs.find((x): x is number => x !== null);
      const grand = [...AXES].sort((a, c) => etendue(c) - etendue(a))[0] as Axe;
      if (cible === undefined || etendue(grand) < EPS) return { erreur: "Dimension cible impossible : la sélection est plate." };
      const f = cible / etendue(grand);
      for (const a of AXES) r[a] = f;
    } else {
      const vals = res.longueurs.length === 1 ? p.axes.map(() => res.longueurs[0] ?? null) : res.longueurs;
      if (vals.length !== p.axes.length) return { erreur: `Cette poignée met ${p.axes.length} axe(s) à l'échelle : saisissez ${p.axes.length} dimension(s).` };
      for (const [i, a] of p.axes.entries()) {
        const cible = vals[i];
        if (cible === null || cible === undefined) continue;
        if (etendue(a) < EPS) return { erreur: "Dimension cible impossible : la sélection est plate dans cet axe." };
        r[a] = cible / etendue(a);
      }
    }
    return { facteurs: v3(r.x, r.y, r.z) };
  }
  return { erreur: `Saisie « ${texte} » non reconnue.` };
}

function appliquer(e: EtatEchelle, ctx: ContexteOutil, params: ParamsEchelle, texte: string | null, remplace: Derniere<ParamsEchelle> | null): Transition<EtatEchelle> {
  const base = remplace ? remplace.avant : ctx.modele;
  try {
    const L = enLocal({ ...ctx, modele: base });
    const r = mettreAEchelle(base, params.entites, L.point(params.ancre), params.facteurs, optionsDans(ctx));
    return {
      etat: { ...retour(e), entites: params.entites, texte, erreur: null, derniere: { avant: base, apres: r.modele, params } },
      modele: r.modele,
      selection: params.entites,
      operation: "Échelle",
      ...(remplace ? { remplaceDernier: true } : {}),
    };
  } catch (err) {
    return { etat: { ...retour(e), texte, erreur: messageErreur(err) } };
  }
}

export const machineEchelle: MachineOutil<EtatEchelle> = {
  id: ID_ECHELLE,
  initial,

  traiter(etat, ev, ctx): Transition<EtatEchelle> {
    switch (ev.genre) {
      case "survol": {
        if (etat.etape === 2 && etat.poignee) return { etat: { ...etat, facteurs: facteursAuCurseur(etat, ev.rayon), texte: null, erreur: null } };
        const b = boiteCourante(etat, ctx);
        return { etat: { ...etat, survol: b ? (poigneeVisee(b, ev.rayon, ev.tolerance)?.id ?? null) : null, texte: null, erreur: null } };
      }
      case "clic": {
        if (etat.etape === 2 && etat.poignee) return appliquer(etat, ctx, { entites: cibles(etat, ctx), ancre: ancreDe(etat), facteurs: facteursAuCurseur(etat, ev.rayon) }, null, null);
        const b = boiteCourante(etat, ctx);
        const p = b ? poigneeVisee(b, ev.rayon, ev.tolerance) : null;
        if (b && p) {
          const e2: EtatEchelle = { ...etat, etape: 2, entites: cibles(etat, ctx), poignee: p, boite: b, facteurs: v3(1, 1, 1), texte: null, erreur: null, derniere: null };
          return { etat: e2 };
        }
        const { cible } = viseeElement(ctx, ev);
        if (!cible) return { etat: { ...etat, entites: [], survol: null }, selection: [] };
        const ids = idsDuClic(ctx.modele, ctx.dans, cible, 1);
        return { etat: { ...etat, entites: ids, survol: null, derniere: null }, selection: ids };
      }
      case "touche":
        if (ev.touche === "Ctrl" && ev.etat === "enfoncee") return { etat: { ...etat, depuisCentre: !etat.depuisCentre } };
        if (ev.touche === ("Maj" as Touche)) return { etat: { ...etat, inverse: ev.etat === "enfoncee" } };
        return { etat };
      case "saisie": {
        if (etat.etape === 2 && etat.poignee) {
          const f = facteursSaisis(etat, ev.texte, ctx);
          if ("erreur" in f) return { etat: { ...etat, texte: ev.texte, erreur: f.erreur } };
          return appliquer(etat, ctx, { entites: cibles(etat, ctx), ancre: ancreDe(etat), facteurs: f.facteurs }, ev.texte, null);
        }
        if (corrigeable(etat.derniere, ctx)) {
          const d = etat.derniere;
          const res = analyserSaisie(ev.texte, contexteSaisie("echelle", ctx));
          if (res.genre === "echelle" && res.facteurs.length === 1 && res.facteurs[0] != null) {
            const f = res.facteurs[0];
            const avant = d.params.facteurs;
            // Même forme de facteurs que l'opération corrigée (les axes à 1 restent à 1).
            return appliquer(etat, ctx, { ...d.params, facteurs: v3(avant.x === 1 ? 1 : f, avant.y === 1 ? 1 : f, avant.z === 1 ? 1 : f) }, ev.texte, d);
          }
          return { etat: { ...etat, texte: ev.texte, erreur: "Après coup, saisissez un facteur unique (par exemple « 1,5 »)." } };
        }
        return { etat: { ...etat, texte: ev.texte, erreur: "Cliquez d'abord sur une poignée." } };
      }
      case "echap":
        if (etat.etape === 2) return { etat: { ...retour(etat), texte: null, erreur: null } };
        return { etat: { ...initial(), depuisCentre: etat.depuisCentre }, selection: [] };
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const b = boiteCourante(etat, ctx);
    const aSel = cibles(etat, ctx).length > 0;
    let indice = aSel ? 1 : 0;
    if (etat.etape === 2 && etat.poignee) indice = etat.depuisCentre ? 4 : etat.poignee.genre === "face" && !etat.inverse ? 3 : 2;
    const lignes: Vec3[][] = [];
    if (b) {
      const taille = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, 0.1);
      const t = taille * 0.03;
      for (const p of poignees(b)) {
        for (const a of AXES) {
          const d = a === "x" ? v3(t, 0, 0) : a === "y" ? v3(0, t, 0) : v3(0, 0, t);
          lignes.push([sub(p.position, d), add(p.position, d)]);
        }
      }
      const dessin: Boite =
        etat.etape === 2 && etat.poignee
          ? (() => {
              const A = ancreDe(etat);
              const f = etat.facteurs;
              const x = (v: Vec3): Vec3 => v3(A.x + (v.x - A.x) * f.x, A.y + (v.y - A.y) * f.y, A.z + (v.z - A.z) * f.z);
              const m1 = x(b.min);
              const m2 = x(b.max);
              return {
                min: v3(Math.min(m1.x, m2.x), Math.min(m1.y, m2.y), Math.min(m1.z, m2.z)),
                max: v3(Math.max(m1.x, m2.x), Math.max(m1.y, m2.y), Math.max(m1.z, m2.z)),
                centre: x(b.centre),
              };
            })()
          : b;
      lignes.push(...filaireBoite(dessin));
      if (etat.etape === 2 && etat.poignee) lignes.push([ancreDe(etat), etat.poignee.position]);
    }
    let valeur = etat.texte ?? "";
    if (!etat.texte && etat.etape === 2) {
      const f = etat.facteurs;
      valeur = uniforme(etat) ? f.x.toFixed(2).replace(".", ctx.separateurDecimal) : AXES.filter((a) => (etat.poignee as Poignee).axes.includes(a)).map((a) => f[a].toFixed(2).replace(".", ctx.separateurDecimal)).join(ctx.separateurDecimal === "," ? " ; " : ", ");
    }
    const m = etat.etape === 2 ? mesures(libelleMesuresDe(ID_ECHELLE, indice), valeur, contexteSaisie("echelle", ctx)) : null;
    return vueModif({ consigne: consigneDe(ID_ECHELLE, indice), mesures: m, apercu: { lignes, faces: [] }, ctx, erreur: etat.erreur });
  },
};
