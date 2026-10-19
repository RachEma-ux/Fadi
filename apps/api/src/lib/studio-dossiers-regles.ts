/**
 * Règles PURES des feuilles composées et des dossiers de conception Studio (E.3-01 à E.3-03) : schémas des saisies,
 * définition contrôlée par le modèle, empreinte de rejeu. Sans base ni `db/client.ts` (testable sans DB-3) ; l'accès à
 * la base est dans `studio-dossiers.ts`.
 */
import { z } from "zod";
import {
  STUDIO_LIMITES_DOSSIER, STUDIO_SHEET_SCALES, StudioValidationError, validerFeuilleComposee, type StudioFeuilleComposeeDefinition,
} from "@parcours/atelier-model";
import { canonicalJson, sha256 } from "./studio-publication-statuts.js";

/** Même règle que les identifiants de requête Studio (`studio-commands.ts`). */
const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
/** Identifiant de calque du document : non vide, 128 caractères au plus (contrôlé ensuite contre la révision). */
const calqueId = z.string().min(1).max(128).refine((v) => v.trim().length > 0 && !v.includes("\0"), { message: "identifiant non vide attendu" });
const ligne = (max: number) => z.string().trim().min(1).max(max);
const echelle = z.union([z.literal("ajuster"), z.number().refine((v) => (STUDIO_SHEET_SCALES as readonly number[]).includes(v), "échelle normalisée attendue")]);
const champsFeuille = {
  number: ligne(STUDIO_LIMITES_DOSSIER.numero),
  title: ligne(STUDIO_LIMITES_DOSSIER.titre),
  format: z.enum(["A4", "A3", "A2", "A1"]),
  orientation: z.enum(["portrait", "paysage"]),
  scale: echelle,
  /** Calques de la vue source ; absent ou null : calques visibles de la révision. */
  layers: z.array(calqueId).max(STUDIO_LIMITES_DOSSIER.calques).nullable(),
  /** Auteur saisi du cartouche ; vide ou absent : « non évalué ». */
  author: z.string().max(STUDIO_LIMITES_DOSSIER.champ).nullable(),
};
export const studioSheetCreateSchema = z.object({
  ...champsFeuille, layers: champsFeuille.layers.optional(), author: champsFeuille.author.optional(),
  revisionId: identifier.optional(), requestId: identifier.optional(),
}).strict();
export const studioSheetUpdateSchema = z.object({
  number: champsFeuille.number.optional(), title: champsFeuille.title.optional(), format: champsFeuille.format.optional(),
  orientation: champsFeuille.orientation.optional(), scale: echelle.optional(), layers: champsFeuille.layers.optional(), author: champsFeuille.author.optional(),
  /** Réépingle la feuille sur une autre révision de SA variante (actualisation explicite). */
  revisionId: identifier.optional(),
}).strict().refine((v) => Object.keys(v).length > 0, { message: "Au moins un champ attendu." });
const metre = z.object({ variantId: identifier, revisionId: identifier.optional() }).strict().nullable().optional();
export const studioDossierCreateSchema = z.object({
  title: ligne(STUDIO_LIMITES_DOSSIER.titre),
  sheetIds: z.array(identifier).min(1).max(STUDIO_LIMITES_DOSSIER.feuilles),
  /** Métré joint : variante de l'étude et révision (tête par défaut, épinglée) ; null ou absent : pas de métré. */
  quantities: metre,
  includeFidelity: z.boolean().optional(),
  requestId: identifier.optional(),
}).strict();
export const studioDossierUpdateSchema = z.object({
  title: ligne(STUDIO_LIMITES_DOSSIER.titre).optional(),
  sheetIds: z.array(identifier).min(1).max(STUDIO_LIMITES_DOSSIER.feuilles).optional(),
  quantities: metre,
  includeFidelity: z.boolean().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, { message: "Au moins un champ attendu." });
export type StudioSheetCreateInput = z.infer<typeof studioSheetCreateSchema>;
export type StudioSheetUpdateInput = z.infer<typeof studioSheetUpdateSchema>;
export type StudioDossierCreateInput = z.infer<typeof studioDossierCreateSchema>;
export type StudioDossierUpdateInput = z.infer<typeof studioDossierUpdateSchema>;

export interface SaisieFeuille {
  number: string; title: string; format: StudioFeuilleComposeeDefinition["format"]; orientation: StudioFeuilleComposeeDefinition["orientation"];
  scale: StudioFeuilleComposeeDefinition["echelle"] | number; layers?: string[] | null | undefined; author?: string | null | undefined;
}
export type RefusDossier = { status: number; body: Record<string, unknown> };

/** Définition contrôlée par le modèle (normalisation comprise) ; une définition refusée est un 400, jamais un 500. */
export function definitionDeSaisie(input: SaisieFeuille): { definition: StudioFeuilleComposeeDefinition } | { refus: RefusDossier } {
  try {
    return {
      definition: validerFeuilleComposee({
        numero: input.number, titre: input.title, format: input.format, orientation: input.orientation, echelle: input.scale as StudioFeuilleComposeeDefinition["echelle"],
        vueSource: { type: "planche-2d", ...(input.layers ? { calques: input.layers } : {}) },
        ...(input.author && input.author.trim() ? { cartouche: { auteur: input.author } } : {}),
      }),
    };
  } catch (e) {
    if (e instanceof StudioValidationError) return { refus: { status: 400, body: { error: "invalid_input", code: "sheet_definition_invalid", message: e.message } } };
    throw e;
  }
}
/** Saisie équivalente d'une définition enregistrée (base d'une modification partielle). */
export const saisieDeDefinition = (d: StudioFeuilleComposeeDefinition): SaisieFeuille => ({
  number: d.numero, title: d.titre, format: d.format, orientation: d.orientation, scale: d.echelle, layers: d.vueSource.calques ?? null, author: d.cartouche?.auteur ?? null,
});
/** Modification partielle : seuls les champs fournis remplacent ceux de la définition enregistrée. */
export function saisieModifiee(d: StudioFeuilleComposeeDefinition, champs: Partial<Record<keyof SaisieFeuille, unknown>>): SaisieFeuille {
  const fournis = Object.fromEntries(Object.entries(champs).filter(([, v]) => v !== undefined)) as Partial<SaisieFeuille>;
  return { ...saisieDeDefinition(d), ...fournis };
}
/** Empreinte d'une requête d'écriture (rejeu) : contenu sans l'identifiant de requête. */
export const empreinteSaisie = (input: Record<string, unknown>): string => {
  const { requestId: _r, ...reste } = input;
  void _r;
  return sha256(canonicalJson(reste));
};
/** Feuilles d'un dossier : distinctes et toutes connues de l'étude, sinon refus 400. */
export function controleFeuillesDossier(ids: readonly string[], connues: ReadonlySet<string>): RefusDossier | null {
  if (new Set(ids).size !== ids.length) return { status: 400, body: { error: "invalid_input", code: "dossier_sheet_duplicate", message: "Une feuille ne figure qu'une fois dans un dossier." } };
  const inconnues = ids.filter((id) => !connues.has(id));
  return inconnues.length ? { status: 400, body: { error: "invalid_input", code: "dossier_sheet_unknown", sheetIds: inconnues, message: "Feuille inconnue dans cette étude." } } : null;
}
