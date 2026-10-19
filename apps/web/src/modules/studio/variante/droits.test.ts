import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newStudioDocument, STUDIO_TOOLS } from "@parcours/atelier-model";
import { CATALOGUE, filtrerCatalogue, MANIFESTE_COMMANDES, type EntreeCatalogue } from "../planche2d/catalogue";
import { BarreOutils } from "../planche2d/BarreOutils";
import { GestionnaireOutils, PaletteCommandes } from "../planche2d/CatalogueOutils";
import {
  basculerDansGroupe, basculerFavori, basculerPersonnel, CHOIX_PROFILS, choisirProfil, creerGroupe, filtreBarres, PREFERENCES_DEFAUT, type PreferencesOutils,
} from "../planche2d/profils";
import { COMMANDES_EDITEUR } from "../planche2d/raccourcis";
import { commandeDisponible, outilDisponible } from "./disponibilite";
import { autoriseParDroit, estRefusDeDroit, LIBELLES_RAISON, raisonEntree, type EtatDroit } from "./droits";

const LECTEUR: EtatDroit = { canWrite: false, historique: false, motif: "role", suspendue: false };
const EDITEUR: EtatDroit = { canWrite: true, historique: false, motif: null, suspendue: false };

describe("visibilité, disponibilité et droit réel séparés (B.2-06)", () => {
  it("une lecture est toujours permise ; une écriture seulement avec le droit du serveur, hors révision historique", () => {
    expect(autoriseParDroit("lecture", LECTEUR)).toBe(true);
    expect(autoriseParDroit("ecriture", LECTEUR)).toBe(false);
    expect(autoriseParDroit("ecriture", EDITEUR)).toBe(true);
    expect(autoriseParDroit("ecriture", { ...EDITEUR, historique: true })).toBe(false);
    expect(autoriseParDroit("ecriture", { ...EDITEUR, canWrite: null })).toBe(false);
  });

  it("la raison nomme le refus réel : rôle, référence protégée, verrou, variante archivée, révision historique", () => {
    expect(raisonEntree("ecriture", false, LECTEUR)).toBe("droit-role");
    expect(raisonEntree("ecriture", false, { ...LECTEUR, motif: "reference-protegee" })).toBe("droit-reference");
    expect(raisonEntree("ecriture", false, { ...LECTEUR, motif: "verrou" })).toBe("droit-verrou");
    expect(raisonEntree("ecriture", false, { ...LECTEUR, motif: null })).toBe("droit-variante");
    const { motif: _m, ...sansMotif } = LECTEUR;
    expect(raisonEntree("ecriture", false, sansMotif)).toBe("droit");
    expect(raisonEntree("ecriture", false, { ...EDITEUR, historique: true })).toBe("historique");
    expect(raisonEntree("ecriture", false, { ...EDITEUR, suspendue: true })).toBe("enregistrement");
    expect(raisonEntree("ecriture", false, EDITEUR)).toBe("contexte");
    expect(raisonEntree("ecriture", true, EDITEUR)).toBeNull();
    expect(raisonEntree("lecture", true, LECTEUR)).toBeNull();
    expect(raisonEntree("lecture", false, LECTEUR)).toBe("contexte");
    for (const r of ["droit-role", "droit", "historique"] as const) expect(estRefusDeDroit(r)).toBe(true);
    for (const r of ["contexte", "enregistrement", null] as const) expect(estRefusDeDroit(r)).toBe(false);
  });

  it("un outil visible mais non autorisé reste dans la barre, désactivé, avec sa raison dans l'infobulle", () => {
    const prefs: PreferencesOutils = { ...PREFERENCES_DEFAUT, profil: "metier:cotation" };
    expect(filtreBarres(prefs)("studio.dessin.cote")).toBe(true);
    const html = renderToStaticMarkup(createElement(BarreOutils, {
      outil: "studio.dessin.selection", outilDisponible: (t) => t.nature === "lecture", commandeDisponible: (c) => !c.ecrit,
      raison: (c) => raisonEntree(c.type === "outil" ? (STUDIO_TOOLS.find((t) => t.toolId === c.toolId)!.nature === "mutation" ? "ecriture" : "lecture") : "lecture", c.type !== "outil" || STUDIO_TOOLS.find((t) => t.toolId === c.toolId)!.nature === "lecture", LECTEUR),
      surOutil: () => {}, surCommande: () => {},
    }));
    const ligne = /<button[^>]*data-studio-outil="studio\.dessin\.ligne"[^>]*>/.exec(html)?.[0] ?? "";
    expect(ligne).toContain('disabled=""');
    expect(ligne).toContain('data-studio-raison="droit-role"');
    expect(ligne).toContain(`title="Ligne — L — ${LIBELLES_RAISON["droit-role"]}"`);
    const selection = /<button[^>]*data-studio-outil="studio\.dessin\.selection"[^>]*>/.exec(html)?.[0] ?? "";
    expect(selection).not.toContain("disabled");
    expect(selection).not.toContain("data-studio-raison");
  });

  it("le gestionnaire et la palette affichent la raison ; « Autorisés pour moi » écarte les seuls refus de droit", () => {
    const raison = (e: EntreeCatalogue) => raisonEntree(e.droit, e.droit === "lecture", LECTEUR);
    const html = renderToStaticMarkup(createElement(GestionnaireOutils, { disponible: (e) => e.droit === "lecture", raison, surExecuter: () => {}, surFermer: () => {} }));
    expect(html).toMatch(/data-studio-catalogue-entree="studio\.dessin\.ligne" data-studio-disponible="non" data-studio-autorise="non" data-studio-raison="droit-role"/);
    expect(html).toMatch(/data-studio-catalogue-entree="studio\.dessin\.selection" data-studio-disponible="oui" data-studio-autorise="oui"/);
    expect(html).toContain(LIBELLES_RAISON["droit-role"]);
    const palette = renderToStaticMarkup(createElement(PaletteCommandes, { disponible: (e) => e.droit === "lecture", raison, surExecuter: () => {}, surFermer: () => {} }));
    expect(palette).toMatch(/data-studio-palette-entree="studio\.dessin\.ligne" data-studio-disponible="non" data-studio-raison="droit-role"/);
    const autorises = filtrerCatalogue(CATALOGUE, { executables: true }, { favoris: [], groupes: [], autorise: (e) => !estRefusDeDroit(raison(e)) });
    expect(autorises.every((e) => e.droit === "lecture")).toBe(true);
    expect(autorises.map((e) => e.identifiant)).toContain("studio.dessin.selection");
  });
});

