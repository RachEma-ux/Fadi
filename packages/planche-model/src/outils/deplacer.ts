/**
 * Outil Déplacer (cahier-planche §4.16, relevé outils-modification §2) — machine pure.
 *
 * Clic-clic (pas de glisser) : point de base (accroché de préférence), la sélection suit le curseur, clic de
 * destination ou distance + Entrée. Sans présélection, le clic choisit l'élément : face, objet (groupe / composant),
 * arête ou courbe, et un SOMMET (extrémité) ou une arête seule ÉTIRE la géométrie connectée. Ctrl : cycle Copier →
 * Tamponner → Déplacer (avant le clic) ; pendant le déplacement un appui bascule Déplacer ⇄ Copier. Flèches : → rouge,
 * ← vert, ↑ bleu (bascules), ↓ parallèle à la dernière arête survolée ; Maj maintenue : verrou de l'inférence courante.
 * Saisie : une distance (dans la direction du curseur ou de l'axe verrouillé), `[x;y;z]` absolu, `<dx;dy;dz>` relatif.
 * Après une copie : « x3 » / « 3x » = 3 copies au même pas, « /3 » = 3 intervalles ; retaper une distance ré-espace le
 * réseau ; copie + réseau + ré-espacement = un seul pas d'annulation. Tampon : chaque clic pose une copie (un pas chacun).
 * Alt (pliage automatique) : bascule — le noyau plie toujours les faces devenues non planes.
 */
import { type Id, type Reseau, contexte, copier, deplacer } from "../geometrie-libre.js";
import { type Inference, type ModeAlt, type Verrou, geometrieVisible, inferer } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, AXE_Z, EPS, TOL, add, cross, dot, len, normalize, scale, sub } from "../vecteur.js";
import { type Derniere, contexteSaisie, corrigeable, formaterLongueur, mesures, messageErreur, prefixe } from "./commun-formes.js";
import {
  VECTEUR_AXE,
  axeDeToucheFleche,
  consigneDe,
  enLocal,
  idsSelectionnables,
  libelleMesuresDe,
  reference,
  selectionValide,
  sommetEn,
  vueModif,
  viseeElement,
  type VerrouFleche,
} from "./commun-modif.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Transition, VueOutil } from "./machine.js";
import { idsDuClic, optionsDans } from "./selection.js";

export const ID_DEPLACER = "deplacer";
export type ModeDeplacement = "deplacer" | "copier" | "tampon";

interface ParamsDeplacement {
  readonly entites: readonly Id[];
  /** Vecteur de la 1ʳᵉ copie ou du déplacement (repère du contexte d'édition). */
  readonly vecteur: Vec3;
  readonly copie: boolean;
  readonly reseau: Reseau | null;
}

export interface EtatDeplacer {
  readonly etape: 1 | 2;
  readonly mode: ModeDeplacement;
  readonly base: Vec3 | null;
  readonly entites: readonly Id[];
  /** Sommet déplacé seul (pas de copie, consigne dédiée). */
  readonly sommet: boolean;
  readonly fleche: VerrouFleche | null;
  readonly verrouMaj: Verrou | null;
  readonly modeAlt: ModeAlt;
  readonly autoPli: boolean;
  readonly inference: Inference | null;
  readonly areteReference: { readonly a: Vec3; readonly b: Vec3 } | null;
  readonly texte: string | null;
  readonly erreur: string | null;
  readonly derniere: Derniere<ParamsDeplacement> | null;
}

function initial(): EtatDeplacer {
  return {
    etape: 1,
    mode: "deplacer",
    base: null,
    entites: [],
    sommet: false,
    fleche: null,
    verrouMaj: null,
    modeAlt: "tout",
    autoPli: true,
    inference: null,
    areteReference: null,
    texte: null,
    erreur: null,
    derniere: null,
  };
}

const retour = (e: EtatDeplacer): EtatDeplacer => ({ ...e, etape: 1, mode: "deplacer", base: null, entites: [], sommet: false, fleche: null, verrouMaj: null, inference: null });

const verrouCourant = (e: EtatDeplacer): Verrou | undefined => e.verrouMaj ?? e.fleche?.verrou;

