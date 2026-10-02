/**
 * Site et paysage (étape 01) — porté de `h7-app` (Parcours V7) du
 * prototype : `siteContext`, `siteOptions`, `recommended(1)`, la validation
 * de `save-site` et le schéma SVG `svgSite` / `siteLegend`.
 *
 * Les propositions A/B/C de l'étape 01 ne sont pas des textes fixes : elles
 * se calculent sur le contour de la parcelle du projet (zonage de
 * `@parcours/core-geometry`), sur le côté d'approche et sur les
 * observations déclarées. Rien n'est déduit d'une image : un scénario saisi
 * n'est pas une observation, et les surfaces des zones sont des intentions,
 * pas des droits à construire.
 *
 * Repères : le contour arrive dans son repère cadastral (CRS déclaré,
 * mètres) ; le zonage et le schéma travaillent dans un repère LOCAL (origine
 * au centroïde) ; la géolocalisation WGS84 (longitude / latitude) ne sert
 * qu'à l'affichage et vient d'une conversion explicite fournie par
 * l'appelant, jamais d'un mélange de repères.
 */
import { polygonArea, siteZoning, sumArea, vertexCentroid, type Point2, type SiteVariant, type SiteZoning } from "@parcours/core-geometry";
import type { GeographicCoordinate } from "./entities.js";
import { HarmonieError, type HarmonieProfile, type HarmonieProposalComputation } from "./harmonie.js";

export type SiteApproachStatus = "hypothesis" | "documented";
export type SitePriority = "balanced" | "retreat" | "service";
export type SiteFrontContext = "unknown" | "open" | "exposed" | "enclosed";
export type SiteBackContext = "unknown" | "open" | "built" | "vegetation";

/** Repère géographique saisi à la main (« si la conversion manque »). */
export interface SiteManualGeographic {
  longitude: number;
  latitude: number;
  source: string;
}

/** Altimétrie collectée (service externe, à la demande) — conservée telle quelle quand elle existe. */
export interface SiteElevation {
  points: unknown[];
  range: number;
  at: string;
}

/** `harmonieEtapesV7.site` du prototype : les données du site déclarées par le projet. */
export interface SiteObservations {
  frontageEdge: number | null;
  approachStatus: SiteApproachStatus;
  priority: SitePriority;
  frontContext: SiteFrontContext;
  backContext: SiteBackContext;
  source: string;
  note: string;
  geographic: SiteManualGeographic | null;
  elevation: SiteElevation | null;
  observedAt: string | null;
}

export const DEFAULT_SITE_OBSERVATIONS: SiteObservations = {
  frontageEdge: null,
  approachStatus: "hypothesis",
  priority: "balanced",
  frontContext: "unknown",
  backContext: "unknown",
  source: "",
  note: "",
  geographic: null,
  elevation: null,
  observedAt: null,
};

/** Intitulés des choix du formulaire « Données du site » (prototype). */
export const SITE_OBSERVATION_LABELS = {
  approachStatus: [
    ["hypothesis", "Hypothèse de travail"],
    ["documented", "Documentée selon la source déclarée"],
  ],
  priority: [
    ["balanced", "Accueil et extérieur équilibrés"],
    ["retreat", "Retrait extérieur prioritaire"],
    ["service", "Séparation des mouvements"],
  ],
  frontContext: [
    ["unknown", "Non observé"],
    ["open", "Ouvert — scénario / observation à sourcer"],
    ["exposed", "Exposé aux mouvements — à sourcer"],
    ["enclosed", "Bâti proche — à sourcer"],
  ],
  backContext: [
    ["unknown", "Non observé"],
    ["open", "Ouvert"],
    ["built", "Masse bâtie"],
    ["vegetation", "Végétation"],
  ],
} as const satisfies Record<string, readonly (readonly [string, string])[]>;

const BACK_CONTEXT_WORDING: Record<string, string> = { open: "ouvert", built: "masse bâtie", vegetation: "végétation" };

/** La parcelle du projet telle que le domaine `nativeParcel` la décrit (sommets dans le repère cadastral du CRS déclaré). */
export interface SiteParcel {
  vertices: Point2[];
  vertexIds: string[];
  crs: string;
  units: string;
  officialArea: number | null;
  parcelNumber: string;
  commune: string;
  sourceFile: string;
}

export interface SiteGeographic {
  /** Centre du contour en WGS84, ou `null` : aucun centre n'est inventé. */
  center: GeographicCoordinate | null;
  points: GeographicCoordinate[] | null;
  source: string;
  hypothesis: boolean;
}

