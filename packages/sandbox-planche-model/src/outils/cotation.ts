/**
 * Outil Cotes (cahier-planche §4.28, relevé mesure-camera-panneaux §1.2) — machine pure.
 *
 * Repos : un clic sur une ARÊTE prend ses deux extrémités, un clic sur la COURBE d'un cercle (ou polygone) prépare une
 * cote de DIAMÈTRE ; sinon le clic pose le premier point (étape 2), puis le second (étape 3). Étape 3 : « Placez la
 * cote. » : le clic de placement crée la cote (le point cliqué fixe la ligne de cote) et l'outil revient au repos.
 * Une cote linéaire entre deux sommets existants est ASSOCIÉE à ces sommets (sa valeur suit leur déplacement).
 * Échap annule.
 *
 * Cas 2, lot 1 (cotation) :
 * - l'association vaut aussi dans un groupe ou un composant ouvert (la cote garde le chemin du contexte) ;
 * - au placement, le champ Mesures prend le décalage de la ligne de cote (côté du curseur) ;
 * - option « Genre » (Alt seul, bouton au toucher) : linéaire, en chaîne (points successifs, double-clic ou Entrée
 *   pour finir, puis placement : une cote par intervalle et la cote totale), de niveau (±0,00 du projet ou NGF, option
 *   « Référence »), de pente (en %, flèche vers la descente).
 */
import { type Cote } from "../annotations.js";
import { cotesEnChaine } from "../cotes.js";
import { type Id, aretesDeLaCourbe, contexte, modifierAnnotations } from "../geometrie-libre.js";
import { type Inference, etatOutil, geometrieVisible, inferer } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, AXE_X, AXE_Z, add, cross, dist, dot, len, normalize, scale, sub } from "../vecteur.js";
import { contexteSaisie, formaterLongueur, mesures, messageErreur, axesDeSaisie } from "./commun-formes.js";
import { consigneDe, sommetEn, viseeElement, vueModif } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, ModificateurSeul, OptionOutil, Rayon, Transition, VueOutil } from "./machine.js";

/** Association à un sommet (la cote suit ses déplacements) : point accroché, à la racine ou dans le contexte ouvert. */
const associable = (_ctx: ContexteOutil, i: Inference): boolean => POINTS_ACCROCHES.has(i.type);

export const ID_COTATION = "cotation";
const POINTS_ACCROCHES = new Set(["extremite", "milieu", "intersection", "centre", "origine"]);

export type GenreCotation = "lineaire" | "chaine" | "niveau" | "pente";
export const GENRES_COTATION: readonly GenreCotation[] = ["lineaire", "chaine", "niveau", "pente"];

/**
 * Consignes ajoutées par le cas 2, lot 1 (écart Fadi : le relevé n'a que les trois étapes de la cote linéaire, gardées
 * telles quelles). Indices > 2 : consignes propres à Fadi, traduites par le dictionnaire de l'interface.
 */
const ETAPE_CHAINE = 3;
const ETAPE_CHAINE_PLACER = 4;
const ETAPE_NIVEAU = 5;
const ETAPE_NIVEAU_PLACER = 6;
const ETAPE_PLACER_DECALAGE = 7;
const ETAPE_PENTE = 8;
export const CONSIGNES_COTATION_FADI: Readonly<Record<number, string>> = {
  [ETAPE_CHAINE]: "Cliquez les points de la chaîne un à un ; double-cliquez ou appuyez sur Entrée pour finir.",
  [ETAPE_CHAINE_PLACER]: "Cotes en chaîne : placez la chaîne ou saisissez son décalage.",
  [ETAPE_NIVEAU]: "Cliquez le point dont coter le niveau.",
  [ETAPE_NIVEAU_PLACER]: "Placez la cote de niveau.",
  [ETAPE_PLACER_DECALAGE]: "Placez la cote ou saisissez son décalage.",
  [ETAPE_PENTE]: "Cliquez un point de la pente, puis l'autre point.",
};

