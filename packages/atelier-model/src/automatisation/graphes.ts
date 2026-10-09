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
import type { ModeleAtelier } from "../modele.js";
import type { ErreurCommande } from "../commandes/base.js";
import type { Commande } from "../commandes/index.js";
import { controlerRegle } from "../ontologies/mechanical/familles.js";
import { boucleControlee, type Generateur, type Generation, type HypotheseProposition, type Proposition } from "./assistant.js";
import { developperScript, ErreurScript, evaluer, lireParametres, type BouclePour, type ParametreScript, type ScriptAtelier } from "./scripts.js";
import { ancetres, ordonner, VERSION_GRAPHES, type GrapheGeneration, type NoeudGraphe } from "./graphes-validation.js";

export * from "./graphes-validation.js";

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

/**
 * Développe un graphe en commandes ordinaires : chaque commande n'est répétée que par les séries qui sont **ses**
 * ancêtres (relecture Codex #101) — deux branches indépendantes (une série de 2 sur A, une série de 3 sur B) donnent
 * 2 A puis 3 B, pas 6 fois les deux. Les commandes sont développées dans l'ordre topologique, chacune par un script du
 * lot 8 réduit à ses propres séries ; 500 commandes au plus au total (contrat des lots).
 */
export function developperGraphe(g: GrapheGeneration, etat: ModeleAtelier, valeurs: Record<string, unknown>): Commande[] {
  const script = compilerGraphe(g);
  const anc = ancetres(g);
  const parId = new Map(g.noeuds.map((n) => [n.id, n]));
  const pourDe = new Map<string, BouclePour>();
  for (const n of ordonner(g)) {
    if (n.type === "serie") pourDe.set(n.id, script.pour.find((b) => b.variable === n.variable)!);
    if (n.type === "niveaux") pourDe.set(n.id, { variable: n.variable, niveaux: true });
  }
  const out: Commande[] = [];
  let k = 0;
  for (const n of ordonner(g)) {
    if (n.type !== "commande") continue;
    const pour = [...pourDe.keys()].filter((id) => anc.get(n.id)?.has(id)).map((id) => pourDe.get(id)!);
    const commande = script.commandes[k++]!;
    void parId;
    out.push(...developperScript({ ...script, pour, commandes: [commande] }, etat, valeurs));
  }
  if (out.length > 500) throw new ErreurScript("commandes", `${out.length} commandes : 500 au plus par exécution (contrat des lots)`);
  return out;
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
      const commandes = developperGraphe(g, etat, valeurs);
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
