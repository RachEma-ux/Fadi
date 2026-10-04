/**
 * Transmission de la parcelle (étape 01) vers le modèle de l'Atelier —
 * port serveur de `acceptParcel()` / `parcelSnapshot()` de `flow-v62`
 * (Parcours V6.2) du prototype. Mêmes règles, mêmes messages :
 *
 * - trois bornes valides minimum, polygone valide, référentiel EPSG:26191 ou
 *   EPSG:2154 ; sinon le modèle antérieur n'est pas touché ;
 * - si les bornes changent alors qu'un bâtiment est déjà dessiné : conflit
 *   explicite, la nouvelle parcelle reste à l'étape 01, le modèle n'est pas
 *   déplacé ;
 * - si seule l'emprise proposée diffère de celle du bâtiment dessiné :
 *   conflit de conception, modèle non redimensionné ;
 * - sinon le domaine `nativeParcel` du projet natif est réécrit (bornes,
 *   aire, périmètre, centroïde, recul uniforme avec enveloppe calculée par
 *   `inwardOffset`, contenance déclarée avec sa provenance) et, tant
 *   qu'aucun bâtiment n'existe, l'emprise proposée devient
 *   `buildingFootprint`.
 *
 * Les coordonnées manipulées ici sont toutes dans le repère cadastral de la
 * parcelle (mètres, CRS déclaré) ; rien n'est converti vers le repère
 * géographique ni mélangé au repère local du bâtiment (AGENTS.md).
 */
import { inwardOffset, polygonArea, type Point2 } from "@parcours/core-geometry";
import { createHash } from "node:crypto";
import { aire, longueur, pointCadastral, PREFIXE_PROPRIETE_TRANSMISSION, type Commande, type ValeurJson } from "@parcours/atelier-model";

export const SUPPORTED_CRS = new Set(["EPSG:26191", "EPSG:2154"]);

export interface ParcelPoint {
  id: string;
  x: number | string;
  y: number | string;
}

/** Fichier de parcelle tel que l'outil Parcelle le capture (`captureFile()` → `ParcelFileData.clean`). */
export interface ParcelSnapshot {
  name: string;
  crs: string;
  parcelNumber?: string;
  points: ParcelPoint[];
  source?: string;
  provenance?: { kind?: string; filename?: string; reference?: string; edited?: boolean };
  dossier?: { parcel?: { officialArea?: string | number; sources?: unknown[] }; construction?: unknown; [k: string]: unknown };
  design?: {
    commune?: string;
    setback?: { mode?: string; value?: number; rule?: string };
    building?: { footprint?: unknown };
    [k: string]: unknown;
  };
  frontage?: unknown;
  roadWidth?: unknown;
  [k: string]: unknown;
}

export type TransmissionStatus = "linked" | "incomplete" | "invalid" | "conflict" | "design-conflict" | "setback-pending";

/** Résumé de la parcelle telle qu'elle a été transmise (mesures dans le plan du CRS). */
export interface ParcelSummary {
  name: string;
  crs: string;
  parcelNumber: string;
  area: number | null;
  perimeter: number | null;
  boundaryCount: number;
}

export interface ParcelTransmission {
  status: TransmissionStatus;
  reason: string;
  at: string;
  signature: string | null;
  /** Révision du modèle typé après la transmission (D-052). */
  modelRevision?: number;
  parcel?: ParcelSummary;
}

const dist = (a: Point2, b: Point2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function hashOf(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}

/** Polygone plan valide : au moins trois points finis, aire non nulle, pas deux points identiques consécutifs. */
export function validPolygon(poly: unknown): poly is Point2[] {
  if (!Array.isArray(poly) || poly.length < 3) return false;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return false;
    const q = poly[(i + 1) % poly.length];
    if (Array.isArray(q) && p[0] === q[0] && p[1] === q[1]) return false;
  }
  return polygonArea(poly as Point2[]) > 1e-6;
}

export function snapshotPolygon(snapshot: ParcelSnapshot): Point2[] {
  return snapshot.points.map((q) => [Number(String(q.x).replace(",", ".")), Number(String(q.y).replace(",", "."))] as Point2);
}

/** Aire et périmètre dans le plan du CRS (comme `ParcelGeometry.measure`) ; `null` quand la saisie n'est pas encore un polygone. */
export function measure(snapshot: ParcelSnapshot): { area: number | null; perimeter: number | null } {
  const poly = snapshotPolygon(snapshot);
  if (!validPolygon(poly)) return { area: null, perimeter: null };
  return { area: polygonArea(poly), perimeter: poly.reduce((n, q, i) => n + dist(q, poly[(i + 1) % poly.length]!), 0) };
}

