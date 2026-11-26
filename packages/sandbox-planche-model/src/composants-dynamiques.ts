/**
 * Extension « Composants dynamiques » (25 novembre 2026), d'après les Dynamic Components de SketchUp : un composant
 * porte des **paramètres** (valeur ou formule de tableur « =… »), dont certains sont montrés comme **options** (zone de
 * texte ou liste), et des **règles** qui fixent par formule les attributs prédéfinis de ses objets enfants — position
 * (X, Y, Z), taille (LenX, LenY, LenZ), rotation (RotX, RotY, RotZ), masquage (Hidden), matière (Material), répétition
 * (Copies, avec la variable Copy). Pur : ni React, ni DOM, aucun code exécuté — les formules sont lues par
 * l'interpréteur ci-dessous.
 *
 * Phase 1, lot 1 (26 novembre 2026) : RotX et RotY ; une règle lit l'attribut d'un autre objet du composant
 * (« Pied!LenZ ») ; action au clic de l'outil Interagir (`surClic`, « onClick » de SketchUp : SET et ALTER).
 *
 * Écarts déclarés avec SketchUp : longueurs en **mètres** (SketchUp : pouces) ; tout est rangé sur la définition du
 * composant, donc une option change toutes ses instances (« Rendre unique » pour en détacher une) ; rotation composée
 * dans l'ordre fixé par Fadi, RotX puis RotY puis RotZ autour des axes du composant ; un objet est désigné par son nom
 * (un seul mot : lettres, chiffres, « _ ») et seuls ses attributs prédéfinis se lisent ; au clic, SET et ALTER passent
 * tous deux à la valeur suivante de leur liste, sans animation (ni ANIMATE, ni REDRAW, ni GOTOSCENE) ; pas de fonction
 * aléatoire.
 */
import { annotationsDe } from "./annotations.js";
import { ATTRIBUTS_DYNAMIQUES, type AttributDynamique, type ComposantDynamique, type Contexte, type Id, type Matrice4, type Modele, type Occurrence, type ParametreDynamique, type RegleDynamique, appliquer } from "./geometrie-libre.js";
import type { Vec3 } from "./vecteur.js";

export type ValeurDynamique = number | string;
/**
 * Messages d'erreur, par clé. Le texte français ci-dessous sert de `message` ; l'interface traduit par la clé et ses
 * arguments (`planche.dynamique.erreur.<clé>`), pour qu'une erreur soit lue dans la langue de l'interface.
 */
export const MESSAGES_ERREUR_DYNAMIQUE = {
  "nombre-illisible": "Nombre illisible à la position {position}.",
  guillemet: "Guillemet non fermé.",
  reference: "Référence « {nom}! » : aucun objet de ce nom dans le composant.",
  "reference-ambigue": "Référence « {nom}! » : plusieurs objets du composant portent ce nom.",
  "reference-attribut": "Référence « {nom}!{attribut} » : attribut inconnu (X, Y, Z, LenX, LenY, LenZ, RotX, RotY, RotZ, Hidden, Material, Copies).",
  "reference-parametre": "Référence « {nom}! » : un paramètre ne lit pas les objets ; seule une règle le peut.",
  "reference-erreur": "Référence « {nom}!{attribut} » : la règle de cet attribut est en erreur.",
  action: "Action au clic inconnue : « {nom} » (SET ou ALTER attendus).",
  "action-forme": "Action au clic illisible : « {texte} ».",
  "action-parametre": "{action} : « {nom} » n'est pas un paramètre du composant.",
  "sans-clic": "Ce composant n'a pas d'action au clic.",
  caractere: "Caractère inattendu « {texte} ».",
  "nombre-vide": "Nombre attendu ({quoi}), texte vide reçu.",
  "nombre-attendu": "Nombre attendu ({quoi}), « {texte} » reçu.",
  argument: "Argument manquant.",
  racine: "Racine d'un nombre négatif.",
  logarithme: "Logarithme d'un nombre négatif ou nul.",
  choose: "CHOOSE : rang hors de la liste.",
  option: "{fonction} : « {nom} » n'est pas un paramètre à liste.",
  incomplete: "Formule incomplète.",
  parenthese: "Parenthèse non fermée.",
  "parenthese-apres": "Parenthèse non fermée après {nom}.",
  fonction: "Fonction inconnue : {nom}.",
  nom: "Nom inconnu : {nom}.",
  inattendu: "« {texte} » inattendu.",
  division: "Division par zéro.",
  circulaire: "Référence circulaire par « {nom} ».",
  objet: "Objet introuvable dans le composant : ses règles sont sans effet.",
  copies: "Copies : un entier de 0 à {max} (reçu {recu}).",
  longueur: "{attribut} : une longueur strictement positive (reçu {recu}).",
  epaisseur: "{attribut} : l'objet n'a pas d'épaisseur dans cette direction, il ne peut pas être étiré.",
  matiere: "Matière inconnue : « {nom} ». Créez-la dans le panneau Matériaux.",
  composant: "Composant introuvable.",
  "pas-dynamique": "Ce composant n'est pas dynamique.",
  limites: "Description trop longue ou invalide : 64 paramètres, 512 règles, 500 caractères par valeur ou formule, 80 par libellé, 50 choix par liste ; noms de paramètres distincts.",
  inconnue: "Erreur : {texte}",
} as const;
export type CleErreurDynamique = keyof typeof MESSAGES_ERREUR_DYNAMIQUE;
type ArgsErreur = Readonly<Record<string, string>>;
const rediger = (cle: CleErreurDynamique, args: ArgsErreur): string => MESSAGES_ERREUR_DYNAMIQUE[cle].replace(/\{(\w+)\}/g, (_, k: string) => args[k] ?? "");
export class ErreurFormule extends Error {
  constructor(readonly cle: CleErreurDynamique, readonly args: ArgsErreur = {}) {
    super(rediger(cle, args));
  }
}
const refus = (cle: CleErreurDynamique, args: ArgsErreur = {}): never => {
  throw new ErreurFormule(cle, args);
};

