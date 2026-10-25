import { studioSha256 } from "../empreinte-sha256.js";
import { array, fail, finite, identifier, record } from "../noyau/validation.js";
import { id } from "../registre/schemas-base.js";

/**
 * Sources externes d'un document Studio (EX-014, TR-EX-014) : chaque fichier importé directement dans le dessin (DXF)
 * est **déclaré** dans l'extension additive et facultative `StudioDocument.sources` avec sa provenance : auteur ou
 * fournisseur (s'il est connu), format et version du format lue, horodatage de réception, unité lue dans le fichier et
 * unité retenue, repère source, transformation appliquée vers le repère du dessin, restrictions d'utilisation déclarées
 * et empreinte SHA-256 du contenu. Rien n'est deviné : un champ inconnu est `null` (affiché « non déclaré » ou « non
 * évalué »), jamais rempli d'une valeur supposée. La provenance s'exporte (`studioExportProvenance`,
 * `studio-provenance/1`). Les modèles externes reçus par le serveur (IFC) portent la même provenance
 * (`echanges/modeles-externes.ts`). Pur : ni React, ni DOM.
 */

export const STUDIO_PROVENANCE_SCHEMA = "studio-provenance/1" as const;
export const STUDIO_FORMATS_SOURCE = Object.freeze(["dxf"] as const);
export type StudioFormatSource = (typeof STUDIO_FORMATS_SOURCE)[number];

/** Bornes techniques des textes déclarés (pas des valeurs métier). */
export const STUDIO_LIMITES_SOURCES = Object.freeze({ sources: 1000, texte: 200, restrictions: 2000, nomFichier: 255 } as const);

export interface StudioSourceExterne {
  id: string;
  type: "source";
  format: StudioFormatSource;
  /** Version du format lue dans le fichier (`$ACADVER` d'un DXF) ; null : non déclarée par le fichier. */
  versionFormat: string | null;
  nomFichier: string;
  /** Empreinte SHA-256 (hex) du contenu reçu (texte UTF-8). */
  empreinteSha256: string;
  /** Horodatage de réception (ISO 8601). */
  recuLe: string;
  /** Auteur ou fournisseur déclaré par l'utilisateur ; null : non connu. */
  auteur: string | null;
  /** Unité lue dans le fichier (`$INSUNITS`) et unité retenue (lue, ou choisie explicitement) ; null : inconnue. */
  uniteLue: string | null;
  uniteRetenue: string;
  /** Facteur mètres par unité du fichier. */
  facteur: number;
  /** Repère source déclaré (texte libre : « repère du fichier », « CH1903+ / LV95 »…) ; null : non déclaré. */
  repereSource: string | null;
  /** Transformation appliquée vers le repère `local-2d` : l'import DXF n'en applique aucune (identité, déclarée). */
  transformation: "identite";
  /** Restrictions d'utilisation déclarées ; null : non déclarées. */
  restrictions: string | null;
  /** Objets natifs créés par l'import. */
  objets: number;
}

const texteOuNull = (v: unknown, max: number, path: string): string | null => {
  if (v === null) return null;
  if (typeof v !== "string" || !v.trim() || v.includes("\0")) fail(path, "texte non vide ou null attendu");
  if (v.trim().length > max) fail(path, `${max} caractères au plus`);
  return v.trim();
};

export function validerSource(value: unknown, path: string): StudioSourceExterne {
  const o = record(value, ["id", "type", "format", "versionFormat", "nomFichier", "empreinteSha256", "recuLe", "auteur", "uniteLue", "uniteRetenue", "facteur", "repereSource", "transformation", "restrictions", "objets"], path);
  if (o.type !== "source") fail(`${path}.type`, "source attendu");
  if (!(STUDIO_FORMATS_SOURCE as readonly unknown[]).includes(o.format)) fail(`${path}.format`, "format dxf attendu");
  if (typeof o.empreinteSha256 !== "string" || !/^[0-9a-f]{64}$/.test(o.empreinteSha256)) fail(`${path}.empreinteSha256`, "empreinte SHA-256 (64 caractères hexadécimaux) attendue");
  if (typeof o.recuLe !== "string" || Number.isNaN(Date.parse(o.recuLe))) fail(`${path}.recuLe`, "horodatage ISO 8601 attendu");
  const uniteRetenue = texteOuNull(o.uniteRetenue, 16, `${path}.uniteRetenue`);
  if (uniteRetenue === null) fail(`${path}.uniteRetenue`, "unité retenue attendue : un import sans unité n’est jamais déclaré");
  const facteur = finite(o.facteur, `${path}.facteur`);
  if (!(facteur > 0)) fail(`${path}.facteur`, "facteur strictement positif attendu");
  const objets = finite(o.objets, `${path}.objets`);
  if (!Number.isInteger(objets) || objets < 0) fail(`${path}.objets`, "entier positif ou nul attendu");
  if (o.transformation !== "identite") fail(`${path}.transformation`, "identite attendue (l’import DXF n’applique aucune transformation)");
  return {
    id: identifier(o.id, `${path}.id`), type: "source", format: o.format as StudioFormatSource,
    versionFormat: texteOuNull(o.versionFormat, 32, `${path}.versionFormat`),
    nomFichier: texteOuNull(o.nomFichier, STUDIO_LIMITES_SOURCES.nomFichier, `${path}.nomFichier`) ?? fail(`${path}.nomFichier`, "nom de fichier attendu"),
    empreinteSha256: o.empreinteSha256, recuLe: o.recuLe,
    auteur: texteOuNull(o.auteur, STUDIO_LIMITES_SOURCES.texte, `${path}.auteur`),
    uniteLue: texteOuNull(o.uniteLue, 16, `${path}.uniteLue`), uniteRetenue, facteur,
    repereSource: texteOuNull(o.repereSource, STUDIO_LIMITES_SOURCES.texte, `${path}.repereSource`),
    transformation: "identite",
    restrictions: texteOuNull(o.restrictions, STUDIO_LIMITES_SOURCES.restrictions, `${path}.restrictions`),
    objets,
  };
}

