/**
 * Graphes visuels de génération contrôlée (P2-8 ; DA-19-03 Dynamo, DA-19-04 Grasshopper) — purs et déclaratifs.
 *
 * Un graphe est un ensemble de **nœuds** reliés par des **liens** : paramètres typés (entrées), calculs (expressions
 * arithmétiques sûres), séries (boucles bornées), règles de connaissance (comparaisons qui refusent la génération
 * nommément), et commandes (gabarits de commandes du contrat, dont les commandes de génération des ontologies :
 * `trame.generer`, `ossature.generer`, `reseau.router`…). Les liens disent **qui lit quoi** : un nœud ne peut employer
 * qu'une variable fournie par un de ses ancêtres (câblage visuel, pas de variable implicite).
 *
 * Le graphe ne s'exécute pas : il se **compile** en script de l'Atelier (`ScriptAtelier`, lot 8), qui se développe en
 * commandes ordinaires, soumises à la **même boucle contrôlée** que l'assistant (`boucleControlee` : essai à blanc,
 * journal des hypothèses, aperçu, accord explicite hors de ce module). Un graphe n'a aucun droit que l'utilisateur
 * n'a pas ; une règle non tenue produit une proposition **échouée** nommée, jamais une correction silencieuse.
 */
import type { Commande } from "../commandes/index.js";
import type { ModeleAtelier } from "../modele.js";
import type { ErreurCommande } from "../commandes/base.js";
import { controlerRegle } from "../ontologies/mechanical/familles.js";
import { boucleControlee, type Generateur, type Generation, type HypotheseProposition, type Proposition } from "./assistant.js";
import { developperScript, ErreurScript, evaluer, lireParametres, type BouclePour, type ParametreScript, type ScriptAtelier, type TypeParametre } from "./scripts.js";

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

// --- Compilation en script -----------------------------------------------------------------------------------

/** Remplace, dans une expression, chaque calcul par son expression entre parenthèses (récursif, ordre topologique garanti). */
function inliner(expression: string, calculs: Map<string, string>): string {
  return expression.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (v) => (calculs.has(v) ? `(${calculs.get(v)})` : v));
}

function inlinerGabarit(gabarit: unknown, calculs: Map<string, string>): unknown {
  if (typeof gabarit === "string") {
    if (gabarit.startsWith("=")) return `=${inliner(gabarit.slice(1), calculs)}`;
    if (gabarit.startsWith("$") && calculs.has(gabarit.slice(1))) return `=${calculs.get(gabarit.slice(1))}`;
    return gabarit;
  }
  if (Array.isArray(gabarit)) return gabarit.map((g) => inlinerGabarit(g, calculs));
  if (gabarit && typeof gabarit === "object") return Object.fromEntries(Object.entries(gabarit).map(([k, g]) => [k, inlinerGabarit(g, calculs)]));
  return gabarit;
}

/**
 * Compile un graphe validé en script : paramètres dans l'ordre du graphe, séries dans l'ordre topologique, commandes
 * dans l'ordre topologique avec les calculs inlinés (le script n'a pas de variable intermédiaire). Les règles ne font
 * pas partie du script : elles sont contrôlées avant le développement (`controlerReglesGraphe`).
 */
export function compilerGraphe(g: GrapheGeneration): ScriptAtelier {
  const ordre = ordonner(g);
  const parametres: ParametreScript[] = ordre.filter((n): n is Extract<NoeudGraphe, { type: "parametre" }> => n.type === "parametre").map((n) => ({
    nom: n.nom, libelle: n.libelle, type: n.typeParametre,
    ...(n.defaut !== undefined ? { defaut: n.defaut } : {}), ...(n.min !== undefined ? { min: n.min } : {}), ...(n.max !== undefined ? { max: n.max } : {}), ...(n.aide ? { aide: n.aide } : {}),
  }));
  const calculs = new Map<string, string>();
  for (const n of ordre) if (n.type === "calcul") calculs.set(n.nom, inliner(n.expression, calculs));
  const pour: BouclePour[] = [];
  for (const n of ordre) {
    if (n.type === "serie") pour.push({ variable: n.variable, de: typeof n.de === "string" ? inliner(n.de, calculs) : n.de, a: typeof n.a === "string" ? inliner(n.a, calculs) : n.a });
    if (n.type === "niveaux") pour.push({ variable: n.variable, niveaux: true });
  }
  const commandes: Commande[] = ordre.filter((n): n is Extract<NoeudGraphe, { type: "commande" }> => n.type === "commande").map((n) => ({ type: n.commande.type, params: inlinerGabarit(n.commande.params, calculs) as Record<string, unknown> }));
  return { id: `graphe-${g.id}`, nom: g.nom, version: g.version, description: g.description, parametres, pour, commandes };
}

