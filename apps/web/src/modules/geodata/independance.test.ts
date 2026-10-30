/**
 * GeoData est autonome des projets (ADR-GEODATA-01/02, GEO 04, INV-02/03) : le module n'importe ni le client d'API
 * général, ni un contexte, une route ou un module de projet (Parcours, Atelier, Studio, Sandbox, ProjectShell) ; seul
 * `client.ts` appelle le serveur, et seulement sous `/geodata/api` ; aucun module n'importe GeoData ; le moteur
 * cartographique n'est importé que par son adaptateur, chargé à la demande ; feuille de style isolée.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RACINE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(RACINE, "../..");
const fichiers = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? fichiers(p) : [p]; });
const sources = fichiers(RACINE).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
const code = (f: string) => readFileSync(f, "utf8");
const imports = (f: string) => [...code(f).matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);
const rel = (f: string) => relative(RACINE, f).split(sep).join("/");
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const PROJET = /(?<![\wÀ-ÿ])(projets?|projects?|projectIds?|project_ids?|ProjectShell|useProject\w*)(?![\wÀ-ÿ])/i;

describe("GeoData — module autonome (GEO 04)", () => {
  it("le module existe", () => expect(sources.length).toBeGreaterThanOrEqual(8));

  it("aucun import de projet, du client d'API général, ni d'un autre module", () => {
    for (const f of sources) for (const i of imports(f)) {
      expect(i, `${rel(f)} → ${i}`).not.toMatch(/modules\/(atelier|studio|parcours|sandbox|projets-sources|pilotage|collaboration|programmation|analyses|documents|bibliotheque)|routes\/|lib\/api|@parcours\/(atelier-model|planche-model|sandbox-planche-model|domain-model)/);
      if (i.startsWith(".")) expect(relative(SRC, resolve(dirname(f), i)).split(sep).join("/"), `${rel(f)} → ${i}`).toMatch(/^modules\/geodata(\/|$)/);
    }
  });

  it("aucune notion de projet dans le code du module", () => {
    for (const f of sources) expect(sansCommentaires(code(f)), rel(f)).not.toMatch(PROJET);
  });

  it("serveur : seul client.ts appelle, et seulement /geodata/api", () => {
    const appels = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket|EventSource/;
    expect(sources.filter((f) => appels.test(code(f))).map(rel)).toEqual(["client.ts"]);
    const client = code(join(RACINE, "client.ts"));
    expect(client).toContain('export const RACINE_API = "/geodata/api";');
    expect([...client.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1]!.trim())).toEqual(["`${RACINE_API}${chemin}`"]);
    expect(client).not.toMatch(/https?:\/\//);
  });

  it("le moteur cartographique n'est importé que par son adaptateur, lui-même chargé à la demande", () => {
    const parMaplibre = sources.filter((f) => imports(f).some((i) => i.startsWith("maplibre-gl"))).map(rel);
    expect(parMaplibre).toEqual(["carte/moteur-maplibre.ts"]);
    const statiques = sources.filter((f) => /from\s+["'][^"']*moteur-maplibre["']/.test(code(f)));
    expect(statiques).toEqual([]);
    expect(code(join(RACINE, "PageGeoData.tsx"))).toContain('import("./carte/moteur-maplibre")');
  });

  it("aucun autre module ni route n'importe GeoData (seul App.tsx le charge à la demande)", () => {
    const ailleurs = fichiers(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith(RACINE + sep) && /modules\/geodata/.test(code(f)));
    expect(ailleurs.map((f) => relative(SRC, f).split(sep).join("/"))).toEqual(["App.tsx"]);
    expect(code(join(SRC, "App.tsx"))).toContain('import("./modules/geodata/PageGeoData")');
  });

  it("feuille de style isolée sous .geodata-page", () => {
    const css = code(join(RACINE, "geodata.css")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]*\{/g, "");
    const selecteurs = [...css.matchAll(/(?:^|[}\n])\s*([^{}@\n][^{}]*)\{/g)].map((m) => m[1]!.trim()).filter(Boolean);
    expect(selecteurs.length).toBeGreaterThan(40);
    for (const s of selecteurs) for (const un of s.split(",")) expect(un.trim(), un).toMatch(/^\.geodata-page(?![\w-])/);
  });

  it("stockage local : clés « geodata » seulement, simple confort", () => {
    const toutes = sources.map(code).join("\n");
    const cles = [...toutes.matchAll(/\bCLE_\w+\s*=\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]!);
    expect(cles.length).toBeGreaterThan(0);
    for (const c of cles) expect(c).toMatch(/^geodata\./);
  });
});

/**
 * Interface ≠ base de données (D-GD-29, règle du maître d'ouvrage) : ni la page GeoData ni son modèle pur ne contiennent
 * de donnée. Aucun fichier de données importé, aucune géométrie écrite en dur, aucune série de valeurs, aucun nom de lieu :
 * tout vient de la base, lu par l'API. Les seules valeurs admises sont techniques (projection, bornes, styles, icônes).
 */
describe("GeoData — aucune donnée dans l'interface ni dans le modèle (D-GD-29)", () => {
  const MODELE = resolve(SRC, "../../../packages/geodata-model/src");
  const tous = [...sources, ...fichiers(MODELE).filter((f) => /\.ts$/.test(f) && !f.endsWith(".test.ts"))];
  it("aucun fichier de données importé (JSON, GeoJSON, CSV, raster, tableur)", () => {
    for (const f of tous) for (const i of imports(f)) expect(i, `${rel(f)} → ${i}`).not.toMatch(/\.(json|geojson|csv|tsv|tif|tiff|gpkg|xlsx?|shp|kml|pbf)(\?.*)?$/i);
  });
  it("aucune géométrie écrite en dur (coordonnées numériques)", () => {
    for (const f of tous) expect(sansCommentaires(code(f)), rel(f)).not.toMatch(/["']?coordinates["']?\s*:\s*\[\s*\[*\s*-?\d/);
  });
  it("aucune série de valeurs codée (12 nombres ou plus à la suite)", () => {
    for (const f of tous) expect(sansCommentaires(code(f)), rel(f)).not.toMatch(/\[\s*-?\d+(\.\d+)?(\s*,\s*-?\d+(\.\d+)?){11,}\s*\]/);
  });
  it("aucun nom de région, province ou ville du référentiel écrit dans le code", () => {
    const LIEUX = /(?<![\wÀ-ÿ])(Casablanca|Rabat|Marrakech|Tanger|Fès|Fes|Meknès|Agadir|Oujda|Kénitra|Tétouan|Laâyoune|Dakhla|Zenata|Mohammedia|Béni Mellal|Settat|Safi|El Jadida|Nador)(?![\wÀ-ÿ])/;
    for (const f of tous) expect(sansCommentaires(code(f)), rel(f)).not.toMatch(LIEUX);
  });
});
