import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { attachUser } from "./middleware/require-auth.js";
import { authRouter } from "./routes/auth.js";
import { projectsRouter } from "./routes/projects.js";
import { examplesRouter } from "./routes/examples.js";

export function createApp() {
  const app = express();

  // L'API est appelée en JSON par le frontend, jamais par un formulaire HTML
  // classique ; elle n'a donc pas besoin de servir de pages elle-même.
  app.disable("x-powered-by");
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
  // Le magasin de l'Atelier et les pièces jointes des étapes ont leur propre lecture de corps (limite dédiée, octets bruts).
  app.use((req, res, next) => (/\/atelier\/store(\/|$)|\/steps\/\d+\/files(\/|$)/.test(req.path) ? next() : jsonBody(req, res, next)));
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

  const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
  app.use("/projects", apiLimiter, projectsRouter);
  app.use("/examples", apiLimiter, examplesRouter);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

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
