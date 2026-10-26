import { editable, freeId, type Etat, type Gestionnaire } from "./etat.js";
import { fail, finite, identifier, idList, record } from "../noyau/validation.js";
import { studioSignedArea } from "../courbes.js";
import type { StudioPoint } from "../noyau/types.js";
import {
  directionUnitaire, estDroit, estSolideLie, studioVecteurSolide, validerSolide, type StudioBox, type StudioProfilePrism, type StudioSolid,
} from "../objets-3d/solides.js";
import { studioEmpriseConforme, studioProfilDepuisPolyligne } from "./liens-solides.js";
import { diviserSegmentPolyligne } from "./division.js";
import { studioIdsOperandes } from "../objets-3d/exacts.js";

/**
 * Commandes du volume libre (A.3-02) : créer une boîte ou un prisme sur profil directement dans l'espace, déplacer et
 * supprimer un solide libre. Les valeurs sont celles saisies (aucune dimension par défaut) ; un calque verrouillé est
 * refusé ; le lot entier est abandonné au premier refus.
 *
 * Lot F1 (TEST-002, A.3-03, TR-EX-005 ; TEST-006, TEST-007) : édition des faces — pousser / tirer une face plane d'une
 * distance saisie (`studio.solide.face-decaler`), diviser une face latérale en deux (`studio.solide.face-diviser`) —,
 * rotation d'un solide autour de son axe vertical (`studio.solide.pivoter`) et résolution explicite du lien d'un prisme
 * à sa polyligne source (`studio.solide.resoudre`). Mêmes identifiants avant et après (identité stable) ; les métrés
 * sont dérivés, donc recalculés ; annuler / rétablir passent par l'historique des lots, comme toute commande.
 *
 * Faces d'un solide : `base` (plan du profil ; dessous d'une boîte), `sommet` (face d'arrivée), `lateral-i` (face
 * portée par l'arête i du profil, de son sommet i au suivant ; boîte : 0 = y−, 1 = x+, 2 = y+, 3 = x−).
 */

function creer(type: StudioSolid["type"]): Gestionnaire {
  return (state, params, path) => {
    const s = validerSolide(params, `${path}.params`);
    if (s.type !== type) fail(`${path}.params.type`, "type incompatible avec l’outil");
    editable(state, s, path);
    freeId(state, s.id, path);
    if (s.type === "prism" && s.source) {
      // Le profil doit être celui de la source au moment de la création, quelle que soit la relation choisie.
      const d = studioProfilDepuisPolyligne(state.objects.find((o) => o.id === s.source!.objectId));
      if (!d) fail(`${path}.params.source.objectId`, "source absente ou invalide : polyligne fermée à contour simple attendue");
      if (s.profile.length !== d.profile.length || s.profile.some((p, i) => p.x !== d.profile[i]!.x || p.y !== d.profile[i]!.y)) fail(`${path}.params.profile`, "profil différent de celui de la polyligne source");
    }
    state.solides.push(s);
    state.ids.add(s.id);
  };
}

export const creerBoite = creer("box");
export const creerPrisme = creer("prism");

function introuvable(state: Etat, id: string, path: string): never {
  return fail(path, state.ids.has(id) ? `ce n’est pas un solide libre : ${id}` : `solide introuvable : ${id}`);
}

function solide(state: Etat, value: unknown, path: string): { index: number; s: StudioSolid } {
  const id = identifier(value, `${path}.params.id`);
  const index = state.solides.findIndex((s) => s.id === id);
  const s = state.solides[index];
  if (!s) return introuvable(state, id, path);
  editable(state, s, path);
  return { index, s };
}

export const deplacerSolide: Gestionnaire = (state, params, path) => {
  const p = record(params, ["id", "dx", "dy", "dz"], `${path}.params`);
  const { index, s } = solide(state, p.id, path);
  const dx = finite(p.dx, `${path}.params.dx`), dy = finite(p.dy, `${path}.params.dy`), dz = finite(p.dz, `${path}.params.dz`);
  if (estSolideLie(s) && (dx !== 0 || dy !== 0)) fail(path, "un prisme lié suit sa polyligne source en plan : seul dz le déplace (détachez-le d’abord)");
  const o = s.placement.origin;
  state.solides[index] = validerSolide({ ...s, placement: { ...s.placement, origin: { x: o.x + dx, y: o.y + dy, z: o.z + dz } } }, path);
};

/**
 * Supprime des solides libres ou des solides exacts (lot F2 : un solide exact part avec ses opérandes conservés), des
 * cotes de faces 3D et des surfaces libres (X.1-05).
 */
