/**
 * Extension « Scripts » (25 novembre 2026), d'après la console Ruby et les extensions libres de SketchUp : un script
 * est un texte JavaScript écrit par la personne, qui dessine par l'objet `planche` (longueurs en **mètres**, points
 * `[x, y, z]`). Pur : ni React, ni DOM. Ce fichier range trois choses :
 *
 *  - les **scripts personnels** d'un compte (« Mes scripts ») et leur validation (bornes, forme) ;
 *  - les **exemples** fournis (du code, pas des données de projet) ;
 *  - `executerScript` : lance un script sur un modèle et rend le modèle obtenu, son journal et, en cas d'erreur, le
 *    modèle d'origine **inchangé** avec la ligne fautive.
 *
 * `executerScript` ne borne ni le temps ni le réseau : le navigateur l'appelle dans un Web Worker isolé, arrêté après un
 * délai (`apps/web/.../planche/scripts-planche.worker.ts`). Rien n'est exécuté sur le serveur.
 */
import {
  type Contexte,
  type Id,
  type Modele,
  type Rapport,
  aire,
  ajouterRectangle,
  ajouterSegment,
  contexte,
  copier,
  deplacer,
  effacerEntites,
  grouper,
  pousserTirer,
  tourner,
} from "./geometrie-libre.js";
import { type Vec3, dist, v3 } from "./vecteur.js";

// ————————————————————————————————————————————————————————————— Scripts personnels

export interface ScriptPersonnel {
  readonly id: string;
  readonly nom: string;
  readonly code: string;
}

export const MAX_SCRIPTS = 20;
export const MAX_NOM_SCRIPT = 60;
/** Caractères par script, et au total : l'ensemble tient dans un corps de préférences (limite JSON du serveur). */
export const MAX_CODE_SCRIPT = 8000;
export const MAX_CODE_TOTAL = 40000;
const MOTIF_ID_SCRIPT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Caractères de contrôle refusés dans un script (tabulation et saut de ligne admis). */
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u0008\u000b-\u001f\u007f]/;

export type ValidationScripts = { readonly ok: true; readonly scripts: readonly ScriptPersonnel[] } | { readonly ok: false; readonly erreur: "forme_invalide"; readonly detail: string };

/** Valide la liste « Mes scripts » d'un compte (navigateur et serveur) : forme stricte et bornes ; jamais de filtrage silencieux. */
export function validerScripts(v: unknown): ValidationScripts {
  const refus = (detail: string): ValidationScripts => ({ ok: false, erreur: "forme_invalide", detail });
  if (!Array.isArray(v) || v.length > MAX_SCRIPTS) return refus(`scripts : liste d'au plus ${MAX_SCRIPTS} scripts`);
  const scripts: ScriptPersonnel[] = [];
  let total = 0;
  for (const s of v as unknown[]) {
    if (!s || typeof s !== "object" || Array.isArray(s)) return refus("script : objet attendu");
    const r = s as Record<string, unknown>;
    if (Object.keys(r).some((k) => !["id", "nom", "code"].includes(k))) return refus("script : champs id, nom, code");
    const nom = typeof r["nom"] === "string" ? r["nom"].trim() : "";
    const code = r["code"];
    if (typeof r["id"] !== "string" || r["id"].length > 40 || !MOTIF_ID_SCRIPT.test(r["id"])) return refus("script : identifiant en minuscules, chiffres, tirets");
    if (nom.length === 0 || nom.length > MAX_NOM_SCRIPT || CONTROLE.test(nom) || /[\n\t]/.test(nom)) return refus(`script : nom de 1 à ${MAX_NOM_SCRIPT} caractères`);
    if (typeof code !== "string" || code.length > MAX_CODE_SCRIPT || CONTROLE.test(code)) return refus(`script : texte d'au plus ${MAX_CODE_SCRIPT} caractères, sans caractère de contrôle`);
    total += code.length;
    scripts.push({ id: r["id"], nom, code });
  }
  if (total > MAX_CODE_TOTAL) return refus(`scripts : au plus ${MAX_CODE_TOTAL} caractères au total`);
  if (new Set(scripts.map((s) => s.id)).size !== scripts.length) return refus("script cité deux fois");
  if (new Set(scripts.map((s) => s.nom.toLocaleLowerCase("fr"))).size !== scripts.length) return refus("deux scripts portent le même nom");
  return { ok: true, scripts };
}

