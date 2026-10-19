import { describe, expect, it } from "vitest";
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import { outilsHorsConnexion, preparerHorsConnexion, verifierHorsConnexion, type CachesLike, type EnvCache } from "./cache-hors-ligne";
import type { CarteChargement } from "./carte-morceaux";

const carte = (build = "b1"): CarteChargement => ({
  version: 1, build, entree: "/assets/index-a.js", initial: ["/assets/index-a.js"],
  moteurs: {
    "coquille-studio": { fichiers: ["/assets/index-a.js", "/assets/shell.js"], propres: ["/assets/shell.js"], taille: 1 },
    "planche-2d": { fichiers: ["/assets/index-a.js", "/assets/shell.js", "/assets/planche.js"], propres: ["/assets/planche.js"], taille: 1 },
    "rendu-3d": { fichiers: ["/assets/index-a.js", "/assets/shell.js", "/assets/planche.js", "/assets/vue3d.js", "/assets/three.js"], propres: ["/assets/vue3d.js", "/assets/three.js"], taille: 1 },
    calcul: { fichiers: ["/assets/studio.worker.js"], propres: ["/assets/studio.worker.js"], taille: 1 },
  },
  morceaux: {}, verification: { ok: true, violations: [] },
});

function env(fichiers: string[], o: { build?: string | null; cache?: boolean; reseau?: Record<string, number>; buildCarte?: string } = {}) {
  const contenu = new Set(fichiers);
  const ranges: string[] = [];
  const demandes: string[] = [];
  const caches: CachesLike = {
    has: async (n) => (o.cache ?? true) && n === `fadi-shell-${o.build === undefined ? "b1" : o.build}`,
    open: async () => ({ match: async (f) => (contenu.has(f) ? {} : undefined), put: async (f) => { contenu.add(f); ranges.push(f); } }),
  };
  const e: EnvCache = {
    caches, build: o.build === undefined ? "b1" : o.build,
    fetch: async (u) => { demandes.push(u); const s = o.reseau?.[u] ?? 200; return new Response(u === "/chargement.json" ? JSON.stringify(carte(o.buildCarte ?? "b1")) : "x", { status: s }); },
  };
  return { e, ranges, demandes, contenu };
}
const tous = ["/index.html", "/assets/index-a.js", "/assets/shell.js", "/assets/planche.js", "/assets/vue3d.js", "/assets/three.js", "/assets/studio.worker.js"];