// ————————————————————————————————————————————————————————————————————————————————— Formules

type Jeton =
  | { readonly t: "nombre"; readonly v: number }
  | { readonly t: "texte"; readonly v: string }
  | { readonly t: "nom"; readonly v: string }
  | { readonly t: "op"; readonly v: string }
  /** « Objet!Attribut » : attribut prédéfini d'un autre objet du composant. */
  | { readonly t: "ref"; readonly v: string; readonly attribut: string };

function decouper(source: string): Jeton[] {
  const jetons: Jeton[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i] as string;
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?|^[0-9]+\.?/.exec(source.slice(i));
      if (!m) refus("nombre-illisible", { position: String(i + 1) });
      jetons.push({ t: "nombre", v: Number((m as RegExpExecArray)[0]) });
      i += (m as RegExpExecArray)[0].length;
    } else if (c === '"') {
      let j = i + 1;
      let texte = "";
      while (j < source.length && source[j] !== '"') {
        if (source[j] === "\\" && j + 1 < source.length) j++;
        texte += source[j];
        j++;
      }
      if (j >= source.length) refus("guillemet");
      jetons.push({ t: "texte", v: texte });
      i = j + 1;
    } else if (/[A-Za-zÀ-ÿ_]/.test(c)) {
      const m = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]*/.exec(source.slice(i)) as RegExpExecArray;
      i += m[0].length;
      // « Parent!nom » (écriture de SketchUp) désigne un paramètre du composant : le préfixe est admis et ignoré.
      // « Objet!Attribut » lit un attribut prédéfini d'un autre objet du composant (phase 1, lot 1).
      if (source[i] === "!") {
        i++;
        if (m[0].toLowerCase() === "parent") continue;
        const a = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i));
        if (!a) refus("reference-attribut", { nom: m[0], attribut: "" });
        i += (a as RegExpExecArray)[0].length;
        jetons.push({ t: "ref", v: m[0], attribut: (a as RegExpExecArray)[0] });
        continue;
      }
      jetons.push({ t: "nom", v: m[0] });
    } else {
      const deux = source.slice(i, i + 2);
      const op = ["<=", ">=", "<>"].includes(deux) ? deux : c;
      if (!"+-*/^&=<>(),;".includes(op[0] as string)) refus("caractere", { texte: c });
      jetons.push({ t: "op", v: op === ";" ? "," : op });
      i += op.length;
    }
  }
  return jetons;
}

export interface EnvironnementFormule {
  /** Valeur d'un nom (paramètre, `Copy`), ou `undefined` s'il est inconnu. */
  readonly valeur: (nom: string) => ValeurDynamique | undefined;
  /** Paramètre à liste : rang (1…) et libellé du choix courant, pour OPTIONINDEX / OPTIONLABEL. */
  readonly option?: (nom: string) => { readonly rang: number; readonly libelle: string } | undefined;
  /** (Phase 1, lot 1) Attribut d'un autre objet du composant (« Pied!LenZ ») ; absent = refusé (formule d'un paramètre). */
  readonly reference?: (objet: string, attribut: string) => ValeurDynamique;
}

const nombre = (v: ValeurDynamique, quoi = "valeur"): number => {
  const n = typeof v === "number" ? v : Number(v.trim().replace(",", "."));
  if (typeof v === "string" && v.trim() === "") refus("nombre-vide", { quoi });
  return Number.isFinite(n) ? n : refus("nombre-attendu", { quoi, texte: String(v) });
};
const texte = (v: ValeurDynamique): string => (typeof v === "number" ? String(Number(v.toFixed(9))) : v);
const vrai = (v: ValeurDynamique): boolean => (typeof v === "number" ? v !== 0 : v !== "" && v !== "0");
const RAD = Math.PI / 180;

