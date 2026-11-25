/** Préférences d'outils du Sandbox (lot 5) côté serveur : lecture d'une ligne, validation d'un corps PUT (pur, sans base). */
import { describe, expect, it } from "vitest";
import { CATALOGUE_LIVRE } from "@parcours/sandbox-planche-model";
import { lireCorpsPreferencesSandbox, reponsePreferences } from "./sandbox-preferences.js";

describe("préférences d'outils du Sandbox — serveur", () => {
  it("sans ligne : profil Standard, rien de choisi, updatedAt null", () => {
    expect(reponsePreferences("u1", undefined)).toEqual({ profil: "standard", barrePersonnelle: [], favoris: [], regroupements: [], extensions: {}, scripts: [], format: "sandbox-preferences/1", compte: "u1", updatedAt: null, catalogue: CATALOGUE_LIVRE });
  });

  it("une ligne est relue telle qu'enregistrée ; une ligne ancienne invalide vaut les défauts", () => {
    const at = new Date("2026-10-20T20:00:00Z");
    const r = reponsePreferences("u1", { profile: "personnel", leftBar: ["ligne", "selection"], favorites: ["commande:groupe"], groups: [{ id: "bois", nom: "Bois", entrees: ["outil:onglet"] }], extensions: {}, scripts: [], updatedAt: at });
    expect(r).toMatchObject({ profil: "personnel", barrePersonnelle: ["ligne", "selection"], favoris: ["commande:groupe"], compte: "u1", updatedAt: at.toISOString() });
    expect(reponsePreferences("u1", { profile: "personnel", leftBar: ["fantome"], favorites: [], groups: [], extensions: {}, scripts: [], updatedAt: at })).toMatchObject({ profil: "standard", barrePersonnelle: [] });
  });

  it("corps PUT : valeurs de ligne ; forme invalide → invalid_input ; entrée inconnue → unknown_entry nommée", () => {
    expect(lireCorpsPreferencesSandbox({ profil: "metier:bois", barrePersonnelle: [], favoris: ["outil:ligne"], regroupements: [] })).toEqual({
      ok: true,
      valeurs: { profile: "metier:bois", leftBar: [], favorites: ["outil:ligne"], groups: [], extensions: {}, scripts: [] },
      scriptsFournis: false,
    });
    expect(lireCorpsPreferencesSandbox({ profil: "x" })).toMatchObject({ ok: false, body: { error: "invalid_input" } });
    expect(lireCorpsPreferencesSandbox({ profil: "standard", barrePersonnelle: ["fantome"], favoris: [], regroupements: [] })).toEqual({
      ok: false,
      body: { error: "unknown_entry", detail: "entrée absente du registre du Sandbox", inconnues: ["outil:fantome"] },
    });
  });

  it("extensions (25 novembre 2026) : relues et enregistrées ; extension inconnue → unknown_extension nommée", () => {
    const at = new Date("2026-11-25T01:00:00Z");
    expect(reponsePreferences("u1", { profile: "standard", leftBar: [], favorites: [], groups: [], extensions: { bois: false }, scripts: [], updatedAt: at })).toMatchObject({ extensions: { bois: false } });
    expect(lireCorpsPreferencesSandbox({ profil: "standard", barrePersonnelle: [], favoris: [], regroupements: [], extensions: { volumes: false } })).toEqual({
      ok: true,
      valeurs: { profile: "standard", leftBar: [], favorites: [], groups: [], extensions: { volumes: false }, scripts: [] },
      scriptsFournis: false,
    });
    expect(lireCorpsPreferencesSandbox({ profil: "standard", barrePersonnelle: [], favoris: [], regroupements: [], extensions: { fantome: true } })).toEqual({
      ok: false,
      body: { error: "unknown_extension", detail: "extension absente de la liste du Sandbox", inconnues: ["extension:fantome"] },
    });
  });

  it("« Mes scripts » (extension Scripts) : relus et enregistrés ; un corps sans le champ garde les scripts du compte", () => {
    const at = new Date("2026-11-25T03:00:00.000Z");
    const scripts = [{ id: "poteaux", nom: "Poteaux", code: "planche.afficher(1);" }];
    const base = { profil: "standard", barrePersonnelle: [], favoris: [], regroupements: [] };
    expect(reponsePreferences("u1", { profile: "standard", leftBar: [], favorites: [], groups: [], extensions: {}, scripts, updatedAt: at })).toMatchObject({ scripts });
    expect(lireCorpsPreferencesSandbox({ ...base, scripts })).toMatchObject({ ok: true, valeurs: { scripts }, scriptsFournis: true });
    expect(lireCorpsPreferencesSandbox({ ...base, scripts: [] })).toMatchObject({ ok: true, valeurs: { scripts: [] }, scriptsFournis: true });
    expect(lireCorpsPreferencesSandbox(base)).toMatchObject({ ok: true, scriptsFournis: false });
    expect(lireCorpsPreferencesSandbox({ ...base, scripts: [{ id: "Mauvais", nom: "x", code: "" }] })).toMatchObject({ ok: false, body: { error: "invalid_input" } });
    expect(lireCorpsPreferencesSandbox({ ...base, scripts: [{ id: "a", nom: "A", code: "x".repeat(8001) }] })).toMatchObject({ ok: false, body: { error: "invalid_input" } });
  });

  it("catalogue (25 novembre 2026) : la réponse porte l'état et le réglage d'origine réglés par la plateforme ; le choix du compte n'est pas réécrit", () => {
    const at = new Date("2026-11-25T19:00:00Z");
    const r = reponsePreferences("u1", { profile: "standard", leftBar: [], favorites: [], groups: [], extensions: { volumes: true }, scripts: [], updatedAt: at }, { volumes: { etat: "retiree", activeParDefaut: true }, controle: { etat: "experimentale", activeParDefaut: true } });
    expect(r.extensions).toEqual({ volumes: true });
    expect(r.catalogue.find((f) => f.id === "volumes")).toMatchObject({ etat: "retiree" });
    expect(r.catalogue.find((f) => f.id === "controle")).toMatchObject({ etat: "experimentale", activeParDefaut: true });
    expect(r.catalogue.find((f) => f.id === "bois")).toMatchObject({ etat: "disponible", activeParDefaut: true });
  });
});
