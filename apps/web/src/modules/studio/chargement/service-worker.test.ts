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
    keys: async () => [...caches.keys()],
    delete: async (n: string) => caches.delete(n),
    match: async (r: Request) => { for (const c of caches.values()) { const x = await c.match(r); if (x) return x; } return undefined; },
  };
  const fetch = async (r: string | Request) => {
    const url = typeof r === "string" ? r : new URL(r.url).pathname;
    ordre.push(url);
    if (o.reseau) return o.reseau(url);
    const html = url === "/index.html" ? `<html><meta name="fadi-build" content="${build}"></html>` : "x";
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
    expect([...b.caches.get("fadi-shell-b2")!.contenu.keys()].sort()).toEqual([...CLASSES.coquille, ...CLASSES.profil, ...CLASSES.facultatif].sort());
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
