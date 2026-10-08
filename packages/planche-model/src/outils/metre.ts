/**
 * Outil Mètre (cahier-planche §4.27, relevé mesure-camera-panneaux §1.1) — machine pure.
 *
 * Modes (Ctrl, cycle Lignes de guide → Points de guide → Mesure) : en mode Lignes, partir d'une ARÊTE (clic sur
 * l'arête ou son milieu) puis un clic ou une distance crée une ligne de guide INFINIE parallèle à l'arête ; partir
 * d'un point puis cliquer dans le vide crée un guide FINI ; cliquer un point existant (extrémité, milieu, centre,
 * intersection, origine) mesure seulement (aucun guide, obs) et ouvre le redimensionnement : une distance saisie
 * alors redimensionne LA PLANCHE (jamais le bâtiment ni la parcelle), après confirmation (Entrée). En mode Points,
 * le clic d'arrivée pose un point de guide ; en mode Mesure rien n'est créé. Avant tout clic, le survol d'une
 * face affiche son aire (« Aire · 10,8 m² »). Flèches = verrous d'axe (bascules), Maj maintenue = verrou de
 * l'inférence courante, Échap annule. Un lecteur (`ctx.lecture`) mesure sans rien créer (CA-MET-4).
 */
import { type Id, type Modele, modifierAnnotations as modifierGuides, redimensionner } from "../geometrie-libre.js";
import { type Inference, type Verrou, geometrieVisible, inferer } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, add, cross, dist, dot, len, normalize, scale, sub } from "../vecteur.js";
import { contexteSaisie, formaterLongueur, formaterNombre, mesures, messageErreur, prefixe } from "./commun-formes.js";
import { type VerrouFleche, axeDeToucheFleche, consigneDe, libelleMesuresDe, reference, vueModif } from "./commun-modif.js";
import { REPERE_MODELE } from "./axes.js";
import type { ContexteOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";

export const ID_METRE = "metre";
export type ModeMetre = "lignes" | "points" | "mesure";
const MODES: readonly ModeMetre[] = ["lignes", "points", "mesure"];
const POINTS_ACCROCHES = new Set(["extremite", "milieu", "intersection", "centre", "origine"]);

export interface EtatMetre {
  readonly mode: ModeMetre;
  /** 1 : rien ; 2 : départ posé ; 3 : mesure point à point faite (redimensionnement possible). */
  readonly etape: 1 | 2 | 3;
  readonly depart: Vec3 | null;
  /** Direction de l'arête de départ (guide infini parallèle), null si le départ est un point. */
  readonly directionArete: Vec3 | null;
  readonly inference: Inference | null;
  readonly fleche: VerrouFleche | null;
  readonly verrouMaj: Verrou | null;
  readonly areteReference: { readonly a: Vec3; readonly b: Vec3 } | null;
  /** Aire de la face survolée à l'étape 1 (m²). */
  readonly aire: number | null;
  /** Mesure point à point (étape 3). */
  readonly mesure: { readonly a: Vec3; readonly b: Vec3 } | null;
  /** Redimensionnement proposé, en attente de confirmation (Entrée) ; Échap annule. */
  readonly confirmation: { readonly facteur: number; readonly de: number; readonly a: number } | null;
  readonly texte: string | null;
  readonly erreur: string | null;
}

const initial = (): EtatMetre => ({
  mode: "lignes",
  etape: 1,
  depart: null,
  directionArete: null,
  inference: null,
  fleche: null,
  verrouMaj: null,
  areteReference: null,
  aire: null,
  mesure: null,
  confirmation: null,
  texte: null,
  erreur: null,
});

const repos = (e: EtatMetre): EtatMetre => ({ ...e, etape: 1, depart: null, directionArete: null, mesure: null, confirmation: null, verrouMaj: null, inference: null });

function verrouCourant(e: EtatMetre): Verrou | undefined {
  return e.verrouMaj ?? e.fleche?.verrou ?? undefined;
}

function inferer2(e: EtatMetre, ctx: ContexteOutil, rayon: Rayon, tolerance: number): Inference {
  const v = verrouCourant(e);
  return inferer({
    rayon,
    tolerance,
    geometrie: geometrieVisible(ctx.modele),
    ...(e.depart ? { depart: e.depart } : {}),
    ...(v ? { verrou: v } : {}),
    ...(e.areteReference ? { areteReference: e.areteReference } : {}),
    ...(ctx.repere ? { axes: ctx.repere } : {}),
  });
}

/** Aire (m²) d'une face visible (monde), trous déduits. */
function aireFace(m: Modele, id: Id): number | null {
  const f = geometrieVisible(m).faces.find((x) => x.id === id);
  if (!f) return null;
  const n = normalize(f.normale);
  const aireBoucle = (b: readonly Vec3[]): number => {
    let s = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < b.length; i++) s = add(s, cross(b[i] as Vec3, b[(i + 1) % b.length] as Vec3));
    return Math.abs(dot(s, n)) / 2;
  };
  return aireBoucle(f.exterieur) - f.trous.reduce((t, b) => t + aireBoucle(b), 0);
}

