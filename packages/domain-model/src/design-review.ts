/**
 * Bilan Harmonie du bâtiment conçu — porté de `flow-v62` (Parcours V6.2 /
 * V7) : `analyse` (faits de la parcelle et du modèle, entrée de référence,
 * cibles, actions et réserves, empreinte des entrées, péremption de la revue),
 * `audit` (contrôle des transmissions du dossier), `svgPlan` (lecture d'un
 * niveau depuis les polygones et murs réels), `review` (revue de conception
 * archivée) et `reportHTML` (document autonome « Bilan Harmony du bâtiment
 * conçu »).
 *
 * Repères : la parcelle, son recul et l'emprise sont dans le repère
 * cadastral du modèle natif ; les niveaux (locaux, murs) dans le repère local
 * du modèle dont l'origine est le centroïde de la parcelle. La conversion
 * est explicite (`toLocal`), jamais implicite. Aucun objet de dessin n'est
 * modifié par l'analyse. Les textes propres à l'exemple P.118 ne sont
 * affichés que pour lui (`example`), jamais inventés pour un autre projet.
 */
import type { Point2 } from "@parcours/core-geometry";
import { cardinalOf, compassStatus, natalStatus, normDeg, type DesignReviewSnapshot, type HarmonyDossier, type HarmonyEngineData } from "./harmony-engine.js";
import { analyseFloors, analyseRooms, fnv1a, polygonCenter, pointInPolygon, semantic, stableArea, type ModelFloor, type ModelRoom, type NativeFloorDesignLike, type NativeLevelLike, type RoomLinkTargets } from "./model-analysis.js";
import { HarmonieError } from "./harmonie.js";
import type { ParcoursFieldValue } from "./parcours.js";
import { programmeCaseSums, type ProgrammeSums } from "./programme.js";

export const DESIGN_REVIEW_VERSION = "6.2.0";

// --- Entrées ---------------------------------------------------------------

export interface DesignParcel {
  /** Repère cadastral du modèle natif. */
  vertices: Point2[];
  centroid?: Point2 | null;
  crs?: string;
  officialArea?: number | null;
  setback?: { envelope?: Point2[] } | null;
}

export interface DesignGeoreference {
  latitude: number;
  longitude: number;
  /** Azimut du nord géographique par rapport au +Y de la grille du modèle (degrés). */
  projectNorth: number | null;
  crs?: string;
  method?: string;
  status?: string;
  source: string;
  hypothesis: boolean;
}

export interface DesignAssumption {
  id: string;
  topic: string;
  value: string;
  source: string;
  validation: string;
  owner: string;
  status: string;
}

export interface DesignProgrammeCase {
  caseId: string;
  type?: string;
  spaces: { id: string; name: string; quantity: number; unitArea: number; bucket?: string | undefined; [k: string]: unknown }[];
  roomLinks?: Record<string, string[]>;
  hypotheses?: unknown;
  revision?: number;
}

/** Observation du contexte extérieur déclarée par l'utilisateur (voies, masses voisines, date, source, limites). */
export interface SiteContextDeclaration {
  observation: string;
  /** Toujours « Déclaration utilisateur, non contrôle indépendant » (prototype). */
  observationStatus: string;
  observedAt: string;
  satelliteObserved: boolean;
  /** Altitude indicative du centre (`collectElevation` de flow-v62), collectée à la demande ; jamais inventée. */
  elevation?: SiteContextElevation | null;
}

export interface SiteContextElevation {
  value: number;
  unit: "m";
  coordinates: [number, number];
  at: string;
  source: string;
  /** Toujours « service numérique, non relevé topographique » (prototype). */
  quality: string;
}

/** `collectElevation` de flow-v62 : l'altitude du centre reçue du service, posée sur le contexte (observation conservée). */
export function withCenterElevation(current: SiteContextDeclaration | null, point: readonly [number, number, number], now: string): SiteContextDeclaration {
  if (point.length < 3 || !point.slice(0, 3).every(Number.isFinite)) throw new HarmonieError("Coordonnées ou altitude de réponse incohérentes");
  return {
    observation: current?.observation ?? "",
    observationStatus: current?.observationStatus ?? "",
    observedAt: current?.observedAt ?? "",
    satelliteObserved: current?.satelliteObserved === true,
    elevation: { value: point[2], unit: "m", coordinates: [point[0], point[1]], at: now, source: "MapTiler Elevation API", quality: "service numérique, non relevé topographique" },
  };
}

/** Règle du prototype : une observation déclarée décrit la source, la date et ce qui a été observé (20 caractères minimum). */
export const SITE_OBSERVATION_MIN = 20;
export const SITE_OBSERVATION_STATUS = "Déclaration utilisateur, non contrôle indépendant";
export function declareSiteObservation(note: string, now: string, current: SiteContextDeclaration | null = null): SiteContextDeclaration {
  const observation = note.trim();
  if (observation.length < SITE_OBSERVATION_MIN) throw new HarmonieError("Décrivez la source, la date et ce qui a été observé (20 caractères minimum).");
  return { observation, observationStatus: SITE_OBSERVATION_STATUS, observedAt: now, satelliteObserved: true, elevation: current?.elevation ?? null };
}

export interface DesignReviewInput {
  projectId: string;
  projectName: string;
  nativeId: string | null;
  levels: readonly NativeLevelLike[];
  floor: NativeFloorDesignLike;
  parcel: DesignParcel | null;
  /** Emprise dessinée, repère cadastral. */
  footprint: Point2[];
  solarSite: Record<string, unknown> | null;
  programmeCase: DesignProgrammeCase | null;
  /** `caseTotals` de la répartition (contrôle Programme → Répartition). */
  repartitionCaseTotals: unknown;
  /** Observations du site (étape 01) : contexte extérieur, repère géographique saisi. */
  siteObservations: Record<string, unknown> | null;
  /**
   * Contexte extérieur déclaré (`siteContextV62` du prototype, sans la collecte MapTiler) : une observation datée,
   * consignée par l'utilisateur — jamais une collecte automatique ni un contrôle indépendant.
   */
  siteContext: SiteContextDeclaration | null;
  business: ReadonlyMap<number, Record<string, ParcoursFieldValue>>;
  /** Textes générés par le programme appliqué, exclus de l'empreinte des entrées manuelles. */
  generatedTexts: Record<string, Record<string, string>>;
  harmony: HarmonyDossier;
  georeference: DesignGeoreference | null;
  /** Hypothèses de travail du dossier (H-GEO, H-ENTREE…) : celles de l'exemple pour P.118, sinon celles saisies. */
  assumptions: DesignAssumption[];
  /** Projet issu de l'exemple P.118 (`ownsP118`) : les lectures propres à ce dossier s'appliquent. */
  example: boolean;
  parcelTransmission: { status?: string; reason?: string } | null;
  decision19: string | null;
  textConflicts: number;
  engine: HarmonyEngineData;
  now: string;
}

