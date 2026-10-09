/**
 * Graphes de génération contrôlée (P2-8) — types et **validation** pures, sans dépendance au moteur de commandes ni à la
 * boucle de l'assistant : importables par l'archive (`verifierModele` valide une définition `graphe` par le même code que
 * `graphe.definir`) sans cycle de modules. La compilation et la proposition sont dans `graphes.ts`.
 */
import type { Commande } from "../commandes/index.js";
import { ErreurScript, type TypeParametre } from "./scripts.js";

export const VERSION_GRAPHES = "graphes-fadi/1";

interface Position {
  x: number;
  y: number;
}

export type NoeudGraphe =
  | ({ id: string; type: "parametre"; nom: string; libelle: string; typeParametre: TypeParametre; defaut?: number | string; min?: number; max?: number; aide?: string } & Position)
  | ({ id: string; type: "calcul"; nom: string; expression: string } & Position)
  | ({ id: string; type: "serie"; variable: string; de: number | string; a: number | string } & Position)
  | ({ id: string; type: "niveaux"; variable: string } & Position)
  | ({ id: string; type: "regle"; expression: string; message: string } & Position)
  | ({ id: string; type: "commande"; commande: Commande } & Position);

export type TypeNoeud = NoeudGraphe["type"];

export interface LienGraphe {
  de: string;
  a: string;
}

export interface GrapheGeneration {
  id: string;
  nom: string;
  version: number;
  description: string;
  noeuds: NoeudGraphe[];
  liens: LienGraphe[];
}

export const LIBELLES_NOEUD: Record<TypeNoeud, string> = { parametre: "Paramètre", calcul: "Calcul", serie: "Série", niveaux: "Niveaux", regle: "Règle", commande: "Commande" };
export const LIMITE_NOEUDS = 60;
const NOM = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const ID_NOEUD = /^[A-Za-z0-9_-]{1,40}$/;
const TYPES_PARAMETRE: readonly TypeParametre[] = ["nombre", "entier", "longueur", "chaine", "niveau"];

// --- Validation ------------------------------------------------------------------------------------------------

const identifiants = (expression: string): string[] => (expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).filter((v, i, a) => a.indexOf(v) === i);

/** Variables lues par un gabarit de commande (`$nom`, `=expression`, `{nom}` dans un texte). */
export function variablesLues(gabarit: unknown): string[] {
  const out = new Set<string>();
  const visiter = (g: unknown) => {
    if (typeof g === "string") {
      if (g.startsWith("=")) for (const v of identifiants(g.slice(1))) out.add(v);
      else if (g.startsWith("$")) out.add(g.slice(1));
      else for (const m of g.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) out.add(m[1]!);
    } else if (Array.isArray(g)) g.forEach(visiter);
    else if (g && typeof g === "object") Object.values(g).forEach(visiter);
  };
  visiter(gabarit);
  return [...out];
}

/** Variables qu'un nœud fournit à ses descendants. */
export function variablesFournies(n: NoeudGraphe): string[] {
  switch (n.type) {
    case "parametre":
      return [n.nom];
    case "calcul":
      return [n.nom];
    case "serie":
      return [n.variable];
    case "niveaux":
      return [n.variable, `${n.variable}_nom`, `${n.variable}_elevation`];
    default:
      return [];
  }
}

/** Ordre topologique des nœuds (Kahn) ; cycle : erreur nommée. Les nœuds de même rang gardent leur ordre d'écriture. */
export function ordonner(g: Pick<GrapheGeneration, "noeuds" | "liens">): NoeudGraphe[] {
  const entrants = new Map<string, number>(g.noeuds.map((n) => [n.id, 0]));
  const sortants = new Map<string, string[]>();
  for (const l of g.liens) {
    entrants.set(l.a, (entrants.get(l.a) ?? 0) + 1);
    sortants.set(l.de, [...(sortants.get(l.de) ?? []), l.a]);
  }
  const restants = new Set(g.noeuds.map((n) => n.id));
  const out: NoeudGraphe[] = [];
  for (;;) {
    const prets = g.noeuds.filter((n) => restants.has(n.id) && (entrants.get(n.id) ?? 0) === 0);
    if (!prets.length) break;
    for (const n of prets) {
      restants.delete(n.id);
      out.push(n);
      for (const s of sortants.get(n.id) ?? []) entrants.set(s, (entrants.get(s) ?? 1) - 1);
    }
  }
  if (restants.size) throw new ErreurScript("liens", `cycle entre les nœuds ${[...restants].join(", ")}`);
  return out;
}

