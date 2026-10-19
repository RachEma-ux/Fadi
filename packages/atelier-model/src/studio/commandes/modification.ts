import { studioOffset, studioPolylineSegmentCount } from "../courbes.js";
import { STUDIO_INDEXED_ANCHOR } from "../noyau/ancres.js";
import { validerCote, type StudioDimensionLink } from "../objets/cote.js";
import { validerElement } from "../objets/element.js";
import { studioAnchorPoint, translaterForme, validerForme } from "../objets/index.js";
import { editable, enteredDimension, followLinks, freeId, type Etat, type Gestionnaire } from "./etat.js";
import type { StudioPoint } from "../noyau/types.js";
import type { StudioItem, StudioShape } from "../objets/formes.js";
import { boolean, fail, finite, identifier, idList, point, record, same } from "../noyau/validation.js";
import {
  studioAncreImage, studioDecalageImage, studioEchelle, studioRotation, studioSymetrie, studioTransformerCoteAngulaire, studioTransformerForme, studioTransformerSolide,
  studioTransformerTexte, studioTranslation, type StudioTransformation,
} from "../transformations.js";
import { studioAngularFromSegments, studioStraightSegment, validerCoteAngulaire, type StudioAngularDimension } from "../objets/cote-angulaire.js";
import { validerTexte } from "../objets/texte.js";
import { validerSolide } from "../objets-3d/solides.js";
import { STUDIO_LIMITS } from "../noyau/limites.js";
import { deplacerAnnotation, modifierAnnotation, rompreSegmentsRenumerotes, suivreAnnotations, supprimerAnnotations } from "./annotations.js";

/** Commandes de modification : Déplacer, Modifier, Décaler, Supprimer ; Copier, Rotation, Symétrie, Échelle. */

export const deplacer: Gestionnaire = (state, params, path) => {
  const p = record(params, ["id", "dx", "dy"], `${path}.params`);
  const id = identifier(p.id, `${path}.params.id`);
  const dx = finite(p.dx, `${path}.params.dx`);
  const dy = finite(p.dy, `${path}.params.dy`);
  const translate = (q: StudioPoint): StudioPoint => ({ x: finite(q.x + dx, path), y: finite(q.y + dy, path) });
  const index = state.objects.findIndex((o) => o.id === id);
  const o = state.objects[index];
  if (o) {
    editable(state, o, path);
    state.objects[index] = validerForme(translaterForme(o, translate), path);
    followLinks(state, id, path);
    suivreAnnotations(state, id, path);
    return;
  }
  if (deplacerAnnotation(state, id, translate, path)) return;
  const dIndex = state.dimensions.findIndex((x) => x.id === id);
  const d = state.dimensions[dIndex];
  if (!d) fail(path, "objet introuvable");
  editable(state, d, path);
  if (d.links.start || d.links.end) fail(path, "une cote liée suit ses objets et ne se déplace pas seule");
  state.dimensions[dIndex] = validerCote({ ...d, start: translate(d.start), end: translate(d.end) }, path);
};

export const modifier: Gestionnaire = (state, params, path) => {
  const o = validerElement(params, `${path}.params`);
  if (o.type === "angular-dimension" || o.type === "text") return modifierAnnotation(state, o, path);
  const index = state.objects.findIndex((current) => current.id === o.id);
  const dIndex = state.dimensions.findIndex((current) => current.id === o.id);
  const previous = state.objects[index] ?? state.dimensions[dIndex];
  if (!previous) fail(path, "objet introuvable");
  if (previous.type !== o.type) fail(path, "le type de l’objet ne peut pas changer");
  if (previous.layerId !== o.layerId) fail(path, "le calque se change par studio.objet.calque");
  editable(state, previous, path);
  if (o.type === "dimension") {
    state.dimensions[dIndex] = enteredDimension(state, o, path);
  } else {
    state.objects[index] = o;
    if (previous.type === "polyline" && o.type === "polyline") verifierLiensIndexes(state, previous, o, path);
    followLinks(state, o.id, path);
    suivreAnnotations(state, o.id, path);
  }
};