describe("Disponibilité hors connexion véridique (B.3-09, EX-043)", () => {
  it("sans service worker, sans cache de ce build ou avec la carte d'un autre build : non évalué, jamais disponible", async () => {
    expect((await verifierHorsConnexion({ ...env(tous).e, caches: null }, carte())).raison).toBe("sans-service-worker");
    expect((await verifierHorsConnexion(env(tous, { build: null }).e, carte())).raison).toBe("sans-service-worker");
    expect((await verifierHorsConnexion(env(tous).e, null)).raison).toBe("sans-carte");
    expect((await verifierHorsConnexion(env(tous).e, carte("autre"))).raison).toBe("sans-carte");
    const v = await verifierHorsConnexion(env(tous, { cache: false }).e, carte());
    expect(v.raison).toBe("sans-cache-du-build");
    expect(Object.values(v.moteurs).every((x) => x === null)).toBe(true);
    expect(outilsHorsConnexion(STUDIO_TOOLS, v)).toBeNull();
  });

  it("tout en cache : chaque moteur et chaque outil disponibles", async () => {
    const v = await verifierHorsConnexion(env(tous).e, carte());
    expect(v.moteurs).toEqual({ "coquille-studio": true, "planche-2d": true, "rendu-3d": true, calcul: true });
    expect(outilsHorsConnexion(STUDIO_TOOLS, v)?.indisponibles).toEqual([]);
  });

  it("three.js absent du cache : rendu 3D indisponible, les outils 3D listés, les outils 2D restent disponibles", async () => {
    const v = await verifierHorsConnexion(env(tous.filter((f) => f !== "/assets/three.js")).e, carte());
    expect(v.moteurs["rendu-3d"]).toBe(false);
    expect(v.moteurs["planche-2d"]).toBe(true);
    expect(v.manquants["rendu-3d"]).toEqual(["/assets/three.js"]);
    const o = outilsHorsConnexion(STUDIO_TOOLS, v)!;
    expect(new Set(o.indisponibles.map((t) => t.groupe))).toEqual(new Set(["volume-libre", "visualisation"]));
    expect(o.disponibles.some((t) => t.toolId === "studio.dessin.ligne")).toBe(true);
  });

  it("une dépendance manquante rend indisponible le moteur qui en dépend (Worker absent → rendu 3D)", async () => {
    const v = await verifierHorsConnexion(env(tous.filter((f) => f !== "/assets/studio.worker.js")).e, carte());
    expect(v.moteurs).toMatchObject({ calcul: false, "rendu-3d": false, "planche-2d": true });
  });

  it("coquille absente : rien n'est disponible", async () => {
    const v = await verifierHorsConnexion(env(tous.filter((f) => f !== "/index.html")).e, carte());
    expect(v.coquille).toBe(false);
    expect(Object.values(v.moteurs).every((x) => x === false)).toBe(true);
  });

  it("préparer le profil : seuls les fichiers manquants de la carte sont téléchargés et rangés ; un échec est rendu", async () => {
    const b = env(["/index.html", "/assets/index-a.js", "/assets/shell.js", "/assets/planche.js"], { reseau: { "/assets/studio.worker.js": 503 } });
    const r = await preparerHorsConnexion(b.e, carte(), ["rendu-3d"]);
    expect(r.raison).toBe("evalue");
    expect([...r.ranges].sort()).toEqual(["/assets/three.js", "/assets/vue3d.js", "/chargement.json"]);
    expect(r.echecs).toEqual(["/assets/studio.worker.js"]);
    expect(b.demandes.every((u) => u === "/chargement.json" || u.startsWith("/assets/"))).toBe(true);
    const v = await verifierHorsConnexion(b.e, carte());
    expect(v.moteurs).toMatchObject({ "rendu-3d": false, calcul: false, "planche-2d": true });
  });

  it("préparer : une carte d'un autre build servie par le réseau n'est jamais rangée", async () => {
    const b = env(tous.filter((f) => f !== "/chargement.json"), { buildCarte: "b2" });
    const r = await preparerHorsConnexion(b.e, carte(), ["planche-2d"]);
    expect(r.ranges).not.toContain("/chargement.json");
    expect(r.echecs).toEqual(["/chargement.json"]);
  });

  it("cache de ce build vu puis purgé : « non » pour chaque moteur, avant même la carte ; jamais supposé sans l'avoir vu", async () => {
    const purge = await verifierHorsConnexion(env(tous, { cache: false }).e, carte("b2"), { cacheConnu: true });
    expect(purge.raison).toBe("cache-purge");
    expect(Object.values(purge.moteurs).every((x) => x === false)).toBe(true);
    expect(outilsHorsConnexion(STUDIO_TOOLS, purge)?.disponibles).toEqual([]);
    expect((await verifierHorsConnexion(env(tous, { cache: false }).e, carte())).raison).toBe("sans-cache-du-build");
    expect((await verifierHorsConnexion(env(tous).e, carte(), { cacheConnu: true })).raison).toBe("evalue");
  });

  it("préparer sans service worker ou avec une carte d'un autre build : rien n'est téléchargé", async () => {
    const b = env([], { build: null });
    expect((await preparerHorsConnexion(b.e, carte(), ["planche-2d"])).raison).toBe("sans-service-worker");
    const c = env([]);
    expect((await preparerHorsConnexion(c.e, carte("autre"), ["planche-2d"])).raison).toBe("sans-carte");
    expect([...b.demandes, ...c.demandes]).toEqual([]);
  });
});
