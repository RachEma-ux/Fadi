import { validateStudioDocument, StudioValidationError, type StudioDocument } from "./document-2d.js";
import { studioRelations, type StudioNatureRelation } from "./cmd/effets.js";
import { studioIdsOperandes } from "./objets-3d/exacts.js";
import { studioSha256 } from "./empreinte-sha256.js";

/**
 * Fusion de variantes Studio (X.1-06, corpus S6 « étude à variantes et révisions ») : fusion À TROIS VOIES d'une
 * variante source dans une variante cible, à partir de leur ancêtre commun (la révision de dérivation, ou la dernière
 * révision de la source déjà fusionnée). Pur et déterministe : ni base, ni React, ni DOM ; les entrées ne sont jamais
 * modifiées.
 *
 * Granularité : un ÉLÉMENT est un membre identifié d'une liste du document (`famille:identifiant`, comme
 * `concurrence.ts` ; une propriété déclarée est `proprietes:cible#nom`) ; une liste sans identités, ou une valeur de premier
 * niveau, vaut un seul élément (`famille`). Une PROPRIÉTÉ est un champ de premier niveau d'un élément (hors `id`). Pour
 * chaque élément puis chaque propriété : un changement d'un seul côté est repris ; le même changement des deux côtés
 * n'est pas un conflit ; deux changements différents sont un CONFLIT, jamais tranché en silence.
 *
 * Conflits (`StudioTypeConflitFusion`) :
 *  - `modification-concurrente` : même propriété (ou même élément, si son type change) modifiée des deux côtés ;
 *  - `suppression-modification` : élément supprimé d'un côté, modifié de l'autre ;
 *  - `collision-identifiant` : même identifiant ajouté des deux côtés avec des contenus différents ;
 *  - `combinaison-invalide` : propriétés reprises des deux côtés dont l'assemblage refuse la validation du document ;
 *  - `reference-cassee` : le document fusionné romprait une référence (cote associative → objet coté, ouverture → mur
 *    hôte, prisme → profil source, cote de face → solide, propriété → cible, apparence → objet visé, objet → calque) ou
 *    ferait revivre un opérande conservé d'un solide exact à côté de ce solide (identifiant en double).
 * Chaque conflit se résout explicitement, par l'utilisateur : `source` (garder la version de la source) ou `cible`
 * (garder celle de la cible), pour tous ses éléments (ou sa propriété). Tant qu'un conflit n'a pas de résolution, le
 * document montré est PROVISOIRE (version de la cible gardée) et la fusion ne s'applique pas (`nonResolus`).
 *
 * Familles atomiques : un solide exact (résultat calculé par le noyau du serveur, lié à ses opérandes), un élément non
 * natif (lu à l'import, non éditable), les sources importées et le système de projet ne se fusionnent jamais propriété
 * par propriété : deux changements différents y sont un conflit de l'élément entier.
 *
 * Ordre du document fusionné : celui de la cible, puis les éléments repris de la source dans l'ordre de la source.
 * Le résultat est validé (`validateStudioDocument`) : un document invalide n'est jamais proposé (`valide: false`).
 */

export type StudioCoteFusion = "source" | "cible";
export type StudioTypeConflitFusion = "modification-concurrente" | "suppression-modification" | "collision-identifiant" | "combinaison-invalide" | "reference-cassee";
export const STUDIO_TYPES_CONFLITS_FUSION: readonly StudioTypeConflitFusion[] = Object.freeze(["modification-concurrente", "suppression-modification", "collision-identifiant", "combinaison-invalide", "reference-cassee"]);
export type StudioNatureReferenceFusion = StudioNatureRelation | "calque" | "operande-doublon";

/** État d'un élément d'un côté : absent (`null`) ou son type (`type` de l'objet, sinon la famille). */
export type StudioEtatElementFusion = string | null;

