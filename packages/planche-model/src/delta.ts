/**
 * Lot 7 — persistance par commandes : différence structurelle entre deux modèles de la Planche (`DeltaPlanche`),
 * application de cette différence, empreinte reproductible du modèle, lecture validée d'un modèle sérialisé.
 *
 * Une opération de la Planche (un pas d'historique) devient une commande `planche.operation { delta, empreinteApres }`
 * du contrat de l'Atelier : le serveur applique le même delta avec cette fonction pure et refuse le lot si l'empreinte
 * obtenue n'est pas celle annoncée (la Planche a changé entre-temps : 409). Les tables sont des `Record<Id, …>` :
 * une entrée du delta est la valeur d'après, ou `null` pour une suppression ; une clé absente est inchangée.
 */
import type { Annotations, Balise, Cote, Extrusion, Guide, Materiau, PlanDeCoupe, ReglagesPlanche, Repere, Scene, TexteAnnotation } from "./annotations.js";
import type { Arete, Contexte, Courbe, Definition, Face, Id, Modele, Occurrence, Sommet } from "./geometrie-libre.js";

export type DeltaTable<T> = Readonly<Record<Id, T | null>>;

export interface DeltaContexte {
  readonly sommets?: DeltaTable<Sommet>;
  readonly aretes?: DeltaTable<Arete>;
  readonly faces?: DeltaTable<Face>;
  readonly courbes?: DeltaTable<Courbe>;
  readonly occurrences?: DeltaTable<Occurrence>;
}

export interface DeltaAnnotations {
  readonly guides?: DeltaTable<Guide>;
  readonly cotes?: DeltaTable<Cote>;
  readonly textes?: DeltaTable<TexteAnnotation>;
  readonly plansDeCoupe?: DeltaTable<PlanDeCoupe>;
  readonly materiaux?: DeltaTable<Materiau>;
  readonly balises?: DeltaTable<Balise>;
  readonly scenes?: DeltaTable<Scene>;
  readonly extrusions?: DeltaTable<Extrusion>;
  /** `null` = repère retiré ; absent = inchangé. */
  readonly repere?: Repere | null;
  readonly reglages?: ReglagesPlanche | null;
}

export interface DeltaPlanche {
  readonly racine?: DeltaContexte;
  /** Définitions (groupes, composants) remplacées entières : leur contenu est un contexte complet. */
  readonly definitions?: DeltaTable<Definition>;
  readonly annotations?: DeltaAnnotations;
  readonly prochainId?: number;
}

const CLES_CONTEXTE = ["sommets", "aretes", "faces", "courbes", "occurrences"] as const;
const CLES_ANNOTATIONS = ["guides", "cotes", "textes", "plansDeCoupe", "materiaux", "balises", "scenes", "extrusions"] as const;

function differenceTable<T>(a: Readonly<Record<Id, T>> | undefined, b: Readonly<Record<Id, T>> | undefined): DeltaTable<T> | undefined {
  if (a === b) return undefined;
  const aa = a ?? {};
  const bb = b ?? {};
  const d: Record<Id, T | null> = {};
  let n = 0;
  for (const id of Object.keys(aa)) {
    if (!(id in bb)) {
      d[id] = null;
      n++;
    } else if (aa[id] !== bb[id] && serialisationStable(aa[id]) !== serialisationStable(bb[id])) {
      d[id] = bb[id]!;
      n++;
    }
  }
  for (const id of Object.keys(bb)) {
    if (!(id in aa)) {
      d[id] = bb[id]!;
      n++;
    }
  }
  return n ? d : undefined;
}

function appliquerTable<T>(table: Readonly<Record<Id, T>> | undefined, d: DeltaTable<T> | undefined): Readonly<Record<Id, T>> | undefined {
  if (!d) return table;
  const r: Record<Id, T> = { ...(table ?? {}) };
  for (const [id, v] of Object.entries(d)) {
    if (v === null) delete r[id];
    else r[id] = v;
  }
  return r;
}

const memeValeur = (a: unknown, b: unknown) => a === b || serialisationStable(a) === serialisationStable(b);