export function validerSources(value: unknown, path: string): StudioSourceExterne[] {
  const l = array(value, path);
  if (l.length > STUDIO_LIMITES_SOURCES.sources) fail(path, `${STUDIO_LIMITES_SOURCES.sources} sources au plus`);
  const out = l.map((s, i) => validerSource(s, `${path}[${i}]`));
  const ids = new Set<string>();
  for (const s of out) { if (ids.has(s.id)) fail(path, "identifiant de source dupliqué"); ids.add(s.id); }
  return out;
}

/** Version du format DXF lue (`$ACADVER` de l'en-tête), ou null si le fichier n'en déclare pas. */
export function studioVersionDxf(texte: string): string | null {
  const m = /(?:^|\n)\s*9\s*\r?\n\s*\$ACADVER\s*\r?\n\s*1\s*\r?\n([^\r\n]*)/.exec(texte);
  const v = m?.[1]?.trim();
  return v ? v : null;
}

/**
 * Source d'un import DXF : empreinte du texte reçu, version lue, unité lue (`origine: "fichier"`) ou choisie, facteur,
 * horodatage, et ce que l'utilisateur déclare (auteur, repère source, restrictions), `null` s'il ne déclare rien.
 */
export interface StudioDeclarationSourceDxf {
  id: string; nomFichier: string; recuLe: string; objets: number;
  unite: { valeur: string | null; origine: "fichier" | "choix" | "inconnue" }; facteur: number | null;
  auteur?: string | null; repereSource?: string | null; restrictions?: string | null;
}

export function studioSourceDxf(texte: string, d: StudioDeclarationSourceDxf): StudioSourceExterne {
  return studioSourceDxfLue({ empreinteSha256: studioSha256(texte), versionFormat: studioVersionDxf(texte) }, d);
}

/** Même source, depuis l'empreinte et la version calculées là où le texte a été lu (Worker de lecture). */
export function studioSourceDxfLue(lu: { empreinteSha256: string; versionFormat: string | null }, d: StudioDeclarationSourceDxf): StudioSourceExterne {
  const vide = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);
  return validerSource({
    id: d.id, type: "source", format: "dxf", versionFormat: lu.versionFormat, nomFichier: d.nomFichier, empreinteSha256: lu.empreinteSha256, recuLe: d.recuLe,
    auteur: vide(d.auteur), uniteLue: d.unite.origine === "fichier" ? d.unite.valeur : null, uniteRetenue: d.unite.valeur, facteur: d.facteur,
    repereSource: vide(d.repereSource), transformation: "identite", restrictions: vide(d.restrictions), objets: d.objets,
  }, "source");
}

export interface StudioProvenance {
  schema: typeof STUDIO_PROVENANCE_SCHEMA;
  documentId: string;
  /** Repère et unité du document qui reçoit les sources. */
  repereDocument: "local-2d";
  uniteDocument: "m";
  sources: StudioSourceExterne[];
}

/** Export des métadonnées de provenance des sources d'un document (`studio-provenance/1`). */
export function studioExportProvenance(doc: { id: string; sources?: StudioSourceExterne[] }): StudioProvenance {
  return { schema: STUDIO_PROVENANCE_SCHEMA, documentId: doc.id, repereDocument: "local-2d", uniteDocument: "m", sources: (doc.sources ?? []).map((s) => ({ ...s })) };
}

const texteNullable = (max: number) => ({ anyOf: [{ type: "string", minLength: 1, maxLength: max, pattern: "\\S" }, { type: "null" }] }) as const;
export const SCHEMA_SOURCE = {
  type: "object", additionalProperties: false,
  required: ["id", "type", "format", "versionFormat", "nomFichier", "empreinteSha256", "recuLe", "auteur", "uniteLue", "uniteRetenue", "facteur", "repereSource", "transformation", "restrictions", "objets"],
  properties: {
    id, type: { const: "source" }, format: { enum: [...STUDIO_FORMATS_SOURCE] }, versionFormat: texteNullable(32),
    nomFichier: { type: "string", minLength: 1, maxLength: STUDIO_LIMITES_SOURCES.nomFichier, pattern: "\\S" },
    empreinteSha256: { type: "string", pattern: "^[0-9a-f]{64}$" }, recuLe: { type: "string", minLength: 1 },
    auteur: texteNullable(STUDIO_LIMITES_SOURCES.texte), uniteLue: texteNullable(16), uniteRetenue: { type: "string", minLength: 1, maxLength: 16 },
    facteur: { type: "number", exclusiveMinimum: 0 }, repereSource: texteNullable(STUDIO_LIMITES_SOURCES.texte), transformation: { const: "identite" },
    restrictions: texteNullable(STUDIO_LIMITES_SOURCES.restrictions), objets: { type: "integer", minimum: 0 },
  },
} as const;
