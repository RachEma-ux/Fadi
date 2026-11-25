/**
 * Extension « Composants dynamiques » (25 novembre 2026), d'après les Dynamic Components de SketchUp : un composant
 * porte des **paramètres** (valeur ou formule de tableur « =… »), dont certains sont montrés comme **options** (zone de
 * texte ou liste), et des **règles** qui fixent par formule les attributs prédéfinis de ses objets enfants — position
 * (X, Y, Z), taille (LenX, LenY, LenZ), rotation (RotZ), masquage (Hidden), matière (Material), répétition (Copies, avec
 * la variable Copy). Pur : ni React, ni DOM, aucun code exécuté — les formules sont lues par l'interpréteur ci-dessous.
 *
 * Écarts déclarés avec SketchUp : longueurs en **mètres** (SketchUp : pouces) ; tout est rangé sur la définition du
 * composant, donc une option change toutes ses instances (« Rendre unique » pour en détacher une) ; pas d'outil
 * Interagir ni d'onClick, pas de RotX / RotY, pas de référence d'un enfant à un autre, pas de fonction aléatoire.
 */
import { annotationsDe } from "./annotations.js";
import { ATTRIBUTS_DYNAMIQUES, type AttributDynamique, type ComposantDynamique, type Contexte, type Id, type Matrice4, type Modele, type Occurrence, type ParametreDynamique, type RegleDynamique, appliquer } from "./geometrie-libre.js";
import type { Vec3 } from "./vecteur.js";

export type ValeurDynamique = number | string;
export class ErreurFormule extends Error {}
const refus = (message: string): never => {
  throw new ErreurFormule(message);
};

// ————————————————————————————————————————————————————————————————————————————————— Formules

type Jeton = { readonly t: "nombre"; readonly v: number } | { readonly t: "texte"; readonly v: string } | { readonly t: "nom"; readonly v: string } | { readonly t: "op"; readonly v: string };

function decouper(source: string): Jeton[] {
  const jetons: Jeton[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i] as string;
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?|^[0-9]+\.?/.exec(source.slice(i));
      if (!m) refus(`Nombre illisible à la position ${i + 1}.`);
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
      if (j >= source.length) refus("Guillemet non fermé.");
      jetons.push({ t: "texte", v: texte });
      i = j + 1;
    } else if (/[A-Za-zÀ-ÿ_]/.test(c)) {
      const m = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]*/.exec(source.slice(i)) as RegExpExecArray;
      i += m[0].length;
      // « Parent!nom » (écriture de SketchUp) désigne un paramètre du composant : le préfixe est admis et ignoré.
      if (source[i] === "!") {
        if (m[0].toLowerCase() !== "parent") refus(`Référence « ${m[0]}! » : seule « Parent! » est admise (pas de référence à un autre objet).`);
        i++;
        continue;
      }
      jetons.push({ t: "nom", v: m[0] });
    } else {
      const deux = source.slice(i, i + 2);
      const op = ["<=", ">=", "<>"].includes(deux) ? deux : c;
      if (!"+-*/^&=<>(),;".includes(op[0] as string)) refus(`Caractère inattendu « ${c} ».`);
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
}

const nombre = (v: ValeurDynamique, quoi = "valeur"): number => {
  const n = typeof v === "number" ? v : Number(v.trim().replace(",", "."));
  if (typeof v === "string" && v.trim() === "") refus(`Nombre attendu (${quoi}), texte vide reçu.`);
  return Number.isFinite(n) ? n : refus(`Nombre attendu (${quoi}), « ${v} » reçu.`);
};
const texte = (v: ValeurDynamique): string => (typeof v === "number" ? String(Number(v.toFixed(9))) : v);
const vrai = (v: ValeurDynamique): boolean => (typeof v === "number" ? v !== 0 : v !== "" && v !== "0");
const RAD = Math.PI / 180;

