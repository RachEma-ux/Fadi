/**
 * Service worker (`public/sw.js`) exécuté dans un bac à sable (node:vm) avec des caches et des clients simulés :
 * classes du précache dans l'ordre (B.3-07), protection d'une page ouverte pendant une mise à jour et annonce de la
 * mise à jour (B.3-10), carte des morceaux servie hors ligne, API jamais interceptée, IndexedDB jamais touchée.
 */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(new URL("../../../../public/sw.js", import.meta.url), "utf8");

class FauxCache {
  readonly contenu = new Map<string, Response>();
  async match(r: string | Request) { const k = typeof r === "string" ? r : new URL(r.url).pathname; return this.contenu.get(k)?.clone(); }
  async put(r: string | Request, res: Response) { this.contenu.set(typeof r === "string" ? r : new URL(r.url).pathname, res); }
  async keys() { return [...this.contenu.keys()].map((k) => new Request(`https://fadi.test${k}`)); }
  async delete(k: string) { return this.contenu.delete(k); }
}

function bac(build: string, classes: unknown, o: { anciens?: string[]; pagesOuvertes?: number; reseau?: (url: string) => Response | Promise<Response> } = {}) {
  const caches = new Map<string, FauxCache>();
  for (const n of o.anciens ?? []) caches.set(n, new FauxCache());
  const ordre: string[] = [];
  const messages: unknown[] = [];
  const handlers: Record<string, (e: unknown) => void> = {};
  const clients = Array.from({ length: o.pagesOuvertes ?? 0 }, () => ({ postMessage: (m: unknown) => messages.push(m) }));
  const self = {
    location: { origin: "https://fadi.test" },
    addEventListener: (t: string, f: (e: unknown) => void) => { handlers[t] = f; },
    skipWaiting: async () => undefined,
    clients: { matchAll: async () => clients, claim: async () => undefined },
  };
  const cachesApi = {
    open: async (n: string) => { if (!caches.has(n)) caches.set(n, new FauxCache()); return caches.get(n)!; },
    has: async (n: string) => caches.has(n),
    keys: async () => [...caches.keys()],
    delete: async (n: string) => caches.delete(n),
    match: async (r: Request) => { for (const c of caches.values()) { const x = await c.match(r); if (x) return x; } return undefined; },
  };
  const fetch = async (r: string | Request) => {
    const url = typeof r === "string" ? r : new URL(r.url).pathname;
    ordre.push(url);
    if (o.reseau) return o.reseau(url);
    const html = url === "/index.html" ? `<html><meta name="fadi-build" content="${build}"></html>` : url === "/chargement.json" ? JSON.stringify({ version: 1, build }) : "x";
    return new Response(html, { headers: { "content-type": url.endsWith(".html") ? "text/html" : "text/javascript" } });
  };
  const code = SOURCE.replaceAll("__FADI_BUILD__", build).replace('"__FADI_ASSETS__"', JSON.stringify(classes));
  // Request du service worker : chemins relatifs résolus sur l'origine (comme dans un vrai service worker).
  class RequestSw extends Request { constructor(i: RequestInfo, init?: RequestInit) { super(typeof i === "string" && i.startsWith("/") ? `https://fadi.test${i}` : i, init); } }
  runInNewContext(code, { self, caches: cachesApi, fetch, Request: RequestSw, Response, URL, console });
  const attendre = async (type: string, extra: Record<string, unknown> = {}) => {
    let promesse: Promise<unknown> = Promise.resolve();
    handlers[type]!({ waitUntil: (p: Promise<unknown>) => { promesse = p; }, respondWith: (p: Promise<unknown>) => { promesse = p; }, ...extra });
    return promesse;
  };
  return { caches, ordre, messages, handlers, attendre };
}

const CLASSES = { coquille: ["/index.html", "/assets/index-a.js"], profil: ["/chargement.json", "/assets/planche-b.js"], facultatif: ["/assets/three-c.js", "/assets/atelier-d.js"] };

