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
import { atelierCommandsRouter } from "./routes/atelier-commands.js";

/** Préfixes servis par l'API ; tout le reste est l'application (fichiers du build, ou `index.html` pour une route du client). */
const API_PREFIX = /^\/(auth|projects|examples|library|notifications|health)(\/|$)/;

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

  // Limite générale de 256 ko ; le magasin de l'Atelier (modèle natif, ~1 Mo
  // pour P.118) a son propre analyseur JSON borné dans routes/atelier.ts.
  const jsonBody = express.json({ limit: "256kb" });
  // Le magasin de l'Atelier, les pièces jointes des étapes, les exports de l'Atelier et l'import d'archive ont leur propre lecture de corps (limite dédiée).
  app.use((req, res, next) => (/\/atelier\/store(\/|$)|\/steps\/\d+\/files(\/|$)|\/documents\/dessins(\/|$)|^\/projects\/import$/.test(req.path) ? next() : jsonBody(req, res, next)));
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

  // `API_RATE_LIMIT` ne sert, comme `AUTH_RATE_LIMIT`, qu'à desserrer la limite pour la suite de tests (une seule instance, des dizaines de scénarios) ; production : 300 requêtes / minute.
  const apiLimit = Number(process.env["API_RATE_LIMIT"] ?? 300);
  const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: apiLimit, standardHeaders: true, legacyHeaders: false });
  app.use("/projects", apiLimiter, projectsRouter);
  // Nouvel Atelier (§5.4) : après projectsRouter, dont la limite couvre déjà `/projects` ; l'ancien `/atelier/store` y reste servi.
  app.use("/projects/:projectId/atelier", atelierCommandsRouter);
  app.use("/examples", apiLimiter, examplesRouter);
  app.use("/library", apiLimiter, libraryRouter);
  app.use("/notifications", apiLimiter, notificationsRouter);

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
