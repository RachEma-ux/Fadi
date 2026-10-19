/**
 * Base simulée en mémoire pour les suites Studio sans base (garde DB fermée : aucune connexion, aucun serveur) —
 * X.2-01 / X.2-02. S'emploie dans un `vi.mock("../db/client.js", …)` :
 *
 *   vi.mock("../db/client.js", async () => ({ db: (await import("./studio-base-simulee.js")).baseSimulee() }));
 *
 * Ce qui est simulé (et vérifié par `studio-invariants.test.ts`, volet « base simulée ») :
 * - lignes par table (`banc.lignes`, objet drizzle → lignes) ; conditions drizzle (`eq`, `ne`, `and`, `or`, `not`,
 *   `isNull`, `isNotNull`, `inArray`, `notInArray`, `gt`, `gte`, `lt`, `lte`) **évaluées** à partir de leurs fragments
 *   SQL (colonnes, paramètres, mots-clés) ; toute autre forme lève une erreur explicite (jamais de réponse approximative) ;
 *   jointures (`innerJoin`, `leftJoin`) évaluées sur leur condition ; colonnes absentes d'une insertion : défaut de la
 *   colonne (`now()` pour un horodatage, défaut littéral, sinon null) ;
 * - transactions : `transaction(fn)` passe à `fn` un objet `tx` DISTINCT de `db` ; toute écriture faite par `db` (et
 *   tout `db.transaction`) pendant une transaction ouverte dans le même fil d'exécution échoue (c'est une autre connexion
 *   en PostgreSQL : hors du tout-ou-rien, voire un interblocage) ; un `tx` employé hors de sa transaction échoue aussi.
 *   Les transactions sont sérialisées (une à la fois, comme sous le verrou de projet `lockProject`, ici simulé) ; un
 *   échec annule exactement les écritures de la transaction (journal d'annulation, ordre des lignes restauré) ;
 *   `tx.transaction` est un point de sauvegarde ;
 * - contraintes d'unicité **lues dans `db/init.sql`** (clés primaires, `UNIQUE(...)`, `CREATE UNIQUE INDEX`, partiels
 *   `WHERE col IS NOT NULL`) : une insertion ou une mise à jour qui les viole lève `{ code: "23505", constraint }`, sans
 *   rien écrire de l'instruction ; `onConflictDoNothing` (avec ou sans cible) et `onConflictDoUpdate` ne s'appliquent qu'au
 *   conflit de leur cible ; les valeurs nulles ne se heurtent pas (règle SQL) ;
 * - déclencheurs de `db/init.sql` : les `BEFORE UPDATE` / `BEFORE DELETE` qui lèvent sans condition refusent toute
 *   ligne visée (message du déclencheur) ; les deux déclencheurs conditionnels de suppression (journal d'une
 *   publication existante, publication diffusée ou retirée d'un projet existant) sont évalués ; un déclencheur d'une
 *   autre forme lève « non simulé » à la première écriture de sa table.
 *
 * Limites déclarées (ce qui n'est PAS simulé) : aucun ordre (`orderBy`) ni borne (`limit`, `offset`) n'est appliqué (les
 * suites qui s'en servent n'en dépendent pas : fixtures d'une ou deux lignes) ; ni NOT NULL, ni CHECK, ni clés
 * étrangères, ni cascades ; aucun verrou de ligne (`for`) au-delà de la sérialisation des transactions ; une lecture
 * par `db` pendant une transaction voit ses écritures non validées ; `execute` (SQL brut) ne lit ni n'écrit rien (rend
 * `{ rows: [] }`) ; un index unique sur une expression (`lower(...)`) lève « non simulé » à la première écriture de sa
 * table (aucune table Studio n'en a).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { Column, getTableColumns, getTableName, is, Param, SQL } from "drizzle-orm";
import { applyStudioCommands, newStudioDocument, type StudioCommand } from "@parcours/atelier-model";
import { PARCOURS_STEPS } from "../data/parcours.js";
import { projectMembers, projects, projectSteps, studioComments, studioRevisions, studioStudies, studioVariants, users } from "../db/schema.js";

export type Ligne = Record<string, unknown>;
export const banc = {
  lignes: new Map<unknown, Ligne[]>(),
  /** Nombre d'écritures (insertions, mises à jour, suppressions) exécutées et non annulées. */
  ecritures: 0,
  transactions: { validees: 0, annulees: 0 },
  /** Violations d'unicité levées (`23505`), par contrainte. */
  violations: [] as string[],
  /** Panne simulée : levée par une mise à jour de cette table (après les écritures précédentes de la transaction). */
  panneSur: null as unknown,
};

