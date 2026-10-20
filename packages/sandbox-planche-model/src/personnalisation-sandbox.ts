/**
 * Personnalisation du Sandbox (lot 5, recommandation §2, décisions du maître d'ouvrage du 20 octobre 2026) : profils
 * Standard, Métier et Personnel, favoris, regroupements nommés et choix des outils de la barre gauche — même
 * fonctionnement que le catalogue du 01, sans son code. Les préférences sont enregistrées sur le serveur, par compte
 * (`/sandbox/preferences`) ; ce module en fixe la forme, les valeurs par défaut et la validation, la même pour le
 * navigateur et le serveur. Pur : ni React, ni DOM, ni base.
 *
 * Un identifiant d'entrée s'écrit `<nature>:<id>` (« outil:ligne », « commande:groupe ») : il est vérifié contre le
 * registre, jamais filtré en silence. Rien ici ne touche au dessin : seule la visibilité des outils dans les barres.
 */
import { BARRE_GAUCHE_SANDBOX, REGISTRE_SANDBOX, entreeSandbox, type NatureEntree } from "./registre-sandbox.js";

/** Profils : Standard (disposition par défaut, lot 4), Métier (listes fournies par Fadi), Personnel (barre choisie). */
export type ProfilSandbox = "standard" | "personnel" | `metier:${string}`;

export interface RegroupementSandbox {
  readonly id: string;
  readonly nom: string;
  /** Entrées du registre, `<nature>:<id>`. */
  readonly entrees: readonly string[];
}

export interface PreferencesSandbox {
  readonly profil: ProfilSandbox;
  /** Outils de la barre gauche du profil Personnel, dans l'ordre choisi (identifiants d'outil). */
  readonly barrePersonnelle: readonly string[];
  /** Entrées favorites (`<nature>:<id>`), dans l'ordre choisi. */
  readonly favoris: readonly string[];
  readonly regroupements: readonly RegroupementSandbox[];
}

/** Version du format des préférences, enregistrée avec chaque ligne. */
export const FORMAT_PREFERENCES_SANDBOX = "sandbox-preferences/1";
export const MAX_REGROUPEMENTS = 20;
export const MAX_NOM_REGROUPEMENT = 60;
export const MAX_ENTREES = 120;
export const MOTIF_ID_REGROUPEMENT = /^[a-z0-9-]{1,40}$/;

/** Préférences par défaut : profil Standard, aucun favori, aucun regroupement (« Réinitialiser » y ramène). */
export const PREFERENCES_SANDBOX_DEFAUT: PreferencesSandbox = Object.freeze({
  profil: "standard",
  barrePersonnelle: [],
  favoris: [],
  regroupements: [],
});

export interface ProfilMetier {
  readonly id: `metier:${string}`;
  /** Clé du libellé (le web la traduit) et libellé français de référence. */
  readonly libelle: string;
  readonly barre: readonly string[];
}

/**
 * Profils métier fournis par Fadi : une barre gauche orientée vers un usage, faite d'outils existants du registre. Ce
 * sont des choix d'affichage, pas des données de projet ; un profil inconnu se lit comme le profil Standard.
 */
export const PROFILS_METIER: readonly ProfilMetier[] = Object.freeze([
  {
    id: "metier:bois",
    libelle: "Bois et menuiserie",
    barre: ["selection", "gomme", "ligne", "rectangle", "pousser-tirer", "deplacer", "faire-pivoter", "profile", "profiles-aretes", "onglet", "coupe-profil", "allonger-piece", "aligner-face", "metre", "cotation", "orbite", "panoramique", "zoom-etendu"],
  },
  {
    id: "metier:volumes",
    libelle: "Volumes et solides",
    barre: ["selection", "gomme", "ligne", "rectangle", "cercle", "pousser-tirer", "suivez-moi", "decalage", "epaissir", "union", "soustraction", "intersection", "scinder", "metre", "plan-de-coupe", "orbite", "panoramique", "zoom-etendu"],
  },
]);

/** Barre gauche effective d'un jeu de préférences (identifiants d'outil, dans l'ordre affiché). */
export function barreGaucheSandbox(p: PreferencesSandbox): readonly string[] {
  if (p.profil === "personnel") return p.barrePersonnelle.length > 0 ? p.barrePersonnelle : BARRE_GAUCHE_SANDBOX;
  if (p.profil.startsWith("metier:")) return PROFILS_METIER.find((m) => m.id === p.profil)?.barre ?? BARRE_GAUCHE_SANDBOX;
  return BARRE_GAUCHE_SANDBOX;
}

/** Entrée du registre désignée par `<nature>:<id>`, ou `undefined`. */
export function entreeDeCle(cle: string): ReturnType<typeof entreeSandbox> {
  const i = cle.indexOf(":");
  if (i <= 0) return undefined;
  const nature = cle.slice(0, i) as NatureEntree;
  if (nature !== "outil" && nature !== "commande" && nature !== "panneau") return undefined;
  return entreeSandbox(nature, cle.slice(i + 1));
}

/** Clés de toutes les entrées qui peuvent être favorites ou regroupées : outils et commandes du registre. */
export const CLES_PERSONNALISABLES: readonly string[] = Object.freeze(REGISTRE_SANDBOX.filter((e) => e.nature !== "panneau" && !e.horsCatalogue).map((e) => `${e.nature}:${e.id}`));
const PERSONNALISABLES: ReadonlySet<string> = new Set(CLES_PERSONNALISABLES);
const OUTILS: ReadonlySet<string> = new Set(REGISTRE_SANDBOX.filter((e) => e.nature === "outil").map((e) => e.id));