/** Valeurs des paramètres et des calculs (nombres seuls) pour les règles. */
export function valeursGraphe(g: GrapheGeneration, etat: ModeleAtelier, valeurs: Record<string, unknown>): Record<string, number> {
  const script = compilerGraphe(g);
  const base = lireParametres(script, etat, valeurs);
  const nums: Record<string, number> = {};
  for (const [k, v] of Object.entries(base)) if (typeof v === "number") nums[k] = v;
  for (const n of ordonner(g)) if (n.type === "calcul") nums[n.nom] = evaluer(n.expression, nums);
  return nums;
}

/** Règles de connaissance du graphe : messages des règles non tenues (vide : toutes tenues). */
export function controlerReglesGraphe(g: GrapheGeneration, etat: ModeleAtelier, valeurs: Record<string, unknown>): string[] {
  const nums = valeursGraphe(g, etat, valeurs);
  const out: string[] = [];
  for (const n of ordonner(g)) {
    if (n.type !== "regle") continue;
    const m = controlerRegle({ expression: n.expression, message: n.message, familleId: null }, nums);
    if (m) out.push(m);
  }
  return out;
}

// --- Boucle contrôlée -------------------------------------------------------------------------------------------

/** Générateur déterministe d'un graphe : une proposition, aucune correction (un refus du modèle est nommé, jamais contourné). */
export function generateurGraphe(g: GrapheGeneration, valeurs: Record<string, unknown>): Generateur {
  return {
    id: VERSION_GRAPHES,
    proposer(_intention, etat): Generation {
      const script = compilerGraphe(g);
      const hypotheses: HypotheseProposition[] = [];
      for (const p of script.parametres) {
        const v = valeurs[p.nom];
        if ((v === undefined || v === null || v === "") && p.defaut !== undefined) hypotheses.push({ texte: `${p.libelle} = ${p.defaut}`, motif: "valeur par défaut du graphe, à confirmer" });
      }
      const nums = valeursGraphe(g, etat, valeurs);
      for (const n of g.noeuds) if (n.type === "calcul") hypotheses.push({ texte: `${n.nom} = ${Math.round(nums[n.nom]! * 1e6) / 1e6}`, motif: `calcul « ${n.expression} » du graphe` });
      const commandes = developperScript(script, etat, valeurs);
      const generations = commandes.filter((c) => /\.(generer|router)$/.test(c.type)).length;
      return {
        regle: `graphe:${g.id}`,
        explication: `Graphe « ${g.nom} » v${g.version} : ${commandes.length} commande(s)${generations ? ` dont ${generations} génération(s) d'ontologie` : ""}, ${g.noeuds.filter((n) => n.type === "regle").length} règle(s) tenue(s).`,
        commandes,
        hypotheses,
      };
    },
    corriger(_precedente: Generation, _erreur: ErreurCommande) {
      return null;
    },
  };
}

/**
 * Proposition d'un graphe par la boucle contrôlée du lot 8 : règles contrôlées d'abord (échec nommé sans essai), puis
 * compilation, développement et essai à blanc ; rien n'est écrit ici.
 */