/** Direction de l'arête visée par une inférence « sur l'arête » ou « milieu ». */
function directionAreteDe(i: Inference, ctx: ContexteOutil): Vec3 | null {
  if (i.entite === undefined || (i.type !== "sur-arete" && i.type !== "milieu")) return null;
  const a = geometrieVisible(ctx.modele).aretes.find((x) => x.id === i.entite);
  return a ? normalize(sub(a.b, a.a)) : null;
}

export function formaterAire(v: number, sep: "." | ","): string {
  return `${formaterNombre(v, v >= 10 ? 1 : 2, sep)} m²`;
}

/** Création du guide au point d'arrivée selon le mode et le départ ; null = mesure seule. */
function creer(e: EtatMetre, ctx: ContexteOutil, arrivee: Vec3, accroche: boolean): Transition<EtatMetre> {
  const depart = e.depart as Vec3;
  if (ctx.lecture || e.mode === "mesure" || dist(arrivee, depart) < 1e-9) {
    return { etat: { ...e, etape: 3, mesure: { a: depart, b: arrivee }, texte: null, erreur: null, confirmation: null } };
  }
  const direction = e.directionArete;
  const m = ctx.modele;
  try {
    const resultat = (() => {
      if (e.mode === "points") {
        return modifierGuides(m, (a, id) => {
          const g = id("g");
          a.guides[g] = { id: g, genre: "point", origine: arrivee };
          return g;
        });
      }
      if (direction) {
        return modifierGuides(m, (a, id) => {
          const g = id("g");
          a.guides[g] = { id: g, genre: "ligne", origine: arrivee, direction };
          return g;
        });
      }
      if (accroche) return null;
      return modifierGuides(m, (a, id) => {
        const g = id("g");
        a.guides[g] = { id: g, genre: "segment", origine: depart, fin: arrivee };
        return g;
      });
    })();
    if (!resultat) return { etat: { ...e, etape: 3, mesure: { a: depart, b: arrivee }, texte: null, erreur: null, confirmation: null } };
    return { etat: { ...repos(e), texte: e.texte, erreur: null }, modele: resultat.modele, selection: ctx.selection, operation: e.mode === "points" ? "Point de guide" : "Ligne de guide" };
  } catch (err) {
    return { etat: { ...repos(e), erreur: messageErreur(err) } };
  }
}

/** Point d'arrivée pour une distance saisie : depuis le départ, dans la direction du curseur (ou de l'axe verrouillé). */
function arriveeSaisie(e: EtatMetre, ctx: ContexteOutil, valeur: number): Vec3 | null {
  const depart = e.depart as Vec3;
  const v = verrouCourant(e);
  let d: Vec3 | null = null;
  // Verrou d'axe résolu dans le repère de saisie (Axes, R5), comme l'inférence et les saisies « [x;y;z] ».
  const R = ctx.repere ?? REPERE_MODELE;
  if (v?.genre === "axe") d = v.axe === "x" ? R.x : v.axe === "y" ? R.y : R.z;
  else if (v?.genre === "direction") d = v.direction;
  else if (e.inference) d = sub(e.inference.point, depart);
  if (!d || len(d) < 1e-12) return null;
  const u = normalize(d);
  if (e.inference && !v) {
    // Le signe suit le curseur : une valeur négative va à l'opposé.
    return add(depart, scale(u, valeur));
  }
  if (e.inference && v) {
    const s = dot(sub(e.inference.point, depart), u) < 0 ? -1 : 1;
    return add(depart, scale(u, s * valeur));
  }
  return add(depart, scale(u, valeur));
}

