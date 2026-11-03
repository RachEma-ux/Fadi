/**
 * Logique pure de l'interface du terrain haute résolution (plan v1.0, lot TER-05, Issue #381) : arrondi d'une altitude à la
 * précision que la source permet, portée de la légende (verrouillée sur la version ou adaptée à la vue, toujours dite),
 * équidistances proposées (jamais sous le seuil TER-D17), pas d'un profil, tracé SVG d'un profil (lacunes jamais
 * comblées, points interpolés distingués). Aucun DOM, aucun appel serveur.
 *
 * Une valeur absente reste absente (« non évaluée », jamais zéro) ; aucune précision n'est inventée : sans précision
 * mesurée ni déclarée, l'altitude est donnée au mètre.
 */
import { EQUIDISTANCES, verifierEquidistance, type ReferenceVerticale } from "@parcours/geodata-model";
import type { JeuTerrainRecu, ProfilRecu, SourceTerrainRecue } from "./client";

export type NaturePrecision = "mesuree" | "declaree" | "non-evaluee";

/** Précision verticale retenue : RMSEz mesurée d'abord, sinon précision déclarée par le producteur, sinon non évaluée. */
export function precisionSupportee(s: Pick<SourceTerrainRecue, "qualite" | "precisionDeclaree">): { valeur: number | null; nature: NaturePrecision } {
  if (s.qualite.rmsez !== null && Number.isFinite(s.qualite.rmsez)) return { valeur: s.qualite.rmsez, nature: "mesuree" };
  const d = s.precisionDeclaree?.verticaleM ?? null;
  if (d !== null && Number.isFinite(d)) return { valeur: d, nature: "declaree" };
  return { valeur: null, nature: "non-evaluee" };
}

/** Décimales qu'une précision autorise : jamais plus fine que la source (au mètre si elle n'est pas évaluée). */
export function decimalesPour(precision: number | null): number {
  if (precision === null || !(precision > 0)) return 0;
  if (precision < 0.05) return 2;
  if (precision < 0.5) return 1;
  return 0;
}