// --- Géométrie (celle du prototype) ----------------------------------------

const dist = (a: Point2, b: Point2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a: Point2, b: Point2, c: Point2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const crosses = (a: Point2, b: Point2, c: Point2, d: Point2) => cross(a, b, c) * cross(a, b, d) < -1e-8 && cross(c, d, a) * cross(c, d, b) < -1e-8;

export function validPolygon(poly: unknown): poly is Point2[] {
  if (!Array.isArray(poly) || poly.length < 3 || poly.length > 5000) return false;
  if (!poly.every((p) => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(Number.isFinite))) return false;
  const q = poly as Point2[];
  if (stableArea(q) <= 1e-5) return false;
  return !q.some((a, i) => q.some((c, j) => j > i + 1 && !(i === 0 && j === q.length - 1) && crosses(a, q[(i + 1) % q.length]!, c, q[(j + 1) % q.length]!)));
}

/** `containment(inner, outer)` : `null` quand l'un des contours n'est pas exploitable. */
export function containment(inner: unknown, outer: unknown): boolean | null {
  if (!validPolygon(inner) || !validPolygon(outer)) return null;
  return inner.every((p) => pointInPolygon(p, outer)) && !inner.some((a, i) => outer.some((c, j) => crosses(a, inner[(i + 1) % inner.length]!, c, outer[(j + 1) % outer.length]!)));
}

function pointSegmentDist(p: Point2, a: Point2, b: Point2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const n = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (n || 1)));
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

