/**
 * Outil Suivez-moi (cahier-planche §4.20, relevé outils-modification §6) — machine pure.
 *
 * Le chemin est PRÉSÉLECTIONNÉ : une face (son périmètre) ou des arêtes continues. « Cliquez sur le profil à
 * extruder » : un clic sur une face — le profil — l'extrude sur tout le chemin, coins à onglet ; l'outil reste actif.
 * Sans présélection le relevé ne décrit que la sélection du chemin « au curseur » (instr, non relevée) : la machine
 * demande alors de présélectionner le chemin (choix Fadi). Le champ Mesures est inactif.
 *
 * Lot 10c (EX-FM-01, EX-PREV-01) : survoler une face candidate calcule le balayage par le noyau sur un modèle candidat
 * (rien n'est écrit) et en montre l'aperçu, trous compris ; un profil refusé l'est dès le survol, avec son motif ; le
 * clic ne valide qu'un aperçu valide. Option « Capuchons » (EX-FM-06) : avec (défaut) ou sans, sur chemin ouvert.
 *
 * Lot 10d (EX-RV-01 à 04) : la **Révolution** est une méthode nommée de Suivez-moi (option « Méthode », Alt seul), pas un
 * quatrième outil ni une lettre de plus. L'axe est une arête présélectionnée ou deux points cliqués ; survoler puis
 * cliquer le profil le tourne (même aperçu par modèle candidat, même consommation du profil). Le champ Mesures prend
 * l'angle (−360° à +360°, zéro exclu ; défaut 360°) ou les segments par tour « Ns » (12 à 512 ; défaut 48) ; après la
 * validation, une nouvelle valeur corrige l'opération depuis la recette d'avant (profil d'origine, jamais le résultat
 * précédent) en remplaçant le dernier pas. Options (sans pas d'historique, valables pour la suite) : Capuchons (Ctrl
 * seul) pour un tour partiel, « Résultat en nouveau groupe » (Maj seul).
 *
 * Lot L22 (hors V1, D-202) : deux méthodes de plus, à section variable. **Effilement** : un clic sur le profil le balaie
 * le long de sa normale, l'échelle passant de 1 à l'échelle d'arrivée et la section tournant de la torsion ; le champ
 * Mesures prend « longueur ; échelle ; torsion » (ex. « 2;0,5;90 », champs vides gardés), avant ou juste après (correction
 * depuis la recette, un pas). **Loft** : un clic sur le premier profil, puis sur le second (mêmes nombres de sommets,
 * sans trou) ; le champ Mesures prend les tronçons « Ns ». Alt fait défiler les quatre méthodes.
 */
import {
  type AxeRevolution,
  type Id,
  type Modele,
  ANGLE_REVOLUTION_DEFAUT,
  ERREUR_REVOLUTION_AXE_NUL,
  SEGMENTS_PAR_TOUR_DEFAUT,
  contexte,
  ecartFacettage,
  grouper,
  effiler,
  loft,
  revolution,
  segmentsRevolution,
  suivezMoi,
  validerParametresRevolution,
} from "../geometrie-libre.js";
import { type Inference, geometrieVisible, inferer } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, dist, dot, len, normalize, scale, sub } from "../vecteur.js";
import { messageErreur } from "./commun-formes.js";
import { consigneDe, distanceLocale, echelleDansPlan, enLocal, idsSelectionnables, normaleMonde, pointsDe, saisieDe, selectionValide, vueModif, viseeElement } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, ModificateurSeul, OptionOutil, Transition, VueOutil } from "./machine.js";
import { optionsDans } from "./selection.js";

export const ID_SUIVEZ_MOI = "suivez-moi";

/** Aperçu calculé par le noyau : faces créées (monde de la racine ou repère du contexte), avec leurs trous. */
export interface ApercuSuivezMoi {
  readonly profil: Id;
  readonly faces: readonly (readonly Vec3[])[];
  readonly trous: readonly (readonly (readonly Vec3[])[])[];
  /** (Lot 10d) Révolution : segments effectivement posés et écart de facettage estimé (m). */
  readonly segments?: number;
  readonly ecart?: number;
}