type Polyligne = Extract<StudioShape, { type: "polyline" }>;

/**
 * INV-013 (REF-02 §2.4) — correspondance des éléments indexés d'une polyligne modifiée (`vertex-i`, `mid-i` d'une cote,
 * segment `i` d'une cote angulaire), vérifiée à CHAQUE modification, que le nombre de sommets change ou non :
 * - « sommet suivi » : le sommet de rang i est au même point avant et après ; ou bien la topologie est inchangée (même
 *   nombre de sommets, même état ouvert / fermé) et ce sommet est le SEUL sommet déplacé par la modification (ses
 *   voisins, comme tous les autres sommets, sont donc inchangés) — c'est le déplacement d'un sommet, que la cote suit ;
 * - « segment suivi » : le segment de rang i a les mêmes extrémités avant et après (dans un sens ou dans l'autre) ; ou
 *   bien la topologie est inchangée et ses deux extrémités sont des sommets suivis (l'une au
 *   plus a bougé : un seul sommet déplacé).
 * Tout autre cas (sommet retiré et un autre ajouté à nombre constant, polyligne inversée, plusieurs sommets déplacés à la
 * fois, sommet inséré) rompt le lien : l'annotation passe « à résoudre » avec sa dernière géométrie, jamais rattachée
 * en silence à un autre élément. Le milieu `mid-i` d'un segment suivi suit le segment (renflement changé compris). Un
 * rang qui n'existe plus (ou un segment devenu courbe pour une cote angulaire) refuse la modification, comme avant.
 */
function correspondancePolyligne(avant: Polyligne, apres: Polyligne) {
  const memeTopologie = avant.points.length === apres.points.length && avant.closed === apres.closed;
  const bouges = memeTopologie ? apres.points.flatMap((p, i) => (same(p, avant.points[i]!) ? [] : [i])) : [];
  const seul = bouges.length === 1 ? bouges[0] : -1;
  const sommet = (i: number) => {
    const a = avant.points[i], b = apres.points[i];
    return !!a && !!b && (same(a, b) || i === seul);
  };
  const extremites = (o: Polyligne, i: number) => (i < studioPolylineSegmentCount(o) ? [i, (i + 1) % o.points.length] as const : null);
  const segment = (i: number) => {
    const ea = extremites(avant, i), eb = extremites(apres, i);
    if (!ea || !eb) return false;
    const [a0, a1] = [avant.points[ea[0]]!, avant.points[ea[1]]!], [b0, b1] = [apres.points[eb[0]]!, apres.points[eb[1]]!];
    if ((same(a0, b0) && same(a1, b1)) || (same(a0, b1) && same(a1, b0))) return true;
    return memeTopologie && sommet(ea[0]) && sommet(ea[1]);
  };
  return { sommet, segment };
}

function verifierLiensIndexes(state: Etat, avant: Polyligne, apres: Polyligne, path: string): void {
  const c = correspondancePolyligne(avant, apres);
  const rompu = (l: StudioDimensionLink | null, cote: string) => {
    if (!l || l.objectId !== apres.id) return false;
    if (!studioAnchorPoint(apres, l.anchor)) fail(path, `sommet de cote liée introuvable (${cote})`);
    const m = STUDIO_INDEXED_ANCHOR.exec(l.anchor);
    if (!m) return false;
    const i = Number(m[2]);
    return m[1] === "vertex" ? !c.sommet(i) : !c.segment(i);
  };
  state.dimensions = state.dimensions.map((d) => {
    // Une cote « à résoudre » garde le lien qui lui reste et le suit (le document l'exige : extrémité = sommet lié) ;
    // ce lien est donc vérifié lui aussi.
    const rs = rompu(d.links.start, d.id), re = rompu(d.links.end, d.id);
    if (!rs && !re) return d;
    editable(state, d, `${path} (cote liée ${d.id})`);
    return { ...d, links: { start: rs ? null : d.links.start, end: re ? null : d.links.end }, toResolve: true };
  });
  rompreSegmentsRenumerotes(state, apres, c.segment, path);
}