export interface StudioConflitFusion {
  /** Identifiant stable du conflit (clé des résolutions). */
  id: string;
  type: StudioTypeConflitFusion;
  /** Éléments que la résolution fixe (famille:identifiant). */
  cles: string[];
  /** Propriété en conflit (modification concurrente d'une propriété), sinon `null` (élément entier). */
  propriete: string | null;
  /** Côté où l'élément a été supprimé (`suppression-modification`). */
  supprimeDans?: StudioCoteFusion;
  /** Référence rompue (`reference-cassee`) : élément qui référence, élément référencé, nature. */
  reference?: { de: string; vers: string; nature: StudioNatureReferenceFusion };
  /** État du premier élément à l'ancêtre, dans la source et dans la cible. */
  etats: { base: StudioEtatElementFusion; source: StudioEtatElementFusion; cible: StudioEtatElementFusion };
  /** Valeurs de la propriété en conflit (JSON ; une valeur de plus de 400 caractères est résumée), sinon absentes. */
  valeurs?: { base: unknown; source: unknown; cible: unknown };
  resolution: StudioCoteFusion | null;
}

export type StudioEtatChangementFusion = "ajoute" | "supprime" | "modifie";
export interface StudioChangementFusion { cle: string; etat: StudioEtatChangementFusion }
/** Changement que la fusion apporte à la cible, et d'où il vient. */
export interface StudioChangementApplique extends StudioChangementFusion {
  origine: "source" | "mixte" | "resolution";
}

export interface StudioApercuFusion {
  schema: "studio-fusion/1";
  /** Changements de l'ancêtre vers la source, et de l'ancêtre vers la cible (clés triées). */
  changementsSource: StudioChangementFusion[];
  changementsCible: StudioChangementFusion[];
  /** Ce que la fusion changerait dans la cible (document fusionné comparé à la cible). */
  appliques: StudioChangementApplique[];
  conflits: StudioConflitFusion[];
  /** Identifiants des conflits sans résolution. */
  nonResolus: string[];
  /** Résolutions fournies qui ne désignent aucun conflit de cet aperçu (aperçu périmé). */
  resolutionsInconnues: string[];
  /** Document fusionné validé (provisoire tant qu'un conflit n'est pas résolu), `null` s'il est invalide. */
  document: StudioDocument | null;
  provisoire: boolean;
  valide: boolean;
  erreur: { path: string; message: string } | null;
  /** SHA-256 du JSON du document fusionné (`null` s'il est invalide) : l'application exige le même contenu exact. */
  empreinte: string | null;
  /** Vrai si la fusion changerait la cible. */
  aFusionner: boolean;
}

const ENTETE = new Set(["id", "schemaVersion", "units", "frame"]);
/** Familles fusionnées élément par élément seulement (jamais propriété par propriété). */
const ATOMIQUES = new Set(["exacts", "nonNatifs", "sources", "systemeProjet"]);
/** Propriétés couplées d'un même type : fusionnées ensemble (une polyligne : sommets, renflements, fermeture). */
const GROUPES: Readonly<Record<string, readonly (readonly string[])[]>> = Object.freeze({ polyline: [["points", "bulges", "closed"]] });
const DEFAUT_ITERATIONS = 8;

function stable(v: unknown): string {
  if (v === undefined) return "\u0000absent";
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : stable(x))).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}
const egal = (a: unknown, b: unknown): boolean => stable(a) === stable(b);
const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function identite(famille: string, item: unknown): string | null {
  if (!estObjet(item)) return null;
  if (famille === "proprietes" && typeof item.cibleId === "string" && typeof item.nom === "string") return `${item.cibleId}#${item.nom}`;
  return typeof item.id === "string" ? item.id : null;
}

interface Element { famille: string; valeur: unknown }
interface Inventaire {
  elements: Map<string, Element>;
  /** Ordre des clés par famille ; ordre des familles. */
  ordre: Map<string, string[]>;
  familles: string[];
  /** Famille sans identités (un seul élément). */
  entiere: Set<string>;
}