describe("un changement de profil ne modifie ni géométrie, ni révision, ni droits (B.2-07)", () => {
  const doc = newStudioDocument("doc-b207");
  const gele = JSON.stringify(doc);
  const etats = [
    PREFERENCES_DEFAUT,
    ...CHOIX_PROFILS.map((c) => choisirProfil(PREFERENCES_DEFAUT, c.id)),
    basculerPersonnel(choisirProfil(PREFERENCES_DEFAUT, "personnel"), "studio.dessin.ligne"),
    basculerFavori(PREFERENCES_DEFAUT, "studio.dessin.cote"),
    basculerDansGroupe(creerGroupe(PREFERENCES_DEFAUT, "Plans"), "plans", "studio.dessin.ligne"),
  ];

  it("disponibilité, droit et raison de chaque entrée sont identiques quel que soit le profil", () => {
    const verdicts = (prefs: PreferencesOutils) => {
      void filtreBarres(prefs);
      return CATALOGUE.map((e) => {
        const dispo = e.outil
          ? outilDisponible(e.outil, { writable: false, selectionIds: [], formesChoisies: [] })
          : commandeDisponible(e.commande!, { writable: false, brouillon: null, drawing: doc, trace: null, suite: [], selectionIds: [], tool: "studio.dessin.selection", canSave: false, largeurVue: 20 });
        return [e.identifiant, dispo, autoriseParDroit(e.droit, LECTEUR), raisonEntree(e.droit, dispo, LECTEUR)];
      });
    };
    const reference = JSON.stringify(verdicts(PREFERENCES_DEFAUT));
    for (const p of etats) expect(JSON.stringify(verdicts(p))).toBe(reference);
  });

  it("les opérations de profil ne lisent ni n'écrivent le document : il reste octet pour octet identique", () => {
    for (const p of etats) {
      expect(Object.keys(p).sort()).toEqual(["favoris", "groupes", "personnel", "profil"]);
      expect(JSON.stringify(p)).not.toContain("revision");
    }
    expect(JSON.stringify(doc)).toBe(gele);
  });
});

describe("manifeste des commandes de l'éditeur (B.1-03)", () => {
  it("chaque commande a des contextes connus ; une commande d'écriture requiert le droit d'écriture", () => {
    for (const c of COMMANDES_EDITEUR) {
      expect(MANIFESTE_COMMANDES[c.id].length, c.id).toBeGreaterThan(0);
      const e = CATALOGUE.find((x) => x.identifiant === c.id)!;
      expect(e.droit).toBe(c.ecrit ? "ecriture" : "lecture");
      expect(e.proprietaire).toBe("studio.editeur");
    }
    expect(CATALOGUE.find((e) => e.identifiant === "feuille")!.contextes).toEqual(["feuille"]);
    expect(CATALOGUE.find((e) => e.identifiant === "studio.solide.boite")!).toMatchObject({ contextes: ["vue-3d"], droit: "ecriture", proprietaire: "studio.objets-3d" });
  });
});
