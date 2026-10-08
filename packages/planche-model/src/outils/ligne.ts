/**
 * Outil Ligne (cahier-planche §4.4, relevés outils-dessin §4 et complements-modification §7) — machine pure.
 *
 * Étape 1 : un clic place la première extrémité. Étape 2 : segment élastique ; un clic ou une saisie au champ
 * Mesures (longueur dans la direction du curseur, négative = sens inverse ; point absolu `[x;y;z]` ou relatif
 * `<dx;dy;dz>`) crée le segment et la chaîne CONTINUE depuis son extrémité. La chaîne se termine (retour à
 * l'étape 1) quand le segment revient au départ de la chaîne ou qu'il crée une face (fermeture d'une boucle,
 * découpe d'une face). À l'étape 1, une longueur saisie corrige le dernier segment (`remplaceDernier`).
 *
 * Modificateurs : → ← ↑ verrou de direction rouge / vert / bleu, ↓ parallèle / perpendiculaire à la dernière arête
 * survolée (sans référence : longueur bloquée à 0) — bascules, 2ᵉ appui = déverrouiller ; Maj MAINTENUE = verrou de
 * l'inférence courante (le segment « Alt = … » disparaît de la consigne) ; Alt = cycle des inférences linéaires,
 * appliqué au RELÂCHEMENT. Échap : annule le segment en cours, vide Mesures, l'outil reste actif.
 */
import { type Modele, ajouterSegment } from "../geometrie-libre.js";
import {
  type Inference,
  type ModeAlt,
  type Verrou,
  COULEURS,
  geometrieVisible,
  LIBELLES_MODE_ALT,
  LIBELLE_LIGNE_CONTRAINTE,
  inferer,
  modeAltSuivant,
} from "../inference.js";
import { analyserSaisie, type ContexteSaisie } from "../saisie-vcb.js";
import { type Vec3, AXE_Z, ORIGINE, TOL, add, cross, dist, dot, egal, len, normalize, scale, sub } from "../vecteur.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Rayon, Touche, Transition, VueOutil } from "./machine.js";
import { etapeCatalogue, optionsDans, versContexteEdition } from "./selection.js";

/** Verrou des flèches : axe, direction (↓ avec arête de référence) ou « nul » (↓ sans référence). */
export type VerrouFleche =
  | { readonly touche: Touche; readonly verrou: Verrou }
  | { readonly touche: "FlecheBas"; readonly verrou: null };

export interface EtatLigne {
  readonly etape: 1 | 2;
  readonly depart: Vec3 | null;
  readonly debutChaine: Vec3 | null;
  readonly inference: Inference | null;
  readonly fleche: VerrouFleche | null;
  readonly verrouMaj: Verrou | null;
  readonly modeAlt: ModeAlt;
  readonly areteReference: { readonly a: Vec3; readonly b: Vec3 } | null;
  /** Texte tapé, affiché dans Mesures après validation (jusqu'au prochain mouvement). */
  readonly texte: string | null;
  readonly erreur: string | null;
  /** Dernier segment terminé (correction après coup). */
  readonly dernier: { readonly modeleAvant: Modele; readonly depart: Vec3; readonly direction: Vec3 } | null;
  /** Dernier rayon reçu, pour recalculer l'inférence après un changement de verrou. */
  readonly rayon: { readonly rayon: Rayon; readonly tolerance: number } | null;
}

const ATTENDU: ContexteSaisie["attendu"] = "longueur-ou-point";

/** Longueur affichée : `2,64 m` ; « ~ » si approchée (verrouillée ou arrondie à l'affichage). */
export function formaterLongueur(v: number, sep: "." | ",", approchee: boolean): string {
  const t = v.toFixed(2);
  const approx = approchee || Math.abs(Number(t) - v) > 1e-9;
  return `${approx ? "~ " : ""}${t.replace(".", sep)} m`;
}

function verrouCourant(e: EtatLigne): Verrou | undefined {
  return e.verrouMaj ?? e.fleche?.verrou ?? undefined;
}

function inferenceLigne(e: EtatLigne, ctx: ContexteOutil, r: Rayon, tolerance: number): Inference {
  if (e.etape === 2 && e.depart && e.fleche && e.fleche.verrou === null && !e.verrouMaj) {
    // ↓ sans arête de référence : longueur bloquée à 0,00 m (obs).
    return { point: e.depart, type: "parallele", couleur: COULEURS.parallele, libelle: LIBELLE_LIGNE_CONTRAINTE, verrouillee: true };
  }
  const v = verrouCourant(e);
  return inferer({
    rayon: r,
    tolerance,
    geometrie: geometrieVisible(ctx.modele),
    modeAlt: e.modeAlt,
    ...(e.etape === 2 && e.depart ? { depart: e.depart } : {}),
    ...(v ? { verrou: v } : {}),
    ...(e.areteReference ? { areteReference: e.areteReference } : {}),
      ...(ctx.repere ? { axes: ctx.repere } : {}),
  });
}