export const supprimerSolides: Gestionnaire = (state, params, path) => {
  const p = record(params, ["ids"], `${path}.params`);
  const ids = new Set(idList(p.ids, `${path}.params.ids`));
  // Lot G2 (INV-013) : une cote de face 3D se supprime aussi par cette commande.
  const index = new Map<string, { layerId?: string }>([...state.solides, ...state.exacts, ...state.cotesFaces, ...state.surfaces].map((s) => [s.id, s]));
  for (const id of ids) {
    const s = index.get(id);
    if (!s) introuvable(state, id, path);
    editable(state, s, path);
  }
  const liberes = state.exacts.filter((s) => ids.has(s.id)).flatMap(studioIdsOperandes);
  state.solides = state.solides.filter((s) => !ids.has(s.id));
  state.exacts = state.exacts.filter((s) => !ids.has(s.id));
  state.cotesFaces = state.cotesFaces.filter((c) => !ids.has(c.id));
  state.surfaces = state.surfaces.filter((s) => !ids.has(s.id));
  for (const id of [...ids, ...liberes]) state.ids.delete(id);
};

// ——— Faces ———

const FACE_LATERALE = /^lateral-(0|[1-9][0-9]{0,4})$/;

function lireFace(value: unknown, s: StudioSolid, path: string): { genre: "base" | "sommet" } | { genre: "laterale"; i: number } {
  if (value === "base" || value === "sommet") return { genre: value };
  const m = typeof value === "string" ? FACE_LATERALE.exec(value) : null;
  if (!m) return fail(`${path}.params.face`, "face « base », « sommet » ou « lateral-i » attendue");
  const i = Number(m[1]);
  const n = s.type === "box" ? 4 : s.profile.length;
  if (i >= n) fail(`${path}.params.face`, `face latérale ${i} inexistante (${n} faces latérales)`);
  return { genre: "laterale", i };
}

const tourner = (rotation: number, v: StudioPoint): StudioPoint => {
  const c = Math.cos(rotation), si = Math.sin(rotation);
  return { x: c * v.x - si * v.y, y: si * v.x + c * v.y };
};

const nul = (v: number) => (Object.is(v, -0) ? 0 : v);

/** Profil local d'un prisme, ou rectangle d'une boîte (sens trigonométrique, origine au coin). */
const profilDe = (s: StudioSolid): StudioPoint[] => (s.type === "box" ? [{ x: 0, y: 0 }, { x: s.width, y: 0 }, { x: s.width, y: s.depth }, { x: 0, y: s.depth }] : s.profile);

const cross = (a: StudioPoint, b: StudioPoint) => a.x * b.y - a.y * b.x;

/** Intersection de la droite p + t r avec la droite q + u e ; null si elles sont parallèles. */
function intersection(p: StudioPoint, r: StudioPoint, q: StudioPoint, e: StudioPoint): StudioPoint | null {
  const d = cross(r, e);
  if (d === 0) return null;
  const t = cross({ x: q.x - p.x, y: q.y - p.y }, e) / d;
  return { x: p.x + t * r.x, y: p.y + t * r.y };
}

/**
 * Pousser / tirer une face plane (A.3-03, TR-EX-005) d'une distance signée saisie : positive vers l'extérieur (le
 * solide grandit), négative vers l'intérieur. Les faces voisines restent dans leurs plans (décalage de face, pas
 * d'extrusion nouvelle) :
 * - `base` / `sommet` : la hauteur change ; la base recule le profil le long de la direction (prisme oblique compris :
 *   distance mesurée selon la normale du plan, donc longueur + distance / |uz|) ;
 * - face latérale d'une boîte : largeur ou profondeur, origine déplacée pour les faces x− et y− ;
 * - face latérale d'un prisme droit : l'arête du profil est décalée, ses deux sommets pris à l'intersection avec les
 *   arêtes voisines prolongées ; prisme oblique : refusé (la face n'est pas perpendiculaire au plan du profil).
 * Une face qui franchirait la face opposée ou un profil qui se croiserait sont refusés, jamais corrigés. Un prisme lié
 * à sa source ne se modifie qu'en hauteur (base de prisme droit, sommet) : son emprise suit la polyligne.
 */
