#!/usr/bin/env node
/**
 * Contrôle de licence et de provenance du noyau exact distribué (TR-EX-096, EX-096 ; D-177) — sur l'artefact
 * effectivement distribué, `apps/web/dist` après `npm run build` :
 *
 *  1. un seul binaire `.wasm` OCCT dans `dist/assets`, **identique octet pour octet** à celui du paquet installé
 *     (`occt-wasm`, non modifié) ;
 *  2. **version** : celle du paquet installé = celle exigée par `@parcours/geometry-exact` (dépendance exacte) = celle de
 *     la notice distribuée ;
 *  3. **licence** : le paquet déclare son binaire « LGPL-2.1-only » (README, section License) ; la notice distribuée le
 *     dit, et le texte de la LGPL 2.1 est servi à côté (`dist/licences/occt-wasm/LGPL-2.1.txt`) ;
 *  4. **obligations** de la LGPL pour un composant chargé à l'exécution : fichier séparé (jamais incorporé à un morceau
 *     JavaScript, jamais dans le bundle initial ni dans le précache du service worker), remplaçable par l'utilisateur
 *     (`localStorage["fadi.occt.wasm"]`, cité par la notice), source et provenance citées, notice qui nomme le fichier
 *     distribué et son empreinte SHA-256.
 *
 * Sortie : une ligne ✓ / ✗ par contrôle ; code de sortie 1 au premier manquement. Pur et sans réseau.
 *
 *   node apps/web/scripts/controle-licence-occt.mjs [dossier-dist]
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const CLE_REMPLACEMENT = "fadi.occt.wasm";
export const LICENCE_BINAIRE = "LGPL-2.1-only";

const sha256 = (o) => createHash("sha256").update(o).digest("hex");

/** Paquet `occt-wasm` installé (localisé par son binaire : son `package.json` n'est pas exporté). */
export function paquetInstalle(racine = RACINE) {
  const candidats = [join(racine, "node_modules/occt-wasm"), join(racine, "apps/web/node_modules/occt-wasm"), join(racine, "packages/geometry-exact/node_modules/occt-wasm")];
  const dossier = candidats.find((d) => existsSync(join(d, "dist/occt-wasm.wasm")));
  if (!dossier) return null;
  const pkg = JSON.parse(readFileSync(join(dossier, "package.json"), "utf8"));
  const readme = existsSync(join(dossier, "README.md")) ? readFileSync(join(dossier, "README.md"), "utf8") : "";
  const wasm = readFileSync(join(dossier, "dist/occt-wasm.wasm"));
  return { version: pkg.version, licenceOutillage: pkg.license, depot: pkg.repository?.url ?? null, readme, sha256: sha256(wasm), taille: wasm.length };
}

/** Version exigée par `@parcours/geometry-exact` (dépendance exacte). */
export function versionExigee(racine = RACINE) {
  return JSON.parse(readFileSync(join(racine, "packages/geometry-exact/package.json"), "utf8")).dependencies?.["occt-wasm"] ?? null;
}

/**
 * Contrôles sur un dossier `dist` : rend la liste `{ controle, ok, detail }`. `ref` : paquet installé et version exigée
 * (injectés par les tests).
 */