function inventaire(doc: StudioDocument): Inventaire {
  const elements = new Map<string, Element>(), ordre = new Map<string, string[]>(), familles: string[] = [], entiere = new Set<string>();
  for (const [famille, valeur] of Object.entries(doc as unknown as Record<string, unknown>)) {
    if (ENTETE.has(famille) || valeur === undefined) continue;
    familles.push(famille);
    if (Array.isArray(valeur)) {
      const ids = valeur.map((x) => identite(famille, x));
      if (ids.every((c) => c !== null) && new Set(ids).size === ids.length) {
        const cles = ids.map((id) => `${famille}:${id}`);
        valeur.forEach((item, i) => elements.set(cles[i]!, { famille, valeur: item }));
        ordre.set(famille, cles);
        continue;
      }
    }
    entiere.add(famille);
    // Une liste vide équivaut à une liste absente (forme canonique).
    if (!(Array.isArray(valeur) && valeur.length === 0)) elements.set(famille, { famille, valeur });
    ordre.set(famille, [famille]);
  }
  return { elements, ordre, familles, entiere };
}

const etatDe = (e: Element | undefined): StudioEtatElementFusion => {
  if (!e) return null;
  const v = e.valeur;
  return estObjet(v) && typeof v.type === "string" ? v.type : e.famille;
};

function changements(avant: Inventaire, apres: Inventaire): StudioChangementFusion[] {
  const out: StudioChangementFusion[] = [];
  for (const cle of [...new Set([...avant.elements.keys(), ...apres.elements.keys()])].sort()) {
    const a = avant.elements.get(cle), b = apres.elements.get(cle);
    if (!a && b) out.push({ cle, etat: "ajoute" });
    else if (a && !b) out.push({ cle, etat: "supprime" });
    else if (a && b && !egal(a.valeur, b.valeur)) out.push({ cle, etat: "modifie" });
  }
  return out;
}

const resume = (v: unknown): unknown => {
  const s = v === undefined ? undefined : JSON.stringify(v);
  return s !== undefined && s.length > 400 ? { resume: `${s.slice(0, 120)}…`, caracteres: s.length } : v;
};

/** Propriétés d'un élément, regroupées (groupes couplés du type) ; `id` (et la clé d'une propriété déclarée) exclus. */
function proprietesDe(famille: string, type: string | null, valeurs: Record<string, unknown>[]): string[][] {
  const exclues = new Set(famille === "proprietes" ? ["cibleId", "nom"] : ["id"]);
  const cles = [...new Set(valeurs.flatMap((v) => Object.keys(v)))].filter((k) => !exclues.has(k)).sort();
  const groupes = (type ? GROUPES[type] : undefined) ?? [];
  const pris = new Set<string>();
  const out: string[][] = [];
  for (const g of groupes) {
    const present = g.filter((k) => cles.includes(k));
    if (present.length) { out.push([...g]); g.forEach((k) => pris.add(k)); }
  }
  for (const k of cles) if (!pris.has(k)) out.push([k]);
  return out;
}

interface Etat {
  /** Valeur retenue par clé (`undefined` : absent). */
  valeurs: Map<string, unknown>;
  /** Clés dont la valeur retenue diffère de la cible, et pourquoi. */
  origine: Map<string, "source" | "mixte" | "resolution">;
}

/**
 * Fusion à trois voies (aperçu ou résultat) : `base` est le document de l'ancêtre commun, `source` celui de la
 * variante fusionnée, `cible` celui de la variante qui reçoit ; `resolutions` associe à un identifiant de conflit le côté
 * gardé. Les trois documents sont validés d'abord (exception `StudioValidationError` sinon).
 */
