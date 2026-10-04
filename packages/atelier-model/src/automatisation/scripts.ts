/**
 * Scripts de l'Atelier (lot 8, Architecture V4 §4.10, T19) — purs et déclaratifs.
 *
 * Un script n'exécute aucun code : c'est un **gabarit de commandes** du contrat `atelier-commands/1` avec des
 * paramètres typés, des boucles bornées (`pour` : entiers, ou `niveaux` du modèle) et des expressions arithmétiques
 * sûres (`=ox + i * px` : nombres, variables, + − × ÷, parenthèses ; aucune fonction, aucun accès au modèle hors des
 * variables fournies). Son développement produit une séquence de commandes **ordinaire**, qui passe ensuite par les
 * mêmes réducteurs, les mêmes contrôles et les mêmes refus que les gestes de l'utilisateur (POST /commands,
 * /commands/essai) : un script n'a aucun droit que l'utilisateur n'a pas.
 */
import type { Commande } from "../commandes/index.js";
import type { ModeleAtelier } from "../modele.js";
import { niveauxOrdonnes } from "../modele.js";

export type TypeParametre = "nombre" | "entier" | "longueur" | "chaine" | "niveau";

export interface ParametreScript {
  nom: string;
  libelle: string;
  type: TypeParametre;
  defaut?: number | string;
  min?: number;
  max?: number;
  /** Aide située : à quoi sert le paramètre. */
  aide?: string;
}

export type BouclePour = { variable: string; de: number | string; a: number | string } | { variable: string; niveaux: true };

export interface ScriptAtelier {
  id: string;
  nom: string;
  version: number;
  description: string;
  parametres: ParametreScript[];
  /** Boucles imbriquées, de l'extérieur vers l'intérieur (au plus 3 ; 2 000 itérations au total). */
  pour: BouclePour[];
  commandes: Commande[];
}

export const LIMITE_ITERATIONS = 2000;
const NOM = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;

export class ErreurScript extends Error {
  constructor(
    public readonly chemin: string,
    message: string,
  ) {
    super(message);
    this.name = "ErreurScript";
  }
}

// --- Expressions -------------------------------------------------------------------------------------------------

/** Évalue une expression arithmétique (nombres, variables, + − * /, parenthèses, moins unaire). */
export function evaluer(expression: string, variables: Readonly<Record<string, number>>): number {
  const s = expression;
  let i = 0;
  const espaces = () => {
    while (i < s.length && /\s/.test(s[i]!)) i++;
  };
  const primaire = (): number => {
    espaces();
    const c = s[i];
    if (c === "(") {
      i++;
      const v = somme();
      espaces();
      if (s[i] !== ")") throw new ErreurScript("expression", `« ${expression} » : parenthèse fermante attendue`);
      i++;
      return v;
    }
    if (c === "-") {
      i++;
      return -primaire();
    }
    if (c === "+") {
      i++;
      return primaire();
    }
    const nombre = /^(\d+(?:\.\d+)?|\.\d+)/.exec(s.slice(i));
    if (nombre) {
      i += nombre[0].length;
      return Number(nombre[0]);
    }
    const nom = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (nom) {
      i += nom[0].length;
      const v = variables[nom[0]];
      if (v === undefined) throw new ErreurScript("expression", `« ${expression} » : variable inconnue « ${nom[0]} »`);
      return v;
    }
    throw new ErreurScript("expression", `« ${expression} » : terme attendu à la position ${i + 1}`);
  };
  const produit = (): number => {
    let v = primaire();
    for (;;) {
      espaces();
      const op = s[i];
      if (op !== "*" && op !== "/") return v;
      i++;
      const d = primaire();
      if (op === "/" && d === 0) throw new ErreurScript("expression", `« ${expression} » : division par zéro`);
      v = op === "*" ? v * d : v / d;
    }
  };
  const somme = (): number => {
    let v = produit();
    for (;;) {
      espaces();
      const op = s[i];
      if (op !== "+" && op !== "-") return v;
      i++;
      const d = produit();
      v = op === "+" ? v + d : v - d;
    }
  };
  const v = somme();
  espaces();
  if (i !== s.length) throw new ErreurScript("expression", `« ${expression} » : caractère inattendu « ${s[i]} »`);
  if (!Number.isFinite(v)) throw new ErreurScript("expression", `« ${expression} » : résultat non fini`);
  return Math.round(v * 1e9) / 1e9;
}

// --- Validation ------------------------------------------------------------------------------------------------