/** Ce qui change de `avant` à `apres`, ou `null` si les deux modèles sont identiques. */
export function differencePlanche(avant: Modele, apres: Modele): DeltaPlanche | null {
  if (avant === apres) return null;
  const delta: { -readonly [K in keyof DeltaPlanche]: DeltaPlanche[K] } = {};
  const racine: { -readonly [K in keyof DeltaContexte]: DeltaContexte[K] } = {};
  let r = false;
  for (const k of CLES_CONTEXTE) {
    const d = differenceTable(avant.racine[k] as Readonly<Record<Id, unknown>>, apres.racine[k] as Readonly<Record<Id, unknown>>);
    if (d) {
      (racine as Record<string, unknown>)[k] = d;
      r = true;
    }
  }
  if (r) delta.racine = racine;
  const defs = differenceTable(avant.definitions, apres.definitions);
  if (defs) delta.definitions = defs;
  const an: { -readonly [K in keyof DeltaAnnotations]: DeltaAnnotations[K] } = {};
  let a = false;
  const aa: Partial<Annotations> = avant.annotations ?? {};
  const ab: Partial<Annotations> = apres.annotations ?? {};
  for (const k of CLES_ANNOTATIONS) {
    const d = differenceTable(aa[k] as Readonly<Record<Id, unknown>> | undefined, ab[k] as Readonly<Record<Id, unknown>> | undefined);
    if (d) {
      (an as Record<string, unknown>)[k] = d;
      a = true;
    }
  }
  if (!memeValeur(aa.repere, ab.repere)) {
    an.repere = ab.repere ?? null;
    a = true;
  }
  if (!memeValeur(aa.reglages, ab.reglages)) {
    an.reglages = ab.reglages ?? null;
    a = true;
  }
  if (a) delta.annotations = an;
  if (avant.prochainId !== apres.prochainId) delta.prochainId = apres.prochainId;
  return Object.keys(delta).length ? delta : null;
}

/** Applique un delta : le modèle d'arrivée (le modèle de départ n'est pas modifié). */
export function appliquerDeltaPlanche(m: Modele, delta: DeltaPlanche): Modele {
  let racine: Contexte = m.racine;
  if (delta.racine) {
    const r = { ...m.racine } as { -readonly [K in keyof Contexte]: Contexte[K] };
    for (const k of CLES_CONTEXTE) (r as Record<string, unknown>)[k] = appliquerTable(m.racine[k] as Readonly<Record<Id, unknown>>, delta.racine[k] as DeltaTable<unknown> | undefined);
    racine = r;
  }
  const definitions = (appliquerTable(m.definitions, delta.definitions) ?? {}) as Readonly<Record<Id, Definition>>;
  let annotations = m.annotations;
  if (delta.annotations) {
    const an = { ...(m.annotations ?? annotationsVides()) } as Record<string, unknown>;
    for (const k of CLES_ANNOTATIONS) an[k] = appliquerTable((m.annotations?.[k] ?? {}) as Readonly<Record<Id, unknown>>, delta.annotations[k] as DeltaTable<unknown> | undefined) ?? {};
    // Table facultative (D-196) : absente plutôt que vide, comme la produit le noyau.
    if (Object.keys(an["extrusions"] as object).length === 0) delete an["extrusions"];
    if (delta.annotations.repere !== undefined) {
      if (delta.annotations.repere === null) delete an["repere"];
      else an["repere"] = delta.annotations.repere;
    }
    if (delta.annotations.reglages !== undefined) {
      if (delta.annotations.reglages === null) delete an["reglages"];
      else an["reglages"] = delta.annotations.reglages;
    }
    annotations = an as unknown as Annotations;
  }
  return { racine, definitions, prochainId: delta.prochainId ?? m.prochainId, ...(annotations ? { annotations } : {}) };
}

const annotationsVides = (): Annotations => ({ guides: {}, cotes: {}, textes: {}, plansDeCoupe: {}, materiaux: {}, balises: {} });

// ---------------------------------------------------------------------------------------------------------------
// Empreinte et lecture validée