// --- Schéma lu dans db/init.sql : unicités et déclencheurs ----------------------------------------------------------

interface Unicite { nom: string; colonnes: string[]; nonNulles: string[] }
interface Declencheur { nom: string; quand: "UPDATE" | "DELETE"; fonction: string; message: string | null }
const SQL_INIT = readFileSync(new URL("../db/init.sql", import.meta.url), "utf8");

/** Découpe aux virgules de premier niveau (hors parenthèses). */
function elements(corps: string): string[] {
  const out: string[] = [];
  let p = 0, debut = 0;
  for (let i = 0; i < corps.length; i++) {
    if (corps[i] === "(") p++;
    else if (corps[i] === ")") p--;
    else if (corps[i] === "," && p === 0) { out.push(corps.slice(debut, i)); debut = i + 1; }
  }
  out.push(corps.slice(debut));
  return out.map((e) => e.trim()).filter(Boolean);
}
const colonnesDe = (liste: string) => liste.split(",").map((c) => c.trim());

export function lireSchema(source: string): { unicites: Map<string, Unicite[]>; nonSimulees: Map<string, string>; declencheurs: Map<string, Declencheur[]> } {
  const fonctions = new Map<string, string | null>();
  for (const m of source.matchAll(/CREATE OR REPLACE FUNCTION (\w+)\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$([\s\S]*?)\$\$;/g)) {
    const inconditionnelle = /^\s*BEGIN\s*RAISE EXCEPTION '(\w+)';\s*END;\s*$/.exec(m[2]!);
    fonctions.set(m[1]!, inconditionnelle ? inconditionnelle[1]! : null);
  }
  const texte = source.replace(/\$\$[\s\S]*?\$\$/g, "$$$$").replace(/--[^\n]*/g, "");
  const unicites = new Map<string, Unicite[]>();
  const nonSimulees = new Map<string, string>();
  const ajouter = (table: string, u: Unicite) => unicites.set(table, [...(unicites.get(table) ?? []), u]);
  for (const instr of texte.split(";").map((s) => s.trim())) {
    const t = /^CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*)\)$/.exec(instr);
    if (t) {
      for (const e of elements(t[2]!)) {
        const pk = /^(?:CONSTRAINT (\w+) )?PRIMARY KEY\s*\(([^)]*)\)/i.exec(e);
        const uq = /^(?:CONSTRAINT (\w+) )?UNIQUE\s*\(([^)]*)\)/i.exec(e);
        if (pk) ajouter(t[1]!, { nom: pk[1] ?? `${t[1]}_pkey`, colonnes: colonnesDe(pk[2]!), nonNulles: [] });
        else if (uq) ajouter(t[1]!, { nom: uq[1] ?? `${t[1]}_unique`, colonnes: colonnesDe(uq[2]!), nonNulles: [] });
        else if (!/^(CONSTRAINT|CHECK|FOREIGN KEY)\b/i.test(e)) {
          const col = /^(\w+)\s/.exec(e)?.[1];
          if (col && /\bPRIMARY KEY\b/i.test(e)) ajouter(t[1]!, { nom: `${t[1]}_pkey`, colonnes: [col], nonNulles: [] });
          else if (col && /\bUNIQUE\b/i.test(e)) ajouter(t[1]!, { nom: `${t[1]}_${col}_key`, colonnes: [col], nonNulles: [] });
        }
      }
      continue;
    }
    const a = /^ALTER TABLE (\w+)[\s\S]*?ADD CONSTRAINT (\w+) (?:UNIQUE|PRIMARY KEY)\s*\(([^)]*)\)/i.exec(instr);
    if (a) { ajouter(a[1]!, { nom: a[2]!, colonnes: colonnesDe(a[3]!), nonNulles: [] }); continue; }
    const i = /^CREATE UNIQUE INDEX IF NOT EXISTS (\w+) ON (\w+)\s*\(([^;]*?)\)\s*(?:WHERE ([\s\S]+))?$/.exec(instr);
    if (i) {
      const colonnes = colonnesDe(i[3]!);
      const conditions = i[4] ? i[4].split(/\s+AND\s+/i).map((c) => /^\(?\s*(\w+) IS NOT NULL\s*\)?$/i.exec(c.trim())?.[1] ?? null) : [];
      if (colonnes.some((c) => !/^\w+$/.test(c)) || conditions.some((c) => c === null)) nonSimulees.set(i[2]!, `index unique ${i[1]} (expression ou condition)`);
      else ajouter(i[2]!, { nom: i[1]!, colonnes, nonNulles: conditions as string[] });
    }
  }
  const declencheurs = new Map<string, Declencheur[]>();
  for (const m of texte.matchAll(/CREATE OR REPLACE TRIGGER (\w+) BEFORE (UPDATE|DELETE) ON (\w+)\s+FOR EACH ROW EXECUTE FUNCTION (\w+)\(\)/g)) {
    const d: Declencheur = { nom: m[1]!, quand: m[2] as "UPDATE" | "DELETE", fonction: m[4]!, message: fonctions.get(m[4]!) ?? null };
    declencheurs.set(m[3]!, [...(declencheurs.get(m[3]!) ?? []), d]);
  }
  return { unicites, nonSimulees, declencheurs };
}
export const SCHEMA = lireSchema(SQL_INIT);

