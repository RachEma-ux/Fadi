import { describe, expect, it } from "vitest";
import { COMPOSITION_INITIALE, validerComposition } from "./composition.js";
import { estFondImagerie, fondBascule, FOURNISSEUR_MAPTILER, fondParDefaut, fondsDesFournisseurs, lireReglagesFournisseurs, REGLAGES_PAR_DEFAUT, validerFournisseurSaisi, validerModele } from "./fournisseurs.js";

const saisi = { nom: "IGN Maroc", modele: "https://tuiles.example.org/{z}/{x}/{y}.png?token={cle}", cle: "abc123", attribution: "© Exemple", zoomMax: "18" };

describe("fournisseurs de fonds de carte (D-GD-15)", () => {
  it("par défaut : MapTiler seul, fournisseur par défaut ; sans clé, aucun fond (signalé)", () => {
    expect(lireReglagesFournisseurs(null)).toEqual(REGLAGES_PAR_DEFAUT);
    const r = fondsDesFournisseurs(REGLAGES_PAR_DEFAUT, "");
    expect(r.fonds).toEqual([]);
    expect(r.sansCle).toEqual([{ fournisseurId: "maptiler", nom: "MapTiler" }]);
    expect(fondParDefaut(REGLAGES_PAR_DEFAUT, r.fonds)).toBeNull();
  });
  it("avec la clé MapTiler : quatre fonds, clé encodée dans l'adresse, jamais exportables ; défaut = satellite", () => {
    const { fonds } = fondsDesFournisseurs(REGLAGES_PAR_DEFAUT, "a b&c");
    expect(fonds.map((f) => f.id)).toEqual(FOURNISSEUR_MAPTILER.styles.map((s) => `navigateur:maptiler:${s.id}`));
    expect(fonds[0]!.tuiles[0]).toBe("https://api.maptiler.com/maps/satellite/256/{z}/{x}/{y}.jpg?key=a%20b%26c");
    expect(fonds.every((f) => f.export === false && f.attribution.includes("MapTiler"))).toBe(true);
    expect(fondParDefaut(REGLAGES_PAR_DEFAUT, fonds)).toBe("navigateur:maptiler:satellite");
  });
  it("saisie d'un fournisseur XYZ : https, jetons, clé exigée par {cle}, attribution, zoom", () => {
    const v = validerFournisseurSaisi(saisi, "ign-maroc");
    expect(v.ok).toBe(true);
    expect(validerFournisseurSaisi({ ...saisi, modele: "http://x.org/{z}/{x}/{y}.png" }, "a").ok).toBe(false);
    expect(validerFournisseurSaisi({ ...saisi, cle: "" }, "a").ok).toBe(false);
    expect(validerFournisseurSaisi({ ...saisi, attribution: "" }, "a").ok).toBe(false);
    expect(validerFournisseurSaisi({ ...saisi, zoomMax: "30" }, "a").ok).toBe(false);
    expect(validerFournisseurSaisi(saisi, "maptiler").ok).toBe(false);
    expect(validerFournisseurSaisi(saisi, "b", ["ign maroc"]).ok).toBe(false);
    expect(validerModele("https://x.org/{z}/{x}/{y}.png?s={s}")).toContain("Seuls les jetons {z}, {x}, {y} et {cle} sont admis.");
  });
  it("réglages relus : MapTiler toujours présent (désactivable), fournisseur illisible écarté, défaut conservé ou repris", () => {
    const v = validerFournisseurSaisi(saisi, "ign-maroc");
    if (!v.ok) throw new Error("saisie");
    const brut = JSON.stringify({ fournisseurs: [{ type: "maptiler", actif: false }, v.valeur, { id: "casse", nom: "x", type: "xyz" }], defaut: "ign-maroc" });
    const r = lireReglagesFournisseurs(brut);
    expect(r.fournisseurs.map((f) => [f.id, f.actif])).toEqual([["maptiler", false], ["ign-maroc", true]]);
    expect(r.defaut).toBe("ign-maroc");
    const { fonds } = fondsDesFournisseurs(r, "cle-mt");
    expect(fonds.map((f) => f.id)).toEqual(["navigateur:ign-maroc:fond"]);
    expect(fondParDefaut(r, fonds)).toBe("navigateur:ign-maroc:fond");
    expect(lireReglagesFournisseurs(JSON.stringify({ fournisseurs: [], defaut: "inconnu" })).defaut).toBe("maptiler");
    expect(lireReglagesFournisseurs(JSON.stringify({ fournisseurs: [], defaut: null })).defaut).toBeNull();
    expect(lireReglagesFournisseurs("{pas du json").fournisseurs).toHaveLength(1);
  });
  it("une composition garde l'identifiant du fond de fournisseur, jamais une adresse", () => {
    expect(validerComposition({ ...COMPOSITION_INITIALE, fond: "navigateur:maptiler:satellite" }).ok).toBe(true);
    expect(validerComposition({ ...COMPOSITION_INITIALE, fond: "https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.jpg?key=x" }).ok).toBe(false);
  });
});

describe("bascule Plan / Satellite (D-GD-46)", () => {
  const f = (...ids: string[]) => ids.map((id) => ({ id }));
  const mt = f("navigateur:maptiler:satellite", "navigateur:maptiler:hybride", "navigateur:maptiler:plan", "navigateur:maptiler:topographique");
  it("imagerie → plan du même fournisseur ; plan ou topographique → satellite du même fournisseur", () => {
    expect(fondBascule("navigateur:maptiler:satellite", mt)).toEqual({ cible: "navigateur:maptiler:plan", versSatellite: false });
    expect(fondBascule("navigateur:maptiler:hybride", mt)).toEqual({ cible: "navigateur:maptiler:plan", versSatellite: false });
    expect(fondBascule("navigateur:maptiler:topographique", mt)).toEqual({ cible: "navigateur:maptiler:satellite", versSatellite: true });
  });
  it("fond neutre ou fournisseur sans imagerie → premier satellite disponible ; imagerie sans plan → fond neutre", () => {
    expect(fondBascule("neutre", mt)).toEqual({ cible: "navigateur:maptiler:satellite", versSatellite: true });
    expect(fondBascule("navigateur:xyz1:fond", [...f("navigateur:xyz1:fond"), ...mt])).toEqual({ cible: "navigateur:maptiler:satellite", versSatellite: true });
    expect(fondBascule("navigateur:x:satellite", f("navigateur:x:satellite"))).toEqual({ cible: "neutre", versSatellite: false });
  });
  it("aucun satellite réglé (clé absente) → null", () => {
    expect(fondBascule("neutre", [])).toBeNull();
    expect(fondBascule("navigateur:xyz1:fond", f("navigateur:xyz1:fond"))).toBeNull();
    expect(estFondImagerie("navigateur:maptiler:hybride")).toBe(true);
    expect(estFondImagerie("neutre")).toBe(false);
  });
});
