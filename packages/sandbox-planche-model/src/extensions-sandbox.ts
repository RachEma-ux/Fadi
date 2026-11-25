/**
 * Extensions du Sandbox (« Add-ons » en anglais ; décisions du maître d'ouvrage du 25 novembre 2026) : un paquet de
 * fonctions fourni par Fadi — outils, commandes, panneaux du registre unique — que chaque compte active ou désactive
 * d'un clic dans la fenêtre « Extensions » du menu ☰. Rien à installer, aucun code tiers : une extension n'est qu'une
 * étiquette posée sur des entrées du registre (`REGISTRE_SANDBOX`), et le choix du compte voyage avec ses préférences
 * (`PreferencesSandbox.extensions`).
 *
 * Règles :
 * - une entrée appartient à une extension au plus ; une entrée sans extension est toujours offerte ;
 * - désactiver une extension ne touche jamais au dessin : seule la visibilité de ses outils, commandes et panneaux change ;
 * - le choix enregistré ne retient que ce que le compte a lui-même basculé : un compte qui n'a rien choisi suit le
 *   réglage d'origine (celui de la plateforme, `catalogue-extensions.ts`, sinon `activeParDefaut`), y compris pour une
 *   extension livrée plus tard ; un choix fait reste le sien quand le réglage d'origine change ;
 * - une extension inconnue est un refus nommé, jamais un filtrage silencieux (même règle que les préférences).
 *
 * Pur : ni React, ni DOM, ni base.
 */
import { REGISTRE_SANDBOX, entreeSandbox, type EntreeSandbox, type NatureEntree } from "./registre-sandbox.js";

export interface ExtensionSandbox {
  /** Identifiant stable (minuscules, chiffres, tirets). */
  readonly id: string;
  /** Version livrée (`majeur.mineur.correctif`), augmentée quand le contenu de l'extension change. */
  readonly version: string;
  /** Nom français de référence (le web le traduit par la clé `extension.<id>`). */
  readonly libelle: string;
  /** Une phrase : ce que l'extension apporte (clé `extension.<id>.description`). */
  readonly description: string;
  /** Entrée du registre dont la carte reprend le pictogramme (`<nature>:<id>`), choisie parmi `entrees`. */
  readonly pictogramme: string;
  /**
   * Active tant que le compte n'a rien choisi. Les extensions faites d'outils déjà livrés le sont, pour que personne
   * ne perde un outil le jour où elles apparaissent.
   */
  readonly activeParDefaut: boolean;
  /** Entrées du registre apportées par l'extension, `<nature>:<id>`. */
  readonly entrees: readonly string[];
}

export const MOTIF_ID_EXTENSION = /^[a-z0-9-]{1,40}$/;
export const MOTIF_VERSION_EXTENSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

/**
 * Extensions livrées. Les deux premières regroupent des outils existants (décision du 25 novembre 2026) : elles
 * prouvent le système sans fonction nouvelle et restent actives par défaut.
 */