type Fonction = (a: ValeurDynamique[], env: EnvironnementFormule) => ValeurDynamique;
const n1 = (f: (x: number) => number): Fonction => (a) => f(nombre(a[0] ?? refus("argument")));
const multiple = (x: number, pas: number, f: (q: number) => number): number => (pas === 0 ? 0 : f(x / pas) * pas);
const FONCTIONS: Readonly<Record<string, Fonction>> = {
  ABS: n1(Math.abs), INT: n1(Math.floor), SQRT: n1((x) => (x < 0 ? refus("racine") : Math.sqrt(x))), SIGN: n1(Math.sign), EXP: n1(Math.exp),
  LN: n1((x) => (x <= 0 ? refus("logarithme") : Math.log(x))), LOG10: n1((x) => (x <= 0 ? refus("logarithme") : Math.log10(x))),
  DEGREES: n1((x) => x / RAD), RADIANS: n1((x) => x * RAD), EVEN: n1((x) => Math.sign(x) * Math.ceil(Math.abs(x) / 2) * 2), ODD: n1((x) => Math.sign(x || 1) * (Math.ceil((Math.abs(x) - 1) / 2) * 2 + 1)),
  SIN: n1((x) => Math.sin(x * RAD)), COS: n1((x) => Math.cos(x * RAD)), TAN: n1((x) => Math.tan(x * RAD)),
  ASIN: n1((x) => Math.asin(x) / RAD), ACOS: n1((x) => Math.acos(x) / RAD), ATAN: n1((x) => Math.atan(x) / RAD),
  PI: () => Math.PI, TRUE: () => 1, FALSE: () => 0,
  ROUND: (a) => { const p = 10 ** Math.round(nombre(a[1] ?? 0)); return Math.round(nombre(a[0] ?? refus("argument")) * p) / p; },
  CEILING: (a) => multiple(nombre(a[0] ?? refus("argument")), nombre(a[1] ?? 1), Math.ceil),
  FLOOR: (a) => multiple(nombre(a[0] ?? refus("argument")), nombre(a[1] ?? 1), Math.floor),
  LARGEST: (a) => Math.max(...a.map((x) => nombre(x))), MAX: (a) => Math.max(...a.map((x) => nombre(x))),
  SMALLEST: (a) => Math.min(...a.map((x) => nombre(x))), MIN: (a) => Math.min(...a.map((x) => nombre(x))),
  NEAREST: (a) => { const x = nombre(a[0] ?? refus("argument")); const c = a.slice(1).map((v) => nombre(v)); return c.length ? c.reduce((m, v) => (Math.abs(v - x) < Math.abs(m - x) ? v : m)) : x; },
  CHOOSE: (a) => a[Math.round(nombre(a[0] ?? refus("argument")))] ?? refus("choose"),
  IF: (a) => (vrai(a[0] ?? refus("argument")) ? a[1] ?? 1 : a[2] ?? 0),
  AND: (a) => (a.every(vrai) ? 1 : 0), OR: (a) => (a.some(vrai) ? 1 : 0), NOT: (a) => (vrai(a[0] ?? 0) ? 0 : 1),
  CONCATENATE: (a) => a.map(texte).join(""), LEN: (a) => texte(a[0] ?? "").length, UPPER: (a) => texte(a[0] ?? "").toUpperCase(), LOWER: (a) => texte(a[0] ?? "").toLowerCase(),
  TRIM: (a) => texte(a[0] ?? "").trim(), VALUE: (a) => nombre(a[0] ?? ""), EXACT: (a) => (texte(a[0] ?? "") === texte(a[1] ?? "") ? 1 : 0),
  LEFT: (a) => texte(a[0] ?? "").slice(0, Math.max(0, nombre(a[1] ?? 1))), RIGHT: (a) => { const s = texte(a[0] ?? ""); return s.slice(Math.max(0, s.length - Math.max(0, nombre(a[1] ?? 1)))); },
  MID: (a) => texte(a[0] ?? "").substr(Math.max(0, nombre(a[1] ?? 1) - 1), Math.max(0, nombre(a[2] ?? 1))),
  OPTIONINDEX: (a, env) => env.option?.(texte(a[0] ?? ""))?.rang ?? refus("option", { fonction: "OPTIONINDEX", nom: texte(a[0] ?? "") }),
  OPTIONLABEL: (a, env) => env.option?.(texte(a[0] ?? ""))?.libelle ?? refus("option", { fonction: "OPTIONLABEL", nom: texte(a[0] ?? "") }),
};
/** Fonctions admises dans une formule, pour l'aide du panneau. */
export const FONCTIONS_DYNAMIQUES: readonly string[] = Object.freeze(Object.keys(FONCTIONS).sort());

/** Évalue une formule (sans le « = » de tête). Lève `ErreurFormule` avec un message français. */
export function evaluerFormule(source: string, env: EnvironnementFormule): ValeurDynamique {
  const j = decouper(source);
  let i = 0;
  const vu = (v: string): boolean => j[i]?.t === "op" && j[i]?.v === v;
  const primaire = (): ValeurDynamique => {
    const x = j[i++];
    if (!x) return refus("incomplete");
    if (x.t === "nombre" || x.t === "texte") return x.v;
    if (x.t === "ref") return env.reference ? env.reference(x.v, x.attribut) : refus("reference-parametre", { nom: x.v });
    if (x.t === "op" && x.v === "(") {
      const v = comparaison();
      if (!vu(")")) refus("parenthese");
      i++;
      return v;
    }
    if (x.t === "op" && x.v === "-") return -nombre(puissance());
    if (x.t === "op" && x.v === "+") return nombre(puissance());
    if (x.t === "nom") {
      if (vu("(")) {
        i++;
        const f = FONCTIONS[x.v.toUpperCase()] ?? refus("fonction", { nom: x.v });
        const args: ValeurDynamique[] = [];
        if (!vu(")")) {
          do args.push(comparaison());
          while (vu(",") && ++i);
        }
        if (!vu(")")) refus("parenthese-apres", { nom: x.v });
        i++;
        return f(args, env);
      }
      return env.valeur(x.v) ?? refus("nom", { nom: x.v });
    }
    return refus("inattendu", { texte: String(x.v) });
  };
  const puissance = (): ValeurDynamique => {
    const g = primaire();
    if (!vu("^")) return g;
    i++;
    return nombre(g) ** nombre(puissance());
  };
  const produit = (): ValeurDynamique => {
    let g = puissance();
    while (vu("*") || vu("/")) {
      const op = (j[i++] as Jeton).v;
      const d = nombre(puissance());
      if (op === "/" && d === 0) refus("division");
      g = op === "*" ? nombre(g) * d : nombre(g) / d;
    }
    return g;
  };
  const somme = (): ValeurDynamique => {
    let g = produit();
    while (vu("+") || vu("-")) {
      const op = (j[i++] as Jeton).v;
      const d = nombre(produit());
      g = op === "+" ? nombre(g) + d : nombre(g) - d;
    }
    return g;
  };
  const chaine = (): ValeurDynamique => {
    let g = somme();
    while (vu("&")) {
      i++;
      g = texte(g) + texte(somme());
    }
    return g;
  };
  function comparaison(): ValeurDynamique {
    const g = chaine();
    const op = j[i]?.t === "op" && ["=", "<>", "<", ">", "<=", ">="].includes((j[i] as Jeton).v as string) ? ((j[i++] as Jeton).v as string) : null;
    if (!op) return g;
    const d = chaine();
    const nums = typeof g === "number" && typeof d === "number";
    const c = nums ? (g as number) - (d as number) : texte(g).localeCompare(texte(d));
    const ok = op === "=" ? (nums ? Math.abs(c) < 1e-9 : c === 0) : op === "<>" ? (nums ? Math.abs(c) >= 1e-9 : c !== 0) : op === "<" ? c < 0 : op === ">" ? c > 0 : op === "<=" ? c <= 0 : c >= 0;
    return ok ? 1 : 0;
  }
  const v = comparaison();
  if (i < j.length) refus("inattendu", { texte: String((j[i] as Jeton).v) });
  return v;
}

