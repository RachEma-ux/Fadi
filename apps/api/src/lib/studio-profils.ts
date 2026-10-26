/**
 * Profils d'outils Studio persistants, exportables et importables (EX-033, EX-034, INV-009 ; TR-EX-033, TR-EX-034,
 * TR-INV-009). Pur : aucune base (les lectures et écritures sont dans `routes/studio-preferences.ts`).
 *
 * EX-034 — un profil possède : `profileId` (stable, propre au compte), propriétaire (le compte), `version` (entier,
 * +1 à chaque enregistrement ou import), ordre des capacités (`ordre`), raccourcis personnels (`raccourcis` : capacité →
 * combinaison au format du registre), visibilité (profil des barres, liste personnelle, favoris, regroupements),
 * réglages (aucun réglage d'outil n'est encore porté par Studio : champ absent, jamais inventé) et contexte (version du
 * manifeste, `manifeste`). Les conflits de raccourcis sont **détectés, explicités et résolus sans effacer la
 * configuration source** : un import en conflit est refusé (409, conflits nommés) sans rien écrire ; la résolution
 * `ecarter` importe tout sauf les raccourcis en conflit, rendus dans `ecartes` ; le fichier importé n'est jamais modifié.
 *
 * EX-033 / INV-009 — importer un profil **ne confère aucune permission** : un profil qui place une capacité exigeant un
 * droit que le compte n'a pas dans ce projet (« Publier » : droit `publish`) est **refusé** (403
 * `permission_non_conferee`, capacités nommées), rien n'est écrit. Les outils du registre n'y sont que visibilité : un
 * lecteur peut importer un profil qui montre la Ligne, dont l'exécution reste refusée par le serveur.
 *
 * Décisions (Fadi, réversibles) : format d'échange `fadi-studio-profil/1` (JSON) ; capacités hors registre admises
 * dans un profil : `studio.publication.publier` (« Publier », droit `publish`) — la commande de publication de la
 * variante (`/publications`), qui n'est pas un outil de dessin du registre ; le propriétaire d'un profil importé est le
 * compte qui l'importe (la provenance `profileId@version` est gardée dans `importeDe`).
 */
import { z } from "zod";
import { STUDIO_TOOLS, STUDIO_TOOL_IDS } from "@parcours/atelier-model";
import { STUDIO_GROUPE_ID_PATTERN, STUDIO_PROFIL_PATTERN, MAX_GROUPES, MAX_NOM_GROUPE } from "./studio-preferences.js";

export const STUDIO_FORMAT_PROFIL = "fadi-studio-profil/1" as const;

/** Capacités hors registre qu'un profil peut placer, avec le droit de projet qu'elles exigent. */
export const STUDIO_CAPACITES_HORS_REGISTRE: readonly { id: string; libelle: string; droit: "publish" | "approve" }[] = Object.freeze([
  { id: "studio.publication.publier", libelle: "Publier", droit: "publish" },
]);

const OUTILS: ReadonlySet<string> = new Set(STUDIO_TOOL_IDS as readonly string[]);
const HORS_REGISTRE = new Map(STUDIO_CAPACITES_HORS_REGISTRE.map((c) => [c.id, c]));
export const estCapacite = (id: string): boolean => OUTILS.has(id) || HORS_REGISTRE.has(id);