export function proposerGraphe(g: GrapheGeneration, etat: ModeleAtelier, valeurs: Record<string, unknown>, niveauId: string | null): Proposition {
  const intention = `Graphe « ${g.nom} » v${g.version}`;
  let refus: string[];
  try {
    refus = controlerReglesGraphe(g, etat, valeurs);
  } catch (err) {
    if (!(err instanceof ErreurScript)) throw err;
    return { intention, cle: "", generateur: VERSION_GRAPHES, regle: `graphe:${g.id}`, explication: `${err.chemin} : ${err.message}`, commandes: [], hypotheses: [], iterations: [{ numero: 1, commandes: 0, resultat: "refuse", erreur: err.message }], statut: "echouee", effets: null, depuisCache: false };
  }
  if (refus.length) {
    return { intention, cle: "", generateur: VERSION_GRAPHES, regle: `graphe:${g.id}`, explication: `Règle(s) du graphe non tenue(s) : ${refus.join(" ; ")} — aucune commande proposée.`, commandes: [], hypotheses: [], iterations: [{ numero: 1, commandes: 0, resultat: "refuse", erreur: refus.join(" ; ") }], statut: "echouee", effets: null, depuisCache: false };
  }
  try {
    return boucleControlee(etat, intention, generateurGraphe(g, valeurs), { niveauId });
  } catch (err) {
    if (!(err instanceof ErreurScript)) throw err;
    return { intention, cle: "", generateur: VERSION_GRAPHES, regle: `graphe:${g.id}`, explication: `${err.chemin} : ${err.message}`, commandes: [], hypotheses: [], iterations: [{ numero: 1, commandes: 0, resultat: "refuse", erreur: err.message }], statut: "echouee", effets: null, depuisCache: false };
  }
}

// --- Graphes intégrés -------------------------------------------------------------------------------------------

const m = (v: string | number) => ({ value: v, unit: "m" });
const p = (x: string, y: string) => ({ x, y, frame: "local", unit: "m" });

