import { describe, expect, it } from "vitest";
import { reconnaitreForme } from "./reconnaissance.js";
import { pt } from "./unites.js";

describe("reconnaissance de formes proposée (D-079)", () => {
  it("tracé presque droit → ligne ; presque circulaire → cercle ; presque rectangulaire → rectangle ; gribouillis → rien", () => {
    const ligne = reconnaitreForme([pt(0, 0), pt(1, 0.02), pt(2, -0.01), pt(3, 0)], false);
    expect(ligne[0]).toMatchObject({ forme: "ligne", points: [{ x: 0, y: 0 }, { x: 3, y: 0 }] });
    const cercle = Array.from({ length: 24 }, (_, i) => pt(5 + 2 * Math.cos((i * Math.PI) / 12) * (1 + 0.01 * Math.sin(i)), 1 + 2 * Math.sin((i * Math.PI) / 12)));
    const c = reconnaitreForme(cercle, true)[0]!;
    expect(c.forme).toBe("cercle");
    if (c.forme === "cercle") {
      expect(c.rayon).toBeCloseTo(2, 1);
      expect(c.centre.x).toBeCloseTo(5, 1);
    }
    const rect = reconnaitreForme([pt(0, 0), pt(2, 0.01), pt(4, 0), pt(4, 1.5), pt(4.01, 3), pt(2, 3), pt(0, 3), pt(0, 1.5)], true)[0]!;
    expect(rect.forme).toBe("polygone");
    expect(reconnaitreForme([pt(0, 0), pt(3, 3), pt(0, 3), pt(3, 0), pt(1, 2)], false)).toEqual([]);
  });
});

describe("remplacer par la forme reconnue : un lot, même identifiant", () => {
  it("supprimer puis recréer sous le même identifiant", async () => {
    const { CONTRAT_COMMANDES, appliquerLot } = await import("./commandes/index.js");
    const { modeleVide } = await import("./modele.js");
    const lot = (commands: unknown[], id: string) => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands: commands as never });
    const e = appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0 } }, { type: "esquisse.polyligne", params: { id: "t", niveauId: "n", points: [pt(0, 0), pt(1, 0.01), pt(2, 0)] } }], "a")).etat;
    const r = appliquerLot(e, lot([{ type: "objet.supprimer", params: { id: "t" } }, { type: "esquisse.ligne", params: { id: "t", niveauId: "n", calqueId: null, points: [pt(0, 0), pt(2, 0)] } }], "b"));
    expect((r.etat.objets["t"] as { params: { forme: string } }).params.forme).toBe("ligne");
    expect(appliquerLot(r.etat, lot([r.inverse], "c")).etat).toEqual(e);
  });
});