export type MethodeSuivezMoi = "chemin" | "revolution" | "effilement" | "loft";
const METHODES: readonly MethodeSuivezMoi[] = ["chemin", "revolution", "effilement", "loft"];

/** Lot L22 : paramètres de l'effilement et recette de la dernière opération à section variable (correction). */
export interface ParamsEffilement {
  readonly longueur: number;
  readonly echelle: number;
  readonly torsion: number;
}
export interface RecetteVariable {
  readonly modeleAvant: Modele;
  readonly modeleApres: Modele;
  readonly profil: Id;
  readonly second: Id | null;
}

/** (Lot 10d, EX-RV-04) Recette d'une Révolution validée : la correction repart du modèle d'avant et du profil d'origine. */
export interface RecetteRevolution {
  readonly modeleAvant: Modele;
  readonly modeleApres: Modele;
  readonly profil: Id;
  readonly axe: AxeRevolution;
}

export interface EtatSuivezMoi {
  readonly erreur: string | null;
  /** (Lot 10c) Capuchons sur un chemin ouvert ; (lot 10d) coiffes d'un tour partiel. */
  readonly bouchons: boolean;
  /** (Lot 10c) Aperçu du profil survolé, ou `null`. */
  readonly apercu: ApercuSuivezMoi | null;
  /** (Lot 10d) Méthode : balayage le long d'un chemin, ou Révolution autour d'un axe. */
  readonly methode: MethodeSuivezMoi;
  /** (Lot 10d) Angle de révolution (degrés) et segments par tour complet. */
  readonly angle: number;
  readonly segments: number;
  /** (Lot 10d) Résultat rangé dans un nouveau groupe. */
  readonly groupe: boolean;
  /** (Lot 10d) Axe cliqué (monde) : premier point, puis second ; `null` = pas encore commencé. */
  readonly axeClique: { readonly a: Vec3; readonly b: Vec3 | null } | null;
  /** (Lot 10d) Inférence du curseur pendant la pose de l'axe. */
  readonly inference: Inference | null;
  /** (Lot 10d) Dernière Révolution validée, corrigeable par le champ Mesures et les options. */
  readonly dernier: RecetteRevolution | null;
  /** Lot L22 : réglages de l'effilement, tronçons du loft, premier profil du loft, dernière opération variable. */
  readonly effilement: ParamsEffilement;
  readonly troncons: number;
  readonly premierProfil: Id | null;
  readonly derniereVariable: RecetteVariable | null;
}

/** Chemin déduit de la présélection : une face, sinon des arêtes. */
function cheminPresélectionné(ctx: ContexteOutil): { face: Id } | { aretes: readonly Id[] } | null {
  const c = contexte(ctx.modele, ctx.dans);
  const ids = selectionValide(ctx);
  const faces = ids.filter((id) => c.faces[id]);
  if (faces.length === 1) return { face: faces[0] as Id };
  const aretes = ids.filter((id) => c.aretes[id]);
  return aretes.length > 0 ? { aretes } : null;
}

export const ERREUR_SANS_CHEMIN = "Présélectionnez d'abord le chemin : une face (son périmètre) ou des arêtes continues.";

/** Balayage candidat : le noyau calcule sur une copie immuable ; seul le rapport sert à l'aperçu. */
function candidat(ctx: ContexteOutil, profil: Id, chemin: { face: Id } | { aretes: readonly Id[] }, bouchons: boolean): { modele: Modele; apercu: ApercuSuivezMoi } {
  const r = suivezMoi(ctx.modele, profil, chemin, { ...optionsDans(ctx), bouchons });
  return { modele: r.modele, apercu: apercuDe(ctx, r.modele, r.rapport.crees, profil) };
}