export const decaler: Gestionnaire = (state, params, path) => {
  const p = record(params, ["id", "newId", "distance"], `${path}.params`);
  const id = identifier(p.id, `${path}.params.id`);
  const newId = identifier(p.newId, `${path}.params.newId`);
  const distance = finite(p.distance, `${path}.params.distance`);
  if (distance === 0) fail(`${path}.params.distance`, "distance non nulle attendue");
  const source = state.objects.find((o) => o.id === id);
  if (!source) fail(path, state.dimensions.some((d) => d.id === id) ? `une cote ne se décale pas : ${id}` : `objet introuvable : ${id}`);
  editable(state, source, path);
  freeId(state, newId, path);
  const r = studioOffset(source, distance, newId);
  if (!r.ok) fail(path, `décalage impossible : ${r.raison}`);
  state.objects.push(validerForme(r.shape, path));
  state.ids.add(newId);
};

export const supprimer: Gestionnaire = (state, params, path) => {
  const p = record(params, ["ids"], `${path}.params`);
  const ids = new Set(idList(p.ids, `${path}.params.ids`));
  const items = new Map<string, StudioItem>([...state.objects, ...state.dimensions, ...state.annotations].map((o) => [o.id, o]));
  for (const id of ids) {
    const target = items.get(id);
    if (!target) fail(path, `objet introuvable : ${id}`);
    editable(state, target, path);
  }
  state.objects = state.objects.filter((o) => !ids.has(o.id));
  for (const id of ids) state.ids.delete(id);
  state.dimensions = state.dimensions.filter((d) => !ids.has(d.id)).map((d) => {
    const breakStart = !!d.links.start && ids.has(d.links.start.objectId);
    const breakEnd = !!d.links.end && ids.has(d.links.end.objectId);
    if (!breakStart && !breakEnd) return d;
    editable(state, d, `${path} (cote liée ${d.id})`);
    return { ...d, links: { start: breakStart ? null : d.links.start, end: breakEnd ? null : d.links.end }, toResolve: true };
  });
  supprimerAnnotations(state, ids, path);
};

// ——— Transformations de la sélection (Copier, Rotation, Symétrie, Échelle) ———

/** Nombre de copies d'une même commande Copier (borne technique ; le total d'objets reste borné par le document). */
export const STUDIO_COPIES_MAX = 1000;

/**
 * Sélection d'une transformation : formes, cotes, annotations (textes, cotes angulaires) et solides libres existants,
 * sans répétition, tous sur un calque déverrouillé.
 */
function lireSelection(state: Etat, value: unknown, path: string): string[] {
  const ids = idList(value, `${path}.params.ids`);
  const items = new Map<string, { layerId?: string }>([...state.objects, ...state.dimensions, ...state.annotations, ...state.solides].map((o) => [o.id, o]));
  for (const id of ids) {
    const target = items.get(id);
    if (!target) fail(path, `objet introuvable : ${id}`);
    editable(state, target, path);
  }
  return ids;
}

const memeLien = (a: StudioDimensionLink | null, b: StudioDimensionLink | null) => a === b || (!!a && !!b && a.objectId === b.objectId && a.anchor === b.anchor);
type Bout = { p: StudioPoint; l: StudioDimensionLink | null };

/** Extrémité liée à `cible` (image de la forme liée) : sommet de l'image correspondant au point transformé `q`. */
function boutLie(cible: StudioShape, l: StudioDimensionLink, q: StudioPoint, cote: string, path: string): Bout {
  const anchor = studioAncreImage(cible, l.anchor, q);
  const p = anchor && studioAnchorPoint(cible, anchor);
  if (!anchor || !p) fail(path, `sommet de cote liée introuvable (${cote})`);
  return { p, l: { objectId: cible.id, anchor } };
}

/** Cote angulaire suivant deux segments liés vivants (ni « à résoudre » ni lien rompu). */
const angulaireLiee = (a: StudioAngularDimension) => !a.toResolve && !!a.links.first && !!a.links.second;

