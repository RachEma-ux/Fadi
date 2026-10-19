import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classesPrecache, construireCarte, famillesDe, fermetureStatique, PLANCHE_PARTAGES_COQUILLE, verifierDecoupage, type SortieBuild } from "./carte-morceaux";

const W = "/w/apps/web/src/modules/studio";
const NM = "/w/node_modules";

/** Build synthétique conforme : entrée légère, coquille Studio, planche, vue 3D (three.js), Worker, Atelier (OCCT). */
function sortiesConformes(): SortieBuild[] {
  return [
    { type: "chunk", fileName: "assets/index-a.js", taille: 100, isEntry: true, facadeModuleId: "/w/apps/web/index.html", moduleIds: ["/w/apps/web/src/main.tsx"], imports: [], dynamicImports: ["assets/StudioShell-b.js", "assets/Atelier-z.js"], css: ["assets/index-a.css"] },
    { type: "asset", fileName: "assets/index-a.css", taille: 10 },
    { type: "chunk", fileName: "assets/StudioShell-b.js", taille: 50, facadeModuleId: null, moduleIds: [`${W}/StudioShell.tsx`, `${W}/chargement/DemarrageStudio.tsx`], imports: ["assets/index-a.js"], dynamicImports: ["assets/VariantWorkspace-c.js"], css: [] },
    { type: "chunk", fileName: "assets/VariantWorkspace-c.js", taille: 300, facadeModuleId: `${W}/VariantWorkspace.tsx`, moduleIds: [`${W}/VariantWorkspace.tsx`, `${W}/planche2d/Dessin2D.tsx`], imports: ["assets/StudioShell-b.js", "assets/partage-d.js"], dynamicImports: ["assets/Vue3DStudio-e.js"], css: ["assets/VariantWorkspace-c.css"] },
    { type: "asset", fileName: "assets/VariantWorkspace-c.css", taille: 5 },
    { type: "chunk", fileName: "assets/partage-d.js", taille: 20, moduleIds: [`${W}/planche2d/raccourcis.ts`], imports: [], dynamicImports: [], css: [] },
    { type: "chunk", fileName: "assets/Vue3DStudio-e.js", taille: 40, facadeModuleId: `${W}/vue3d/Vue3DStudio.tsx`, moduleIds: [`${W}/vue3d/Vue3DStudio.tsx`], imports: ["assets/three-f.js", "assets/VariantWorkspace-c.js"], dynamicImports: [], css: [] },
    { type: "chunk", fileName: "assets/three-f.js", taille: 700, moduleIds: [`${NM}/three/build/three.module.js`], imports: [], dynamicImports: [], css: [] },
    { type: "asset", fileName: "assets/studio.worker-g.js", taille: 500, nomsOriginaux: [] },
    { type: "chunk", fileName: "assets/Atelier-z.js", taille: 900, facadeModuleId: "/w/apps/web/src/modules/atelier/nouveau/AtelierNouveau.tsx", moduleIds: ["/w/apps/web/src/modules/atelier/nouveau/AtelierNouveau.tsx", `${NM}/occt-wasm/dist/occt-wasm.js`], imports: ["assets/index-a.js"], dynamicImports: [], css: [] },
  ];
}

