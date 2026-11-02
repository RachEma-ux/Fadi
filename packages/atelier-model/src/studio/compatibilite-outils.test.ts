/**
 * TR-EX-030 / EX-030 — statut « déprécié » d'un outil au manifeste et plan de compatibilité (profils enregistrés,
 * commandes hors ligne en attente, documents réouvrables). Tables d'essai : aucun outil n'est déprécié au commit de
 * réalisation (les tables réelles sont vides et contrôlées).
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, validateStudioDocument, type StudioCommand } from "../index.js";
import { compatibiliteTravail, controlerDepreciations, outilsDuDocument, statutOutil, STUDIO_MODULES_DEPRECIES, STUDIO_OUTILS_DEPRECIES, type DeclarationDepreciation } from "./compatibilite-outils.js";

const RECT_DEPRECIE: DeclarationDepreciation = {
  toolId: "studio.dessin.rectangle",
  plan: { depuis: "studio-tool-manifest/2", motif: "Remplacé par la polyligne fermée (essai).", remplacement: "studio.dessin.polyligne", profils: "remplacement", commandesEnAttente: "executees", documents: "lecture-conservee" },
};
const rect = (id: string, x: number): StudioCommand => ({ toolId: "studio.dessin.rectangle", params: { id, type: "rectangle", origin: { x, y: 0 }, width: 2, height: 1 } });

describe("TR-EX-030 — dépréciation d'un outil et plan de compatibilité", () => {
  it("tables réelles : aucun outil ni module déprécié, déclarations valides ; un outil du registre est actif, un identifiant inconnu est inconnu", () => {
    expect(STUDIO_OUTILS_DEPRECIES).toEqual([]);
    expect(STUDIO_MODULES_DEPRECIES).toEqual([]);
    expect(controlerDepreciations()).toEqual([]);
    expect(statutOutil("studio.dessin.rectangle")).toEqual({ statut: "actif" });
    expect(statutOutil("studio.inexistant")).toEqual({ statut: "inconnu" });
  });

  it("cas négatif : déprécier l'outil Rectangle puis rouvrir un document qui l'emploie — le document se relit, aucun objet perdu, l'emploi est signalé", () => {
    const doc = applyStudioCommands(newStudioDocument("d"), [rect("R1", 0), rect("R2", 5), { toolId: "studio.dessin.ligne", params: { id: "L", type: "line", start: { x: 0, y: 3 }, end: { x: 1, y: 3 } } }]);
    // Réouverture : relecture du document enregistré (JSON), validée par le modèle, objets intacts.
    const relu = validateStudioDocument(JSON.parse(JSON.stringify(doc)));
    expect(relu.objects.map((o) => o.id)).toEqual(["R1", "R2", "L"]);
    expect(statutOutil("studio.dessin.rectangle", [RECT_DEPRECIE])).toEqual({ statut: "deprecie", plan: RECT_DEPRECIE.plan });
    const c = compatibiliteTravail({ document: relu }, [RECT_DEPRECIE]);
    expect(c).toMatchObject({ reouvrable: true, introuvables: [] });
    expect(c.avis).toEqual([{ toolId: "studio.dessin.rectangle", ou: "document", plan: RECT_DEPRECIE.plan }]);
  });

  it("commandes hors ligne en attente de l'outil déprécié : conservées et toujours applicables (aucune commande locale effacée) ; profil enregistré : suit le remplacement déclaré", () => {
    const enAttente = [rect("R3", 9), rect("R4", 12)];
    const c = compatibiliteTravail({ commandes: enAttente, profil: ["studio.dessin.selection", "studio.dessin.rectangle"] }, [RECT_DEPRECIE]);
    expect(c.commandesConservees).toBe(2);
    expect(c.avis.map((a) => a.ou)).toEqual(["profil", "commandes-en-attente"]);
    expect(c.profil).toEqual(["studio.dessin.selection", "studio.dessin.polyligne"]);
    // L'outil déprécié reste exécutable pour son travail existant : les commandes en attente s'appliquent.
    expect(applyStudioCommands(newStudioDocument("d"), enAttente).objects).toHaveLength(2);
    // Profil « conserve » : l'identifiant déprécié reste tel quel.
    expect(compatibiliteTravail({ profil: ["studio.dessin.rectangle"] }, [{ ...RECT_DEPRECIE, plan: { ...RECT_DEPRECIE.plan, profils: "conserve" } }]).profil).toEqual(["studio.dessin.rectangle"]);
  });

  it("plan incomplet ou incohérent refusé : remplacement absent, remplacement lui-même déprécié, version invalide, doublon", () => {
    const pbs = controlerDepreciations([
      { ...RECT_DEPRECIE, plan: { ...RECT_DEPRECIE.plan, remplacement: null } },
      { toolId: "studio.dessin.cercle", plan: { ...RECT_DEPRECIE.plan, remplacement: "studio.dessin.rectangle", profils: "conserve", depuis: "v2" } },
      { toolId: "studio.dessin.cercle", plan: { ...RECT_DEPRECIE.plan, remplacement: null, profils: "conserve" } },
    ], [{ chargeur: "inexistant" as never, depuis: "studio-tool-manifest/2", motif: "x" }]);
    expect(pbs).toEqual(expect.arrayContaining([
      "studio.dessin.rectangle : profils remplacés sans outil de remplacement",
      "studio.dessin.cercle : version de dépréciation invalide",
      "studio.dessin.cercle : remplacement non actif studio.dessin.rectangle",
      "outil déprécié deux fois : studio.dessin.cercle",
      "module déprécié inconnu : inexistant",
    ]));
  });

  it("outil retiré (absent du registre) ou type d'objet inconnu : travail signalé non réouvrable, rien n'est réinterprété", () => {
    const c = compatibiliteTravail({ commandes: [{ toolId: "studio.retire" }], document: { objects: [{ type: "spline" }] as never } });
    expect(c).toMatchObject({ reouvrable: false, introuvables: ["studio.retire", "type:spline"] });
    expect(outilsDuDocument(applyStudioCommands(newStudioDocument("x"), [rect("R", 0)])).outils).toEqual(["studio.dessin.rectangle"]);
  });
});