/** Déclencheurs conditionnels de `db/init.sql` évalués ici (corps relus : voir `init.sql`). */
const CONDITIONNELS: Record<string, (old: Ligne) => string | null> = {
  // IF EXISTS (SELECT 1 FROM studio_publications WHERE id = OLD.publication_id) → studio_publication_event_undeletable
  studio_publication_event_no_delete: (old) => (lignesDe("studio_publications").some((p) => p["id"] === old["publicationId"]) ? "studio_publication_event_undeletable" : null),
  // IF OLD.status IN ('diffuse', 'retire') AND EXISTS (SELECT 1 FROM projects WHERE id = OLD.project_id)
  studio_publication_no_delete: (old) => (["diffuse", "retire"].includes(old["status"] as string) && lignesDe("projects").some((p) => p["id"] === old["projectId"]) ? "studio_publication_undeletable" : null),
};
function lignesDe(nomSql: string): Ligne[] {
  for (const [t, ls] of banc.lignes) if (getTableName(t as never) === nomSql) return ls;
  return [];
}
function declencher(table: unknown, quand: "UPDATE" | "DELETE", visees: Ligne[]): void {
  if (!visees.length) return;
  for (const d of SCHEMA.declencheurs.get(getTableName(table as never)) ?? []) {
    if (d.quand !== quand) continue;
    if (d.message) throw new Error(d.message);
    const f = CONDITIONNELS[d.fonction];
    if (!f) throw new Error(`base simulée : déclencheur ${d.nom} non simulé`);
    for (const l of visees) { const m = f(l); if (m) throw new Error(m); }
  }
}

/** Clé JS (drizzle) de la colonne SQL `nom` de la table. */
function cleJs(table: unknown, nom: string): string {
  const c = Object.entries(getTableColumns(table as never)).find(([, x]) => (x as { name: string }).name === nom);
  if (!c) throw new Error(`base simulée : colonne ${nom} de ${getTableName(table as never)} inconnue du schéma drizzle`);
  return c[0];
}
const egal = (a: unknown, b: unknown) => a === b || (a instanceof Date && b instanceof Date && a.getTime() === b.getTime())
  || (a instanceof Date && typeof b === "string" && a.toISOString() === new Date(b).toISOString())
  || (typeof a === "string" && b instanceof Date && b.toISOString() === new Date(a).toISOString());

