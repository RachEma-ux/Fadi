/**
 * OPS-05 / MIG-COEX-04 — files locales protégées lors d'un changement de build ou de service worker : un nouveau build
 * qui relève la version du schéma IndexedDB (`lib/local-store.ts`) ne doit jamais retirer ni vider la file des lots de
 * l'Atelier (`lots`) ni les brouillons Studio (`studioBrouillons`). Les seuls vidages admis sont ceux déjà livrés et
 * documentés (v4 : cache de modèle de l'ancien moteur ; v6 : lignes Studio v5 sans propriétaire, inattribuables) ; tout
 * nouveau vidage ou retrait de magasin fait échouer ce test, qui se lit dans le source (aucune base ouverte).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(new URL("./local-store.ts", import.meta.url), "utf8");
const SW = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

interface VersionLue { version: number; stores: Record<string, string | null>; vides: string[] }

function versions(): VersionLue[] {
  const blocs = [...SOURCE.matchAll(/this\.version\((\d+)\)([\s\S]*?)(?=this\.version\(|\n {2}\}\n)/g)];
  return blocs.map(([, n, corps]) => {
    const stores = /\.stores\(\{([^}]*)\}\)/.exec(corps!)?.[1] ?? "";
    const entrees = Object.fromEntries([...stores.matchAll(/(\w+):\s*(null|"[^"]*")/g)].map(([, k, v]) => [k!, v === "null" ? null : v!.slice(1, -1)]));
    const vides = [...corps!.matchAll(/table\("(\w+)"\)\.(?:clear|delete|bulkDelete)\(/g)].map(([, t]) => t!).sort();
    return { version: Number(n), stores: entrees, vides };
  });
}

describe("files locales et changement de build (OPS-05)", () => {
  it("versions du schéma local lues dans l'ordre, sans trou", () => {
    const v = versions();
    expect(v.length).toBeGreaterThanOrEqual(6);
    expect(v.map((x) => x.version)).toEqual(v.map((_, i) => i + 1));
  });

  it("la file Atelier (lots) existe dès la v3 et n'est jamais retirée ni vidée par une montée de version", () => {
    for (const v of versions().filter((x) => x.version >= 3)) {
      expect(v.stores["lots"], `v${v.version}`).toMatch(/^id\b/);
      expect(v.vides, `v${v.version}`).not.toContain("lots");
    }
  });

  it("les brouillons Studio existent dès la v5 ; seul le vidage v6 (lignes sans propriétaire) est admis", () => {
    for (const v of versions().filter((x) => x.version >= 5)) {
      expect(typeof v.stores["studioBrouillons"], `v${v.version}`).toBe("string");
      if (v.version !== 6) expect(v.vides, `v${v.version}`).not.toContain("studioBrouillons");
    }
    expect(Object.fromEntries(versions().filter((v) => v.vides.length).map((v) => [v.version, v.vides]))).toEqual({ 4: ["modelCache"], 6: ["studioBrouillons", "studioContextes"] });
  });

  it("ni l'application ni le service worker ne suppriment la base locale", () => {
    expect(SOURCE).not.toMatch(/deleteDatabase|\.delete\(\)\s*;?\s*$/m);
    expect(SW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")).not.toMatch(/indexedDB|deleteDatabase|Dexie/);
  });
});
