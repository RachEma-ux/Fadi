import type { NextFunction, Request, Response } from "express";
import { parse } from "cookie";
import { resolveSession, sessionTokenFrom, setSessionCookie, type SessionUser } from "../lib/auth.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser | undefined;
    /** Jeton du cookie de session présenté (jamais journalisé ni stocké). */
    sessionToken?: string | undefined;
  }
}

/**
 * Pose `req.user` quand une session valide existe, sans jamais bloquer la
 * requête : certaines routes (ex. lecture publique future) pourraient vouloir
 * savoir "qui" sans exiger une connexion. Les routes qui DOIVENT être
 * protégées utilisent `requireAuth` ci-dessous, pas celui-ci seul.
 * Une session encore portée par l'ancien cookie `fadi_session` est reposée sous le nom courant (UM-6).
 */
export async function attachUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.cookie;
  const cookies = header ? parse(header) : {};
  const presented = sessionTokenFrom(cookies);
  req.sessionToken = presented?.token;
  req.user = (await resolveSession(presented?.token)) ?? undefined;
  if (req.user && presented?.legacy) {
    // Plafond inconnu ici sans relecture : le cookie dure 30 jours au plus, la session serveur fait foi à chaque requête.
    setSessionCookie(res, presented.token, new Date(Date.now() + 30 * 24 * 3_600_000));
  }
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