function apercuDe(ctx: ContexteOutil, m: Modele, crees: readonly Id[], profil: Id): ApercuSuivezMoi {
  const c = contexte(m, ctx.dans);
  const pos = (s: Id) => (c.sommets[s] as { position: Vec3 }).position;
  const faces = crees.filter((id) => c.faces[id]);
  return { profil, faces: faces.map((id) => c.faces[id]!.exterieur.map(pos)), trous: faces.map((id) => c.faces[id]!.trous.map((b) => b.map(pos))) };
}

// ————————————————————————————————————————————————————————————— Révolution (lot 10d)

/** Axe en repère du contexte d'édition : arête présélectionnée seule, sinon les deux points cliqués. */
function axeDe(etat: EtatSuivezMoi, ctx: ContexteOutil): AxeRevolution | null {
  const c = contexte(ctx.modele, ctx.dans);
  const ids = selectionValide(ctx);
  const aretes = ids.filter((id) => c.aretes[id]);
  if (etat.axeClique === null && aretes.length === 1 && !ids.some((id) => c.faces[id])) {
    const a = c.aretes[aretes[0] as Id]!;
    const A = c.sommets[a.a]!.position;
    return { origine: A, direction: sub(c.sommets[a.b]!.position, A) };
  }
  if (etat.axeClique?.b) {
    const L = enLocal(ctx).point;
    const A = L(etat.axeClique.a);
    return { origine: A, direction: sub(L(etat.axeClique.b), A) };
  }
  return null;
}

/** Révolution candidate (ou validée) : groupée sur demande ; l'aperçu annonce segments et écart de facettage. */
function tourner(etat: EtatSuivezMoi, ctx: ContexteOutil, m: Modele, profil: Id, axe: AxeRevolution): { modele: Modele; apercu: ApercuSuivezMoi } {
  const r = revolution(m, profil, axe, { ...optionsDans(ctx), angle: etat.angle, segments: etat.segments, bouchons: etat.bouchons });
  const c0 = contexte(m, ctx.dans);
  const f = c0.faces[profil]!;
  const u = normalize(axe.direction);
  const rayon = Math.max(...f.exterieur.map((s) => {
    const p = sub(c0.sommets[s]!.position, axe.origine);
    return len(sub(p, scale(u, dot(p, u))));
  }));
  const complet = Math.abs(Math.abs(etat.angle) - 360) <= 1e-9;
  const base = apercuDe(ctx, r.modele, r.rapport.crees, profil);
  const apercu = { ...base, segments: complet ? etat.segments : segmentsRevolution(etat.angle, etat.segments), ecart: ecartFacettage(rayon, etat.segments) };
  if (!etat.groupe) return { modele: r.modele, apercu };
  const ids = idsSelectionnables(r.rapport.crees).filter((id) => !id.startsWith("o"));
  return { modele: grouper(r.modele, ids, optionsDans(ctx)).modele, apercu };
}

/** Inférence du curseur pour poser l'axe (accrochage aux sommets, arêtes, axes du modèle). */
function infererAxe(etat: EtatSuivezMoi, ctx: ContexteOutil, ev: { rayon: { origine: Vec3; direction: Vec3 }; tolerance: number }): Inference {
  return inferer({
    rayon: ev.rayon,
    tolerance: ev.tolerance,
    geometrie: geometrieVisible(ctx.modele),
    ...(ctx.repere ? { axes: ctx.repere } : {}),
    ...(etat.axeClique ? { depart: etat.axeClique.a } : {}),
  });
}

/** Correction de la dernière Révolution (EX-RV-04) : recalcul depuis la recette, le dernier pas est remplacé. */
function corriger(etat: EtatSuivezMoi, ctx: ContexteOutil): Transition<EtatSuivezMoi> | null {
  const d = etat.dernier;
  if (!d || ctx.modele !== d.modeleApres) return null;
  try {
    const r = tourner(etat, { ...ctx, modele: d.modeleAvant }, d.modeleAvant, d.profil, d.axe);
    return { etat: { ...etat, erreur: null, apercu: null, dernier: { ...d, modeleApres: r.modele } }, modele: r.modele, remplaceDernier: true, operation: "Révolution" };
  } catch (err) {
    return { etat: { ...etat, erreur: messageErreur(err) } };
  }
}