/** Ancêtres (transitifs) de chaque nœud. */
export function ancetres(g: Pick<GrapheGeneration, "noeuds" | "liens">): Map<string, Set<string>> {
  const parents = new Map<string, string[]>();
  for (const l of g.liens) parents.set(l.a, [...(parents.get(l.a) ?? []), l.de]);
  const out = new Map<string, Set<string>>();
  for (const n of ordonner(g)) {
    const s = new Set<string>();
    for (const p of parents.get(n.id) ?? []) {
      s.add(p);
      for (const q of out.get(p) ?? []) s.add(q);
    }
    out.set(n.id, s);
  }
  return out;
}

const borne = (v: unknown, chemin: string): number | string => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) return v.trim();
  throw new ErreurScript(chemin, "nombre ou expression attendu");
};

function lireNoeud(brut: unknown, k: number): NoeudGraphe {
  const q = (brut ?? {}) as Record<string, unknown>;
  const chemin = `noeuds[${k}]`;
  if (typeof q["id"] !== "string" || !ID_NOEUD.test(q["id"])) throw new ErreurScript(`${chemin}.id`, "identifiant de nœud attendu (lettres, chiffres, _ et -, 40 caractères au plus)");
  const id = q["id"];
  const x = typeof q["x"] === "number" && Number.isFinite(q["x"]) ? q["x"] : 0;
  const y = typeof q["y"] === "number" && Number.isFinite(q["y"]) ? q["y"] : 0;
  const nomVar = (cle: string) => {
    if (typeof q[cle] !== "string" || !NOM.test(q[cle] as string)) throw new ErreurScript(`${chemin}.${cle}`, "nom de variable attendu (lettres, chiffres, _)");
    return q[cle] as string;
  };
  const texte = (cle: string, max: number) => {
    if (typeof q[cle] !== "string" || !(q[cle] as string).trim()) throw new ErreurScript(`${chemin}.${cle}`, `« ${cle} » requis`);
    return (q[cle] as string).trim().slice(0, max);
  };
  switch (q["type"]) {
    case "parametre": {
      const typeParametre = q["typeParametre"] as TypeParametre;
      if (!TYPES_PARAMETRE.includes(typeParametre)) throw new ErreurScript(`${chemin}.typeParametre`, "type : nombre, entier, longueur, chaine ou niveau");
      return {
        id, type: "parametre", x, y, nom: nomVar("nom"), typeParametre,
        libelle: typeof q["libelle"] === "string" && q["libelle"].trim() ? q["libelle"].trim().slice(0, 120) : (q["nom"] as string),
        ...(typeof q["defaut"] === "number" || typeof q["defaut"] === "string" ? { defaut: q["defaut"] } : {}),
        ...(typeof q["min"] === "number" ? { min: q["min"] } : {}),
        ...(typeof q["max"] === "number" ? { max: q["max"] } : {}),
        ...(typeof q["aide"] === "string" && q["aide"].trim() ? { aide: q["aide"].trim().slice(0, 300) } : {}),
      };
    }
    case "calcul":
      return { id, type: "calcul", x, y, nom: nomVar("nom"), expression: texte("expression", 300) };
    case "serie":
      return { id, type: "serie", x, y, variable: nomVar("variable"), de: borne(q["de"], `${chemin}.de`), a: borne(q["a"], `${chemin}.a`) };
    case "niveaux":
      return { id, type: "niveaux", x, y, variable: nomVar("variable") };
    case "regle": {
      const expression = texte("expression", 300);
      if (!/(<=|>=|=|<|>)/.test(expression)) throw new ErreurScript(`${chemin}.expression`, "comparaison attendue (<=, >=, <, >, =)");
      return { id, type: "regle", x, y, expression, message: texte("message", 300) };
    }
    case "commande": {
      const c = q["commande"] as Commande | undefined;
      if (!c || typeof c !== "object" || typeof c.type !== "string" || !c.params || typeof c.params !== "object") throw new ErreurScript(`${chemin}.commande`, "{ type, params } attendu");
      if (c.type.startsWith("interne.")) throw new ErreurScript(`${chemin}.commande.type`, "commande réservée au serveur");
      return { id, type: "commande", x, y, commande: { type: c.type, params: c.params } };
    }
    default:
      throw new ErreurScript(`${chemin}.type`, "type : parametre, calcul, serie, niveaux, regle ou commande");
  }
}