export interface SiteContext {
  parcel: SiteParcel;
  /** Contour dans le repère local (origine au centroïde des sommets, mètres). */
  local: Point2[];
  origin: Point2;
  area: number;
  /** Côté d'approche choisi (indice de sommet) ou `null`. */
  frontage: number | null;
  geo: SiteGeographic;
  observations: SiteObservations;
  profile: HarmonieProfile;
}

/** Conversion explicite CRS déclaré → WGS84 (`[longitude, latitude]`), fournie par l'appelant ; `null` quand le CRS est inconnu. */
export type GeographicConverter = (crs: string, point: Point2) => Point2 | null;

export const EMPTY_SITE_PARCEL: SiteParcel = { vertices: [], vertexIds: [], crs: "", units: "m", officialArea: null, parcelNumber: "", commune: "", sourceFile: "" };

/** `geographic()` du prototype : conversion du contour si le CRS est connu, sinon repère saisi, sinon « à documenter ». */
export function siteGeographic(parcel: SiteParcel, observations: SiteObservations, convert: GeographicConverter | null): SiteGeographic {
  const out: SiteGeographic = { points: null, center: null, source: "Géoréférencement à documenter", hypothesis: true };
  const pts = parcel.vertices;
  if (!pts.length) return out;
  if (parcel.crs && convert) {
    const ll = pts.map((q) => convert(parcel.crs, q));
    if (ll.every((q): q is Point2 => !!q && q.every(Number.isFinite) && Math.abs(q[0]) < 180 && Math.abs(q[1]) < 85)) {
      const center = convert(parcel.crs, vertexCentroid(pts));
      if (center) {
        out.points = ll.map((q) => ({ frame: "geographic", lon: q[0], lat: q[1] }));
        out.center = { frame: "geographic", lon: center[0], lat: center[1] };
        out.source = `Conversion ${parcel.crs} → WGS84 ; système source à confirmer`;
        return out;
      }
    }
  }
  const manual = observations.geographic;
  if (manual && Number.isFinite(manual.longitude) && Number.isFinite(manual.latitude)) {
    out.center = { frame: "geographic", lon: manual.longitude, lat: manual.latitude };
    out.source = manual.source || "Repérage saisi, sans calage du contour";
  }
  return out;
}

/** `siteContext()` du prototype, sans lecture d'état caché : parcelle, observations et profil sont passés explicitement. */
export function siteContext(parcel: SiteParcel | null, observations: SiteObservations, profile: HarmonieProfile, convert: GeographicConverter | null = null): SiteContext {
  const p = parcel ?? EMPTY_SITE_PARCEL;
  const poly = p.vertices.map((q): Point2 => [q[0], q[1]]);
  const origin = vertexCentroid(poly);
  const local = poly.map((q): Point2 => [q[0] - origin[0], q[1] - origin[1]]);
  const edge = observations.frontageEdge;
  const frontage = Number.isInteger(edge) && (edge as number) >= 0 && (edge as number) < poly.length ? (edge as number) : null;
  return { parcel: { ...p, vertices: poly }, local, origin, area: polygonArea(local), frontage, geo: siteGeographic(p, observations, convert), observations, profile };
}

export const fmtFr = (v: number | null | undefined, digits = 2): string => (Number.isFinite(v as number) ? (v as number).toLocaleString("fr-FR", { maximumFractionDigits: digits }) : "—");

export interface SiteOption {
  key: SiteVariant;
  title: string;
  text: string;
  benefit: string;
  tradeoff: string;
  why: string;
  conditions: string;
  source: string;
  zoning: SiteZoning | null;
}

const SITE_OPTION_TEXTS: [SiteVariant, string, string, string, string][] = [
  [
    "A",
    "Accueil ouvert, jardin en retrait",
    "Préserver une transition extérieure côté approche, un secteur central d’implantation à étudier et un espace ouvert en arrière ; dissocier une desserte latérale.",
    "Lisibilité de l’arrivée et continuité avec l’espace ouvert.",
    "Moins d’espace ouvert que la variante B.",
  ],
  [
    "B",
    "Extérieur protégé prioritaire",
    "Donner davantage de place à un espace ouvert en retrait et réduire le secteur d’implantation à étudier ; éviter les traversées de service dans cet espace.",
    "Préserve une possibilité de retrait spatial.",
    "Peut limiter la capacité future ; aucun calme acoustique n’est déduit.",
  ],
  [
    "C",
    "Arrivées et desserte dissociées",
    "Réserver une bande latérale plus importante à la desserte et aux transitions, avec un accueil extérieur distinct et un espace ouvert séparé.",
    "Permet d’étudier des mouvements différenciés.",
    "Emprise de circulation plus importante et accès supplémentaires non garantis.",
  ],
];

