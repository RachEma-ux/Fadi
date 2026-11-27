/**
 * Client minimal des préférences d'outils du Sandbox (lot 5) : les seules requêtes serveur du Sandbox, sur la session
 * du compte — `GET` et `PUT /sandbox/preferences`, et (protocole des extensions, lot 3) `GET
 * /sandbox/preferences/extensions`, la liste des extensions installées sur la plateforme. Le test d'indépendance
 * n'autorise que ce fichier à appeler le serveur, et seulement ces adresses ; le client API général de Fadi n'est
 * jamais importé. Protocole des extensions 1.2 : `POST /sandbox/preferences/fichiers` range tel quel en base un fichier
 * de données ouvert par une extension (table de règles, bibliothèque de types).
 */
import { lireArchiveFichier, lireCatalogue, lirePaquetsInstalles, lirePreferencesSandbox, type FicheCatalogue, type FichierLu, type IssueArchive, type PaquetExtension, type PreferencesSandbox } from "@parcours/sandbox-planche-model";

export const ADRESSE_PREFERENCES = "/sandbox/preferences";
export const ADRESSE_EXTENSIONS = "/sandbox/preferences/extensions";
export const ADRESSE_FICHIERS = "/sandbox/preferences/fichiers";

export interface PreferencesRecues {
  readonly preferences: PreferencesSandbox;
  /** Compte connecté (identifiant du serveur). */
  readonly compte: string;
  /** Date serveur du dernier enregistrement ; `null` si rien n'est enregistré. */
  readonly updatedAt: string | null;
  /** Catalogue des extensions tel que la plateforme le propose (état, réglage d'origine) ; relu avec tolérance. */
  readonly catalogue: readonly FicheCatalogue[];
}

/** Erreur d'un appel : `statut` HTTP (0 = réseau indisponible). */
export class ErreurPreferences extends Error {
  constructor(readonly statut: number) {
    super(`Préférences du Sandbox : ${statut === 0 ? "réseau indisponible" : `réponse ${statut}`}`);
  }
}

async function appeler(init?: RequestInit): Promise<PreferencesRecues> {
  let r: Response;
  try {
    r = await fetch(ADRESSE_PREFERENCES, { credentials: "include", headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) }, ...init });
  } catch {
    throw new ErreurPreferences(0);
  }
  if (!r.ok) throw new ErreurPreferences(r.status);
  const corps = (await r.json()) as Record<string, unknown>;
  const { updatedAt, compte, ...reste } = corps;
  if (typeof compte !== "string" || compte.length === 0) throw new ErreurPreferences(r.status);
  return { preferences: lirePreferencesSandbox({ profil: reste["profil"], barrePersonnelle: reste["barrePersonnelle"], favoris: reste["favoris"], regroupements: reste["regroupements"], extensions: reste["extensions"], scripts: reste["scripts"] }), compte, updatedAt: typeof updatedAt === "string" ? updatedAt : null, catalogue: lireCatalogue(reste["catalogue"]) };
}

export const lirePreferencesServeur = (): Promise<PreferencesRecues> => appeler();
export const enregistrerPreferencesServeur = (p: PreferencesSandbox): Promise<PreferencesRecues> =>
  appeler({ method: "PUT", body: JSON.stringify({ profil: p.profil, barrePersonnelle: p.barrePersonnelle, favoris: p.favoris, regroupements: p.regroupements, extensions: p.extensions, scripts: p.scripts }) });

/**
 * Extensions installées sur la plateforme : chaque paquet reçu repasse les règles d'import dans le navigateur
 * (`lirePaquetsInstalles`) ; un paquet qui ne les passe pas est écarté.
 */
export async function lireExtensionsServeur(): Promise<readonly PaquetExtension[]> {
  let r: Response;
  try {
    r = await fetch(ADRESSE_EXTENSIONS, { credentials: "include", headers: { Accept: "application/json" } });
  } catch {
    throw new ErreurPreferences(0);
  }
  if (!r.ok) throw new ErreurPreferences(r.status);
  return lirePaquetsInstalles(((await r.json()) as { extensions?: unknown }).extensions);
}

/**
 * (Protocole 1.2) Archive tel quel en base le fichier qu'une extension vient d'ouvrir. Jamais d'exception : un refus
 * rend son motif, que l'extension montre (connexion absente, extension inconnue de la plateforme, fichier trop lourd).
 */
/** Octets en base 64, par tranches (une seule chaîne de 800 000 caractères dépasserait la pile d'arguments). */
export function enBase64(octets: Uint8Array): string {
  let binaire = "";
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(binaire);
}

/** Les octets d'origine du fichier (sinon son texte encodé en UTF-8) sont envoyés tels quels, en base 64. */
export async function archiverFichierExtension(extension: string, fichier: FichierLu, octets?: Uint8Array): Promise<IssueArchive> {
  let r: Response;
  try {
    const contenu = enBase64(octets ?? new TextEncoder().encode(fichier.texte));
    r = await fetch(ADRESSE_FICHIERS, { method: "POST", credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ extension, nom: fichier.nom, contenu }) });
  } catch {
    return { ok: false, motif: "réseau indisponible" };
  }
  if (r.status === 401) return { ok: false, motif: "connexion requise" };
  if (r.status === 404) return { ok: false, motif: "extension inconnue de la plateforme" };
  if (r.status === 413) return { ok: false, motif: "fichier trop lourd" };
  if (!r.ok) return { ok: false, motif: `réponse ${r.status} du serveur` };
  const archive = lireArchiveFichier(((await r.json().catch(() => null)) as { archive?: unknown } | null)?.archive);
  return archive ? { ok: true, archive } : { ok: false, motif: "réponse du serveur illisible" };
}
