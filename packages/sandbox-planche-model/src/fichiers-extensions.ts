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
 */

/** Types de fichier texte admis, à l'ouverture comme à l'enregistrement. */
export const TYPES_FICHIER_EXTENSION = [".txt", ".csv", ".tsv", ".json", ".md", ".xml", ".obj", ".mtl", ".dxf", ".stl", ".ply"] as const;
export type TypeFichierExtension = (typeof TYPES_FICHIER_EXTENSION)[number];
export const BORNES_FICHIER = { caracteres: 1_000_000, nom: 80 } as const;

export interface DemandeOuverture {
  /** Types proposés à l'utilisateur ; jamais vide. */
  readonly types: readonly TypeFichierExtension[];
}
export interface DemandeEnregistrement {
  readonly nom: string;
  readonly texte: string;
}
export interface FichierLu {
  readonly nom: string;
  readonly texte: string;
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
  if (types === undefined || types === null) return { ok: true, demande: { types: TYPES_FICHIER_EXTENSION } };
  if (!Array.isArray(types) || types.length === 0 || types.length > TYPES_FICHIER_EXTENSION.length || !types.every(estType) || new Set(types).size !== types.length) return { ok: false, detail: `types : liste sans doublon prise parmi ${LISTE}` };
  return { ok: true, demande: { types: types as TypeFichierExtension[] } };
}

/** « fichiers.enregistrer » : un nom simple d'un type admis, un texte borné. */
export function lireDemandeEnregistrement(v: unknown): LectureFichier<DemandeEnregistrement> {
  if (!estObjet(v)) return { ok: false, detail: "nom et texte attendus" };
  const { nom, texte } = v;
  if (!estNomDeFichier(nom)) return { ok: false, detail: `nom : nom de fichier simple de ${BORNES_FICHIER.nom} caractères au plus, d'un type parmi ${LISTE}` };
  if (typeof texte !== "string" || texte.length > BORNES_FICHIER.caracteres) return { ok: false, detail: `texte : ${BORNES_FICHIER.caracteres} caractères au plus` };
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
  if (v["texte"].length > BORNES_FICHIER.caracteres) return { ok: false, detail: `fichier de plus de ${BORNES_FICHIER.caracteres} caractères` };
  // Le nom rendu est le nom seul, jamais un chemin.
  const nom = v["nom"].split(/[\\/]/).pop()!.slice(-BORNES_FICHIER.nom);
  return { ok: true, fichier: { nom, texte: v["texte"] } };
}
