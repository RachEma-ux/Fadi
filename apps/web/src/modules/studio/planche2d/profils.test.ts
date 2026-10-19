import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import { CATALOGUE, rechercher, separerFavoris } from "./catalogue";
import { GestionnaireOutils, PaletteCommandes } from "./CatalogueOutils";
import {
  basculerFavori, basculerPersonnel, CHOIX_PROFILS, choisirProfil, favorisOrdonnes, filtreBarres, normaliserPreferences, OUTIL_TOUJOURS_VISIBLE,
  outilsDuProfil, PREFERENCES_DEFAUT, PROFILS_METIER, visibleDansBarres, type PreferencesOutils,
} from "./profils";
import { TABLE_CLAVIER } from "./raccourcis";

const IDS = STUDIO_TOOLS.map((t) => t.toolId);
const prefs = (p: Partial<PreferencesOutils>): PreferencesOutils => ({ ...PREFERENCES_DEFAUT, ...p });

describe("profils d'outils : visibilité dans les barres seulement", () => {
  it("Standard montre tout le registre", () => {
    expect(outilsDuProfil(PREFERENCES_DEFAUT)).toBeNull();
    for (const id of IDS) expect(visibleDansBarres(PREFERENCES_DEFAUT, id)).toBe(true);
  });

  it("chaque profil Métier est une liste d'identifiants du registre, Sélection comprise ; il filtre les barres", () => {
    expect(PROFILS_METIER.map((p) => p.libelleFR)).toEqual(["Esquisse 2D", "Cotation", "Volume"]);
    for (const p of PROFILS_METIER) {
      for (const id of p.outils) expect(IDS).toContain(id);
      const v = filtreBarres(prefs({ profil: `metier:${p.id}` }));
      expect(IDS.filter(v).sort()).toEqual([...new Set([OUTIL_TOUJOURS_VISIBLE, ...p.outils])].sort());
    }
    const cotation = prefs({ profil: "metier:cotation" });
    expect(visibleDansBarres(cotation, "studio.dessin.cote")).toBe(true);
    expect(visibleDansBarres(cotation, "studio.objet.extruder")).toBe(false);
  });

  it("Personnel montre la liste du compte, et toujours la Sélection", () => {
    const p = prefs({ profil: "personnel", personnel: ["studio.dessin.ligne"] });
    expect(IDS.filter(filtreBarres(p))).toEqual([OUTIL_TOUJOURS_VISIBLE, "studio.dessin.ligne"]);
    expect(basculerPersonnel(p, OUTIL_TOUJOURS_VISIBLE)).toBe(p);
    expect(basculerPersonnel(p, "studio.dessin.ligne").personnel).toEqual([]);
    expect(basculerPersonnel(p, "studio.dessin.arc").personnel).toEqual(["studio.dessin.ligne", "studio.dessin.arc"]);
  });

  it("passer à Personnel sans liste part des outils que le profil montrait (rien ne disparaît par surprise)", () => {
    const depuisVolume = choisirProfil(prefs({ profil: "metier:volume" }), "personnel");
    expect(IDS.filter(filtreBarres(depuisVolume)).sort()).toEqual(IDS.filter(filtreBarres(prefs({ profil: "metier:volume" }))).sort());
    expect(choisirProfil(prefs({}), "personnel").personnel).toHaveLength(IDS.length - 1);
    expect(choisirProfil(prefs({ personnel: ["studio.dessin.arc"] }), "personnel").personnel).toEqual(["studio.dessin.arc"]);
  });

  it("une commande de l'éditeur (hors registre) n'est jamais filtrée", () => {
    expect(visibleDansBarres(prefs({ profil: "personnel" }), "enregistrer")).toBe(true);
    expect(filtreBarres(prefs({ profil: "metier:cotation" }))("palette")).toBe(true);
  });

  it("aucun profil ne retire une entrée du catalogue, de la recherche ni du clavier", () => {
    const avant = { catalogue: CATALOGUE.length, recherche: rechercher("").length, clavier: TABLE_CLAVIER.size };
    for (const c of CHOIX_PROFILS) filtreBarres(prefs({ profil: c.id }));
    expect({ catalogue: CATALOGUE.length, recherche: rechercher("").length, clavier: TABLE_CLAVIER.size }).toEqual(avant);
    for (const t of STUDIO_TOOLS) expect(TABLE_CLAVIER.get(t.raccourci)).toEqual({ type: "outil", toolId: t.toolId });
  });

  it("normalise les préférences relues : profil inconnu → standard, identifiants hors registre et doublons écartés", () => {
    expect(normaliserPreferences(null)).toEqual(PREFERENCES_DEFAUT);
    expect(normaliserPreferences({ profil: "metier:inconnu", favoris: ["studio.dessin.arc", "x", "studio.dessin.arc"], personnel: "non" }))
      .toEqual({ profil: "standard", favoris: ["studio.dessin.arc"], personnel: [] });
    expect(normaliserPreferences({ profil: "metier:volume", favoris: [], personnel: [] }).profil).toBe("metier:volume");
  });
});

describe("favoris", () => {
  it("basculer ajoute puis retire ; l'ordre du groupe suit le registre", () => {
    const p = basculerFavori(basculerFavori(PREFERENCES_DEFAUT, "studio.objet.extruder"), "studio.dessin.ligne");
    expect(p.favoris).toEqual(["studio.objet.extruder", "studio.dessin.ligne"]);
    expect(favorisOrdonnes(p)).toEqual(["studio.dessin.ligne", "studio.objet.extruder"]);
    expect(basculerFavori(p, "studio.dessin.ligne").favoris).toEqual(["studio.objet.extruder"]);
  });

  it("le groupe « Favoris » de la palette vient en tête, sans doublon ni retrait", () => {
    const { favoris, autres } = separerFavoris(rechercher(""), ["studio.dessin.cote", "enregistrer"]);
    expect(favoris.map((e) => e.identifiant)).toEqual(["studio.dessin.cote"]);
    expect(favoris.length + autres.length).toBe(CATALOGUE.length);
    expect(autres.some((e) => e.identifiant === "studio.dessin.cote")).toBe(false);
  });

  it("le gestionnaire montre une étoile par outil du registre et dit que les raccourcis restent actifs", () => {
    const html = renderToStaticMarkup(createElement(GestionnaireOutils, { disponible: () => true, surExecuter: () => {}, surFermer: () => {} }));
    for (const id of IDS) expect(html).toContain(`data-studio-favori="${id}"`);
    expect(html).not.toContain('data-studio-favori="enregistrer"');
    expect(html).toContain("Profil des barres d’outils");
    expect(html).toContain("son raccourci clavier fonctionne toujours");
    expect(html).toContain("chaque commande reste vérifiée par le serveur");
  });

  it("la palette sans favori garde une liste simple", () => {
    const html = renderToStaticMarkup(createElement(PaletteCommandes, { disponible: () => true, surExecuter: () => {}, surFermer: () => {} }));
    expect(html).not.toContain("data-studio-palette-groupe");
  });
});
