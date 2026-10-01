import type { NextFunction, Request, Response } from "express";
import { parse } from "cookie";
import { resolveSession, SESSION_COOKIE, type SessionUser } from "../lib/auth.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser | undefined;
  }
}

/**
 * Pose `req.user` quand une session valide existe, sans jamais bloquer la
 * requête : certaines routes (ex. lecture publique future) pourraient vouloir
 * savoir "qui" sans exiger une connexion. Les routes qui DOIVENT être
 * protégées utilisent `requireAuth` ci-dessous, pas celui-ci seul.
 */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.cookie;
  const cookies = header ? parse(header) : {};
  const sessionId = cookies[SESSION_COOKIE];
  req.user = (await resolveSession(sessionId)) ?? undefined;
  next();
}

/**
 * Bloque la requête (401) si personne n'est connecté. C'est la SEULE
 * vérification "authentifié" — elle ne dit rien sur l'autorisation d'accéder
 * à une ressource précise, qui se fait route par route (voir projects.ts :
 * chaque requête re-vérifie `project.ownerId === req.user.id`).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }
  next();
}