/** Contraintes d'unicité de la table, en clés JS. */
function unicitesDe(table: unknown): { nom: string; cles: string[]; nonNulles: string[] }[] {
  const nom = getTableName(table as never);
  const ns = SCHEMA.nonSimulees.get(nom);
  if (ns) throw new Error(`base simulée : ${ns} sur ${nom} non simulé`);
  return (SCHEMA.unicites.get(nom) ?? []).map((u) => ({ nom: u.nom, cles: u.colonnes.map((c) => cleJs(table, c)), nonNulles: u.nonNulles.map((c) => cleJs(table, c)) }));
}
const concernee = (u: { cles: string[]; nonNulles: string[] }, l: Ligne) => u.cles.every((k) => l[k] !== null && l[k] !== undefined) && u.nonNulles.every((k) => l[k] !== null && l[k] !== undefined);
const heurte = (u: { cles: string[] }, a: Ligne, b: Ligne) => u.cles.every((k) => egal(a[k], b[k]));
function violation(table: unknown, nom: string): Error {
  banc.violations.push(nom);
  return Object.assign(new Error(`duplicate key value violates unique constraint "${nom}"`), { code: "23505", constraint: nom, table: getTableName(table as never) });
}
/** Colonnes (clés JS) d'une cible `onConflict…` : colonne ou liste de colonnes. */
function cibleDe(table: unknown, target: unknown): string[] | null {
  if (target === undefined) return null;
  const cols = Array.isArray(target) ? target : [target];
  return cols.map((c) => {
    const e = Object.entries(getTableColumns(table as never)).find(([, x]) => x === c);
    if (!e) throw new Error("base simulée : cible de conflit hors de la table");
    return e[0];
  });
}
const memeEnsemble = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

// --- Conditions drizzle ---------------------------------------------------------------------------------------------

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