describe("Service worker : précache par classes et mises à jour (B.3-07, B.3-10)", () => {
  it("installation : coquille et profil mis en cache avant les modules facultatifs, tous dans le cache du build", async () => {
    const b = bac("b2", CLASSES);
    await b.attendre("install");
    const i = (u: string) => b.ordre.indexOf(u);
    for (const essentiel of ["/index.html", "/assets/index-a.js", "/chargement.json", "/assets/planche-b.js"]) {
      for (const fac of CLASSES.facultatif) expect(i(essentiel), `${essentiel} avant ${fac}`).toBeLessThan(i(fac));
    }
    // EX-042 : une classe par cache du build (coquille, profil, modules facultatifs).
    expect([...b.caches.get("fadi-shell-b2")!.contenu.keys()].sort()).toEqual([...CLASSES.coquille].sort());
    expect([...b.caches.get("fadi-profil-b2")!.contenu.keys()].sort()).toEqual([...CLASSES.profil].sort());
    expect([...b.caches.get("fadi-modules-b2")!.contenu.keys()].sort()).toEqual([...CLASSES.facultatif].sort());
  });

  it("une liste simple (ancienne forme) reste acceptée", async () => {
    const b = bac("b2", ["/index.html", "/assets/index-a.js"]);
    await b.attendre("install");
    expect(b.caches.get("fadi-shell-b2")!.contenu.size).toBe(2);
  });

  it("mise à jour avec une page ouverte : le dernier ancien cache est gardé, la page est prévenue, sans rechargement imposé", async () => {
    const b = bac("b3", CLASSES, { anciens: ["fadi-shell-b1", "fadi-shell-b2"], pagesOuvertes: 1 });
    await b.attendre("activate");
    expect([...b.caches.keys()]).toEqual(["fadi-shell-b2"]);
    expect(b.messages).toEqual([{ type: "fadi-sw-active", build: "b3", ancienGarde: "fadi-shell-b2", precedents: 2 }]);
  });

  it("mise à jour sans page ouverte : tous les anciens caches purgés ; première installation : aucune « mise à jour » annoncée", async () => {
    const b = bac("b3", CLASSES, { anciens: ["fadi-shell-b1", "fadi-shell-b2"] });
    await b.attendre("activate");
    expect([...b.caches.keys()]).toEqual([]);
    const premiere = bac("b1", CLASSES, { pagesOuvertes: 1 });
    await premiere.attendre("activate");
    expect(premiere.messages).toEqual([{ type: "fadi-sw-active", build: "b1", ancienGarde: null, precedents: 0 }]);
  });

  it("la file locale (IndexedDB) n'est jamais lue ni modifiée par le service worker", () => {
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/indexedDB|IDB|Dexie|localStorage/);
  });

  it("carte des morceaux : seule celle de CE build est enregistrée (installation et lecture réseau)", async () => {
    let buildServi = "b3";
    const b = bac("b2", CLASSES, { reseau: (u) => new Response(u === "/chargement.json" ? JSON.stringify({ version: 1, build: buildServi }) : "x", { headers: { "content-type": u.endsWith(".html") ? "text/html" : "text/javascript" } }) });
    await b.attendre("install");
    const cache = b.caches.get("fadi-profil-b2")!;
    expect(cache.contenu.has("/chargement.json")).toBe(false);
    // Lecture réseau d'une carte d'un autre build : rendue à la page, jamais enregistrée.
    let reponse: Promise<Response> | null = null;
    b.handlers.fetch!({ request: new Request("https://fadi.test/chargement.json"), respondWith: (p: Promise<Response>) => { reponse = p; } });
    expect(JSON.parse(await (await reponse!).text()).build).toBe("b3");
    expect(cache.contenu.has("/chargement.json")).toBe(false);
    // La carte de ce build, elle, est enregistrée.
    buildServi = "b2";
    b.handlers.fetch!({ request: new Request("https://fadi.test/chargement.json"), respondWith: (p: Promise<Response>) => { reponse = p; } });
    await reponse!;
    expect(JSON.parse(await (await cache.match("/chargement.json"))!.text()).build).toBe("b2");
  });

  it("carte des morceaux : réseau d'abord, copie de ce build hors ligne ; API jamais interceptée", async () => {
    let enLigne = true;
    const b = bac("b2", CLASSES, { reseau: (u) => { if (!enLigne) throw new TypeError("hors ligne"); return new Response(u === "/chargement.json" ? '{"build":"b2"}' : "x"); } });
    await b.attendre("install");
    enLigne = false;
    let reponse: Promise<Response> | null = null;
    b.handlers.fetch!({ request: new Request("https://fadi.test/chargement.json"), respondWith: (p: Promise<Response>) => { reponse = p; } });
    expect(await (await reponse!).text()).toBe('{"build":"b2"}');
    let intercepte = false;
    b.handlers.fetch!({ request: new Request("https://fadi.test/projects/p1/studio/preferences/outils"), respondWith: () => { intercepte = true; } });
    expect(intercepte).toBe(false);
  });
});

