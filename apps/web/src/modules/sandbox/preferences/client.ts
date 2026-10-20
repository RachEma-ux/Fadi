/**
 * Client minimal des préférences d'outils du Sandbox (lot 5) : les deux seules requêtes serveur du Sandbox,
 * `GET` et `PUT /sandbox/preferences`, sur la session du compte. Le test d'indépendance n'autorise que ce fichier à
 * appeler le serveur, et seulement cette adresse ; le client API général de Fadi n'est jamais importé.
 */
import { lirePreferencesSandbox, type PreferencesSandbox } from "@parcours/sandbox-planche-model";

export const ADRESSE_PREFERENCES = "/sandbox/preferences";

export interface PreferencesRecues {
  readonly preferences: PreferencesSandbox;
  /** Compte connecté (identifiant du serveur). */
  readonly compte: string;
  /** Date serveur du dernier enregistrement ; `null` si rien n'est enregistré. */
  readonly updatedAt: string | null;
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
  return { preferences: lirePreferencesSandbox({ profil: reste["profil"], barrePersonnelle: reste["barrePersonnelle"], favoris: reste["favoris"], regroupements: reste["regroupements"] }), compte, updatedAt: typeof updatedAt === "string" ? updatedAt : null };
}

export const lirePreferencesServeur = (): Promise<PreferencesRecues> => appeler();
export const enregistrerPreferencesServeur = (p: PreferencesSandbox): Promise<PreferencesRecues> =>
  appeler({ method: "PUT", body: JSON.stringify({ profil: p.profil, barrePersonnelle: p.barrePersonnelle, favoris: p.favoris, regroupements: p.regroupements }) });