/** Valeur saisie : formule si elle commence par « = », nombre si elle en est un (virgule ou point), texte sinon. */
export function evaluerSaisie(saisie: string, env: EnvironnementFormule): ValeurDynamique {
  const s = saisie.trim();
  if (s.startsWith("=")) return evaluerFormule(s.slice(1), env);
  const n = Number(s.replace(",", "."));
  return s !== "" && Number.isFinite(n) ? n : s;
}

// ————————————————————————————————————————————————————————————————————————————————— Paramètres

export interface ErreurDynamique {
  /** Paramètre ou règle en cause (« Largeur », « o12.LenX »). */
  readonly ou: string;
  /** Texte français ; l'interface traduit par `cle` et `args`. */
  readonly message: string;
  readonly cle: CleErreurDynamique;
  readonly args: Readonly<Record<string, string>>;
}
const erreur = (ou: string, cle: CleErreurDynamique, args: ArgsErreur = {}): ErreurDynamique => ({ ou, message: rediger(cle, args), cle, args });
const depuis = (ou: string, e: unknown): ErreurDynamique => (e instanceof ErreurFormule ? { ou, message: e.message, cle: e.cle, args: e.args } : erreur(ou, "inconnue", { texte: e instanceof Error ? e.message : String(e) }));

export const NOM_PARAMETRE = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_]{0,39}$/;
const RESERVES: ReadonlySet<string> = new Set(["copy", "parent", ...Object.keys(FONCTIONS).map((f) => f.toLowerCase())]);
/** Nom de paramètre admis : commence par une lettre, sans espace (règle de SketchUp), ni mot réservé. */
export const nomParametreValide = (nom: string): boolean => NOM_PARAMETRE.test(nom) && !RESERVES.has(nom.toLowerCase());

/** Évalue tous les paramètres (dans l'ordre de leurs dépendances) ; une boucle ou une erreur est rapportée, jamais devinée. */
export function evaluerParametres(dyn: ComposantDynamique): { readonly env: EnvironnementFormule; readonly valeurs: Readonly<Record<string, ValeurDynamique>>; readonly erreurs: ErreurDynamique[] } {
  const parNom = new Map(dyn.parametres.map((p) => [p.nom.toLowerCase(), p]));
  const connues = new Map<string, ValeurDynamique>();
  const erreurs: ErreurDynamique[] = [];
  const enCours = new Set<string>();
  const option = (nom: string) => {
    const p = parNom.get(nom.toLowerCase());
    if (!p?.option?.choix) return undefined;
    const rang = p.option.choix.findIndex((c) => c.valeur === p.valeur);
    return rang < 0 ? undefined : { rang: rang + 1, libelle: (p.option.choix[rang] as { libelle: string }).libelle };
  };
  const valeur = (nom: string): ValeurDynamique | undefined => {
    const cle = nom.toLowerCase();
    const p = parNom.get(cle);
    if (!p) return undefined;
    if (connues.has(cle)) return connues.get(cle);
    if (enCours.has(cle)) return refus("circulaire", { nom: p.nom });
    enCours.add(cle);
    try {
      const v = evaluerSaisie(p.valeur, { valeur, option });
      connues.set(cle, v);
      return v;
    } finally {
      enCours.delete(cle);
    }
  };
  const valeurs: Record<string, ValeurDynamique> = {};
  for (const p of dyn.parametres) {
    try {
      valeurs[p.nom] = valeur(p.nom) as ValeurDynamique;
    } catch (e) {
      erreurs.push(depuis(p.nom, e));
    }
  }
  return { env: { valeur, option }, valeurs, erreurs };
}

// ————————————————————————————————————————————————————————————————————————————————— Redessin

/** Boîte englobante du contenu d'une définition dans son repère local (objets imbriqués compris), ou `null` s'il est vide. */
export function boiteDefinition(m: Modele, definition: Id, pile: readonly Id[] = []): { readonly min: Vec3; readonly max: Vec3 } | null {
  const d = m.definitions[definition];
  if (!d || pile.includes(definition)) return null;
  let min: Vec3 | null = null;
  let max: Vec3 | null = null;
  const etendre = (p: Vec3) => {
    min = min ? { x: Math.min(min.x, p.x), y: Math.min(min.y, p.y), z: Math.min(min.z, p.z) } : p;
    max = max ? { x: Math.max(max.x, p.x), y: Math.max(max.y, p.y), z: Math.max(max.z, p.z) } : p;
  };
  for (const s of Object.values(d.contenu.sommets)) etendre(s.position);
  for (const o of Object.values(d.contenu.occurrences)) {
    const b = boiteDefinition(m, o.definition, [...pile, definition]);
    if (!b) continue;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) etendre(appliquer(o.transformation, { x, y, z }));
  }
  return min && max ? { min, max } : null;
}

const colonne = (M: Matrice4, c: number): Vec3 => ({ x: M[c] as number, y: M[4 + c] as number, z: M[8 + c] as number });
const norme = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
/** Plafond de copies par objet : au-delà, la règle est refusée (jamais tronquée en silence). */
export const COPIES_MAX = 200;