function traiterRevolution(etat: EtatSuivezMoi, ev: Parameters<MachineOutil<EtatSuivezMoi>["traiter"]>[1], ctx: ContexteOutil): Transition<EtatSuivezMoi> {
  const axe = axeDe(etat, ctx);
  switch (ev.genre) {
    case "survol": {
      if (!axe) return { etat: { ...etat, inference: infererAxe(etat, ctx, ev), apercu: null } };
      const { el, cible } = viseeElement(ctx, ev);
      if (!el || el.genre !== "face" || cible?.genre !== "face") return { etat: { ...etat, erreur: null, apercu: null, inference: null } };
      if (etat.apercu?.profil === cible.id) return { etat };
      try {
        return { etat: { ...etat, erreur: null, inference: null, apercu: tourner(etat, ctx, ctx.modele, cible.id, axe).apercu } };
      } catch (err) {
        return { etat: { ...etat, erreur: messageErreur(err), apercu: null, inference: null } };
      }
    }
    case "clic": {
      if (!axe) {
        const p = infererAxe(etat, ctx, ev).point;
        if (!etat.axeClique) return { etat: { ...etat, axeClique: { a: p, b: null }, erreur: null } };
        if (dist(p, etat.axeClique.a) <= 1e-9) return { etat: { ...etat, erreur: ERREUR_REVOLUTION_AXE_NUL } };
        return { etat: { ...etat, axeClique: { a: etat.axeClique.a, b: p }, inference: null, erreur: null } };
      }
      const { el, cible } = viseeElement(ctx, ev);
      if (!el || el.genre !== "face" || cible?.genre !== "face") return { etat: { ...etat, erreur: "Cliquez sur la face qui sert de profil." } };
      try {
        const r = tourner(etat, ctx, ctx.modele, cible.id, axe);
        // L'arête présélectionnée comme axe reste sélectionnée : un autre profil peut tourner autour du même axe. Si elle
        // bordait le profil et a été consommée avec lui, l'axe est gardé comme axe cliqué (mêmes points, monde).
        let axeClique = etat.axeClique;
        const areteAxe = etat.axeClique ? undefined : selectionValide(ctx).find((id) => contexte(ctx.modele, ctx.dans).aretes[id]);
        if (areteAxe && !contexte(r.modele, ctx.dans).aretes[areteAxe]) {
          const [a, b] = pointsDe(ctx.modele, [areteAxe]);
          if (a && b) axeClique = { a, b };
        }
        return {
          etat: { ...etat, axeClique, erreur: null, apercu: null, dernier: { modeleAvant: ctx.modele, modeleApres: r.modele, profil: cible.id, axe } },
          modele: r.modele,
          ...(axeClique ? { selection: [] } : {}),
          operation: "Révolution",
        };
      } catch (err) {
        return { etat: { ...etat, erreur: messageErreur(err), apercu: null } };
      }
    }
    case "saisie": {
      const res = analyserSaisie(ev.texte, saisieDe("angle-arc", ctx));
      if (res.genre === "erreur") return { etat: { ...etat, erreur: res.message } };
      const suite = res.genre === "angle" ? { ...etat, angle: res.degres } : res.genre === "segments" ? { ...etat, segments: res.nombre } : null;
      if (!suite) return { etat: { ...etat, erreur: `Saisie « ${ev.texte} » non reconnue : un angle (ex. 90) ou des segments par tour (ex. 96s).` } };
      try {
        validerParametresRevolution(suite.angle, suite.segments);
      } catch (err) {
        return { etat: { ...etat, erreur: messageErreur(err) } };
      }
      return corriger(suite, ctx) ?? { etat: { ...suite, erreur: null, apercu: null, dernier: null } };
    }
    case "echap":
      return { etat: { ...etat, erreur: null, apercu: null, axeClique: null, inference: null, dernier: null }, selection: [] };
    default:
      return { etat };
  }
}

