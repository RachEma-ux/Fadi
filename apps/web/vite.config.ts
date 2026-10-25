import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { classesPrecache, construireCarte, type SortieBuild } from "./src/modules/studio/chargement/carte-morceaux";
import { FICHIER_CARTE } from "./src/modules/studio/chargement/moteurs";

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
 * - carte des morceaux (`chargement.json`, B.3-06 / B.3-07) : graphe réel des imports du build, fichiers de chaque
 *   moteur de Studio et contrôle du découpage (`carte-morceaux.ts`) — une famille lourde (three.js, OCCT, Manifold,
 *   planche, vue 3D) dans le bundle initial ou dans un moteur qui ne doit pas la forcer fait échouer le build. La liste
 *   du précache est répartie en classes (coquille, profil Studio, facultatif) : le service worker les installe dans
 *   cet ordre.
 * L'identifiant affiché (page Paramètres) est le commit courant, sinon l'instant du build. Le cache du service worker
 * porte en plus une empreinte du contenu du build : noms empreints des fichiers produits, `index.html`, fichiers non
 * empreints de Parcelle et source du service worker. Deux builds du même commit au contenu différent (arbre modifié,
 * dépendances) n'ouvrent donc jamais le même cache. `index.html` reçoit la balise `<meta name="fadi-build" content="…">` :
 * le service worker n'en fait la coquille hors ligne que si elle porte son propre identifiant (jamais la page d'un
 * autre build).
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
      const assets = [...new Set(["/index.html", FICHIER_CARTE, ...Object.keys(bundle).map((name) => `/${name}`), ...publicFiles("parcelle")])].filter((p) => /\.(js|css|html|svg|woff2?|png|json)$/.test(p) && !p.includes("three.webgpu") && !p.startsWith("/."));
      // Le moteur WebGPU (option de la vue 3D, ~0,7 Mo) n'est pas préchargé : il ne sert que si l'option est cochée en ligne.
      const sorties: SortieBuild[] = Object.values(bundle).map((o) => o.type === "chunk"
        ? { type: "chunk", fileName: o.fileName, taille: Buffer.byteLength(o.code), isEntry: o.isEntry, facadeModuleId: o.facadeModuleId, moduleIds: o.moduleIds, imports: o.imports, dynamicImports: o.dynamicImports, css: [...(o.viteMetadata?.importedCss ?? [])] }
        : { type: "asset", fileName: o.fileName, taille: typeof o.source === "string" ? Buffer.byteLength(o.source) : o.source.byteLength, nomsOriginaux: o.originalFileNames ?? [] });
      const carte = construireCarte(sorties, buildId());
      if (!carte.verification.ok) {
        throw new Error(`[fadi-sw-build-id] découpage des bundles non conforme (B.3-06) :\n- ${carte.verification.violations.join("\n- ")}`);
      }
      const classes = classesPrecache(carte, assets);
      // Carte écrite avec l'identifiant complet du build (celui du cache) ; à défaut, avec le commit.
      const ecrireCarte = (build: string) => writeFileSync(join(outDir, FICHIER_CARTE.slice(1)), JSON.stringify({ ...carte, build }));
      ecrireCarte(carte.build);
      try {
        const template = readFileSync(file, "utf8");
        const indexFile = join(outDir, "index.html");
        const index = readFileSync(indexFile, "utf8");
        const digest = createHash("sha256");
        for (const name of Object.keys(bundle).filter((n) => n !== "index.html").sort()) digest.update(`${name}\n`);
        for (const served of publicFiles("parcelle").sort()) digest.update(`${served}\n`).update(readFileSync(join("public", served.slice(1))));
        digest.update(index).update(template);
        const id = `${buildId()}-${digest.digest("hex").slice(0, 12)}`;
        const marque = `<meta name="fadi-build" content="${id}">`;
        const charset = /<meta charset="[^"]*">/i;
        writeFileSync(indexFile, charset.test(index) ? index.replace(charset, (m) => `${m}${marque}`) : index.replace("<head>", `<head>${marque}`));
        writeFileSync(file, template.replaceAll("__FADI_BUILD__", id).replace('"__FADI_ASSETS__"', JSON.stringify(classes)));
        ecrireCarte(id);
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
  // Workers en modules ES (P2-1) : le Worker du noyau exact importe occt-wasm, dont le chargeur découpe son code ;
  // le format IIFE par défaut de Vite refuse ce découpage. Le `.wasm` reste un fichier séparé (`?url`, D-177).
  worker: { format: "es" },
  // Le même identifiant de build, lisible par l'application (page Paramètres : « Version »).
  define: { __FADI_BUILD__: JSON.stringify(buildId()) },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/auth": "http://localhost:3001",
      "^/admin/(users|invitations|trash)": "http://localhost:3001",
      "/projects": "http://localhost:3001",
      "/organizations": "http://localhost:3001",
      "/examples": "http://localhost:3001",
      "/library": "http://localhost:3001",
      "/notifications": "http://localhost:3001",
      "/preferences": "http://localhost:3001",
      "/sandbox/preferences": "http://localhost:3001",
      "/geodata/api": "http://localhost:3001",
      "/health": "http://localhost:3001",
      "/version": "http://localhost:3001",
      // Temps réel (Issue #283) : canal WebSocket des sessions en direct.
      "/temps-reel": { target: "http://localhost:3001", ws: true },
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
      "^/admin/(users|invitations|trash)": "http://localhost:3001",
      "/projects": "http://localhost:3001",
      "/organizations": "http://localhost:3001",
      "/examples": "http://localhost:3001",
      "/library": "http://localhost:3001",
      "/notifications": "http://localhost:3001",
      "/preferences": "http://localhost:3001",
      "/sandbox/preferences": "http://localhost:3001",
      "/geodata/api": "http://localhost:3001",
      "/health": "http://localhost:3001",
      "/version": "http://localhost:3001",
      // Temps réel (Issue #283) : canal WebSocket des sessions en direct.
      "/temps-reel": { target: "http://localhost:3001", ws: true },
    },
  },
});
