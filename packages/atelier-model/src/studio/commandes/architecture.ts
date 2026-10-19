import { transformerMur, transformerOuverture } from "../architecture/transformations.js";
import type { StudioArchitectureItem, StudioOpening, StudioWall } from "../architecture/types.js";
import { controlerMurs, validerElementArchitectural, validerMur, validerOuverture } from "../architecture/validation.js";
import { calqueEtat, editable, freeId, type Etat, type Gestionnaire } from "./etat.js";
import { STUDIO_DEFAULT_LAYER_ID } from "../noyau/limites.js";
import { boolean, fail, finite, identifier, idList, point, record, same } from "../noyau/validation.js";
import { studioEchelle, studioRotation, studioSymetrie, studioTranslation, type StudioTransformation } from "../transformations.js";
import { STUDIO_COPIES_MAX, studioIdCopie } from "./modification.js";

/**
 * Commandes architecturales (A.4) : créer un mur, créer une ouverture dans un mur, modifier l'un ou l'autre (même
 * identité), supprimer avec cascade explicite ; et la part architecturale des commandes générales (Supprimer, Déplacer,
 * Copier, Rotation, Symétrie, Échelle, Placer sur le calque), branchée par `avecArchitecture` dans l'aiguillage.
 *
 * Règles : valeurs saisies seulement ; l'ouverture suit le calque de son mur (verrou compris) ; après chaque commande,
 * la compatibilité de **toutes** les ouvertures avec leur mur est recontrôlée : une ouverture devenue incompatible
 * (hors du mur, à cheval sur un angle, plus haute que le mur, chevauchement) refuse la commande — donc le lot entier —
 * avec son motif, jamais rognée ni déplacée en silence. Supprimer un mur qui porte des ouvertures exige la cascade
 * explicite (`studio.architecture.supprimer`, `cascade: true`) ; sinon c'est un refus.
 */

const murDe = (state: Etat, id: string): StudioWall | undefined => state.architecture.find((x): x is StudioWall => x.type === "wall" && x.id === id);
/** Ouvertures de chaque mur, en un parcours. */
function ouverturesParMur(state: Etat): Map<string, StudioOpening[]> {
  const m = new Map<string, StudioOpening[]>();
  for (const x of state.architecture) if (x.type === "opening") { const l = m.get(x.hostId); if (l) l.push(x); else m.set(x.hostId, [x]); }
  return m;
}

/** Calque d'un objet architectural : le sien pour un mur, celui de son mur pour une ouverture. */
function calqueDe(state: Etat, it: StudioArchitectureItem): { layerId?: string } {
  if (it.type === "wall") return it;
  return murDe(state, it.hostId) ?? {};
}
function modifiable(state: Etat, it: StudioArchitectureItem, path: string): void {
  editable(state, calqueDe(state, it), path);
}
/**
 * Recontrôle après une commande des seuls murs qu'elle a touchés (et de leurs ouvertures) : refus motivé de la commande
 * entière. Le document complet est revalidé une fois, à la fin du lot (`applyStudioCommands`).
 */
function controler(state: Etat, murs: Iterable<string>, path: string): void {
  controlerMurs(state.architecture, murs, path);
}
function introuvable(state: Etat, id: string, path: string): never {
  return fail(path, state.ids.has(id) ? `ce n’est pas un objet architectural : ${id}` : `objet architectural introuvable : ${id}`);
}

export const creerMur: Gestionnaire = (state, params, path) => {
  const w = validerMur(params, `${path}.params`);
  editable(state, w, path);
  freeId(state, w.id, path);
  state.architecture.push(w);
  state.ids.add(w.id);
  controler(state, [w.id], path);
};

