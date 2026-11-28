/**
 * Barres d'outils nommées de la Planche du Sandbox (décision du maître d'ouvrage du 25 novembre 2026, proposition A de
 * la revue des barres) : la liste « Outils » ne déplie plus la même barre sous chaque outil. Chaque barre est un objet
 * nommé, montré une seule fois dans la section « Barres d'outils » :
 * - les barres **livrées** : « Premiers pas » (jeu de départ) et une barre par objet de `barres-outils.ts` (Sélection,
 *   Arêtes, Surfaces, Volumes, Solides, Matière, Guides, Annotations, Caméra), avec leurs sections ① ② ③ ;
 * - les barres **personnelles** (« Mes barres ») : les regroupements nommés du compte (`PreferencesSandbox`), composés
 *   d'outils et de commandes dans l'ordre choisi.
 *
 * Ce module fixe aussi le groupe de chaque commande dans la liste : « Objets et arêtes » est scindé en « Groupe »,
 * « Repères » et « Bois » ; Zoom avant et Zoom arrière rejoignent « Caméra ». Pur : ni DOM, ni React.
 */
import { REGISTRE_SANDBOX, entreeSandbox, extensionDeCle, type FamilleOutil, type Outil, type RegroupementSandbox } from "@parcours/sandbox-planche-model";
import type { CleMessage } from "../messages";
import { BARRES, OBJET_DE, SECTIONS, type CleSection, type ObjetBarre } from "./barres-outils";
import type { EtatBarresOutils } from "./barres-outils-disposition";

/** Identifiant d'une barre : `premiers-pas`, `objet:<objet>` (barre livrée) ou `groupe:<id>` (barre personnelle). */
export type IdBarre = string;
export const ID_PREMIERS_PAS = "premiers-pas";
export const idBarreObjet = (o: ObjetBarre): IdBarre => `objet:${o}`;
export const idBarreGroupe = (id: string): IdBarre => `groupe:${id}`;

/** Ordre des barres livrées dans la section « Barres d'outils ». */
export const OBJETS_BARRES: readonly ObjetBarre[] = ["selection", "aretes", "surfaces", "volumes", "solides", "matiere", "guides", "annotations", "camera"];

/** Nom de chaque barre livrée (catalogue de messages, français et anglais). */
export const NOM_BARRE: Readonly<Record<ObjetBarre, CleMessage>> = {
  selection: "outils.barre.nom.selection",
  aretes: "outils.barre.nom.aretes",
  surfaces: "outils.barre.nom.surfaces",
  volumes: "outils.barre.nom.volumes",
  solides: "outils.barre.nom.solides",
  matiere: "outils.barre.nom.matiere",
  guides: "outils.barre.nom.guides",
  annotations: "outils.barre.nom.annotations",
  camera: "outils.barre.nom.camera",
};

/**
 * Barre « Premiers pas » : douze outils du catalogue, en quatre paquets séparés (sélectionner ; tracer ; modifier ;
 * mesurer et regarder). Aucun outil d'extension : la barre est la même pour tous les comptes.
 */
export const PREMIERS_PAS: readonly (readonly string[])[] = [
  ["selection"],
  ["ligne", "rectangle", "arc-2-points"],
  ["pousser-tirer", "decalage", "deplacer", "gomme"],
  ["metre", "cotation", "plan-de-coupe", "orbite"],
];

/** Section d'une barre nommée : clés d'entrées du registre (`outil:<id>`, `commande:<id>`), dans l'ordre affiché. */
export interface SectionNommee {
  readonly cle: string;
  /** Section ① ② ③ d'une barre d'objet ; absente pour un simple paquet séparé. */
  readonly section?: CleSection;
  readonly entrees: readonly string[];
}

export interface BarreNommee {
  readonly id: IdBarre;
  /** `extension` : barre d'une extension installée sur la plateforme, à son nom (protocole des extensions, lot 3). */
  readonly origine: "livree" | "personnelle" | "extension";
  /** Barre livrée : clé du nom au catalogue de messages. */
  readonly nomCle?: CleMessage;
  /** Barre personnelle : nom saisi par l'utilisateur. */
  readonly nom?: string;
  /** Barre personnelle : identifiant du regroupement du compte. */
  readonly groupe?: string;
  readonly sections: readonly SectionNommee[];
}

