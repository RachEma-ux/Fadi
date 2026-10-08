import { describe, expect, it } from "vitest";
import { appliquerLot, CONTRAT_COMMANDES, CONTRATS_ACCEPTES } from "./commandes/index.js";
import { ErreurCommande } from "./commandes/base.js";
import { modeleVide } from "./modele.js";
import { maillageObjet } from "./projection/maillage.js";
import { emprisePosee, positionsPosees, volumeMaillage } from "./solide-exact.js";
import { exporterIfc } from "./echanges/ifc.js";
import { quantites } from "./quantites.js";
import type { Occurrence } from "./modele.js";

// Cube unité (maillage dérivé d'un brep fictif : le modèle ne recalcule ni brep ni maillage).
const P = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
const I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
const BREP = "QlJFUC1leGFjdA=="; // base64 quelconque : la validité du brep est l'affaire du serveur (revalidation par le noyau)
const base = (extra: Record<string, unknown> = {}) => ({ niveauId: "n1", brep: BREP, moteur: "occt-wasm", versionMoteur: "5.6.1", empreinteBrep: "0123456789abcdef", maillage: { positions: P, indices: I }, volume: 1, aire: 6, faces: 6, operation: { type: "extrusion", sources: ["esq-1"], libelle: "Extrusion exacte" }, ...extra });
function modeleAvecNiveau() {
  const etat = modeleVide();
  const r = appliquerLot(etat, { requestId: "n", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "niveau", commands: [{ type: "niveau.creer", params: { id: "n1", nom: "RDC", elevation: 2.5, hauteur: 3 } }] });
  return r.etat;
}
const lot = (etat: ReturnType<typeof modeleVide>, commands: { type: string; params: Record<string, unknown>; cibles?: string[] }[]) => appliquerLot(etat, { requestId: `r${Math.random()}`, baseRevision: 0, contract: CONTRAT_COMMANDES, label: "t", commands });

describe("solide exact (P2-1) — modèle pur", () => {
  it("le contrat passe à atelier-commands/3, /1 et /2 restent acceptés", () => {
    expect(CONTRAT_COMMANDES).toBe("atelier-commands/3");
    expect(CONTRATS_ACCEPTES).toEqual(["atelier-commands/1", "atelier-commands/2", "atelier-commands/3"]);
  });

  it("solideExact.creer : emprise recalculée (enveloppe convexe posée), maillage 3D à l'altitude du niveau, quantités, IFC", () => {
    const etat = lot(modeleAvecNiveau(), [{ type: "solideExact.creer", params: { id: "se-1", ...base({ position: { x: 10, y: 5, frame: "local", unit: "m" }, angle: { value: 90, unit: "deg" } }) } }]).etat;
    const o = etat.objets["se-1"] as Occurrence<"solide-exact">;
    expect(o.classe).toBe("solide-exact");
    // Rotation de 90° du carré [0,1]² autour de l'origine puis translation (10, 5) : x ∈ [9, 10], y ∈ [5, 6].
    const xs = o.params.emprise.map((q) => q.x), ys = o.params.emprise.map((q) => q.y);
    expect(Math.min(...xs)).toBeCloseTo(9, 9); expect(Math.max(...xs)).toBeCloseTo(10, 9);
    expect(Math.min(...ys)).toBeCloseTo(5, 9); expect(Math.max(...ys)).toBeCloseTo(6, 9);
    const m = maillageObjet(etat, o)!;
    expect(m.indices.length).toBe(36);
    expect(Math.min(...m.positions.filter((_, i) => i % 3 === 2))).toBeCloseTo(2.5, 9);
    expect(volumeMaillage({ positions: positionsPosees(o.params.maillage, o.params.position, 90), indices: I })).toBeCloseTo(1, 9);
    expect(quantites(etat).niveaux[0]!.solidesExacts).toEqual({ nombre: 1, volume: 1 });
    const { contenu, rapport } = exporterIfc(etat, { projet: { id: "p", nom: "P", code: "P" }, revision: 1, horodatage: "2026-10-08T00:00:00Z" });
    expect(contenu).toMatch(/IFCBUILDINGELEMENTPROXY\('[^']+',\$,'se-1',\$,'solide-exact'/);
    expect(contenu).toContain("Fadi_SolideExact");
    expect(rapport.classes.some((l) => l.classe === "solide-exact")).toBe(true);
  });

  it("refuse un maillage incohérent, un brep non base64, une empreinte mal formée", () => {
    const etat = modeleAvecNiveau();
    expect(() => lot(etat, [{ type: "solideExact.creer", params: base({ maillage: { positions: P, indices: [0, 1, 99] } }) }])).toThrow(ErreurCommande);
    expect(() => lot(etat, [{ type: "solideExact.creer", params: base({ brep: "***" }) }])).toThrow(/brep/);
    expect(() => lot(etat, [{ type: "solideExact.creer", params: base({ empreinteBrep: "x" }) }])).toThrow(/empreinte/);
  });

  it("modifier : nom, couleur et pose seulement ; la géométrie passe par une opération exacte", () => {
    const etat = lot(modeleAvecNiveau(), [{ type: "solideExact.creer", params: { id: "se-1", ...base() } }]).etat;
    const ok = lot(etat, [{ type: "solideExact.modifier", params: { id: "se-1", params: { nom: "Fût", position: { x: 2, y: 0, frame: "local", unit: "m" } } } }]).etat;
    const o = ok.objets["se-1"] as Occurrence<"solide-exact">;
    expect(o.params.nom).toBe("Fût");
    expect(Math.min(...o.params.emprise.map((q) => q.x))).toBeCloseTo(2, 9);
    expect(() => lot(etat, [{ type: "solideExact.modifier", params: { id: "se-1", params: { volume: 5 } } }])).toThrow(/opération exacte/);
  });

  it("transformations : déplacer et tourner changent la pose ; miroir et échelle refusés", () => {
    const etat = lot(modeleAvecNiveau(), [{ type: "solideExact.creer", params: { id: "se-1", ...base() } }]).etat;
    const d = lot(etat, [{ type: "transformer.deplacer", params: { dx: 3, dy: 0 }, cibles: ["se-1"] }]).etat;
    expect((d.objets["se-1"] as Occurrence<"solide-exact">).params.position.x).toBeCloseTo(3, 9);
    const r = lot(etat, [{ type: "transformer.tourner", params: { centre: { x: 0, y: 0, frame: "local", unit: "m" }, angle: { value: 90, unit: "deg" } }, cibles: ["se-1"] }]).etat;
    expect((r.objets["se-1"] as Occurrence<"solide-exact">).params.angle.value).toBeCloseTo(90, 9);
    expect(() => lot(etat, [{ type: "transformer.miroir", params: { a: { x: 0, y: 0, frame: "local", unit: "m" }, b: { x: 0, y: 1, frame: "local", unit: "m" } }, cibles: ["se-1"] }])).toThrow(/miroir/);
    expect(() => lot(etat, [{ type: "transformer.echelle", params: { centre: { x: 0, y: 0, frame: "local", unit: "m" }, facteur: 2 }, cibles: ["se-1"] }])).toThrow(/échelle/);
  });

  it("emprisePosee / volumeMaillage : helpers purs", () => {
    expect(emprisePosee({ positions: [1, 0, 0] }, { x: 0, y: 0 }, 90)[0]!.y).toBeCloseTo(1, 9);
    expect(volumeMaillage({ positions: P, indices: I })).toBeCloseTo(1, 12);
  });
});