export const GRAPHES_INTEGRES: readonly GrapheGeneration[] = [
  {
    id: "trame-poteaux-controlee",
    nom: "Trame de poteaux contrôlée",
    version: 1,
    description: "Paramètres (niveau, nombre, pas, section, hauteur) → calcul de l'emprise → règles (section inférieure au pas ; 400 poteaux au plus) → deux séries → une commande poteau.creer par nœud de la trame. La hauteur est saisie ; rien n'est déduit.",
    noeuds: [
      { id: "niveau", type: "parametre", nom: "niveauId", libelle: "Niveau", typeParametre: "niveau", x: 0, y: 0 },
      { id: "nx", type: "parametre", nom: "nx", libelle: "Poteaux en x", typeParametre: "entier", defaut: 3, min: 1, max: 30, x: 0, y: 1 },
      { id: "ny", type: "parametre", nom: "ny", libelle: "Poteaux en y", typeParametre: "entier", defaut: 2, min: 1, max: 30, x: 0, y: 2 },
      { id: "px", type: "parametre", nom: "px", libelle: "Pas en x (m)", typeParametre: "longueur", defaut: 5, x: 0, y: 3 },
      { id: "py", type: "parametre", nom: "py", libelle: "Pas en y (m)", typeParametre: "longueur", defaut: 5, x: 0, y: 4 },
      { id: "ox", type: "parametre", nom: "ox", libelle: "Origine x (m)", typeParametre: "nombre", defaut: 0, x: 0, y: 5 },
      { id: "oy", type: "parametre", nom: "oy", libelle: "Origine y (m)", typeParametre: "nombre", defaut: 0, x: 0, y: 6 },
      { id: "section", type: "parametre", nom: "section", libelle: "Section (m)", typeParametre: "longueur", defaut: 0.3, x: 0, y: 7 },
      { id: "hauteur", type: "parametre", nom: "hauteur", libelle: "Hauteur (m)", typeParametre: "longueur", aide: "À saisir : aucune hauteur n'est supposée.", x: 0, y: 8 },
      { id: "emprise", type: "calcul", nom: "emprise", expression: "(nx - 1) * px * (ny - 1) * py", x: 1, y: 3 },
      { id: "nombre", type: "calcul", nom: "nombre", expression: "nx * ny", x: 1, y: 1 },
      { id: "r-section", type: "regle", expression: "section < px", message: "la section d'un poteau doit rester inférieure au pas en x (poteaux qui se touchent)", x: 2, y: 3 },
      { id: "r-section-y", type: "regle", expression: "section < py", message: "la section d'un poteau doit rester inférieure au pas en y (poteaux qui se touchent)", x: 2, y: 4 },
      { id: "r-nombre", type: "regle", expression: "nombre <= 400", message: "400 poteaux au plus par génération (contrat des lots : 500 commandes)", x: 2, y: 1 },
      { id: "i", type: "serie", variable: "i", de: 0, a: "nx - 1", x: 2, y: 6 },
      { id: "j", type: "serie", variable: "j", de: 0, a: "ny - 1", x: 2, y: 7 },
      { id: "poteau", type: "commande", commande: { type: "poteau.creer", params: { niveauId: "$niveauId", point: p("=ox + i * px", "=oy + j * py"), formeId: "rectangle", largeur: m("=section"), profondeur: m("=section"), hauteur: m("=hauteur"), nom: "Poteau {i}-{j}" } }, x: 3, y: 5 },
    ],
    liens: [
      { de: "nx", a: "emprise" }, { de: "px", a: "emprise" }, { de: "ny", a: "emprise" }, { de: "py", a: "emprise" },
      { de: "nx", a: "nombre" }, { de: "ny", a: "nombre" },
      { de: "section", a: "r-section" }, { de: "px", a: "r-section" },
      { de: "section", a: "r-section-y" }, { de: "py", a: "r-section-y" },
      { de: "nombre", a: "r-nombre" },
      { de: "nx", a: "i" }, { de: "ny", a: "j" }, { de: "i", a: "j" },
      { de: "niveau", a: "poteau" }, { de: "j", a: "poteau" }, { de: "px", a: "poteau" }, { de: "py", a: "poteau" }, { de: "ox", a: "poteau" }, { de: "oy", a: "poteau" }, { de: "section", a: "poteau" }, { de: "hauteur", a: "poteau" },
    ],
  },
  {
    id: "ossature-de-mur",
    nom: "Ossature bois d'un mur (génération contrôlée)",
    version: 1,
    description: "Paramètres (mur hôte, entraxe, section des montants) → ossature.creer puis ossature.generer (ontologie bois activée) : les montants, lisses et linteaux planifiés deviennent des pièces après aperçu et accord. Aucune section ni essence n'est supposée.",
    noeuds: [
      { id: "mur", type: "parametre", nom: "murId", libelle: "Mur hôte (identifiant)", typeParametre: "chaine", x: 0, y: 0 },
      { id: "oss", type: "parametre", nom: "ossatureId", libelle: "Identifiant de l'ossature", typeParametre: "chaine", x: 0, y: 1 },
      { id: "entraxe", type: "parametre", nom: "entraxe", libelle: "Entraxe des montants (m)", typeParametre: "longueur", x: 0, y: 2 },
      { id: "largeur", type: "parametre", nom: "largeur", libelle: "Largeur des montants (m)", typeParametre: "longueur", x: 0, y: 3 },
      { id: "epaisseur", type: "parametre", nom: "epaisseur", libelle: "Épaisseur des montants (m)", typeParametre: "longueur", x: 0, y: 4 },
      { id: "r-entraxe", type: "regle", expression: "largeur < entraxe", message: "la largeur d'un montant doit rester inférieure à l'entraxe (montants qui se touchent)", x: 1, y: 2 },
      { id: "creer", type: "commande", commande: { type: "ossature.creer", params: { id: "$ossatureId", hoteId: "$murId", genre: "mur", nom: "Ossature {murId}", entraxe: m("=entraxe"), sectionMontant: { largeur: m("=largeur"), hauteur: m("=epaisseur"), profil: null, essence: null, classe: null }, sectionLisse: null } }, x: 2, y: 1 },
      { id: "generer", type: "commande", commande: { type: "ossature.generer", params: { id: "$ossatureId" } }, x: 3, y: 1 },
    ],
    liens: [
      { de: "largeur", a: "r-entraxe" }, { de: "entraxe", a: "r-entraxe" },
      { de: "mur", a: "creer" }, { de: "oss", a: "creer" }, { de: "entraxe", a: "creer" }, { de: "largeur", a: "creer" }, { de: "epaisseur", a: "creer" },
      { de: "creer", a: "generer" }, { de: "oss", a: "generer" },
    ],
  },
];