/** Contrôle la forme d'un script (avant de l'enregistrer dans une bibliothèque). */
export function validerScript(brut: unknown): ScriptAtelier {
  if (!brut || typeof brut !== "object") throw new ErreurScript("script", "objet attendu");
  const s = brut as Record<string, unknown>;
  const id = s["id"];
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{1,59}$/.test(id)) throw new ErreurScript("id", "identifiant en minuscules, chiffres et tirets (2 à 60 caractères)");
  const nom = s["nom"];
  if (typeof nom !== "string" || !nom.trim() || nom.length > 120) throw new ErreurScript("nom", "nom requis (120 caractères au plus)");
  const description = typeof s["description"] === "string" ? (s["description"] as string).slice(0, 2000) : "";
  const parametres = Array.isArray(s["parametres"]) ? (s["parametres"] as unknown[]) : [];
  if (parametres.length > 20) throw new ErreurScript("parametres", "20 paramètres au plus");
  const ps: ParametreScript[] = parametres.map((p, k) => {
    const q = (p ?? {}) as Record<string, unknown>;
    if (typeof q["nom"] !== "string" || !NOM.test(q["nom"])) throw new ErreurScript(`parametres[${k}].nom`, "nom de variable attendu (lettres, chiffres, _)");
    const type = q["type"] as TypeParametre;
    if (!["nombre", "entier", "longueur", "chaine", "niveau"].includes(type)) throw new ErreurScript(`parametres[${k}].type`, "type : nombre, entier, longueur, chaine ou niveau");
    return {
      nom: q["nom"],
      libelle: typeof q["libelle"] === "string" ? q["libelle"] : q["nom"],
      type,
      ...(typeof q["defaut"] === "number" || typeof q["defaut"] === "string" ? { defaut: q["defaut"] } : {}),
      ...(typeof q["min"] === "number" ? { min: q["min"] } : {}),
      ...(typeof q["max"] === "number" ? { max: q["max"] } : {}),
      ...(typeof q["aide"] === "string" ? { aide: q["aide"] } : {}),
    };
  });
  const pour = Array.isArray(s["pour"]) ? (s["pour"] as unknown[]) : [];
  if (pour.length > 3) throw new ErreurScript("pour", "3 boucles imbriquées au plus");
  const boucles: BouclePour[] = pour.map((b, k) => {
    const q = (b ?? {}) as Record<string, unknown>;
    if (typeof q["variable"] !== "string" || !NOM.test(q["variable"])) throw new ErreurScript(`pour[${k}].variable`, "nom de variable attendu");
    if (q["niveaux"] === true) return { variable: q["variable"], niveaux: true };
    const borne = (v: unknown, c: string) => {
      if (typeof v === "number" || typeof v === "string") return v;
      throw new ErreurScript(`pour[${k}].${c}`, "nombre ou expression attendu");
    };
    return { variable: q["variable"], de: borne(q["de"], "de"), a: borne(q["a"], "a") };
  });
  const commandes = s["commandes"];
  if (!Array.isArray(commandes) || !commandes.length || commandes.length > 50) throw new ErreurScript("commandes", "1 à 50 gabarits de commandes");
  for (const [k, c] of commandes.entries()) {
    if (!c || typeof c !== "object" || typeof (c as Commande).type !== "string" || typeof (c as Commande).params !== "object") throw new ErreurScript(`commandes[${k}]`, "{ type, params } attendu");
    if ((c as Commande).type.startsWith("interne.")) throw new ErreurScript(`commandes[${k}].type`, "commande réservée au serveur");
  }
  const version = typeof s["version"] === "number" && Number.isInteger(s["version"]) && (s["version"] as number) > 0 ? (s["version"] as number) : 1;
  return { id, nom: nom.trim(), version, description, parametres: ps, pour: boucles, commandes: commandes as Commande[] };
}

// --- Développement ---------------------------------------------------------------------------------------------

