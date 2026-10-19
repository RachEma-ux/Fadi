/**
 * Base simulée en mémoire pour les suites Studio sans base (garde DB fermée : aucune connexion, aucun serveur) —
 * X.2-01 / X.2-02. S'emploie dans un `vi.mock("../db/client.js", …)` :
 *
 *   vi.mock("../db/client.js", async () => ({ db: (await import("./studio-base-simulee.js")).baseSimulee() }));
 *
 * Lignes par table (`banc.lignes`, objet drizzle → lignes). Les conditions drizzle (`eq`, `ne`, `and`, `or`, `not`,
 * `isNull`, `isNotNull`, `inArray`, `notInArray`, `gt`, `gte`, `lt`, `lte`) sont **évaluées** à partir de leurs fragments SQL
 * (colonnes, paramètres, mots-clés) ; toute autre forme lève une erreur explicite (jamais de réponse approximative).
 * Jointures (`innerJoin`, `leftJoin`) évaluées sur leur condition ; colonnes absentes d'une insertion : défaut de la
 * colonne (`now()` pour un horodatage, défaut littéral, sinon null). Une transaction travaille sur l'état courant et le
 * restaure si sa fonction échoue (tout ou rien, comme PostgreSQL). Aucun ordre (`orderBy`) ni borne (`limit`) n'est
 * appliqué : les suites qui s'en servent n'en dépendent pas (fixtures d'une ou deux lignes).
 */
import { Column, getTableColumns, is, Param, SQL } from "drizzle-orm";
import { applyStudioCommands, newStudioDocument, type StudioCommand } from "@parcours/atelier-model";
import { projectMembers, studioComments, studioRevisions, studioStudies, studioVariants, users } from "../db/schema.js";

export type Ligne = Record<string, unknown>;
export const banc = {
  lignes: new Map<unknown, Ligne[]>(),
  /** Nombre d'écritures (insertions, mises à jour, suppressions) exécutées. */
  ecritures: 0,
  transactions: { validees: 0, annulees: 0 },
  /** Panne simulée : levée par une mise à jour de cette table (après les écritures précédentes de la transaction). */
  panneSur: null as unknown,
};

type Jointe = Map<unknown, Ligne | null>;
type Jeton = { t: "mot"; v: string } | { t: "col"; c: unknown } | { t: "val"; v: unknown } | { t: "liste"; v: unknown[] };

const MOTS = /\s*(\(|\)|<>|<=|>=|=|<|>|\bis not null\b|\bis null\b|\bnot in\b|\bnot\b|\band\b|\bor\b|\bin\b)\s*/giy;

function jetons(x: unknown, out: Jeton[] = []): Jeton[] {
  if (is(x, SQL)) { for (const c of (x as unknown as { queryChunks: unknown[] }).queryChunks) jetons(c, out); return out; }
  if (is(x, Column)) { out.push({ t: "col", c: x }); return out; }
  if (is(x, Param)) { out.push({ t: "val", v: (x as unknown as { value: unknown }).value }); return out; }
  if (Array.isArray(x)) { out.push({ t: "liste", v: x.map((p) => (is(p, Param) ? (p as unknown as { value: unknown }).value : p)) }); return out; }
  if (x && typeof x === "object" && Array.isArray((x as { value?: unknown }).value)) {
    const texte = ((x as { value: string[] }).value).join("");
    let i = 0;
    while (i < texte.length) {
      MOTS.lastIndex = i;
      const m = MOTS.exec(texte);
      if (!m) { if (texte.slice(i).trim() === "") break; throw new Error(`base simulée : fragment SQL non pris en charge « ${texte.slice(i)} »`); }
      out.push({ t: "mot", v: m[1]!.toLowerCase() });
      i = MOTS.lastIndex;
    }
    return out;
  }
  throw new Error(`base simulée : fragment non pris en charge (${typeof x})`);
}

const egal = (a: unknown, b: unknown) => a === b || (a instanceof Date && b instanceof Date && a.getTime() === b.getTime())
  || (a instanceof Date && typeof b === "string" && a.toISOString() === new Date(b).toISOString());
const nombre = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === "string" && !Number.isNaN(Date.parse(v)) && /\d{4}-\d{2}-\d{2}/.test(v) ? Date.parse(v) : v as number);