/** Texte d'un script tel qu'il est gardé : fins de ligne unifiées (un collage Windows ne compte pas comme une erreur). */
export const normaliserCodeScript = (code: string): string => code.replace(/\r\n?/g, "\n");

/** Identifiant d'un nouveau script, dérivé de son nom (minuscules, tirets), suffixé au besoin. */
export function idScript(nom: string, existants: readonly string[]): string {
  const base = nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/, "") || "script";
  let id = base;
  for (let n = 2; existants.includes(id); n++) id = `${base}-${n}`;
  return id;
}

// ————————————————————————————————————————————————————————————— Exemples fournis

export interface ExempleScript {
  readonly id: string;
  /** Nom français (langue source) ; l'interface le traduit par `planche.scripts.exemple.<id>`. */
  readonly nom: string;
  readonly code: string;
}

/** Exemples fournis avec l'extension : du code à lire et à modifier, jamais des données de projet. */
export const EXEMPLES_SCRIPTS: readonly ExempleScript[] = Object.freeze([
  {
    id: "rangee-poteaux",
    nom: "Rangée de poteaux",
    code: `// Rangée de poteaux : modifiez les mesures (en mètres), puis Exécuter.
const nombre = 6;
const entraxe = 1.2;
const section = 0.1;
const hauteur = 2.4;

const poteau = planche.grouper(planche.boite([0, 0, 0], section, section, hauteur), "Poteau");
planche.copier(poteau, [entraxe, 0, 0], nombre - 1);
planche.afficher(nombre + " poteaux, longueur totale " + ((nombre - 1) * entraxe + section) + " m");
`,
  },
  {
    id: "escalier-droit",
    nom: "Escalier droit",
    code: `// Escalier droit : une marche pleine par hauteur de marche (mesures en mètres).
const marches = 12;
const hauteurMarche = 0.17;
const giron = 0.28;
const largeur = 0.9;

for (let i = 0; i < marches; i++) {
  const marche = planche.boite([i * giron, 0, 0], giron, largeur, (i + 1) * hauteurMarche);
  planche.grouper(marche, "Marche " + (i + 1));
}
planche.afficher("Hauteur franchie : " + (marches * hauteurMarche).toFixed(2) + " m");
planche.afficher("Longueur au sol : " + (marches * giron).toFixed(2) + " m");
`,
  },
  {
    id: "aire-selection",
    nom: "Aire des faces sélectionnées",
    code: `// Aire totale des faces sélectionnées. Ce script ne modifie pas le dessin.
let total = 0;
let faces = 0;
for (const id of planche.selection()) {
  if (planche.genre(id) === "face") {
    total += planche.aire(id);
    faces++;
  }
}
planche.afficher(faces + " face(s) : " + total.toFixed(3) + " m²");
`,
  },
]);

// ————————————————————————————————————————————————————————————— Exécution

/**
 * Messages d'erreur, par clé. Le texte français sert de `message` ; l'interface traduit par la clé et ses arguments
 * (`planche.scripts.erreur.<clé>`). `execution` porte le message brut du moteur JavaScript ou d'une opération du modèle.
 */
export const MESSAGES_ERREUR_SCRIPT = {
  syntaxe: "Le script ne peut pas être lu : {texte}",
  execution: "{texte}",
  import: "« import » n'est pas disponible dans un script.",
  point: "{fonction} : point attendu sous la forme [x, y, z] en mètres (reçu {recu}).",
  nombre: "{fonction} : nombre attendu pour « {quoi} » (reçu {recu}).",
  positif: "{fonction} : « {quoi} » doit être strictement positif (reçu {recu}).",
  entier: "{fonction} : « {quoi} » doit être un entier de 1 à {max} (reçu {recu}).",
  identifiants: "{fonction} : identifiant ou liste d'identifiants attendus (reçu {recu}).",
  vide: "{fonction} : aucun élément donné.",
  introuvable: "{fonction} : « {id} » n'existe pas dans le contenu ouvert.",
  face: "{fonction} : « {id} » n'est pas une face.",
  arete: "{fonction} : « {id} » n'est pas une arête.",
  limite: "Script arrêté : plus de {max} opérations de dessin.",
  texte: "Script trop long : au plus {max} caractères.",
} as const;
export type CleErreurScript = keyof typeof MESSAGES_ERREUR_SCRIPT;
type Args = Readonly<Record<string, string>>;