/** Mémorise la dernière arête survolée (référence de ↓). */
function reference(e: EtatLigne, i: Inference, ctx: ContexteOutil): EtatLigne["areteReference"] {
  if (i.entite === undefined || !["extremite", "milieu", "sur-arete"].includes(i.type)) return e.areteReference;
  const a = geometrieVisible(ctx.modele).aretes.find((x) => x.id === i.entite);
  return a ? { a: a.a, b: a.b } : e.areteReference;
}

function recalculer(e: EtatLigne, ctx: ContexteOutil): EtatLigne {
  return e.rayon ? { ...e, inference: inferenceLigne(e, ctx, e.rayon.rayon, e.rayon.tolerance) } : e;
}

const finChaine = (e: EtatLigne): EtatLigne => ({
  ...e,
  etape: 1,
  depart: null,
  debutChaine: null,
  fleche: null,
  verrouMaj: null,
});

/** Crée le segment depart → q ; continue la chaîne ou la termine (retour au départ, face créée). */
function poser(e: EtatLigne, ctx: ContexteOutil, q: Vec3, texte: string | null): Transition<EtatLigne> {
  const depart = e.depart;
  if (!depart) return { etat: e };
  if (dist(depart, q) <= TOL) return { etat: { ...e, erreur: null } };
  const L = versContexteEdition(ctx);
  const r = ajouterSegment(ctx.modele, L(depart), L(q), optionsDans(ctx));
  const ferme = (e.debutChaine !== null && egal(q, e.debutChaine)) || r.rapport.crees.some((id) => id.startsWith("f"));
  const dernier = { modeleAvant: ctx.modele, depart, direction: normalize(sub(q, depart)) };
  const suite: EtatLigne = ferme
    ? { ...finChaine(e), dernier, texte, erreur: null, inference: null }
    : { ...e, depart: q, dernier, texte, erreur: null, verrouMaj: null };
  return { etat: suite, modele: r.modele, operation: "Ligne" };
}

function saisir(e: EtatLigne, ctx: ContexteOutil, texte: string): Transition<EtatLigne> {
  const res = analyserSaisie(texte, { attendu: ATTENDU, separateurDecimal: ctx.separateurDecimal });
  const avecTexte = { ...e, texte, erreur: null };
  if (res.genre === "erreur") return { etat: { ...e, texte, erreur: res.message } };
  if (res.genre === "point") {
    const base = res.reference === "absolue" ? ORIGINE : (e.depart ?? ORIGINE);
    const P = add(base, res.point);
    if (e.etape === 1) return { etat: { ...avecTexte, etape: 2, depart: P, debutChaine: P, dernier: null } };
    return poser(e, ctx, P, texte);
  }
  if (res.genre !== "longueur") return { etat: { ...e, texte, erreur: `Saisie « ${texte} » non reconnue.` } };
  if (res.valeur === 0) return { etat: { ...e, texte, erreur: "Longueur nulle : aucun segment créé." } };
  if (e.etape === 2 && e.depart) {
    const vers = e.inference ? sub(e.inference.point, e.depart) : null;
    if (!vers || len(vers) <= TOL) {
      return { etat: { ...e, texte, erreur: "Orientez le curseur pour donner la direction du segment." } };
    }
    return poser(e, ctx, add(e.depart, scale(normalize(vers), res.valeur)), texte);
  }
  // Étape 1 : correction du dernier segment terminé.
  const d = e.dernier;
  if (!d) return { etat: { ...e, texte, erreur: "Placez d'abord la première extrémité." } };
  const L = versContexteEdition({ ...ctx, modele: d.modeleAvant });
  const q = add(d.depart, scale(d.direction, res.valeur));
  const r = ajouterSegment(d.modeleAvant, L(d.depart), L(q), optionsDans(ctx));
  return { etat: avecTexte, modele: r.modele, remplaceDernier: true, operation: "Ligne" };
}