export interface EtatCotation {
  readonly etape: 1 | 2 | 3;
  readonly a: Vec3 | null;
  readonly b: Vec3 | null;
  readonly sommets: readonly [Id | undefined, Id | undefined];
  /** Cote de diamètre en préparation (étape 3) : courbe visée. */
  readonly diametre: { readonly courbe: Id; readonly centre: Vec3; readonly rayon: number; readonly normale: Vec3 } | null;
  readonly inference: Inference | null;
  readonly erreur: string | null;
  /** (Cas 2, lot 1) Genre de cote posé. */
  readonly genre: GenreCotation;
  /** (Cas 2, lot 1) Référence d'une cote de niveau. */
  readonly reference: "projet" | "ngf";
  /** (Cas 2, lot 1) Points de la chaîne en cours (étape 2 : collecte ; étape 3 : placement). */
  readonly chaine: readonly { readonly p: Vec3; readonly sommet?: Id }[];
}

const initial = (): EtatCotation => ({ etape: 1, a: null, b: null, sommets: [undefined, undefined], diametre: null, inference: null, erreur: null, genre: "lineaire", reference: "projet", chaine: [] });
const repos = (e: EtatCotation): EtatCotation => ({ ...initial(), genre: e.genre, reference: e.reference, inference: e.inference });

function inferer2(ctx: ContexteOutil, rayon: Rayon, tolerance: number, depart?: Vec3): Inference {
  return inferer({ rayon, tolerance, geometrie: geometrieVisible(ctx.modele, etatOutil(ctx)), ...(depart ? { depart } : {}), ...axesDeSaisie(ctx) });
}

/** Chemin du contexte ouvert (racine → `dans`), à ranger sur la cote ; vide à la racine. */
const cheminDe = (ctx: ContexteOutil): { chemin?: readonly Id[] } => {
  if (ctx.dans === undefined) return {};
  return { chemin: ctx.chemin && ctx.chemin.length ? ctx.chemin : [ctx.dans] };
};

/** Courbe fermée (cercle, polygone) du contexte à laquelle appartient l'arête `id`, ou null. */
function courbeFermee(ctx: ContexteOutil, arete: Id): EtatCotation["diametre"] {
  const c = contexte(ctx.modele, ctx.dans);
  const a = c.aretes[arete];
  if (!a?.courbe) return null;
  const k = c.courbes[a.courbe];
  if (!k || k.genre === "arc") return null;
  const aretes = aretesDeLaCourbe(ctx.modele, arete, ctx.dans !== undefined ? { dans: ctx.dans } : {});
  // Fermée : chaque sommet de la courbe est partagé par deux de ses arêtes.
  const usages = new Map<Id, number>();
  for (const id of aretes) {
    const x = c.aretes[id];
    if (!x) continue;
    usages.set(x.a, (usages.get(x.a) ?? 0) + 1);
    usages.set(x.b, (usages.get(x.b) ?? 0) + 1);
  }
  if ([...usages.values()].some((n) => n !== 2)) return null;
  return { courbe: k.id, centre: k.centre, rayon: k.rayon, normale: k.normale };
}

/**
 * Point de placement à `distance` du segment [a, b] (ligne de cote), du côté du point `cote` (curseur) : la
 * perpendiculaire au segment menée vers le curseur, sinon une perpendiculaire horizontale.
 */
export function positionDecalee(a: Vec3, b: Vec3, cote: Vec3 | null, distance: number): Vec3 {
  const u = len(sub(b, a)) < 1e-12 ? AXE_X : normalize(sub(b, a));
  const m = scale(add(a, b), 0.5);
  let n: Vec3 | null = null;
  if (cote) {
    const v = sub(cote, m);
    const w = sub(v, scale(u, dot(v, u)));
    if (len(w) > 1e-9) n = normalize(w);
  }
  if (!n) {
    const h = cross(AXE_Z, u);
    n = len(h) > 1e-9 ? normalize(h) : AXE_X;
  }
  return add(m, scale(n, distance));
}

