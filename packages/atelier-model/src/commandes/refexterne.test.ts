import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importerModeleNatif, type JeuNatif } from "../import/natif.js";
import { modeleVide } from "../modele.js";
import { representationReferenceExterne } from "../documents/refexterne-rendu.js";
import { empreinteVue, genererVue, type ParamsVue } from "../documents/vues.js";
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
    // Réparation explicite : autre source (et révision plus ancienne) acceptée, calage et nom gardés ; inverse exact.
    const rep = appliquerLot(maj.etat, lot([{ type: "refexterne.rattacher", params: { id: "voisin", reparer: true, projetSourceId: "copie", publicationId: "pub-c", revisionSource: 1, empreinteSource: "ccc" } }], "rep"));
    expect(rep.etat.definitions["voisin"]).toMatchObject({ nom: "Bâtiment voisin", params: { projetSourceId: "copie", revisionSource: 1, position: { x: 50, y: 0 }, angle: { value: 90 } } });
    expect(appliquerLot(rep.etat, lot([rep.inverse], "inv-rep")).etat).toEqual(maj.etat);
    expect(() => appliquerLot(e, lot([{ ...rattacher, params: { ...rattacher.params, reparer: true } }]))).toThrow(/réparer/);
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

  it("documents : le plan du niveau dessine les traits fournis par l'appelant, sinon le dit ; l'empreinte suit l'épinglage", () => {
    const e = base();
    const vue: ParamsVue = { type: "plan", titre: "Rez", echelle: 100, niveauId: "n0", hauteurCoupe: null, ligneA: null, ligneB: null, profondeur: null, orientation: null, cadreMin: null, cadreMax: null, lignesCachees: false, phases: null };
    const sans = empreinteVue(e, vue);
    const r = appliquerLot(e, lot([rattacher])).etat;
    expect(empreinteVue(r, vue)).not.toBe(sans);
    const apercu = genererVue(r, vue);
    expect(apercu.avertissements.some((a) => /aperçu sans accès/.test(a))).toBe(true);
    const traits = representationReferenceExterne(P118, r.definitions["voisin"]!.params as unknown as ParamsReferenceExterne).traits;
    const dessine = genererVue(r, vue, null, { externes: [{ id: "voisin", traits }] });
    const fins = (v: typeof apercu) => v.primitives.filter((p) => p.type === "ligne" && p.trait === "fin").length;
    // Les traits de longueur nulle sont écartés par le collecteur, comme pour tout dessin.
    expect(fins(dessine) - fins(apercu)).toBe(traits.filter((t) => Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) > 1e-9).length);
    expect(dessine.empreinte).toBe(apercu.empreinte);
    const inaccessible = genererVue(r, vue, null, { externes: [{ id: "voisin", traits: null }] });
    expect(inaccessible.avertissements.some((a) => /source inaccessible/.test(a))).toBe(true);
  });

  it("calque verrouillé : ni rattachement, ni mise à jour, ni détachement", () => {
    const e = appliquerLot(base(), lot([{ type: "calque.creer", params: { id: "k", nom: "Voisins" } }, { ...rattacher, params: { ...rattacher.params, calqueId: "k" } }])).etat;
    const v = appliquerLot(e, lot([{ type: "calque.modifier", params: { id: "k", verrouille: true } }], "v")).etat;
    expect(() => appliquerLot(v, lot([{ type: "refexterne.rattacher", params: { id: "voisin", publicationId: "pub-2", revisionSource: 5, empreinteSource: "x" } }], "m"))).toThrow(/verrouillé/);
    expect(() => appliquerLot(v, lot([{ type: "refexterne.detacher", params: { id: "voisin" } }], "d"))).toThrow(/verrouillé/);
    expect(() => appliquerLot(v, lot([{ ...rattacher, params: { ...rattacher.params, id: "autre", calqueId: "k" } }], "n"))).toThrow(/verrouillé/);
  });
});