/** Combinaison au format du registre : `Ctrl+` puis `Shift+` facultatifs, puis une touche (lettre, chiffre ou nom). */
export const STUDIO_RACCOURCI_PATTERN = /^(Ctrl\+)?(Shift\+)?([A-Z0-9]|F[1-9]|F1[0-2]|Delete|Escape|Enter|Space|Backspace|Tab|[=\-[\];',./`])$/;
const MAX_CAPACITES = 300;

const ident = z.string().min(1).max(128);
export const raccourcisSchema = z.record(ident, z.string().regex(STUDIO_RACCOURCI_PATTERN, "Raccourci au format du registre (Ctrl+, Shift+, touche)")).refine((r) => Object.keys(r).length <= MAX_CAPACITES, "Trop de raccourcis");
export const ordreSchema = z.array(ident).max(MAX_CAPACITES).refine((l) => new Set(l).size === l.length, "Capacité citée deux fois");

const liste = z.array(ident).max(MAX_CAPACITES).refine((l) => new Set(l).size === l.length, "Outil cité deux fois");
/** Fichier de profil exporté / importé. */
export const profilExporteSchema = z.object({
  format: z.literal(STUDIO_FORMAT_PROFIL),
  profileId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  proprietaire: z.string().max(200).optional(),
  version: z.number().int().min(1),
  manifeste: z.string().max(80).optional(),
  profil: z.string().regex(STUDIO_PROFIL_PATTERN),
  favoris: liste,
  personnel: liste,
  groupes: z.array(z.object({ id: z.string().regex(STUDIO_GROUPE_ID_PATTERN), nom: z.string().trim().min(1).max(MAX_NOM_GROUPE), outils: liste }).strict()).max(MAX_GROUPES),
  ordre: ordreSchema,
  raccourcis: raccourcisSchema,
}).strict();
export type ProfilExporte = z.infer<typeof profilExporteSchema>;

export const importProfilSchema = z.object({ profil: z.unknown(), resolution: z.enum(["refuser", "ecarter"]).optional() }).strict();

export interface ConflitRaccourci {
  /** Combinaison disputée. */
  raccourci: string;
  /** Capacité du profil importé qui la demande. */
  capacite: string;
  /** `doublon` : deux capacités du profil ; `registre` : raccourci natif d'un autre outil du registre. */
  type: "doublon" | "registre";
  /** Capacité qui la tient déjà. */
  avec: string;
}

const NATIFS = new Map(STUDIO_TOOLS.map((t) => [t.raccourci as string, t.toolId as string]));

/**
 * Conflits des raccourcis personnels (ordre des clés conservé) : deux capacités sur la même combinaison, ou une
 * combinaison native d'un autre outil du registre. Les commandes de l'éditeur et les combinaisons du navigateur sont
 * contrôlées par l'interface, qui les connaît (`planche2d/profils.ts`).
 */
export function conflitsRaccourcis(raccourcis: Readonly<Record<string, string>>): ConflitRaccourci[] {
  const conflits: ConflitRaccourci[] = [];
  const pris = new Map<string, string>();
  for (const [capacite, raccourci] of Object.entries(raccourcis)) {
    const natif = NATIFS.get(raccourci);
    if (natif !== undefined && natif !== capacite) conflits.push({ raccourci, capacite, type: "registre", avec: natif });
    else if (pris.has(raccourci)) conflits.push({ raccourci, capacite, type: "doublon", avec: pris.get(raccourci)! });
    else pris.set(raccourci, capacite);
  }
  return conflits;
}

/** Capacités citées par un profil (ordre, raccourcis, listes) qui n'existent pas. */
export function capacitesInconnues(p: Pick<ProfilExporte, "ordre" | "raccourcis" | "favoris" | "personnel" | "groupes">): string[] {
  const outils = [...p.favoris, ...p.personnel, ...p.groupes.flatMap((g) => g.outils)].filter((id) => !OUTILS.has(id));
  const capacites = [...p.ordre, ...Object.keys(p.raccourcis)].filter((id) => !estCapacite(id));
  return [...new Set([...outils, ...capacites])];
}

/**
 * Capacités du profil qui exigent un droit que le compte n'a pas (EX-033) : un profil ne confère jamais ce droit.
 * `droits` : verdict réel du serveur pour ce compte dans ce projet.
 */
export function capacitesSansDroit(p: Pick<ProfilExporte, "ordre" | "raccourcis">, droits: { publish: boolean; approve: boolean }): string[] {
  return [...new Set([...p.ordre, ...Object.keys(p.raccourcis)])].filter((id) => { const c = HORS_REGISTRE.get(id); return c !== undefined && !droits[c.droit]; });
}

/** Retire les raccourcis en conflit (résolution `ecarter`) ; rend les écartés. Ne modifie pas l'entrée. */
export function ecarterConflits(raccourcis: Readonly<Record<string, string>>, conflits: readonly ConflitRaccourci[]): { raccourcis: Record<string, string>; ecartes: ConflitRaccourci[] } {
  const hors = new Set(conflits.map((c) => c.capacite));
  return { raccourcis: Object.fromEntries(Object.entries(raccourcis).filter(([k]) => !hors.has(k))), ecartes: [...conflits] };
}