export class ErreurScript extends Error {
  constructor(readonly cle: CleErreurScript, readonly args: Args = {}) {
    super(MESSAGES_ERREUR_SCRIPT[cle].replace(/\{(\w+)\}/g, (_, k: string) => args[k] ?? ""));
  }
}

export interface ErreurExecutionScript {
  readonly cle: CleErreurScript;
  readonly args: Args;
  /** Texte français de l'erreur (ou message brut du moteur). */
  readonly message: string;
  /** Ligne du script (à partir de 1) ; `null` si le moteur ne la donne pas (erreur de lecture, certains navigateurs). */
  readonly ligne: number | null;
}

export interface ResultatScript {
  /** Modèle obtenu ; en cas d'erreur, le modèle d'origine, à l'identique (rien n'est gardé d'un script interrompu). */
  readonly modele: Modele;
  /** Lignes écrites par `planche.afficher`. */
  readonly journal: readonly string[];
  /** Objets et éléments créés qui existent encore à la fin (pour la sélection). */
  readonly crees: readonly Id[];
  readonly erreur: ErreurExecutionScript | null;
}

export interface OptionsScript {
  /** Sélection courante, lue par `planche.selection()`. */
  readonly selection?: readonly Id[];
  /** Occurrence ouverte en édition ; absent = racine. */
  readonly dans?: Id;
  /**
   * Appelée une fois le script lu, juste avant de le lancer : le Worker y retire au script les moyens de lire d'autre
   * code (`Function`, `eval`), dont cette fonction-ci n'a plus besoin à ce moment.
   */
  readonly avantExecution?: () => void;
}

/** Bornes d'une exécution : opérations de dessin, lignes et longueur du journal, copies d'un appel. */
export const MAX_OPERATIONS_SCRIPT = 2000;
export const MAX_LIGNES_JOURNAL = 200;
export const MAX_LONGUEUR_LIGNE_JOURNAL = 500;
export const MAX_COPIES_SCRIPT = 500;

/** Fonctions de l'objet `planche`, dans l'ordre de l'aide du panneau (contrôlé par test contre l'objet réel). */
export const FONCTIONS_SCRIPT = [
  "ligne", "rectangle", "boite", "pousser", "deplacer", "copier", "tourner", "grouper", "composant", "effacer",
  "selection", "faces", "aretes", "objets", "genre", "aire", "longueur", "points", "nom", "afficher",
] as const;
export type FonctionScript = (typeof FONCTIONS_SCRIPT)[number];

