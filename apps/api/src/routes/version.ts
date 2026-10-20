import { Router } from "express";

/** Ce qui tourne : commit et date de construction, fournis à la construction de l'image (`FADI_COMMIT`, `FADI_BUILD_DATE`). */
export interface VersionConstruite {
  commit: string;
  buildDate: string;
}

const INCONNU = "inconnu";
const COMMIT = /^[0-9a-f]{7,40}$/;
// Date ISO 8601 en UTC, à la seconde (`date -u +%Y-%m-%dT%H:%M:%SZ`).
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** Lit la version depuis l'environnement ; une valeur absente ou mal formée est « inconnu » (développement, image sans argument). */
export function lireVersion(env: Record<string, string | undefined> = process.env): VersionConstruite {
  const commit = env["FADI_COMMIT"]?.trim().toLowerCase() ?? "";
  const buildDate = env["FADI_BUILD_DATE"]?.trim() ?? "";
  return {
    commit: COMMIT.test(commit) ? commit : INCONNU,
    buildDate: DATE.test(buildDate) && !Number.isNaN(Date.parse(buildDate)) ? buildDate : INCONNU,
  };
}

/** Route publique `GET /version` : lue une fois au démarrage, jamais mise en cache par un relais. */
export function versionRouter(env: Record<string, string | undefined> = process.env) {
  const version = lireVersion(env);
  const router = Router();
  router.get("/", (_req, res) => {
    res.set("Cache-Control", "no-store").json(version);
  });
  return router;
}