/** Matrice d'un objet : axes unitaires × échelles, puis translation. */
function matrice(axes: readonly [Vec3, Vec3, Vec3], echelles: readonly [number, number, number], t: Vec3): Matrice4 {
  const [u, v, w] = axes;
  const [a, b, c] = echelles;
  return [u.x * a, v.x * b, w.x * c, t.x, u.y * a, v.y * b, w.y * c, t.y, u.z * a, v.z * b, w.z * c, t.z, 0, 0, 0, 1];
}

export interface ResultatDynamique {
  readonly modele: Modele;
  readonly erreurs: ErreurDynamique[];
}

/** Attributs qu'une règle peut lire sur un autre objet du composant (« Pied!LenZ ») : les prédéfinis de SketchUp. */
export const ATTRIBUTS_LISIBLES: readonly AttributDynamique[] = ATTRIBUTS_DYNAMIQUES;

/** Axes d'une rotation RotX puis RotY puis RotZ (degrés, ordre fixé par Fadi) : colonnes de Rz · Ry · Rx. */
export function axesRotation(rx: number, ry: number, rz: number): [Vec3, Vec3, Vec3] {
  const [ca, sa, cb, sb, cg, sg] = [Math.cos(rx * RAD), Math.sin(rx * RAD), Math.cos(ry * RAD), Math.sin(ry * RAD), Math.cos(rz * RAD), Math.sin(rz * RAD)];
  return [
    { x: cg * cb, y: sg * cb, z: -sb },
    { x: cg * sb * sa - sg * ca, y: sg * sb * sa + cg * ca, z: cb * sa },
    { x: cg * sb * ca + sg * sa, y: sg * sb * ca - cg * sa, z: cb * ca },
  ];
}

/** Angles (degrés) RotX, RotY, RotZ d'axes unitaires orthogonaux, inverse de `axesRotation`. */
export function anglesRotation(axes: readonly [Vec3, Vec3, Vec3]): [number, number, number] {
  const [u, v, w] = axes;
  const ry = Math.asin(Math.max(-1, Math.min(1, -u.z)));
  const propre = (x: number): number => (Math.abs(x) < 1e-9 ? 0 : Number(x.toFixed(9)));
  if (Math.abs(Math.cos(ry)) < 1e-9) return [propre(Math.atan2(-w.y, v.y) / RAD), propre(ry / RAD), 0];
  return [propre(Math.atan2(v.z, w.z) / RAD), propre(ry / RAD), propre(Math.atan2(u.y, u.x) / RAD)];
}

/** Écart angulaire (degrés, ramené à 0…180). */
const ecartAngle = (a: number, b: number): number => {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(d, 360 - d);
};

/**
 * Angles actuels d'axes donnés, sur la branche d'Euler la plus proche des angles demandés par les règles : une même
 * orientation s'écrit (rx, ry, rz) ou (rx + 180, 180 − ry, rz + 180). Sans cette précaution, un angle sans règle repris
 * sur l'autre branche changerait l'orientation à chaque redessin.
 */
function anglesCompatibles(axes: readonly [Vec3, Vec3, Vec3], voulus: readonly (number | undefined)[]): [number, number, number] {
  const a = anglesRotation(axes);
  const b: [number, number, number] = [a[0] + 180, 180 - a[1], a[2] + 180];
  const cout = (c: readonly number[]) => voulus.reduce<number>((s, v, i) => (v === undefined ? s : s + ecartAngle(v, c[i] as number)), 0);
  return cout(b) < cout(a) - 1e-9 ? b : a;
}

/**
 * Redessine un composant dynamique : évalue ses paramètres puis applique ses règles à ses objets enfants. Une règle en
 * erreur est rapportée et laissée sans effet ; si un paramètre est en erreur, rien n'est modifié.
 */