export function summarize(snapshot: ParcelSnapshot): ParcelSummary {
  return { name: snapshot.name, crs: snapshot.crs, parcelNumber: String(snapshot.parcelNumber ?? ""), ...measure(snapshot), boundaryCount: snapshot.points.length };
}

export interface NativeParcelDomain {
  schema: string;
  schemaVersion: string;
  parcelNumber: string;
  commune: string;
  crs: string;
  units: string;
  vertices: Point2[];
  vertexIds: string[];
  area: number;
  centroid: Point2;
  perimeter: number;
  sourceFile: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  sideLengths: number[];
  setback?: { mode: string; distance: number; uniformValue: number; rule: string; envelope?: Point2[]; area?: number; [k: string]: unknown };
  officialArea?: number;
  officialAreaProvenance?: { source: string; quality: string; reference: unknown[] };
  building?: { vertices: Point2[]; area: number; status: string; state: string; source: string };
  validation?: { recognized: boolean; conformant: boolean; state: string; issues: string[]; [k: string]: unknown };
  parcoursPresentation?: { snapshot: ParcelSnapshot };
  [k: string]: unknown;
}

function centroidOf(poly: Point2[]): Point2 {
  const n = poly.length;
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
}

export interface AcceptInput {
  snapshot: ParcelSnapshot;
  /** Domaine `nativeParcel` courant du projet natif, s'il existe. */
  currentParcel: NativeParcelDomain | null;
  /** Emprise courante (`buildingFootprint.vertices`), s'il y en a une. */
  currentFootprint: Point2[] | null;
  /** Un bâtiment est-il déjà dessiné (murs, locaux ou tracés dans floorDesign) ? */
  buildingDrawn: boolean;
  now: string;
}

export interface AcceptResult {
  transmission: Omit<ParcelTransmission, "modelRevision">;
  /** Domaines à écrire dans le magasin du projet natif ; vide quand la transmission est refusée. */
  writes: { nativeParcel?: NativeParcelDomain; buildingFootprint?: { vertices: Point2[] } };
}

