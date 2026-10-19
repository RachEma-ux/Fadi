/**
 * Préférences d'outils Studio d'un compte (#166, B.2-02, B.2-04, B.2-05) : favoris, profil des barres d'outils
 * (`standard`, `metier:<id>` ou `personnel`) et liste personnelle. Une ligne par compte (`studio_tool_preferences`),
 * la même pour tous ses projets et appareils ; rien n'est partagé (le profil d'équipe reste une option, B.2-08).
 *
 * Chaque identifiant est vérifié contre le registre `STUDIO_TOOL_IDS` : un identifiant inconnu → 400, jamais
 * filtré en silence. La préférence ne règle que la visibilité dans les barres (B.2-06) : elle ne touche ni la
 * géométrie, ni les révisions, ni les droits (B.2-07) ; le serveur reste seul juge de l'exécution des commandes.
 * Les listes des profils métier vivent dans l'interface (`planche2d/profils.ts`) ; le serveur ne vérifie que la
 * forme de leur identifiant (un identifiant que l'interface ne connaît pas s'y lit comme le profil standard).
 *
 * Pur : aucune base (les lectures et écritures sont dans `routes/studio-preferences.ts`).
 */
import { z } from "zod";
import { STUDIO_TOOL_IDS } from "@parcours/atelier-model";

export const STUDIO_PROFIL_PATTERN = /^(standard|personnel|metier:[a-z0-9-]{1,40})$/;
/** Borne : le registre entier tient largement dans chaque liste. */
const MAX_OUTILS = 200;
const OUTILS_CONNUS: ReadonlySet<string> = new Set(STUDIO_TOOL_IDS as readonly string[]);

export interface StudioToolPreferences {
  profil: string;
  favoris: string[];
  personnel: string[];
}

const liste = z.array(z.string().min(1).max(128)).max(MAX_OUTILS).refine((l) => new Set(l).size === l.length, "Outil cité deux fois");
export const studioToolPreferencesSchema = z.object({
  profil: z.string().regex(STUDIO_PROFIL_PATTERN, "Profil attendu : standard, personnel ou metier:<identifiant>"),
  favoris: liste,
  personnel: liste,
}).strict();

/** Identifiants absents du registre, dans l'ordre où ils sont cités (sans doublon). */
export function outilsInconnus(p: Pick<StudioToolPreferences, "favoris" | "personnel">): string[] {
  return [...new Set([...p.favoris, ...p.personnel].filter((id) => !OUTILS_CONNUS.has(id)))];
}

export type LectureCorps = { ok: true; preferences: StudioToolPreferences } | { ok: false; body: Record<string, unknown> };

/** Corps reçu → préférences valides, ou corps du refus 400 (forme, ou identifiant hors registre). */
export function lireCorpsPreferences(body: unknown): LectureCorps {
  const parsed = studioToolPreferencesSchema.safeParse(body);
  if (!parsed.success) return { ok: false, body: { error: "invalid_input", details: parsed.error.flatten() } };
  const inconnus = outilsInconnus(parsed.data);
  if (inconnus.length) return { ok: false, body: { error: "unknown_tool", message: "Outil absent du registre de Studio.", tools: inconnus } };
  return { ok: true, preferences: parsed.data };
}

/**
 * Ligne relue → préférences : une valeur stockée devenue invalide (outil retiré du registre depuis) est lue sans cet
 * outil, signalé dans `retires`, jamais réécrite à la lecture. Pas de ligne : profil standard, aucun favori.
 */
export function lireLignePreferences(row: { profile: string; favorites: unknown; personal: unknown } | undefined): StudioToolPreferences & { retires: string[] } {
  if (!row) return { profil: "standard", favoris: [], personnel: [], retires: [] };
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const favoris = ids(row.favorites), personnel = ids(row.personal);
  const garder = (l: string[]) => l.filter((id) => OUTILS_CONNUS.has(id));
  return {
    profil: STUDIO_PROFIL_PATTERN.test(row.profile) ? row.profile : "standard",
    favoris: garder(favoris), personnel: garder(personnel), retires: outilsInconnus({ favoris, personnel }),
  };
}