export const bearingDeg = (a: Point2, b: Point2): number => normDeg((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI);

/** Repère cadastral → repère local du modèle (origine : centroïde de la parcelle). */
export function toLocal(points: readonly Point2[], origin: Point2): Point2[] {
  return points.map((p): Point2 => [p[0] - origin[0], p[1] - origin[1]]);
}

// --- Analyse ---------------------------------------------------------------

export interface DesignRoom extends ModelRoom {
  /** Secteur cardinal du local depuis le centre de l'emprise, sous l'hypothèse de nord géographique ; « Non référencé » sans géoréférencement. */
  sector: string;
}

export interface DesignEntry {
  id: string;
  /** Point de la porte, repère local. */
  point: Point2;
  width: number | null;
  height: number | null;
  wallId: string;
  gridBearing: number;
  trueBearing: number | null;
  source: string;
}

export interface DesignFacts {
  parcelArea: number | null;
  officialArea: number | null;
  footprint: number | null;
  setbackArea: number | null;
  /** Distance minimale de l'emprise à chaque côté de la parcelle (m). */
  setbacks: number[];
  inside: boolean | null;
  insideSetback: boolean | null;
  gross: number | null;
  net: number | null;
  roomArea: number;
  roomCount: number;
  height: number | null;
}

export interface DesignIssue {
  id: string;
  priority: string;
  title: string;
  body: string;
  refs: string[];
  step: number;
}

export interface DesignAnalysis {
  version: string;
  projectId: string;
  name: string;
  nativeId: string | null;
  nativeHash: string;
  inputHash: string;
  facts: DesignFacts;
  floors: ModelFloor[];
  rooms: DesignRoom[];
  entry: DesignEntry | null;
  geo: DesignGeoreference | null;
  totals: ProgrammeSums | null;
  issues: DesignIssue[];
  sourceSummary: string;
  generatedAt: string;
  geometryMutation: false;
  /** La revue archivée a été établie sur d'autres entrées. */
  stale: boolean;
  /** Centroïde de la parcelle (repère cadastral) : origine du repère local. */
  origin: Point2;
}

const fmtFr = (x: number | null | undefined, n = 2): string => (Number.isFinite(x as number) ? (x as number).toLocaleString("fr-FR", { maximumFractionDigits: n }) : "Non renseigné");

/** `analyse(p)` : la lecture vivante du modèle courant. */
export function designAnalysis(input: DesignReviewInput): DesignAnalysis {
  const parcelVertices = input.parcel?.vertices ?? [];
  const origin: Point2 = input.parcel?.centroid ?? polygonCenter(parcelVertices);
  const fpLocal = toLocal(input.footprint, origin);
  const bc = polygonCenter(fpLocal);
  const g = input.georeference;
  const geoAngle = g?.projectNorth ?? null;
  const programme: RoomLinkTargets | null = input.programmeCase ? { spaces: input.programmeCase.spaces.map((s) => ({ id: s.id, quantity: s.quantity, unitArea: s.unitArea })), roomLinks: input.programmeCase.roomLinks ?? {} } : null;
  const baseRooms = analyseRooms(input.levels, input.floor, programme);
  const rooms: DesignRoom[] = baseRooms.map((r) => {
    const angle = geoAngle === null ? null : normDeg(bearingDeg(bc, r.center) + geoAngle);
    return { ...r, sector: angle === null ? "Non référencé" : `${cardinalOf(input.engine, angle)} (hyp.)` };
  });
  const floors = analyseFloors(input.levels, input.floor, baseRooms);

  // Entrée de référence (H-ENTREE) : porte et mur hôte du modèle.
  const levelsMap = input.floor.levels ?? {};
  const entryRef = String(input.harmony.compass?.entryId || "rdc|EX118-rdc-doors-9");
  const entryId = entryRef.split("|").at(-1) ?? "";
  const entryLevel = entryRef.split("|")[0] ?? "rdc";
  const em = levelsMap[entryLevel] ?? levelsMap["rdc"];
  const door = (em?.doors ?? []).find((q) => q.id === entryId);
  const wall = (em?.walls ?? []).find((q) => q.id === door?.hostWallId);
  let entry: DesignEntry | null = null;
  if (door && wall) {
    const t = door.t ?? 0.5;
    const point: Point2 = [wall.a[0] + (wall.b[0] - wall.a[0]) * t, wall.a[1] + (wall.b[1] - wall.a[1]) * t];
    const dx = wall.b[0] - wall.a[0];
    const dy = wall.b[1] - wall.a[1];
    let n: Point2 = [dy, -dx];
    if (n[0] * (point[0] - bc[0]) + n[1] * (point[1] - bc[1]) < 0) n = [-n[0], -n[1]];
    const grid = normDeg((Math.atan2(n[0], n[1]) * 180) / Math.PI);
    entry = { id: entryRef, point, width: door.width ?? null, height: door.height ?? null, wallId: wall.id, gridBearing: grid, trueBearing: geoAngle === null ? null : normDeg(grid + geoAngle), source: "Porte / mur hôte du modèle ; choix de façade = H-ENTREE" };
  }

  const a = input.programmeCase;
  const totals = a ? programmeCaseSums(a.spaces) : null;
  const nativeHash = fnv1a(semantic({ id: input.nativeId, parcel: input.parcel ?? null, levels: input.levels, floor: input.floor, footprint: input.footprint, solarSite: input.solarSite }));
  const manualBrief = Object.fromEntries(
    [2, 4, 5, 6, 7, 8, 9, 12, 13, 16].map((n) => [String(n), Object.fromEntries(Object.entries(input.business.get(n) ?? {}).filter(([k, v]) => v !== input.generatedTexts[String(n)]?.[k]))]),
  );
  const h = input.harmony;
  const inputHash = fnv1a({
    nativeHash,
    case: a ? { id: a.caseId, type: a.type, spaces: a.spaces, links: a.roomLinks, hypotheses: a.hypotheses } : null,
    context: { site: input.siteObservations, exterior: input.siteContext },
    manualBrief,
    ambiences: h.ambiences,
    workingAssumptions: h.workingAssumptionsV62 ?? null,
    compass: h.compass,
    timeline: h.timeline,
    roomData: h.roomData,
    observations: h.observations,
    config: h.config,
  });

  const footArea = input.footprint.length ? stableArea(input.footprint) : null;
  const parcelArea = parcelVertices.length ? stableArea(parcelVertices) : null;
  const setbacks = parcelVertices.length && input.footprint.length ? parcelVertices.map((v, i) => Math.min(...input.footprint.map((q) => pointSegmentDist(q, v, parcelVertices[(i + 1) % parcelVertices.length]!)))) : [];
  const gross = floors.every((x) => x.gross !== null) ? floors.reduce((s, x) => s + (x.gross ?? 0), 0) : null;
  const net = floors.every((x) => x.slabNet !== null) ? floors.reduce((s, x) => s + (x.slabNet ?? 0), 0) : null;
  const envelope = input.parcel?.setback?.envelope;
  const aboveGround = input.levels.filter((l) => typeof l.elevation === "number" && l.elevation >= 0);
  const facts: DesignFacts = {
    parcelArea,
    officialArea: input.parcel?.officialArea ?? null,
    footprint: footArea,
    setbackArea: envelope?.length ? stableArea(envelope) : null,
    setbacks,
    inside: containment(input.footprint, parcelVertices),
    insideSetback: containment(input.footprint, envelope),
    gross,
    net,
    roomArea: rooms.reduce((s, r) => s + r.area, 0),
    roomCount: rooms.length,
    height: aboveGround.length ? Math.max(...aboveGround.map((l) => (l.elevation as number) + (typeof l.height === "number" ? l.height : 0))) : null,
  };

  const issues: DesignIssue[] = [];
  const issue = (id: string, priority: string, title: string, body: string, refs: string[] = [], step = 10) => issues.push({ id, priority, title, body, refs, step });
  if (input.nativeId && !input.levels.length) issue("NO-MODEL", "à documenter", "Modèle non dessiné", "Aucune géométrie de bâtiment : les besoins ne sont pas des surfaces mesurées.");
  if (facts.inside === false || facts.insideSetback === false) issue("IMPLANTATION", "prioritaire", "Emprise hors contour ou recul de travail", "La comparaison polygonale détecte un débord. Réexaminer l’implantation ; pas de correction décorative.", [], 9);
  const offTarget = rooms.filter((r) => r.delta !== null && Math.abs(r.delta) > 0.05);
  if (a && offTarget.length) issue("TARGETS", "à arbitrer", "Écarts entre cibles et dessin", "Les cibles programmatiques sont conservées. Examiner les écarts localisés dans le tableau ; un écart ne modifie pas les polygones.", offTarget.map((r) => r.id), 7);
  if (input.example && input.levels.some((l) => typeof l.elevation === "number" && l.elevation >= 0 && typeof l.height === "number" && l.height < 3.5)) {
    issue("HEIGHT", "prioritaire", "Hauteurs : conflit avec la référence du dossier", "Étages de 3,20 / 3,40 m dans la source, contre un minimum sous plafond de 3,50 m cité par le dossier I5. Applicabilité à confirmer ; aucune conformité acquise.", [], 8);
  }
  const crowded = rooms.filter((r) => (r.usage === "bureau" || r.usage === "direction") && r.capacity && r.ratio !== null && r.ratio < 6);
  if (crowded.length) issue("DENSITY", "à arbitrer", "Densité des postes à éprouver", `${crowded.map((r) => `${r.levelName} / ${r.name} : ${fmtFr(r.ratio)} m²/poste indiqué.`).join(" ")} La comparaison à 6 m²/poste est une hypothèse de confort, pas un minimum légal.`, crowded.map((r) => r.id), 7);
  const mezz = floors.find((l) => l.id === "mezz");
  if (mezz) issue("MEZZ", "à étudier", "Mezzanine et RDC : acoustique / transitions", `Mezzanine partielle : ${fmtFr(mezz.gross)} m² de contour de dalle. Étudier l’effet de l’ouverture sur bruit, intimité et sécurité de rive ; ne pas l’interpréter comme un secteur manquant du bâtiment entier.`, rooms.filter((r) => r.level === "mezz").map((r) => r.id));
  const ramp = ((levelsMap["ss"]?.["meta"] as Record<string, unknown> | undefined)?.["basementAccess"] ?? (input.floor["meta"] as Record<string, unknown> | undefined)?.["basementAccess"]) as Record<string, unknown> | undefined;
  if (ramp) issue("RAMP", "prioritaire", "Accès technique et rampe dans le recul", `Largeur libre ${fmtFr(Number(ramp["clearWidthM"]))} m ; pente centrale ${fmtFr(Number(ramp["mainSlopePercent"]))} % ; palier bas ${fmtFr(Number(ramp["endLevelM"]))} m. Autorisation, drainage, soutènement, visibilité et séparation piétons / véhicules restent à valider.`, ["ss|EX118-RAMP-PORTAL"], 13);
  const observed = input.siteContext?.satelliteObserved === true;
  if (!g || !observed) issue("CONTEXT", "à documenter", "Contexte extérieur non observé", "Les coordonnées préparent MapTiler mais ne constituent pas une observation satellite. H-ENV-A/B et H-SOL servent de scénarios de sensibilité. Ne pas conclure à l’absence de nuisances, de T-junction ou de masques.", [], 1);
  if (!compassStatus(input.engine, h.compass).ready) issue("COMPASS", "à documenter", "Lecture directionnelle conditionnelle", "Façade calculée depuis le modèle ; nord source et déclinaison / mesure magnétique non confirmés. Ba Zhai reste une lecture de scénario, non une validation de secteurs.", [], 10);
  if (!natalStatus(input.engine, h).ready) issue("FLYING", "à documenter", "Étoiles Volantes : carte natale non établie", "H-TEMPS propose la Période 9 pour un scénario futur. Aucune carte montagne/eau ni effet d’auspice n’est inventé.", [], 10);
  const sourceSummary = `Bilan de conception sous hypothèses : ${issues.map((x) => x.title).join(" ; ")}.`;
  const review = h.designReviewV62 ?? null;
  return {
    version: DESIGN_REVIEW_VERSION,
    projectId: input.projectId,
    name: input.projectName,
    nativeId: input.nativeId,
    nativeHash,
    inputHash,
    facts,
    floors,
    rooms,
    entry,
    geo: g,
    totals,
    issues,
    sourceSummary,
    generatedAt: input.now,
    geometryMutation: false,
    stale: !!review && review.signature !== inputHash,
    origin,
  };
}

// --- Audit des transmissions -----------------------------------------------

export interface DesignAuditRow {
  id: string;
  name: string;
  status: "OK" | "À documenter" | "Écart";
  detail: string;
}

/** `audit(p)` : contrôle du dossier à la date de l'édition, pas un compte-rendu de tests indépendants. */
export function designAudit(input: DesignReviewInput, r: DesignAnalysis, profileLabel: string): DesignAuditRow[] {
  const out: DesignAuditRow[] = [];
  const row = (id: string, name: string, ok: boolean, detail: string, warning = false) => out.push({ id, name, status: ok ? "OK" : warning ? "À documenter" : "Écart", detail });
  const a = input.programmeCase;
  const vertices = input.parcel?.vertices ?? [];
  row("link", "Dossier → modèle natif", !!r.nativeId, `ID workflow ${input.projectId} / ID natif ${r.nativeId || "absent"}`, true);
  row("parcel", "Parcelle → modèle", vertices.length > 0, `${vertices.length} bornes ; ${fmtFr(r.facts.parcelArea, 3)} m² calculés`, true);
  const t = input.parcelTransmission;
  row("parcel-state", "Propositions Parcelle → arbitrages", !t || t.status === "linked", t?.reason || "Géométrie source liée ; aucune proposition en attente", false);
  row("program", "Programme → Répartition", !!a && fnv1a(programmeCaseSums(a.spaces)) === fnv1a(input.repartitionCaseTotals), a ? `${fmtFr(r.totals?.programme ?? null, 3)} m² hors provision de parois ; calcul sur les lignes` : "Programme détaillé non appliqué", !a);
  row("type", "Répartition → Harmony", !!a && !!a.type && r.rooms.length >= 0 && profileLabel !== "Type à préciser", `${a?.type || "Non renseigné"} → ${profileLabel}`, !a);
  const links = a ? Object.values(a.roomLinks ?? {}).flat() : [];
  const exists = links.every((id) => r.rooms.some((x) => x.id === id));
  row("room-links", "Identifiants programme → zones", !!a && links.length > 0 && exists && new Set(links).size === links.length, `${links.length} liens ; ${r.rooms.length} zones du modèle ; doublons / absences contrôlés`, !a || !links.length);
  const linked = a ? a.spaces.flatMap((s) => (a.roomLinks?.[s.id] ?? []).map((id) => ({ s, rd: input.harmony.roomData[id] }))) : [];
  row("targets", "Cibles de locaux → fiches Harmony", linked.length > 0 && linked.every(({ s, rd }) => !!rd && Math.abs((Number(rd["programmeTargetArea"]) ?? -1) - s.quantity * s.unitArea) < 0.000001), `${linked.length} cibles de fiches comparées ; pas de redimensionnement du dessin`, !linked.length);
  row("design", "Atelier 10 → Esquisse 11", true, `Deux vues du même modèle ${r.nativeId || "à créer"} ; pas de deuxième exemple embarqué actif`);
  row("geometry", "Modèle → surfaces calculées", r.rooms.length > 0 && r.rooms.every((x) => Number.isFinite(x.area) && x.area >= 0), `${r.rooms.length} polygones ; surfaces calculées, trémies séparées`, !r.rooms.length);
  const review = input.harmony.designReviewV62 ?? null;
  row("review", "Modèle → bilan Harmony", !!review && !r.stale, review ? (r.stale ? "Une donnée analysée a changé : revue à actualiser" : "Revue rattachée aux entrées actuelles") : "Revue de conception non établie", true);
  row("text", "Dossier → champs et synthèses", input.textConflicts === 0, `${input.textConflicts} conflit(s) de texte manuel conservé(s)`);
  row("decision", "Décision unique → transfert", !!input.decision19, `Décision source : ${input.decision19 || "non prise"} ; les modifications appellent une révision`, !input.decision19);
  row("geo", "Géoréférencement → contexte MapTiler", !!r.geo, r.geo ? "Coordonnées calculées disponibles, hypothèse source visible" : "Localisation à fournir", true);
  const observed = input.siteContext?.satelliteObserved === true;
  row("external", "Preuves de contexte extérieur", observed, `Observation satellite ${observed ? "consignée par utilisateur" : "non consignée"} ; la collecte ne certifie pas les accès ni le sol`, true);
  return out;
}

// --- Plan de lecture SVG ---------------------------------------------------

const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const ROOM_COLORS: Record<string, string> = { formation: "#dcebed", bureau: "#e6e8c7", direction: "#ddd2bd", accueil: "#edddbd", pause: "#e7dbc9", reunion: "#d6e2d0", circulation: "#f1eddc", sanitaire: "#d9e5e4", office: "#d9e5e4", technique: "#dedfe2", reserve: "#f2f1e7" };

/** `svgPlan(r, level)` : parcelle, recul, emprise, locaux colorés par usage, murs, entrée de référence, nord — depuis les polygones réels. */
export function designPlanSvg(input: DesignReviewInput, r: DesignAnalysis, level: string): string {
  const par = toLocal(input.parcel?.vertices ?? [], r.origin);
  const foot = toLocal(input.footprint, r.origin);
  const points = par.length ? par : foot;
  if (!points.length) return "";
  const xmin = Math.min(...points.map((p) => p[0])) - 5;
  const xmax = Math.max(...points.map((p) => p[0])) + 5;
  const ymin = Math.min(...points.map((p) => p[1])) - 5;
  const ymax = Math.max(...points.map((p) => p[1])) + 5;
  const W = 900;
  const HH = 640;
  const k = Math.min((W - 180) / (xmax - xmin), (HH - 130) / (ymax - ymin));
  const tx = (p: Point2) => 75 + (p[0] - xmin) * k;
  const ty = (p: Point2) => HH - 60 - (p[1] - ymin) * k;
  const ps = (pol: readonly Point2[]) => pol.map((p) => `${tx(p).toFixed(2)},${ty(p).toFixed(2)}`).join(" ");
  const m = input.floor.levels?.[level] ?? {};
  const roomsvg = r.rooms
    .filter((q) => q.level === level)
    .map((q) => `<polygon points="${ps(q.points)}" fill="${ROOM_COLORS[q.usage] ?? "#f2f1e7"}" stroke="#7b8d84" stroke-width=".8"/><text x="${tx(q.center)}" y="${ty(q.center)}" font-size="9" text-anchor="middle">${esc(q.name.includes(" · ") ? q.name.split(" · ")[0] : "Rés.")} · ${fmtFr(q.area, 1)} m²</text>`)
    .join("");
  const walls = (m.walls ?? []).map((w) => `<line x1="${tx(w.a)}" y1="${ty(w.a)}" x2="${tx(w.b)}" y2="${ty(w.b)}" stroke="#314c42" stroke-width="${Math.max(1, (Number(w["thickness"]) || 0.1) * k)}"/>`).join("");
  let entry = "";
  if (r.entry && level === "rdc") {
    const e = r.entry;
    entry = `<circle cx="${tx(e.point)}" cy="${ty(e.point)}" r="7" fill="#ae5b35"/><text x="${tx(e.point) + 12}" y="${ty(e.point)}" font-size="12" fill="#874023">Entrée H-ENTREE</text>`;
  }
  const north = r.geo?.projectNorth ?? 0;
  const rotation = -(north > 180 ? north - 360 : north);
  const gridLabel = r.geo ? "Nord géographique calculé (H-GEO)" : "Nord de grille du modèle";
  const levelName = input.levels.find((l) => l.id === level)?.name || level;
  const envelope = input.parcel?.setback?.envelope;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${HH}" role="img" aria-label="Lecture Harmony du niveau ${esc(level)} depuis le modèle réel"><rect width="900" height="640" fill="#fffef9"/>` +
    `<text x="24" y="30" font-size="18" fill="#173f35">${esc(input.example ? "P.118" : input.projectName)} · ${esc(levelName)} · lecture de conception</text>` +
    `<text x="24" y="50" font-size="11">Modèle ${r.nativeHash} · unités m / m² · proportions calculées, pas un plan d’exécution</text>` +
    `<polygon points="${ps(par)}" fill="none" stroke="#718774" stroke-width="1.5"/>` +
    (envelope?.length ? `<polygon points="${ps(toLocal(envelope, r.origin))}" fill="none" stroke="#9f8357" stroke-dasharray="7 5"/>` : "") +
    `<polygon points="${ps(foot)}" fill="#f7f5eb" stroke="#263f35" stroke-width="2"/>${roomsvg}${walls}${entry}` +
    `<g transform="translate(795 102) rotate(${rotation})"><path d="M0 15V-22M-6 -12L0 -24L6 -12" fill="none" stroke="#294b3d" stroke-width="2"/><text x="0" y="-32" font-size="16" text-anchor="middle">N</text></g>` +
    `<text x="680" y="150" font-size="10">${gridLabel}</text><text x="24" y="617" font-size="11">Tracés issus des polygones et murs · aucun secteur symbolique ne remplace le contour réel.</text></svg>`
  );
}