function creer(ctx: ContexteOutil, etat: EtatCotation, position: Vec3): Transition<EtatCotation> {
  try {
    const r = modifierAnnotations(ctx.modele, (an, id) => {
      const ch = cheminDe(ctx);
      if (etat.genre === "chaine") {
        const off = dist(position, projeterSurLigne(position, etat.chaine[0]?.p as Vec3, etat.chaine[etat.chaine.length - 1]?.p as Vec3));
        const cotes = cotesEnChaine(etat.chaine, position, Math.max(0.25, off * 0.6), id, ch.chemin);
        if (cotes.length < 3) throw new RangeError("Une chaîne demande au moins trois points distincts.");
        for (const c of cotes) an.cotes[c.id] = c;
        return cotes[cotes.length - 1]?.id;
      }
      const cid = id("c");
      let c: Cote;
      if (etat.diametre) c = { id: cid, genre: "diametre", ...etat.diametre, position };
      else if (etat.genre === "niveau") c = { id: cid, genre: "niveau", point: etat.a as Vec3, ...(etat.sommets[0] ? { sommet: etat.sommets[0] } : {}), reference: etat.reference, position, ...ch };
      else {
        const assoc = etat.sommets[0] && etat.sommets[1] ? { sommets: [etat.sommets[0], etat.sommets[1]] as [Id, Id] } : {};
        c = { id: cid, genre: etat.genre === "pente" ? "pente" : "lineaire", a: etat.a as Vec3, b: etat.b as Vec3, ...assoc, position, ...ch };
      }
      an.cotes[cid] = c;
      return cid;
    });
    return { etat: repos({ ...etat }), modele: r.modele, selection: ctx.selection, operation: etat.genre === "chaine" ? "Cotes en chaîne" : "Cote" };
  } catch (err) {
    return { etat: { ...repos(etat), erreur: messageErreur(err) } };
  }
}

function projeterSurLigne(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  if (!a || !b || dist(a, b) < 1e-12) return a ?? p;
  const u = normalize(sub(b, a));
  return add(a, scale(u, dot(sub(p, a), u)));
}

function options(e: EtatCotation): OptionOutil[] {
  const o: OptionOutil[] = [{ id: "genre", valeur: e.genre, valeurs: GENRES_COTATION.map((g) => ({ id: g, disponible: true, raccourci: "Alt" })) }];
  if (e.genre === "niveau") o.push({ id: "reference", valeur: e.reference, valeurs: [{ id: "projet", disponible: true }, { id: "ngf", disponible: true }] });
  return o;
}

