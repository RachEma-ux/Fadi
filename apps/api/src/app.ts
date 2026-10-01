import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { attachUser } from "./middleware/require-auth.js";
import { authRouter } from "./routes/auth.js";
import { projectsRouter } from "./routes/projects.js";

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

  app.use(express.json({ limit: "256kb" }));
  app.use(attachUser);

  // Les routes d'authentification sont la cible privilégiée du
  // bourrage d'identifiants (credential stuffing) — limite dédiée, plus
  // stricte que le reste de l'API.
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
  app.use("/auth", authLimiter, authRouter);

  const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
  app.use("/projects", apiLimiter, projectsRouter);

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
