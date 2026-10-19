import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import { CATALOGUE, filtrerCatalogue, rechercher, separerFavoris } from "./catalogue";
import { creerMagasinPreferences, etatPourCompte, GestionnaireOutils, PaletteCommandes } from "./CatalogueOutils";
import {
  basculerDansGroupe, basculerFavori, basculerPersonnel, CHOIX_PROFILS, choisirProfil, corpsPreferences, creerGroupe, favorisOrdonnes, filtreBarres, LIMITES_GROUPES,
  normaliserPreferences, OUTIL_TOUJOURS_VISIBLE, outilsDuProfil, PREFERENCES_DEFAUT, PROFILS_METIER, refusNomGroupe, supprimerGroupe, visibleDansBarres,
  type PreferencesOutils,
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
      .toEqual({ profil: "standard", favoris: ["studio.dessin.arc"], personnel: [], groupes: [] });
    expect(normaliserPreferences({ profil: "metier:volume", favoris: [], personnel: [] }).profil).toBe("metier:volume");
  });
});

describe("magasin des préférences : rattaché au compte", () => {
  /** API simulée : une réponse différée par compte, résolue à la main. */
  function apiSimulee() {
    const enAttente: { compte: string; resoudre: (v: unknown) => void }[] = [];
    let compteCourant = "";
    const api = {
      studioToolPreferences: () => new Promise<unknown>((resoudre) => { enAttente.push({ compte: compteCourant, resoudre }); }),
      setStudioToolPreferences: (_p: string, corps: unknown) => Promise.resolve(corps),
    };
    return { api, enAttente, connecter: (c: string) => { compteCourant = c; } };
  }
  const attendre = () => new Promise((r) => setTimeout(r, 0));
  const PREFS_A = { profil: "metier:cotation", favoris: ["studio.dessin.cote"], personnel: [] };

  it("un autre compte dans le même onglet ne voit jamais les préférences du précédent", async () => {
    const sim = apiSimulee();
    const m = creerMagasinPreferences(sim.api);
    sim.connecter("a");
    m.charger("a", "p1");
    sim.enAttente.shift()!.resoudre(PREFS_A);
    await attendre();
    expect(m.lire()).toMatchObject({ compte: "a", etat: "pret", prefs: { profil: "metier:cotation", favoris: ["studio.dessin.cote"] } });
    // Vue d'un autre compte avant toute remise à zéro : état vierge, pas celui de « a ».
    expect(etatPourCompte(m.lire(), "b")).toMatchObject({ compte: "b", etat: "initial", prefs: PREFERENCES_DEFAUT });
    // Déconnexion puis connexion de « b » : remise à zéro, puis lecture de ses propres préférences.
    m.adopterCompte(null);
    expect(m.lire()).toMatchObject({ compte: null, etat: "initial", prefs: PREFERENCES_DEFAUT });
    sim.connecter("b");
    m.charger("b", "p1");
    expect(m.lire().prefs).toEqual(PREFERENCES_DEFAUT);
    sim.enAttente.shift()!.resoudre({ profil: "standard", favoris: ["studio.dessin.arc"], personnel: [] });
    await attendre();
    expect(m.lire()).toMatchObject({ compte: "b", etat: "pret", prefs: { profil: "standard", favoris: ["studio.dessin.arc"] } });
  });

  it("une réponse tardive de l'ancien compte est écartée", async () => {
    const sim = apiSimulee();
    const m = creerMagasinPreferences(sim.api);
    sim.connecter("a");
    m.charger("a", "p1");
    const reponseA = sim.enAttente.shift()!;
    sim.connecter("b");
    m.charger("b", "p1");
    reponseA.resoudre(PREFS_A);
    await attendre();
    expect(m.lire()).toMatchObject({ compte: "b", etat: "chargement", prefs: PREFERENCES_DEFAUT });
  });

  it("un enregistrement n'est accepté que pour le compte rattaché", async () => {
    const sim = apiSimulee();
    const m = creerMagasinPreferences(sim.api);
    m.charger("a", "p1");
    sim.enAttente.shift()!.resoudre(PREFS_A);
    await attendre();
    m.enregistrer("b", "p1", (p) => basculerFavori(p, "studio.dessin.ligne"));
    expect(m.lire().prefs.favoris).toEqual(["studio.dessin.cote"]);
    m.enregistrer("a", "p1", (p) => basculerFavori(p, "studio.dessin.ligne"));
    await attendre();
    expect(m.lire()).toMatchObject({ compte: "a", enregistrement: "enregistre", prefs: { favoris: ["studio.dessin.cote", "studio.dessin.ligne"] } });
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

describe("regroupements personnels (B.2-02)", () => {
  it("créer, composer, supprimer ; nom vide, en double ou trop long refusé", () => {
    const a = creerGroupe(PREFERENCES_DEFAUT, "Plans d’étage");
    expect(a.groupes).toEqual([{ id: "plans-d-etage", nom: "Plans d’étage", outils: [] }]);
    expect(refusNomGroupe(a, "plans d’ÉTAGE")).toBe("pris");
    expect(refusNomGroupe(a, "   ")).toBe("vide");
    expect(refusNomGroupe(a, "x".repeat(LIMITES_GROUPES.nom + 1))).toBe("long");
    expect(creerGroupe(a, "")).toBe(a);
    const b = basculerDansGroupe(basculerDansGroupe(a, "plans-d-etage", "studio.architecture.mur"), "plans-d-etage", "studio.dessin.cote");
    expect(b.groupes[0]!.outils).toEqual(["studio.architecture.mur", "studio.dessin.cote"]);
    expect(basculerDansGroupe(b, "plans-d-etage", "studio.dessin.cote").groupes[0]!.outils).toEqual(["studio.architecture.mur"]);
    expect(basculerDansGroupe(b, "inconnu", "studio.dessin.ligne")).toBe(b);
    expect(supprimerGroupe(b, "plans-d-etage").groupes).toEqual([]);
    // Identifiant unique même quand le nom se ramène au même identifiant.
    expect(creerGroupe(a, "Plans d etage!").groupes.map((g) => g.id)).toEqual(["plans-d-etage", "plans-d-etage-2"]);
  });

  it("borne du nombre de regroupements", () => {
    let p: PreferencesOutils = PREFERENCES_DEFAUT;
    for (let i = 0; i < LIMITES_GROUPES.groupes; i += 1) p = creerGroupe(p, `G${i}`);
    expect(p.groupes).toHaveLength(LIMITES_GROUPES.groupes);
    expect(refusNomGroupe(p, "Encore un")).toBe("nombre");
    expect(creerGroupe(p, "Encore un")).toBe(p);
  });

  it("relecture : regroupement mal formé ou en double écarté, outils hors registre écartés ; corps PUT complet", () => {
    const p = normaliserPreferences({ profil: "standard", favoris: [], personnel: [], groupes: [
      { id: "a", nom: " Mes murs ", outils: ["studio.architecture.mur", "x", "studio.architecture.mur"] }, { id: "a", nom: "doublon", outils: [] },
      { id: "MAJ", nom: "id invalide", outils: [] }, { id: "b", nom: "", outils: [] }, "texte",
    ] });
    expect(p.groupes).toEqual([{ id: "a", nom: "Mes murs", outils: ["studio.architecture.mur"] }]);
    expect(corpsPreferences(p)).toEqual({ profil: "standard", favoris: [], personnel: [], groupes: [{ id: "a", nom: "Mes murs", outils: ["studio.architecture.mur"] }] });
  });

  it("un regroupement ne change pas les barres (visibilité réglée par le profil seul)", () => {
    const p = basculerDansGroupe(creerGroupe(PREFERENCES_DEFAUT, "Murs"), "murs", "studio.architecture.mur");
    const avant = filtreBarres(PREFERENCES_DEFAUT), apres = filtreBarres(p);
    for (const id of IDS) expect(apres(id)).toBe(avant(id));
  });

  it("le gestionnaire présente les regroupements, les filtres et le manifeste", () => {
    const html = renderToStaticMarkup(createElement(GestionnaireOutils, { disponible: () => true, surExecuter: () => {}, surFermer: () => {} }));
    expect(html).toContain("data-studio-regroupements");
    expect(html).toContain("Mes regroupements");
    expect(html).toContain('data-studio-manifeste="studio-tool-manifest/1"');
    expect(html).toContain('data-studio-filtre="contexte"');
  });
});

describe("filtres du catalogue (B.2-01)", () => {
  const sources = { favoris: ["studio.dessin.cote", "enregistrer"], groupes: [{ id: "g", outils: ["studio.dessin.arc"] }], autorise: () => true };
  it("par barre, contexte, nature, favoris, regroupement, et combinés", () => {
    expect(filtrerCatalogue(CATALOGUE, { barre: "calques" }, sources).map((e) => e.identifiant)).toEqual(["studio.calque.creer", "studio.calque.modifier", "studio.objet.calque"]);
    const v3d = filtrerCatalogue(CATALOGUE, { contexte: "vue-3d" }, sources).map((e) => e.identifiant);
    expect(v3d).toContain("studio.solide.boite");
    expect(v3d).toContain("exporter-png");
    expect(v3d).not.toContain("studio.dessin.ligne");
    expect(filtrerCatalogue(CATALOGUE, { contexte: "feuille" }, sources).map((e) => e.identifiant)).toEqual(["feuille", "dossier", "outils", "palette"]);
    expect(filtrerCatalogue(CATALOGUE, { nature: "lecture" }, sources).map((e) => e.identifiant)).toEqual(["studio.dessin.selection", "studio.scene.rappeler"]);
    // Favoris : outils du registre seulement.
    expect(filtrerCatalogue(CATALOGUE, { favoris: true }, sources).map((e) => e.identifiant)).toEqual(["studio.dessin.cote"]);
    expect(filtrerCatalogue(CATALOGUE, { groupe: "g" }, sources).map((e) => e.identifiant)).toEqual(["studio.dessin.arc"]);
    expect(filtrerCatalogue(CATALOGUE, { groupe: "absent" }, sources)).toEqual([]);
    expect(filtrerCatalogue(CATALOGUE, { barre: "dessin", contexte: "vue-3d" }, sources).map((e) => e.identifiant)).toEqual(["studio.dessin.selection"]);
    expect(filtrerCatalogue(CATALOGUE, {}, sources)).toHaveLength(CATALOGUE.length);
  });
  it("les filtres s'appliquent après la recherche, sans changer l'ordre", () => {
    const r = filtrerCatalogue(rechercher("supprimer"), { contexte: "vue-3d" }, sources).map((e) => e.identifiant);
    expect(r).toEqual(["studio.solide.supprimer", "studio.scene.supprimer"]);
  });
});
