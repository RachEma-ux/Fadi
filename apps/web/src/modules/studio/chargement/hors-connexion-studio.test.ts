// Mise à jour du service worker pendant une session Studio (B.3-09, B.3-10) : chaque activation (`fadi-sw-active`) ou
// changement de contrôleur relance la vérification du cache ; un cache du build de la page vu puis purgé donne « non »
// (jamais « non évalué » ni « disponible ») et l'avertissement est traduit.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import type { CachesLike, EnvCache } from "./cache-hors-ligne";
import type { CarteChargement } from "./carte-morceaux";
import { _reinitialiser, ecouterMisesAJour, lireHorsConnexion, verifier } from "./hors-connexion-studio";
import { TEXTES_RESSOURCES } from "./textes";

const FICHIERS = ["/index.html", "/assets/index-a.js", "/assets/shell.js", "/assets/planche.js", "/assets/vue3d.js", "/assets/three.js", "/assets/studio.worker.js", "/assets/noyau-exact.worker.js", "/assets/occt-wasm.wasm"];
const carte: CarteChargement = {
  version: 1, build: "b1", entree: "/assets/index-a.js", initial: ["/assets/index-a.js"],
  moteurs: {
    "coquille-studio": { fichiers: ["/assets/index-a.js", "/assets/shell.js"], propres: ["/assets/shell.js"], taille: 1 },
    "planche-2d": { fichiers: ["/assets/index-a.js", "/assets/shell.js", "/assets/planche.js"], propres: ["/assets/planche.js"], taille: 1 },
    "rendu-3d": { fichiers: ["/assets/index-a.js", "/assets/shell.js", "/assets/planche.js", "/assets/vue3d.js", "/assets/three.js"], propres: ["/assets/vue3d.js", "/assets/three.js"], taille: 1 },
    calcul: { fichiers: ["/assets/studio.worker.js"], propres: ["/assets/studio.worker.js"], taille: 1 },
    "noyau-exact": { fichiers: ["/assets/noyau-exact.worker.js", "/assets/occt-wasm.wasm"], propres: ["/assets/noyau-exact.worker.js", "/assets/occt-wasm.wasm"], taille: 1 },
  },
  morceaux: {}, verification: { ok: true, violations: [] },
};

function environnement(o: { swRecreeVide?: boolean } = {}): { env: EnvCache; purger: () => void; carteServie: (c: CarteChargement) => void } {
  const noms = new Set(["fadi-shell-b1"]);
  let purge = false;
  let servie = carte;
  const caches: CachesLike = {
    has: async (n) => noms.has(n),
    open: async () => ({ match: async (f: string) => (!purge && FICHIERS.includes(f) ? {} : undefined), put: async () => undefined }),
  };
  return {
    // Un service worker encore actif recrée un cache vide du même nom en servant la carte.
    env: { caches, build: "b1", fetch: async () => { if (o.swRecreeVide) noms.add("fadi-shell-b1"); return new Response(JSON.stringify(servie)); } },
    purger: () => { noms.clear(); purge = true; },
    carteServie: (c) => { servie = c; },
  };
}

const attendre = async (ok: () => boolean) => { for (let i = 0; i < 50 && !ok(); i++) await new Promise((r) => setTimeout(r, 5)); };

afterEach(() => { vi.unstubAllGlobals(); _reinitialiser(null); });

describe("vérification du cache relancée à chaque mise à jour du service worker", () => {
  it("cache du build purgé après une activation : « non » pour chaque moteur, tous les outils indisponibles", async () => {
    const { env, purger, carteServie } = environnement();
    _reinitialiser(env);
    const sw = new EventTarget() as EventTarget & { controller: unknown };
    sw.controller = {};
    vi.stubGlobal("navigator", { serviceWorker: sw });
    ecouterMisesAJour();
    expect((await verifier()).raison).toBe("evalue");
    expect(lireHorsConnexion().indisponibles).toEqual([]);
    // Activation d'un nouveau build : le cache de la page disparaît, le réseau sert déjà la carte du nouveau build.
    purger();
    carteServie({ ...carte, build: "b2" });
    sw.dispatchEvent(Object.assign(new Event("message"), { data: { type: "fadi-sw-active", build: "b2", ancienGarde: null, precedents: 1 } }));
    await attendre(() => lireHorsConnexion().verification?.raison === "cache-purge");
    const v = lireHorsConnexion().verification!;
    expect(v.raison).toBe("cache-purge");
    expect(Object.values(v.moteurs).every((x) => x === false)).toBe(true);
    expect(lireHorsConnexion().indisponibles).toEqual(STUDIO_TOOLS.map((t) => t.toolId));
    expect(lireHorsConnexion().miseAJour?.build).toBe("b2");
  });

  it("changement de contrôleur : vérification relancée elle aussi", async () => {
    const { env, purger } = environnement();
    _reinitialiser(env);
    const sw = new EventTarget() as EventTarget & { controller: unknown };
    sw.controller = {};
    vi.stubGlobal("navigator", { serviceWorker: sw });
    ecouterMisesAJour();
    await verifier();
    purger();
    sw.dispatchEvent(new Event("controllerchange"));
    await attendre(() => lireHorsConnexion().verification?.raison === "cache-purge");
    expect(lireHorsConnexion().verification?.raison).toBe("cache-purge");
  });

  it("cache recréé vide par un service worker encore actif : la purge reste annoncée", async () => {
    const { env, purger } = environnement({ swRecreeVide: true });
    _reinitialiser(env);
    expect((await verifier()).raison).toBe("evalue");
    purger();
    expect((await verifier()).raison).toBe("cache-purge");
    // Le cache existe de nouveau (vide) : toujours « non » et purge annoncée, jamais « disponible ».
    const v = await verifier();
    expect(v.raison).toBe("cache-purge");
    expect(Object.values(v.moteurs).every((x) => x === false)).toBe(true);
  });

  it("sans cache vu auparavant : toujours « non évalué » (aucune purge supposée)", async () => {
    const { env, purger } = environnement();
    purger();
    _reinitialiser(env);
    expect((await verifier()).raison).toBe("sans-cache-du-build");
    expect(lireHorsConnexion().indisponibles).toBeNull();
  });

  it("avertissement de purge et compteur de brouillons traduits", () => {
    const en = JSON.parse(readFileSync(new URL("../../../lib/i18n/en.json", import.meta.url), "utf8")) as Record<string, string>;
    for (const t of [TEXTES_RESSOURCES.cachePurge, TEXTES_RESSOURCES.fileLocale, TEXTES_RESSOURCES.fileLocaleNonEvaluee]) expect(en[t], t).toBeTruthy();
    expect(TEXTES_RESSOURCES.fileLocale).toMatch(/^Brouillons locaux non synchronisés/);
  });
});