/**
 * Transformation sur place (mêmes identifiants) :
 * - chaque forme, texte et solide choisi est remplacé par son image ;
 * - une cote dont une extrémité est liée à une forme transformée la suit (sommet correspondant de l'image) ; une
 *   extrémité libre d'une cote choisie est transformée ; le décalage prend son image (signe inversé par une symétrie,
 *   multiplié par le facteur) quand la cote est choisie ou que ses deux extrémités sont liées à des formes transformées ;
 * - une cote angulaire liée suit ses segments ; quand ses deux segments sont transformés (ou qu'elle est choisie), une
 *   symétrie échange ses rayons et une échelle multiplie son rayon d'arc ; une cote angulaire libre choisie est
 *   transformée comme ses points.
 * Toute cote ou annotation modifiée sur un calque verrouillé refuse le lot, comme pour Modifier.
 */
function transformerSurPlace(state: Etat, ids: readonly string[], t: StudioTransformation, path: string): void {
  const choisis = new Set(ids);
  const transformes = new Map<string, StudioShape>();
  state.objects = state.objects.map((o) => {
    if (!choisis.has(o.id)) return o;
    const image = validerForme(studioTransformerForme(o, t), path);
    transformes.set(o.id, image);
    return image;
  });
  state.solides = state.solides.map((s) => (choisis.has(s.id) ? validerSolide(studioTransformerSolide(s, t), path) : s));
  state.annotations = state.annotations.map((a) => {
    if (a.type === "text") return choisis.has(a.id) ? validerTexte(studioTransformerTexte(a, t), path) : a;
    if (!angulaireLiee(a)) return choisis.has(a.id) ? validerCoteAngulaire(studioTransformerCoteAngulaire(a, t), path) : a;
    const suit = transformes.has(a.links.first!.objectId) && transformes.has(a.links.second!.objectId);
    if (!suit && !choisis.has(a.id)) return a;
    const echange = suit && t.miroir;
    const radius = a.radius * t.facteur;
    if (!echange && radius === a.radius) return a;
    editable(state, a, `${path} (cote angulaire liée ${a.id})`);
    // Rayons échangés avant le suivi des segments : la cote mesure le même angle, pas son complément à 360°.
    return { ...a, radius, ...(echange ? { first: a.second, second: a.first, links: { first: a.links.second, second: a.links.first } } : {}) };
  });
  for (const id of transformes.keys()) suivreAnnotations(state, id, path);
  state.dimensions = state.dimensions.map((d) => {
    const choisie = choisis.has(d.id);
    const bout = (end: "start" | "end"): Bout => {
      const l = d.links[end];
      const cible = l ? transformes.get(l.objectId) : undefined;
      if (l && cible) return boutLie(cible, l, t.point(d[end]), d.id, path);
      return { p: !l && choisie ? t.point(d[end]) : d[end], l };
    };
    const s = bout("start"), e = bout("end");
    const suit = !!d.links.start && !!d.links.end && transformes.has(d.links.start.objectId) && transformes.has(d.links.end.objectId);
    const offset = choisie || suit ? studioDecalageImage(d, t) : d.offset;
    if (same(s.p, d.start) && same(e.p, d.end) && offset === d.offset && memeLien(s.l, d.links.start) && memeLien(e.l, d.links.end)) return d;
    editable(state, d, `${path} (cote liée ${d.id})`);
    if (same(s.p, e.p)) fail(path, `la cote ${d.id} deviendrait de longueur nulle`);
    return validerCote({ ...d, start: s.p, end: e.p, offset, links: { start: s.l, end: e.l } }, path);
  });
}

/** Identifiant déterministe de la copie de rang `rang` (1…n) de l'élément d'indice `indice` dans la sélection. */
export const studioIdCopie = (prefixe: string, rang: number, indice: number): string => `${prefixe}-${rang}-${indice}`;

/**
 * Le nombre d'éléments après copie est contrôlé avant toute copie : `copies × sélection` peut sinon créer des millions
 * d'objets avant le contrôle final du document.
 */
