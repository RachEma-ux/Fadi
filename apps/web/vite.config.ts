import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Identifiant du build écrit dans le service worker (`public/sw.js`,
 * marqueur `__FADI_BUILD__`) : chaque build ouvre son propre cache
 * (`fadi-shell-<build>`) et, à l'activation, supprime ceux des builds
 * précédents — le moteur de l'Atelier et l'outil Parcelle (fichiers non
 * empreints, servis cache d'abord) ne restent donc jamais périmés après une
 * mise à jour. L'identifiant est le commit courant, sinon l'instant du build.
 */
function buildId(): string {
  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || Date.now().toString(36);
  } catch {
    return Date.now().toString(36);
  }
}

function serviceWorkerBuildId(): Plugin {
  let outDir = "dist";
  return {
    name: "fadi-sw-build-id",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    writeBundle() {
      const file = join(outDir, "sw.js");
      try {
        writeFileSync(file, readFileSync(file, "utf8").replaceAll("__FADI_BUILD__", buildId()));
      } catch (err) {
        console.warn(`[fadi-sw-build-id] ${file} non réécrit : ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

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
  plugins: [serviceWorkerBuildId()],
  server: {
    host: "0.0.0.0",
    proxy: {
      "/auth": "http://localhost:3001",
      "/projects": "http://localhost:3001",
      "/examples": "http://localhost:3001",
      "/library": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
  preview: {
    host: "0.0.0.0",
    // Le worker builder-deploy.yml publie ce `vite preview` sous un
    // sous-domaine *.trycloudflare.com différent à chaque run (nom aléatoire
    // choisi par Cloudflare) ; la protection anti-DNS-rebinding de Vite
    // rejette par défaut tout Host inconnu, donc sans ceci la page affiche
    // "Blocked request" dès qu'on ouvre l'URL publiée. Un déploiement local
    // (apps/web/README.md) n'est jamais exposé ainsi et reste protégé par
    // le host-check par défaut sur localhost/réseau local.
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/auth": "http://localhost:3001",
      "/projects": "http://localhost:3001",
      "/examples": "http://localhost:3001",
      "/library": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});