export const creerOuverture: Gestionnaire = (state, params, path) => {
  const o = validerOuverture(params, `${path}.params`);
  const hote = state.architecture.find((x) => x.id === o.hostId);
  if (!hote) fail(`${path}.params.hostId`, state.ids.has(o.hostId) ? `l’hôte ${o.hostId} n’est pas un mur (une ouverture n’est créée que dans un mur)` : `mur hôte introuvable : ${o.hostId}`);
  if (hote.type !== "wall") fail(`${path}.params.hostId`, `l’hôte ${o.hostId} n’est pas un mur`);
  editable(state, hote, path);
  freeId(state, o.id, path);
  state.architecture.push(o);
  state.ids.add(o.id);
  controler(state, [o.hostId], path);
};

/** Modifier : même identifiant, même nature ; le calque d'un mur se change par « Placer sur le calque ». */
export const modifierArchitecture: Gestionnaire = (state, params, path) => {
  const it = validerElementArchitectural(params, `${path}.params`);
  const index = state.architecture.findIndex((x) => x.id === it.id);
  const avant = state.architecture[index];
  if (!avant) return introuvable(state, it.id, path);
  if (avant.type !== it.type) fail(path, "la nature de l’objet (mur, ouverture) ne peut pas changer");
  if (avant.type === "wall" && it.type === "wall" && avant.layerId !== it.layerId) fail(path, "le calque se change par studio.objet.calque");
  modifiable(state, avant, path);
  if (it.type === "opening") {
    const hote = murDe(state, it.hostId);
    if (!hote) fail(`${path}.params.hostId`, `mur hôte introuvable : ${it.hostId}`);
    editable(state, hote, path);
  }
  state.architecture[index] = it;
  controler(state, [it.type === "wall" ? it.id : it.hostId], path);
};

/** Retire les objets architecturaux `ids` ; un mur porteur d'ouvertures exige `cascade` (ses ouvertures partent avec lui). */
function retirer(state: Etat, ids: readonly string[], cascade: boolean, path: string): void {
  const index = new Map(state.architecture.map((x) => [x.id, x]));
  const parMur = ouverturesParMur(state);
  const partants = new Set(ids);
  for (const id of ids) {
    const it = index.get(id);
    if (!it) introuvable(state, id, path);
    editable(state, it.type === "wall" ? it : (index.get(it.hostId) as StudioWall | undefined) ?? {}, path);
    if (it.type !== "wall") continue;
    const portees = (parMur.get(id) ?? []).filter((o) => !partants.has(o.id));
    if (portees.length && !cascade) {
      fail(path, `le mur ${id} porte ${portees.length} ouverture(s) (${portees.map((o) => o.id).join(", ")}) : supprimez-les d’abord, ou utilisez « Supprimer le mur et ses ouvertures » (cascade explicite)`);
    }
    for (const o of portees) partants.add(o.id);
  }
  state.architecture = state.architecture.filter((x) => !partants.has(x.id));
  for (const id of partants) state.ids.delete(id);
}

export const supprimerArchitecture: Gestionnaire = (state, params, path) => {
  const p = record(params, ["ids", "cascade"], `${path}.params`);
  // Retirer ne rend aucune ouverture incompatible : aucun mur restant n'a changé.
  retirer(state, idList(p.ids, `${path}.params.ids`), boolean(p.cascade, `${path}.params.cascade`), path);
};

// ——— Part architecturale des commandes générales ———

/** Applique une similitude sur place aux murs choisis ; leurs ouvertures suivent (même identité). */
function transformerSurPlace(state: Etat, ids: readonly string[], t: StudioTransformation): readonly string[] {
  const choisis = new Set(ids);
  state.architecture = state.architecture.map((x) => {
    if (x.type === "wall") return choisis.has(x.id) ? transformerMur(x, t) : x;
    return choisis.has(x.hostId) ? transformerOuverture(x, t) : x;
  });
  return ids;
}