describe("TR-EX-042 — caches différenciés : coquille, profil, modules facultatifs, données hors service worker", () => {
  it("trois caches distincts par build ; un module lu plus tard rejoint le cache de sa classe ; hors ligne, chaque classe est servie depuis son cache", async () => {
    let enLigne = true;
    const b = bac("b2", CLASSES, { reseau: (u) => { if (!enLigne) throw new TypeError("hors ligne"); return new Response(u === "/index.html" ? '<html><meta name="fadi-build" content="b2"></html>' : u === "/chargement.json" ? '{"build":"b2"}' : `code ${u}`, { headers: { "content-type": u.endsWith(".html") ? "text/html" : "text/javascript" } }); } });
    await b.attendre("install");
    expect([...b.caches.keys()].sort()).toEqual(["fadi-modules-b2", "fadi-profil-b2", "fadi-shell-b2"]);
    // Module facultatif hors liste anticipée (téléchargé à la demande, au premier usage) : rangé dans le cache des modules.
    let reponse: Promise<Response> | null = null;
    b.handlers.fetch!({ request: new Request("https://fadi.test/assets/noyau-exact.worker-e.js"), respondWith: (p: Promise<Response>) => { reponse = p; } });
    await reponse!;
    expect(b.caches.get("fadi-modules-b2")!.contenu.has("/assets/noyau-exact.worker-e.js")).toBe(true);
    expect(b.caches.get("fadi-shell-b2")!.contenu.has("/assets/noyau-exact.worker-e.js")).toBe(false);
    enLigne = false;
    for (const [chemin, attendu] of [["/assets/index-a.js", "code /assets/index-a.js"], ["/assets/planche-b.js", "code /assets/planche-b.js"], ["/assets/three-c.js", "code /assets/three-c.js"]] as const) {
      b.handlers.fetch!({ request: new Request(`https://fadi.test${chemin}`), respondWith: (p: Promise<Response>) => { reponse = p; } });
      expect(await (await reponse!).text()).toBe(attendu);
    }
  });

  it("le précache n'est pas un chargement : le binaire du noyau exact n'est jamais préchargé (téléchargement facultatif à la demande) ; les données et la file restent hors du service worker", () => {
    const config = readFileSync(new URL("../../../../vite.config.ts", import.meta.url), "utf8");
    // Liste anticipée : extensions de code et de page seulement — aucun .wasm.
    expect(config).toMatch(/\.filter\(\(p\) => \/\\\.\(js\|css\|html\|svg\|woff2\?\|png\|json\)\$\/\.test\(p\)/);
    expect(SOURCE).toMatch(/const API = /);
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/indexedDB|IDB|Dexie/);
  });

  it("mise à jour avec une page ouverte : les trois caches du build précédent restent ensemble, les plus anciens sont purgés", async () => {
    const b = bac("b3", CLASSES, { anciens: ["fadi-shell-b1", "fadi-profil-b1", "fadi-modules-b1", "fadi-shell-b2", "fadi-profil-b2", "fadi-modules-b2"], pagesOuvertes: 1 });
    await b.attendre("activate");
    expect([...b.caches.keys()].sort()).toEqual(["fadi-modules-b2", "fadi-profil-b2", "fadi-shell-b2"]);
  });
});