function cyclerCtrl(e: EtatDeplacer): ModeDeplacement {
  if (e.etape === 1) return e.mode === "deplacer" ? "copier" : e.mode === "copier" ? "tampon" : "deplacer";
  // Pendant le déplacement : Déplacer ⇄ Copier ; le Tampon rend la main au déplacement.
  return e.mode === "deplacer" ? "copier" : "deplacer";
}

/** Inférence de destination (point de départ = base) avec verrous et mode Alt. */
function inferer3(e: EtatDeplacer, ctx: ContexteOutil, ev: Extract<EvenementOutil, { genre: "survol" | "clic" }>): Inference {
  const v = verrouCourant(e);
  return inferer({
    rayon: ev.rayon,
    tolerance: ev.tolerance,
    geometrie: geometrieVisible(ctx.modele),
    modeAlt: e.modeAlt,
    ...(ctx.repere ? { axes: ctx.repere } : {}),
    ...(e.base ? { depart: e.base } : {}),
    ...(v ? { verrou: v } : {}),
    ...(e.areteReference ? { areteReference: e.areteReference } : {}),
  });
}

function vecteurCurseur(e: EtatDeplacer): Vec3 | null {
  return e.base && e.inference ? sub(e.inference.point, e.base) : null;
}

/** Direction d'une distance tapée : verrou d'axe (sens du curseur, sinon +axe), sinon direction du curseur. */
function directionSaisie(e: EtatDeplacer): Vec3 | null {
  const v = vecteurCurseur(e);
  const fl = e.fleche?.verrou;
  if (fl && fl.genre === "axe") {
    const a = VECTEUR_AXE[fl.axe];
    return v && len(v) > TOL && dot(v, a) < 0 ? scale(a, -1) : a;
  }
  if (fl && fl.genre === "direction") {
    const d = normalize(fl.direction);
    return v && len(v) > TOL && dot(v, d) < 0 ? scale(d, -1) : d;
  }
  return v && len(v) > TOL ? normalize(v) : null;
}

function appliquer(
  e: EtatDeplacer,
  ctx: ContexteOutil,
  p: ParamsDeplacement,
  texte: string | null,
  remplace: Derniere<ParamsDeplacement> | null,
  ordre: "pose" | "reseau",
): Transition<EtatDeplacer> {
  if (len(p.vecteur) < EPS) return { etat: { ...retour(e), texte, erreur: "Déplacement nul : rien n'a été déplacé." } };
  const base = remplace ? remplace.avant : ctx.modele;
  try {
    let r;
    if (p.copie) r = copier(base, p.entites, p.vecteur, p.reseau ?? { copies: 1 }, optionsDans(ctx));
    else r = deplacer(base, p.entites, p.vecteur, optionsDans(ctx));
    const derniere = { avant: base, apres: r.modele, params: p };
    const tampon = e.mode === "tampon" && ordre === "pose";
    const nouveau: EtatDeplacer = tampon ? { ...e, texte, erreur: null, derniere } : { ...retour(e), texte, erreur: null, derniere };
    return {
      etat: nouveau,
      modele: r.modele,
      selection: p.copie ? (ordre === "reseau" ? [] : idsSelectionnables(r.rapport.crees)) : p.entites,
      operation: p.copie ? (e.mode === "tampon" ? "Tamponner" : "Copier") : "Déplacer",
      ...(remplace ? { remplaceDernier: true } : {}),
    };
  } catch (err) {
    return { etat: { ...retour(e), texte, erreur: messageErreur(err) } };
  }
}

/** Entités choisies par un clic sans présélection : sommet (extrémité), arête / courbe, face, objet. */
function entitesDuClic(ctx: ContexteOutil, ev: Extract<EvenementOutil, { genre: "clic" }>, inf: Inference): { ids: Id[]; sommet: boolean } | null {
  const { el, cible } = viseeElement(ctx, ev);
  if (!el || !cible) return null;
  if (el.genre === "arete" && cible.genre === "arete" && inf.type === "extremite") {
    const s = sommetEn(ctx, inf.point);
    if (s) return { ids: [s], sommet: true };
  }
  if (cible.genre === "arete" && el.genre === "arete") {
    // Une arête seule s'étire ; une courbe (cercle, arc) se déplace entière.
    const k = idsDuClic(ctx.modele, ctx.dans, cible, 1);
    return { ids: k, sommet: false };
  }
  return { ids: idsDuClic(ctx.modele, ctx.dans, cible, 1), sommet: false };
}