export function controlerDistribution(dist, ref = { paquet: paquetInstalle(), version: versionExigee() }) {
  const r = [];
  const noter = (controle, ok, detail = "") => r.push({ controle, ok: !!ok, detail });
  const { paquet, version } = ref;
  noter("paquet occt-wasm installé et localisé", paquet, paquet ? `occt-wasm ${paquet.version}` : "introuvable");
  if (!paquet) return r;
  const assets = existsSync(join(dist, "assets")) ? readdirSync(join(dist, "assets")) : [];
  // Le binaire d'OCCT seulement (Manifold, autre composant, a son propre .wasm) : nom émis « occt-wasm-<empreinte>.wasm ».
  const wasm = assets.filter((f) => /^occt-wasm[^/]*\.wasm$/.test(f));
  noter("un seul binaire .wasm OCCT distribué (dist/assets)", wasm.length === 1, wasm.join(", ") || "aucun");
  if (wasm.length !== 1) return r;
  const fichier = `/assets/${wasm[0]}`;
  const octets = readFileSync(join(dist, "assets", wasm[0]));
  const empreinte = sha256(octets);
  noter("binaire distribué identique à celui du paquet (non modifié, SHA-256)", empreinte === paquet.sha256, empreinte);
  noter("version : paquet installé = dépendance exacte de @parcours/geometry-exact", paquet.version === version, `${paquet.version} / ${version}`);
  const section = /## License([\s\S]*?)(\n## |$)/.exec(paquet.readme)?.[1] ?? "";
  noter(`licence du binaire déclarée par le paquet : ${LICENCE_BINAIRE}`, /Compiled WASM output\*?\*?:\s*LGPL-2\.1-only/.test(section), section.trim().split("\n")[2] ?? "section License absente");
  const noticeJson = join(dist, "licences/occt-wasm/NOTICE.json"), noticeTxt = join(dist, "licences/occt-wasm/NOTICE.txt"), lgpl = join(dist, "licences/occt-wasm/LGPL-2.1.txt");
  noter("notice de licence servie (licences/occt-wasm/NOTICE.txt et NOTICE.json)", existsSync(noticeJson) && existsSync(noticeTxt));
  if (!existsSync(noticeJson) || !existsSync(noticeTxt)) return r;
  const n = JSON.parse(readFileSync(noticeJson, "utf8"));
  const texte = readFileSync(noticeTxt, "utf8");
  noter("notice : composant, version et licence du binaire", n.composant === "occt-wasm" && n.version === paquet.version && n.licence === LICENCE_BINAIRE && texte.includes(LICENCE_BINAIRE) && texte.includes(paquet.version), `${n.composant} ${n.version} ${n.licence}`);
  noter("notice : fichier distribué et son SHA-256", n.fichier === fichier && n.sha256 === empreinte && texte.includes(empreinte) && texte.includes(fichier), `${n.fichier} ${n.sha256}`);
  noter("notice : provenance (paquet, dépôt, sources OCCT) et décision D-177", texte.includes("occt-wasm@") && (!paquet.depot || texte.includes(paquet.depot.replace(/^git\+/, ""))) && texte.includes("opencascade") && texte.includes("D-177"));
  noter(`obligation de remplacement citée (localStorage « ${CLE_REMPLACEMENT} »)`, texte.includes(CLE_REMPLACEMENT) && n.remplacement?.includes(CLE_REMPLACEMENT));
  const t = existsSync(lgpl) ? readFileSync(lgpl, "utf8") : "";
  noter("texte de la LGPL 2.1 servi (licences/occt-wasm/LGPL-2.1.txt)", t.includes("GNU LESSER GENERAL PUBLIC LICENSE") && t.includes("Version 2.1, February 1999") && t.length > 20000, `${t.length} caractères`);
  // Chargement séparé : aucun morceau JavaScript n'incorpore le binaire (en-tête « \0asm » ou son base64 « AGFzbQ »).
  const js = assets.filter((f) => f.endsWith(".js"));
  const incorpore = js.filter((f) => { const s = readFileSync(join(dist, "assets", f), "latin1"); return s.includes("AGFzbQ") || s.includes("\u0000asm\u0001"); });
  noter("chargement séparé : binaire jamais incorporé à un morceau JavaScript", incorpore.length === 0, incorpore.join(", "));
  const sw = existsSync(join(dist, "sw.js")) ? readFileSync(join(dist, "sw.js"), "utf8") : "";
  noter("chargement à la demande : binaire absent du précache du service worker", sw.length > 0 && !sw.includes(wasm[0]));
  const carte = existsSync(join(dist, "chargement.json")) ? JSON.parse(readFileSync(join(dist, "chargement.json"), "utf8")) : null;
  noter("chargement à la demande : binaire hors du bundle initial, rattaché au seul moteur noyau-exact de Studio",
    carte && !carte.initial.includes(fichier) && (carte.moteurs["noyau-exact"]?.fichiers ?? []).includes(fichier)
      && Object.entries(carte.moteurs).every(([id, m]) => id === "noyau-exact" || !m.fichiers.includes(fichier)));
  noter("taille distribuée = taille du paquet (octets)", statSync(join(dist, "assets", wasm[0])).size === paquet.taille, String(paquet.taille));
  return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = resolve(process.argv[2] ?? join(RACINE, "apps/web/dist"));
  const r = controlerDistribution(dist);
  for (const c of r) console.log(`${c.ok ? "✓" : "✗"} TR-EX-096 : ${c.controle}${c.detail ? ` — ${c.detail}` : ""}`);
  process.exit(r.every((c) => c.ok) && r.length >= 14 ? 0 : 1);
}
