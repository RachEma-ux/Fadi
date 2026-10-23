import type { NextFunction, Request, Response } from "express";

/**
 * Protection CSRF (plan phase 2, tâche 6) pour toute requête qui modifie et qui porte un cookie : un navigateur envoie
 * `Origin` (et `Sec-Fetch-Site`) ; l'origine doit être celle de l'API ou l'une de `WEB_ORIGIN`, et `Sec-Fetch-Site`
 * ne peut pas être `cross-site`. Une requête sans aucun de ces en-têtes ne vient pas d'un navigateur moderne
 * (scripts, tests) : elle n'est pas forgeable par une page tierce et passe. Le cookie `SameSite=Lax` reste la première
 * barrière ; ceci est la seconde.
 */
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfGuard(allowedOrigins: readonly string[]) {
  const allowed = new Set(allowedOrigins.map((o) => o.trim().replace(/\/$/, "")).filter(Boolean));
  return (req: Request, res: Response, next: NextFunction): void => {
    if (SAFE.has(req.method) || !req.headers.cookie) { next(); return; }
    const origin = req.get("origin");
    const site = req.get("sec-fetch-site");
    const own = `${req.protocol}://${req.get("host")}`;
    const originOk = !origin || origin === own || allowed.has(origin);
    const siteOk = !site || site === "same-origin" || site === "none" || (site === "same-site" && !!origin && originOk);
    if (originOk && siteOk) { next(); return; }
    res.status(403).json({ error: "csrf_refused", message: "Requête refusée : origine non autorisée." });
  };
}
