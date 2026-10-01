import { defineConfig } from "vite";

/**
 * En développement, le frontend appelle l'API avec des chemins relatifs
 * (`/auth/...`, `/projects/...`) et Vite les relaie vers `apps/api` sur le
 * port 3001. Même origine du point de vue du navigateur → pas de CORS à
 * gérer, et le cookie de session (SameSite=Lax) fonctionne sans configuration
 * particulière. En production, le même effet s'obtient avec un reverse
 * proxy (nginx, etc.) qui sert les deux sous un seul domaine ; voir
 * apps/web/README.md.
 *
 * `preview.proxy` reproduit le même relais pour `vite preview` (le build de
 * production servi localement) : c'est ce que `.github/workflows/
 * builder-deploy.yml` tunnelise pour exposer une URL publique temporaire —
 * un seul port à exposer, l'API reste jointe en coulisses.
 */
export default defineConfig({
  server: {
    host: "0.0.0.0",
    proxy: {
      "/auth": "http://localhost:3001",
      "/projects": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
  preview: {
    host: "0.0.0.0",
    proxy: {
      "/auth": "http://localhost:3001",
      "/projects": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});
