/**
 * Préférences d'outils Studio d'un compte (#166, B.2-02, B.2-04, B.2-05) : favoris, profil des barres d'outils
 * (`standard`, `metier:<id>` ou `personnel`), liste personnelle et regroupements personnels. Une ligne par compte
 * (`studio_tool_preferences`), la même pour tous ses projets et appareils ; rien n'est partagé (le profil d'équipe
 * reste une option non implémentée, B.2-08).
 *
 * Chaque identifiant est vérifié contre le registre `STUDIO_TOOL_IDS` : un identifiant inconnu → 400, jamais
 * filtré en silence. La préférence ne règle que la visibilité dans les barres (B.2-06) : elle ne touche ni la
 * géométrie, ni les révisions, ni les droits (B.2-07) ; le serveur reste seul juge de l'exécution des commandes.
 * Les listes des profils métier vivent dans l'interface (`planche2d/profils.ts`) ; le serveur ne vérifie que la
 * forme de leur identifiant (un identifiant que l'interface ne connaît pas s'y lit comme le profil standard).
 *
 * Regroupements personnels (B.2-02) : listes nommées d'outils du registre (`groupes`, colonne facultative `groups`),
 * au plus `MAX_GROUPES`. Un PUT sans `groupes` (client antérieur) laisse les regroupements enregistrés tels quels.
 * Chaque ligne porte la version du manifeste sous laquelle elle a été écrite (`manifest_version`) ; un identifiant
 * stocké est relu par `toolIdCanonique` (alias de migration du manifeste, B.1-04).
 *
 * Pur : aucune base (les lectures et écritures sont dans `routes/studio-preferences.ts`).
 */
import { z } from "zod";
import { STUDIO_MANIFESTE_OUTILS, STUDIO_MANIFESTE_OUTILS_VERSION, STUDIO_TOOL_IDS, toolIdCanonique, type StudioDroitOutil } from "@parcours/atelier-model";

export const STUDIO_PROFIL_PATTERN = /^(standard|personnel|metier:[a-z0-9-]{1,40})$/;
/** Borne : le registre entier tient largement dans chaque liste. */
const MAX_OUTILS = 200;
export const MAX_GROUPES = 20;
export const MAX_NOM_GROUPE = 60;
export const STUDIO_GROUPE_ID_PATTERN = /^[a-z0-9-]{1,40}$/;
const OUTILS_CONNUS: ReadonlySet<string> = new Set(STUDIO_TOOL_IDS as readonly string[]);

export interface StudioGroupeOutils {
  id: string;
  nom: string;
  outils: string[];
}
export interface StudioToolPreferences {
  profil: string;
  favoris: string[];
  personnel: string[];
  /** Absent d'un corps PUT : regroupements enregistrés inchangés. Toujours présent à la lecture. */
  groupes?: StudioGroupeOutils[];
}

const liste = z.array(z.string().min(1).max(128)).max(MAX_OUTILS).refine((l) => new Set(l).size === l.length, "Outil cité deux fois");
const groupe = z.object({
  id: z.string().regex(STUDIO_GROUPE_ID_PATTERN, "Identifiant de regroupement : minuscules, chiffres, tirets"),
  nom: z.string().trim().min(1).max(MAX_NOM_GROUPE),
  outils: liste,
}).strict();
export const studioToolPreferencesSchema = z.object({
  profil: z.string().regex(STUDIO_PROFIL_PATTERN, "Profil attendu : standard, personnel ou metier:<identifiant>"),
  favoris: liste,
  personnel: liste,
  groupes: z.array(groupe).max(MAX_GROUPES)
    .refine((l) => new Set(l.map((g) => g.id)).size === l.length, "Regroupement cité deux fois")
    .refine((l) => new Set(l.map((g) => g.nom.toLocaleLowerCase("fr"))).size === l.length, "Deux regroupements portent le même nom")
    .optional(),
}).strict();

/** Identifiants absents du registre, dans l'ordre où ils sont cités (sans doublon). */
export function outilsInconnus(p: { favoris: readonly string[]; personnel: readonly string[]; groupes?: readonly StudioGroupeOutils[] | undefined }): string[] {
  return [...new Set([...p.favoris, ...p.personnel, ...(p.groupes ?? []).flatMap((g) => g.outils)].filter((id) => !OUTILS_CONNUS.has(id)))];
}

export type LectureCorps = { ok: true; preferences: StudioToolPreferences } | { ok: false; body: Record<string, unknown> };