// ————————————————————————————————————————————————————————————— Effilement et loft (lot L22)

export const CONSIGNE_EFFILEMENT = "Effilement : cliquez sur le profil";
export const CONSIGNE_LOFT_1 = "Loft : cliquez sur le premier profil.";
export const CONSIGNE_LOFT_2 = "Loft : cliquez sur le second profil.";
export const ERREUR_SAISIE_EFFILEMENT = "Saisissez « longueur ; échelle ; torsion » (ex. 2;0,5;90) — un champ vide garde sa valeur.";

/**
 * Opération à section variable sur `m` : effilement du profil, ou loft entre les deux profils. Revue de #135 : la longueur
 * tapée est en mètres monde, ramenée le long de la normale locale du profil (EX-MODEL-02, refus nommé si une échelle non
 * uniforme fausserait la dimension) ; une torsion dans un plan à l'échelle non uniforme est refusée de même (l'angle n'y
 * serait pas celui tapé). Le loft, défini par ses deux profils, n'a rien à convertir ; il suit l'option Capuchons.
 */
function variable(etat: EtatSuivezMoi, ctx: ContexteOutil, m: Modele, profil: Id, second: Id | null): Modele {
  if (etat.methode === "loft") return loft(m, profil, second as Id, { ...optionsDans(ctx), segments: etat.troncons, bouchons: etat.bouchons }).modele;
  const p = etat.effilement;
  const ctxBase = { ...ctx, modele: m };
  const nLocale = contexte(m, ctx.dans).faces[profil]?.normale;
  let longueur = p.longueur;
  if (nLocale) {
    const nMonde = normaleMonde(ctxBase, nLocale);
    longueur = distanceLocale(ctxBase, nMonde, nLocale, p.longueur);
    if (Math.abs(p.torsion) > 1e-9) echelleDansPlan(ctxBase, nMonde);
  }
  return effiler(m, profil, { ...optionsDans(ctx), longueur, echelle: p.echelle, torsion: p.torsion, bouchons: etat.bouchons }).modele;
}

/** « longueur ; échelle ; torsion » : virgule décimale ou point, champs vides gardés ; `null` si illisible. */
function lireEffilement(texte: string, p: ParamsEffilement, ctx: ContexteOutil): ParamsEffilement | null {
  const parties = texte.split(";").map((x) => x.trim());
  if (parties.length === 0 || parties.length > 3) return null;
  const nombre = (x: string): number | null => {
    const v = Number(x.replace(",", ".").replace(/°$/, ""));
    return Number.isFinite(v) ? v : null;
  };
  let { longueur, echelle, torsion } = p;
  if (parties[0]) {
    const r = analyserSaisie(parties[0], saisieDe("longueur", ctx));
    if (r.genre !== "longueur") return null;
    longueur = r.valeur;
  }
  if (parties[1]) {
    const v = nombre(parties[1]);
    if (v === null) return null;
    echelle = v;
  }
  if (parties[2]) {
    const v = nombre(parties[2]);
    if (v === null) return null;
    torsion = v;
  }
  return { longueur, echelle, torsion };
}