export function studioFusionnerVariantes(base: StudioDocument, source: StudioDocument, cible: StudioDocument, resolutions: Readonly<Record<string, StudioCoteFusion>> = {}): StudioApercuFusion {
  const B = inventaire(validateStudioDocument(base)), S = inventaire(validateStudioDocument(source)), C = inventaire(validateStudioDocument(cible));
  const docCible = validateStudioDocument(cible);
  for (const [id, cote] of Object.entries(resolutions)) {
    if (cote !== "source" && cote !== "cible") throw new StudioValidationError(`resolutions.${id}`, "« source » ou « cible » attendu");
  }
  const conflits = new Map<string, StudioConflitFusion>();
  const etat: Etat = { valeurs: new Map(), origine: new Map() };
  const valeurCote = (cote: StudioCoteFusion, cle: string): unknown => (cote === "source" ? S : C).elements.get(cle)?.valeur;
  const fixer = (cle: string, valeur: unknown, origine: "source" | "mixte" | "resolution") => {
    etat.valeurs.set(cle, valeur);
    if (egal(valeur, C.elements.get(cle)?.valeur)) etat.origine.delete(cle);
    else etat.origine.set(cle, origine);
  };
  const ajouterConflit = (c: Omit<StudioConflitFusion, "resolution">): StudioConflitFusion => {
    const existant = conflits.get(c.id);
    if (existant) return existant;
    const complet: StudioConflitFusion = { ...c, resolution: resolutions[c.id] ?? null };
    conflits.set(c.id, complet);
    return complet;
  };
  const etats = (cle: string) => ({ base: etatDe(B.elements.get(cle)), source: etatDe(S.elements.get(cle)), cible: etatDe(C.elements.get(cle)) });
  const mixtes: string[] = [];

  // 1. Éléments, puis propriétés.
  const toutes = [...new Set([...B.elements.keys(), ...S.elements.keys(), ...C.elements.keys()])].sort();
  for (const cle of toutes) {
    const b = B.elements.get(cle)?.valeur, s = S.elements.get(cle)?.valeur, t = C.elements.get(cle)?.valeur;
    if (egal(s, t) || egal(s, b)) { etat.valeurs.set(cle, t); continue; }
    if (egal(t, b)) { fixer(cle, s, "source"); continue; }
    const famille = (B.elements.get(cle) ?? S.elements.get(cle) ?? C.elements.get(cle))!.famille;
    const elementEntier = (type: StudioTypeConflitFusion, extra: Partial<StudioConflitFusion> = {}) => {
      const prefixe = type === "collision-identifiant" ? "collision" : type === "suppression-modification" ? "suppression" : "modification";
      const c = ajouterConflit({ id: `${prefixe}:${cle}`, type, cles: [cle], propriete: null, etats: etats(cle), ...extra });
      const cote = c.resolution ?? "cible";
      if (c.resolution) fixer(cle, valeurCote(cote, cle), "resolution"); else etat.valeurs.set(cle, t);
    };
    if (b === undefined) { elementEntier("collision-identifiant"); continue; }
    if (s === undefined) { elementEntier("suppression-modification", { supprimeDans: "source" }); continue; }
    if (t === undefined) { elementEntier("suppression-modification", { supprimeDans: "cible" }); continue; }
    const typeDe = (v: unknown) => (estObjet(v) && typeof v.type === "string" ? v.type : null);
    const parProprietes = estObjet(b) && estObjet(s) && estObjet(t) && !ATOMIQUES.has(famille) && !B.entiere.has(famille) && !S.entiere.has(famille) && !C.entiere.has(famille)
      && typeDe(b) === typeDe(s) && typeDe(s) === typeDe(t);
    if (!parProprietes) { elementEntier("modification-concurrente"); continue; }
    const fusionne: Record<string, unknown> = { ...(t as Record<string, unknown>) };
    let deLaSource = false, resolu = false;
    for (const groupe of proprietesDe(famille, typeDe(t), [b as Record<string, unknown>, s as Record<string, unknown>, t as Record<string, unknown>])) {
      const pick = (o: Record<string, unknown>) => Object.fromEntries(groupe.map((k) => [k, o[k]]));
      const pb = pick(b as Record<string, unknown>), ps = pick(s as Record<string, unknown>), pt = pick(t as Record<string, unknown>);
      let retenu: Record<string, unknown> = pt;
      if (egal(ps, pt) || egal(ps, pb)) retenu = pt;
      else if (egal(pt, pb)) { retenu = ps; deLaSource = true; }
      else {
        const nom = groupe.join("+");
        const v = (o: Record<string, unknown>) => resume(groupe.length === 1 ? o[groupe[0]!] : o);
        const c = ajouterConflit({ id: `modification:${cle}/${nom}`, type: "modification-concurrente", cles: [cle], propriete: nom, etats: etats(cle), valeurs: { base: v(pb), source: v(ps), cible: v(pt) } });
        if (c.resolution === "source") { retenu = ps; deLaSource = true; resolu = true; }
        else { retenu = pt; if (c.resolution) resolu = true; }
      }
      for (const k of groupe) { if (retenu[k] === undefined) delete fusionne[k]; else fusionne[k] = retenu[k]; }
    }
    if (egal(fusionne, t)) { etat.valeurs.set(cle, t); continue; }
    fixer(cle, fusionne, deLaSource && !egal(fusionne, s) ? "mixte" : resolu ? "resolution" : "source");
    if (!egal(fusionne, s)) mixtes.push(cle);
  }

  // 2. Assemblage de propriétés des deux côtés : contrôlé dans le contexte de la cible.
  for (const cle of mixtes) {
    const valeur = etat.valeurs.get(cle);
    let invalide = false;
    try { validateStudioDocument(remplacer(docCible, C, cle, valeur)); } catch (e) { if (e instanceof StudioValidationError) invalide = true; else throw e; }
    if (!invalide) continue;
    const c = ajouterConflit({ id: `combinaison:${cle}`, type: "combinaison-invalide", cles: [cle], propriete: null, etats: etats(cle) });
    if (c.resolution) fixer(cle, valeurCote(c.resolution, cle), "resolution");
    else etat.valeurs.set(cle, C.elements.get(cle)?.valeur);
  }

  // 3. Références du document fusionné, jusqu'à stabilité (une résolution peut en rompre ou en réparer d'autres).
  for (let i = 0; i < DEFAUT_ITERATIONS; i++) {
    const doc = assembler(docCible, C, S, etat.valeurs);
    let change = false;
    for (const r of referencesCassees(doc, [B, S, C])) {
      const c = ajouterConflit({ id: `reference:${r.nature}:${r.de}>${r.vers}`, type: "reference-cassee", cles: [r.de, r.vers], propriete: null, reference: r, etats: etats(r.de) });
      if (!c.resolution) continue;
      for (const cle of c.cles) {
        const v = valeurCote(c.resolution, cle);
        if (!egal(v, etat.valeurs.get(cle))) { fixer(cle, v, "resolution"); change = true; }
      }
    }
    if (!change) break;
  }

  const documentBrut = assembler(docCible, C, S, etat.valeurs);
  let document: StudioDocument | null = null, erreur: StudioApercuFusion["erreur"] = null;
  try { document = validateStudioDocument(documentBrut); }
  catch (e) {
    if (!(e instanceof StudioValidationError)) throw e;
    erreur = { path: e.path, message: e.message };
  }
  const liste = [...conflits.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const nonResolus = liste.filter((c) => c.resolution === null).map((c) => c.id);
  const finale = document ? inventaire(document) : inventaire(documentBrut as StudioDocument);
  const appliques: StudioChangementApplique[] = changements(C, finale).map((ch) => ({ ...ch, origine: etat.origine.get(ch.cle) ?? "source" }));
  return {
    schema: "studio-fusion/1",
    changementsSource: changements(B, S), changementsCible: changements(B, C),
    appliques, conflits: liste, nonResolus,
    resolutionsInconnues: Object.keys(resolutions).filter((id) => !conflits.has(id)).sort(),
    document, provisoire: nonResolus.length > 0, valide: document !== null, erreur,
    empreinte: document ? studioEmpreinteFusion(document) : null,
    aFusionner: appliques.length > 0,
  };
}

/** Empreinte du document fusionné (SHA-256 de son JSON) : l'application exige le contenu exact de l'aperçu accepté. */
export const studioEmpreinteFusion = (document: StudioDocument): string => studioSha256(JSON.stringify(document));

/** Document de la cible où l'élément `cle` prend la valeur `valeur` (ajouté en fin de sa famille s'il manquait). */
function remplacer(cible: StudioDocument, C: Inventaire, cle: string, valeur: unknown): StudioDocument {
  const valeurs = new Map<string, unknown>([...C.elements].map(([k, e]) => [k, e.valeur]));
  valeurs.set(cle, valeur);
  return assembler(cible, C, C, valeurs);
}

/**
 * Document assemblé : en-tête de la cible ; familles dans l'ordre de la cible puis de la source ; dans chaque famille,
 * l'ordre de la cible puis celui de la source. Une famille vide est omise (forme canonique), sauf `objects`, toujours présente.
 */
function assembler(cible: StudioDocument, C: Inventaire, S: Inventaire, valeurs: ReadonlyMap<string, unknown>): StudioDocument {
  const out: Record<string, unknown> = {};
  const c = cible as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) if (ENTETE.has(k)) out[k] = c[k];
  const familles = [...new Set([...C.familles, ...S.familles, ...[...valeurs.keys()].map((k) => k.split(":")[0]!)])];
  for (const f of familles) {
    const cles = [...new Set([...(C.ordre.get(f) ?? []), ...(S.ordre.get(f) ?? []), ...[...valeurs.keys()].filter((k) => k === f || k.startsWith(`${f}:`))])];
    if (cles.length === 1 && cles[0] === f) {
      const v = valeurs.get(f);
      if (v !== undefined) out[f] = structuredClone(v);
      continue;
    }
    const items = cles.map((k) => valeurs.get(k)).filter((v) => v !== undefined).map((v) => structuredClone(v));
    if (items.length || f === "objects") out[f] = items;
  }
  return out as unknown as StudioDocument;
}