export const EXTENSIONS_SANDBOX: readonly ExtensionSandbox[] = Object.freeze([
  {
    id: "bois",
    version: "1.0.0",
    libelle: "Bois et menuiserie",
    description: "Profilés, onglets, coupes par profil et liste de débit.",
    pictogramme: "outil:profile",
    activeParDefaut: true,
    entrees: [
      "outil:profile", "outil:profiles-aretes", "outil:onglet", "outil:coupe-profil", "outil:allonger-piece", "outil:aligner-face",
      "commande:liste-debit", "commande:renumeroter", "commande:etiquettes", "commande:effacer-etiquettes", "commande:exporter-debit",
      "panneau:debit",
    ],
  },
  {
    id: "volumes",
    version: "1.0.0",
    libelle: "Volumes et solides",
    description: "Union, soustraction, intersection, scinder, épaissir.",
    pictogramme: "outil:enveloppe-exterieure",
    activeParDefaut: true,
    entrees: ["outil:enveloppe-exterieure", "outil:intersection", "outil:union", "outil:soustraction", "outil:ajuster", "outil:scinder", "outil:epaissir"],
  },
  {
    // Première extension nouvelle : à activer (elle ajoute un panneau à la colonne), contrairement aux regroupements.
    id: "controle",
    version: "1.0.0",
    libelle: "Contrôle et nettoyage",
    description: "Relevé des objets vides, matières et balises inutilisées, arêtes isolées, solides ouverts ; nettoyage sur commande.",
    pictogramme: "commande:controler",
    activeParDefaut: false,
    entrees: ["commande:controler", "commande:nettoyer", "panneau:controle"],
  },
  {
    // D'après les Dynamic Components de SketchUp : paramètres, options et règles par formules, sans code.
    id: "dynamiques",
    version: "1.0.0",
    libelle: "Composants dynamiques",
    description: "Composants paramétrés : options à choisir, tailles, positions et répétitions calculées par formules.",
    pictogramme: "commande:composant-dynamique",
    activeParDefaut: false,
    entrees: ["commande:composant-dynamique", "commande:redessiner-composant", "panneau:dynamique"],
  },
  {
    // D'après Add Location et Solar North de SketchUp, fusionnés (décision du 25 novembre 2026).
    id: "emplacement",
    version: "1.0.0",
    libelle: "Emplacement",
    description: "Position saisie de la Planche (latitude, longitude, altitude) et nord vrai ; les ombres les suivent.",
    pictogramme: "commande:emplacement",
    activeParDefaut: false,
    entrees: ["commande:emplacement", "commande:nord-arete", "commande:afficher-nord", "panneau:emplacement"],
  },
]);

/** Extension par identifiant, ou `undefined`. */
export const extensionSandbox = (id: string): ExtensionSandbox | undefined => EXTENSIONS_SANDBOX.find((x) => x.id === id);

const cleDe = (e: Pick<EntreeSandbox, "nature" | "id">): string => `${e.nature}:${e.id}`;
const PAR_CLE: ReadonlyMap<string, ExtensionSandbox> = new Map(EXTENSIONS_SANDBOX.flatMap((x) => x.entrees.map((cle) => [cle, x] as const)));

/** Extension à laquelle appartient une entrée du registre (`<nature>:<id>`), ou `undefined` : entrée de base. */
export const extensionDeCle = (cle: string): ExtensionSandbox | undefined => PAR_CLE.get(cle);
/** Extension d'une entrée désignée par sa nature et son identifiant. */
export const extensionDe = (nature: NatureEntree, id: string): ExtensionSandbox | undefined => PAR_CLE.get(`${nature}:${id}`);

/**
 * Choix d'un compte : ce qu'il a basculé lui-même (`true` activée, `false` désactivée) ; une extension absente suit le
 * réglage d'origine.
 */
export type ChoixExtensions = Readonly<Record<string, boolean>>;

/** Une extension est-elle active pour ce choix ? Une extension inconnue ne l'est jamais. */
export function extensionActive(id: string, choix: ChoixExtensions): boolean {
  const x = extensionSandbox(id);
  if (!x) return false;
  return choix[id] ?? x.activeParDefaut;
}

/** Extensions actives, dans l'ordre de la liste. */
export const extensionsActives = (choix: ChoixExtensions): readonly ExtensionSandbox[] => EXTENSIONS_SANDBOX.filter((x) => extensionActive(x.id, choix));

/** Clés (`<nature>:<id>`) des entrées retirées de l'interface : celles des extensions inactives. */
export function clesMasquees(choix: ChoixExtensions): ReadonlySet<string> {
  return new Set(EXTENSIONS_SANDBOX.filter((x) => !extensionActive(x.id, choix)).flatMap((x) => x.entrees));
}

/** Une entrée du registre est-elle offerte pour ce choix ? (Entrée de base : toujours.) */
export function entreeOfferte(nature: NatureEntree, id: string, choix: ChoixExtensions): boolean {
  const x = extensionDe(nature, id);
  return !x || extensionActive(x.id, choix);
}