type Etat = { _where?: unknown; _joins: [unknown, boolean, unknown][]; _conflit?: { target: unknown; set: Ligne }; _rien?: { target: unknown } };
function requete(executer: (q: Etat) => unknown[]) {
  const q: Record<string, unknown> & Etat = { _joins: [] };
  for (const m of ["orderBy", "groupBy", "limit", "offset", "for", "returning", "having"]) q[m] = () => q;
  q["onConflictDoUpdate"] = (c: { target: unknown; set: Ligne }) => { q._conflit = c; return q; };
  q["onConflictDoNothing"] = (c?: { target?: unknown }) => { q._rien = { target: c?.target }; return q; };
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

/** Copie profonde de l'état (instantané comparable ou restaurable par un test). */
export const copieEtat = () => new Map([...banc.lignes].map(([t, ls]) => [t, ls.map((l) => structuredClone(l))]));
/** Instantané comparable de toutes les lignes (dates comprises). */
export const instantane = () => JSON.stringify([...banc.lignes].map(([, ls]) => ls));

// --- Transactions : objet tx distinct, journal d'annulation, sérialisation -------------------------------------------

interface Contexte { journal: (() => void)[]; ecritures: number; parent: Contexte | null; close: boolean }
const fil = new AsyncLocalStorage<Contexte>();
let fileTransactions: Promise<unknown> = Promise.resolve();
const ancetre = (c: Contexte, de: Contexte | undefined) => { for (let x = de; x; x = x.parent ?? undefined) if (x === c) return true; return false; };

/** Garde d'une opération par le client `ctx` (null = `db`) ; rend le contexte où journaliser (null hors transaction). */
function garde(ctx: Contexte | null, ecriture: boolean): Contexte | null {
  const ouverte = fil.getStore();
  if (ctx) {
    if (ctx.close || !ancetre(ctx, ouverte)) throw new Error("base simulée : tx employé hors de sa transaction");
    return ouverte!;
  }
  if (ouverte && ecriture) throw new Error("base simulée : écriture par db pendant une transaction ouverte (employez tx)");
  return null;
}
function ecrit(c: Contexte | null, annuler: (() => void) | null): void {
  banc.ecritures++;
  if (c) { c.ecritures++; if (annuler) c.journal.push(annuler); }
}
function annulerJournal(c: Contexte): void {
  for (let i = c.journal.length - 1; i >= 0; i--) c.journal[i]!();
  banc.ecritures -= c.ecritures;
}

function client(ctx: Contexte | null) {
  const api = {
    select(selection?: Record<string, unknown>) {
      return { from: (table: unknown) => requete((q) => { garde(ctx, false); return lire(table, q._joins).filter((j) => evaluer(q._where, j)).map((j) => projeter(j, selection)); }) };
    },
    insert(table: unknown) {
      return {
        values: (v: Ligne | Ligne[]) => requete((q) => {
          const c = garde(ctx, true);
          const unicites = unicitesDe(table);
          const rows = (Array.isArray(v) ? v : [v]).map((x) => ({ ...defauts(table), ...Object.fromEntries(Object.entries(structuredClone(x)).filter(([, y]) => y !== undefined)) }));
          const absente = !banc.lignes.has(table);
          const existantes = banc.lignes.get(table) ?? [];
          const cibleMaj = q._conflit ? cibleDe(table, q._conflit.target) : null;
          const cibleRien = q._rien ? cibleDe(table, q._rien.target) : null;
          // Instruction atomique : tous les conflits sont résolus avant la première écriture.
          const aInserer: Ligne[] = [], aMettreAJour: Ligne[] = [];
          for (const r of rows) {
            let action: "inserer" | "ignorer" | Ligne = "inserer";
            for (const u of unicites) {
              if (!concernee(u, r)) continue;
              const autre = [...existantes, ...aInserer].find((l) => concernee(u, l) && heurte(u, l, r));
              if (!autre) continue;
              if (q._rien && (cibleRien === null || memeEnsemble(cibleRien, u.cles))) { action = "ignorer"; break; }
              if (cibleMaj && memeEnsemble(cibleMaj, u.cles) && existantes.includes(autre)) { action = autre; break; }
              throw violation(table, u.nom);
            }
            if (action === "inserer") aInserer.push(r);
            else if (action !== "ignorer") aMettreAJour.push(action);
          }
          const out: Ligne[] = [];
          const avant = aMettreAJour.map((l) => structuredClone(l));
          for (const l of aMettreAJour) { Object.assign(l, structuredClone(q._conflit!.set)); out.push(l); }
          for (const r of aInserer) { existantes.push(r); out.push(r); }
          banc.lignes.set(table, existantes);
          ecrit(c, () => {
            aMettreAJour.forEach((l, i) => { for (const k of Object.keys(l)) delete l[k]; Object.assign(l, avant[i]); });
            const ls = banc.lignes.get(table) ?? [];
            const restantes = ls.filter((l) => !aInserer.includes(l));
            if (absente && !restantes.length) banc.lignes.delete(table); else banc.lignes.set(table, restantes);
          });
          return out.map((r) => structuredClone(r));
        }),
      };
    },
    update(table: unknown) {
      return {
        set: (v: Ligne) => requete((q) => {
          const c = garde(ctx, true);
          if (banc.panneSur === table) throw new Error("panne simulée");
          const ls = banc.lignes.get(table) ?? [];
          const rows = ls.filter((l) => evaluer(q._where, seule(table, l)));
          declencher(table, "UPDATE", rows);
          const valeurs = structuredClone(Object.fromEntries(Object.entries(v).filter(([, y]) => y !== undefined)));
          const apres = new Map(rows.map((l) => [l, { ...l, ...structuredClone(valeurs) }]));
          for (const u of unicitesDe(table)) {
            const finales = ls.map((l) => apres.get(l) ?? l);
            for (const [, n] of apres) if (concernee(u, n) && finales.some((o) => o !== n && concernee(u, o) && heurte(u, o, n))) throw violation(table, u.nom);
          }
          const avant = rows.map((l) => structuredClone(l));
          for (const l of rows) Object.assign(l, apres.get(l));
          ecrit(c, () => rows.forEach((l, i) => { for (const k of Object.keys(l)) delete l[k]; Object.assign(l, avant[i]); }));
          return rows.map((r) => structuredClone(r));
        }),
      };
    },
    delete(table: unknown) {
      return requete((q) => {
        const c = garde(ctx, true);
        const ls = banc.lignes.get(table) ?? [];
        const retirees = ls.flatMap((l, i) => (evaluer(q._where, seule(table, l)) ? [[i, l] as const] : []));
        declencher(table, "DELETE", retirees.map(([, l]) => l));
        banc.lignes.set(table, ls.filter((l) => !retirees.some(([, r]) => r === l)));
        ecrit(c, () => { const cur = banc.lignes.get(table) ?? []; for (const [i, l] of retirees) cur.splice(i, 0, l); banc.lignes.set(table, cur); });
        return [];
      });
    },
    execute: async () => { garde(ctx, false); return { rows: [] }; },
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      if (ctx) {
        // Point de sauvegarde : ses écritures rejoignent la transaction englobante, ou sont annulées seules.
        const parent = garde(ctx, true)!;
        const enfant: Contexte = { journal: [], ecritures: 0, parent, close: false };
        try {
          const r = await fil.run(enfant, () => fn(client(enfant)));
          parent.journal.push(...enfant.journal); parent.ecritures += enfant.ecritures;
          return r;
        } catch (e) { annulerJournal(enfant); throw e; } finally { enfant.close = true; }
      }
      if (fil.getStore()) throw new Error("base simulée : db.transaction() pendant une transaction ouverte (employez tx)");
      const executer = async (): Promise<T> => {
        const c: Contexte = { journal: [], ecritures: 0, parent: null, close: false };
        try {
          const r = await fil.run(c, () => fn(client(c)));
          banc.transactions.validees++;
          return r;
        } catch (e) {
          annulerJournal(c); banc.transactions.annulees++;
          throw e;
        } finally { c.close = true; }
      };
      const p = fileTransactions.then(executer);
      fileTransactions = p.then(() => undefined, () => undefined);
      return p;
    },
  };
  return api;
}

