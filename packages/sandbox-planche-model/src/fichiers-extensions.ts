/**
 * Fichiers ouverts ou enregistrés à la demande d'une extension (protocole 1.0, lot 7, permission « fichiers »). Pur :
 * la Planche montre la fenêtre et laisse l'utilisateur choisir ; ce module juge la forme de la demande et de ce qui
 * revient.
 *
 *   fichiers.ouvrir       { types?: [".csv", …] }   rend { nom, texte }, ou `null` si l'utilisateur renonce
 *   fichiers.enregistrer  { nom, texte }             rend `true`, ou `false` si l'utilisateur renonce
 *
 * Règles : l'extension ne nomme jamais un chemin et ne lit aucun fichier d'elle-même — elle reçoit le seul fichier que
 * l'utilisateur vient de choisir, et n'écrit que le fichier qu'il accepte d'enregistrer. Texte seulement (UTF-8), d'une
 * taille bornée ; types de fichier pris dans une liste fermée, sans page ni programme.
 *
 * Protocole 1.1 — fichiers lourds (un plan DXF réel dépasse souvent 1 000 000 caractères) :
 *   fichiers.ouvrir     { types?, flux: true }    rend { nom, taille, jeton } : le texte reste dans la Planche
 *   fichiers.lire       { jeton, debut, longueur? } rend un morceau du texte (500 000 caractères au plus)
 *   fichiers.preparer   {}                        rend un jeton d'écriture
 *   fichiers.ajouter    { jeton, texte }          ajoute un morceau au fichier préparé
 *   fichiers.enregistrer { nom, jeton }           propose d'enregistrer le fichier préparé
 * Un jeton ne vaut que pendant la commande qui l'a obtenu ; la Planche oublie le texte à la fin de la commande.
 * Fichier en flux : 50 000 000 caractères au plus. Le type .svg est admis (plan masse en image vectorielle).
 *
 * Protocole 1.2 — archivage en base (règle « interface ≠ base de données », décision du maître d'ouvrage du
 * 27 novembre 2026) : un fichier de données (table de règles, bibliothèque de types) est archivé tel quel en base.
 *   fichiers.ouvrir     { types?, archiver: true } rend { nom, texte, archive } : `archive` = { id, empreinte, ajouteLe }
 *                                                  du fichier rangé tel quel en base (empreinte SHA-256), ou `null` avec
 *                                                  `archiveRefus` si la Planche n'a pas pu l'archiver : un code pris dans
 *                                                  MOTIFS_REFUS_ARCHIVE, que l'extension traduit dans sa langue.
 * La Planche archive elle-même le texte choisi par l'utilisateur ; l'extension ne parle jamais au serveur. Pas en flux :
 * un fichier archivé tient en 200 000 caractères.
 */

/** Types de fichier texte admis, à l'ouverture comme à l'enregistrement. */
export const TYPES_FICHIER_EXTENSION = [".txt", ".csv", ".tsv", ".json", ".md", ".xml", ".obj", ".mtl", ".dxf", ".stl", ".ply", ".svg"] as const;
export type TypeFichierExtension = (typeof TYPES_FICHIER_EXTENSION)[number];
/**
 * `caracteres` : fichier rendu d'un coup (1.0) ; `flux` : fichier lu ou écrit par morceaux (1.1) ; `morceau` : un
 * morceau ; `jetons` : fichiers en flux tenus à la fois par une commande.
 */
export const BORNES_FICHIER = { caracteres: 1_000_000, nom: 80, flux: 50_000_000, morceau: 500_000, jetons: 4, archive: 200_000 } as const;