function valeurColonne(j: Jointe, col: unknown): unknown {
  for (const [t, l] of j) {
    const c = Object.entries(getTableColumns(t as never)).find(([, x]) => x === col);
    if (c) return l ? l[c[0]] ?? null : null;
  }
  throw new Error(`base simulée : colonne hors des tables de la requête (${String((col as { name?: string }).name)})`);
}

/** Évalue une condition drizzle sur une ligne (jointe). */
export function evaluer(condition: unknown, j: Jointe): boolean {
  if (condition === undefined) return true;
  const ts = jetons(condition);
  let i = 0;
  const voir = () => ts[i];
  const mot = (v: string) => { const x = ts[i]; if (x?.t === "mot" && x.v === v) { i++; return true; } return false; };
  const operande = (): unknown => {
    const x = ts[i++];
    if (!x) throw new Error("base simulée : condition tronquée");
    if (x.t === "col") return valeurColonne(j, x.c);
    if (x.t === "val") return x.v;
    if (x.t === "liste") return x.v;
    throw new Error(`base simulée : opérande inattendu « ${x.v} »`);
  };
  const primaire = (): boolean => {
    if (mot("(")) { const r = ou(); if (!mot(")")) throw new Error("base simulée : parenthèse non fermée"); return comparer(r); }
    const a = operande();
    return comparer(a);
  };
  // Après un opérande (ou une sous-expression), un éventuel opérateur de comparaison.
  const comparer = (a: unknown): boolean => {
    const x = voir();
    if (x?.t !== "mot" || ["and", "or", ")"].includes(x.v)) return a as boolean;
    i++;
    switch (x.v) {
      case "is null": return a === null || a === undefined;
      case "is not null": return a !== null && a !== undefined;
      case "=": return egal(a, operande());
      case "<>": return !egal(a, operande());
      case "in": { const l = operande() as unknown[]; return l.some((v) => egal(a, v)); }
      case "not in": { const l = operande() as unknown[]; return !l.some((v) => egal(a, v)); }
      case "<": return nombre(a) < nombre(operande());
      case "<=": return nombre(a) <= nombre(operande());
      case ">": return nombre(a) > nombre(operande());
      case ">=": return nombre(a) >= nombre(operande());
      default: throw new Error(`base simulée : opérateur non pris en charge « ${x.v} »`);
    }
  };
  const unaire = (): boolean => (mot("not") ? !unaire() : primaire());
  const et = (): boolean => { let r = unaire(); while (mot("and")) { const b = unaire(); r = r && b; } return r; };
  const ou = (): boolean => { let r = et(); while (mot("or")) { const b = et(); r = r || b; } return r; };
  const r = ou();
  if (i !== ts.length) throw new Error("base simulée : condition non entièrement lue");
  return r;
}

function colonne(j: Jointe, col: unknown): unknown {
  for (const [t, l] of j) {
    if (col === t) return l ? structuredClone(l) : null;
    const c = Object.entries(getTableColumns(t as never)).find(([, x]) => x === col);
    if (c) return l ? structuredClone(l[c[0]] ?? null) : null;
  }
  // Expression SQL calculée (agrégat…) : non prise en charge, signalée plutôt qu'inventée.
  throw new Error("base simulée : expression de sélection non prise en charge");
}
function projeter(j: Jointe, selection?: Record<string, unknown>): Ligne {
  if (!selection) return structuredClone([...j.values()][0] ?? {});
  return Object.fromEntries(Object.entries(selection).map(([k, col]) => [k, colonne(j, col)]));
}