export function baseSimulee() {
  return client(null);
}

// --- Acteurs et accès simulés --------------------------------------------------------------------------------------

/**
 * Comptes du projet `p` : non-membre, lecteur, éditeur, éditeur pendant le verrou d'édition d'un autre compte,
 * propriétaire, propriétaire pendant le verrou d'édition d'un autre compte, propriétaire d'un projet de référence protégé.
 */
export const ACTEURS = ["etranger", "lecteur", "editeur", "editeur-verrou", "proprietaire", "proprietaire-verrou", "proprietaire-reference"] as const;
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

const VERROU = (userId: string) => {
  const futur = new Date(Date.now() + 3_600_000).toISOString();
  return { userId, email: `${userId}@exemple.test`, expiresAt: futur, acquiredAt: new Date().toISOString() };
};
/**
 * Situations du projet `p` vues par un acteur « en situation » (le projet est un, les situations s'excluent) : verrou
 * d'édition tenu par un autre compte, ou projet de référence protégé dont l'acteur est propriétaire. Le rôle, lui, se
 * lit toujours dans la base simulée (`projects.ownerId`, `project_members`) — rétrograder ou retirer un membre y suffit.
 */
const SITUATIONS: Partial<Record<string, Ligne>> = {
  "editeur-verrou": { editingLock: VERROU("proprietaire") },
  "proprietaire-verrou": { ownerId: "proprietaire-verrou", editingLock: VERROU("editeur") },
  "proprietaire-reference": { ownerId: "proprietaire-reference", exampleMode: "reference" },
};

/**
 * `owned-project` simulé : `loadProjectAccess` lit le projet et le rôle dans la base simulée (comme le vrai : propriétaire
 * par `ownerId`, sinon rôle du membre, sinon aucun accès), `projectAccessRefusal` réel enveloppé d'un relevé.
 */
