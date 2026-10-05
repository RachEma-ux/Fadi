import { describe, expect, it } from "vitest";
import { exporterIfc } from "../echanges/ifc.js";
import { modeleVide, type ModeleAtelier } from "../modele.js";
import { m } from "../unites.js";
import { altimetrieDu, altitudeAbsolue } from "./altimetrie.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (): ModeleAtelier => appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "n1", nom: "Étage", elevation: 3.2 } }])).etat;
const opt = { projet: { id: "p", nom: "Essai", code: "E" }, revision: 1, horodatage: "2026-10-05T00:00:00" };

describe("repère altimétrique du site (D-067)", () => {
  it("non déclaré : altitude absolue non évaluée ; déclaré : niveau 3,20 → 435,35 m ; IFC RefElevation ; retrait ; inverse exact", () => {
    const e = base();
    expect(altitudeAbsolue(e, 3.2)).toBeNull();
    expect(exporterIfc(e, opt).contenu).toMatch(/IFCSITE\([^;]*\.ELEMENT\.,\$,\$,\$,\$,\$\);/);
    const r = appliquerLot(e, lot([{ type: "site.altimetrie.definir", params: { altitude: m(432.15), systeme: "NGF-IGN69", source: "plan du géomètre, 2026" } }], "a"));
    expect(altimetrieDu(r.etat)).toEqual({ altitude: 432.15, systeme: "NGF-IGN69", source: "plan du géomètre, 2026" });
    expect(altitudeAbsolue(r.etat, 3.2)).toBe(435.35);
    expect(exporterIfc(r.etat, opt).contenu).toMatch(/IFCSITE\([^;]*\.ELEMENT\.,\$,\$,432\.15,\$,\$\);/);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    expect(altimetrieDu(appliquerLot(r.etat, lot([{ type: "site.altimetrie.definir", params: { altitude: null } }], "x")).etat)).toBeNull();
    expect(() => appliquerLot(e, lot([{ type: "site.altimetrie.definir", params: { altitude: 432, systeme: "NGF", source: "x" } }]))).toThrow(/longueur/);
    expect(() => appliquerLot(e, lot([{ type: "site.altimetrie.definir", params: { altitude: m(432), systeme: "NGF" } }]))).toThrow(/source/);
  });
});
