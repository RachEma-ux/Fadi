/**
 * BD-9.6 : lecteur des catalogues (pur, base simulée) — version publiée lue en base, cache par version, état
 * « catalogue non chargé » sans repli.
 */
import { describe, expect, it } from "vitest";
import { CatalogueNonCharge, LecteurCatalogues, type Requeteur } from "./catalogues.js";

interface Version { id: number; empreinte: string; texte: string }

function baseSimulee() {
  const publiees = new Map<string, Version>();
  const requetes: string[] = [];
  const q: Requeteur = {
    async query(text, values) {
      requetes.push(text);
      if (text.includes("FROM catalogues c")) {
        const v = publiees.get(String(values?.[0]));
        return { rows: v ? [{ id: String(v.id), empreinte: v.empreinte }] : [] };
      }
      const v = [...publiees.values()].find((x) => x.id === Number(values?.[0]));
      return { rows: v ? [{ texte: v.texte }] : [] };
    },
  };
  return { publiees, requetes, q };
}

describe("BD-9.6 — lecture des catalogues en base", () => {
  it("catalogue absent : CatalogueNonCharge (503 catalogue_non_charge), jamais de contenu de repli", async () => {
    const b = baseSimulee();
    const l = new LecteurCatalogues(() => b.q, { revalidationMs: 0 });
    const err = await l.lire("programme-repartition").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CatalogueNonCharge);
    expect(err).toMatchObject({ code: "catalogue_non_charge", status: 503, cle: "programme-repartition" });
    expect((err as Error).message).toContain("non chargé en base");
  });

  it("sert le fichier archivé tel quel (ordre des clés conservé) et le garde en cache tant que la version publiée ne change pas", async () => {
    const b = baseSimulee();
    b.publiees.set("programme-repartition", { id: 7, empreinte: "a".repeat(64), texte: '{"zeta":1,"alpha":{"b":2,"a":1}}' });
    let t = 0;
    const l = new LecteurCatalogues(() => b.q, { revalidationMs: 1000, maintenant: () => t });
    const c1 = (await l.lire("programme-repartition")) as unknown as Record<string, unknown>;
    expect(Object.keys(c1)).toEqual(["zeta", "alpha"]);
    expect(b.requetes).toHaveLength(2);
    // Dans le délai : aucune requête.
    t = 500;
    expect(await l.lire("programme-repartition")).toBe(c1);
    expect(b.requetes).toHaveLength(2);
    // Après le délai : la version publiée est relue, le contenu reste en cache.
    t = 1500;
    expect(await l.lire("programme-repartition")).toBe(c1);
    expect(b.requetes).toHaveLength(3);
    // Nouvelle version publiée : rechargée.
    b.publiees.set("programme-repartition", { id: 8, empreinte: "b".repeat(64), texte: '{"v":2}' });
    t = 3000;
    expect(await l.lire("programme-repartition")).toEqual({ v: 2 });
    expect(l.versionEnCache("programme-repartition")).toBe(8);
    // Publication retirée : l'état « non chargé » revient, le cache est vidé.
    b.publiees.delete("programme-repartition");
    t = 5000;
    await expect(l.lire("programme-repartition")).rejects.toBeInstanceOf(CatalogueNonCharge);
    expect(l.versionEnCache("programme-repartition")).toBeNull();
  });
});