/** Valeurs des paramètres, contrôlées (types, bornes, niveau existant) ; les absents prennent leur valeur par défaut. */
export function lireParametres(script: ScriptAtelier, etat: ModeleAtelier, valeurs: Record<string, unknown>): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const p of script.parametres) {
    const v = valeurs[p.nom] ?? p.defaut;
    if (v === undefined || v === null || v === "") throw new ErreurScript(`parametres.${p.nom}`, `« ${p.libelle} » requis`);
    if (p.type === "chaine") {
      out[p.nom] = String(v).slice(0, 200);
      continue;
    }
    if (p.type === "niveau") {
      if (typeof v !== "string" || !etat.niveaux[v]) throw new ErreurScript(`parametres.${p.nom}`, `« ${p.libelle} » : niveau inconnu`);
      out[p.nom] = v;
      continue;
    }
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    if (!Number.isFinite(n)) throw new ErreurScript(`parametres.${p.nom}`, `« ${p.libelle} » : nombre attendu`);
    if (p.type === "entier" && !Number.isInteger(n)) throw new ErreurScript(`parametres.${p.nom}`, `« ${p.libelle} » : entier attendu`);
    if (p.type === "longueur" && !(n > 0)) throw new ErreurScript(`parametres.${p.nom}`, `« ${p.libelle} » : longueur strictement positive (m)`);
    if (p.min !== undefined && n < p.min) throw new ErreurScript(`parametres.${p.nom}`, `« ${p.libelle} » : ${p.min} au moins`);
    if (p.max !== undefined && n > p.max) throw new ErreurScript(`parametres.${p.nom}`, `« ${p.libelle} » : ${p.max} au plus`);
    out[p.nom] = n;
  }
  return out;
}

/** Remplace `$nom` (valeur brute d'un paramètre ou d'une variable) et `=expression` (nombre) dans un gabarit. */
function instancier(gabarit: unknown, valeurs: Record<string, number | string>, chemin: string): unknown {
  if (typeof gabarit === "string") {
    if (gabarit.startsWith("=")) {
      const nums: Record<string, number> = {};
      for (const [k, v] of Object.entries(valeurs)) if (typeof v === "number") nums[k] = v;
      return evaluer(gabarit.slice(1), nums);
    }
    if (gabarit.startsWith("$")) {
      const nom = gabarit.slice(1);
      if (!(nom in valeurs)) throw new ErreurScript(chemin, `variable inconnue « ${nom} »`);
      return valeurs[nom];
    }
    // Interpolation dans un texte : « Poteau {i}-{j} ».
    return gabarit.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, n: string) => (n in valeurs ? String(valeurs[n]) : `{${n}}`));
  }
  if (Array.isArray(gabarit)) return gabarit.map((g, k) => instancier(g, valeurs, `${chemin}[${k}]`));
  if (gabarit && typeof gabarit === "object") return Object.fromEntries(Object.entries(gabarit).map(([k, g]) => [k, instancier(g, valeurs, `${chemin}.${k}`)]));
  return gabarit;
}

/** Développe un script en séquence de commandes ordinaires (aucune n'est appliquée ici). */
export function developperScript(script: ScriptAtelier, etat: ModeleAtelier, valeurs: Record<string, unknown>): Commande[] {
  const base = lireParametres(script, etat, valeurs);
  const out: Commande[] = [];
  let iterations = 0;
  const parcourir = (k: number, vars: Record<string, number | string>) => {
    if (k === script.pour.length) {
      if (++iterations > LIMITE_ITERATIONS) throw new ErreurScript("pour", `plus de ${LIMITE_ITERATIONS} itérations`);
      script.commandes.forEach((c, n) => out.push(instancier(c, vars, `commandes[${n}]`) as Commande));
      return;
    }
    const b = script.pour[k]!;
    if ("niveaux" in b) {
      for (const n of niveauxOrdonnes(etat)) parcourir(k + 1, { ...vars, [b.variable]: n.id, [`${b.variable}_nom`]: n.nom, [`${b.variable}_elevation`]: n.elevation });
      return;
    }
    const nums: Record<string, number> = {};
    for (const [nom, v] of Object.entries(vars)) if (typeof v === "number") nums[nom] = v;
    const de = typeof b.de === "number" ? b.de : evaluer(b.de, nums);
    const a = typeof b.a === "number" ? b.a : evaluer(b.a, nums);
    if (!Number.isInteger(de) || !Number.isInteger(a)) throw new ErreurScript(`pour[${k}]`, "bornes entières attendues");
    for (let i = de; i <= a; i++) parcourir(k + 1, { ...vars, [b.variable]: i });
  };
  parcourir(0, base);
  if (out.length > 500) throw new ErreurScript("commandes", `${out.length} commandes : 500 au plus par exécution (contrat des lots)`);
  return out;
}

// --- Bibliothèque intégrée -------------------------------------------------------------------------------------

const m = (v: string | number) => ({ value: v, unit: "m" });
const p = (x: string, y: string) => ({ x, y, frame: "local", unit: "m" });

