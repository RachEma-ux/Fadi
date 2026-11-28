/**
 * Projection de coordonnées géographiques WGS84 vers le système du projet (cas 4, lot C4, étape 7b : import KML / KMZ).
 *
 *   POST /   { systeme, wkt?, points: [[longitude, latitude], …] } → 200 { points: [[e, n], …], source }
 *   GET  /systemes → 200 { horizontaux: [{ code, nom }], verticaux: [] } : liste fermée des systèmes dont Fadi a la
 *   définition (cas 2, lot 5, n° 92) ; aucun système vertical n'est encore connu (source qualifiée à fournir).
 *
 * La définition du système vient soit d'un .prj fourni par la personne (`wkt`, WKT 1 ou 2, source « prj »), soit des
 * définitions déjà connues de Fadi (`SITE_CRS_DEFINITIONS`, source « fadi ») ; aucune autre définition n'est supposée :
 * un système inconnu sans .prj → 422 `systeme_inconnu`. Une coordonnée non convertible → 422 `projection`. Rien n'est
 * enregistré ici (le .prj et le KML sont archivés par `/sandbox/references`).
 */
import express, { Router, type Response } from "express";
import proj4 from "proj4";
import { requireAuth } from "../middleware/require-auth.js";
import { SITE_CRS_DEFINITIONS, SITE_CRS_NOMS } from "../lib/site-context.js";

/** Nombre maximal de points d'une demande (choix Fadi : un fichier KML courant). */
export const POINTS_MAX = 200_000;

export type IssueProjection = { readonly ok: true; readonly points: [number, number][]; readonly source: "fadi" | "prj" } | { readonly ok: false; readonly erreur: "systeme_inconnu" | "projection" | "demande" };

/** Projection pure (testable sans base). */
export function projeterWgs84(systeme: string, wkt: string | undefined, points: unknown): IssueProjection {
  if (!Array.isArray(points) || points.length === 0 || points.length > POINTS_MAX) return { ok: false, erreur: "demande" };
  if (!points.every((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) return { ok: false, erreur: "demande" };
  const definition = wkt && wkt.trim() !== "" ? wkt.trim() : SITE_CRS_DEFINITIONS[systeme];
  if (!definition) return { ok: false, erreur: "systeme_inconnu" };
  let conv: proj4.Converter;
  try {
    conv = proj4("EPSG:4326", definition);
  } catch {
    return { ok: false, erreur: "systeme_inconnu" };
  }
  const sortie: [number, number][] = [];
  for (const p of points as [number, number][]) {
    let q: number[];
    try {
      q = conv.forward([p[0], p[1]]);
    } catch {
      return { ok: false, erreur: "projection" };
    }
    if (!Number.isFinite(q[0]) || !Number.isFinite(q[1])) return { ok: false, erreur: "projection" };
    sortie.push([q[0] as number, q[1] as number]);
  }
  return { ok: true, points: sortie, source: wkt && wkt.trim() !== "" ? "prj" : "fadi" };
}

/** Liste fermée des systèmes du projet : ceux dont Fadi a la définition (horizontaux), aucun vertical pour l'instant. */
export function systemesConnus(): { readonly horizontaux: { readonly code: string; readonly nom: string }[]; readonly verticaux: { readonly code: string; readonly nom: string }[] } {
  return { horizontaux: Object.keys(SITE_CRS_DEFINITIONS).map((code) => ({ code, nom: SITE_CRS_NOMS[code] ?? code })), verticaux: [] };
}

const prive = (_req: unknown, res: Response, next: () => void) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
};

export const sandboxProjectionsRouter = Router();
sandboxProjectionsRouter.use(requireAuth);
sandboxProjectionsRouter.use(prive);

sandboxProjectionsRouter.get("/systemes", (_req, res) => {
  res.json(systemesConnus());
});

sandboxProjectionsRouter.post("/", express.json({ limit: "12mb" }), (req, res) => {
  const corps = (req.body ?? {}) as { systeme?: unknown; wkt?: unknown; points?: unknown };
  const systeme = typeof corps.systeme === "string" ? corps.systeme.trim() : "";
  const wkt = typeof corps.wkt === "string" && corps.wkt.length <= 20_000 ? corps.wkt : undefined;
  if (systeme === "" || (corps.wkt !== undefined && wkt === undefined)) return void res.status(400).json({ error: "bad_request" });
  const r = projeterWgs84(systeme, wkt, corps.points);
  if (!r.ok) return void res.status(r.erreur === "demande" ? 400 : 422).json({ error: r.erreur });
  res.json({ points: r.points, source: r.source });
});