describe("Carte des morceaux et contrôle du découpage (B.3-06)", () => {
  it("familles lourdes reconnues par leur module", () => {
    expect(famillesDe([`${NM}/three/build/three.module.js`, `${NM}/occt-wasm/x.js`, `${NM}/manifold-3d/m.js`])).toEqual(["three", "occt", "manifold"]);
    expect(famillesDe(["C:\\w\\apps\\web\\src\\modules\\studio\\vue3d\\Vue3DStudio.tsx"])).toEqual(["studio-3d"]);
    expect(famillesDe([`${W}/planche2d/raccourcis.ts`])).toEqual([]);
  });

  it("famille planche : tout planche2d/, sauf les modules légers partagés avec la coquille (liste explicite)", () => {
    expect(PLANCHE_PARTAGES_COQUILLE).toEqual(["CatalogueOutils.tsx", "catalogue.ts", "raccourcis.ts", "profils.ts"]);
    for (const m of PLANCHE_PARTAGES_COQUILLE) {
      expect(famillesDe([`${W}/planche2d/${m}`]), m).toEqual([]);
      expect(existsSync(new URL(`../planche2d/${m}`, import.meta.url)), m).toBe(true);
    }
    for (const m of ["Dessin2D.tsx", "BarreOutils.tsx", "brouillon.ts", "outils/ligne.ts", "rendus/canevas.ts", "accrochage/index.ts", "planche2d.css", "catalogue.test.ts", "profils-extra.ts"]) {
      expect(famillesDe([`${W}/planche2d/${m}`]), m).toEqual(["studio-planche"]);
    }
    expect(famillesDe([`${W}/VariantWorkspace.tsx`])).toEqual(["studio-planche"]);
    expect(famillesDe([`${W}/planche2d/catalogue.ts?used`])).toEqual([]);
  });

  it("build conforme : fichiers de chaque moteur, propres et partagés, verdict sans violation", () => {
    const c = construireCarte(sortiesConformes(), "b1");
    expect(c.verification).toEqual({ ok: true, violations: [] });
    expect(c.initial).toEqual(["/assets/index-a.css", "/assets/index-a.js"]);
    expect(c.moteurs["coquille-studio"].fichiers).toEqual(["/assets/StudioShell-b.js", "/assets/index-a.css", "/assets/index-a.js"]);
    expect(c.moteurs["planche-2d"].propres).toEqual(["/assets/VariantWorkspace-c.css", "/assets/VariantWorkspace-c.js", "/assets/partage-d.js"]);
    expect(c.moteurs["rendu-3d"].propres).toEqual(["/assets/Vue3DStudio-e.js", "/assets/three-f.js"]);
    expect(c.moteurs["rendu-3d"].taille).toBe(740);
    expect(c.moteurs.calcul.fichiers).toEqual(["/assets/studio.worker-g.js"]);
    // L'import dynamique n'entre jamais dans la fermeture statique.
    expect(fermetureStatique(c.morceaux, ["/assets/StudioShell-b.js"])).not.toContain("/assets/VariantWorkspace-c.js");
  });

  it("three.js importé statiquement par l'entrée : violation nommée", () => {
    const s = sortiesConformes().map((o) => (o.fileName === "assets/index-a.js" ? { ...o, imports: ["assets/three-f.js"] } : o));
    const c = construireCarte(s, "b1");
    expect(c.verification.ok).toBe(false);
    expect(c.verification.violations.join("\n")).toMatch(/initial : \/assets\/three-f\.js contient « three »/);
  });

  it("planche importée statiquement par la coquille : violation ; noyau exact dans la 3D : violation", () => {
    const s = sortiesConformes().map((o) => {
      if (o.fileName === "assets/StudioShell-b.js") return { ...o, imports: [...(o.imports ?? []), "assets/VariantWorkspace-c.js"] };
      if (o.fileName === "assets/Vue3DStudio-e.js") return { ...o, moduleIds: [...(o.moduleIds ?? []), `${NM}/manifold-3d/manifold.js`] };
      return o;
    });
    const v = construireCarte(s, "b1").verification.violations.join("\n");
    expect(v).toMatch(/coquille-studio : .*« studio-planche »/);
    expect(v).toMatch(/rendu-3d : .*« manifold »/);
  });

  it("moteur introuvable dans le build : violation", () => {
    const s = sortiesConformes().filter((o) => !o.fileName.startsWith("assets/studio.worker"));
    expect(verifierDecoupage(construireCarte(s, "b1"))).toEqual(["calcul : morceau introuvable dans le build"]);
    const sansPlanche = sortiesConformes().filter((o) => !o.fileName.startsWith("assets/VariantWorkspace"));
    expect(construireCarte(sansPlanche, "b1").verification.violations).toContain("planche-2d : morceau introuvable dans le build");
  });

  it("classes du précache : disjointes, complètes, coquille puis profil puis facultatif (B.3-07)", () => {
    const c = construireCarte(sortiesConformes(), "b1");
    const liste = ["/index.html", "/chargement.json", "/assets/index-a.js", "/assets/index-a.css", "/assets/StudioShell-b.js", "/assets/VariantWorkspace-c.js",
      "/assets/VariantWorkspace-c.css", "/assets/partage-d.js", "/assets/Vue3DStudio-e.js", "/assets/three-f.js", "/assets/studio.worker-g.js", "/assets/Atelier-z.js", "/parcelle/index.html"];
    const k = classesPrecache(c, liste);
    expect(k.coquille).toEqual(["/index.html", "/assets/index-a.js", "/assets/index-a.css"]);
    expect(k.profil).toEqual(["/chargement.json", "/assets/StudioShell-b.js", "/assets/VariantWorkspace-c.js", "/assets/VariantWorkspace-c.css", "/assets/partage-d.js"]);
    expect(k.facultatif).toEqual(["/assets/Vue3DStudio-e.js", "/assets/three-f.js", "/assets/studio.worker-g.js", "/assets/Atelier-z.js", "/parcelle/index.html"]);
    expect([...k.coquille, ...k.profil, ...k.facultatif].sort()).toEqual([...liste].sort());
  });
});