function saisir(e: EtatDeplacer, ctx: ContexteOutil, texte: string): Transition<EtatDeplacer> {
  const res = analyserSaisie(texte, contexteSaisie("distance-reseau", ctx));
  if (res.genre === "erreur") return { etat: { ...e, texte, erreur: res.message } };
  const L = enLocal(ctx);
  if (e.etape === 2 && e.base) {
    const copie = e.mode !== "deplacer";
    const mk = (v: Vec3): ParamsDeplacement => ({ entites: e.entites, vecteur: L.vecteur(e.base as Vec3, v), copie, reseau: copie ? { copies: 1 } : null });
    if (res.genre === "longueur") {
      const d = directionSaisie(e);
      if (!d) return { etat: { ...e, texte, erreur: "Orientez le curseur (ou verrouillez un axe avec une flèche) pour donner la direction." } };
      return appliquer(e, ctx, mk(scale(d, res.valeur)), texte, null, "pose");
    }
    if (res.genre === "point") {
      const v = res.reference === "absolue" ? sub(res.point, e.base) : res.point;
      return appliquer(e, ctx, mk(v), texte, null, "pose");
    }
    return { etat: { ...e, texte, erreur: "Faites d'abord une copie : le réseau (« x3 », « /3 ») s'applique à la copie qui vient d'être posée." } };
  }
  if (corrigeable(e.derniere, ctx)) {
    const d = e.derniere;
    if (res.genre === "reseau") {
      if (!d.params.copie) return { etat: { ...e, texte, erreur: "Le réseau suppose une copie : activez Ctrl avant de déplacer." } };
      const reseau: Reseau = res.mode === "copies" ? { copies: res.nombre } : { divisions: res.nombre };
      return appliquer(e, ctx, { ...d.params, reseau }, texte, d, "reseau");
    }
    if (res.genre === "longueur") {
      const u = normalize(d.params.vecteur);
      return appliquer(e, ctx, { ...d.params, vecteur: scale(u, res.valeur) }, texte, d, d.params.reseau && "copies" in d.params.reseau && d.params.reseau.copies > 1 ? "reseau" : "pose");
    }
    if (res.genre === "point") {
      return { etat: { ...e, texte, erreur: "Après coup, saisissez une distance ou un réseau." } };
    }
  }
  return { etat: { ...e, texte, erreur: "Cliquez d'abord pour poser le point de base." } };
}

