/**
 * Préférences d'outils du Sandbox d'un compte (lot 5) : lecture d'une ligne `sandbox_tool_preferences` et validation d'un
 * corps PUT. La forme, les valeurs par défaut et la vérification contre le registre viennent du paquet du Sandbox
 * (`validerPreferencesSandbox`) : la même règle que dans le navigateur. Une entrée inconnue → 400 nommé, jamais filtrée.
 * Pur : aucune base (lectures et écritures dans `routes/sandbox-preferences.ts`).
 */
import { FORMAT_PREFERENCES_SANDBOX, PREFERENCES_SANDBOX_DEFAUT, lirePreferencesSandbox, validerPreferencesSandbox, type PreferencesSandbox } from "@parcours/sandbox-planche-model";

export interface LignePreferencesSandbox {
  profile: string;
  leftBar: string[];
  favorites: string[];
  groups: { id: string; nom: string; entrees: string[] }[];
  updatedAt: Date;
}

export interface ReponsePreferencesSandbox extends PreferencesSandbox {
  readonly format: string;
  /** Compte connecté : le navigateur range sa copie locale sous ce compte (aucun envoi d'une copie d'un autre compte). */
  readonly compte: string;
  /** Date serveur du dernier enregistrement ; `null` tant que rien n'est enregistré (profil Standard). */
  readonly updatedAt: string | null;
}

/** Réponse d'une lecture : la ligne relue (tolérante : une ligne ancienne invalide vaut les défauts), sinon les défauts. */
export function reponsePreferences(compte: string, ligne: LignePreferencesSandbox | undefined): ReponsePreferencesSandbox {
  if (!ligne) return { ...PREFERENCES_SANDBOX_DEFAUT, format: FORMAT_PREFERENCES_SANDBOX, compte, updatedAt: null };
  const p = lirePreferencesSandbox({ profil: ligne.profile, barrePersonnelle: ligne.leftBar, favoris: ligne.favorites, regroupements: ligne.groups });
  return { ...p, format: FORMAT_PREFERENCES_SANDBOX, compte, updatedAt: ligne.updatedAt.toISOString() };
}

export type CorpsLu =
  | { ok: true; valeurs: Omit<LignePreferencesSandbox, "updatedAt"> }
  | { ok: false; body: { error: "invalid_input" | "unknown_entry"; detail: string; inconnues?: readonly string[] } };

/** Corps PUT → valeurs de ligne, ou réponse 400 (`invalid_input`, `unknown_entry` avec les entrées nommées). */
export function lireCorpsPreferencesSandbox(corps: unknown): CorpsLu {
  const r = validerPreferencesSandbox(corps);
  if (!r.ok) return { ok: false, body: { error: r.erreur === "entree_inconnue" ? "unknown_entry" : "invalid_input", detail: r.detail, ...(r.inconnues ? { inconnues: r.inconnues } : {}) } };
  const p = r.preferences;
  return { ok: true, valeurs: { profile: p.profil, leftBar: [...p.barrePersonnelle], favorites: [...p.favoris], groups: p.regroupements.map((g) => ({ id: g.id, nom: g.nom, entrees: [...g.entrees] })) } };
}