type Fonction = (a: ValeurDynamique[], env: EnvironnementFormule) => ValeurDynamique;
const n1 = (f: (x: number) => number): Fonction => (a) => f(nombre(a[0] ?? refus("Argument manquant.")));
const multiple = (x: number, pas: number, f: (q: number) => number): number => (pas === 0 ? 0 : f(x / pas) * pas);
const FONCTIONS: Readonly<Record<string, Fonction>> = {
  ABS: n1(Math.abs), INT: n1(Math.floor), SQRT: n1((x) => (x < 0 ? refus("Racine d'un nombre négatif.") : Math.sqrt(x))), SIGN: n1(Math.sign), EXP: n1(Math.exp),
  LN: n1((x) => (x <= 0 ? refus("Logarithme d'un nombre négatif ou nul.") : Math.log(x))), LOG10: n1((x) => (x <= 0 ? refus("Logarithme d'un nombre négatif ou nul.") : Math.log10(x))),
  DEGREES: n1((x) => x / RAD), RADIANS: n1((x) => x * RAD), EVEN: n1((x) => Math.sign(x) * Math.ceil(Math.abs(x) / 2) * 2), ODD: n1((x) => Math.sign(x || 1) * (Math.ceil((Math.abs(x) - 1) / 2) * 2 + 1)),
  SIN: n1((x) => Math.sin(x * RAD)), COS: n1((x) => Math.cos(x * RAD)), TAN: n1((x) => Math.tan(x * RAD)),
  ASIN: n1((x) => Math.asin(x) / RAD), ACOS: n1((x) => Math.acos(x) / RAD), ATAN: n1((x) => Math.atan(x) / RAD),
  PI: () => Math.PI, TRUE: () => 1, FALSE: () => 0,
  ROUND: (a) => { const p = 10 ** Math.round(nombre(a[1] ?? 0)); return Math.round(nombre(a[0] ?? refus("Argument manquant.")) * p) / p; },
  CEILING: (a) => multiple(nombre(a[0] ?? refus("Argument manquant.")), nombre(a[1] ?? 1), Math.ceil),
  FLOOR: (a) => multiple(nombre(a[0] ?? refus("Argument manquant.")), nombre(a[1] ?? 1), Math.floor),
  LARGEST: (a) => Math.max(...a.map((x) => nombre(x))), MAX: (a) => Math.max(...a.map((x) => nombre(x))),
  SMALLEST: (a) => Math.min(...a.map((x) => nombre(x))), MIN: (a) => Math.min(...a.map((x) => nombre(x))),
  NEAREST: (a) => { const x = nombre(a[0] ?? refus("Argument manquant.")); const c = a.slice(1).map((v) => nombre(v)); return c.length ? c.reduce((m, v) => (Math.abs(v - x) < Math.abs(m - x) ? v : m)) : x; },
  CHOOSE: (a) => a[Math.round(nombre(a[0] ?? refus("Argument manquant.")))] ?? refus("CHOOSE : rang hors de la liste."),
  IF: (a) => (vrai(a[0] ?? refus("Argument manquant.")) ? a[1] ?? 1 : a[2] ?? 0),
  AND: (a) => (a.every(vrai) ? 1 : 0), OR: (a) => (a.some(vrai) ? 1 : 0), NOT: (a) => (vrai(a[0] ?? 0) ? 0 : 1),
  CONCATENATE: (a) => a.map(texte).join(""), LEN: (a) => texte(a[0] ?? "").length, UPPER: (a) => texte(a[0] ?? "").toUpperCase(), LOWER: (a) => texte(a[0] ?? "").toLowerCase(),
  TRIM: (a) => texte(a[0] ?? "").trim(), VALUE: (a) => nombre(a[0] ?? ""), EXACT: (a) => (texte(a[0] ?? "") === texte(a[1] ?? "") ? 1 : 0),
  LEFT: (a) => texte(a[0] ?? "").slice(0, Math.max(0, nombre(a[1] ?? 1))), RIGHT: (a) => { const s = texte(a[0] ?? ""); return s.slice(Math.max(0, s.length - Math.max(0, nombre(a[1] ?? 1)))); },
  MID: (a) => texte(a[0] ?? "").substr(Math.max(0, nombre(a[1] ?? 1) - 1), Math.max(0, nombre(a[2] ?? 1))),
  OPTIONINDEX: (a, env) => env.option?.(texte(a[0] ?? ""))?.rang ?? refus(`OPTIONINDEX : « ${texte(a[0] ?? "")} » n'est pas un paramètre à liste.`),
  OPTIONLABEL: (a, env) => env.option?.(texte(a[0] ?? ""))?.libelle ?? refus(`OPTIONLABEL : « ${texte(a[0] ?? "")} » n'est pas un paramètre à liste.`),
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
    if (!x) return refus("Formule incomplète.");
    if (x.t === "nombre" || x.t === "texte") return x.v;
    if (x.t === "op" && x.v === "(") {
      const v = comparaison();
      if (!vu(")")) refus("Parenthèse non fermée.");
      i++;
      return v;
    }
    if (x.t === "op" && x.v === "-") return -nombre(puissance());
    if (x.t === "op" && x.v === "+") return nombre(puissance());
    if (x.t === "nom") {
      if (vu("(")) {
        i++;
        const f = FONCTIONS[x.v.toUpperCase()] ?? refus(`Fonction inconnue : ${x.v}.`);
        const args: ValeurDynamique[] = [];
        if (!vu(")")) {
          do args.push(comparaison());
          while (vu(",") && ++i);
        }
        if (!vu(")")) refus(`Parenthèse non fermée après ${x.v}.`);
        i++;
        return f(args, env);
      }
      return env.valeur(x.v) ?? refus(`Nom inconnu : ${x.v}.`);
    }
    return refus(`« ${x.v} » inattendu.`);
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
      if (op === "/" && d === 0) refus("Division par zéro.");
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
  if (i < j.length) refus(`« ${(j[i] as Jeton).v} » inattendu.`);
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
  readonly message: string;
}

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
    if (enCours.has(cle)) return refus(`Référence circulaire par « ${p.nom} ».`);
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
      erreurs.push({ ou: p.nom, message: e instanceof Error ? e.message : String(e) });
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
  for (const [objet, regles] of parObjet) {
    const base = def.contenu.occurrences[objet];
    if (!base) {
      erreurs.push({ ou: objet, message: "Objet introuvable dans le composant : ses règles sont sans effet." });
      continue;
    }
    const etiquette = base.nom ?? m.definitions[base.definition]?.nom ?? objet;
    const calcul = (attribut: AttributDynamique, copy: number): ValeurDynamique | undefined => {
      const r = regles.find((x) => x.attribut === attribut);
      if (!r) return undefined;
      try {
        return evaluerSaisie(r.formule, { valeur: (nom) => (nom.toLowerCase() === "copy" ? copy : p.env.valeur(nom)), ...(p.env.option ? { option: p.env.option } : {}) });
      } catch (e) {
        if (copy === 0) erreurs.push({ ou: `${etiquette}.${attribut}`, message: e instanceof Error ? e.message : String(e) });
        return undefined;
      }
    };
    const num = (attribut: AttributDynamique, copy: number): number | undefined => {
      const v = calcul(attribut, copy);
      if (v === undefined) return undefined;
      try {
        return nombre(v, attribut);
      } catch (e) {
        if (copy === 0) erreurs.push({ ou: `${etiquette}.${attribut}`, message: e instanceof Error ? e.message : String(e) });
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
        erreurs.push({ ou: `${etiquette}.Copies`, message: `Copies : un entier de 0 à ${COPIES_MAX} (reçu ${demande}).` });
        n = existantes.length;
      } else n = demande;
      const ids = existantes.slice(0, n);
      for (const id of existantes.slice(n)) delete occurrences[id];
      while (ids.length < n) ids.push(`o${prochain++}`);
      if (ids.length) copies[objet] = ids;
    }
    const boite = boiteDefinition(m, base.definition);
    const M = base.transformation;
    const cols: [Vec3, Vec3, Vec3] = [colonne(M, 0), colonne(M, 1), colonne(M, 2)];
    const ech: [number, number, number] = [norme(cols[0]), norme(cols[1]), norme(cols[2])];
    const unites = cols.map((c, k) => (ech[k] as number) > 1e-12 ? { x: c.x / (ech[k] as number), y: c.y / (ech[k] as number), z: c.z / (ech[k] as number) } : c) as [Vec3, Vec3, Vec3];
    for (let k = 0; k <= n; k++) {
      const id = k === 0 ? objet : ((copies[objet] as readonly Id[])[k - 1] as Id);
      const rot = num("RotZ", k);
      const axes: [Vec3, Vec3, Vec3] = rot === undefined ? unites : [{ x: Math.cos(rot * RAD), y: Math.sin(rot * RAD), z: 0 }, { x: -Math.sin(rot * RAD), y: Math.cos(rot * RAD), z: 0 }, { x: 0, y: 0, z: 1 }];
      const echelles = (["LenX", "LenY", "LenZ"] as const).map((a, axe) => {
        const voulu = num(a, k);
        if (voulu === undefined) return ech[axe] as number;
        const naturel = boite ? (["x", "y", "z"] as const).map((c) => boite.max[c] - boite.min[c])[axe] as number : 0;
        if (voulu <= 0 || naturel <= 1e-9) {
          if (k === 0) erreurs.push({ ou: `${etiquette}.${a}`, message: voulu <= 0 ? `${a} : une longueur strictement positive (reçu ${voulu}).` : `${a} : l'objet n'a pas d'épaisseur dans cette direction, il ne peut pas être étiré.` });
          return ech[axe] as number;
        }
        return voulu / naturel;
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
        else if (k === 0) erreurs.push({ ou: `${etiquette}.Material`, message: `Matière inconnue : « ${texte(matiere)} ». Créez-la dans le panneau Matériaux.` });
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
  if (!def) return { modele: m, erreurs: [{ ou: definition, message: "Composant introuvable." }] };
  if (dyn === null) {
    const { dynamique: _d, ...reste } = def;
    return { modele: { ...m, definitions: { ...m.definitions, [definition]: reste } }, erreurs: [] };
  }
  const copies = def.dynamique?.copies;
  const pose = { ...m, definitions: { ...m.definitions, [definition]: { ...def, dynamique: copies && !dyn.copies ? { ...dyn, copies } : dyn } } };
  return redessinerDynamique(pose, definition);
}

/** Change la valeur d'un paramètre (une option choisie par l'utilisateur), puis redessine. */
export function definirParametre(m: Modele, definition: Id, nom: string, valeur: string): ResultatDynamique {
  const dyn = m.definitions[definition]?.dynamique;
  if (!dyn) return { modele: m, erreurs: [{ ou: nom, message: "Ce composant n'est pas dynamique." }] };
  return definirDynamique(m, definition, { ...dyn, parametres: dyn.parametres.map((p): ParametreDynamique => (p.nom === nom ? { ...p, valeur } : p)) });
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
  const c = v["copies"];
  return c === undefined || (objet(c) && Object.values(c).every((l) => Array.isArray(l) && l.length <= COPIES_MAX && l.every((id) => court(id, 64))));
}
