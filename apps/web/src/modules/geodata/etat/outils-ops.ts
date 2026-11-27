/**
 * Outils de la carte et zones d'étude (feuille de route équipe A, PR P6 : extraction du domaine D6 de `PageGeoData.tsx`,
 * aucun changement visible). Fonctions pures, sans React ni DOM.
 */
import type { OutilCarte } from "../carte/moteur";

/** Volet que le choix d'un outil ouvre : Terrain pour l'altitude et le profil, Études pour les autres ; aucun en navigation. */
export function voletDeOutil(o: OutilCarte): "terrain" | "etudes" | null {
  if (o === "navigation") return null;
  return o === "altitude" || o === "profil" ? "terrain" : "etudes";
}

/** L'outil trace sur le moteur et rend la main au panneau Terrain (aucun tracé gardé par la page). */
export const outilTerrain = (o: OutilCarte): o is "altitude" | "profil" => o === "altitude" || o === "profil";

/** L'outil écrit en base à la fin du tracé (zone d'étude, annotation) : le tracé terminé attend son enregistrement. */
export const outilQuiEnregistre = (o: OutilCarte) => o === "zone" || o === "annotation";

/** Zone d'étude active d'un filtre : seulement une zone (pas une annotation) encore présente. */
export function zoneActiveDe<Z extends { id: string; nature: string }>(zones: readonly Z[], filtre: string | null): Z | null {
  return zones.find((z) => z.id === filtre && z.nature === "zone") ?? null;
}

/** Alt+Z sans filtre : la dernière zone filtrée si elle existe encore, sinon la plus récente (la première reçue), sinon null. */
export function zoneARetablir<Z extends { id: string; nature: string }>(zones: readonly Z[], derniere: string | null): Z | null {
  const candidates = zones.filter((z) => z.nature === "zone");
  return candidates.find((z) => z.id === derniere) ?? candidates[0] ?? null;
}

/** Sommets admis par outil pour un tracé saisi au clavier (P7, UX-3) ; mêmes minimums que le tracé à la souris. */
export const SOMMETS_OUTIL: Readonly<Record<Exclude<OutilCarte, "navigation">, { min: number; max: number }>> = {
  distance: { min: 2, max: 500 }, profil: { min: 2, max: 500 }, surface: { min: 3, max: 500 }, zone: { min: 3, max: 500 },
  annotation: { min: 1, max: 1 }, altitude: { min: 1, max: 1 },
};

/** Un point saisi : « longitude latitude » (espace), « longitude, latitude » (virgule suivie d'un espace ou point décimal). */
function lirePoint(texte: string): [number, number] | null {
  const t = texte.trim();
  let morceaux = t.split(/\s*[,\s]\s*/).filter(Boolean);
  // Virgule décimale (« -7,6 33,5 ») : deux morceaux séparés par une espace, chacun avec au plus une virgule.
  const parEspace = t.split(/\s+/).filter(Boolean);
  if (parEspace.length === 2 && parEspace.every((m) => /^[-+]?\d+(,\d+)?$/.test(m))) morceaux = parEspace.map((m) => m.replace(",", "."));
  if (morceaux.length !== 2 || !morceaux.every((m) => /^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(m))) return null;
  const [lon, lat] = morceaux.map(Number) as [number, number];
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
  return [Number(lon.toFixed(7)), Number(lat.toFixed(7))];
}

export type TraceSaisi = { outil: Exclude<OutilCarte, "navigation">; sommets: [number, number][] };

/**
 * Tracé saisi au clavier (P7) : un point par ligne (ou séparés par « ; »), WGS 84 en degrés décimaux, longitude puis
 * latitude. Rend le tracé ou le message d'erreur à afficher ; aucune écriture (seules la zone et l'annotation
 * s'enregistrent, après le formulaire existant).
 */
export function traceDepuisCoordonnees(outil: OutilCarte, texte: string): { trace: TraceSaisi } | { erreur: string } {
  if (outil === "navigation") return { erreur: "Choisissez d'abord un outil." };
  const lignes = texte.split(/[\n;]+/).map((l) => l.trim()).filter(Boolean);
  const { min, max } = SOMMETS_OUTIL[outil];
  if (lignes.length < min) return { erreur: min === 1 ? "Saisissez un point." : `Saisissez au moins ${min} points.` };
  if (lignes.length > max) return { erreur: max === 1 ? "Un seul point pour cet outil." : `Au plus ${max} points.` };
  const sommets: [number, number][] = [];
  for (let i = 0; i < lignes.length; i++) {
    const p = lirePoint(lignes[i]!);
    if (!p) return { erreur: `Point ${i + 1} illisible : longitude −180 à 180 puis latitude −90 à 90, en degrés décimaux.` };
    sommets.push(p);
  }
  return { trace: { outil, sommets } };
}