const offert = (cle: string, masquees: ReadonlySet<string>): boolean => !masquees.has(cle);

/** Barres livrées, « Premiers pas » en tête ; les entrées d'une extension désactivée sont retirées, une barre vide aussi. */
export function barresLivrees(masquees: ReadonlySet<string> = new Set()): BarreNommee[] {
  const premiers: BarreNommee = {
    id: ID_PREMIERS_PAS,
    origine: "livree",
    nomCle: "outils.barre.nom.premiers-pas",
    sections: PREMIERS_PAS.map((p, i) => ({ cle: `paquet-${i + 1}`, entrees: p.map((id) => `outil:${id}`).filter((c) => offert(c, masquees)) })).filter((s) => s.entrees.length > 0),
  };
  const objets = OBJETS_BARRES.map((o): BarreNommee => ({
    id: idBarreObjet(o),
    origine: "livree",
    nomCle: NOM_BARRE[o],
    sections: SECTIONS.map((s) => ({ cle: s.cle, section: s.cle, entrees: BARRES[o][s.cle].map((id) => `outil:${id}`).filter((c) => offert(c, masquees)) })),
  }))
    // Une barre dont aucun outil propre n'est offert (Solides sans l'extension « Volumes ») n'est pas proposée.
    .filter((b) => Object.entries(OBJET_DE).some(([outil, objet]) => idBarreObjet(objet) === b.id && offert(`outil:${outil}`, masquees)));
  return [premiers, ...objets];
}

/** Barres personnelles : un regroupement du compte = une barre, dans l'ordre de ses entrées. */
export function barresPersonnelles(regroupements: readonly RegroupementSandbox[], masquees: ReadonlySet<string> = new Set()): BarreNommee[] {
  return regroupements.map((g) => ({
    id: idBarreGroupe(g.id),
    origine: "personnelle",
    nom: g.nom,
    groupe: g.id,
    sections: [{ cle: "entrees", entrees: g.entrees.filter((c) => offert(c, masquees)) }],
  }));
}

/** Toutes les entrées d'une barre, à plat, dans l'ordre affiché. */
export const entreesDe = (b: BarreNommee): string[] => b.sections.flatMap((s) => s.entrees);

/** Barre livrée où un outil est rangé (son objet) : c'est l'étiquette de sa ligne dans la liste. */
export function barreDeLOutil(outil: string): IdBarre | null {
  const o = OBJET_DE[outil];
  return o ? idBarreObjet(o) : null;
}

/**
 * Identifiant de barre d'un état mémorisé : avant le 25 novembre 2026, l'état retenait l'identifiant d'un OUTIL (la
 * barre de son objet) ; il devient l'identifiant de cette barre. Un identifiant de barre est rendu tel quel.
 */
export function idBarreCanonique(id: string): IdBarre {
  if (id === ID_PREMIERS_PAS || id.startsWith("objet:") || id.startsWith("groupe:") || id.startsWith("extension:")) return id;
  return barreDeLOutil(id) ?? id;
}

/** État des barres ramené aux identifiants de barre (sans doublon) ; rend le même objet quand rien ne change. */
export function normaliserBarres(e: EtatBarresOutils): EtatBarresOutils {
  const visibles = [...new Set(e.visibles.map(idBarreCanonique))];
  const positions: EtatBarresOutils["positions"] = {};
  for (const [id, p] of Object.entries(e.positions)) {
    const c = idBarreCanonique(id);
    if (!(c in positions)) positions[c] = p;
  }
  const inchange = visibles.length === e.visibles.length && visibles.every((v, i) => v === e.visibles[i]) && Object.keys(positions).length === Object.keys(e.positions).length && Object.keys(positions).every((k) => k in e.positions);
  return inchange ? e : { visibles, positions };
}

/**
 * Groupes de commandes de la liste « Outils » (anciennement « Objets et arêtes ») ; `camera` rejoint la famille Caméra ;
 * `extensions` (après « Bois ») réunit les commandes des extensions autres que « Bois et menuiserie ».
 */
