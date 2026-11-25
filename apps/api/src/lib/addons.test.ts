/** Catalogue des extensions côté serveur : fiches d'administration (pur, sans base). */
import { describe, expect, it } from "vitest";
import { EXTENSIONS_SANDBOX } from "@parcours/sandbox-planche-model";
import { fichesAdminAddons, reglageDeLigne } from "./addons.js";

describe("catalogue des extensions — fiches d'administration", () => {
  it("sans ligne : toutes disponibles, réglage livré, rien de réglé", () => {
    const fiches = fichesAdminAddons([]);
    expect(fiches.map((f) => f.id)).toEqual(EXTENSIONS_SANDBOX.map((x) => x.id));
    for (const f of fiches) {
      expect(f).toMatchObject({ etat: "disponible", reglee: false, updatedAt: null, updatedBy: null, activeParDefaut: f.activeParDefautLivre });
      expect(f.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(f.contenu.outil + f.contenu.commande + f.contenu.panneau).toBeGreaterThan(0);
    }
  });

  it("une ligne remplace le réglage livré ; une ligne d'extension inconnue n'ajoute rien", () => {
    const at = new Date("2026-11-25T19:00:00Z");
    const fiches = fichesAdminAddons([
      { addonId: "bois", state: "retiree", defaultActive: false, updatedBy: "u1", updatedAt: at },
      { addonId: "fantome", state: "retiree", defaultActive: false, updatedBy: null, updatedAt: at },
    ]);
    expect(fiches).toHaveLength(EXTENSIONS_SANDBOX.length);
    expect(fiches.find((f) => f.id === "bois")).toMatchObject({ etat: "retiree", activeParDefaut: false, activeParDefautLivre: true, reglee: true, updatedAt: at.toISOString(), updatedBy: "u1" });
    expect(reglageDeLigne({ state: "experimentale", defaultActive: true })).toEqual({ etat: "experimentale", activeParDefaut: true });
  });
});