interface ReferenceCassee { de: string; vers: string; nature: StudioNatureReferenceFusion }

/** Références rompues d'un document assemblé (non validé) ; les clés des éléments viennent des inventaires. */
function referencesCassees(doc: StudioDocument, inventaires: readonly Inventaire[]): ReferenceCassee[] {
  const d = doc as unknown as Record<string, unknown>;
  const vivants = new Map<string, string>();
  for (const [f, v] of Object.entries(d)) {
    if (ENTETE.has(f) || f === "layers" || f === "proprietes" || !Array.isArray(v)) continue;
    for (const item of v) { const id = identite(f, item); if (id !== null && !vivants.has(id)) vivants.set(id, `${f}:${id}`); }
  }
  const calques = new Set(((d.layers as unknown[] | undefined) ?? []).map((l) => identite("layers", l)).filter((x): x is string => x !== null));
  const cleDe = (id: string, exclure?: string): string => {
    const vivant = vivants.get(id);
    if (vivant && vivant !== exclure) return vivant;
    for (const inv of inventaires) for (const k of inv.elements.keys()) if (k !== exclure && k.slice(k.indexOf(":") + 1) === id && !k.startsWith("layers:") && !k.startsWith("proprietes:")) return k;
    return `?:${id}`;
  };
  const out: ReferenceCassee[] = [];
  let relations: ReturnType<typeof studioRelations> = [];
  try { relations = studioRelations(doc); } catch { relations = []; }
  for (const r of relations) {
    if (r.nature === "operande") continue;
    if (vivants.has(r.vers)) continue;
    const de = r.nature === "propriete" ? `proprietes:${r.de}` : vivants.get(r.de) ?? cleDe(r.de);
    out.push({ de, vers: cleDe(r.vers), nature: r.nature });
  }
  // Opérandes conservés d'un solide exact : jamais vivants à côté de lui (identifiant en double).
  for (const s of (d.exacts as Parameters<typeof studioIdsOperandes>[0][] | undefined) ?? []) {
    let ids: string[] = [];
    try { ids = studioIdsOperandes(s); } catch { ids = []; }
    for (const id of ids) {
      const vivant = vivants.get(id);
      if (vivant && vivant !== `exacts:${s.id}`) out.push({ de: `exacts:${s.id}`, vers: vivant, nature: "operande-doublon" });
    }
  }
  // Calques : un élément sur un calque absent.
  for (const [f, v] of Object.entries(d)) {
    if (ENTETE.has(f) || f === "layers" || !Array.isArray(v)) continue;
    for (const item of v) {
      if (!estObjet(item) || typeof item.layerId !== "string" || calques.has(item.layerId)) continue;
      if (f === "architecture" && item.type === "opening") continue;
      const id = identite(f, item);
      if (id === null) continue;
      out.push({ de: `${f}:${id}`, vers: `layers:${item.layerId}`, nature: "calque" });
    }
  }
  const vus = new Set<string>();
  return out.filter((r) => { const k = `${r.nature}|${r.de}|${r.vers}`; if (vus.has(k)) return false; vus.add(k); return true; })
    .sort((a, b) => (`${a.de}${a.nature}${a.vers}` < `${b.de}${b.nature}${b.vers}` ? -1 : 1));
}

