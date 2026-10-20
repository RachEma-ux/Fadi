/** Personnalisation du Sandbox (lot 5) : profils, barre gauche effective, validation stricte contre le registre. */
import { describe, expect, it } from "vitest";
import { BARRE_GAUCHE_SANDBOX, entreeOutil } from "./registre-sandbox.js";
import { CLES_PERSONNALISABLES, PREFERENCES_SANDBOX_DEFAUT, PROFILS_METIER, barreGaucheSandbox, idRegroupement, lirePreferencesSandbox, validerPreferencesSandbox } from "./personnalisation-sandbox.js";

const prefs = (p: Record<string, unknown> = {}) => ({ profil: "standard", barrePersonnelle: [], favoris: [], regroupements: [], ...p });

describe("personnalisation du Sandbox", () => {
  it("par défaut : profil Standard, barre gauche de la disposition par défaut (lot 4)", () => {
    expect(PREFERENCES_SANDBOX_DEFAUT.profil).toBe("standard");
    expect(barreGaucheSandbox(PREFERENCES_SANDBOX_DEFAUT)).toEqual(BARRE_GAUCHE_SANDBOX);
  });

  it("profils métier : outils existants du registre, sans doublon ; un profil inconnu se lit comme Standard", () => {
    expect(PROFILS_METIER.length).toBeGreaterThanOrEqual(2);
    for (const m of PROFILS_METIER) {
      expect(new Set(m.barre).size, m.id).toBe(m.barre.length);
      for (const id of m.barre) expect(() => entreeOutil(id), `${m.id} : ${id}`).not.toThrow();
      expect(barreGaucheSandbox({ ...PREFERENCES_SANDBOX_DEFAUT, profil: m.id })).toEqual(m.barre);
    }
    expect(barreGaucheSandbox({ ...PREFERENCES_SANDBOX_DEFAUT, profil: "metier:inconnu" })).toEqual(BARRE_GAUCHE_SANDBOX);
  });

  it("profil Personnel : la barre choisie, dans l'ordre choisi ; vide → barre par défaut", () => {
    expect(barreGaucheSandbox({ ...PREFERENCES_SANDBOX_DEFAUT, profil: "personnel", barrePersonnelle: ["ligne", "selection"] })).toEqual(["ligne", "selection"]);
    expect(barreGaucheSandbox({ ...PREFERENCES_SANDBOX_DEFAUT, profil: "personnel" })).toEqual(BARRE_GAUCHE_SANDBOX);
  });

  it("validation : forme stricte et bornes", () => {
    expect(validerPreferencesSandbox(prefs()).ok).toBe(true);
    expect(validerPreferencesSandbox(null)).toMatchObject({ ok: false, erreur: "forme_invalide" });
    expect(validerPreferencesSandbox(prefs({ profil: "admin" }))).toMatchObject({ ok: false, erreur: "forme_invalide" });
    expect(validerPreferencesSandbox({ ...prefs(), autre: 1 })).toMatchObject({ ok: false, erreur: "forme_invalide" });
    expect(validerPreferencesSandbox(prefs({ favoris: ["outil:ligne", "outil:ligne"] }))).toMatchObject({ ok: false, erreur: "forme_invalide" });
    const g = (id: string, nom: string) => ({ id, nom, entrees: [] });
    expect(validerPreferencesSandbox(prefs({ regroupements: [g("a", "Mes outils"), g("b", "mes outils")] }))).toMatchObject({ ok: false, erreur: "forme_invalide" });
    expect(validerPreferencesSandbox(prefs({ regroupements: Array.from({ length: 21 }, (_, i) => g(`g${i}`, `G${i}`)) }))).toMatchObject({ ok: false, erreur: "forme_invalide" });
    expect(validerPreferencesSandbox(prefs({ regroupements: [g("Majuscule", "x")] }))).toMatchObject({ ok: false, erreur: "forme_invalide" });
  });

  it("validation : toute entrée absente du registre est refusée et nommée, jamais filtrée", () => {
    const r = validerPreferencesSandbox(prefs({ barrePersonnelle: ["ligne", "fantome"], favoris: ["outil:ligne", "commande:inconnue"], regroupements: [{ id: "a", nom: "A", entrees: ["panneau:debit"] }] }));
    expect(r).toMatchObject({ ok: false, erreur: "entree_inconnue" });
    expect(r.ok ? [] : r.inconnues).toEqual(["outil:fantome", "commande:inconnue", "panneau:debit"]);
    expect(CLES_PERSONNALISABLES).toContain("commande:groupe");
    expect(CLES_PERSONNALISABLES).not.toContain("commande:diviser");
  });

  it("relecture tolérante d'une copie locale ; identifiant de regroupement dérivé du nom", () => {
    expect(lirePreferencesSandbox("abîmé")).toEqual(PREFERENCES_SANDBOX_DEFAUT);
    expect(lirePreferencesSandbox(prefs({ profil: "personnel", barrePersonnelle: ["ligne"] })).barrePersonnelle).toEqual(["ligne"]);
    expect(idRegroupement("Mes outils préférés", [])).toBe("mes-outils-preferes");
    expect(idRegroupement("Mes outils préférés", ["mes-outils-preferes"])).toBe("mes-outils-preferes-2");
    expect(idRegroupement("!!!", [])).toBe("groupe");
  });
});