/** Copies des murs choisis (identifiants `studioIdCopie(prefixe, rang, indice)`) et de leurs ouvertures (`…-o<j>`). */
function copierMurs(state: Etat, ids: readonly string[], ts: readonly StudioTransformation[], prefixe: string, premierIndice: number, path: string): string[] {
  const index = new Map(state.architecture.filter((x): x is StudioWall => x.type === "wall").map((w) => [w.id, w]));
  const parMur = ouverturesParMur(state);
  const nouveaux: string[] = [];
  ts.forEach((t, k) => {
    ids.forEach((id, i) => {
      const w = index.get(id)!;
      const nouveau = identifier(studioIdCopie(prefixe, k + 1, premierIndice + i), `${path}.params.prefix`);
      freeId(state, nouveau, path);
      state.ids.add(nouveau);
      state.architecture.push(transformerMur(w, t, nouveau));
      nouveaux.push(nouveau);
      (parMur.get(id) ?? []).forEach((o, j) => {
        const copie = identifier(`${nouveau}-o${j}`, `${path}.params.prefix`);
        freeId(state, copie, path);
        state.ids.add(copie);
        state.architecture.push(transformerOuverture(o, t, copie, nouveau));
      });
    });
  });
  return nouveaux;
}

/**
 * Sélection architecturale d'une transformation : murs (calque modifiable) ; une ouverture n'est admise que si son mur
 * est aussi choisi (elle le suit), sinon refus — elle se déplace le long de son mur par Modifier (`position`).
 */
function mursChoisis(state: Etat, ids: readonly string[], path: string): string[] {
  const index = new Map(state.architecture.map((x) => [x.id, x]));
  const choisis = new Set(ids);
  const out: string[] = [];
  for (const id of ids) {
    const it = index.get(id)!;
    modifiable(state, it, path);
    if (it.type === "wall") out.push(id);
    else if (!choisis.has(it.hostId)) fail(path, `l’ouverture ${id} suit son mur ${it.hostId} : choisissez le mur, ou modifiez la position de l’ouverture le long de son mur`);
  }
  return out;
}

/** Part architecturale d'une commande : rend les murs touchés (créés ou transformés), seuls recontrôlés ensuite. */
type PartArchitecturale = (state: Etat, archIds: string[], p: Record<string, unknown>, path: string, autres: number) => readonly string[];

const PARTS: Record<"supprimer" | "copier" | "rotation" | "symetrie" | "echelle" | "calque", PartArchitecturale> = {
  supprimer: (state, ids, _p, path) => { retirer(state, ids, false, path); return []; },
  copier: (state, ids, p, path, autres) => {
    const dx = finite(p.dx, `${path}.params.dx`), dy = finite(p.dy, `${path}.params.dy`);
    if (dx === 0 && dy === 0) fail(`${path}.params`, "déplacement non nul attendu");
    const n = finite(p.copies, `${path}.params.copies`);
    if (!Number.isInteger(n) || n < 1 || n > STUDIO_COPIES_MAX) fail(`${path}.params.copies`, `nombre entier de copies de 1 à ${STUDIO_COPIES_MAX} attendu`);
    return copierMurs(state, mursChoisis(state, ids, path), Array.from({ length: n }, (_, k) => studioTranslation((k + 1) * dx, (k + 1) * dy)), identifier(p.prefix, `${path}.params.prefix`), autres, path);
  },
  rotation: (state, ids, p, path) => {
    const angle = finite(p.angle, `${path}.params.angle`);
    if (angle === 0) fail(`${path}.params.angle`, "angle non nul attendu");
    return transformerSurPlace(state, mursChoisis(state, ids, path), studioRotation(point(p.center, `${path}.params.center`), angle));
  },
  symetrie: (state, ids, p, path, autres) => {
    const a = point(p.axisStart, `${path}.params.axisStart`), b = point(p.axisEnd, `${path}.params.axisEnd`);
    if (same(a, b)) fail(`${path}.params`, "axe de symétrie de deux points distincts attendu");
    const t = studioSymetrie(a, b);
    const choisis = mursChoisis(state, ids, path);
    if (boolean(p.keepSource, `${path}.params.keepSource`)) {
      if (!Object.hasOwn(p, "prefix")) fail(`${path}.params.prefix`, "préfixe de copie attendu quand la source est conservée");
      return copierMurs(state, choisis, [t], identifier(p.prefix, `${path}.params.prefix`), autres, path);
    }
    return transformerSurPlace(state, choisis, t);
  },
  echelle: (state, ids, p, path) => {
    const k = finite(p.factor, `${path}.params.factor`);
    if (k <= 0) fail(`${path}.params.factor`, "facteur strictement positif attendu");
    return transformerSurPlace(state, mursChoisis(state, ids, path), studioEchelle(point(p.center, `${path}.params.center`), k, boolean(p.includeVolumes, `${path}.params.includeVolumes`)));
  },
  calque: (state, ids, p, path) => {
    const layerId = identifier(p.layerId, `${path}.params.layerId`);
    const cible = layerId === STUDIO_DEFAULT_LAYER_ID ? undefined : layerId;
    if (calqueEtat(state, cible, path).locked) fail(path, "calque cible verrouillé");
    const choisis = new Set(ids);
    for (const id of ids) {
      const it = state.architecture.find((x) => x.id === id)!;
      if (it.type === "opening") fail(path, `l’ouverture ${id} suit le calque de son mur ${it.hostId}`);
      editable(state, it, path);
    }
    state.architecture = state.architecture.map((x) => {
      if (x.type !== "wall" || !choisis.has(x.id)) return x;
      const { layerId: _avant, ...reste } = x;
      return cible === undefined ? reste : { ...reste, layerId: cible };
    });
    // Un changement de calque ne change aucune géométrie.
    return [];
  },
};