/** Corps reçu → préférences valides, ou corps du refus 400 (forme, ou identifiant hors registre). */
export function lireCorpsPreferences(body: unknown): LectureCorps {
  const parsed = studioToolPreferencesSchema.safeParse(body);
  if (!parsed.success) return { ok: false, body: { error: "invalid_input", details: parsed.error.flatten() } };
  const inconnus = outilsInconnus(parsed.data);
  if (inconnus.length) return { ok: false, body: { error: "unknown_tool", message: "Outil absent du registre de Studio.", tools: inconnus } };
  const { groupes, ...reste } = parsed.data;
  return { ok: true, preferences: groupes === undefined ? reste : { ...reste, groupes } };
}

export type LecturePreferences = Required<StudioToolPreferences> & { retires: string[]; manifeste: string };

/**
 * Ligne relue → préférences : une valeur stockée devenue invalide (outil retiré du registre depuis) est lue sans cet
 * outil, signalé dans `retires`, jamais réécrite à la lecture ; un identifiant renommé suit son alias du manifeste.
 * Pas de ligne : profil standard, aucun favori, aucun regroupement.
 */
export function lireLignePreferences(row: { profile: string; favorites: unknown; personal: unknown; groups?: unknown } | undefined): LecturePreferences {
  if (!row) return { profil: "standard", favoris: [], personnel: [], groupes: [], retires: [], manifeste: STUDIO_MANIFESTE_OUTILS_VERSION };
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const retires: string[] = [];
  const garder = (l: string[]) => [...new Set(l.flatMap((id) => {
    const c = toolIdCanonique(id);
    if (c === null) retires.push(id);
    return c === null ? [] : [c];
  }))];
  const favoris = garder(ids(row.favorites)), personnel = garder(ids(row.personal));
  const groupes = (Array.isArray(row.groups) ? row.groups : []).flatMap((g): StudioGroupeOutils[] => {
    if (!g || typeof g !== "object") return [];
    const { id, nom, outils } = g as Record<string, unknown>;
    if (typeof id !== "string" || !STUDIO_GROUPE_ID_PATTERN.test(id) || typeof nom !== "string" || !nom.trim()) return [];
    return [{ id, nom, outils: garder(ids(outils)) }];
  });
  return {
    profil: STUDIO_PROFIL_PATTERN.test(row.profile) ? row.profile : "standard",
    favoris, personnel, groupes, retires: [...new Set(retires)], manifeste: STUDIO_MANIFESTE_OUTILS_VERSION,
  };
}

/** Verdict du serveur sur le droit d'écriture du compte dans ce projet, avec le motif d'un refus. */
export interface DroitEcriture {
  ecriture: boolean;
  /** `role` : rôle sans écriture ; `reference-protegee` : projet de référence ; `verrou` : édition réservée par un autre compte. */
  motif: "role" | "reference-protegee" | "verrou" | null;
}

/** Refus de `projectAccessRefusal(…, "modify")` → motif lisible par l'interface. */
export function motifRefusEcriture(refus: { status: number; body: Record<string, unknown> } | null): DroitEcriture {
  if (!refus) return { ecriture: true, motif: null };
  if (refus.status === 423) return { ecriture: false, motif: "verrou" };
  return { ecriture: false, motif: refus.body["motif"] === "reference-protegee" ? "reference-protegee" : "role" };
}

export interface CatalogueAutorise {
  manifeste: string;
  role: string;
  droits: { lecture: true; ecriture: boolean; motif: DroitEcriture["motif"] };
  entrees: { toolId: string; droit: StudioDroitOutil; autorise: boolean }[];
}

/**
 * Catalogue autorisé (B.2-06) : pour chaque outil du manifeste, le droit requis et le verdict **réel** du serveur
 * (`autorise`), indépendant de la visibilité dans les barres (préférences) et de la disponibilité dans le contexte
 * (sélection, vue — décidée par l'interface). Lecture seule ; ne règle rien et ne donne aucun droit.
 */
export function catalogueAutorise(droit: DroitEcriture, role: string): CatalogueAutorise {
  return {
    manifeste: STUDIO_MANIFESTE_OUTILS.version, role,
    droits: { lecture: true, ecriture: droit.ecriture, motif: droit.ecriture ? null : droit.motif },
    entrees: STUDIO_MANIFESTE_OUTILS.entrees.map((e) => ({ toolId: e.toolId, droit: e.droit, autorise: e.droit === "lecture" || droit.ecriture })),
  };
}