function controlerVolumeCopies(state: Etat, ajout: number, path: string): void {
  const total = state.objects.length + state.dimensions.length + state.annotations.length + state.solides.length;
  if (total + ajout > STUDIO_LIMITS.objects) fail(`${path}.params.copies`, `${STUDIO_LIMITS.objects} objets au plus, copies comprises (${total} + ${ajout})`);
}

/**
 * Copies de la sélection, une par transformation (`ts[k - 1]` donne la copie de rang k), identifiants
 * `studioIdCopie(prefixe, k, i)`, même calque que la source. Une cote (linéaire ou angulaire) copiée garde ses liens vers
 * les formes copiées avec elle (sommet ou segment correspondant de la copie) ; liée à une forme non copiée, elle devient
 * libre (liens `null`), à l'image de ses points. Textes et solides prennent leur image. La source n'est pas modifiée.
 */
function copierSelection(state: Etat, ids: readonly string[], ts: readonly StudioTransformation[], prefixe: string, path: string): void {
  controlerVolumeCopies(state, ts.length * ids.length, path);
  const formes = new Map(state.objects.map((o) => [o.id, o]));
  const cotes = new Map(state.dimensions.map((d) => [d.id, d]));
  const annotations = new Map(state.annotations.map((a) => [a.id, a]));
  const solides = new Map(state.solides.map((s) => [s.id, s]));
  ts.forEach((t, k) => {
    const rang = k + 1;
    const copies = new Map<string, StudioShape>();
    const nouvelId = (i: number) => {
      const id = identifier(studioIdCopie(prefixe, rang, i), `${path}.params.prefix`);
      freeId(state, id, path);
      state.ids.add(id);
      return id;
    };
    ids.forEach((id, i) => {
      const o = formes.get(id);
      if (o) {
        const copie = validerForme(studioTransformerForme(o, t, nouvelId(i)), path);
        copies.set(id, copie);
        state.objects.push(copie);
        return;
      }
      const s = solides.get(id);
      if (s) state.solides.push(validerSolide(studioTransformerSolide(s, t, nouvelId(i)), path));
    });
    ids.forEach((id, i) => {
      const a = annotations.get(id);
      if (a?.type === "text") state.annotations.push(validerTexte(studioTransformerTexte(a, t, nouvelId(i)), path));
      else if (a) state.annotations.push(copieAngulaire(a, t, copies, nouvelId(i), path));
      const d = cotes.get(id);
      if (!d) return;
      const bout = (end: "start" | "end"): Bout => {
        const l = d.links[end];
        const cible = l ? copies.get(l.objectId) : undefined;
        const q = t.point(d[end]);
        return l && cible ? boutLie(cible, l, q, d.id, path) : { p: q, l: null };
      };
      const s = bout("start"), e = bout("end");
      if (same(s.p, e.p)) fail(path, `la copie de la cote ${d.id} serait de longueur nulle`);
      state.dimensions.push(validerCote({ ...d, id: nouvelId(i), start: s.p, end: e.p, offset: studioDecalageImage(d, t), links: { start: s.l, end: e.l } }, path));
    });
  });
}

/** Copie d'une cote angulaire : liée aux copies de ses deux segments (géométrie recalculée exactement), sinon libre. */
function copieAngulaire(a: StudioAngularDimension, t: StudioTransformation, copies: ReadonlyMap<string, StudioShape>, id: string, path: string): StudioAngularDimension {
  const image = studioTransformerCoteAngulaire(a, t, id);
  const c1 = angulaireLiee(a) ? copies.get(image.links.first!.objectId) : undefined;
  const c2 = angulaireLiee(a) ? copies.get(image.links.second!.objectId) : undefined;
  if (!c1 || !c2) return validerCoteAngulaire({ ...image, links: { first: null, second: null }, toResolve: false }, path);
  const s1 = studioStraightSegment(c1, image.links.first!.segment), s2 = studioStraightSegment(c2, image.links.second!.segment);
  const g = s1 && s2 ? studioAngularFromSegments(s1, s2) : null;
  if (!g) fail(path, `copie de la cote angulaire ${a.id} indéterminée`);
  return validerCoteAngulaire({ ...image, ...g, links: { first: { ...image.links.first!, objectId: c1.id }, second: { ...image.links.second!, objectId: c2.id } } }, path);
}