export const decalerFace: Gestionnaire = (state, params, path) => {
  const p = record(params, ["id", "face", "distance"], `${path}.params`);
  const { index, s } = solide(state, p.id, path);
  const face = lireFace(p.face, s, path);
  const d = finite(p.distance, `${path}.params.distance`);
  if (d === 0) fail(`${path}.params.distance`, "distance non nulle attendue");
  const franchit = () => fail(`${path}.params.distance`, "la face franchirait la face opposée : distance trop grande vers l’intérieur");
  let image: StudioSolid;
  if (face.genre === "base" || face.genre === "sommet") {
    const u = directionUnitaire(s);
    const f = d / Math.abs(u.z);
    const height = s.height + f;
    if (!(height > 0)) franchit();
    if (face.genre === "sommet") image = { ...s, height };
    else {
      const plan = tourner(s.placement.rotation, { x: u.x, y: u.y });
      if (estSolideLie(s) && (plan.x !== 0 || plan.y !== 0)) fail(path, "un prisme lié oblique : sa base suit la polyligne source en plan (détachez-le d’abord)");
      const o = s.placement.origin;
      // Recul de l'origine le long de la direction, exprimé dans le repère (basculement compris, A.3-03).
      const w = s.placement.basculement ? studioVecteurSolide(s.placement, { x: u.x * f, y: u.y * f, z: u.z * f }) : { x: plan.x * f, y: plan.y * f, z: u.z * f };
      image = { ...s, height, placement: { ...s.placement, origin: { x: nul(o.x - w.x), y: nul(o.y - w.y), z: nul(o.z - w.z) } } };
    }
  } else if (s.type === "box") {
    const i = face.genre === "laterale" ? face.i : -1;
    const { width, depth } = s;
    const nouvelle = i === 0 || i === 2 ? depth + d : width + d;
    if (!(nouvelle > 0)) franchit();
    const local = i === 0 ? { x: 0, y: d, z: 0 } : i === 3 ? { x: d, y: 0, z: 0 } : { x: 0, y: 0, z: 0 };
    // Recul de l'origine des faces x− et y−, exprimé dans le repère (basculement compris, A.3-03).
    const recul = s.placement.basculement ? studioVecteurSolide(s.placement, local) : { ...tourner(s.placement.rotation, local), z: 0 };
    const o = s.placement.origin;
    const b: StudioBox = { ...s, ...(i === 0 || i === 2 ? { depth: nouvelle } : { width: nouvelle }), placement: { ...s.placement, origin: { x: nul(o.x - recul.x), y: nul(o.y - recul.y), z: nul(o.z - recul.z) } } };
    image = b;
  } else {
    if (estSolideLie(s)) fail(path, "le profil d’un prisme lié suit sa polyligne source : modifiez la source, ou détachez le solide");
    if (!estDroit(s)) fail(`${path}.params.face`, "face latérale d’un prisme oblique : décalage non pris en charge (face non perpendiculaire au profil)");
    image = { ...s, profile: decalerArete(s.profile, face.genre === "laterale" ? face.i : -1, d, path) };
  }
  state.solides[index] = validerSolide(image, path);
};

function decalerArete(profile: StudioPoint[], i: number, d: number, path: string): StudioPoint[] {
  const n = profile.length;
  const at = (k: number) => profile[((k % n) + n) % n]!;
  const a = at(i), b = at(i + 1), avant = at(i - 1), apres = at(i + 2);
  const e = { x: b.x - a.x, y: b.y - a.y };
  const l = Math.hypot(e.x, e.y);
  // Normale extérieure : à droite de l'arête pour un profil trigonométrique, à gauche sinon.
  const sens = studioSignedArea(profile) > 0 ? 1 : -1;
  const normale = { x: (sens * e.y) / l, y: (-sens * e.x) / l };
  const q = { x: a.x + normale.x * d, y: a.y + normale.y * d };
  const a2 = intersection(avant, { x: a.x - avant.x, y: a.y - avant.y }, q, e);
  const b2 = intersection(b, { x: apres.x - b.x, y: apres.y - b.y }, q, e);
  if (!a2 || !b2) fail(`${path}.params.face`, "arête voisine parallèle à la face : décalage indéterminé");
  // La face ne doit pas franchir la face opposée : chaque arête voisine garde son sens (elle ne se replie pas au-delà
  // de son autre sommet) et le profil garde son orientation. Un polygone final simple ne suffit pas à le garantir.
  const garde = (u: StudioPoint, v: StudioPoint, w: StudioPoint) => (w.x - u.x) * (v.x - u.x) + (w.y - u.y) * (v.y - u.y) > 0;
  if (!garde(avant, a, a2) || !garde(apres, b, b2)) {
    fail(`${path}.params.distance`, "la face franchirait la face opposée : distance trop grande vers l’intérieur");
  }
  const out = profile.map((p) => ({ ...p }));
  out[i] = { x: nul(a2.x), y: nul(a2.y) };
  out[(i + 1) % n] = { x: nul(b2.x), y: nul(b2.y) };
  if (Math.sign(studioSignedArea(out)) !== sens) {
    fail(`${path}.params.distance`, "la face franchirait la face opposée : distance trop grande vers l’intérieur");
  }
  return out;
}