/** `acceptParcel()` : décide et construit, sans écrire — l'appelant persiste. */
export function acceptParcel(input: AcceptInput): AcceptResult {
  const { snapshot, currentParcel: old, now } = input;
  const poly = snapshotPolygon(snapshot);
  const signature = hashOf(snapshot);
  if (poly.length < 3) {
    return { transmission: { status: "incomplete", reason: "Trois bornes valides minimum ; le modèle antérieur n’est pas effacé.", at: now, signature }, writes: {} };
  }
  if (!validPolygon(poly) || !SUPPORTED_CRS.has(snapshot.crs)) {
    return { transmission: { status: "invalid", reason: "Polygone invalide ou référentiel non pris en charge. Modèle antérieur conservé.", at: now, signature }, writes: {} };
  }
  const changed = !!old && hashOf({ p: old.vertices, crs: old.crs }) !== hashOf({ p: poly, crs: snapshot.crs });
  if (changed && input.buildingDrawn) {
    return {
      transmission: {
        status: "conflict",
        reason: "Les bornes diffèrent et un bâtiment est déjà dessiné. Nouvelle parcelle conservée à l’étape 01 ; modèle antérieur non déplacé. Créez une variante / un nouveau projet pour reprendre l’implantation.",
        at: now,
        signature,
      },
      writes: {},
    };
  }
  const incoming = snapshot.design?.building?.footprint;
  if (!changed && input.buildingDrawn && validPolygon(incoming) && hashOf(incoming) !== hashOf(input.currentFootprint)) {
    return {
      transmission: { status: "design-conflict", reason: "Emprise proposée différente de celle du bâtiment dessiné : proposition conservée, modèle non redimensionné. Arbitrage Atelier requis.", at: now, signature },
      writes: {},
    };
  }

  const same = !changed && !!old;
  const np: NativeParcelDomain = {
    ...(old ?? {}),
    schema: "NativeParcel · Parcours V6.2",
    schemaVersion: "2.0",
    parcelNumber: String(snapshot.parcelNumber || old?.parcelNumber || ""),
    commune: snapshot.design?.commune || old?.commune || "",
    crs: snapshot.crs,
    units: "m",
    vertices: poly,
    vertexIds: snapshot.points.map((q) => q.id),
    area: polygonArea(poly),
    centroid: centroidOf(poly),
    perimeter: poly.reduce((n, q, i) => n + dist(q, poly[(i + 1) % poly.length]!), 0),
    sourceFile: snapshot.provenance?.filename || old?.sourceFile || "Parcelle 00",
    bounds: { minX: Math.min(...poly.map((q) => q[0])), minY: Math.min(...poly.map((q) => q[1])), maxX: Math.max(...poly.map((q) => q[0])), maxY: Math.max(...poly.map((q) => q[1])) },
    sideLengths: poly.map((q, i) => dist(q, poly[(i + 1) % poly.length]!)),
    parcoursPresentation: { snapshot },
  };
  const setback = snapshot.design?.setback;
  if (setback?.mode === "uniform" && Number.isFinite(setback.value) && (setback.value as number) >= 0) {
    const distance = setback.value as number;
    const envelope = inwardOffset(poly, distance);
    np.setback = {
      ...(old?.setback ?? {}),
      mode: "uniform",
      distance,
      uniformValue: distance,
      rule: setback.rule || "Saisie projet à confirmer",
      ...(envelope && envelope.length >= 3 ? { envelope, area: polygonArea(envelope) } : {}),
    };
  }
  if (snapshot.dossier?.parcel && Object.hasOwn(snapshot.dossier.parcel, "officialArea")) {
    const v = String(snapshot.dossier.parcel.officialArea ?? "").trim().replace(",", ".");
    if (v === "" || !Number.isFinite(Number(v)) || Number(v) <= 0) delete np.officialArea;
    else np.officialArea = Number(v);
    np.officialAreaProvenance = { source: "Dossier Parcelle 00", quality: "declared", reference: [...((snapshot.dossier.parcel.sources as unknown[] | undefined) ?? [])] };
  }
  const writes: AcceptResult["writes"] = {};
  if (!input.buildingDrawn && validPolygon(incoming)) {
    np.building = { vertices: incoming, area: polygonArea(incoming), status: "defined", state: "DECLARED", source: "Saisie explicite Parcelle 00" };
    writes.buildingFootprint = { vertices: incoming };
  }
  np.validation = { ...(old?.validation ?? {}), recognized: true, conformant: false, state: same ? "DERIVED" : "DECLARED", issues: ["Données transmises de Parcelle ; conformité et référentiel à valider."] };
  writes.nativeParcel = np;

  let status: TransmissionStatus = "linked";
  let reason = "Parcelle liée au modèle ; bornes / contexte transmis, aucune capacité ni autorisation inventée.";
  if (setback?.mode && setback.mode !== "uniform") {
    status = "setback-pending";
    reason = "Recul non uniforme enregistré comme proposition ; enveloppe native uniforme inchangée, recalcul spécifique requis.";
  }
  return { transmission: { status, reason, at: now, signature }, writes };
}

/**
 * `parcelSnapshot()` : le fichier de parcelle que l'outil ouvre pour un projet
 * qui n'en a pas encore mais dont le modèle natif porte une parcelle (ex.
 * P.118 importé) — bornes, contenance source et hypothèses, sans rien
 * inventer d'autre.
 */
export function parcelSnapshotFromNative(np: NativeParcelDomain, projectName: string, options: { footprint?: Point2[] | null; workingFootprintArea?: string } = {}): ParcelSnapshot {
  return {
    name: `P.${np.parcelNumber} · ${np.commune || projectName}`.slice(0, 80),
    crs: np.crs,
    parcelNumber: String(np.parcelNumber || ""),
    points: np.vertices.map((q, i) => ({ id: np.vertexIds?.[i] || `B${i + 1}`, x: q[0], y: q[1] })),
    source: "s01",
    dossier: {
      version: 1,
      parcel: { officialArea: np.officialArea == null ? "" : String(np.officialArea), sources: [{ id: "parcel-land-register", label: "Contenance source — non certificat", reference: np.sourceFile || "nativeParcel", url: "" }] },
      construction: {
        dimensions: [
          { id: "construction-footprint", label: "Emprise de travail retenue (non certification)", value: options.workingFootprintArea ?? "", unit: "m²" },
          { id: "construction-setback", label: "Recul de travail à confirmer", value: String(np.setback?.distance ?? ""), unit: "m" },
        ],
        sources: [{ id: "construction-regulations", label: "Prescription de projet", reference: "Hypothèses du dossier — applicabilité réglementaire à confirmer", url: "" }],
      },
    },
    frontage: { version: 4, roads: [], customDistances: [] },
    provenance: { kind: "file", filename: np.sourceFile || "nativeParcel", reference: "Modèle natif du projet" },
    design: {
      commune: np.commune,
      projectName,
      sourceCrs: np.crs,
      sourceUnit: "m",
      reference: np.sourceFile || "",
      confidence: "declared",
      metricConfirmed: false,
      setback: { mode: "uniform", value: np.setback?.distance ?? 5, rule: np.setback?.rule || "Hypothèse de travail" },
      building: { status: "defined", footprint: options.footprint ?? null, footprintMode: "source" } as { footprint?: unknown; [k: string]: unknown },
    },
    display: { labels: true, dimensions: true, lambertArea: true, roads: false, roadAxis: true, shapes: true, draggable: false, opacity: 25 },
  };
}

