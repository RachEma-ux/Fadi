/**
 * Sources provisoires (D-GD-54) : admises seulement si l'exploitation le dit explicitement (`GEODATA_SOURCES_PROVISOIRES=oui`,
 * préproduction et développement) ; jamais par défaut, donc jamais en production sans ce réglage.
 * Module sans dépendance (lu par l'API et par la chaîne d'import `geodata-reference.js`).
 */
export const sourcesProvisoiresAdmises = (env: Record<string, string | undefined> = process.env) => env["GEODATA_SOURCES_PROVISOIRES"]?.trim() === "oui";

/**
 * Dossier des fiches provisoires, sous le dossier des sources livrées (`provisoires/<cle>.json`, données dans
 * `provisoires/donnees/`) : ni importées, ni archivées en base sans le réglage ci-dessus.
 */
export const DOSSIER_PROVISOIRES = "provisoires";
