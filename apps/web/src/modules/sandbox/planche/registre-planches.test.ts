import { describe, expect, it } from "vitest";
import { PLANCHES_MAX, ID_BROUILLON, altitudeSaisie, avecCourante, avecInfo, avecNouvelle, indexInitial, lireIndex, nomValide, nouvelId, planche, sansPlanche, serialiserIndex, type InfoPlanche } from "./registre-planches";

const D = new Date("2026-10-21T10:00:00Z");
const info = (id: string, nom = id): InfoPlanche => ({ id, nom, altitudeRef: null, creeA: D.toISOString(), modifieA: D.toISOString() });

describe("Planches nommées de Sandbox — index", () => {
  it("sans index enregistré : une seule Planche, le brouillon d'origine, qui garde son ancienne clé", () => {
    const i = indexInitial(D);
    expect(i.courante).toBe(ID_BROUILLON);
    expect(i.planches).toHaveLength(1);
    expect(planche(i).nom).toBe("");
  });
  it("aller-retour d'un index ; un texte absent, d'un autre format ou mal formé est ignoré", () => {
    const i = avecNouvelle(indexInitial(D), { ...info("p1", "Escalier"), altitudeRef: 3.2 });
    expect(lireIndex(serialiserIndex(i))).toEqual(i);
    expect(lireIndex(null)).toBeNull();
    expect(lireIndex("pas du json")).toBeNull();
    expect(lireIndex(JSON.stringify({ format: "autre", courante: "x", planches: [] }))).toBeNull();
    expect(lireIndex(JSON.stringify({ format: "sandbox-planches-index/1", courante: "x", planches: [] }))).toBeNull();
    expect(lireIndex(JSON.stringify({ format: "sandbox-planches-index/1", courante: "a", planches: [{ id: "a", nom: "A", altitudeRef: "3", creeA: "x", modifieA: "x" }] }))).toBeNull();
    expect(lireIndex(JSON.stringify({ format: "sandbox-planches-index/1", courante: "a", planches: [info("a"), info("a")] }))).toBeNull();
  });
  it("une courante inconnue retombe sur la première Planche", () => {
    const brut = JSON.stringify({ format: "sandbox-planches-index/1", courante: "fantome", planches: [info("a"), info("b")] });
    expect(lireIndex(brut)?.courante).toBe("a");
  });
  it("nouvelle Planche = courante ; renommer et niveau ; ouvrir une autre ; plafond", () => {
    let i = avecNouvelle(indexInitial(D), info("p1", "Un"));
    expect(i.courante).toBe("p1");
    i = avecInfo(i, "p1", { nom: "Deux", altitudeRef: -1.5 });
    expect(planche(i, "p1")).toMatchObject({ nom: "Deux", altitudeRef: -1.5 });
    expect(avecCourante(i, ID_BROUILLON).courante).toBe(ID_BROUILLON);
    expect(avecCourante(i, "inconnue").courante).toBe("p1");
    let plein = indexInitial(D);
    for (let k = plein.planches.length; k < PLANCHES_MAX; k++) plein = avecNouvelle(plein, info(`x${k}`));
    expect(() => avecNouvelle(plein, info("de-trop"))).toThrow(RangeError);
  });
  it("supprimer : la suivante devient courante, jamais d'index vide", () => {
    let i = indexInitial(D);
    i = avecNouvelle(avecNouvelle(i, info("a")), info("b"));
    expect(i.courante).toBe("b");
    const sans = sansPlanche(i, "b");
    expect(sans.planches.map((p) => p.id)).toEqual([ID_BROUILLON, "a"]);
    expect(sans.courante).toBe("a");
    expect(sansPlanche(i, "a").courante).toBe("b");
    const seule = sansPlanche(indexInitial(D), ID_BROUILLON, D);
    expect(seule.planches).toHaveLength(1);
    expect(seule.courante).toBe(ID_BROUILLON);
    expect(sansPlanche(i, "inconnue")).toBe(i);
  });
  it("identifiants : jamais en collision avec l'index (l'aléa est retiré tant que l'identifiant existe)", () => {
    const i = avecNouvelle(indexInitial(D), info("pa0000"));
    const suite = [0, 0, 0.5];
    let k = 0;
    const id = nouvelId(i, () => suite[k++]!, 10);
    expect(id).not.toBe("pa0000");
    expect(id).toMatch(/^p[0-9a-z]+$/);
    expect(k).toBe(3);
  });
  it("nom propre et altitude saisie (virgule ou point ; vide = aucun niveau ; texte refusé)", () => {
    expect(nomValide("  Mon   escalier ")).toBe("Mon escalier");
    expect(nomValide("   ")).toBeNull();
    expect(nomValide("x".repeat(200))?.length).toBe(80);
    expect(altitudeSaisie("")).toBeNull();
    expect(altitudeSaisie(" 3,20 ")).toBe(3.2);
    expect(altitudeSaisie("-0.5")).toBe(-0.5);
    expect(altitudeSaisie("trois")).toBeUndefined();
  });
});