export type GroupeCommande = "groupe" | "reperes" | "bois" | "extensions" | "camera";
export const GROUPES_COMMANDES: readonly { id: Exclude<GroupeCommande, "camera" | "extensions">; cle: CleMessage }[] = [
  { id: "groupe", cle: "outils.famille.groupe" },
  { id: "reperes", cle: "outils.famille.reperes" },
  { id: "bois", cle: "outils.famille.bois" },
];
/** Famille d'outils où s'affichent les commandes du groupe `camera`. */
export const FAMILLE_DES_COMMANDES_CAMERA: FamilleOutil = "camera";
/** Extension dont les commandes ont déjà leur groupe (« Bois ») : elles ne vont pas dans « Extensions ». */
export const EXTENSION_DU_GROUPE_BOIS = "bois";

/** Extension (identifiant) dont une commande est rangée dans le groupe « Extensions », sinon `null`. */
export function extensionDeLaCommande(id: string): string | null {
  const x = extensionDeCle(`commande:${id}`);
  return x && x.id !== EXTENSION_DU_GROUPE_BOIS ? x.id : null;
}

/**
 * Groupe d'une commande dans la liste : commande d'une extension (hors « Bois et menuiserie ») → « Extensions » ; sinon
 * d'après sa famille au registre : repères → « Repères » ; débit et pièce → « Bois » ; Zoom avant / Zoom arrière →
 * « Caméra » ; tout le reste (objets, contexte d'édition, liens, Navigateur, Isoler, Masquer le reste) → « Groupe ».
 */
export function groupeDeCommande(id: string): GroupeCommande {
  if (id === "zoom-plus" || id === "zoom-moins") return "camera";
  if (extensionDeLaCommande(id)) return "extensions";
  const famille = entreeSandbox("commande", id)?.famille;
  if (famille === "repere" || famille === "emplacement" || famille === "niveau" || famille === "local" || famille === "mur" || famille === "plan" || famille === "feuille" || famille === "reserve" || famille === "enveloppe" || famille === "consultation" || famille === "fond" || famille === "reference" || famille === "pdf" || famille === "dxf" || famille === "travaux" || famille === "ifc") return "reperes";
  if (famille === "debit" || famille === "piece") return "bois";
  return "groupe";
}

/** Commandes du registre (identifiants), pour les contrôles : chacune a un groupe dans la liste. */
export const COMMANDES_DU_REGISTRE: readonly string[] = REGISTRE_SANDBOX.filter((e) => e.nature === "commande").map((e) => e.id);

/** Nom d'une copie de barre : « <nom> (copie) », puis « (copie 2) »… sans doublon, dans la limite de longueur. */
export function nomDeCopie(nom: string, pris: readonly string[], max: number): string {
  const existants = new Set(pris.map((n) => n.toLocaleLowerCase("fr")));
  for (let i = 1; i < 100; i++) {
    const suffixe = i === 1 ? " (copie)" : ` (copie ${i})`;
    const candidat = `${nom.slice(0, Math.max(1, max - suffixe.length))}${suffixe}`;
    if (!existants.has(candidat.toLocaleLowerCase("fr"))) return candidat;
  }
  return nom.slice(0, max);
}

/** Déplace une entrée d'un cran dans une liste (−1 vers le début, +1 vers la fin) ; hors bornes, la liste est rendue telle quelle. */
export function deplacerEntree(entrees: readonly string[], cle: string, sens: -1 | 1): string[] {
  const i = entrees.indexOf(cle);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= entrees.length) return [...entrees];
  const n = [...entrees];
  [n[i], n[j]] = [n[j]!, n[i]!];
  return n;
}

/** Outil d'une clé d'entrée `outil:<id>` parmi les outils offerts, sinon `null`. */
export function outilDeCle(cle: string, offerts: readonly Outil[]): Outil | null {
  if (!cle.startsWith("outil:")) return null;
  const id = cle.slice(6);
  return offerts.find((o) => o.id === id) ?? null;
}
