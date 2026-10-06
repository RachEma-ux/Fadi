import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { sectionPoteau } from "./blocs-places.js";
import { aireSignee } from "./geometrie.js";
import { exporterIfc } from "./echanges/ifc.js";
import { interferences } from "./interferences.js";
import { modeleVide, type Occurrence } from "./modele.js";
import { maillageObjet } from "./projection/maillage.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const aire = (q: [number, number][]) => aireSignee(q.map(([x, y]) => ({ x, y })));

describe("sections de poteaux (D-139, DA-05-14)", () => {
  it("aires exactes des profilés ; cercle de diamètre la largeur ; sans épaisseur : rectangle", () => {
    expect(aire(sectionPoteau("rectangle", 0.4, 0.3, null))).toBeCloseTo(0.12, 12);
    expect(aire(sectionPoteau("I", 0.2, 0.3, 0.02))).toBeCloseTo(2 * 0.2 * 0.02 + 0.02 * 0.26, 12);
    expect(aire(sectionPoteau("T", 0.2, 0.3, 0.02))).toBeCloseTo(0.2 * 0.02 + 0.02 * 0.28, 12);
    expect(aire(sectionPoteau("L", 0.2, 0.3, 0.02))).toBeCloseTo(0.2 * 0.02 + 0.02 * 0.28, 12);
    expect(aire(sectionPoteau("U", 0.2, 0.3, 0.02))).toBeCloseTo(0.2 * 0.02 + 2 * 0.02 * 0.28, 12);
    expect(aire(sectionPoteau("cercle", 0.4, 0.4, null))).toBeCloseTo(32 * 0.5 * 0.04 * Math.sin((2 * Math.PI) / 32), 12);
    expect(sectionPoteau("I", 0.2, 0.3, null)).toHaveLength(4);
  });

  it("saisie validée ; maillage, IFC et interférences suivent la section", () => {
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
      { type: "poteau.creer", params: { id: "p", niveauId: "n", point: pt(0, 0), formeId: "I", epaisseurProfil: m(0.02), largeur: m(0.2), profondeur: m(0.3), hauteur: m(3) } },
      { type: "poteau.creer", params: { id: "q", niveauId: "n", point: pt(0.15, 0), formeId: "rectangle", largeur: m(0.1), profondeur: m(0.1), hauteur: m(3) } },
    ])).etat;
    expect((e.objets["p"] as Occurrence<"poteau">).params.epaisseurProfil).toEqual(m(0.02));
    expect(() => appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "p", params: { epaisseurProfil: null } } }], "x"))).toThrow(/epaisseurProfil/);
    expect(() => appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "q", params: { epaisseurProfil: m(0.01) } } }], "y"))).toThrow(/réservée aux profilés/);
    expect(() => appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "p", params: { epaisseurProfil: m(0.1) } } }], "z"))).toThrow(/moitié/);
    const ma = maillageObjet(e, e.objets["p"]!)!;
    const zs = new Set<number>();
    for (let i = 2; i < ma.positions.length; i += 3) zs.add(ma.positions[i]!);
    expect([...zs].sort()).toEqual([0, 3]);
    expect(ma.positions.length / 3).toBeGreaterThanOrEqual(24); // 12 sommets dessous, 12 dessus
    const ifc = exporterIfc(e, { projet: { id: "p", nom: "t", code: "T" }, revision: 1, horodatage: "2026-10-06T00:00:00" }).contenu;
    expect(ifc).toMatch(/IFCARBITRARYCLOSEDPROFILEDEF/);
    // Le petit poteau q (x de 0,10 à 0,20) recoupe l'aile du I (x jusqu'à 0,10) : contact sans volume commun ; décalé, oui.
    expect(interferences(e)).toEqual([]);
    const f = appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "q", params: { point: pt(0.12, 0.12) } } }], "f")).etat;
    expect(interferences(f).map((i) => i.objets.join("+"))).toEqual(["p+q"]);
  });
});