function traiterVariable(etat: EtatSuivezMoi, ev: Parameters<MachineOutil<EtatSuivezMoi>["traiter"]>[1], ctx: ContexteOutil): Transition<EtatSuivezMoi> {
  switch (ev.genre) {
    case "survol": {
      const { el, cible } = viseeElement(ctx, ev);
      if (!el || el.genre !== "face" || cible?.genre !== "face") return { etat: { ...etat, erreur: null, apercu: null } };
      if (etat.methode === "loft" && (!etat.premierProfil || etat.premierProfil === cible.id)) return { etat: { ...etat, apercu: null } };
      if (etat.apercu?.profil === cible.id) return { etat };
      try {
        const m = variable(etat, ctx, ctx.modele, etat.methode === "loft" ? (etat.premierProfil as Id) : cible.id, etat.methode === "loft" ? cible.id : null);
        const c0 = contexte(ctx.modele, ctx.dans);
        const crees = Object.keys(contexte(m, ctx.dans).faces).filter((f) => !c0.faces[f]);
        return { etat: { ...etat, erreur: null, apercu: apercuDe(ctx, m, crees, cible.id) } };
      } catch (err) {
        return { etat: { ...etat, erreur: messageErreur(err), apercu: null } };
      }
    }
    case "clic": {
      const { el, cible } = viseeElement(ctx, ev);
      if (!el || el.genre !== "face" || cible?.genre !== "face") return { etat: { ...etat, erreur: "Cliquez sur la face qui sert de profil." } };
      if (etat.methode === "loft" && !etat.premierProfil) return { etat: { ...etat, premierProfil: cible.id, erreur: null, apercu: null }, selection: [cible.id] };
      const profil = etat.methode === "loft" ? (etat.premierProfil as Id) : cible.id;
      const second = etat.methode === "loft" ? cible.id : null;
      try {
        const m = variable(etat, ctx, ctx.modele, profil, second);
        return {
          etat: { ...etat, erreur: null, apercu: null, premierProfil: null, derniereVariable: { modeleAvant: ctx.modele, modeleApres: m, profil, second } },
          modele: m,
          selection: [],
          operation: etat.methode === "loft" ? "Loft" : "Effilement",
        };
      } catch (err) {
        return { etat: { ...etat, erreur: messageErreur(err), apercu: null } };
      }
    }
    case "saisie": {
      let suite: EtatSuivezMoi | null = null;
      if (etat.methode === "loft") {
        const r = analyserSaisie(ev.texte, saisieDe("angle-arc", ctx));
        if (r.genre === "segments" && Number.isInteger(r.nombre) && r.nombre >= 1 && r.nombre <= 512) suite = { ...etat, troncons: r.nombre };
        else return { etat: { ...etat, erreur: "Saisissez des tronçons « Ns » (ex. 4s), de 1 à 512." } };
      } else {
        const p = lireEffilement(ev.texte, etat.effilement, ctx);
        if (!p) return { etat: { ...etat, erreur: ERREUR_SAISIE_EFFILEMENT } };
        suite = { ...etat, effilement: p };
      }
      // Correction juste après : recalcul depuis la recette (profil d'origine), le dernier pas est remplacé.
      const d = etat.derniereVariable;
      if (d && ctx.modele === d.modeleApres) {
        try {
          const m = variable(suite, { ...ctx, modele: d.modeleAvant }, d.modeleAvant, d.profil, d.second);
          return { etat: { ...suite, erreur: null, apercu: null, derniereVariable: { ...d, modeleApres: m } }, modele: m, remplaceDernier: true, operation: etat.methode === "loft" ? "Loft" : "Effilement" };
        } catch (err) {
          return { etat: { ...etat, erreur: messageErreur(err) } };
        }
      }
      return { etat: { ...suite, erreur: null, apercu: null, derniereVariable: null } };
    }
    case "echap":
      return { etat: { ...etat, erreur: null, apercu: null, premierProfil: null, derniereVariable: null }, selection: [] };
    default:
      return { etat };
  }
}

function vueVariable(etat: EtatSuivezMoi, ctx: ContexteOutil): VueOutil {
  const p = etat.effilement;
  const consigne =
    etat.methode === "loft"
      ? etat.premierProfil
        ? CONSIGNE_LOFT_2
        : CONSIGNE_LOFT_1
      : `${CONSIGNE_EFFILEMENT} (longueur ${formaterNombre(p.longueur)} m, échelle ${formaterNombre(p.echelle)}, torsion ${formaterNombre(p.torsion)}°).`;
  const v = vueModif({
    consigne,
    mesures: etat.methode === "loft"
      ? { libelle: "Tronçons", valeur: `${etat.troncons}s`, saisie: saisieDe("angle-arc", ctx) }
      : { libelle: "Longueur ; échelle ; torsion", valeur: `${formaterNombre(p.longueur)};${formaterNombre(p.echelle)};${formaterNombre(p.torsion)}`, saisie: saisieDe("longueur", ctx) },
    ctx,
    erreur: etat.erreur,
  });
  return { ...v, options: options(etat), ...(etat.apercu ? { apercu: { ...v.apercu, faces: etat.apercu.faces, trous: etat.apercu.trous } } : {}) };
}