/**
 * Diviser une face latérale en deux (TEST-007) au point de son arête situé à `distance` du sommet i : un sommet est
 * inséré au rang i + 1 du profil (faces latérales suivantes renumérotées). Une boîte devient un prisme de même
 * identifiant, même placement et même hauteur (une boîte n'a que quatre faces latérales). Base et sommet ne se divisent
 * pas (refus explicite). Aucune cote ne se lie à un solide libre (le document le refuse) : rien n'y est à réattacher.
 * Prisme `reference-liee` : c'est l'arête i de la polyligne source qui est divisée (segment droit, polyligne sans
 * renflement), ses cotes réattachées de façon prouvée ou mises « à résoudre » (`diviserSegmentPolyligne`), puis le
 * prisme suit sa source. Prisme `associe` : refusé (sa source ne se modifie pas depuis lui ; mettez-le à jour d'abord).
 */
export const diviserFace: Gestionnaire = (state, params, path) => {
  const p = record(params, ["id", "face", "distance"], `${path}.params`);
  const { index, s } = solide(state, p.id, path);
  const face = lireFace(p.face, s, path);
  const distance = finite(p.distance, `${path}.params.distance`);
  if (face.genre !== "laterale") return fail(`${path}.params.face`, "seule une face latérale se divise (base et sommet : non pris en charge)");
  if (estSolideLie(s)) {
    if (s.source.relation === "associe") fail(path, "prisme associé : divisez la polyligne source puis mettez le solide à jour, ou détachez-le");
    const source = state.objects.find((o) => o.id === s.source.objectId);
    if (!source || source.type !== "polyline" || !studioProfilDepuisPolyligne(source)) fail(path, "source absente ou invalide : le lien est à résoudre avant toute division");
    if (source.bulges?.length) fail(path, "source à segments courbes : la face ne correspond pas à une arête de la polyligne (division non prise en charge)");
    if (!studioEmpriseConforme(s, studioProfilDepuisPolyligne(source)!)) fail(path, "lien à résoudre : le prisme ne suit plus sa source");
    diviserSegmentPolyligne(state, source.id, face.i, distance, path);
    return;
  }
  const profile = profilDe(s);
  const n = profile.length;
  const a = profile[face.i]!, b = profile[(face.i + 1) % n]!;
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(distance > 0 && distance < l)) fail(`${path}.params.distance`, `distance strictement comprise entre 0 et la longueur de l’arête (${l} m) attendue`);
  const k = distance / l;
  const q = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  if ((q.x === a.x && q.y === a.y) || (q.x === b.x && q.y === b.y)) fail(`${path}.params.distance`, "le point de division se confond avec un sommet de l’arête");
  const nouveau = [...profile.slice(0, face.i + 1), q, ...profile.slice(face.i + 1)];
  const base: StudioProfilePrism = s.type === "box"
    ? { id: s.id, type: "prism", ...(s.layerId !== undefined ? { layerId: s.layerId } : {}), placement: s.placement, profile: nouveau, height: s.height }
    : { ...s, profile: nouveau };
  state.solides[index] = validerSolide(base, path);
};

/** Angle ramené dans [0 ; 2π[ (zéro exact, jamais −0). */
const normaliserAngle = (a: number): number => {
  const deuxPi = 2 * Math.PI;
  let r = a % deuxPi;
  if (r < 0) r += deuxPi;
  if (r >= deuxPi) r = 0;
  return nul(r);
};

/**
 * Pivoter un solide (angle non nul, radians, sens trigonométrique) autour d'un axe passant par son origine :
 * `z` (défaut) l'axe vertical ; `y` l'axe horizontal y du solide ; `x` l'axe x du solide incliné (A.3-03,
 * `placement.basculement`). Un basculement revenu à zéro est retiré (forme canonique).
 */