type Etat = { _where?: unknown; _joins: [unknown, boolean, unknown][]; _conflit?: { target: unknown; set: Ligne } };
function requete(executer: (q: Etat) => unknown[]) {
  const q: Record<string, unknown> & Etat = { _joins: [] };
  for (const m of ["orderBy", "groupBy", "limit", "offset", "for", "returning", "onConflictDoNothing", "having"]) q[m] = () => q;
  q["onConflictDoUpdate"] = (c: { target: unknown; set: Ligne }) => { q._conflit = c; return q; };
  q["where"] = (w: unknown) => { q._where = w; return q; };
  q["innerJoin"] = (t: unknown, on: unknown) => { q._joins.push([t, false, on]); return q; };
  q["leftJoin"] = (t: unknown, on: unknown) => { q._joins.push([t, true, on]); return q; };
  q["then"] = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
    try { return Promise.resolve(executer(q)).then(ok, ko); } catch (e) { return Promise.reject(e).then(ok, ko); }
  };
  return q;
}
function lire(table: unknown, joins: [unknown, boolean, unknown][]): Jointe[] {
  let rows: Jointe[] = (banc.lignes.get(table) ?? []).map((l) => new Map<unknown, Ligne | null>([[table, l]]));
  for (const [t, gauche, on] of joins) {
    const autres = banc.lignes.get(t) ?? [];
    rows = rows.flatMap((j) => {
      const ok = autres.map((l) => new Map([...j, [t, l]])).filter((n) => evaluer(on, n));
      return ok.length ? ok : gauche ? [new Map([...j, [t, null]])] : [];
    });
  }
  return rows;
}
const seule = (table: unknown, l: Ligne): Jointe => new Map([[table, l]]);
function defauts(table: unknown): Ligne {
  return Object.fromEntries(Object.entries(getTableColumns(table as never)).map(([k, c]) => {
    const col = c as unknown as { hasDefault?: boolean; default?: unknown; columnType?: string };
    if (col.hasDefault && col.columnType?.includes("Timestamp")) return [k, new Date()];
    if (col.hasDefault && col.default !== undefined && !is(col.default, SQL)) return [k, structuredClone(col.default)];
    return [k, null];
  }));
}

/** Copie profonde de l'état (pour une transaction ou un instantané comparable). */
export const copieEtat = () => new Map([...banc.lignes].map(([t, ls]) => [t, ls.map((l) => structuredClone(l))]));
/** Instantané comparable de toutes les lignes (dates comprises). */
export const instantane = () => JSON.stringify([...banc.lignes].map(([, ls]) => ls));

// --- Acteurs et accès simulés --------------------------------------------------------------------------------------

/**
 * Comptes du projet `p` : non-membre, lecteur, éditeur, éditeur pendant le verrou d'édition d'un autre compte,
 * propriétaire, propriétaire d'un projet de référence protégé. Tout autre projet : aucun accès (404).
 */
export const ACTEURS = ["etranger", "lecteur", "editeur", "editeur-verrou", "proprietaire", "proprietaire-reference"] as const;
export type Acteur = (typeof ACTEURS)[number];
/** Verdicts de `projectAccessRefusal` relevés (besoin, statut ; null = admis). */
export const verdicts: { need: string; status: number | null }[] = [];

/** `require-auth` simulé : l'acteur est l'en-tête `x-acteur` (absent : 401, comme le vrai). */
export function authSimulee() {
  type Req = { headers: Record<string, string | string[] | undefined>; user?: unknown };
  type Res = { status: (n: number) => { json: (b: unknown) => void } };
  return {
    requireAuth: (req: Req, res: Res, next: () => void) => {
      const id = req.headers["x-acteur"];
      if (typeof id !== "string" || !id) { res.status(401).json({ error: "authentication_required" }); return; }
      req.user = { id, email: `${id}@exemple.test`, displayName: null };
      next();
    },
    attachUser: (_req: unknown, _res: unknown, next: () => void) => next(),
  };
}

/** `owned-project` simulé : `loadProjectAccess` d'après `ACTEURS`, `projectAccessRefusal` réel enveloppé d'un relevé. */
export function accesSimule<M extends { projectAccessRefusal: (a: never, u: string, n: never) => { status: number; body: Record<string, unknown> } | null }>(reel: M) {
  const futur = new Date(Date.now() + 3_600_000).toISOString();
  const acces: Record<string, Record<string, unknown>> = {
    proprietaire: { role: "proprietaire" },
    editeur: { role: "editeur" },
    lecteur: { role: "lecteur" },
    "editeur-verrou": { role: "editeur", editingLock: { userId: "proprietaire", email: "proprietaire@exemple.test", expiresAt: futur, acquiredAt: futur } },
    "proprietaire-reference": { role: "proprietaire", exampleMode: "reference" },
  };
  return {
    ...reel,
    loadProjectAccess: async (projectId: string, actorId: string) =>
      projectId === "p" && acces[actorId] ? { id: "p", ownerId: "proprietaire", code: "P", name: "Projet", exampleMode: null, editingLock: null, ...acces[actorId] } : null,
    projectAccessRefusal: (access: never, userId: string, need: never) => {
      const r = reel.projectAccessRefusal(access, userId, need);
      verdicts.push({ need, status: r?.status ?? null });
      return r;
    },
  };
}