export type ResultatValidation =
  | { readonly ok: true; readonly preferences: PreferencesSandbox }
  | { readonly ok: false; readonly erreur: "forme_invalide" | "entree_inconnue"; readonly detail: string; readonly inconnues?: readonly string[] };

const estListe = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const sansDoublon = (l: readonly string[]) => new Set(l).size === l.length;

/**
 * Valide un corps de préférences (navigateur ou serveur) : forme stricte, bornes, identifiants du registre. Une entrée
 * inconnue est un refus nommé (`entree_inconnue`), jamais un filtrage silencieux.
 */
export function validerPreferencesSandbox(corps: unknown): ResultatValidation {
  if (!corps || typeof corps !== "object" || Array.isArray(corps)) return { ok: false, erreur: "forme_invalide", detail: "objet attendu" };
  const c = corps as Record<string, unknown>;
  const cles = Object.keys(c).filter((k) => !["profil", "barrePersonnelle", "favoris", "regroupements"].includes(k));
  if (cles.length > 0) return { ok: false, erreur: "forme_invalide", detail: `champ inconnu : ${cles.join(", ")}` };
  const profil = c["profil"];
  if (typeof profil !== "string" || !(profil === "standard" || profil === "personnel" || /^metier:[a-z0-9-]{1,40}$/.test(profil))) {
    return { ok: false, erreur: "forme_invalide", detail: "profil : standard, personnel ou metier:<identifiant>" };
  }
  const barre = c["barrePersonnelle"];
  const favoris = c["favoris"];
  const regroupements = c["regroupements"];
  if (!estListe(barre) || barre.length > MAX_ENTREES || !sansDoublon(barre)) return { ok: false, erreur: "forme_invalide", detail: "barrePersonnelle : liste d'outils sans doublon" };
  if (!estListe(favoris) || favoris.length > MAX_ENTREES || !sansDoublon(favoris)) return { ok: false, erreur: "forme_invalide", detail: "favoris : liste d'entrées sans doublon" };
  if (!Array.isArray(regroupements) || regroupements.length > MAX_REGROUPEMENTS) return { ok: false, erreur: "forme_invalide", detail: `regroupements : au plus ${MAX_REGROUPEMENTS}` };
  const groupes: RegroupementSandbox[] = [];
  for (const g of regroupements) {
    if (!g || typeof g !== "object" || Array.isArray(g)) return { ok: false, erreur: "forme_invalide", detail: "regroupement : objet attendu" };
    const r = g as Record<string, unknown>;
    if (Object.keys(r).some((k) => !["id", "nom", "entrees"].includes(k))) return { ok: false, erreur: "forme_invalide", detail: "regroupement : champs id, nom, entrees" };
    const nom = typeof r["nom"] === "string" ? r["nom"].trim() : "";
    if (typeof r["id"] !== "string" || !MOTIF_ID_REGROUPEMENT.test(r["id"])) return { ok: false, erreur: "forme_invalide", detail: "regroupement : identifiant en minuscules, chiffres, tirets" };
    if (nom.length === 0 || nom.length > MAX_NOM_REGROUPEMENT) return { ok: false, erreur: "forme_invalide", detail: `regroupement : nom de 1 à ${MAX_NOM_REGROUPEMENT} caractères` };
    if (!estListe(r["entrees"]) || r["entrees"].length > MAX_ENTREES || !sansDoublon(r["entrees"])) return { ok: false, erreur: "forme_invalide", detail: "regroupement : entrées sans doublon" };
    groupes.push({ id: r["id"], nom, entrees: [...r["entrees"]] });
  }
  if (!sansDoublon(groupes.map((g) => g.id))) return { ok: false, erreur: "forme_invalide", detail: "regroupement cité deux fois" };
  if (!sansDoublon(groupes.map((g) => g.nom.toLocaleLowerCase("fr")))) return { ok: false, erreur: "forme_invalide", detail: "deux regroupements portent le même nom" };
  const inconnues = [
    ...barre.filter((id) => !OUTILS.has(id)).map((id) => `outil:${id}`),
    ...favoris.filter((k) => !PERSONNALISABLES.has(k)),
    ...groupes.flatMap((g) => g.entrees.filter((k) => !PERSONNALISABLES.has(k))),
  ];
  if (inconnues.length > 0) return { ok: false, erreur: "entree_inconnue", detail: "entrée absente du registre du Sandbox", inconnues: [...new Set(inconnues)] };
  return { ok: true, preferences: { profil: profil as ProfilSandbox, barrePersonnelle: [...barre], favoris: [...favoris], regroupements: groupes } };
}

/** Relecture tolérante (copie locale, ligne ancienne) : une valeur invalide donne les préférences par défaut. */
export function lirePreferencesSandbox(v: unknown): PreferencesSandbox {
  const r = validerPreferencesSandbox(v);
  return r.ok ? r.preferences : PREFERENCES_SANDBOX_DEFAUT;
}

/** Identifiant de regroupement libre, dérivé du nom (minuscules, tirets), suffixé au besoin. */
export function idRegroupement(nom: string, existants: readonly string[]): string {
  const base = nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "groupe";
  let id = base;
  for (let n = 2; existants.includes(id); n++) id = `${base}-${n}`;
  return id;
}