const montrer = (v: unknown): string => {
  let s: string;
  try {
    s = typeof v === "string" ? `« ${v} »` : typeof v === "function" ? "une fonction" : v === undefined ? "rien" : (JSON.stringify(v) ?? String(v));
  } catch {
    s = String(v);
  }
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

/** Texte d'une valeur écrite au journal. */
function ecrire(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

/** Ligne du script dans une pile d'appels : première trame du code compilé par `Function` (Chromium, Firefox). */
function ligneDansPile(pile: string | undefined): number | null {
  const m = pile ? /(?:<anonymous>|> Function):(\d+):\d+/.exec(pile) : null;
  return m ? Number(m[1]) : null;
}

/** Décalage entre la ligne rapportée par le moteur et la ligne du script (en-tête ajouté par `Function`), mesuré une fois. */
let decalage: number | null = null;
function decalageLignes(): number {
  if (decalage !== null) return decalage;
  try {
    (new Function("planche", '"use strict";\nthrow new Error("x");') as (p: unknown) => void)(null);
    decalage = 0;
  } catch (e) {
    const l = ligneDansPile(e instanceof Error ? e.stack : undefined);
    decalage = l === null ? 0 : l - 2;
  }
  return decalage;
}

/**
 * Exécute `code` sur `modele`. Le script ne reçoit que l'objet `planche` ; chaque fonction de dessin est une opération du
 * modèle (les mêmes que les outils). Le modèle d'entrée n'est jamais modifié : au premier refus, il est rendu tel quel.
 */
export function executerScript(code: string, modele: Modele, options: OptionsScript = {}): ResultatScript {
  const journal: string[] = [];
  const echec = (cle: CleErreurScript, args: Args, message: string, ligne: number | null): ResultatScript => ({ modele, journal, crees: [], erreur: { cle, args, message, ligne } });
  const refus = (e: ErreurScript, ligne: number | null = null) => echec(e.cle, e.args, e.message, ligne);
  if (code.length > MAX_CODE_SCRIPT) return refus(new ErreurScript("texte", { max: String(MAX_CODE_SCRIPT) }));
  // `import(...)` chargerait du code d'ailleurs : refusé à la lecture (le Worker le bloque aussi par sa politique de contenu).
  if (/\bimport\b/.test(code.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ""))) return refus(new ErreurScript("import"));

  const dans = options.dans;
  const o = dans !== undefined ? { dans } : {};
  let m = modele;
  let operations = 0;
  const crees = new Set<Id>();
  const ctx = (): Contexte => contexte(m, dans);
  const existe = (c: Contexte, id: Id) => Boolean(c.faces[id] || c.aretes[id] || c.occurrences[id]);

  const nombre = (fonction: string, quoi: string, v: unknown): number => {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new ErreurScript("nombre", { fonction, quoi, recu: montrer(v) });
    return v;
  };
  const positif = (fonction: string, quoi: string, v: unknown): number => {
    const n = nombre(fonction, quoi, v);
    if (n <= 0) throw new ErreurScript("positif", { fonction, quoi, recu: montrer(v) });
    return n;
  };
  const point = (fonction: string, v: unknown): Vec3 => {
    if (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x))) return v3(v[0] as number, v[1] as number, v[2] as number);
    throw new ErreurScript("point", { fonction, recu: montrer(v) });
  };
  const ids = (fonction: string, v: unknown): Id[] => {
    const l = typeof v === "string" ? [v] : v;
    if (!Array.isArray(l) || !l.every((x) => typeof x === "string")) throw new ErreurScript("identifiants", { fonction, recu: montrer(v) });
    if (l.length === 0) throw new ErreurScript("vide", { fonction });
    const c = ctx();
    for (const id of l as Id[]) if (!existe(c, id)) throw new ErreurScript("introuvable", { fonction, id });
    return [...new Set(l as Id[])];
  };
  const un = (fonction: string, v: unknown, genre: "faces" | "aretes"): Id => {
    if (typeof v !== "string") throw new ErreurScript("identifiants", { fonction, recu: montrer(v) });
    const c = ctx();
    if (!existe(c, v)) throw new ErreurScript("introuvable", { fonction, id: v });
    if (!c[genre][v]) throw new ErreurScript(genre === "faces" ? "face" : "arete", { fonction, id: v });
    return v;
  };
  /** Applique une opération du modèle ; rend les éléments créés qui existent encore. */
  const operer = (r: { readonly modele: Modele; readonly rapport: Rapport }): Id[] => {
    if (++operations > MAX_OPERATIONS_SCRIPT) throw new ErreurScript("limite", { max: String(MAX_OPERATIONS_SCRIPT) });
    m = r.modele;
    const c = ctx();
    const nouveaux = r.rapport.crees.filter((id) => existe(c, id));
    for (const id of nouveaux) crees.add(id);
    return nouveaux;
  };
  const rectangle = (coin: Vec3, cote1: Vec3, cote2: Vec3): Id | null => {
    const nouveaux = operer(ajouterRectangle(m, coin, cote1, cote2, o));
    const c = ctx();
    return nouveaux.find((id) => c.faces[id]) ?? null;
  };

  const api: Record<FonctionScript, (...a: unknown[]) => unknown> = {
    ligne: (a, b) => operer(ajouterSegment(m, point("ligne", a), point("ligne", b), o)),
    rectangle: (coin, cote1, cote2) => rectangle(point("rectangle", coin), point("rectangle", cote1), point("rectangle", cote2)),
    boite: (coin, largeur, profondeur, hauteur) => {
      const p = point("boite", coin);
      const l = positif("boite", "largeur", largeur);
      const pr = positif("boite", "profondeur", profondeur);
      const h = positif("boite", "hauteur", hauteur);
      const avant = new Set([...Object.keys(ctx().faces), ...Object.keys(ctx().aretes)]);
      const base = rectangle(p, v3(l, 0, 0), v3(0, pr, 0));
      if (!base) return [];
      const normale = ctx().faces[base]?.normale;
      operer(pousserTirer(m, base, normale && normale.z < 0 ? -h : h, o));
      const c = ctx();
      return [...Object.keys(c.faces), ...Object.keys(c.aretes)].filter((id) => !avant.has(id));
    },
    pousser: (face, distance) => operer(pousserTirer(m, un("pousser", face, "faces"), nombre("pousser", "distance", distance), o)),
    deplacer: (elements, vecteur) => void operer(deplacer(m, ids("deplacer", elements), point("deplacer", vecteur), o)),
    copier: (elements, vecteur, combien = 1) => {
      if (typeof combien !== "number" || !Number.isInteger(combien) || combien < 1 || combien > MAX_COPIES_SCRIPT) throw new ErreurScript("entier", { fonction: "copier", quoi: "nombre", max: String(MAX_COPIES_SCRIPT), recu: montrer(combien) });
      return operer(copier(m, ids("copier", elements), point("copier", vecteur), { copies: combien }, o));
    },
    tourner: (elements, centre, axe, degres) => void operer(tourner(m, ids("tourner", elements), point("tourner", centre), point("tourner", axe), (nombre("tourner", "angle", degres) * Math.PI) / 180, o)),
    grouper: (elements, nom) => {
      const r = grouper(m, ids("grouper", elements), { ...o, genre: "groupe", ...(typeof nom === "string" && nom.trim() ? { nom: nom.trim().slice(0, 80) } : {}) });
      operer(r);
      crees.add(r.occurrence);
      return r.occurrence;
    },
    composant: (elements, nom) => {
      const r = grouper(m, ids("composant", elements), { ...o, genre: "composant", ...(typeof nom === "string" && nom.trim() ? { nom: nom.trim().slice(0, 80) } : {}) });
      operer(r);
      crees.add(r.occurrence);
      return r.occurrence;
    },
    effacer: (elements) => void operer(effacerEntites(m, ids("effacer", elements), o)),
    selection: () => {
      const c = ctx();
      return (options.selection ?? []).filter((id) => existe(c, id));
    },
    faces: () => Object.keys(ctx().faces),
    aretes: () => Object.keys(ctx().aretes),
    objets: () => Object.keys(ctx().occurrences),
    genre: (id) => {
      if (typeof id !== "string") return null;
      const c = ctx();
      return c.faces[id] ? "face" : c.aretes[id] ? "arete" : c.occurrences[id] ? "objet" : null;
    },
    aire: (face) => aire(m, un("aire", face, "faces"), o),
    longueur: (arete) => {
      const c = ctx();
      const a = c.aretes[un("longueur", arete, "aretes")];
      const p = a ? c.sommets[a.a]?.position : undefined;
      const q = a ? c.sommets[a.b]?.position : undefined;
      return p && q ? dist(p, q) : 0;
    },
    points: (element) => {
      const c = ctx();
      if (typeof element !== "string" || !(c.faces[element] || c.aretes[element])) throw new ErreurScript("introuvable", { fonction: "points", id: montrer(element) });
      const sommets = c.faces[element] ? c.faces[element].exterieur : [c.aretes[element]!.a, c.aretes[element]!.b];
      return sommets.map((s) => c.sommets[s]?.position).filter((p): p is Vec3 => p !== undefined).map((p) => [p.x, p.y, p.z]);
    },
    nom: (objet) => {
      const occ = typeof objet === "string" ? ctx().occurrences[objet] : undefined;
      if (!occ) throw new ErreurScript("introuvable", { fonction: "nom", id: montrer(objet) });
      return occ.nom ?? m.definitions[occ.definition]?.nom ?? "";
    },
    afficher: (...valeurs) => {
      if (journal.length < MAX_LIGNES_JOURNAL) journal.push(valeurs.map(ecrire).join(" ").slice(0, MAX_LONGUEUR_LIGNE_JOURNAL));
    },
  };

  let fn: (planche: unknown) => unknown;
  try {
    fn = new Function("planche", `"use strict";\n${code}`) as (planche: unknown) => unknown;
  } catch (e) {
    return echec("syntaxe", { texte: e instanceof Error ? e.message : String(e) }, MESSAGES_ERREUR_SCRIPT.syntaxe.replace("{texte}", e instanceof Error ? e.message : String(e)), null);
  }
  const base = decalageLignes();
  options.avantExecution?.();
  try {
    fn(Object.freeze(api));
  } catch (e) {
    const brut = ligneDansPile(e instanceof Error ? e.stack : undefined);
    const lignes = code.split("\n").length;
    const ligne = brut === null ? null : brut - base - 1;
    const sure = ligne !== null && ligne >= 1 && ligne <= lignes ? ligne : null;
    if (e instanceof ErreurScript) return refus(e, sure);
    const texte = e instanceof Error ? e.message : String(e);
    return echec("execution", { texte }, texte, sure);
  }
  const c = ctx();
  return { modele: m, journal, crees: [...crees].filter((id) => existe(c, id)), erreur: null };
}
