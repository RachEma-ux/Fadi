import { describe, expect, it } from "vitest";
import { verifierModele } from "../archive.js";
import { exporterBibliotheque } from "../echanges/bibliotheque.js";
import { modeleVide, type ModeleAtelier } from "../modele.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";
import { vues3D } from "./vues3d.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (): ModeleAtelier => appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } }])).etat;
const camera = { position: { x: -10, y: -12, z: 8 }, cible: { x: 2, y: 3, z: 1.5 } };

describe("vues 3D enregistrées (D-053)", () => {
  it("enregistrée, relue à l'identique, mise à jour par son identifiant, supprimée ; inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "vue3d.enregistrer", params: { id: "v1", nom: "Entrée", camera, presentation: "eclate-horizontal", coupeHorizontale: 1.2, niveauId: "n0" } }], "v"));
    const v = vues3D(r.etat);
    expect(v).toHaveLength(1);
    expect(v[0]!.params).toEqual({ nom: "Entrée", camera, vue: "perspective", presentation: "eclate-horizontal", coupeHorizontale: 1.2, positionCoupe: 0.5, aretes: true, niveauId: "n0" });
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    const maj = appliquerLot(r.etat, lot([{ type: "vue3d.enregistrer", params: { id: "v1", nom: "Entrée nord", camera: { ...camera, position: { x: 0, y: 20, z: 6 } } } }], "m")).etat;
    expect(maj.definitions["v1"]).toMatchObject({ nom: "Entrée nord", version: 2 });
    const relu = verifierModele(JSON.parse(JSON.stringify(maj)));
    if (!relu.ok) throw new Error(relu.erreurs.join(" ; "));
    expect(relu.modele.definitions["v1"]).toEqual(maj.definitions["v1"]);
    expect(JSON.stringify(exporterBibliotheque(maj, "B"))).not.toContain("Entrée nord");
    expect(Object.keys(appliquerLot(maj, lot([{ type: "vue3d.supprimer", params: { id: "v1" } }], "s")).etat.definitions)).toEqual([]);
    // Niveau supprimé : la vue ne retient plus de niveau actif (l'archive reste valide).
    const sansNiveau = appliquerLot(maj, lot([{ type: "niveau.creer", params: { id: "n1", nom: "Étage", elevation: 3 } }, { type: "niveau.supprimer", params: { id: "n0" } }], "ns")).etat;
    expect((sansNiveau.definitions["v1"]!.params as { niveauId: string | null }).niveauId).toBeNull();
    expect(verifierModele(JSON.parse(JSON.stringify(sansNiveau))).ok).toBe(true);
  });

  it("refus : nom vide, caméra confondue avec la cible, présentation ou niveau inconnus, autre définition, suppression générique", () => {
    const e = base();
    const essai = (params: Record<string, unknown>) => () => appliquerLot(e, lot([{ type: "vue3d.enregistrer", params: { nom: "V", camera, ...params } }]));
    expect(essai({ nom: " " })).toThrow(/nom/);
    expect(essai({ camera: { position: camera.cible, cible: camera.cible } })).toThrow(/confondus/);
    expect(essai({ camera: { position: { x: 0, y: 0 }, cible: camera.cible } })).toThrow(/camera.position/);
    expect(essai({ presentation: "vrille" })).toThrow(/presentation/);
    expect(essai({ niveauId: "zz" })).toThrow(/niveau inconnu/);
    const avec = appliquerLot(e, lot([{ type: "vue3d.enregistrer", params: { id: "v", nom: "V", camera } }, { type: "vue.creer", params: { id: "p", type: "plan", titre: "Rez", echelle: 100, niveauId: "n0" } }])).etat;
    expect(() => appliquerLot(avec, lot([{ type: "vue3d.enregistrer", params: { id: "p", nom: "X", camera } }]))).toThrow(/déjà existante/);
    expect(() => appliquerLot(avec, lot([{ type: "vue3d.supprimer", params: { id: "p" } }]))).toThrow(/vue 3D inconnue/);
    expect(() => appliquerLot(avec, lot([{ type: "definition.supprimer", params: { id: "v" } }]))).toThrow(/vue3d.supprimer/);
  });
});

describe("vue 3D : boîte de coupe et annotations (D-090)", () => {
  it("enregistrées avec la vue ; boîte vide ou annotation sans texte refusées", () => {
    const e = appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } }], "n")).etat;
    const camera = { position: { x: 0, y: -10, z: 5 }, cible: { x: 0, y: 0, z: 0 } };
    const r = appliquerLot(e, lot([{ type: "vue3d.enregistrer", params: { id: "v", nom: "Coupe", camera, boiteCoupe: { x0: 0.2, x1: 0.8, y0: 0, y1: 0.5 }, annotations: [{ position: { x: 1, y: 2, z: 3 }, texte: "Reprise d'appui" }] } }], "v")).etat;
    expect(r.definitions["v"]!.params).toMatchObject({ boiteCoupe: { x0: 0.2, x1: 0.8, y0: 0, y1: 0.5 }, annotations: [{ texte: "Reprise d'appui" }] });
    expect(() => appliquerLot(e, lot([{ type: "vue3d.enregistrer", params: { nom: "x", camera, boiteCoupe: { x0: 0.5, x1: 0.5, y0: 0, y1: 1 } } }]))).toThrow(/vide/);
    expect(() => appliquerLot(e, lot([{ type: "vue3d.enregistrer", params: { nom: "x", camera, annotations: [{ position: { x: 0, y: 0, z: 0 }, texte: " " }] } }]))).toThrow(/texte/);
  });
});