export const machineMetre: MachineOutil<EtatMetre> = {
  id: ID_METRE,
  initial,

  traiter(etat, ev, ctx): Transition<EtatMetre> {
    switch (ev.genre) {
      case "survol": {
        const i = inferer2(etat, ctx, ev.rayon, ev.tolerance);
        const aire = etat.etape === 1 && i.type === "sur-face" && i.entite !== undefined ? aireFace(ctx.modele, i.entite) : null;
        return { etat: { ...etat, inference: i, aire, areteReference: reference(etat.areteReference, i, ctx), erreur: null } };
      }
      case "clic": {
        const i = inferer2(etat, ctx, ev.rayon, ev.tolerance);
        if (etat.etape === 2 && etat.depart) {
          return creer({ ...etat, inference: i }, ctx, i.point, POINTS_ACCROCHES.has(i.type));
        }
        // Étape 1 (ou 3 : nouvelle mesure) : départ.
        const directionArete = directionAreteDe(i, ctx);
        return { etat: { ...etat, etape: 2, depart: i.point, directionArete, inference: i, mesure: null, confirmation: null, aire: null, texte: null, erreur: null } };
      }
      case "saisie": {
        if (etat.confirmation && ev.texte.trim() === "") {
          // Entrée seule : confirmation du redimensionnement.
          try {
            const r = redimensionner(ctx.modele, etat.confirmation.facteur);
            return { etat: { ...repos(etat), texte: null, erreur: null }, modele: r.modele, selection: [], operation: "Redimensionner la Planche" };
          } catch (err) {
            return { etat: { ...repos(etat), erreur: messageErreur(err) } };
          }
        }
        const res = analyserSaisie(ev.texte, contexteSaisie("longueur", ctx));
        if (res.genre === "erreur") return { etat: { ...etat, texte: ev.texte, erreur: res.message } };
        if (res.genre !== "longueur") return { etat: { ...etat, texte: ev.texte, erreur: `Saisie « ${ev.texte} » non reconnue.` } };
        if (etat.etape === 2 && etat.depart) {
          const p = arriveeSaisie(etat, ctx, res.valeur);
          if (!p) return { etat: { ...etat, texte: ev.texte, erreur: "Orientez le curseur (ou verrouillez un axe avec une flèche) pour donner la direction." } };
          return creer({ ...etat, texte: ev.texte }, ctx, p, false);
        }
        if (etat.etape === 3 && etat.mesure) {
          const de = dist(etat.mesure.a, etat.mesure.b);
          if (de < 1e-9) return { etat: { ...etat, texte: ev.texte, erreur: "La mesure est nulle : impossible de redimensionner." } };
          if (ctx.lecture) return { etat: { ...etat, texte: ev.texte, erreur: "Lecture seule : la Planche ne peut pas être redimensionnée." } };
          return { etat: { ...etat, texte: ev.texte, erreur: null, confirmation: { facteur: res.valeur / de, de, a: res.valeur } } };
        }
        return { etat: { ...etat, texte: ev.texte, erreur: "Cliquez d'abord le point de départ de la mesure." } };
      }
      case "touche": {
        const t = ev.touche;
        if (t === "Maj") {
          if (ev.etat === "relachee") return { etat: { ...etat, verrouMaj: null } };
          if (etat.etape === 2 && etat.inference && !etat.verrouMaj) return { etat: { ...etat, verrouMaj: { genre: "inference", inference: etat.inference } } };
          return { etat };
        }
        if (ev.etat !== "enfoncee") return { etat };
        if (t === "Ctrl") {
          const mode = MODES[(MODES.indexOf(etat.mode) + 1) % MODES.length] as ModeMetre;
          return { etat: { ...etat, mode, erreur: null } };
        }
        if (t === "Entree" && etat.confirmation) return machineMetre.traiter(etat, { genre: "saisie", texte: "" }, ctx);
        const axe = axeDeToucheFleche(t);
        if (axe) {
          if (etat.fleche?.touche === t) return { etat: { ...etat, fleche: null } };
          return { etat: { ...etat, fleche: { touche: t, verrou: { genre: "axe", axe } } } };
        }
        if (t === "FlecheBas") {
          if (etat.fleche?.touche === t) return { etat: { ...etat, fleche: null } };
          const ref = etat.areteReference;
          if (!ref) return { etat: { ...etat, erreur: "Survolez d'abord une arête de référence pour la flèche ↓." } };
          return { etat: { ...etat, fleche: { touche: t, verrou: { genre: "direction", direction: normalize(sub(ref.b, ref.a)), type: "parallele" } } } };
        }
        return { etat };
      }
      case "echap":
        return { etat: { ...repos(etat), texte: null, erreur: null } };
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const sep = ctx.separateurDecimal;
    const indiceRepos = etat.mode === "lignes" ? 0 : etat.mode === "points" ? 1 : 2;
    let consigne: string;
    let m: VueOutil["mesures"];
    if (etat.confirmation) {
      consigne = `Redimensionner la Planche : ${formaterLongueur(etat.confirmation.de, sep)} → ${formaterLongueur(etat.confirmation.a, sep)} (× ${formaterNombre(etat.confirmation.facteur, 3, sep)}). Entrée = confirmer, Échap = annuler.`;
      m = mesures(libelleMesuresDe(ID_METRE, 4), etat.texte ?? "", contexteSaisie("longueur", ctx));
    } else if (etat.etape === 1) {
      consigne = consigneDe(ID_METRE, indiceRepos);
      m = etat.aire !== null ? mesures("Aire", formaterAire(etat.aire, sep), contexteSaisie("aucune", ctx)) : mesures("Mesures", etat.texte ?? "", contexteSaisie("aucune", ctx));
    } else if (etat.etape === 2) {
      consigne = consigneDe(ID_METRE, 3);
      const d = etat.inference && etat.depart ? dist(etat.inference.point, etat.depart) : 0;
      m = mesures(libelleMesuresDe(ID_METRE, 3), etat.texte ?? `${prefixe(etat.inference)}${formaterLongueur(d, sep)}`, contexteSaisie("longueur", ctx));
    } else {
      consigne = consigneDe(ID_METRE, 4);
      const d = etat.mesure ? dist(etat.mesure.a, etat.mesure.b) : 0;
      m = mesures(libelleMesuresDe(ID_METRE, 4), etat.texte ?? formaterLongueur(d, sep), contexteSaisie("longueur", ctx));
    }
    const lignes: Vec3[][] = [];
    const etiquettes: { point: Vec3; texte: string }[] = [];
    if (etat.etape === 2 && etat.depart && etat.inference) {
      lignes.push([etat.depart, etat.inference.point]);
      etiquettes.push({ point: etat.inference.point, texte: formaterLongueur(dist(etat.inference.point, etat.depart), sep) });
      if (etat.directionArete && etat.mode === "lignes") {
        const L = 50;
        lignes.push([sub(etat.inference.point, scale(etat.directionArete, L)), add(etat.inference.point, scale(etat.directionArete, L))]);
      }
    }
    if (etat.etape === 3 && etat.mesure) {
      lignes.push([etat.mesure.a, etat.mesure.b]);
      etiquettes.push({ point: etat.mesure.b, texte: formaterLongueur(dist(etat.mesure.a, etat.mesure.b), sep) });
    }
    return vueModif({ consigne, mesures: m, inference: etat.etape === 2 ? etat.inference : null, apercu: { lignes, faces: [], etiquettes } as VueOutil["apercu"], ctx, erreur: etat.erreur });
  },
};