function options(e: EtatSuivezMoi): OptionOutil[] {
  const r: OptionOutil[] = [
    { id: "methode", valeur: e.methode, valeurs: METHODES.map((id) => ({ id, disponible: true, raccourci: "Alt" })) },
    { id: "bouchons", valeur: e.bouchons ? "avec" : "sans", valeurs: [{ id: "avec", disponible: true, raccourci: "Ctrl" }, { id: "sans", disponible: true, raccourci: "Ctrl" }] },
  ];
  if (e.methode === "revolution") r.push({ id: "groupe", valeur: e.groupe ? "oui" : "non", valeurs: [{ id: "non", disponible: true, raccourci: "Maj" }, { id: "oui", disponible: true, raccourci: "Maj" }] });
  return r;
}

const formaterNombre = (x: number): string => (Math.round(x * 1000) / 1000).toString();

export const machineSuivezMoi: MachineOutil<EtatSuivezMoi> = {
  id: ID_SUIVEZ_MOI,
  initial: () => ({
    erreur: null,
    bouchons: true,
    apercu: null,
    methode: "chemin",
    angle: ANGLE_REVOLUTION_DEFAUT,
    segments: SEGMENTS_PAR_TOUR_DEFAUT,
    groupe: false,
    axeClique: null,
    inference: null,
    dernier: null,
    effilement: { longueur: 1, echelle: 0.5, torsion: 0 },
    troncons: 1,
    premierProfil: null,
    derniereVariable: null,
  }),

  traiter(etat, ev, ctx): Transition<EtatSuivezMoi> {
    if (etat.methode === "revolution") return traiterRevolution(etat, ev, ctx);
    if (etat.methode === "effilement" || etat.methode === "loft") return traiterVariable(etat, ev, ctx);
    switch (ev.genre) {
      case "survol": {
        const chemin = cheminPresélectionné(ctx);
        const { el, cible } = viseeElement(ctx, ev);
        if (!chemin || !el || el.genre !== "face" || cible?.genre !== "face" || ("face" in chemin && chemin.face === cible.id)) return { etat: { ...etat, erreur: null, apercu: null } };
        if (etat.apercu?.profil === cible.id) return { etat };
        try {
          return { etat: { ...etat, erreur: null, apercu: candidat(ctx, cible.id, chemin, etat.bouchons).apercu } };
        } catch (err) {
          return { etat: { ...etat, erreur: messageErreur(err), apercu: null } };
        }
      }
      case "clic": {
        const chemin = cheminPresélectionné(ctx);
        if (!chemin) return { etat: { ...etat, erreur: ERREUR_SANS_CHEMIN } };
        const { el, cible } = viseeElement(ctx, ev);
        if (!el || el.genre !== "face" || cible?.genre !== "face") return { etat: { ...etat, erreur: "Cliquez sur la face qui sert de profil." } };
        if ("face" in chemin && chemin.face === cible.id) return { etat: { ...etat, erreur: "Le profil doit être une autre face que le chemin." } };
        try {
          const r = candidat(ctx, cible.id, chemin, etat.bouchons);
          return { etat: { ...etat, erreur: null, apercu: null }, modele: r.modele, selection: [], operation: "Suivez-moi" };
        } catch (err) {
          return { etat: { ...etat, erreur: messageErreur(err), apercu: null } };
        }
      }
      case "echap":
        return { etat: { ...etat, erreur: null, apercu: null }, selection: [] };
      default:
        return { etat };
    }
  },

  configurer(etat, option, valeur): Transition<EtatSuivezMoi> {
    let suite: EtatSuivezMoi | null = null;
    if (option === "bouchons" && (valeur === "avec" || valeur === "sans")) suite = { ...etat, bouchons: valeur === "avec", apercu: null, erreur: null };
    if (option === "groupe" && (valeur === "oui" || valeur === "non")) suite = { ...etat, groupe: valeur === "oui", apercu: null, erreur: null };
    if (option === "methode" && (METHODES as readonly string[]).includes(valeur)) {
      return { etat: { ...etat, methode: valeur as MethodeSuivezMoi, apercu: null, erreur: null, axeClique: null, inference: null, dernier: null, premierProfil: null, derniereVariable: null } };
    }
    // Une option ne crée jamais de pas d'historique : elle vaut pour la prochaine Révolution (ou pour une correction
    // par le champ Mesures, qui repart de la recette).
    return { etat: suite ?? etat };
  },

  modificateurSeul(etat, touche: ModificateurSeul, ctx): Transition<EtatSuivezMoi> {
    if (touche === "Alt") return this.configurer!(etat, "methode", METHODES[(METHODES.indexOf(etat.methode) + 1) % METHODES.length] as string, ctx);
    if (touche === "Ctrl") return this.configurer!(etat, "bouchons", etat.bouchons ? "sans" : "avec", ctx);
    if (etat.methode === "revolution") return this.configurer!(etat, "groupe", etat.groupe ? "non" : "oui", ctx);
    return { etat };
  },

  vue(etat, ctx): VueOutil {
    if (etat.methode === "revolution") return vueRevolution(etat, ctx);
    if (etat.methode === "effilement" || etat.methode === "loft") return vueVariable(etat, ctx);
    const v = vueModif({ consigne: consigneDe(ID_SUIVEZ_MOI, 0), mesures: null, ctx, erreur: etat.erreur });
    return {
      ...v,
      options: options(etat),
      ...(etat.apercu ? { apercu: { ...v.apercu, faces: etat.apercu.faces, trous: etat.apercu.trous } } : {}),
    };
  },
};