export interface DemandeOuverture {
  /** Types proposés à l'utilisateur ; jamais vide. */
  readonly types: readonly TypeFichierExtension[];
  /** (1.1) Lecture en flux : le texte reste dans la Planche, l'extension le lit par morceaux. */
  readonly flux?: boolean;
  /** (1.2) Archiver le fichier tel quel en base avant de le rendre. */
  readonly archiver?: boolean;
}
export interface DemandeEnregistrement {
  readonly nom: string;
  readonly texte: string;
}
export interface FichierLu {
  readonly nom: string;
  readonly texte: string;
}
/** (1.2) Fichier rangé tel quel en base : identifiant, empreinte SHA-256 (hexadécimale), date d'archivage (ISO). */
export interface ArchiveFichier {
  readonly id: string;
  readonly empreinte: string;
  readonly ajouteLe: string;
}
/**
 * (1.2) Motifs d'un archivage refusé : des codes stables, jamais une phrase (l'extension les traduit, FR / EN).
 * indisponible : la Planche n'archive pas (aucun serveur) ; impossible : échec sans autre précision ; reseau : serveur
 * injoignable ; connexion : compte non connecté ; extension_inconnue : extension non installée par ce compte ;
 * trop_lourd : fichier au-delà des bornes ; serveur : autre refus du serveur ; illisible : réponse du serveur illisible.
 */
export const MOTIFS_REFUS_ARCHIVE = ["indisponible", "impossible", "reseau", "connexion", "extension_inconnue", "trop_lourd", "serveur", "illisible"] as const;
export type MotifRefusArchive = (typeof MOTIFS_REFUS_ARCHIVE)[number];
/** (1.2) Ce que la Planche obtient en archivant : l'archive, ou le code du refus. */
export type IssueArchive = { readonly ok: true; readonly archive: ArchiveFichier } | { readonly ok: false; readonly motif: MotifRefusArchive };
/** (1.2) Fichier rendu à l'extension quand elle a demandé l'archivage. */
export interface FichierArchive extends FichierLu {
  readonly archive: ArchiveFichier | null;
  readonly archiveRefus?: MotifRefusArchive;
}
export type LectureFichier<T> = { readonly ok: true; readonly demande: T } | { readonly ok: false; readonly detail: string };

const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const estType = (v: unknown): v is TypeFichierExtension => typeof v === "string" && (TYPES_FICHIER_EXTENSION as readonly string[]).includes(v);
const LISTE = TYPES_FICHIER_EXTENSION.join(", ");

/** Type d'un nom de fichier (son extension, en minuscules), s'il est admis. */
export function typeDeFichier(nom: string): TypeFichierExtension | null {
  const point = nom.lastIndexOf(".");
  const type = point > 0 ? nom.slice(point).toLowerCase() : "";
  return estType(type) ? type : null;
}

/** Nom de fichier simple : ni chemin, ni caractère de commande, ni point en tête ; type admis. */
export function estNomDeFichier(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0 || v.length > BORNES_FICHIER.nom || v !== v.trim()) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\\/:*?"<>|\u0000-\u001f\u007f]/.test(v) || v.startsWith(".")) return false;
  return typeDeFichier(v) !== null;
}

/** « fichiers.ouvrir » : sans `types`, tous les types admis sont proposés. */
export function lireDemandeOuverture(v: unknown): LectureFichier<DemandeOuverture> {
  const types = estObjet(v) ? v["types"] : undefined;
  const flux = estObjet(v) ? (v["flux"] ?? false) : false;
  if (typeof flux !== "boolean") return { ok: false, detail: "flux : vrai ou faux" };
  const archiver = estObjet(v) ? (v["archiver"] ?? false) : false;
  if (typeof archiver !== "boolean") return { ok: false, detail: "archiver : vrai ou faux" };
  if (flux && archiver) return { ok: false, detail: `archiver : pas en flux (un fichier archivé tient en ${BORNES_FICHIER.archive} caractères)` };
  const f = flux ? { flux: true } : archiver ? { archiver: true } : {};
  if (types === undefined || types === null) return { ok: true, demande: { types: TYPES_FICHIER_EXTENSION, ...f } };
  if (!Array.isArray(types) || types.length === 0 || types.length > TYPES_FICHIER_EXTENSION.length || !types.every(estType) || new Set(types).size !== types.length) return { ok: false, detail: `types : liste sans doublon prise parmi ${LISTE}` };
  return { ok: true, demande: { types: types as TypeFichierExtension[], ...f } };
}

/**
 * « fichiers.enregistrer » : un nom simple d'un type admis, et un texte borné ou (1.1) le jeton d'un fichier préparé
 * par morceaux, dont `texteDe` rend le texte.
 */