// ——— Ancêtre commun ———

/** Révision du graphe d'une étude : ses parents (révision précédente, révision de dérivation, révision fusionnée). */
export interface StudioNoeudRevision { id: string; parents: readonly string[] }

export type StudioAncetreCommun = { ancetre: string } | { ancetre: null; motif: "aucun" | "ambigu"; candidats: string[] };

/**
 * Ancêtre commun le plus proche de deux révisions : parmi les ancêtres communs (chaque révision est son propre ancêtre),
 * celui qui n'est l'ancêtre d'aucun autre. Aucun : les deux histoires ne se rejoignent pas (variantes créées vides, copie
 * indépendante). Plusieurs : fusions croisées, l'ancêtre est ambigu et n'est jamais choisi au hasard.
 */
export function studioAncetreCommun(noeuds: Iterable<StudioNoeudRevision>, a: string, b: string): StudioAncetreCommun {
  const parents = new Map<string, readonly string[]>();
  for (const n of noeuds) parents.set(n.id, n.parents);
  const ancetres = (depart: string): Set<string> => {
    const vus = new Set<string>([depart]);
    const pile = [depart];
    while (pile.length) for (const p of parents.get(pile.pop()!) ?? []) if (!vus.has(p)) { vus.add(p); pile.push(p); }
    return vus;
  };
  const deA = ancetres(a), deB = ancetres(b);
  const communs = [...deA].filter((x) => deB.has(x));
  if (!communs.length) return { ancetre: null, motif: "aucun", candidats: [] };
  const domines = new Set<string>();
  for (const c of communs) {
    const pile = [...(parents.get(c) ?? [])];
    while (pile.length) {
      const p = pile.pop()!;
      if (domines.has(p)) continue;
      domines.add(p);
      pile.push(...(parents.get(p) ?? []));
    }
  }
  const meilleurs = communs.filter((c) => !domines.has(c)).sort();
  return meilleurs.length === 1 ? { ancetre: meilleurs[0]! } : { ancetre: null, motif: "ambigu", candidats: meilleurs };
}
