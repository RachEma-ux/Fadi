import { describe, expect, it } from "vitest";
import { carteDisponible, etatInitial, generationMoteur, messageMoteur, noterRefus, oublierAvis, transitionMoteur, type EtatMoteur, type EvenementMoteur } from "./etat-moteur";

const suite = (e: EtatMoteur, ...evs: EvenementMoteur[]) => evs.reduce(transitionMoteur, e);

describe("état du moteur (P2)", () => {
  it("départ : chargement animé avec WebGL, sans-webgl sinon (message de GEO 11)", () => {
    expect(etatInitial(true)).toEqual({ cas: "chargement", animation: true, generation: 0 });
    expect(etatInitial(false).cas).toBe("sans-webgl");
    expect(messageMoteur(etatInitial(false))).toMatch(/WebGL/);
    expect(carteDisponible(etatInitial(false))).toBe(false);
  });

  it("création : prêt, génération +1 ; pendant le chargement les outils restent disponibles", () => {
    const c = etatInitial(true);
    expect(carteDisponible(c)).toBe(true);
    const p = transitionMoteur(c, { type: "cree" });
    expect(p).toEqual({ cas: "pret", generation: 1 });
    expect(messageMoteur(p)).toBeNull();
  });

  it("garde de 15 s : l'animation s'arrête, le moteur peut encore arriver", () => {
    const e = suite(etatInitial(true), { type: "delai-depasse" });
    expect(e).toMatchObject({ cas: "chargement", animation: false });
    expect(transitionMoteur(e, { type: "cree" }).cas).toBe("pret");
  });

  it("échecs de démarrage : terminaux, messages distincts (import / création)", () => {
    const i = suite(etatInitial(true), { type: "echec-import" });
    const c = suite(etatInitial(true), { type: "echec-creation", detail: "boum" });
    expect(messageMoteur(i)).toMatch(/réseau/);
    expect(messageMoteur(c)).toMatch(/boum/);
    expect(transitionMoteur(i, { type: "cree" })).toBe(i);
    expect(carteDisponible(c)).toBe(false);
  });

  it("contexte perdu puis restauré : la carte revient, nouvelle génération (les effets reposent l'état)", () => {
    const perdu = suite(etatInitial(true), { type: "cree" }, { type: "contexte-perdu" });
    expect(perdu.cas).toBe("contexte-perdu");
    expect(carteDisponible(perdu)).toBe(false);
    expect(messageMoteur(perdu)).toMatch(/perdu/);
    const rendu = transitionMoteur(perdu, { type: "contexte-restaure" });
    expect(rendu).toEqual({ cas: "pret", generation: 2 });
    expect(generationMoteur(rendu)).toBe(2);
  });

  it("aucun événement de tuile n'existe : une tuile refusée ne change jamais l'état du moteur", () => {
    const p = suite(etatInitial(true), { type: "cree" });
    expect(transitionMoteur(p, { type: "contexte-restaure" })).toBe(p);
    expect(transitionMoteur(p, { type: "delai-depasse" })).toBe(p);
  });
});

describe("avis par couche (P2)", () => {
  it("note un refus 403 / 404 d'une source de couche ou de ses étiquettes ; ignore les autres sources et statuts", () => {
    let a = noterRefus(new Map(), "gd-couche-abc", 403);
    a = noterRefus(a, "gd-couche-def-etq", 404);
    expect([...a]).toEqual([["abc", 403], ["def", 404]]);
    expect(noterRefus(a, "gd-fond-raster", 403)).toBe(a);
    expect(noterRefus(a, "gd-couche-xyz", 500)).toBe(a);
    expect(noterRefus(a, "gd-couche-abc", 403)).toBe(a);
  });

  it("oublie l'avis d'une couche retirée ou masquée", () => {
    const a = new Map<string, 403 | 404>([["abc", 403], ["def", 404]]);
    expect([...oublierAvis(a, new Set(["def"])).keys()]).toEqual(["def"]);
    expect(oublierAvis(a, new Set(["abc", "def"]))).toBe(a);
  });
});