// --- Revue de conception ---------------------------------------------------

/**
 * `review(p)` : la revue archivée (signature des entrées, empreinte du modèle, compteurs), l'ancienne versée dans
 * l'historique (12 au plus) ; et, comme le prototype, une revue documentaire ajoutée au dossier Harmony (`h.reviews`,
 * 24 au plus) — « Analyse documentaire automatique ; validation humaine non acquise », datée de l'empreinte complète du
 * dossier (`fullHash`) et de celle du modèle. Le rapport HTML que le prototype y copiait (`hr.html`) n'est pas stocké :
 * Fadi le produit à la demande.
 */
export function designReviewSnapshot(
  h: HarmonyDossier,
  r: DesignAnalysis,
  now: string,
  automatic: boolean,
  assessment: { fullHash: string; documented: number; active: number; counts: Record<string, number>; phase: number; profile: { label: string } } | null = null,
): { designReviewV62: DesignReviewSnapshot; designReviewHistoryV62: DesignReviewSnapshot[]; reviews: Record<string, unknown>[] } {
  const history = [...(h.designReviewHistoryV62 ?? [])];
  if (h.designReviewV62) history.push(h.designReviewV62);
  while (history.length > 12) history.shift();
  const reviews = [...(h.reviews ?? [])];
  if (assessment) {
    reviews.push({
      id: `v62-review-${Date.parse(now) || 0}`,
      name: automatic ? `Revue initiale ${r.name} · modèle conçu` : "Actualisation de la lecture du modèle",
      created: now,
      date: now,
      author: "Analyse documentaire automatique ; validation humaine non acquise",
      reviewer: "Analyse documentaire automatique",
      signature: assessment.fullHash,
      sourceHash: r.nativeHash,
      phase: assessment.phase,
      profile: assessment.profile.label,
      documented: assessment.documented,
      active: assessment.active,
      conflicts: assessment.counts["conflict"] ?? 0,
      unknown: assessment.active - assessment.documented,
      counts: { ...assessment.counts },
      note: r.sourceSummary,
    });
    while (reviews.length > 24) reviews.shift();
  }
  return {
    designReviewV62: {
      version: DESIGN_REVIEW_VERSION,
      name: `${r.name} — bilan du bâtiment conçu`,
      at: now,
      signature: r.inputHash,
      modelSignature: r.nativeHash,
      status: "Conception sous hypothèses — réserves non levées",
      automatic,
      summary: r.sourceSummary,
      counts: { levels: r.floors.length, rooms: r.rooms.length, issues: r.issues.length },
    },
    designReviewHistoryV62: history,
    reviews,
  };
}