export function lireDemandeEnregistrement(v: unknown, texteDe: (jeton: number) => string | null = () => null): LectureFichier<DemandeEnregistrement> {
  if (!estObjet(v)) return { ok: false, detail: "nom et texte attendus" };
  const { nom, texte, jeton } = v;
  if (!estNomDeFichier(nom)) return { ok: false, detail: `nom : nom de fichier simple de ${BORNES_FICHIER.nom} caractères au plus, d'un type parmi ${LISTE}` };
  if (jeton !== undefined) {
    if (texte !== undefined) return { ok: false, detail: "texte ou jeton, pas les deux" };
    const t = typeof jeton === "number" ? texteDe(jeton) : null;
    if (t === null) return { ok: false, detail: "jeton : fichier préparé par « fichiers.preparer » pendant cette commande attendu" };
    return { ok: true, demande: { nom, texte: t } };
  }
  if (typeof texte !== "string" || texte.length > BORNES_FICHIER.caracteres) return { ok: false, detail: `texte : ${BORNES_FICHIER.caracteres} caractères au plus (au-delà : « fichiers.preparer » puis « fichiers.ajouter »)` };
  return { ok: true, demande: { nom, texte } };
}

/**
 * Relit le fichier choisi par l'utilisateur avant de le rendre à l'extension : il doit être d'un type demandé et tenir
 * dans les bornes. `null` = l'utilisateur a renoncé.
 */
export function lireFichierChoisi(v: unknown, demande: DemandeOuverture): { readonly ok: true; readonly fichier: FichierLu | null } | { readonly ok: false; readonly detail: string } {
  if (v === null || v === undefined) return { ok: true, fichier: null };
  if (!estObjet(v) || typeof v["nom"] !== "string" || typeof v["texte"] !== "string") return { ok: false, detail: "fichier illisible" };
  const type = typeDeFichier(v["nom"]);
  if (!type || !demande.types.includes(type)) return { ok: false, detail: `fichier d'un autre type que ${demande.types.join(", ")}` };
  const max = demande.flux ? BORNES_FICHIER.flux : demande.archiver ? BORNES_FICHIER.archive : BORNES_FICHIER.caracteres;
  if (v["texte"].length > max) return { ok: false, detail: `fichier de plus de ${max} caractères${demande.flux || demande.archiver ? "" : " (au-delà : ouverture en flux)"}` };
  // Le nom rendu est le nom seul, jamais un chemin.
  const nom = v["nom"].split(/[\\/]/).pop()!.slice(-BORNES_FICHIER.nom);
  return { ok: true, fichier: { nom, texte: v["texte"] } };
}

/** (1.2) Empreinte SHA-256 en hexadécimal : 64 caractères. */
const MOTIF_EMPREINTE = /^[0-9a-f]{64}$/;
/** (1.2) Relit une archive rendue par le serveur avant de la remettre à l'extension ; `null` si sa forme est fausse. */
export function lireArchiveFichier(v: unknown): ArchiveFichier | null {
  if (!estObjet(v)) return null;
  const { id, empreinte, ajouteLe } = v;
  if (typeof id !== "string" || id.length < 1 || id.length > 80 || typeof empreinte !== "string" || !MOTIF_EMPREINTE.test(empreinte) || typeof ajouteLe !== "string" || Number.isNaN(Date.parse(ajouteLe))) return null;
  return { id, empreinte, ajouteLe };
}
/** (1.2) Fichier rendu à l'extension : avec son archive, ou sans elle et avec le code du refus (« impossible » si inconnu). */
export function fichierArchive(fichier: FichierLu, issue: IssueArchive): FichierArchive {
  if (issue.ok) return { ...fichier, archive: issue.archive };
  return { ...fichier, archive: null, archiveRefus: MOTIFS_REFUS_ARCHIVE.includes(issue.motif) ? issue.motif : "impossible" };
}

// ————————————————————————————————————————————————————————————— Protocole 1.1 : fichiers en flux

