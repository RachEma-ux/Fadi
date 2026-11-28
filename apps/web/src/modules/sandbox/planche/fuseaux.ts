/**
 * Cas 2, lot 5 (n° 105) — fuseaux horaires lus dans la base des fuseaux du navigateur (Intl), jamais codés en dur :
 * liste des noms et décalage sur UTC d'une heure légale donnée (heure d'été comprise). Sans React ni DOM.
 */

/** Noms des fuseaux connus du navigateur ; liste vide s'il ne les donne pas. */
export function fuseauxDuNavigateur(): readonly string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (cle: string) => string[] };
  try {
    return intl.supportedValuesOf ? intl.supportedValuesOf("timeZone") : [];
  } catch {
    return [];
  }
}

/** Décalage (minutes) du fuseau sur UTC à un instant UTC ; `null` si le fuseau est inconnu. */
export function decalageA(fuseau: string, instantUtc: number): number | null {
  try {
    const parties = new Intl.DateTimeFormat("en-US", { timeZone: fuseau, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(instantUtc));
    const v = (type: string) => Number(parties.find((p) => p.type === type)?.value);
    const local = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
    if (!Number.isFinite(local)) return null;
    return Math.round((local - Math.floor(instantUtc / 1000) * 1000) / 60000);
  } catch {
    return null;
  }
}

/**
 * Décalage (minutes) d'une heure **légale** du fuseau (date civile, heure décimale) : l'instant UTC est cherché par deux
 * itérations (le décalage change avec l'heure d'été). `null` si le fuseau est inconnu.
 */
export function decalageLegal(fuseau: string, annee: number, mois: number, jour: number, heure: number): number | null {
  const local = Date.UTC(annee, mois - 1, jour) + heure * 3_600_000;
  let d = decalageA(fuseau, local);
  if (d === null) return null;
  for (let i = 0; i < 2; i++) {
    const suivant = decalageA(fuseau, local - d * 60_000);
    if (suivant === null) return null;
    if (suivant === d) break;
    d = suivant;
  }
  return d;
}