/**
 * Projet `p` d'essai : comptes de `ACTEURS` (le propriétaire est `ownerId`, les autres membres), étude `s`, variante
 * initiale `v` dont la tête `r1` porte une ligne `a` de 4 m, commentaire `c1` de l'éditeur. Remet les relevés à zéro.
 */
export function initialiserProjet(): void {
  const document = applyStudioCommands(newStudioDocument("doc"), [
    { toolId: "studio.dessin.ligne", params: { id: "a", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } } as StudioCommand,
  ]);
  banc.lignes = new Map<unknown, Ligne[]>([
    [users, [...ACTEURS].map((id) => ({ id, email: `${id}@exemple.test`, displayName: null }))],
    [projectMembers, ACTEURS.filter((a) => a !== "etranger" && a !== "proprietaire").map((userId) => ({ projectId: "p", userId, role: userId.startsWith("lecteur") ? "lecteur" : "editeur", createdAt: new Date() }))],
    [studioStudies, [{ id: "s", projectId: "p", name: "Étude", initialVariantId: "v", archivedAt: null, createdAt: new Date(), createdBy: "proprietaire" }]],
    [studioVariants, [{ id: "v", studyId: "s", name: "Variante", headRevisionId: "r1", archivedAt: null, derivedFromVariantId: null, derivedFromRevisionId: null, createdAt: new Date() }]],
    [studioRevisions, [{ id: "r1", variantId: "v", parentRevisionId: null, document, envelope: null, requestId: "init-0", payloadHash: "h", source: "study-initialization", authorId: "proprietaire", response: null, createdAt: new Date() }]],
    [studioComments, [{ id: "c1", variantId: "v", revisionId: "r1", authorId: "editeur", body: "Remarque", objectIds: [], parentId: null, deletedAt: null, createdAt: new Date(), requestId: "c-1", payloadHash: "h" }]],
  ]);
  verdicts.length = 0;
  banc.ecritures = 0;
  banc.panneSur = null;
}

export function baseSimulee() {
  const api = {
    select(selection?: Record<string, unknown>) {
      return { from: (table: unknown) => requete((q) => lire(table, q._joins).filter((j) => evaluer(q._where, j)).map((j) => projeter(j, selection))) };
    },
    insert(table: unknown) {
      return {
        values: (v: Ligne | Ligne[]) => requete((q) => {
          banc.ecritures++;
          const rows = (Array.isArray(v) ? v : [v]).map((x) => ({ ...defauts(table), ...Object.fromEntries(Object.entries(structuredClone(x)).filter(([, y]) => y !== undefined)) }));
          const existantes = banc.lignes.get(table) ?? [];
          const out: Ligne[] = [];
          for (const r of rows) {
            // `onConflictDoUpdate({ target, set })` : une ligne de même cible est mise à jour au lieu d'être doublée.
            const cle = q._conflit && Object.entries(getTableColumns(table as never)).find(([, c]) => c === q._conflit!.target)?.[0];
            const meme = cle ? existantes.find((l) => egal(l[cle], r[cle])) : undefined;
            if (meme) { Object.assign(meme, structuredClone(q._conflit!.set)); out.push(meme); } else { existantes.push(r); out.push(r); }
          }
          banc.lignes.set(table, existantes);
          return out.map((r) => structuredClone(r));
        }),
      };
    },
    update(table: unknown) {
      return {
        set: (v: Ligne) => requete((q) => {
          if (banc.panneSur === table) throw new Error("panne simulée");
          banc.ecritures++;
          const rows = (banc.lignes.get(table) ?? []).filter((l) => evaluer(q._where, seule(table, l)));
          for (const l of rows) Object.assign(l, structuredClone(Object.fromEntries(Object.entries(v).filter(([, y]) => y !== undefined))));
          return rows.map((r) => structuredClone(r));
        }),
      };
    },
    delete(table: unknown) {
      return requete((q) => {
        banc.ecritures++;
        banc.lignes.set(table, (banc.lignes.get(table) ?? []).filter((l) => !evaluer(q._where, seule(table, l))));
        return [];
      });
    },
    execute: async () => ({ rows: [] }),
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const avant = copieEtat();
      const ecrites = banc.ecritures;
      try {
        const r = await fn(api);
        banc.transactions.validees++;
        return r;
      } catch (e) {
        banc.lignes = avant; banc.ecritures = ecrites; banc.transactions.annulees++;
        throw e;
      }
    },
  };
  return api;
}