export function redessinerDynamique(m: Modele, definition: Id): ResultatDynamique {
  const def = m.definitions[definition];
  const dyn = def?.dynamique;
  if (!def || !dyn) return { modele: m, erreurs: [] };
  const p = evaluerParametres(dyn);
  if (p.erreurs.length) return { modele: m, erreurs: p.erreurs };
  const erreurs: ErreurDynamique[] = [];
  const occurrences: Record<Id, Occurrence> = { ...def.contenu.occurrences };
  const materiaux = Object.values(annotationsDe(m.annotations).materiaux);
  const copies: Record<Id, readonly Id[]> = {};
  let prochain = m.prochainId;
  const parObjet = new Map<Id, RegleDynamique[]>();
  for (const r of dyn.regles) parObjet.set(r.objet, [...(parObjet.get(r.objet) ?? []), r]);
  const anciennes = dyn.copies ?? {};
  // Copies d'un objet disparu, ou d'un objet qui n'a plus de règle Copies : retirées.
  for (const [objet, ids] of Object.entries(anciennes)) {
    if (!occurrences[objet] || !(parObjet.get(objet) ?? []).some((r) => r.attribut === "Copies")) for (const id of ids) delete occurrences[id];
  }
  // Une même erreur (même règle, même message) n'est rapportée qu'une fois, qu'elle vienne de l'objet, d'une copie ou d'une référence.
  const signaler = (e: ErreurDynamique): void => {
    if (!erreurs.some((x) => x.ou === e.ou && x.message === e.message)) erreurs.push(e);
  };
  const pilotables = objetsPilotables(m, definition);
  const etiquetteDe = (o: Occurrence): string => o.nom ?? m.definitions[o.definition]?.nom ?? o.id;

  /** Géométrie actuelle d'un objet : translation, axes unitaires, échelles, boîte naturelle de sa définition. */
  const geometrie = (o: Occurrence) => {
    const M = o.transformation;
    const cols: [Vec3, Vec3, Vec3] = [colonne(M, 0), colonne(M, 1), colonne(M, 2)];
    const ech: [number, number, number] = [norme(cols[0]), norme(cols[1]), norme(cols[2])];
    const unites = cols.map((c, k) => ((ech[k] as number) > 1e-12 ? { x: c.x / (ech[k] as number), y: c.y / (ech[k] as number), z: c.z / (ech[k] as number) } : c)) as [Vec3, Vec3, Vec3];
    const boite = boiteDefinition(m, o.definition);
    const naturel = (["x", "y", "z"] as const).map((c) => (boite ? boite.max[c] - boite.min[c] : 0)) as [number, number, number];
    return { M, ech, unites, naturel };
  };
  /** Valeur actuelle d'un attribut, pour un objet sans règle sur cet attribut. */
  const actuelle = (o: Occurrence, attribut: AttributDynamique): ValeurDynamique => {
    const g = geometrie(o);
    const angles = anglesRotation(g.unites);
    switch (attribut) {
      case "X": return g.M[3] as number;
      case "Y": return g.M[7] as number;
      case "Z": return g.M[11] as number;
      case "LenX": return g.ech[0] * g.naturel[0];
      case "LenY": return g.ech[1] * g.naturel[1];
      case "LenZ": return g.ech[2] * g.naturel[2];
      case "RotX": return angles[0];
      case "RotY": return angles[1];
      case "RotZ": return angles[2];
      case "Hidden": return o.masquee ? 1 : 0;
      case "Material": return o.materiau ? (materiaux.find((x) => x.id === o.materiau)?.nom ?? o.materiau) : "";
      case "Copies": return (anciennes[o.id] ?? []).length;
    }
  };

  // Valeurs des règles pour l'objet d'origine (Copy = 0), calculées une fois : une référence les relit.
  const memo = new Map<string, { v: ValeurDynamique | undefined }>();
  const enCours = new Set<string>();
  const calculer = (objet: Id, attribut: AttributDynamique, copy: number): ValeurDynamique | undefined => {
    const r = (parObjet.get(objet) ?? []).find((x) => x.attribut === attribut);
    if (!r) return undefined;
    const cle = `${objet}:${attribut}`;
    if (copy === 0 && memo.has(cle)) return (memo.get(cle) as { v: ValeurDynamique | undefined }).v;
    const base = def.contenu.occurrences[objet] as Occurrence;
    if (copy === 0) enCours.add(cle);
    let v: ValeurDynamique | undefined;
    try {
      v = evaluerSaisie(r.formule, { valeur: (nom) => (nom.toLowerCase() === "copy" ? copy : p.env.valeur(nom)), ...(p.env.option ? { option: p.env.option } : {}), reference });
    } catch (e) {
      signaler(depuis(`${etiquetteDe(base)}.${attribut}`, e));
      v = undefined;
    } finally {
      if (copy === 0) enCours.delete(cle);
    }
    if (copy === 0) memo.set(cle, { v });
    return v;
  };
  function reference(nom: string, attribut: string): ValeurDynamique {
    const a = ATTRIBUTS_LISIBLES.find((x) => x.toLowerCase() === attribut.toLowerCase());
    if (!a) return refus("reference-attribut", { nom, attribut });
    const trouves = pilotables.filter((o) => etiquetteDe(o).toLowerCase() === nom.toLowerCase());
    if (trouves.length === 0) return refus("reference", { nom });
    if (trouves.length > 1) return refus("reference-ambigue", { nom });
    const o = trouves[0] as Occurrence;
    if (!(parObjet.get(o.id) ?? []).some((x) => x.attribut === a)) return actuelle(o, a);
    if (enCours.has(`${o.id}:${a}`)) return refus("circulaire", { nom: `${nom}!${a}` });
    const v = calculer(o.id, a, 0);
    return v === undefined ? refus("reference-erreur", { nom, attribut: a }) : v;
  }

  for (const [objet, regles] of parObjet) {
    const base = def.contenu.occurrences[objet];
    if (!base) {
      erreurs.push(erreur(objet, "objet"));
      continue;
    }
    const etiquette = etiquetteDe(base);
    const calcul = (attribut: AttributDynamique, copy: number): ValeurDynamique | undefined => calculer(objet, attribut, copy);
    const num = (attribut: AttributDynamique, copy: number): number | undefined => {
      const v = calcul(attribut, copy);
      if (v === undefined) return undefined;
      try {
        return nombre(v, attribut);
      } catch (e) {
        signaler(depuis(`${etiquette}.${attribut}`, e));
        return undefined;
      }
    };
    // Nombre de copies : entier de 0 à COPIES_MAX, sinon la règle est refusée et les copies existantes gardées.
    let n = 0;
    const existantes = (anciennes[objet] ?? []).filter((id) => occurrences[id]);
    const demande = num("Copies", 0);
    if (regles.some((r) => r.attribut === "Copies")) {
      if (demande === undefined) n = existantes.length;
      else if (!Number.isInteger(demande) || demande < 0 || demande > COPIES_MAX) {
        erreurs.push(erreur(`${etiquette}.Copies`, "copies", { max: String(COPIES_MAX), recu: String(demande) }));
        n = existantes.length;
      } else n = demande;
      const ids = existantes.slice(0, n);
      for (const id of existantes.slice(n)) delete occurrences[id];
      while (ids.length < n) ids.push(`o${prochain++}`);
      if (ids.length) copies[objet] = ids;
    }
    const { M, ech, unites, naturel } = geometrie(base);
    const tourne = regles.some((r) => r.attribut === "RotX" || r.attribut === "RotY" || r.attribut === "RotZ");
    for (let k = 0; k <= n; k++) {
      const id = k === 0 ? objet : ((copies[objet] as readonly Id[])[k - 1] as Id);
      // Rotation : un angle sans règle (ou en erreur) garde sa valeur actuelle ; sans aucune règle d'angle, les axes restent.
      let axes = unites;
      if (tourne) {
        const voulus = (["RotX", "RotY", "RotZ"] as const).map((a) => num(a, k));
        const actuels = anglesCompatibles(unites, voulus);
        const [rx, ry, rz] = voulus.map((v, i) => v ?? (actuels[i] as number));
        axes = axesRotation(rx as number, ry as number, rz as number);
      }
      const echelles = (["LenX", "LenY", "LenZ"] as const).map((a, axe) => {
        const voulu = num(a, k);
        if (voulu === undefined) return ech[axe] as number;
        const nat = naturel[axe] as number;
        if (voulu <= 0 || nat <= 1e-9) {
          signaler(voulu <= 0 ? erreur(`${etiquette}.${a}`, "longueur", { attribut: a, recu: String(voulu) }) : erreur(`${etiquette}.${a}`, "epaisseur", { attribut: a }));
          return ech[axe] as number;
        }
        return voulu / nat;
      }) as [number, number, number];
      const t = { x: num("X", k) ?? (M[3] as number), y: num("Y", k) ?? (M[7] as number), z: num("Z", k) ?? (M[11] as number) };
      const { masquee: _m, materiau: _mat, ...reste } = k === 0 ? base : { ...base, id };
      let suite: Occurrence = { ...reste, id, transformation: matrice(axes, echelles, t) };
      const cache = calcul("Hidden", k);
      if (cache === undefined ? base.masquee : vrai(cache)) suite = { ...suite, masquee: true };
      const matiere = calcul("Material", k);
      if (matiere === undefined) {
        if (base.materiau !== undefined) suite = { ...suite, materiau: base.materiau };
      } else if (texte(matiere) !== "") {
        const trouve = materiaux.find((x) => x.id === texte(matiere) || x.nom.toLowerCase() === texte(matiere).toLowerCase());
        if (trouve) suite = { ...suite, materiau: trouve.id };
        else {
          // Matière inconnue : l'erreur est rapportée et la matière déjà posée reste (une règle en erreur est sans effet).
          if (base.materiau !== undefined) suite = { ...suite, materiau: base.materiau };
          signaler(erreur(`${etiquette}.Material`, "matiere", { nom: texte(matiere) }));
        }
      }
      occurrences[id] = suite;
    }
  }
  const { copies: _c, ...sansCopies } = dyn;
  const suivant: ComposantDynamique = Object.keys(copies).length ? { ...sansCopies, copies } : sansCopies;
  const contenu: Contexte = { ...def.contenu, occurrences };
  const modele: Modele = { ...m, prochainId: prochain, definitions: { ...m.definitions, [definition]: { ...def, contenu, dynamique: suivant } } };
  return { modele, erreurs };
}