/**
 * Branche la part architecturale d'une commande générale à sélection (`ids`) : les identifiants architecturaux sont
 * traités ici, les autres par le gestionnaire d'origine (inchangé quand la sélection n'en contient aucun). Les copies
 * architecturales prennent les indices qui suivent ceux des autres objets : aucune collision d'identifiants.
 */
export function avecArchitecture(base: Gestionnaire, part: keyof typeof PARTS): Gestionnaire {
  return (state, params, path) => {
    const brut = params && typeof params === "object" && !Array.isArray(params) ? (params as Record<string, unknown>) : null;
    const ids = brut && Array.isArray(brut.ids) ? brut.ids : null;
    if (!state.architecture.length) return base(state, params, path);
    const archi = new Set(state.architecture.map((x) => x.id));
    if (!ids || !ids.some((id) => typeof id === "string" && archi.has(id))) return base(state, params, path);
    const liste = idList(ids, `${path}.params.ids`);
    const autres = liste.filter((id) => !archi.has(id)), siens = liste.filter((id) => archi.has(id));
    if (autres.length) base(state, { ...brut, ids: autres }, path);
    else record(params, Object.keys(brut!), `${path}.params`);
    controler(state, PARTS[part](state, siens, brut!, path, autres.length), path);
  };
}

/** Déplacer (un identifiant) : un mur se translate avec ses ouvertures ; une ouverture se déplace par Modifier. */
export function deplacerAvecArchitecture(base: Gestionnaire): Gestionnaire {
  return (state, params, path) => {
    if (!state.architecture.length) return base(state, params, path);
    const brut = params && typeof params === "object" ? (params as Record<string, unknown>) : null;
    const it = brut && typeof brut.id === "string" ? state.architecture.find((x) => x.id === brut.id) : undefined;
    if (!it) return base(state, params, path);
    const p = record(params, ["id", "dx", "dy"], `${path}.params`);
    const dx = finite(p.dx, `${path}.params.dx`), dy = finite(p.dy, `${path}.params.dy`);
    if (it.type === "opening") fail(path, `l’ouverture ${it.id} suit son mur ${it.hostId} : modifiez sa position le long du mur`);
    modifiable(state, it, path);
    controler(state, transformerSurPlace(state, [it.id], studioTranslation(dx, dy)), path);
  };
}