export const CONSIGNE_AXE_1 = "Révolution : cliquez le premier point de l'axe, ou présélectionnez une arête comme axe.";
export const CONSIGNE_AXE_2 = "Révolution : cliquez le second point de l'axe.";
export const CONSIGNE_PROFIL_REVOLUTION = "Révolution : cliquez sur le profil à tourner autour de l'axe";

function vueRevolution(etat: EtatSuivezMoi, ctx: ContexteOutil): VueOutil {
  const axe = axeDe(etat, ctx);
  const reglage = `${formaterNombre(etat.angle)}°, ${etat.segments} segments par tour`;
  let consigne = !axe ? (etat.axeClique ? CONSIGNE_AXE_2 : CONSIGNE_AXE_1) : `${CONSIGNE_PROFIL_REVOLUTION} (${reglage}).`;
  if (axe && etat.apercu?.segments !== undefined) {
    consigne = `${consigne.slice(0, -1)} — ${etat.apercu.segments} segment${etat.apercu.segments > 1 ? "s" : ""}, écart de facettage ≈ ${formaterNombre((etat.apercu.ecart ?? 0) * 1000)} mm.`;
  }
  const v = vueModif({
    consigne,
    mesures: { libelle: "Angle / segments", valeur: etat.dernier ? `${formaterNombre(etat.angle)}°` : "", saisie: saisieDe("angle-arc", ctx) },
    ctx,
    erreur: etat.erreur,
    inference: etat.inference,
  });
  const lignes: Vec3[][] = [];
  if (etat.axeClique) {
    const fin = etat.axeClique.b ?? etat.inference?.point;
    if (fin) lignes.push([etat.axeClique.a, fin]);
  }
  return {
    ...v,
    options: options(etat),
    apercu: { ...v.apercu, pointilles: lignes, ...(etat.apercu ? { faces: etat.apercu.faces, trous: etat.apercu.trous } : {}) },
  };
}