/** Pose (ou retire, `null`) la description dynamique d'un composant, puis le redessine. */
export function definirDynamique(m: Modele, definition: Id, dyn: ComposantDynamique | null): ResultatDynamique {
  const def = m.definitions[definition];
  if (!def) return { modele: m, erreurs: [erreur(definition, "composant")] };
  if (dyn === null) {
    const { dynamique: _d, ...reste } = def;
    return { modele: { ...m, definitions: { ...m.definitions, [definition]: reste } }, erreurs: [] };
  }
  // Ce que la relecture refuserait n'est jamais enregistré : la Planche resterait illisible à la réouverture.
  if (!estComposantDynamique(dyn)) return { modele: m, erreurs: [erreur(def.nom, "limites")] };
  const copies = def.dynamique?.copies;
  const pose = { ...m, definitions: { ...m.definitions, [definition]: { ...def, dynamique: copies && !dyn.copies ? { ...dyn, copies } : dyn } } };
  return redessinerDynamique(pose, definition);
}

/** Change la valeur d'un paramètre (une option choisie par l'utilisateur), puis redessine. */
export function definirParametre(m: Modele, definition: Id, nom: string, valeur: string): ResultatDynamique {
  const dyn = m.definitions[definition]?.dynamique;
  if (!dyn) return { modele: m, erreurs: [erreur(nom, "pas-dynamique")] };
  return definirDynamique(m, definition, { ...dyn, parametres: dyn.parametres.map((p): ParametreDynamique => (p.nom === nom ? { ...p, valeur } : p)) });
}

// ————————————————————————————————————————————————————————————————————————————————— Au clic (outil Interagir)

/** Découpe au premier niveau (hors guillemets et parenthèses) selon `sep`. */
function decouperHaut(source: string, sep: string): string[] {
  const morceaux: string[] = [];
  let profondeur = 0;
  let guillemet = false;
  let debut = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (guillemet) {
      if (c === "\\") i++;
      else if (c === '"') guillemet = false;
    } else if (c === '"') guillemet = true;
    else if (c === "(") profondeur++;
    else if (c === ")") profondeur--;
    else if (c === sep && profondeur === 0) {
      morceaux.push(source.slice(debut, i));
      debut = i + 1;
    }
  }
  morceaux.push(source.slice(debut));
  return morceaux.map((x) => x.trim()).filter((x) => x !== "");
}