export const pivoterSolide: Gestionnaire = (state, params, path) => {
  const p = record(params, ["id", "angle"], `${path}.params`, ["axe"]);
  const { index, s } = solide(state, p.id, path);
  const angle = finite(p.angle, `${path}.params.angle`);
  if (angle === 0) fail(`${path}.params.angle`, "angle non nul attendu");
  if (Math.abs(angle) > 1e6) fail(`${path}.params.angle`, "angle de valeur absolue 1 000 000 rad au plus");
  const axe = p.axe === undefined ? "z" : p.axe;
  if (axe !== "z" && axe !== "x" && axe !== "y") fail(`${path}.params.axe`, "axe « z », « x » ou « y » attendu");
  if (estSolideLie(s)) fail(path, "un prisme lié suit sa polyligne source en plan : il ne pivote pas seul (détachez-le d’abord)");
  if (axe === "z") {
    state.solides[index] = validerSolide({ ...s, placement: { ...s.placement, rotation: normaliserAngle(s.placement.rotation + angle) } }, path);
    return;
  }
  const b = s.placement.basculement ?? { x: 0, y: 0 };
  const suivant = { ...b, [axe]: normaliserAngle(b[axe] + angle) };
  const { basculement: _ancien, ...sans } = s.placement;
  const placement = suivant.x === 0 && suivant.y === 0 ? sans : { ...sans, basculement: suivant };
  state.solides[index] = validerSolide({ ...s, placement }, path);
};

/**
 * Résoudre le lien d'un prisme à sa source : `mettre-a-jour` reprend l'emprise de la polyligne (source présente et
 * valide, lien à résoudre) ; `detacher` fait du prisme une copie indépendante (sa géométrie est gardée telle quelle, la
 * source reste nommée comme provenance). Jamais de choix implicite : l'action est saisie.
 */
export const resoudreLien: Gestionnaire = (state, params, path) => {
  const p = record(params, ["id", "action"], `${path}.params`);
  const { index, s } = solide(state, p.id, path);
  if (p.action !== "mettre-a-jour" && p.action !== "detacher") fail(`${path}.params.action`, "action « mettre-a-jour » ou « detacher » attendue");
  if (!estSolideLie(s)) return fail(path, s.type === "prism" && s.source ? "copie indépendante : aucun lien à résoudre" : "ce solide n’a pas de profil source");
  if (p.action === "detacher") {
    state.solides[index] = validerSolide({ ...s, source: { objectId: s.source.objectId, relation: "copie-independante" } }, path);
    return;
  }
  const d = studioProfilDepuisPolyligne(state.objects.find((o) => o.id === s.source.objectId));
  if (!d) fail(path, "source absente ou invalide : détachez le solide ou supprimez-le");
  if (studioEmpriseConforme(s, d)) fail(path, "lien déjà à jour : rien à résoudre");
  state.solides[index] = validerSolide({ ...s, profile: d.profile, placement: { origin: { ...s.placement.origin, x: d.origin.x, y: d.origin.y }, rotation: 0 } }, path);
};

// ——— Suivi des sources, en fin de lot ———

const memeEmprise = (a: StudioSolid, b: StudioSolid) => a.type === "prism" && b.type === "prism" && a.placement.rotation === b.placement.rotation
  && a.placement.origin.x === b.placement.origin.x && a.placement.origin.y === b.placement.origin.y
  && a.profile.length === b.profile.length && a.profile.every((p, i) => p.x === b.profile[i]!.x && p.y === b.profile[i]!.y);

/**
 * Fin de lot (lot F1, TEST-006) : chaque prisme lié est confronté à sa source telle que le lot la laisse.
 * - Une commande qui a changé l'emprise en plan d'un prisme lié (ou qui en crée un) doit la laisser exactement égale à
 *   celle de la source ; sinon le lot est refusé (une emprise liée ne se modifie pas seule).
 * - `reference-liee` : une source présente et valide dont l'emprise diffère est recopiée dans le prisme (recalcul) ; une
 *   source absente ou invalide le laisse tel quel, son état dérivé devient « à résoudre ».
 * - `associe` : rien n'est recopié ; l'état dérivé dit « à résoudre » tant que la source diffère.
 * Un prisme recalculé sur un calque verrouillé refuse le lot, comme une cote liée.
 */
export function suivreSourcesSolides(state: Etat, avant: ReadonlyMap<string, StudioSolid>, path: string): void {
  state.solides = state.solides.map((s) => {
    if (!estSolideLie(s)) return s;
    const d = studioProfilDepuisPolyligne(state.objects.find((o) => o.id === s.source.objectId));
    const prec = avant.get(s.id);
    const touche = !prec || !memeEmprise(prec, s);
    if (touche && (!d || !studioEmpriseConforme(s, d))) fail(`${path} (solide lié ${s.id})`, "l’emprise d’un prisme lié suit sa polyligne source : modifiez la source, ou détachez le solide");
    if (s.source.relation !== "reference-liee" || !d || studioEmpriseConforme(s, d)) return s;
    editable(state, s, `${path} (solide lié ${s.id})`);
    return validerSolide({ ...s, profile: d.profile, placement: { origin: { ...s.placement.origin, x: d.origin.x, y: d.origin.y }, rotation: 0 } }, `${path} (solide lié ${s.id})`);
  });
}