/** Sérialisation JSON à clés triées (l'ordre des clés d'un objet n'est pas garanti d'un côté à l'autre). */
export function serialisationStable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(serialisationStable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${serialisationStable(o[k])}`)
    .join(",")}}`;
}

/**
 * Forme canonique pour l'empreinte : sections d'annotations vides retirées, `annotations` absent quand il ne reste rien.
 * Deux modèles équivalents (annotations absentes ou vides) ont ainsi la même empreinte, d'où qu'ils viennent.
 */
export function canoniquePlanche(m: Modele): Modele {
  if (!m.annotations) return m;
  const an: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m.annotations as unknown as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    an[k] = v;
  }
  const { annotations: _a, ...reste } = m;
  void _a;
  return Object.keys(an).length ? { ...reste, annotations: an as unknown as Annotations } : reste;
}

/** FNV-1a 64 bits (deux moitiés de 32 bits) sur la sérialisation stable de la forme canonique : 16 caractères hexadécimaux. */
export function empreintePlanche(m: Modele): string {
  const texte = serialisationStable(canoniquePlanche(m));
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c * 31 + (h1 & 0xff)) & 0xffff), 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const estNombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const estId = (v: unknown): v is Id => typeof v === "string" && v.length > 0 && v.length <= 64;
const estVec3 = (v: unknown): boolean => estObjet(v) && estNombre(v["x"]) && estNombre(v["y"]) && estNombre(v["z"]);
const estBoucle = (v: unknown): boolean => Array.isArray(v) && v.length >= 3 && v.every(estId);

/** Validateurs d'entités (valeurs reçues d'un client : jamais crues sur parole). */
export const validateursEntites: Record<(typeof CLES_CONTEXTE)[number], (id: Id, v: unknown) => boolean> = {
  sommets: (id, v) => estObjet(v) && v["id"] === id && estVec3(v["position"]),
  aretes: (id, v) => estObjet(v) && v["id"] === id && estId(v["a"]) && estId(v["b"]) && v["a"] !== v["b"] && (v["courbe"] === undefined || estId(v["courbe"])),
  faces: (id, v) => estObjet(v) && v["id"] === id && estBoucle(v["exterieur"]) && Array.isArray(v["trous"]) && v["trous"].every(estBoucle) && estVec3(v["normale"]),
  courbes: (id, v) => estObjet(v) && v["id"] === id && ["cercle", "polygone", "arc"].includes(v["genre"] as string) && Array.isArray(v["aretes"]) && v["aretes"].every(estId) && estVec3(v["centre"]) && estNombre(v["rayon"]) && estVec3(v["normale"]),
  occurrences: (id, v) => estObjet(v) && v["id"] === id && estId(v["definition"]) && Array.isArray(v["transformation"]) && v["transformation"].length === 16 && v["transformation"].every(estNombre),
};

/** Lien de surface étendue (D-196) : genre, sources, vecteur ou distance, instantanés de positions — jamais cru sur parole. */
export function estExtrusion(id: Id, v: unknown): boolean {
  if (!estObjet(v) || v["id"] !== id) return false;
  const positions = (t: unknown) => estObjet(t) && Object.entries(t).every(([k, p]) => estId(k) && estVec3(p));
  const sources = v["sources"];
  if (!Array.isArray(sources) || sources.length === 0 || !sources.every(estId)) return false;
  if (typeof v["symetrique"] !== "boolean" || !positions(v["sommetsSources"]) || !positions(v["sommetsCrees"])) return false;
  if (!estNombre(v["faces"]) || !Number.isInteger(v["faces"]) || (v["faces"] as number) < 0) return false;
  if (v["genre"] === "balayage") return estVec3(v["vecteur"]);
  if (v["genre"] === "couronne") return estNombre(v["distance"]);
  return false;
}