/** Fichier ouvert en flux, tel que l'extension le reçoit : le texte reste dans la Planche. */
export interface FichierEnFlux {
  readonly nom: string;
  readonly taille: number;
  readonly jeton: number;
}
export type ReponseReserve<T> = { readonly ok: true; readonly valeur: T } | { readonly ok: false; readonly detail: string };

/**
 * Fichiers en flux d'une commande : textes lus en attente de lecture, textes préparés en attente d'enregistrement.
 * La Planche en tient une par extension et la vide à la fin de chaque commande. Pur.
 */
export interface ReserveFichiers {
  /** Retient un fichier choisi en flux ; `null` = déjà `BORNES_FICHIER.jetons` fichiers tenus. */
  readonly retenir: (fichier: FichierLu) => FichierEnFlux | null;
  /** « fichiers.lire » : un morceau d'un fichier retenu. */
  readonly lire: (donnees: unknown) => ReponseReserve<string>;
  /** « fichiers.preparer » : un jeton d'écriture. */
  readonly preparer: () => ReponseReserve<number>;
  /** « fichiers.ajouter » : un morceau ajouté au fichier préparé. */
  readonly ajouter: (donnees: unknown) => ReponseReserve<null>;
  /** Texte d'un fichier préparé, pour « fichiers.enregistrer » ; `null` = jeton inconnu. */
  readonly texteDe: (jeton: number) => string | null;
  /** Oublie tout (fin de la commande). */
  readonly vider: () => void;
}

const estEntier = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export function creerReserveFichiers(): ReserveFichiers {
  let numero = 0;
  const lus = new Map<number, string>();
  const prepares = new Map<number, { morceaux: string[]; taille: number }>();
  const plein = () => lus.size + prepares.size >= BORNES_FICHIER.jetons;
  return {
    retenir: (fichier) => {
      if (plein()) return null;
      const jeton = ++numero;
      lus.set(jeton, fichier.texte);
      return { nom: fichier.nom, taille: fichier.texte.length, jeton };
    },
    lire: (d) => {
      const o = estObjet(d) ? d : {};
      const texte = typeof o["jeton"] === "number" ? lus.get(o["jeton"]) : undefined;
      if (texte === undefined) return { ok: false, detail: "jeton : fichier ouvert en flux pendant cette commande attendu" };
      const debut = o["debut"] ?? 0;
      const longueur = o["longueur"] ?? BORNES_FICHIER.morceau;
      if (!estEntier(debut, 0, texte.length)) return { ok: false, detail: `debut : entier de 0 à ${texte.length}` };
      if (!estEntier(longueur, 1, BORNES_FICHIER.morceau)) return { ok: false, detail: `longueur : entier de 1 à ${BORNES_FICHIER.morceau}` };
      return { ok: true, valeur: texte.slice(debut, debut + longueur) };
    },
    preparer: () => {
      if (plein()) return { ok: false, detail: `${BORNES_FICHIER.jetons} fichiers en flux au plus pendant une commande` };
      const jeton = ++numero;
      prepares.set(jeton, { morceaux: [], taille: 0 });
      return { ok: true, valeur: jeton };
    },
    ajouter: (d) => {
      const o = estObjet(d) ? d : {};
      const p = typeof o["jeton"] === "number" ? prepares.get(o["jeton"]) : undefined;
      if (!p) return { ok: false, detail: "jeton : fichier préparé par « fichiers.preparer » pendant cette commande attendu" };
      const texte = o["texte"];
      if (typeof texte !== "string" || texte.length > BORNES_FICHIER.morceau) return { ok: false, detail: `texte : ${BORNES_FICHIER.morceau} caractères au plus par morceau` };
      if (p.taille + texte.length > BORNES_FICHIER.flux) return { ok: false, detail: `fichier de plus de ${BORNES_FICHIER.flux} caractères` };
      p.morceaux.push(texte);
      p.taille += texte.length;
      return { ok: true, valeur: null };
    },
    texteDe: (jeton) => {
      const p = prepares.get(jeton);
      return p ? p.morceaux.join("") : null;
    },
    vider: () => {
      lus.clear();
      prepares.clear();
    },
  };
}