export const machineDeplacer: MachineOutil<EtatDeplacer> = {
  id: ID_DEPLACER,
  initial,

  traiter(etat, ev, ctx): Transition<EtatDeplacer> {
    switch (ev.genre) {
      case "survol": {
        const i = inferer3(etat, ctx, ev);
        return { etat: { ...etat, inference: i, areteReference: reference(etat.areteReference, i, ctx), texte: null, erreur: null } };
      }
      case "clic": {
        const i = inferer3(etat, ctx, ev);
        if (etat.etape === 1) {
          let entites = selectionValide(ctx);
          let sommet = false;
          let selection: readonly string[] | undefined;
          if (entites.length === 0) {
            const choix = entitesDuClic(ctx, ev, i);
            if (!choix) return { etat: { ...etat, erreur: "Cliquez sur un élément à déplacer." } };
            entites = choix.ids;
            sommet = choix.sommet;
            selection = choix.sommet ? [] : choix.ids;
          }
          return { etat: { ...etat, etape: 2, base: i.point, entites, sommet, inference: i, texte: null, erreur: null, derniere: null }, ...(selection ? { selection } : {}) };
        }
        const base = etat.base as Vec3;
        const copie = etat.mode !== "deplacer" && !etat.sommet;
        const v = sub(i.point, base);
        return appliquer({ ...etat, inference: i }, ctx, { entites: etat.entites, vecteur: enLocal(ctx).vecteur(base, v), copie, reseau: copie ? { copies: 1 } : null }, null, null, "pose");
      }
      case "saisie":
        return saisir(etat, ctx, ev.texte);
      case "touche": {
        const t = ev.touche;
        if (t === "Maj") {
          if (ev.etat === "relachee") return { etat: { ...etat, verrouMaj: null } };
          if (etat.etape === 2 && etat.inference && !etat.verrouMaj) return { etat: { ...etat, verrouMaj: { genre: "inference", inference: etat.inference } } };
          return { etat };
        }
        if (ev.etat !== "enfoncee") return { etat };
        if (t === "Ctrl") {
          if (etat.sommet) return { etat }; // un sommet ne se copie pas
          return { etat: { ...etat, mode: cyclerCtrl(etat), erreur: null } };
        }
        if (t === "Alt") return { etat: { ...etat, autoPli: !etat.autoPli } };
        const axe = axeDeToucheFleche(t);
        if (axe) {
          if (etat.fleche?.touche === t) return { etat: { ...etat, fleche: null } };
          return { etat: { ...etat, fleche: { touche: t, verrou: { genre: "axe", axe } } } };
        }
        if (t === "FlecheBas") {
          if (etat.fleche?.touche === t) return { etat: { ...etat, fleche: null } };
          const ref = etat.areteReference;
          if (!ref) return { etat: { ...etat, erreur: "Survolez d'abord une arête : ↓ verrouille parallèlement ou perpendiculairement à elle." } };
          const par = normalize(sub(ref.b, ref.a));
          let perp = cross(AXE_Z, par);
          if (len(perp) < 1e-9) perp = cross(VECTEUR_AXE.x, par);
          perp = normalize(perp);
          const cur = vecteurCurseur(etat);
          const perpendiculaire = cur !== null && len(cur) > TOL && Math.abs(dot(cur, perp)) > Math.abs(dot(cur, par));
          const verrou: Verrou = perpendiculaire ? { genre: "direction", direction: perp, type: "perpendiculaire" } : { genre: "direction", direction: par, type: "parallele" };
          return { etat: { ...etat, fleche: { touche: t, verrou } } };
        }
        return { etat };
      }
      case "echap":
        if (etat.etape === 2) return { etat: { ...retour(etat), texte: null, erreur: null } };
        return { etat: { ...etat, mode: "deplacer" } };
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const sep = ctx.separateurDecimal;
    const avecSel = selectionValide(ctx).length > 0;
    let indice: number;
    if (etat.etape === 1) indice = etat.mode === "tampon" ? 5 : etat.mode === "copier" ? 3 : avecSel ? 1 : 0;
    else indice = etat.mode === "tampon" ? 5 : etat.sommet ? 6 : etat.mode === "copier" ? 4 : 2;
    const v = vecteurCurseur(etat);
    const valeur = etat.texte ?? (etat.etape === 2 && v ? `${prefixe(etat.inference)}${formaterLongueur(len(v), sep)}` : formaterLongueur(0, sep));
    const lignes: Vec3[][] = etat.etape === 2 && etat.base && etat.inference ? [[etat.base, etat.inference.point]] : [];
    // Fantôme : contour monde des entités déplacées, translaté du vecteur courant.
    if (etat.etape === 2 && v && len(v) > TOL) {
      const c = contexte(ctx.modele, ctx.dans);
      for (const id of etat.entites) {
        const f = c.faces[id];
        if (f) lignes.push([...f.exterieur.map((s) => add((c.sommets[s] as { position: Vec3 }).position, v)), add((c.sommets[f.exterieur[0] as Id] as { position: Vec3 }).position, v)]);
        const a = c.aretes[id];
        if (a) lignes.push([add((c.sommets[a.a] as { position: Vec3 }).position, v), add((c.sommets[a.b] as { position: Vec3 }).position, v)]);
      }
    }
    return vueModif({
      consigne: consigneDe(ID_DEPLACER, indice),
      mesures: mesures(libelleMesuresDe(ID_DEPLACER, indice), valeur, contexteSaisie("distance-reseau", ctx)),
      inference: etat.etape === 2 ? etat.inference : null,
      apercu: { lignes, faces: [] },
      ctx,
      erreur: etat.erreur,
    });
  },
};
