import { execSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Service worker (`public/sw.js`) complété au build :
 * - `__FADI_BUILD__` : identifiant du build — chaque build ouvre son propre
 *   cache (`fadi-shell-<build>`) et, à l'activation, supprime ceux des
 *   builds précédents ; l'outil Parcelle (fichiers non empreints) ne
 *   reste donc jamais périmé ;
 * - `__FADI_ASSETS__` : la liste des fichiers à mettre en cache dès
 *   l'installation — morceaux de l'application (y compris ceux chargés
 *   paresseusement : projet, Atelier et sa vue 3D, bibliothèque), outil
 *   Parcelle — pour qu'un projet déjà ouvert s'ouvre entièrement sans
 *   réseau, même dans un écran jamais visité en ligne.
 * L'identifiant est le commit courant, sinon l'instant du build.
 */
function buildId(): string {
  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || Date.now().toString(36);
  } catch {
    return Date.now().toString(36);
  }
}

/** Fichiers d'un dossier de `public/`, en chemins servis (`/parcelle/index.html`…), README exclus. */
function publicFiles(dir: string): string[] {
  try {
    return readdirSync(join("public", dir), { withFileTypes: true })
      .filter((e) => e.isFile() && !/^readme\.md$/i.test(e.name))
      .map((e) => `/${dir}/${e.name}`);
  } catch {
    return [];
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
    writeBundle(_options, bundle) {
      const file = join(outDir, "sw.js");
      const assets = [...new Set(["/index.html", ...Object.keys(bundle).map((name) => `/${name}`), ...publicFiles("parcelle")])].filter((p) => /\.(js|css|html|svg|woff2?|png|json)$/.test(p) && !p.includes("three.webgpu"));
      // Le moteur WebGPU (option de la vue 3D, ~0,7 Mo) n'est pas préchargé : il ne sert que si l'option est cochée en ligne.
      try {
        writeFileSync(file, readFileSync(file, "utf8").replaceAll("__FADI_BUILD__", buildId()).replace('"__FADI_ASSETS__"', JSON.stringify(assets)));
      } catch (err) {
        console.warn(`[fadi-sw-build-id] ${file} non réécrit : ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

/**
 * En développement, le frontend appelle l'API avec des chemins relatifs
 * (`/auth/...`, `/projects/...`, `/notifications`) et Vite les relaie vers `apps/api` sur le
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
  // Le même identifiant de build, lisible par l'application (page Paramètres : « Version »).
  define: { __FADI_BUILD__: JSON.stringify(buildId()) },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/auth": "http://localhost:3001",
      "/projects": "http://localhost:3001",
      "/examples": "http://localhost:3001",
      "/library": "http://localhost:3001",
      "/notifications": "http://localhost:3001",
      "/preferences": "http://localhost:3001",
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
      "/notifications": "http://localhost:3001",
      "/preferences": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});