export function accesSimule<M extends { projectAccessRefusal: (a: never, u: string, n: never) => { status: number; body: Record<string, unknown> } | null }>(reel: M) {
  return {
    ...reel,
    loadProjectAccess: async (projectId: string, actorId: string) => {
      const projet = (banc.lignes.get(projects) ?? []).find((x) => x["id"] === projectId);
      if (!projet) return null;
      const vu = { ...structuredClone(projet), ...(projectId === "p" ? structuredClone(SITUATIONS[actorId] ?? {}) : {}) };
      if (vu["ownerId"] === actorId) return { ...vu, role: "proprietaire" };
      const membre = (banc.lignes.get(projectMembers) ?? []).find((m) => m["projectId"] === projectId && m["userId"] === actorId);
      return membre ? { ...vu, role: membre["role"] } : null;
    },
    projectAccessRefusal: (access: never, userId: string, need: never) => {
      const r = reel.projectAccessRefusal(access, userId, need);
      verdicts.push({ need, status: r?.status ?? null });
      return r;
    },
  };
}

const documentInitial = (id: string, longueur: number) => applyStudioCommands(newStudioDocument(id), [
  { toolId: "studio.dessin.ligne", params: { id: "a", type: "line", start: { x: 0, y: 0 }, end: { x: longueur, y: 0 } } } as StudioCommand,
]);

/**
 * Projet `p` d'essai : comptes de `ACTEURS` (le propriétaire est `ownerId` ; lecteur, éditeur et éditeur-verrou sont
 * membres), étapes du Parcours (21), étude `s`, variante initiale `v` dont la tête `r1` porte une ligne `a` de 4 m,
 * commentaire `c1` de l'éditeur. Projet `q` d'un autre compte (`autre`) : étude `sq`, variante `vq`, tête `rq1`, aucun
 * acteur de `p` n'y est membre. Remet les relevés à zéro.
 */
export function initialiserProjet(): void {
  const maintenant = new Date();
  banc.lignes = new Map<unknown, Ligne[]>([
    [users, [...ACTEURS, "autre"].map((id) => ({ id, email: `${id}@exemple.test`, displayName: null }))],
    [projects, [
      { id: "p", ownerId: "proprietaire", code: "P", name: "Projet", exampleMode: null, editingLock: null },
      { id: "q", ownerId: "autre", code: "Q", name: "Autre projet", exampleMode: null, editingLock: null },
    ]],
    [projectMembers, (["lecteur", "editeur", "editeur-verrou"] as const).map((userId) => ({ projectId: "p", userId, role: userId === "lecteur" ? "lecteur" : "editeur", invitedBy: "proprietaire@exemple.test", createdAt: maintenant }))],
    [projectSteps, PARCOURS_STEPS.map((s) => ({ projectId: "p", stepNumber: s.number, status: "a-faire", content: {} }))],
    [studioStudies, [
      { id: "s", projectId: "p", name: "Étude", initialVariantId: "v", archivedAt: null, createdAt: maintenant, createdBy: "proprietaire" },
      { id: "sq", projectId: "q", name: "Étude de q", initialVariantId: "vq", archivedAt: null, createdAt: maintenant, createdBy: "autre" },
    ]],
    [studioVariants, [
      { id: "v", studyId: "s", name: "Variante", headRevisionId: "r1", archivedAt: null, derivedFromVariantId: null, derivedFromRevisionId: null, createdAt: maintenant },
      { id: "vq", studyId: "sq", name: "Variante de q", headRevisionId: "rq1", archivedAt: null, derivedFromVariantId: null, derivedFromRevisionId: null, createdAt: maintenant },
    ]],
    [studioRevisions, [
      { id: "r1", variantId: "v", parentRevisionId: null, document: documentInitial("doc", 4), envelope: null, requestId: "init-0", payloadHash: "h", source: "study-initialization", authorId: "proprietaire", response: null, createdAt: maintenant },
      { id: "rq1", variantId: "vq", parentRevisionId: null, document: documentInitial("doc-q", 7), envelope: null, requestId: "init-q", payloadHash: "h", source: "study-initialization", authorId: "autre", response: null, createdAt: maintenant },
    ]],
    [studioComments, [{ id: "c1", variantId: "v", revisionId: "r1", authorId: "editeur", body: "Remarque", objectIds: [], parentId: null, deletedAt: null, createdAt: maintenant, requestId: "c-1", payloadHash: "h" }]],
  ]);
  verdicts.length = 0;
  banc.ecritures = 0;
  banc.violations = [];
  banc.panneSur = null;
}
