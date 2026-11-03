/**
 * Fiches de terrain livrées (lot TER-02, TER-D10) : la liste fermée des jeux d'altitudes que la commande
 * `geodata-terrain` peut télécharger ou importer est celle des fichiers `docs/geodata/terrain/<cle>.json` versés au dépôt
 * (copiés dans `dist/geodata-terrain/` à côté du bundle). Une fiche est désignée par son nom, jamais par une adresse :
 * l'adresse lue est celle de la fiche relue. En production (service `terrain-import`), seul un nom de la liste est admis.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { validerDeclarationTerrain, type DeclarationTerrain } from "@parcours/geodata-model";

/** Forme d'un nom de fiche (même contrainte que `geodata_terrain_versions.cle`). */
export const NOM_FICHE_TERRAIN = /^[a-z0-9][a-z0-9-]{2,79}$/;

/** Dossier des fiches de terrain livrées (à côté du bundle, ou dans le dépôt en développement). */
export function dossierFiches(): string {
  for (const base of ["./geodata-terrain/", "../../../../../../docs/geodata/terrain/"]) {
    const d = fileURLToPath(new URL(base, import.meta.url));
    if (existsSync(d)) return d;
  }
  throw new Error("Aucun dossier de fiches de terrain.");
}

/** Noms des fiches livrées (liste fermée), triés. */
export function fichesLivrees(): string[] {
  return readdirSync(dossierFiches()).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).filter((n) => NOM_FICHE_TERRAIN.test(n)).sort();
}

/** Fiche livrée par son nom ; hors `livreeSeulement` (développement), une fiche donnée par un chemin est aussi lue. */
export function lireFiche(valeur: string, livreeSeulement: boolean): DeclarationTerrain {
  let chemin: string;
  if (NOM_FICHE_TERRAIN.test(valeur)) chemin = join(dossierFiches(), `${valeur}.json`);
  else if (!livreeSeulement && existsSync(valeur)) chemin = valeur;
  else throw new Error(livreeSeulement ? `Fiche livrée attendue (nom, pas un chemin) : ${valeur}` : `Fiche introuvable : ${valeur}`);
  if (!existsSync(chemin)) throw new Error(`Fiche introuvable : ${valeur}`);
  const r = validerDeclarationTerrain(JSON.parse(readFileSync(chemin, "utf8")));
  if (!r.ok) throw new Error(`Fiche ${valeur} invalide :\n  - ${r.erreurs.join("\n  - ")}`);
  return r.declaration;
}