// --- Rapport HTML ------------------------------------------------------------

function table(headers: string[], rows: string[][]): string {
  return `<div class="v62-table-wrap"><table class="v62-table"><thead><tr>${headers.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

export function designMetricsHtml(r: DesignAnalysis): string {
  const items: [string, string][] = [
    ["Emprise dessinée", `${fmtFr(r.facts.footprint)} m²`],
    ["Zones du modèle", String(r.rooms.length)],
    ["Surface des zones", `${fmtFr(r.facts.roomArea)} m²`],
    ["Cibles de programme", `${fmtFr(r.totals?.programme ?? null)} m²`],
  ];
  return `<div class="v62-metrics">${items.map(([n, v]) => `<div><span>${n}</span><strong>${v}</strong></div>`).join("")}</div>`;
}

export function designLevelTableHtml(r: DesignAnalysis): string {
  return table(
    ["Niveau", "Cote / hauteur étage", "Contour de dalle", "Dalle nette", "Zones room"],
    r.floors.map((l) => [esc(l.name), `${fmtFr(l.elevation)} / ${fmtFr(l.height)} m`, `${fmtFr(l.gross, 3)} m²`, `${fmtFr(l.slabNet, 3)} m²`, `${l.count} zones · ${fmtFr(l.rooms, 3)} m²`]),
  );
}

export function designAssumptionsHtml(assumptions: readonly DesignAssumption[]): string {
  if (!assumptions.length) return "<p>Aucune hypothèse de travail consignée pour ce dossier.</p>";
  return table(
    ["Référence / objet", "Hypothèse, non fait établi", "Source / vérification"],
    assumptions.map((a) => [`${esc(a.id)}<br>${esc(a.topic)}`, `${esc(a.value)}<br><span class="v62-tag">${esc(a.status)}</span>`, `${esc(a.source)}<br><b>${esc(a.owner)}</b> · ${esc(a.validation)}`]),
  );
}

export function designRoomTableHtml(r: DesignAnalysis, level: string | null = null, room: string | null = null): string {
  let rooms = level ? r.rooms.filter((x) => x.level === level) : r.rooms;
  if (room) rooms = rooms.filter((x) => x.id === room);
  return table(
    ["Local / source", "Mesure / capacité source", "Cible / écart", "Conception / lecture Harmony"],
    rooms.map((x) => [
      `${esc(x.levelName)}<br><b>${esc(x.name)}</b><small>${esc(x.objectId)}</small>`,
      `${fmtFr(x.area, 3)} m²<br>${esc(x.sector)}${x.width ? `<br>Largeur rectangle : ${fmtFr(x.width, 3)} m` : ""}${x.capacity ? `<br>${x.capacity} indiqués · ${fmtFr(x.ratio)} m²/place ou poste` : ""}`,
      x.target === null ? "Non lié" : `${fmtFr(x.target, 3)} m²<br>Δ ${fmtFr(x.delta, 3)} m²`,
      `<b>${esc(x.status)}</b><br>${esc(x.reading)}<small>${x.doors} porte(s), ${x.windows} baie(s) au contact indicatif ; ${x.furniture} mobilier(s) au centroïde inclus. Pas un contrôle de passage libre.</small>`,
    ]),
  );
}

/**
 * `roomsHTML(p)` de p118-resolved-app — « fiches d’espaces — capacités,
 * dimensions et ambiances choisies » de l'exemple résolu : géométrie du
 * modèle courant, gabarit et capacité cible de la fiche de programme reliée
 * par `sourceRoomId`, réponse retenue et ambiance choisie du dossier Harmony.
 * Les valeurs absentes sont « Non applicable », jamais inventées.
 */
export function exampleRoomsHtml(input: DesignReviewInput, r: DesignAnalysis, level: string | null = null): string {
  const rooms = level ? r.rooms.filter((x) => x.level === level) : r.rooms;
  const num = (v: unknown, d = 2) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v).toLocaleString("fr-FR", { maximumFractionDigits: d }) : "Non applicable");
  const by = new Map<string, Record<string, unknown>>();
  for (const s of input.programmeCase?.spaces ?? []) if (typeof s["sourceRoomId"] === "string") by.set(s["sourceRoomId"], s);
  const rows = rooms.map((x) => {
    const s = by.get(x.id);
    const amb = input.harmony.ambiences[x.id] ?? null;
    const capacity = s?.["capacityNumeric"];
    return [
      `<b>${esc(`${x.levelName} · ${typeof s?.["name"] === "string" ? s["name"] : x.name}`)}</b><small>${esc(x.id)}</small>`,
      `${num(x.area)} m²<br>${num(s?.["width"])} × ${num(s?.["length"])} m : enveloppe, non dimension libre`,
      `${Number(capacity) > 0 ? `${num(capacity, 0)} personnes` : "Sans poste permanent"}${x.capacity ? `<small>Dessin source : ${esc(x.capacity)} ; cible : ${esc(capacity ?? "non applicable")}</small>` : ""}`,
      `${esc(typeof s?.["performance"] === "string" && s["performance"] ? s["performance"] : x.reading)}<details><summary>Ambiance choisie</summary><p>${esc(amb?.["materials"])}</p><p>${esc(amb?.["palette"])}</p><p>${esc(amb?.["light"])}</p><p>${esc(amb?.["sound"])}</p></details>`,
    ];
  });
  return `<p class="ex81-note">Géométrie du modèle courant ; capacités cibles du programme. Une cible retenue n’efface pas le mobilier du dessin source.</p>${table(["Niveau / zone", "Surface / gabarit calculés", "Capacité cible", "Réponse retenue"], rows)}`;
}

export function designIssuesHtml(r: DesignAnalysis, withButtons = false): string {
  return r.issues.map((x) => `<article class="v62-issue"><span class="v62-tag">${esc(x.priority)}</span><h3>${esc(x.title)}</h3><p>${esc(x.body)}</p>${withButtons ? `<button class="h-button" data-v62-go="${x.step}">Étape ${String(x.step).padStart(2, "0")} ↗</button>` : `<small>Étape ${String(x.step).padStart(2, "0")}</small>`}</article>`).join("");
}

export function designAuditHtml(rows: readonly DesignAuditRow[]): string {
  return table(["Transmission", "État", "Contrôle"], rows.map((x) => [esc(x.name), `<span class="v62-tag ${x.status === "Écart" ? "bad" : ""}">${x.status}</span>`, esc(x.detail)]));
}

/** `synthesis(r)` : la lecture propre au dossier P.118 n'est reproduite que pour lui ; les faits calculés valent pour tout projet. */
export function designSynthesisHtml(input: DesignReviewInput, r: DesignAnalysis): string {
  const e = r.entry;
  const angle = e?.trueBearing ?? null;
  const sitting = angle === null ? null : normDeg(angle + 180);
  const guaIndex = sitting === null ? null : Math.floor(((normDeg(sitting) + 22.5) % 360) / 45);
  const gua = guaIndex === null ? null : input.engine.gua[guaIndex];
  const head = input.example
    ? `<p>Le scénario de référence réunit formation, bureaux et services. L’analyse porte sur <b>${r.floors.length} niveaux et ${r.rooms.length} zones dessinées</b>, avec leurs ouvertures et leurs cibles de programme. Les observations extérieures restent à confirmer.</p>`
    : `<p>L’analyse porte sur <b>${r.floors.length} niveaux et ${r.rooms.length} zones dessinées</b>, avec leurs ouvertures et leurs cibles de programme. Les observations extérieures restent à confirmer.</p>`;
  const conclusion = input.example
    ? `<p class="v62-alert"><b>Conclusion : conception à poursuivre sous réserves.</b> Traiter les hauteurs, la densité des postes et la rampe avant toute validation. Les corrections d’ambiance ne compensent pas un problème d’usage ou de sécurité.</p>`
    : `<p class="v62-alert"><b>Conclusion : conception à poursuivre sous réserves.</b> ${r.issues.length ? `Traiter d’abord : ${r.issues.filter((x) => x.priority === "prioritaire").map((x) => x.title.toLowerCase()).join(", ") || r.issues[0]!.title.toLowerCase()}.` : "Aucune réserve calculée ; la validation humaine reste requise."} Les corrections d’ambiance ne compensent pas un problème d’usage ou de sécurité.</p>`;
  const usageTable = input.example
    ? table(
        ["Fonction", "Lecture proposée / contrôle à mener"],
        [
          ["Accueil RDC", "Yang mesuré : entrée identifiable, attente hors flux, comptoir perceptible, bruit maîtrisé. Le terrazzo, les assises et la casquette sont présents dans le modèle ; leur efficacité reste à tester."],
          ["Formation RDC / R+1", "Visibilité pédagogique, arrière du formateur stable, lumière maîtrisée, alternance travail / pause. Les capacités indiquées ne valent pas effectif réglementaire."],
          ["Administration / bureaux / direction", "Différencier concentration, échanges et confidentialité. Densité mezzanine prioritaire ; ne pas imposer une même orientation cardinale à tous les postes."],
          ["Mezzanine / transitions", "Le vide au-dessus du RDC appelle une étude du bruit, des vues et des protections. Dégagements conservés libres."],
          ["Technique / archives / offices", "Humidité, charges, ventilation, accès maintenance et flux propres/service relèvent d’études techniques ; aucun remède décoratif ne les remplace."],
          ["Cinq Éléments / Yin–Yang", "Bois, minéral, métal discret, teintes et lumière à équilibrer par usage ; aucune correspondance automatique entre un matériau et un effet."],
        ],
      )
    : table(
        ["Usage présent dans le modèle", "Lecture proposée / contrôle à mener"],
        [...new Set(r.rooms.map((x) => x.usage))].map((u) => [esc(u), esc(r.rooms.find((x) => x.usage === u)!.reading)]),
      );
  return (
    `<section class="v62-card"><div class="v62-kicker">BILAN HARMONY · BÂTIMENT CONÇU · ATELIER 10</div><h2>Une lecture du modèle, pas un bilan générique</h2>${head}${designMetricsHtml(r)}${conclusion}` +
    `<p>${r.stale ? "La revue archivée est à actualiser. Les valeurs de cette lecture vivante proviennent déjà du modèle courant." : "Lecture liée au modèle courant ; les réserves restent ouvertes et la validation humaine n’est pas acquise."}</p></section>` +
    `<section class="v62-card"><h2>Forme, entrée et orientation</h2><p>Le contour cadastral irrégulier est conservé. Les limites du terrain, l’emprise du bâtiment et les vides de dalle sont trois objets distincts. Un trapèze ou une mezzanine partielle ne reçoit pas automatiquement un avis défavorable.</p>` +
    (e
      ? `<p><b>Entrée étudiée :</b> ${esc(e.id)} · largeur ${fmtFr(e.width)} m · normale de façade ${fmtFr(e.gridBearing)}° dans la grille${angle !== null ? ` / ${fmtFr(angle)}° géographiques sous H-GEO` : ""}. Le choix de cette façade active reste l’hypothèse H-ENTREE.</p>`
      : "<p>Entrée de référence absente du modèle : une nouvelle liaison est nécessaire.</p>") +
    (gua && sitting !== null
      ? `<p><b>Ba Zhai, scénario uniquement :</b> avec l’assise ${fmtFr(sitting)}° (${cardinalOf(input.engine, sitting)}), et à condition que la mesure magnétique confirmée conserve ce secteur, le repère serait <b>${gua.n} · ${esc(gua.name)}</b>, groupe ${esc(gua.group)}. Ce repère n’attribue aucune prospérité ni santé aux locaux. Déclinaison et mesure restent à établir.</p>`
      : "") +
    `<p><b>Étoiles Volantes :</b> ${input.example ? "H-TEMPS 2027/2028 permet un scénario de Période 9. Il ne suffit pas à établir une carte natale montagne/eau ; aucune attribution d’étoile favorable à un bureau ou de secteur défavorable à un sanitaire n’est fabriquée." : "aucune carte natale montagne/eau n’est établie sans période confirmée ; aucune attribution d’étoile favorable ou de secteur défavorable n’est fabriquée."}</p></section>` +
    `<section class="v62-card"><h2>Organisation et ambiances par usage</h2>${usageTable}</section>`
  );
}

export function designSourcesHtml(input: DesignReviewInput, r: DesignAnalysis): string {
  const sources = input.example
    ? "fichier Parcours V6.1 fourni ; nativeParcel S01 ; niveaux, murs, portes, baies, chemins de rôle room et dalles du modèle " + esc(r.nativeId) + " ; programme lié. Les références réglementaires antérieures sont archivées et leur applicabilité reste à vérifier."
    : `niveaux, murs, portes, baies, chemins de rôle room et dalles du modèle ${esc(r.nativeId ?? "—")} ; parcelle transmise par l’outil Parcelle ; programme lié le cas échéant. Les références réglementaires restent à vérifier.`;
  return `<section class="v62-card"><h2>Sources et limites</h2><p><b>Sources du projet :</b> ${sources}</p><p><b>Cartographie :</b> ${r.geo ? esc(r.geo.source) : "Géoréférencement non disponible."} Aucun voisin, aucune voie en T, nappe ou nuisance n’est inventé comme observation MapTiler.</p><p><a href="https://docs.maptiler.com/cloud/api/elevation/" target="_blank" rel="noopener">MapTiler — API d’altimétrie</a> · <a href="https://docs.maptiler.com/cloud/api/coordinates/" target="_blank" rel="noopener">MapTiler — coordonnées</a>. Une clé utilisateur est requise ; aucune clé n’est ajoutée aux rapports.</p><p><b>Méthodes traditionnelles :</b> ${input.engine.sources
    .slice(0, 2)
    .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`)
    .join(" ; ")}. Références de méthode, non preuves d’effets sanitaires ou financiers.</p></section>`;
}

export interface DesignReportOptions {
  css: string;
  audit: readonly DesignAuditRow[];
  /** `designTraceHTML` de h7-app : intentions transmises et propositions de conception retenues (HTML déjà composé). */
  designTrace?: string;
}

/** `reportHTML(r)` : le document autonome « Bilan Harmonie du bâtiment conçu ». */
export function designReportHtml(input: DesignReviewInput, r: DesignAnalysis, options: DesignReportOptions): string {
  const title = input.example ? "P.118 — Bilan Harmonie du bâtiment conçu · V7" : `${esc(r.name)} — Bilan Harmonie du bâtiment conçu · V7`;
  const plan = designPlanSvg(input, r, r.floors.some((f) => f.id === "rdc") ? "rdc" : (r.floors[0]?.id ?? "rdc"));
  return (
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
    `<style>${options.css}body{font:14px/1.6 Arial;background:#f4f6f1;margin:0;color:#173f35}.v62{max-width:1120px;margin:auto;padding:26px}button{display:none!important}h1{font-size:32px}h2{font-size:23px}@media print{body{background:white}.v62{padding:0}.v62-card{box-shadow:none;break-inside:auto}h2,h3{break-after:avoid}.v62-table tr{break-inside:avoid}}</style></head>` +
    `<body><main class="v62"><header class="v62-card"><div class="v62-kicker">PARCOURS V7 · ANALYSE DOCUMENTAIRE ET GÉOMÉTRIQUE</div><h1>${esc(r.name)}</h1>` +
    `<p>Bilan Harmony du bâtiment conçu dans l’Atelier architectural, étape affichée 10. Édition ${esc(r.generatedAt)} · modèle ${r.nativeHash} · entrées ${r.inputHash}.</p>` +
    `<p>Statut : conception sous hypothèses, sans visite ni certification technique. Les termes Feng Shui désignent une lecture traditionnelle, non une mesure physique ou une garantie.</p></header>` +
    designSynthesisHtml(input, r) +
    `<section class="v62-card"><h2>Repérage du RDC</h2>${plan}</section>` +
    `<section class="v62-card"><h2>Surfaces et niveaux calculés</h2>${designLevelTableHtml(r)}<p>Les zones comprennent les bandes d’adaptation. Les noyaux, parois, trémies et extérieurs ne sont pas ajoutés deux fois. Somme des zones ≠ surface réglementaire, emprise ou surface commercialisable.</p></section>` +
    `<section class="v62-card"><h2>Actions et réserves</h2><div class="v62-issues">${designIssuesHtml(r)}</div></section>` +
    `<section class="v62-card"><h2>Lecture des ${r.rooms.length} zones</h2>${designRoomTableHtml(r)}</section>` +
    `<section class="v62-card"><h2>Hypothèses à vérifier</h2>${designAssumptionsHtml(input.assumptions)}</section>` +
    `<section class="v62-card"><h2>Transmission des données</h2>${designAuditHtml(options.audit)}<p>Ce tableau est un contrôle du dossier à la date de l’édition, pas un compte-rendu de tests indépendants du logiciel.</p></section>` +
    designSourcesHtml(input, r) +
    (options.designTrace ?? "") +
    `<footer class="v62-card">Aucun objet de dessin modifié par l’analyse. La validation de conception et les autorisations relèvent des intervenants compétents.</footer></main></body></html>`
  );
}

/** `designTraceHTML(p)` de h7-app : intentions transmises à la conception et propositions retenues aux étapes 10 / 11. */
export function designTraceHtml(incoming: readonly { originLabel: string; text: string; originStale: boolean }[], chosen: readonly { title: string; text: string; link: string; objectId?: string; stateLabel: string; stale: boolean }[]): string {
  return (
    `<section class="v62-card"><h2>Intentions transmises et propositions de conception</h2><p>Ce bilan reste dans l’étape de conception. Une intention retenue n’est pas une modification automatique du dessin.</p>` +
    (incoming.length ? table(["Origine", "Intention transmise", "Réexamen"], incoming.map((q) => [esc(q.originLabel), esc(q.text), q.originStale ? "À réexaminer" : "Selon les données de la proposition"])) : "<p>Aucune intention amont retenue à transmettre pour le moment.</p>") +
    (chosen.length
      ? table(["Proposition", "Décision et objet", "État"], chosen.map((q) => [esc(q.title), `${esc(q.text)}<br><small>${esc(q.link || q.objectId || "Objet à préciser")}</small>`, `${esc(q.stateLabel)}${q.stale ? " · à réexaminer" : ""}`]))
      : "<p>Aucune proposition de conception retenue : les options restent disponibles dans « Harmonie → Proposer ».</p>") +
    `</section>`
  );
}