function touche(e: EtatLigne, ev: Extract<EvenementOutil, { genre: "touche" }>, ctx: ContexteOutil): EtatLigne {
  const t = ev.touche;
  if (t === "Maj") {
    if (ev.etat === "relachee") return recalculer({ ...e, verrouMaj: null }, ctx);
    if (e.etape === 2 && e.inference && !e.verrouMaj) return { ...e, verrouMaj: { genre: "inference", inference: e.inference } };
    return e;
  }
  if (t === "Alt") {
    if (ev.etat !== "relachee" || e.etape !== 2) return e;
    return recalculer({ ...e, modeAlt: modeAltSuivant(e.modeAlt) }, ctx);
  }
  if (ev.etat !== "enfoncee") return e;
  if (t === "FlecheDroite" || t === "FlecheGauche" || t === "FlecheHaut") {
    if (e.fleche?.touche === t) return recalculer({ ...e, fleche: null }, ctx);
    const axe = t === "FlecheDroite" ? "x" : t === "FlecheGauche" ? "y" : "z";
    return recalculer({ ...e, fleche: { touche: t, verrou: { genre: "axe", axe } } }, ctx);
  }
  if (t === "FlecheBas") {
    if (e.fleche?.touche === t) return recalculer({ ...e, fleche: null }, ctx);
    const ref = e.areteReference;
    if (!ref) return recalculer({ ...e, fleche: { touche: "FlecheBas", verrou: null } }, ctx);
    const par = normalize(sub(ref.b, ref.a));
    let perp = cross(AXE_Z, par);
    if (len(perp) < 1e-9) perp = cross({ x: 1, y: 0, z: 0 }, par);
    perp = normalize(perp);
    // Parallèle ou perpendiculaire : la plus proche de la direction courante du curseur (choix Fadi).
    const cur = e.depart && e.inference ? sub(e.inference.point, e.depart) : null;
    const perpendiculaire = cur !== null && len(cur) > TOL && Math.abs(dot(cur, perp)) > Math.abs(dot(cur, par));
    const verrou: Verrou = perpendiculaire
      ? { genre: "direction", direction: perp, type: "perpendiculaire" }
      : { genre: "direction", direction: par, type: "parallele" };
    return recalculer({ ...e, fleche: { touche: "FlecheBas", verrou } }, ctx);
  }
  return e;
}

export const machineLigne: MachineOutil<EtatLigne> = {
  id: "ligne",
  initial: () => ({
    etape: 1,
    depart: null,
    debutChaine: null,
    inference: null,
    fleche: null,
    verrouMaj: null,
    modeAlt: "tout",
    areteReference: null,
    texte: null,
    erreur: null,
    dernier: null,
    rayon: null,
  }),

  traiter(etat, ev, ctx): Transition<EtatLigne> {
    switch (ev.genre) {
      case "survol": {
        const e0: EtatLigne = { ...etat, rayon: { rayon: ev.rayon, tolerance: ev.tolerance } };
        const i = inferenceLigne(e0, ctx, ev.rayon, ev.tolerance);
        return { etat: { ...e0, inference: i, areteReference: reference(e0, i, ctx), texte: null, erreur: null } };
      }
      case "clic": {
        const e0: EtatLigne = { ...etat, rayon: { rayon: ev.rayon, tolerance: ev.tolerance }, texte: null, erreur: null };
        const i = inferenceLigne(e0, ctx, ev.rayon, ev.tolerance);
        if (e0.etape === 1) {
          return { etat: { ...e0, etape: 2, depart: i.point, debutChaine: i.point, inference: i, dernier: null } };
        }
        return poser({ ...e0, inference: i }, ctx, i.point, null);
      }
      case "saisie":
        return saisir(etat, ctx, ev.texte);
      case "touche":
        return { etat: touche(etat, ev, ctx) };
      case "echap":
        return { etat: { ...finChaine(etat), texte: null, erreur: null, dernier: null } };
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const e = etapeCatalogue("ligne", etat.etape - 1);
    let consigne = e.consigne ?? "";
    if (etat.etape === 2) {
      const mode = LIBELLES_MODE_ALT[etat.modeAlt].fr.toLowerCase();
      consigne = consigne.replace("(toutes actives)", `(${mode})`);
      if (etat.verrouMaj) consigne = consigne.split(" | ").filter((s) => !s.startsWith("Alt =")).join(" | ");
    }
    const i = etat.inference;
    const valeur =
      etat.texte ??
      (etat.etape === 2 && etat.depart && i ? formaterLongueur(dist(etat.depart, i.point), ctx.separateurDecimal, i.verrouillee) : "");
    return {
      consigne,
      mesures: {
        libelle: e.libelleMesures ?? "Longueur",
        valeur,
        saisie: { attendu: ATTENDU, separateurDecimal: ctx.separateurDecimal },
      },
      inference: i,
      apercu: { lignes: etat.etape === 2 && etat.depart && i ? [[etat.depart, i.point]] : [], faces: [] },
      selection: ctx.selection,
      survol: [],
      erreur: etat.erreur,
    };
  },
};