export const SCRIPTS_INTEGRES: readonly ScriptAtelier[] = [
  {
    id: "trame-poteaux",
    nom: "Trame de poteaux",
    version: 1,
    description: "Pose une trame régulière de poteaux rectangulaires sur un niveau : nx × ny poteaux, pas en x et en y depuis une origine. La hauteur est celle que vous saisissez ; rien n'est déduit.",
    parametres: [
      { nom: "niveauId", libelle: "Niveau", type: "niveau", aide: "Niveau qui reçoit les poteaux." },
      { nom: "nx", libelle: "Poteaux en x", type: "entier", defaut: 4, min: 1, max: 30 },
      { nom: "ny", libelle: "Poteaux en y", type: "entier", defaut: 3, min: 1, max: 30 },
      { nom: "px", libelle: "Pas en x (m)", type: "longueur", defaut: 5 },
      { nom: "py", libelle: "Pas en y (m)", type: "longueur", defaut: 5 },
      { nom: "ox", libelle: "Origine x (m, repère local)", type: "nombre", defaut: 0 },
      { nom: "oy", libelle: "Origine y (m, repère local)", type: "nombre", defaut: 0 },
      { nom: "section", libelle: "Section (m)", type: "longueur", defaut: 0.3 },
      { nom: "hauteur", libelle: "Hauteur (m)", type: "longueur", aide: "À saisir : aucune hauteur n'est supposée." },
    ],
    pour: [
      { variable: "i", de: 0, a: "nx - 1" },
      { variable: "j", de: 0, a: "ny - 1" },
    ],
    commandes: [{ type: "poteau.creer", params: { niveauId: "$niveauId", point: p("=ox + i * px", "=oy + j * py"), formeId: "rectangle", largeur: m("=section"), profondeur: m("=section"), hauteur: m("=hauteur"), nom: "Poteau {i}-{j}" } }],
  },
  {
    id: "enceinte-rectangulaire",
    nom: "Enceinte rectangulaire de murs",
    version: 1,
    description: "Trace quatre murs fermant un rectangle sur un niveau, depuis un coin, avec l'épaisseur et la hauteur saisies.",
    parametres: [
      { nom: "niveauId", libelle: "Niveau", type: "niveau" },
      { nom: "x0", libelle: "Coin x (m)", type: "nombre", defaut: 0 },
      { nom: "y0", libelle: "Coin y (m)", type: "nombre", defaut: 0 },
      { nom: "lx", libelle: "Longueur en x (m)", type: "longueur", defaut: 10 },
      { nom: "ly", libelle: "Longueur en y (m)", type: "longueur", defaut: 8 },
      { nom: "ep", libelle: "Épaisseur (m)", type: "longueur", defaut: 0.2 },
      { nom: "h", libelle: "Hauteur (m)", type: "longueur" },
    ],
    pour: [],
    commandes: [
      { type: "mur.tracer", params: { niveauId: "$niveauId", a: p("=x0", "=y0"), b: p("=x0 + lx", "=y0"), epaisseur: m("=ep"), hauteur: m("=h") } },
      { type: "mur.tracer", params: { niveauId: "$niveauId", a: p("=x0 + lx", "=y0"), b: p("=x0 + lx", "=y0 + ly"), epaisseur: m("=ep"), hauteur: m("=h") } },
      { type: "mur.tracer", params: { niveauId: "$niveauId", a: p("=x0 + lx", "=y0 + ly"), b: p("=x0", "=y0 + ly"), epaisseur: m("=ep"), hauteur: m("=h") } },
      { type: "mur.tracer", params: { niveauId: "$niveauId", a: p("=x0", "=y0 + ly"), b: p("=x0", "=y0"), epaisseur: m("=ep"), hauteur: m("=h") } },
    ],
  },
  {
    id: "plans-par-niveau",
    nom: "Un plan par niveau",
    version: 1,
    description: "Crée une vue en plan pour chaque niveau du modèle, à l'échelle choisie (hauteur de coupe par défaut des vues).",
    parametres: [{ nom: "echelle", libelle: "Échelle (1:n)", type: "entier", defaut: 100, min: 1, max: 5000 }],
    pour: [{ variable: "n", niveaux: true }],
    commandes: [{ type: "vue.creer", params: { type: "plan", titre: "Plan · {n_nom}", echelle: "=echelle", niveauId: "$n" } }],
  },
];
