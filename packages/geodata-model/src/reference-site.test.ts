import { describe, expect, it } from "vitest";
import { constituerReferenceSite, verifierEmpreinteReference } from "./reference-site.js";
import { assemblerLectureSite, type VersionLue } from "./site.js";

const droits = { consultation: "autorise", stockage: "autorise", calcul: "autorise", tuiles: "autorise", commercial: "inconnu", partage: "autorise", telechargement: "inconnu", export: "autorise" } as const;
const version = (id: string, autre: Partial<VersionLue> = {}): VersionLue => ({
  id, libelle: id, empreinte: "b".repeat(64), periode: null, publieeLe: null, licence: "CC-BY", attribution: "HCP", urlSource: null, precision: null, droits, privee: false,
  source: { id: "s", titre: "Source", producteur: "P", couverture: "" }, ...autre,
});
const lecture = (services: VersionLue[]) => assemblerLectureSite({
  entree: { nature: "point", repere: "geographic", crs: "EPSG:4326", point: { lon: -7.6, lat: 33.5 }, rayonM: 500 }, maintenant: new Date("2026-11-27T10:00:00Z"),
  unites: null, fiche: null, prix: null, terrain: null,
  services: { ok: true, valeur: services.map((v, i) => ({ coucheId: `c${i}`, accessible: true as const, titre: "Écoles", nombre: 3, plusProche: null, version: v })) },
});
const t = new Date("2026-11-27T10:05:00Z");

describe("référence de site (P14, donnees-1 TA-D6)", () => {
  it("renvoi, pas copie : version et empreinte, aucune valeur", () => {
    const r = constituerReferenceSite(lecture([version("v1")]), [], t);
    expect(r.lectures).toHaveLength(1);
    expect(r.lectures[0]).toMatchObject({ rubrique: "services", versionId: "v1", empreinteVersion: "b".repeat(64), parametres: { rayonM: 500 } });
    expect(JSON.stringify(r)).not.toContain("\"nombre\"");
    expect(r.entree.geometrie).toEqual({ type: "Point", coordinates: [-7.6, 33.5] });
  });
  it("exclut une version provisoire même autorisée, un partage inconnu, une donnée privée — avec leur motif", () => {
    const r = constituerReferenceSite(lecture([
      version("prov", { qualification: { etat: "provisoire", motif: "m", decision: "D-GD-54" } }),
      version("inconnu", { droits: { ...droits, partage: "inconnu" } }),
      version("privee", { privee: true }),
    ]), [], t);
    expect(r.lectures).toEqual([]);
    expect(r.exclusions.map((x) => x.versionId)).toEqual(["prov", "inconnu", "privee"]);
    expect(r.exclusions.every((x) => x.motif.length > 0)).toBe(true);
  });
  it("même lecture, même instant → même empreinte ; une valeur modifiée est refusée", () => {
    const a = constituerReferenceSite(lecture([version("v1")]), [], t);
    const b = constituerReferenceSite(lecture([version("v1")]), [], t);
    expect(a.empreinte).toBe(b.empreinte);
    expect(a.empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(verifierEmpreinteReference(JSON.parse(JSON.stringify(a)))).toMatchObject({ ok: true });
    const modifiee = JSON.parse(JSON.stringify(a));
    modifiee.lectures[0].versionId = "autre";
    expect(verifierEmpreinteReference(modifiee)).toEqual({ ok: false, erreur: "Empreinte invalide : la référence a été modifiée." });
    expect(verifierEmpreinteReference({ format: "x" })).toMatchObject({ ok: false });
  });
  it("aucune clé d'un autre module (indépendance GEO 04)", () => {
    const r = constituerReferenceSite(lecture([version("v1")]), [], t);
    const cles: string[] = [];
    const parcourir = (x: unknown) => { if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) { cles.push(k); parcourir(v); } };
    parcourir(r);
    expect(cles.some((k) => /proj/i.test(k))).toBe(false);
  });
});