/** Copier : `copies` copies en série de la sélection, la k-ième déplacée de k × (dx, dy). */
export const copier: Gestionnaire = (state, params, path) => {
  const p = record(params, ["ids", "dx", "dy", "copies", "prefix"], `${path}.params`);
  const ids = lireSelection(state, p.ids, path);
  const dx = finite(p.dx, `${path}.params.dx`);
  const dy = finite(p.dy, `${path}.params.dy`);
  if (dx === 0 && dy === 0) fail(`${path}.params`, "déplacement non nul attendu");
  const n = finite(p.copies, `${path}.params.copies`);
  if (!Number.isInteger(n) || n < 1 || n > STUDIO_COPIES_MAX) fail(`${path}.params.copies`, `nombre entier de copies de 1 à ${STUDIO_COPIES_MAX} attendu`);
  const prefixe = identifier(p.prefix, `${path}.params.prefix`);
  copierSelection(state, ids, Array.from({ length: n }, (_, k) => studioTranslation((k + 1) * dx, (k + 1) * dy)), prefixe, path);
};

/** Rotation de la sélection autour de `center`, d'un angle non nul en radians (sens trigonométrique). */
export const rotation: Gestionnaire = (state, params, path) => {
  const p = record(params, ["ids", "center", "angle"], `${path}.params`);
  const ids = lireSelection(state, p.ids, path);
  const centre = point(p.center, `${path}.params.center`);
  const angle = finite(p.angle, `${path}.params.angle`);
  if (angle === 0) fail(`${path}.params.angle`, "angle non nul attendu");
  transformerSurPlace(state, ids, studioRotation(centre, angle), path);
};

/**
 * Symétrie de la sélection par rapport à la droite (axisStart, axisEnd). `keepSource` : l'image est une copie
 * (identifiants `studioIdCopie(prefix, 1, i)`, `prefix` exigé) et la source reste ; sinon la source est transformée.
 */
export const symetrie: Gestionnaire = (state, params, path) => {
  const p = record(params, ["ids", "axisStart", "axisEnd", "keepSource"], `${path}.params`, ["prefix"]);
  const ids = lireSelection(state, p.ids, path);
  const a = point(p.axisStart, `${path}.params.axisStart`);
  const b = point(p.axisEnd, `${path}.params.axisEnd`);
  if (same(a, b)) fail(`${path}.params`, "axe de symétrie de deux points distincts attendu");
  const garder = boolean(p.keepSource, `${path}.params.keepSource`);
  const t = studioSymetrie(a, b);
  if (!garder) {
    if (Object.hasOwn(p, "prefix")) fail(`${path}.params.prefix`, "préfixe de copie sans objet quand la source n’est pas conservée");
    transformerSurPlace(state, ids, t, path);
    return;
  }
  if (!Object.hasOwn(p, "prefix")) fail(`${path}.params.prefix`, "préfixe de copie attendu quand la source est conservée");
  copierSelection(state, ids, [t], identifier(p.prefix, `${path}.params.prefix`), path);
};

/**
 * Échelle uniforme de la sélection, centre `center`, facteur strictement positif. Les extrusions (base, hauteur,
 * épaisseur) ne changent pas, sauf avec `includeVolumes` (« volumes aussi ») qui les multiplie par le facteur.
 */
export const echelle: Gestionnaire = (state, params, path) => {
  const p = record(params, ["ids", "center", "factor", "includeVolumes"], `${path}.params`);
  const ids = lireSelection(state, p.ids, path);
  const centre = point(p.center, `${path}.params.center`);
  const k = finite(p.factor, `${path}.params.factor`);
  if (k <= 0) fail(`${path}.params.factor`, "facteur strictement positif attendu");
  transformerSurPlace(state, ids, studioEchelle(centre, k, boolean(p.includeVolumes, `${path}.params.includeVolumes`)), path);
};