/** `siteOptions(c)` du prototype : les trois propositions de site, avec leur zonage calculé sur le contour réel (ou `null`). */
export function siteOptions(c: SiteContext): SiteOption[] {
  const ids = c.parcel.vertexIds;
  const n = c.local.length;
  const note =
    c.frontage === null
      ? "L’approche n’est pas documentée : le premier côté sert uniquement de repère graphique ; choisissez le côté dans les données du site."
      : `Approche étudiée depuis ${ids[c.frontage] || "borne " + (c.frontage + 1)} → ${ids[(c.frontage + 1) % n] || "borne suivante"}, ${c.observations.approachStatus === "documented" ? "déclarée documentée" : "hypothétique"}.`;
  const back = c.observations.backContext !== "unknown" ? `Contexte arrière déclaré : ${BACK_CONTEXT_WORDING[c.observations.backContext] || "à préciser"} ; examiner les possibilités d’appui sans présumer de leur qualité.` : "";
  const elevation = c.observations.elevation ? `Altimétrie de service : amplitude ${fmtFr(c.observations.elevation.range)} m sur les points reçus ; tester l’implantation et les accès en coupe de terrain.` : "";
  const zoningInput = { local: c.local, area: c.area, units: c.parcel.units, crs: c.parcel.crs, frontage: c.frontage };
  return SITE_OPTION_TEXTS.map(([key, title, text, benefit, tradeoff]) => {
    let zoning: SiteZoning | null = null;
    try {
      zoning = siteZoning(zoningInput, key);
    } catch {
      zoning = null; // contour dégénéré : aucun schéma, jamais une forme de remplacement
    }
    return {
      key,
      title,
      text,
      benefit,
      tradeoff,
      why: `${c.profile.site} ${note} ${back} ${elevation}`.replace(/\s+/g, " ").trim(),
      conditions: "Ratios illustratifs d’organisation du sol, pas des droits à construire. Accès, relief, limites, usages admissibles et dimensionnement à confirmer.",
      source: "Contour source + scénario de programmation ; contexte réel non déduit sans observation.",
      zoning,
    };
  });
}

/** Les propositions de l'étape 01 sous la forme que `buildHarmonieProposals` consomme. */
export function siteProposalComputation(c: SiteContext): HarmonieProposalComputation {
  return {
    options: siteOptions(c).map((o) => ({ key: o.key, title: o.title, proposal: o.text, benefit: o.benefit, tradeoff: o.tradeoff, validation: o.conditions, why: o.why, source: o.source, zoning: o.zoning })),
    recommendedKey: recommendedSiteOption(c.observations).key,
  };
}

/** `recommended(1, …)` du prototype : la proposition de départ selon la priorité et le contexte déclarés. */
export function recommendedSiteOption(s: SiteObservations): { key: SiteVariant; reason: string } {
  if (s.priority === "service") return { key: "C", reason: "Votre priorité déclarée est la séparation des mouvements." };
  if (s.priority === "retreat" || s.frontContext === "exposed") {
    return {
      key: "B",
      reason: s.frontContext === "exposed" ? "Scénario de façade exposée déclaré : privilégier un retrait à tester, sans présumer d’un niveau sonore." : "Votre priorité déclarée est l’espace extérieur de retrait.",
    };
  }
  return { key: "A", reason: "Point de départ équilibré accueil / espace ouvert, provisoire tant que l’approche et les observations ne sont pas documentées." };
}

/** Règle de `save-site` : une approche documentée exige son côté et sa source. */
export function validateSiteObservations(next: SiteObservations, vertexCount: number): SiteObservations {
  const edge = next.frontageEdge;
  if (edge !== null && (!Number.isInteger(edge) || edge < 0 || edge >= vertexCount)) throw new HarmonieError("Côté d’approche inconnu pour ce contour.");
  if (next.approachStatus === "documented" && (edge === null || String(next.source).trim().length < 8)) {
    throw new HarmonieError("Pour une approche documentée, choisissez son côté et indiquez sa source.");
  }
  return next;
}

// --- Schéma SVG (svgSite / siteLegend) -------------------------------------

const escapeXml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** Les données que le schéma lit : un sous-ensemble du contexte, sérialisable tel quel. */
export interface SiteSketchInput {
  local: readonly Point2[];
  area: number;
  vertexIds: readonly string[];
  crs: string;
  approachStatus: SiteApproachStatus;
}

