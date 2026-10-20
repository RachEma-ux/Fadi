/**
 * Registre unique du Sandbox (lot 2) : 86 entrées du catalogue de référence (52 outils, 20 commandes, 14 panneaux),
 * chacune avec identifiant, pictogramme, famille, raccourci, emplacement et disponibilité ; outils dérivés du catalogue
 * relevé sans copie ; raccourcis uniques là où ils existent ; aucun raccourci de panneau.
 */
import { describe, expect, it } from "vitest";
import { OUTILS, normaliserRaccourci } from "./catalogue-outils.js";
import { BARRE_GAUCHE_SANDBOX, REGISTRE_SANDBOX, RACCOURCIS_FADI_OUTILS, entreeCommande, entreeOutil, entreePanneau, entreeSandbox, entreesSandbox } from "./registre-sandbox.js";

const catalogue = REGISTRE_SANDBOX.filter((e) => !e.horsCatalogue);

describe("registre du Sandbox — contenu", () => {
  it("86 entrées du catalogue : 52 outils, 20 commandes, 14 panneaux", () => {
    expect(catalogue).toHaveLength(86);
    expect(catalogue.filter((e) => e.nature === "outil")).toHaveLength(52);
    expect(catalogue.filter((e) => e.nature === "commande")).toHaveLength(20);
    expect(catalogue.filter((e) => e.nature === "panneau")).toHaveLength(14);
  });

  it("une seule entrée hors catalogue : la commande Diviser, doublon de l'outil (à harmoniser au lot 6)", () => {
    expect(REGISTRE_SANDBOX.filter((e) => e.horsCatalogue).map((e) => `${e.nature}:${e.id}`)).toEqual(["commande:diviser"]);
    expect(entreeOutil("diviser").horsCatalogue).toBeUndefined();
  });

  it("identifiant unique par nature ; chaque entrée a un pictogramme, une famille, un emplacement et une disponibilité", () => {
    const cles = REGISTRE_SANDBOX.map((e) => `${e.nature}:${e.id}`);
    expect(new Set(cles).size).toBe(cles.length);
    for (const e of REGISTRE_SANDBOX) {
      expect(e.picto, e.id).not.toBe("");
      expect(e.famille, e.id).toBeTruthy();
      expect(e.emplacement, e.id).toBeTruthy();
      expect(e.disponibilite, e.id).toBe("livree");
    }
  });

  it("outils : dérivés du catalogue relevé (ordre, famille, emplacement), raccourci relevé sinon couche Fadi", () => {
    expect(entreesSandbox("outil").map((e) => e.id)).toEqual(OUTILS.map((o) => o.id));
    for (const o of OUTILS) {
      const e = entreeOutil(o.id);
      expect(e.famille, o.id).toBe(o.famille);
      expect(e.emplacement, o.id).toBe(o.emplacement);
      expect(e.raccourci, o.id).toBe(o.raccourci ?? RACCOURCIS_FADI_OUTILS[o.id]);
    }
    // La couche Fadi ne couvre que des outils sans raccourci relevé, et tous ceux-là.
    for (const id of Object.keys(RACCOURCIS_FADI_OUTILS)) expect(OUTILS.find((o) => o.id === id)?.raccourci, id).toBeNull();
    for (const o of OUTILS.filter((x) => x.raccourci === null)) expect(RACCOURCIS_FADI_OUTILS[o.id], o.id).toBeDefined();
  });

  it("raccourcis : les 52 outils et les 20 commandes en ont un, unique ; les 14 panneaux n'en ont pas", () => {
    const avec = REGISTRE_SANDBOX.filter((e) => e.nature !== "panneau");
    for (const e of avec) expect(e.raccourci, `${e.nature}:${e.id}`).not.toBeNull();
    const vus = new Map<string, string>();
    for (const e of avec) {
      const r = normaliserRaccourci(e.raccourci!);
      expect(vus.get(r), `${e.nature}:${e.id} et ${vus.get(r)} : ${e.raccourci}`).toBeUndefined();
      vus.set(r, `${e.nature}:${e.id}`);
    }
    for (const e of entreesSandbox("panneau")) expect(e.raccourci, e.id).toBeNull();
  });

  it("panneaux : quatre dans la colonne de droite, dix dans « Objets et vue », dans l'ordre affiché", () => {
    expect(entreesSandbox("panneau").filter((e) => e.emplacement === "colonne").map((e) => e.id)).toEqual(["instructeur", "materiaux", "balises", "objets"]);
    expect(entreesSandbox("panneau").filter((e) => e.emplacement === "objets-et-vue").map((e) => e.id)).toEqual([
      "info-entite", "composants", "styles", "ombres", "scenes", "affichage", "adoucir", "info-modele", "navigateur", "debit",
    ]);
  });

  it("barre gauche par défaut : douze outils du registre placés dans la barre", () => {
    expect(BARRE_GAUCHE_SANDBOX).toHaveLength(12);
    for (const id of BARRE_GAUCHE_SANDBOX) expect(entreeOutil(id).emplacement, id).toBe("barre");
    expect(new Set(BARRE_GAUCHE_SANDBOX)).toEqual(new Set(entreesSandbox("outil").filter((e) => e.emplacement === "barre").map((e) => e.id)));
  });

  it("recherche par nature : une entrée absente vaut undefined, et l'accès exigé lève une erreur", () => {
    expect(entreeSandbox("panneau", "inexistant")).toBeUndefined();
    expect(() => entreeCommande("inexistante")).toThrow(/absent/);
    expect(entreePanneau("debit").picto).toBe(entreeCommande("liste-debit").picto);
  });

  it("le registre est figé", () => {
    expect(Object.isFrozen(REGISTRE_SANDBOX)).toBe(true);
    expect(Object.isFrozen(BARRE_GAUCHE_SANDBOX)).toBe(true);
  });
});