/**
 * Unité d'un champ numérique de `nativeParcel` porté en propriété (une grandeur saisie exige son unité) : les aires en
 * m², le reste (périmètre, longueurs) en m, l'unité déclarée de la parcelle (`units: "m"`).
 */
const uniteChamp = (champ: string): "m" | "m²" => (/area/i.test(champ) ? "m²" : "m");

/** Champs de `nativeParcel` portés par les paramètres canoniques de `site.parcelle.definir` (le reste devient propriété). */
const CHAMPS_CANONIQUES_PARCELLE = new Set(["parcelNumber", "commune", "crs", "vertices", "vertexIds", "area", "officialArea"]);

/** Ce que la transmission lit du modèle typé avant d'émettre ses commandes. */
export interface SiteDuModele {
  parcelleId: string | null;
  empriseId: string | null;
}

/**
 * Commandes de la transmission (D-052) : `site.parcelle.definir` (bornes dans le CRS déclaré, aires, recul et son
 * enveloppe) puis, pour chaque autre champ de la forme native, `propriete.definir` « transmission.<champ> »
 * (provenance « saisie », statut « déclarée ») ; `site.emprise.definir` quand l'emprise proposée devient celle du
 * bâtiment. Sommets cadastraux seulement : aucune conversion vers le repère local n'est faite ici.
 */
export function commandesTransmission(projectId: string, site: SiteDuModele, writes: AcceptResult["writes"]): Commande[] {
  const commandes: Commande[] = [];
  const np = writes.nativeParcel;
  if (np) {
    const crs = np.crs;
    const id = site.parcelleId ?? `${projectId}_parcelle`;
    const cad = (pts: Point2[]) => pts.map(([x, y]) => pointCadastral(x, y, crs));
    const envelope = np.setback?.envelope;
    commandes.push({
      type: "site.parcelle.definir",
      cibles: [],
      params: {
        id,
        ...(np.parcelNumber ? { numero: np.parcelNumber } : {}),
        ...(np.commune ? { commune: np.commune } : {}),
        crs,
        sommetsCadastraux: cad(np.vertices),
        identifiantsSommets: np.vertexIds,
        aire: aire(np.area),
        ...(typeof np.officialArea === "number" ? { aireOfficielle: aire(np.officialArea) } : {}),
        ...(np.setback && Number.isFinite(np.setback.distance) ? { recul: longueur(np.setback.distance) } : {}),
        ...(Array.isArray(envelope) && envelope.length >= 3 ? { enveloppeRecul: cad(envelope) } : {}),
      },
    });
    for (const [champ, valeur] of Object.entries(np)) {
      if (CHAMPS_CANONIQUES_PARCELLE.has(champ) || valeur === undefined) continue;
      commandes.push({
        type: "propriete.definir",
        cibles: [id],
        params: {
          nom: `${PREFIXE_PROPRIETE_TRANSMISSION}${champ}`,
          valeur: valeur as ValeurJson,
          ...(typeof valeur === "number" ? { unite: uniteChamp(champ) } : {}),
          provenance: "saisie",
          statut: "declaree",
          note: "Transmis par l'outil Parcelle (étape 01)",
        },
      });
    }
  }
  const fp = writes.buildingFootprint;
  if (fp && np) {
    commandes.push({
      type: "site.emprise.definir",
      cibles: [],
      params: { id: site.empriseId ?? `${projectId}_emprise`, sommetsCadastraux: fp.vertices.map(([x, y]) => pointCadastral(x, y, np.crs)) },
    });
  }
  return commandes;
}