function estContexte(c: unknown): c is Contexte {
  if (!estObjet(c)) return false;
  for (const k of CLES_CONTEXTE) {
    const table = c[k];
    if (!estObjet(table)) return false;
    for (const [id, v] of Object.entries(table)) if (!validateursEntites[k](id, v)) return false;
  }
  // Références internes : arêtes vers des sommets du contexte, boucles de faces vers des sommets.
  const ctx = c as unknown as Contexte;
  for (const a of Object.values(ctx.aretes)) if (!ctx.sommets[a.a] || !ctx.sommets[a.b]) return false;
  for (const f of Object.values(ctx.faces)) for (const b of [f.exterieur, ...f.trous]) for (const s of b) if (!ctx.sommets[s]) return false;
  return true;
}

const estDefinition = (id: Id, d: unknown): d is Definition => estObjet(d) && d["id"] === id && typeof d["nom"] === "string" && (d["genre"] === "groupe" || d["genre"] === "composant") && estContexte(d["contenu"]);

/** Modèle de la Planche lu d'une valeur quelconque (JSON reçu, brouillon), ou `null` s'il est mal formé : chaque sommet, arête, face, courbe, occurrence et définition est vérifié, ainsi que les références internes. */
export function lireModelePlanche(brut: unknown): Modele | null {
  if (!estObjet(brut) || !estContexte(brut["racine"]) || !estObjet(brut["definitions"]) || !estNombre(brut["prochainId"]) || !Number.isInteger(brut["prochainId"]) || (brut["prochainId"] as number) < 0) return null;
  const definitions = brut["definitions"];
  for (const [id, d] of Object.entries(definitions)) if (!estDefinition(id, d)) return null;
  const occurrences = (c: Contexte) => Object.values(c.occurrences);
  for (const o of [...occurrences(brut["racine"]), ...Object.values(definitions).flatMap((d) => occurrences((d as Definition).contenu))]) if (!definitions[o.definition]) return null;
  const an = brut["annotations"];
  if (an !== undefined && !estObjet(an)) return null;
  if (an) {
    for (const k of CLES_ANNOTATIONS) if (an[k] !== undefined && !(estObjet(an[k]) && Object.entries(an[k] as object).every(([id, v]) => estObjet(v) && v["id"] === id))) return null;
    if (an["extrusions"] !== undefined && !Object.entries(an["extrusions"] as object).every(([id, v]) => estExtrusion(id, v))) return null;
    if (an["repere"] !== undefined && !(estObjet(an["repere"]) && estVec3(an["repere"]["origine"]))) return null;
    if (an["reglages"] !== undefined && !estObjet(an["reglages"])) return null;
  }
  return brut as unknown as Modele;
}

/** Forme d'un delta reçu : tables d'objets ou de `null`, `prochainId` entier ; le contenu des entrées n'est pas revalidé ici. */
export function estDeltaPlanche(v: unknown): v is DeltaPlanche {
  if (!estObjet(v)) return false;
  const table = (t: unknown, valide: (id: Id, x: unknown) => boolean = (_id, x) => estObjet(x)) => estObjet(t) && Object.entries(t).every(([id, x]) => x === null || valide(id, x));
  if (v["racine"] !== undefined && (!estObjet(v["racine"]) || !Object.entries(v["racine"]).every(([k, t]) => (CLES_CONTEXTE as readonly string[]).includes(k) && table(t, validateursEntites[k as (typeof CLES_CONTEXTE)[number]])))) return false;
  if (v["definitions"] !== undefined && !table(v["definitions"], (id, x) => estDefinition(id, x))) return false;
  if (v["annotations"] !== undefined) {
    const an = v["annotations"];
    if (!estObjet(an)) return false;
    for (const [k, t] of Object.entries(an)) {
      if ((CLES_ANNOTATIONS as readonly string[]).includes(k)) {
        if (!(k === "extrusions" ? table(t, estExtrusion) : table(t))) return false;
      } else if (k === "repere" || k === "reglages") {
        if (!(t === null || estObjet(t))) return false;
      } else return false;
    }
  }
  if (v["prochainId"] !== undefined && !(typeof v["prochainId"] === "number" && Number.isInteger(v["prochainId"]) && v["prochainId"] >= 0)) return false;
  return Object.keys(v).every((k) => ["racine", "definitions", "annotations", "prochainId"].includes(k));
}
