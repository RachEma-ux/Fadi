import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { attachUser } from "./middleware/require-auth.js";
import { pool } from "./db/client.js";
import { authRouter } from "./routes/auth.js";
import { projectsRouter } from "./routes/projects.js";
import { examplesRouter } from "./routes/examples.js";
import { libraryRouter } from "./routes/library.js";
import { notificationsRouter } from "./routes/notifications.js";
import { preferencesRouter } from "./routes/preferences.js";
import { sandboxPreferencesRouter } from "./routes/sandbox-preferences.js";
import { versionRouter } from "./routes/version.js";
import { adminRouter } from "./routes/admin/index.js";
import { csrfGuard } from "./middleware/csrf.js";

/** Préfixes servis par l'API ; tout le reste est l'application (fichiers du build, ou `index.html` pour une route du client). */
const API_PREFIX = /^\/(auth|admin\/(?:users|invitations)|projects|examples|library|notifications|preferences|health|sandbox\/preferences|version)(\/|$)/;

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // Derrière un relais TLS (Caddy, Traefik, hébergeur) : `TRUST_PROXY=1` pour que l'adresse du client (limites) et le
  // schéma (cookie `secure`) soient ceux de la requête d'origine.
  const trustProxy = Number(process.env["TRUST_PROXY"] ?? 0);
  if (trustProxy > 0) app.set("trust proxy", trustProxy);
  app.use(helmet({ contentSecurityPolicy: false }));

  const webOrigin = process.env["WEB_ORIGIN"] ?? "http://localhost:5173";
  app.use(
    cors({
      origin: webOrigin.split(",").map((o) => o.trim()),
      credentials: true,
    }),
  );

  // Limite générale de 256 ko ; les lots de commandes de l'Atelier (1 Mo, routes/atelier-commands.ts), les pièces
  // jointes des étapes, les exports de l'Atelier, l'import IFC et l'import d'archive ont leur propre lecture de corps (limite dédiée).
  const jsonBody = express.json({ limit: "256kb" });
  app.use((req, res, next) => (/\/atelier\/commands(\/|$)|\/atelier\/import-ifc$|\/atelier\/model(\/|$)|\/steps\/\d+\/files(\/|$)|\/documents\/dessins(\/|$)|^\/projects\/import$/.test(req.path) ? next() : jsonBody(req, res, next)));
  // Ce qui tourne : commit et date de construction de l'image (« inconnu » en développement). Monté avant attachUser :
  // aucune lecture de session, donc aucune requête à la base, même avec un cookie.
  app.use("/version", versionRouter());
  // CSRF (gestion des comptes, phase 2) : toute requête qui modifie avec un cookie doit venir de l'application.
  app.use(csrfGuard(webOrigin.split(",")));
  app.use(attachUser);

  // Les routes d'authentification sont la cible privilégiée du
  // bourrage d'identifiants (credential stuffing) — limite dédiée, plus
  // stricte que le reste de l'API. `AUTH_RATE_LIMIT` ne sert qu'à desserrer
  // cette limite pour les tests (chaque scénario d'autorisation enregistre
  // son propre utilisateur, et ils finissent par dépasser 20 appels /auth
  // dans un même fichier de test) ; en production la valeur par défaut
  // (20) s'applique toujours.
  const authLimit = Number(process.env["AUTH_RATE_LIMIT"] ?? 20);
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: authLimit, standardHeaders: true, legacyHeaders: false });
  app.use("/auth", authLimiter, authRouter);
  // Administration de la plateforme (comptes seulement, D-2) : 404 tant que FADI_ADMIN_ENABLED n'est pas `true`.
  // Seuls `/admin/users*` et `/admin/invitations*` sont l'API ; `/admin/utilisateurs` est la page du client (repli SPA).
  app.use("/admin", (req, res, next) => (/^\/(users|invitations)(\/|$)/.test(req.path) ? authLimiter(req, res, () => adminRouter(req, res, next)) : next()));

  // `API_RATE_LIMIT` ne sert, comme `AUTH_RATE_LIMIT`, qu'à desserrer la limite pour la suite de tests (une seule instance, des dizaines de scénarios) ; production : 300 requêtes / minute.
  const apiLimit = Number(process.env["API_RATE_LIMIT"] ?? 300);
  const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: apiLimit, standardHeaders: true, legacyHeaders: false });
  app.use("/projects", apiLimiter, projectsRouter);
  app.use("/examples", apiLimiter, examplesRouter);
  app.use("/library", apiLimiter, libraryRouter);
  app.use("/notifications", apiLimiter, notificationsRouter);
  app.use("/preferences", apiLimiter, preferencesRouter);
  // Sandbox (lot 5) : seules ses préférences d'outils passent par le serveur ; la page `/sandbox` reste celle du client.
  app.use("/sandbox/preferences", apiLimiter, sandboxPreferencesRouter);

  // Sonde de vie (hébergement, sonde de joignabilité du client) : l'API et sa base répondent-elles ? 503 sinon.
  app.get("/health", async (_req, res) => {
    try {
      await Promise.race([pool.query("SELECT 1"), new Promise((_resolve, reject) => setTimeout(() => reject(new Error("db_timeout")), 3000))]);
      res.status(200).json({ status: "ok", db: "ok" });
    } catch {
      res.status(503).json({ status: "degraded", db: "unavailable" });
    }
  });

  // Hébergement durable : l'API sert aussi l'application construite (`WEB_DIST` = apps/web/dist) — un seul processus, un
  // seul port, même origine (plus de `vite preview`, réservé au développement). Les fichiers empreints du build sont
  // immuables ; `index.html` et le service worker ne sont jamais mis en cache ; toute route du client renvoie `index.html`.
  const webDist = process.env["WEB_DIST"] ? resolve(process.env["WEB_DIST"]) : null;
  if (webDist && existsSync(join(webDist, "index.html"))) {
    app.use(
      express.static(webDist, {
        index: false,
        setHeaders: (res, filePath) => {
          if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          else res.setHeader("Cache-Control", "no-cache");
        },
      }),
    );
    app.use((req, res, next) => {
      // Repli SPA : une route du client (sans extension de fichier), jamais un fichier manquant ni un chemin de l'API.
      if (req.method !== "GET" || API_PREFIX.test(req.path) || /\.[a-z0-9]+$/i.test(req.path) || !req.accepts("html")) {
        next();
        return;
      }
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(join(webDist, "index.html"));
    });
  }

  // Gestionnaire d'erreurs final : jamais de stack trace renvoyée au client
  // (Definition of Done), log structuré côté serveur.
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ level: "error", message: (err as Error).message, stack: (err as Error).stack }));
    res.status(500).json({ error: "internal_error" });
  };
  app.use(errorHandler);

  return app;
}