/** Nombre au format français (virgule décimale, espace fine pour les milliers). */
export function nombreFr(v: number, decimales: number): string {
  const [ent, dec] = Math.abs(v).toFixed(decimales).split(".");
  const groupe = ent!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${v < 0 && Number(Math.abs(v).toFixed(decimales)) !== 0 ? "−" : ""}${groupe}${dec ? `,${dec}` : ""}`;
}

/** Altitude arrondie à la précision de sa source, avec l'unité ; null → « non évaluée ». */
export function formaterAltitude(v: number | null, s: Pick<SourceTerrainRecue, "qualite" | "precisionDeclaree">): string {
  if (v === null || !Number.isFinite(v)) return "non évaluée";
  return `${nombreFr(v, decimalesPour(precisionSupportee(s).valeur))} m`;
}

/** Référence verticale lisible ; une référence non déclarée est dite telle quelle (aucune n'est supposée). */
export function texteReference(r: ReferenceVerticale): string {
  if (r.statut !== "declaree") return "non déclarée";
  return r.code ? `${r.libelle} (${r.code})` : r.libelle;
}

export const LIBELLES_QUALITE: Record<SourceTerrainRecue["qualite"]["etat"], string> = {
  "non-evaluee": "non évaluée",
  conforme: "conforme aux cibles",
  "non-conforme": "non conforme aux cibles",
  "sans-cible": "mesurée, sans cible",
};

/** Lignes « Sources et précision » (libellé, valeur) d'une source ; une valeur absente est « non évaluée » ou « non déclarée ». */
export function lignesSource(s: SourceTerrainRecue): [string, string][] {
  const p = precisionSupportee(s);
  const m = (v: number | null) => (v === null ? "non évaluée" : `${nombreFr(v, 3)} m`);
  return [
    ["Jeu", s.titre],
    ["Produit", s.produit === "MNT" ? "MNT (terrain nu)" : "MNS (surface, bâtiments et végétation compris)"],
    ["Date des données", s.date ?? "non déclarée"],
    ["Pas de la grille", `${nombreFr(s.pas.metres, s.pas.metres < 1 ? 2 : 1)} m`],
    ["Référence verticale", texteReference(s.referenceVerticale)],
    ["Qualité mesurée", s.qualite.n > 0 ? `RMSEz ${m(s.qualite.rmsez)} · P95 ${m(s.qualite.p95)} · ${s.qualite.n} points` : "non évaluée"],
    ["Précision déclarée", s.precisionDeclaree ? s.precisionDeclaree.texte : "non déclarée"],
    ["Précision retenue", p.nature === "mesuree" ? "mesurée" : p.nature === "declaree" ? "déclarée par le producteur" : "non évaluée"],
    ["État de validation", LIBELLES_QUALITE[s.qualite.etat]],
    ["Publiée le", s.publieeLe.slice(0, 10)],
    ["Attribution", s.attribution],
    ["Licence", s.licence.nom],
  ];
}

export type ModeLegende = "verrouillee" | "adaptee";
export interface PorteeLegende {
  readonly mode: ModeLegende;
  readonly plage: readonly [number, number] | null;
  readonly libelle: string;
  /** Zone d'étude dont les altitudes fixent la légende (portée « zone ») ; null pour la vue ou la version. */
  readonly zone: string | null;
}

/**
 * Portée de la légende d'altitude, toujours dite : verrouillée sur la plage de la version (comparable d'une vue à l'autre),
 * ou adaptée aux altitudes de la vue courante ou d'une zone d'étude (contraste local, non comparable). Sans plage connue :
 * « non évaluée ».
 */
export function porteeLegende(mode: ModeLegende, plageJeu: readonly [number, number] | null, adaptee: { readonly plage: readonly [number, number]; readonly zone: string | null } | null): PorteeLegende {
  if (mode === "adaptee" && adaptee && adaptee.plage[1] > adaptee.plage[0]) {
    return adaptee.zone
      ? { mode, plage: adaptee.plage, zone: adaptee.zone, libelle: "Légende adaptée à la zone d'étude (couleurs non comparables d'une zone à l'autre) :" }
      : { mode, plage: adaptee.plage, zone: null, libelle: "Légende adaptée à la vue courante : couleurs non comparables d'une vue à l'autre" };
  }
  if (mode === "adaptee") return { mode, plage: plageJeu, zone: null, libelle: "Adaptation indisponible : légende verrouillée sur la version" };
  return { mode, plage: plageJeu, zone: null, libelle: plageJeu ? "Légende verrouillée sur la plage complète de la version" : "Plage de la version non évaluée" };
}

/** Graduations régulières d'une légende (bornes comprises). */
export function graduations(min: number, max: number, n = 5): number[] {
  if (!(max > min) || n < 2) return [min];
  return Array.from({ length: n }, (_, i) => min + ((max - min) * i) / (n - 1));
}

/** Dégradé CSS d'une palette continue (légende). */
export const degrade = (palette: readonly string[]) => `linear-gradient(to right, ${palette.join(", ")})`;

/**
 * Équidistances proposées pour une version : celles de la liste qui respectent le seuil de précision (TER-D17) et qu'une
 * équidistance calculée divise ; le seuil lui-même s'il est hors liste et calculé. Jamais une valeur sous le seuil.
 */
export function equidistancesProposees(minimum: number, calculees: readonly number[]): number[] {
  const divisible = (e: number) => calculees.some((b) => b > 0 && b <= e + 1e-9 && Math.abs(e / b - Math.round(e / b)) < 1e-6);
  const candidats = new Set<number>([...EQUIDISTANCES, minimum, ...calculees]);
  return [...candidats].filter((e) => verifierEquidistance(e, minimum).ok && divisible(e)).sort((a, b) => a - b);
}

/** Longueur approchée d'une polyligne WGS 84 (haversine, rayon moyen), en mètres : seulement pour choisir un pas. */
export function longueurApprochee(sommets: readonly (readonly [number, number])[]): number {
  const R = 6_371_008.8, rad = Math.PI / 180;
  let l = 0;
  for (let i = 1; i < sommets.length; i++) {
    const [a, b] = [sommets[i - 1]!, sommets[i]!];
    const dl = (b[1] - a[1]) * rad, dg = (b[0] - a[0]) * rad;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dg / 2) ** 2;
    l += 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return l;
}

/**
 * Pas d'échantillonnage d'un profil : le pas natif le plus fin des jeux (jamais plus serré : ce serait de l'interpolation
 * présentée comme mesure), élargi pour rester sous `maxPoints` points ; arrondi à une valeur lisible (1, 2, 2,5, 5 × 10ⁿ).
 */
export function pasProfil(longueurM: number, pasNatifMin: number | null, maxPoints = 2000): number {
  const base = Math.max(pasNatifMin ?? 1, longueurM / maxPoints, 0.05);
  const p = 10 ** Math.floor(Math.log10(base));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= base - 1e-12) return Number((f * p).toPrecision(6));
  return base;
}

export interface TraceProfil {
  /** Segments continus du tracé ; `interpolee` : tous leurs points sont plus serrés que le pas natif (trait pointillé). */
  readonly segments: readonly { readonly d: string; readonly interpolee: boolean }[];
  readonly min: number | null;
  readonly max: number | null;
  readonly longueur: number;
  /** Abscisse SVG d'un chaînage (repères de transitions et de lacunes). */
  x(chainage: number): number;
  y(altitude: number): number;
}

/**
 * Tracé SVG d'un profil dans un cadre (marges comprises) : une lacune (altitude absente) coupe le trait, jamais comblée ;
 * un changement d'interpolation commence un nouveau segment.
 */
export function traceProfil(points: ProfilRecu["points"], cadre: { largeur: number; hauteur: number; marge: number }): TraceProfil {
  const valeurs = points.filter((p) => p.altitude !== null).map((p) => p.altitude!);
  const longueur = points.length ? points[points.length - 1]!.chainage : 0;
  const min = valeurs.length ? Math.min(...valeurs) : null;
  const max = valeurs.length ? Math.max(...valeurs) : null;
  const { largeur, hauteur, marge } = cadre;
  const etendue = min !== null && max !== null && max > min ? max - min : 1;
  const bas = min !== null && max !== null && max > min ? min : (min ?? 0) - 0.5;
  const x = (c: number) => marge + (longueur > 0 ? (c / longueur) * (largeur - 2 * marge) : 0);
  const y = (a: number) => hauteur - marge - ((a - bas) / etendue) * (hauteur - 2 * marge);
  const segments: { d: string; interpolee: boolean }[] = [];
  let courant: { pts: string[]; interpolee: boolean } | null = null;
  let precedent: (typeof points)[number] | null = null;
  const fermer = () => { if (courant && courant.pts.length >= 2) segments.push({ d: `M${courant.pts.join("L")}`, interpolee: courant.interpolee }); courant = null; };
  for (const p of points) {
    if (p.altitude === null) { fermer(); precedent = null; continue; }
    const q = `${x(p.chainage).toFixed(1)},${y(p.altitude).toFixed(1)}`;
    if (courant && courant.interpolee !== p.interpolee) {
      // Nouveau segment raccordé au point précédent : le trait reste continu, seul son style change.
      fermer();
      courant = { pts: precedent ? [`${x(precedent.chainage).toFixed(1)},${y(precedent.altitude!).toFixed(1)}`] : [], interpolee: p.interpolee };
    }
    if (!courant) courant = { pts: [], interpolee: p.interpolee };
    courant.pts.push(q);
    precedent = p;
  }
  fermer();
  return { segments, min, max, longueur, x, y };
}

/** Emprise [ouest, sud, est, nord] d'une géométrie GeoJSON (Polygon / MultiPolygon), ou null. */
export function empriseGeometrie(g: JeuTerrainRecu["couverture"]): [number, number, number, number] | null {
  if (!g) return null;
  const pts: number[][] = [];
  const parcourir = (c: unknown) => { if (Array.isArray(c) && typeof c[0] === "number") pts.push(c as number[]); else if (Array.isArray(c)) c.forEach(parcourir); };
  parcourir(g.coordinates);
  if (!pts.length) return null;
  return [Math.min(...pts.map((p) => p[0]!)), Math.min(...pts.map((p) => p[1]!)), Math.max(...pts.map((p) => p[0]!)), Math.max(...pts.map((p) => p[1]!))];
}

/** Intersection de deux emprises, ou null si elles ne se recoupent pas. */
export function intersectionEmprises(a: readonly [number, number, number, number], b: readonly [number, number, number, number]): [number, number, number, number] | null {
  const r: [number, number, number, number] = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[2] > r[0] && r[3] > r[1] ? r : null;
}

/** Polygone GeoJSON d'une emprise (anneau fermé). */
export const polygoneEmprise = (e: readonly [number, number, number, number]) => ({
  type: "Polygon" as const,
  coordinates: [[[e[0], e[1]], [e[2], e[1]], [e[2], e[3]], [e[0], e[3]], [e[0], e[1]]]] as [number, number][][],
});

/** Distance au format français (m sous 1 km, km au-delà). */
export const distanceFr = (m: number) => (m < 1000 ? `${nombreFr(m, m < 10 ? 1 : 0)} m` : `${nombreFr(m / 1000, 2)} km`);

/**
 * Message de couverture de la vue (plan TER-05) : aucun jeu publié, ou seulement un modèle régional / mondial (aucun levé
 * local) ; null quand un levé local recoupe la vue. Lecture par l'emprise des couvertures (indicative, jamais une valeur).
 */
export function messageCouverture(jeux: readonly Pick<JeuTerrainRecu, "couverture" | "niveau">[], vue: readonly [number, number, number, number] | null): string | null {
  if (!vue) return null;
  const dansVue = jeux.filter((j) => { const e = empriseGeometrie(j.couverture); return !!e && !!intersectionEmprises(e, vue); });
  if (!dansVue.length) return "Aucun jeu publié ne couvre la vue : centrez la carte sur une couverture disponible.";
  if (!dansVue.some((j) => j.niveau === "leve-local")) return "Seul un modèle régional ou mondial couvre la vue : aucun levé local ici (précision limitée).";
  return null;
}
