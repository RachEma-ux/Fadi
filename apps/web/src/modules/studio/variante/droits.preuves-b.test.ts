/**
 * B.2-06, troisième axe : la **disponibilité dans le contexte** (sélection, formes choisies, document) est distincte du
 * droit réel et de la visibilité. Un outil autorisé par le serveur (éditeur) et visible dans la barre peut être
 * indisponible ici et maintenant ; il redevient disponible quand le contexte change, sans que le droit ni la visibilité
 * ne bougent. Inversement, un contexte favorable ne donne aucun droit au lecteur.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyStudioCommands, newStudioDocument, STUDIO_TOOLS, type StudioShape } from "@parcours/atelier-model";
import { CATALOGUE, filtrerCatalogue, type EntreeCatalogue } from "../planche2d/catalogue";
import { GestionnaireOutils } from "../planche2d/CatalogueOutils";
import { choisirProfil, filtreBarres, PREFERENCES_DEFAUT } from "../planche2d/profils";
import { COMMANDES_EDITEUR } from "../planche2d/raccourcis";
import { commandeDisponible, outilDisponible, type EtatOutils } from "./disponibilite";
import { autoriseParDroit, estRefusDeDroit, raisonEntree, type EtatDroit } from "./droits";

const EDITEUR: EtatDroit = { canWrite: true, historique: false, motif: null, suspendue: false };
const LECTEUR: EtatDroit = { canWrite: false, historique: false, motif: "role", suspendue: false };
const outil = (id: string) => STUDIO_TOOLS.find((t) => t.toolId === id)!;
const entree = (id: string) => CATALOGUE.find((e) => e.identifiant === id)!;
const rect: StudioShape = { id: "r1", type: "rectangle", origin: { x: 0, y: 0 }, width: 2, height: 1 };

/** Les trois axes d'un outil du registre, pour un état de contexte et un état de droit donnés. */
function axes(id: string, contexte: EtatOutils, droit: EtatDroit, prefs = PREFERENCES_DEFAUT) {
  const e = entree(id);
  const disponible = outilDisponible(outil(id), { ...contexte, writable: autoriseParDroit(e.droit, droit) });
  return { visible: filtreBarres(prefs)(id as never), disponible, autorise: autoriseParDroit(e.droit, droit), raison: raisonEntree(e.droit, disponible, droit) };
}

describe("B.2-06 — disponibilité dans le contexte, distincte du droit réel et de la visibilité", () => {
  const vide: EtatOutils = { writable: true, selectionIds: [], formesChoisies: [] };
  const selection: EtatOutils = { writable: true, selectionIds: ["r1"], formesChoisies: [rect] };

  it("éditeur autorisé et outil visible : Supprimer et Extruder indisponibles sans sélection (raison « contexte »), disponibles avec", () => {
    for (const id of ["studio.dessin.supprimer", "studio.objet.extruder"]) {
      const sans = axes(id, vide, EDITEUR);
      expect(sans, id).toEqual({ visible: true, disponible: false, autorise: true, raison: "contexte" });
      expect(estRefusDeDroit(sans.raison)).toBe(false);
      expect(axes(id, selection, EDITEUR), id).toEqual({ visible: true, disponible: true, autorise: true, raison: null });
    }
  });

  it("un contexte favorable ne donne aucun droit : lecteur avec sélection → refus de droit, pas « contexte »", () => {
    expect(axes("studio.dessin.supprimer", selection, LECTEUR)).toEqual({ visible: true, disponible: false, autorise: false, raison: "droit-role" });
  });

  it("masquer Extruder des barres (profil métier Cotation) ne change ni sa disponibilité ni son droit, dans chaque contexte", () => {
    const cotation = choisirProfil(PREFERENCES_DEFAUT, "metier:cotation");
    expect(filtreBarres(cotation)("studio.objet.extruder")).toBe(false);
    for (const ctx of [vide, selection]) {
      for (const droit of [EDITEUR, LECTEUR]) {
        const { visible: _v, ...standard } = axes("studio.objet.extruder", ctx, droit);
        const { visible, ...masque } = axes("studio.objet.extruder", ctx, droit, cotation);
        expect(visible).toBe(false);
        expect(masque).toEqual(standard);
      }
    }
  });

  it("commande de l'éditeur « Tout sélectionner » : indisponible sur un document vide, disponible avec un objet, droit inchangé", () => {
    const c = COMMANDES_EDITEUR.find((x) => x.id === "tout-selectionner")!;
    const etat = (drawing: ReturnType<typeof newStudioDocument>) => ({ writable: true, brouillon: null, drawing, trace: null, suite: [], selectionIds: [], tool: "studio.dessin.selection" as const, canSave: false, largeurVue: 20 });
    const docVide = newStudioDocument("b206");
    const docPlein = applyStudioCommands(docVide, [{ toolId: "studio.dessin.rectangle", params: rect }]);
    const e = entree("tout-selectionner");
    expect(commandeDisponible(c, etat(docVide))).toBe(false);
    expect(raisonEntree(e.droit, false, EDITEUR)).toBe("contexte");
    expect(commandeDisponible(c, etat(docPlein))).toBe(true);
    expect(raisonEntree(e.droit, true, EDITEUR)).toBeNull();
    expect(autoriseParDroit(e.droit, EDITEUR)).toBe(autoriseParDroit(e.droit, LECTEUR));
  });

  it("gestionnaire : Supprimer de l'éditeur sans sélection est affiché indisponible (contexte) mais autorisé, et « Autorisés pour moi » le garde", () => {
    const disponible = (e: EntreeCatalogue) => (e.outil ? outilDisponible(e.outil, vide) : true);
    const raison = (e: EntreeCatalogue) => raisonEntree(e.droit, disponible(e), EDITEUR);
    const html = renderToStaticMarkup(createElement(GestionnaireOutils, { disponible, raison, surExecuter: () => {}, surFermer: () => {} }));
    expect(html).toMatch(/data-studio-catalogue-entree="studio\.dessin\.supprimer" data-studio-disponible="non" data-studio-autorise="oui" data-studio-raison="contexte"/);
    expect(html).toMatch(/data-studio-catalogue-entree="studio\.dessin\.ligne" data-studio-disponible="oui" data-studio-autorise="oui"/);
    const autorises = filtrerCatalogue(CATALOGUE, { executables: true }, { favoris: [], groupes: [], autorise: (e) => !estRefusDeDroit(raison(e)) });
    expect(autorises.map((e) => e.identifiant)).toContain("studio.dessin.supprimer");
  });
});