export const machineCotation: MachineOutil<EtatCotation> = {
  id: ID_COTATION,
  initial,

  traiter(etat, ev, ctx): Transition<EtatCotation> {
    switch (ev.genre) {
      case "survol":
        return { etat: { ...etat, inference: inferer2(ctx, ev.rayon, ev.tolerance, etat.genre === "chaine" ? etat.chaine[etat.chaine.length - 1]?.p : (etat.a ?? undefined)), erreur: null } };
      case "clic": {
        const dernier = etat.genre === "chaine" ? etat.chaine[etat.chaine.length - 1]?.p : (etat.a ?? undefined);
        const i = inferer2(ctx, ev.rayon, ev.tolerance, dernier);
        const sommet = associable(ctx, i) ? sommetEn(ctx, i.point) : undefined;
        // Cotes en chaîne : collecte des points, double-clic pour finir, puis placement.
        if (etat.genre === "chaine") {
          if (etat.etape === 3) return creer(ctx, etat, i.point);
          const chaine = dernier && dist(dernier, i.point) < 1e-9 ? etat.chaine : [...etat.chaine, { p: i.point, ...(sommet ? { sommet } : {}) }];
          if (ev.double || (dernier && dist(dernier, i.point) < 1e-9)) {
            if (chaine.length < 3) return { etat: { ...etat, chaine, etape: 2, inference: i, erreur: "Une chaîne demande au moins trois points distincts." } };
            return { etat: { ...etat, chaine, etape: 3, inference: i, erreur: null } };
          }
          return { etat: { ...etat, chaine, etape: 2, inference: i, erreur: null } };
        }
        if (etat.etape === 3) return creer(ctx, etat, i.point);
        if (etat.genre === "niveau") return { etat: { ...etat, etape: 3, a: i.point, b: i.point, sommets: [sommet, undefined], inference: i, erreur: null } };
        if (etat.etape === 2) {
          if (etat.a && dist(i.point, etat.a) < 1e-9) return { etat: { ...etat, inference: i, erreur: "Choisissez un second point distinct." } };
          return { etat: { ...etat, etape: 3, b: i.point, sommets: [etat.sommets[0], sommet], inference: i, erreur: null } };
        }
        // Étape 1 : arête ou courbe visée (hors accrochage ponctuel), sinon premier point.
        if (!POINTS_ACCROCHES.has(i.type)) {
          const { el, cible } = viseeElement(ctx, ev);
          if (el?.genre === "arete" && cible?.genre === "arete") {
            const d = etat.genre === "lineaire" ? courbeFermee(ctx, cible.id) : null;
            if (d) return { etat: { ...etat, etape: 3, a: null, b: null, sommets: [undefined, undefined], diametre: d, inference: i, erreur: null } };
            const c = contexte(ctx.modele, ctx.dans);
            const ar = c.aretes[cible.id];
            if (ar) return { etat: { ...etat, etape: 3, a: el.a, b: el.b, sommets: [ar.a, ar.b], diametre: null, inference: i, erreur: null } };
          }
        }
        return { etat: { ...etat, etape: 2, a: i.point, b: null, sommets: [sommet, undefined], diametre: null, inference: i, erreur: null } };
      }
      case "saisie": {
        // Placement : le décalage de la ligne de cote se tape au champ Mesures (côté du curseur).
        if (etat.etape !== 3 || etat.diametre || etat.genre === "niveau") return { etat: { ...etat, erreur: "Le champ Mesures sert au décalage de la ligne de cote, pendant son placement." } };
        const res = analyserSaisie(ev.texte, contexteSaisie("longueur", ctx));
        if (res.genre === "erreur") return { etat: { ...etat, erreur: res.message } };
        if (res.genre !== "longueur") return { etat: { ...etat, erreur: `Saisie « ${ev.texte} » non reconnue : tapez une distance.` } };
        const [A, B] = etat.genre === "chaine" ? [etat.chaine[0]?.p as Vec3, etat.chaine[etat.chaine.length - 1]?.p as Vec3] : [etat.a as Vec3, etat.b as Vec3];
        return creer(ctx, etat, positionDecalee(A, B, etat.inference?.point ?? null, Math.abs(res.valeur)));
      }
      case "touche":
        if (ev.touche === "Entree" && ev.etat === "enfoncee" && etat.genre === "chaine" && etat.etape === 2) {
          if (etat.chaine.length < 3) return { etat: { ...etat, erreur: "Une chaîne demande au moins trois points distincts." } };
          return { etat: { ...etat, etape: 3, erreur: null } };
        }
        return { etat };
      case "echap":
        return { etat: repos(etat) };
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  configurer(etat, option, valeur): Transition<EtatCotation> {
    if (option === "genre" && (GENRES_COTATION as readonly string[]).includes(valeur)) return { etat: { ...repos(etat), genre: valeur as GenreCotation } };
    if (option === "reference" && (valeur === "projet" || valeur === "ngf")) return { etat: { ...etat, reference: valeur, erreur: null } };
    return { etat };
  },

  modificateurSeul(etat, touche: ModificateurSeul, ctx): Transition<EtatCotation> {
    if (touche !== "Alt") return { etat };
    const i = GENRES_COTATION.indexOf(etat.genre);
    return this.configurer!(etat, "genre", GENRES_COTATION[(i + 1) % GENRES_COTATION.length] as string, ctx);
  },

  vue(etat, ctx): VueOutil {
    const sep = ctx.separateurDecimal;
    const indice =
      etat.genre === "chaine"
        ? etat.etape === 3
          ? ETAPE_CHAINE_PLACER
          : ETAPE_CHAINE
        : etat.genre === "niveau"
          ? etat.etape === 3
            ? ETAPE_NIVEAU_PLACER
            : ETAPE_NIVEAU
          : etat.genre === "pente" && etat.etape < 3
            ? ETAPE_PENTE
            : etat.etape === 3 && !etat.diametre
              ? ETAPE_PLACER_DECALAGE
              : etat.etape - 1;
    const consigne = CONSIGNES_COTATION_FADI[indice] ?? consigneDe(ID_COTATION, indice);
    const lignes: Vec3[][] = [];
    const etiquettes: { point: Vec3; texte: string }[] = [];
    const curseur = etat.inference?.point;
    if (etat.genre === "chaine") {
      const pts = etat.chaine.map((x) => x.p);
      if (pts.length) lignes.push(etat.etape === 2 && curseur ? [...pts, curseur] : [...pts]);
      if (etat.etape === 3 && curseur && pts.length >= 2) {
        const A = pts[0] as Vec3;
        const Z = pts[pts.length - 1] as Vec3;
        const off = sub(curseur, projeterSurLigne(curseur, A, Z));
        lignes.push(pts.map((p) => add(projeterSurLigne(p, A, Z), off)));
        for (let k = 0; k + 1 < pts.length; k++) etiquettes.push({ point: add(scale(add(projeterSurLigne(pts[k] as Vec3, A, Z), projeterSurLigne(pts[k + 1] as Vec3, A, Z)), 0.5), off), texte: formaterLongueur(dist(pts[k] as Vec3, pts[k + 1] as Vec3), sep) });
      }
    } else if (etat.etape === 2 && etat.a && curseur) lignes.push([etat.a, curseur]);
    if (etat.etape === 3 && curseur && etat.genre !== "chaine") {
      if (etat.diametre) {
        etiquettes.push({ point: curseur, texte: `⌀ ${formaterLongueur(2 * etat.diametre.rayon, sep)}` });
        lignes.push([etat.diametre.centre, curseur]);
      } else if (etat.genre === "niveau" && etat.a) {
        lignes.push([etat.a, { x: curseur.x, y: curseur.y, z: etat.a.z }]);
        etiquettes.push({ point: curseur, texte: etat.reference === "ngf" ? "NGF" : "±0,00" });
      } else if (etat.a && etat.b) {
        lignes.push([etat.a, etat.b], [etat.a, curseur], [etat.b, curseur]);
        const h = Math.hypot(etat.b.x - etat.a.x, etat.b.y - etat.a.y);
        etiquettes.push({ point: curseur, texte: etat.genre === "pente" ? (h < 1e-9 ? "—" : `${Math.round((Math.abs(etat.b.z - etat.a.z) / h) * 100)} %`) : formaterLongueur(dist(etat.a, etat.b), sep) });
      }
    }
    const saisieActive = etat.etape === 3 && !etat.diametre && etat.genre !== "niveau";
    const v = vueModif({ consigne, mesures: mesures(saisieActive ? "Décalage" : "Mesures", "", contexteSaisie(saisieActive ? "longueur" : "aucune", ctx)), inference: etat.inference, apercu: { lignes, faces: [], etiquettes } as VueOutil["apercu"], ctx, erreur: etat.erreur });
    return { ...v, options: options(etat) };
  },
};
