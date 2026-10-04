import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importerModeleNatif, type JeuNatif } from "../import/natif.js";
import { modeleVide } from "../modele.js";
import { representationReferenceExterne } from "../documents/refexterne-rendu.js";
import { pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";
import { referencesExternes, versRepereProjet, type ParamsReferenceExterne } from "./refexterne.js";

const P118 = importerModeleNatif(JSON.parse(readFileSync(new URL("../../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url), "utf8")) as JeuNatif).modele;
const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = () => appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } }])).etat;
const rattacher = { type: "refexterne.rattacher", params: { id: "voisin", nom: "Bâtiment voisin", projetSourceId: "p-118", publicationId: "pub-1", revisionSource: 3, empreinteSource: "abc", niveauSourceId: "rdc", niveauId: "n0", position: pt(50, 0), angle: { value: 90, unit: "deg" } } };

describe("références externes (DA-05-11)", () => {
  it("rattacher (épinglée), mettre à jour vers une révision plus récente, refus d'une plus ancienne ou d'une autre source, détacher ; inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([rattacher]));
    expect(referencesExternes(r.etat)).toHaveLength(1);
    expect(r.effets.crees).toEqual(["voisin"]);
    const maj = appliquerLot(r.etat, lot([{ type: "refexterne.rattacher", params: { id: "voisin", publicationId: "pub-2", revisionSource: 5, empreinteSource: "def" } }], "maj"));
    expect(maj.etat.definitions["voisin"]).toMatchObject({ version: 2, params: { publicationId: "pub-2", revisionSource: 5, position: { x: 50, y: 0 } } });
    expect(() => appliquerLot(maj.etat, lot([{ type: "refexterne.rattacher", params: { id: "voisin", publicationId: "pub-1", revisionSource: 3, empreinteSource: "abc" } }]))).toThrow(/plus ancienne/);
    expect(() => appliquerLot(maj.etat, lot([{ type: "refexterne.rattacher", params: { id: "voisin", projetSourceId: "autre" } }]))).toThrow(/garde sa source/);
    expect(() => appliquerLot(e, lot([{ ...rattacher, params: { ...rattacher.params, niveauId: "inconnu" } }]))).toThrow(/niveau inconnu/);
    const d = appliquerLot(maj.etat, lot([{ type: "refexterne.detacher", params: { id: "voisin" } }], "d"));
    expect(referencesExternes(d.etat)).toHaveLength(0);
    expect(appliquerLot(d.etat, lot([d.inverse], "inv")).etat).toEqual(maj.etat);
  });

  it("représentation : plan du niveau source converti explicitement (rotation puis translation), sans rien copier dans le modèle", () => {
    expect(versRepereProjet({ x: 1, y: 0 }, { position: pt(50, 0), angle: { value: 90, unit: "deg" } })).toEqual({ x: 50, y: 1 });
    const params = rattacher.params as unknown as ParamsReferenceExterne;
    const rep = representationReferenceExterne(P118, params);
    expect(rep.niveauSourceNom).toBe("RDC");
    expect(rep.traits.length).toBeGreaterThan(100);
    expect(rep.traits.some((t) => t.coupe)).toBe(true);
    const sans = representationReferenceExterne(P118, { ...params, position: pt(0, 0), angle: { value: 0, unit: "deg" } });
    expect(rep.traits[0]!.a).toEqual(versRepereProjet(sans.traits[0]!.a, params));
    expect(representationReferenceExterne(P118, { ...params, niveauSourceId: "absent" }).traits).toEqual([]);
  });
});