/** Contrôle la forme et le câblage d'un graphe : identifiants uniques, liens valides, aucun cycle, variables reliées. */
export function validerGraphe(brut: unknown): GrapheGeneration {
  if (!brut || typeof brut !== "object") throw new ErreurScript("graphe", "objet attendu");
  const s = brut as Record<string, unknown>;
  const id = s["id"];
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{1,59}$/.test(id)) throw new ErreurScript("id", "identifiant en minuscules, chiffres et tirets (2 à 60 caractères)");
  const nom = s["nom"];
  if (typeof nom !== "string" || !nom.trim() || nom.length > 120) throw new ErreurScript("nom", "nom requis (120 caractères au plus)");
  const description = typeof s["description"] === "string" ? (s["description"] as string).slice(0, 2000) : "";
  const noeudsBruts = Array.isArray(s["noeuds"]) ? (s["noeuds"] as unknown[]) : [];
  if (!noeudsBruts.length || noeudsBruts.length > LIMITE_NOEUDS) throw new ErreurScript("noeuds", `1 à ${LIMITE_NOEUDS} nœuds`);
  const noeuds = noeudsBruts.map(lireNoeud);
  const ids = new Set<string>();
  for (const [k, n] of noeuds.entries()) {
    if (ids.has(n.id)) throw new ErreurScript(`noeuds[${k}].id`, `identifiant en double : ${n.id}`);
    ids.add(n.id);
  }
  const liensBruts = Array.isArray(s["liens"]) ? (s["liens"] as unknown[]) : [];
  const liens: LienGraphe[] = liensBruts.map((l, k) => {
    const q = (l ?? {}) as Record<string, unknown>;
    if (typeof q["de"] !== "string" || !ids.has(q["de"])) throw new ErreurScript(`liens[${k}].de`, "nœud d'origine inconnu");
    if (typeof q["a"] !== "string" || !ids.has(q["a"])) throw new ErreurScript(`liens[${k}].a`, "nœud d'arrivée inconnu");
    if (q["de"] === q["a"]) throw new ErreurScript(`liens[${k}]`, "un nœud ne se relie pas à lui-même");
    return { de: q["de"], a: q["a"] };
  });
  const g: GrapheGeneration = { id, nom: nom.trim(), version: typeof s["version"] === "number" && Number.isInteger(s["version"]) && (s["version"] as number) > 0 ? (s["version"] as number) : 1, description, noeuds, liens };
  // Câblage : chaque variable lue vient d'un ancêtre ; noms fournis uniques ; au plus 3 séries ; au moins une commande.
  const fournisseurs = new Map<string, string>();
  for (const n of noeuds) for (const v of variablesFournies(n)) {
    if (fournisseurs.has(v)) throw new ErreurScript(`noeuds.${n.id}`, `variable « ${v} » fournie deux fois (${fournisseurs.get(v)} et ${n.id})`);
    fournisseurs.set(v, n.id);
  }
  const anc = ancetres(g);
  const parNoeud = new Map(noeuds.map((n) => [n.id, n]));
  const lues = (n: NoeudGraphe): string[] => {
    switch (n.type) {
      case "calcul":
        return identifiants(n.expression);
      case "regle":
        return identifiants(n.expression.replace(/<=|>=|=|<|>/g, " "));
      case "serie":
        return [...(typeof n.de === "string" ? identifiants(n.de) : []), ...(typeof n.a === "string" ? identifiants(n.a) : [])];
      case "commande":
        return variablesLues(n.commande.params);
      default:
        return [];
    }
  };
  for (const n of noeuds) {
    for (const v of lues(n)) {
      const f = fournisseurs.get(v);
      if (!f) throw new ErreurScript(`noeuds.${n.id}`, `variable inconnue « ${v} » : aucun nœud ne la fournit`);
      if (!anc.get(n.id)?.has(f)) throw new ErreurScript(`noeuds.${n.id}`, `variable « ${v} » (nœud ${f}) non reliée au nœud ${n.id}`);
    }
    if (n.type === "regle") for (const v of lues(n)) {
      const f = parNoeud.get(fournisseurs.get(v)!)!;
      if (f.type === "serie" || f.type === "niveaux") throw new ErreurScript(`noeuds.${n.id}`, `une règle porte sur les paramètres et les calculs, pas sur la variable de série « ${v} »`);
    }
  }
  if (noeuds.filter((n) => n.type === "serie" || n.type === "niveaux").length > 3) throw new ErreurScript("noeuds", "3 séries imbriquées au plus");
  if (!noeuds.some((n) => n.type === "commande")) throw new ErreurScript("noeuds", "au moins un nœud de commande");
  return g;
}