/**
 * Choix après bascule d'une extension : le geste est retenu tel quel, même s'il rejoint le réglage d'origine — ce
 * réglage peut changer (plateforme), le choix du compte ne doit pas changer avec lui.
 */
export function basculerExtension(choix: ChoixExtensions, id: string, active: boolean): ChoixExtensions {
  if (!extensionSandbox(id)) return choix;
  return { ...choix, [id]: active };
}

/** Décompte d'une extension par nature, pour sa carte (« 6 outils · 5 commandes · 1 panneau »). */
export function contenuExtension(x: ExtensionSandbox): Readonly<Record<NatureEntree, number>> {
  const n = { outil: 0, commande: 0, panneau: 0 };
  for (const cle of x.entrees) n[cle.slice(0, cle.indexOf(":")) as NatureEntree]++;
  return n;
}

export type ResultatChoixExtensions =
  | { readonly ok: true; readonly choix: ChoixExtensions }
  | { readonly ok: false; readonly erreur: "forme_invalide" | "extension_inconnue"; readonly detail: string; readonly inconnues?: readonly string[] };

/** Valide un choix d'extensions reçu (navigateur ou serveur) : objet `{ <id>: booléen }`, identifiants connus. */
export function validerChoixExtensions(v: unknown): ResultatChoixExtensions {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, erreur: "forme_invalide", detail: "extensions : objet { identifiant: booléen }" };
  const entrees = Object.entries(v as Record<string, unknown>);
  if (entrees.some(([, actif]) => typeof actif !== "boolean")) return { ok: false, erreur: "forme_invalide", detail: "extensions : valeur booléenne attendue" };
  const inconnues = entrees.map(([id]) => id).filter((id) => !extensionSandbox(id));
  if (inconnues.length > 0) return { ok: false, erreur: "extension_inconnue", detail: "extension absente de la liste du Sandbox", inconnues: inconnues.map((id) => `extension:${id}`) };
  return { ok: true, choix: Object.fromEntries(entrees) as Record<string, boolean> };
}

/**
 * Cohérence de la liste avec le registre (contrôlée par test) : identifiants bien formés et uniques, entrées présentes
 * au registre, aucune entrée dans deux extensions, pictogramme pris parmi les entrées. Renvoie les défauts trouvés.
 */
export function defautsExtensions(liste: readonly ExtensionSandbox[] = EXTENSIONS_SANDBOX): readonly string[] {
  const defauts: string[] = [];
  const vues = new Map<string, string>();
  const ids = new Set<string>();
  for (const x of liste) {
    if (!MOTIF_ID_EXTENSION.test(x.id)) defauts.push(`${x.id} : identifiant mal formé`);
    if (ids.has(x.id)) defauts.push(`${x.id} : identifiant cité deux fois`);
    if (!MOTIF_VERSION_EXTENSION.test(x.version)) defauts.push(`${x.id} : version mal formée`);
    ids.add(x.id);
    if (x.entrees.length === 0) defauts.push(`${x.id} : aucune entrée`);
    if (!x.entrees.includes(x.pictogramme)) defauts.push(`${x.id} : pictogramme hors de ses entrées`);
    for (const cle of x.entrees) {
      const i = cle.indexOf(":");
      const nature = cle.slice(0, i) as NatureEntree;
      if (i <= 0 || !entreeSandbox(nature, cle.slice(i + 1))) defauts.push(`${x.id} : entrée « ${cle} » absente du registre`);
      const autre = vues.get(cle);
      if (autre) defauts.push(`${x.id} : entrée « ${cle} » déjà dans « ${autre} »`);
      vues.set(cle, x.id);
    }
  }
  return defauts;
}

/** Entrées du registre offertes pour un choix, dans l'ordre du registre. */
export const entreesOffertes = (choix: ChoixExtensions): readonly EntreeSandbox[] => {
  const masquees = clesMasquees(choix);
  return REGISTRE_SANDBOX.filter((e) => !masquees.has(cleDe(e)));
};