/** Actions au clic lues : verbe (SET ou ALTER), paramètre visé et formules des valeurs, dans l'ordre. */
export function lireSurClic(source: string): { readonly action: "SET" | "ALTER"; readonly parametre: string; readonly valeurs: readonly string[] }[] {
  const texteSource = source.trim().replace(/^=/, "");
  return decouperHaut(texteSource, ";").map((a) => {
    const m = /^([A-Za-z]+)\s*\(([\s\S]*)\)$/.exec(a);
    if (!m) return refus("action-forme", { texte: a });
    const action = (m[1] as string).toUpperCase();
    if (action !== "SET" && action !== "ALTER") return refus("action", { nom: m[1] as string });
    const args = decouperHaut(m[2] as string, ",");
    if (args.length < 2) return refus("action-forme", { texte: a });
    const cible = (args[0] as string).replace(/^"(.*)"$/, "$1").trim();
    return { action, parametre: cible, valeurs: args.slice(1) };
  });
}

const memeValeur = (a: ValeurDynamique, b: ValeurDynamique): boolean => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9 : texte(a) === texte(b));

/**
 * Clic de l'outil Interagir sur un composant dynamique : chaque action fait passer son paramètre à la valeur qui suit
 * la valeur actuelle dans sa liste (la première si l'actuelle n'y est pas ; une seule valeur = la poser), puis le
 * composant est redessiné. Une action en erreur annule tout le clic : rien n'est modifié.
 */
export function cliquerDynamique(m: Modele, definition: Id): ResultatDynamique {
  const def = m.definitions[definition];
  const dyn = def?.dynamique;
  if (!def) return { modele: m, erreurs: [erreur(definition, "composant")] };
  if (!dyn) return { modele: m, erreurs: [erreur(def.nom, "pas-dynamique")] };
  if (!dyn.surClic?.trim()) return { modele: m, erreurs: [erreur(def.nom, "sans-clic")] };
  let suite: ComposantDynamique = dyn;
  try {
    for (const a of lireSurClic(dyn.surClic)) {
      const p = evaluerParametres(suite);
      if (p.erreurs.length) return { modele: m, erreurs: p.erreurs };
      const i = suite.parametres.findIndex((x) => x.nom.toLowerCase() === a.parametre.toLowerCase());
      if (i < 0) return refus("action-parametre", { action: a.action, nom: a.parametre });
      const actuelle = p.valeurs[(suite.parametres[i] as ParametreDynamique).nom];
      const valeurs = a.valeurs.map((v) => evaluerFormule(v, p.env));
      const rang = actuelle === undefined ? -1 : valeurs.findIndex((v) => memeValeur(v, actuelle));
      const v = valeurs[(rang + 1) % valeurs.length] as ValeurDynamique;
      suite = { ...suite, parametres: suite.parametres.map((x, k) => (k === i ? { ...x, valeur: texte(v) } : x)) };
    }
  } catch (e) {
    return { modele: m, erreurs: [depuis(`${def.nom}.surClic`, e)] };
  }
  // Tout ou rien : un paramètre que la dernière action rendrait faux (division par zéro…) annule le clic.
  const finale = evaluerParametres(suite);
  if (finale.erreurs.length) return { modele: m, erreurs: finale.erreurs };
  return definirDynamique(m, definition, suite);
}

/**
 * Composant qui répond au clic sous un chemin d'occurrences (racine → objet visé) : le plus profond dont la définition
 * porte une action au clic, sinon `null`.
 */
export function definitionInteractive(m: Modele, chemin: readonly Id[]): Id | null {
  const defs: Id[] = [];
  let c: Contexte = m.racine;
  for (const id of chemin) {
    const o = c.occurrences[id];
    const d = o ? m.definitions[o.definition] : undefined;
    if (!o || !d) break;
    defs.push(d.id);
    c = d.contenu;
  }
  for (let k = defs.length - 1; k >= 0; k--) if (m.definitions[defs[k] as Id]?.dynamique?.surClic?.trim()) return defs[k] as Id;
  return null;
}

/** Objets enfants d'un composant que des règles peuvent piloter : ses occurrences, hors copies tenues par le moteur. */
export function objetsPilotables(m: Modele, definition: Id): Occurrence[] {
  const def = m.definitions[definition];
  if (!def) return [];
  const copies = new Set(Object.values(def.dynamique?.copies ?? {}).flat());
  return Object.values(def.contenu.occurrences).filter((o) => !copies.has(o.id));
}

/** Forme d'une description dynamique reçue (brouillon relu, échange) : jamais crue sur parole. */
export function estComposantDynamique(v: unknown): v is ComposantDynamique {
  const objet = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
  const court = (x: unknown, max = 500): x is string => typeof x === "string" && x.length <= max;
  if (!objet(v) || !Array.isArray(v["parametres"]) || !Array.isArray(v["regles"]) || v["parametres"].length > 64 || v["regles"].length > 512) return false;
  const noms = new Set<string>();
  for (const p of v["parametres"]) {
    if (!objet(p) || typeof p["nom"] !== "string" || !nomParametreValide(p["nom"]) || noms.has(p["nom"].toLowerCase()) || !court(p["valeur"])) return false;
    noms.add(p["nom"].toLowerCase());
    const o = p["option"];
    if (o === undefined) continue;
    if (!objet(o) || !court(o["libelle"], 80)) return false;
    if (o["choix"] !== undefined && !(Array.isArray(o["choix"]) && o["choix"].length <= 50 && o["choix"].every((c) => objet(c) && court(c["libelle"], 80) && court(c["valeur"], 200)))) return false;
  }
  for (const r of v["regles"]) if (!objet(r) || !court(r["objet"], 64) || !(ATTRIBUTS_DYNAMIQUES as readonly unknown[]).includes(r["attribut"]) || !court(r["formule"])) return false;
  if (v["surClic"] !== undefined && !court(v["surClic"])) return false;
  const c = v["copies"];
  return c === undefined || (objet(c) && Object.values(c).every((l) => Array.isArray(l) && l.length <= COPIES_MAX && l.every((id) => court(id, 64))));
}