export const SITE_SVG_EMPTY = "Importez un contour polygonal valide en mètres pour obtenir les schémas du site. Aucune parcelle rectangulaire de remplacement n’est créée.";

/** `svgSite(c, z)` du prototype — organisation du terrain réel, sans plan intérieur. */
export function siteSvg(c: SiteSketchInput, z: SiteZoning): string {
  const W = 900;
  const Hh = 560;
  const xs = c.local.map((p) => p[0]);
  const ys = c.local.map((p) => p[1]);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const scale = Math.min(690 / (xmax - xmin), 380 / (ymax - ymin));
  const cx = (xmin + xmax) / 2;
  const cy = (ymin + ymax) / 2;
  const xy = (q: Point2): Point2 => [450 + (q[0] - cx) * scale, 268 - (q[1] - cy) * scale];
  const path = (pts: readonly Point2[]) => pts.map((q) => xy(q).join(",")).join(" ");
  const edge = z.edge;
  const aa = c.local[edge]!;
  const bb = c.local[(edge + 1) % c.local.length]!;
  const marks = z.zones
    .map((zone, i) => {
      const largest = zone.polys.reduce((a, b) => (polygonArea(a) > polygonArea(b) ? a : b), zone.polys[0] ?? []);
      const p = xy(vertexCentroid(largest));
      return `<g>${zone.polys.map((poly) => `<polygon points="${path(poly)}" fill="${zone.color}" fill-opacity=".75" stroke="none"/>`).join("")}<circle cx="${p[0]}" cy="${p[1]}" r="14" fill="#fff" stroke="#264b40"/><text x="${p[0]}" y="${p[1] + 4}" text-anchor="middle" font-size="13" font-weight="bold">${i + 1}</text></g>`;
    })
    .join("");
  const pts = c.local
    .map((p, i) => {
      const q = xy(p);
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      return `<circle cx="${q[0]}" cy="${q[1]}" r="4" fill="#fff" stroke="#183f35"/><text x="${q[0] + (dx >= 0 ? 9 : -9)}" y="${q[1] + (dy >= 0 ? -12 : 20)}" text-anchor="${dx >= 0 ? "start" : "end"}" font-size="12">${escapeXml(c.vertexIds[i] || "B" + (i + 1))}</text>`;
    })
    .join("");
  const bar = 10 * scale;
  const show10 = bar < 400;
  const approach = z.edgeAssumed ? "non choisi · repère graphique seulement" : c.approachStatus === "documented" ? "déclaré documenté" : "sous hypothèse";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Variante ${z.variant} : organisation du terrain réel, sans plan intérieur">` +
    `<title>Organisation du site · ${z.variant} · propositions à arbitrer</title><rect width="900" height="560" rx="12" fill="#fafbf7"/>` +
    `<g fill="#214a40" font-family="Arial"><text x="24" y="28" font-size="14" font-weight="bold">SITE · VARIANTE ${z.variant} · ${fmtFr(c.area)} m² calculés</text>` +
    `<text x="24" y="49" font-size="11">Organisation du sol hypothétique · aucune emprise bâtie ni conformité déduite</text>${marks}` +
    `<polygon points="${path(c.local)}" fill="none" stroke="#23493e" stroke-width="2"/>` +
    `<line x1="${xy(aa)[0]}" y1="${xy(aa)[1]}" x2="${xy(bb)[0]}" y2="${xy(bb)[1]}" stroke="#cf7a35" stroke-width="5" stroke-dasharray="${z.edgeAssumed ? "8 5" : "none"}"/>${pts}` +
    `<text x="26" y="491" font-size="12">Orange : côté d’approche ${approach}</text>` +
    `<text x="26" y="515" font-size="11">${escapeXml(c.crs || "Repère local")} · +Y vers le haut ; orientation géographique à confirmer</text>` +
    (show10 ? `<path d="M650 492v8h${bar}v-8" fill="none" stroke="#264b40" stroke-width="2"/><text x="${650 + bar / 2}" y="520" font-size="12" text-anchor="middle">10 m</text>` : "") +
    `</g></svg>`
  );
}

export interface SiteLegendRow {
  index: number;
  name: string;
  color: string;
  area: number;
  /** Part de la surface zonée, en pourcentage. */
  share: number;
}

/** `siteLegend(z)` du prototype, sous forme de données (l'affichage est celui de l'interface). */
export function siteLegend(z: SiteZoning): SiteLegendRow[] {
  const total = sumArea(z.zones.flatMap((x) => x.polys));
  return z.zones.map((q, i) => ({ index: i + 1, name: q.name, color: q.color, area: q.area, share: total > 0 ? (q.area / total) * 100 : 0 }));
}
