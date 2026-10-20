/** Préférences d'outils du Sandbox (lot 5) côté serveur : lecture d'une ligne, validation d'un corps PUT (pur, sans base). */
import { describe, expect, it } from "vitest";
import { lireCorpsPreferencesSandbox, reponsePreferences } from "./sandbox-preferences.js";

describe("préférences d'outils du Sandbox — serveur", () => {
  it("sans ligne : profil Standard, rien de choisi, updatedAt null", () => {
    expect(reponsePreferences("u1", undefined)).toEqual({ profil: "standard", barrePersonnelle: [], favoris: [], regroupements: [], format: "sandbox-preferences/1", compte: "u1", updatedAt: null });
  });

  it("une ligne est relue telle qu'enregistrée ; une ligne ancienne invalide vaut les défauts", () => {
    const at = new Date("2026-10-20T20:00:00Z");
    const r = reponsePreferences("u1", { profile: "personnel", leftBar: ["ligne", "selection"], favorites: ["commande:groupe"], groups: [{ id: "bois", nom: "Bois", entrees: ["outil:onglet"] }], updatedAt: at });
    expect(r).toMatchObject({ profil: "personnel", barrePersonnelle: ["ligne", "selection"], favoris: ["commande:groupe"], compte: "u1", updatedAt: at.toISOString() });
    expect(reponsePreferences("u1", { profile: "personnel", leftBar: ["fantome"], favorites: [], groups: [], updatedAt: at })).toMatchObject({ profil: "standard", barrePersonnelle: [] });
  });

  it("corps PUT : valeurs de ligne ; forme invalide → invalid_input ; entrée inconnue → unknown_entry nommée", () => {
    expect(lireCorpsPreferencesSandbox({ profil: "metier:bois", barrePersonnelle: [], favoris: ["outil:ligne"], regroupements: [] })).toEqual({
      ok: true,
      valeurs: { profile: "metier:bois", leftBar: [], favorites: ["outil:ligne"], groups: [] },
    });
    expect(lireCorpsPreferencesSandbox({ profil: "x" })).toMatchObject({ ok: false, body: { error: "invalid_input" } });
    expect(lireCorpsPreferencesSandbox({ profil: "standard", barrePersonnelle: ["fantome"], favoris: [], regroupements: [] })).toEqual({
      ok: false,
      body: { error: "unknown_entry", detail: "entrée absente du registre du Sandbox", inconnues: ["outil:fantome"] },
    });
  });
});
