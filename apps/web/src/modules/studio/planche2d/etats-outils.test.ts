/**
 * TR-EX-029 / EX-029 — recherche par nom, synonymes, famille, domaine, contexte et identifiant, sans lancer le moteur ;
 * pour chaque outil, l'un des huit états : découvert, non disponible, incompatible, interdit, non installé hors ligne,
 * en chargement, prêt, erreur.
 */
import { describe, expect, it, vi } from "vitest";
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import { GestionnaireRessources, type EtatMoteur } from "../chargement/gestionnaire-ressources";
import { CATALOGUE, filtrerCatalogue, rechercher } from "./catalogue";
import { etatOutilCatalogue, LIBELLES_ETAT_OUTIL, SYNONYMES } from "./etats-outils";

const entree = (id: string) => CATALOGUE.find((e) => e.identifiant === id)!;
const premiers = (q: string, n = 3) => rechercher(q).slice(0, n).map((e) => e.identifiant);
const moteur = (id: EtatMoteur["id"], phase: EtatMoteur["phase"], extra: Partial<EtatMoteur> = {}): EtatMoteur =>
  ({ id, phase, telecharge: null, initialise: phase === "initialise", actif: false, horsConnexion: null, usages: [], initialisations: 0, liberations: 0, erreur: null, ...extra });
const prets = [moteur("coquille-studio", "initialise"), moteur("planche-2d", "initialise"), moteur("calcul", "non-charge")];

describe("TR-EX-029 — recherche par synonyme, famille, domaine, contexte et identifiant", () => {
  it("synonyme : « miroir » trouve la Symétrie, « cloison » le Mur, « cube » la Boîte, « offset » le Décalage", () => {
    expect(premiers("miroir", 1)).toEqual(["studio.dessin.symetrie"]);
    expect(premiers("cloison", 1)).toEqual(["studio.architecture.mur"]);
    expect(premiers("cube", 1)).toEqual(["studio.solide.boite"]);
    expect(premiers("offset", 1)).toEqual(["studio.dessin.decaler"]);
    for (const id of Object.keys(SYNONYMES)) expect(CATALOGUE.some((e) => e.identifiant === id), id).toBe(true);
  });

  it("famille (barre) et domaine : « architecture » et « bâtiment » trouvent les outils d'architecture ; « 3D » les volumes", () => {
    const archi = rechercher("bâtiment").map((e) => e.identifiant);
    expect(archi).toEqual(expect.arrayContaining(["studio.architecture.mur", "studio.architecture.ouverture"]));
    expect(rechercher("3D").map((e) => e.identifiant)).toEqual(expect.arrayContaining(["studio.solide.boite", "studio.objet.extruder"]));
    // Nom, identifiant et contexte (filtre) restent couverts.
    expect(premiers("Ligne", 1)).toEqual(["studio.dessin.ligne"]);
    expect(premiers("studio.solide.booleen", 1)).toEqual(["studio.solide.booleen"]);
    expect(filtrerCatalogue(rechercher("solide"), { contexte: "vue-3d" }, { favoris: [], groupes: [], autorise: () => true }).every((e) => e.contextes.includes("vue-3d"))).toBe(true);
  });

  it("la recherche ne lance aucun moteur : aucun chargeur appelé, aucun état de moteur changé", () => {
    const charger = vi.fn(async () => ({}));
    const g = new GestionnaireRessources({ chargeurs: { "rendu-3d": { charger }, "noyau-exact": { charger }, "planche-2d": { charger } } });
    const avant = g.instantaneEtats();
    for (const q of ["booléen", "union", "cube", "3D", "architecture", "studio.solide"]) rechercher(q);
    expect(charger).not.toHaveBeenCalled();
    expect(g.instantaneEtats()).toBe(avant);
  });
});

describe("TR-EX-029 — huit états affichés par outil", () => {
  it("chaque état est atteint, avec son libellé ; un échec de chargeur, un refus ou le hors-ligne gardent l'outil découvrable avec son état exact", () => {
    const B = entree("studio.solide.booleen"), L = entree("studio.dessin.ligne");
    const avec = (m: EtatMoteur[]) => [...prets, moteur("rendu-3d", "initialise"), ...m];
    expect(etatOutilCatalogue(L, { raison: null, moteurs: prets, enLigne: true })).toBe("pret");
    expect(etatOutilCatalogue(B, { raison: null, moteurs: avec([moteur("noyau-exact", "non-charge")]), enLigne: true })).toBe("decouvert");
    expect(etatOutilCatalogue(B, { raison: null, moteurs: avec([moteur("noyau-exact", "chargement")]), enLigne: true })).toBe("en-chargement");
    expect(etatOutilCatalogue(B, { raison: null, moteurs: avec([moteur("noyau-exact", "echec", { erreur: "echec-noyau" })]), enLigne: true })).toBe("erreur");
    expect(etatOutilCatalogue(B, { raison: null, moteurs: avec([moteur("noyau-exact", "non-charge", { horsConnexion: false })]), enLigne: false })).toBe("non-installe-hors-ligne");
    expect(etatOutilCatalogue(B, { raison: null, moteurs: avec([moteur("noyau-exact", "non-charge", { horsConnexion: true })]), enLigne: false })).toBe("decouvert");
    expect(etatOutilCatalogue(L, { raison: "droit-role", moteurs: prets, enLigne: true })).toBe("interdit");
    expect(etatOutilCatalogue(L, { raison: "contexte", moteurs: prets, enLigne: true })).toBe("non-disponible");
    expect(etatOutilCatalogue(B, { raison: null, contexte: "planche-2d", moteurs: prets, enLigne: true })).toBe("incompatible");
    expect(etatOutilCatalogue({ ...L, barre: "inconnue" as never }, { raison: null, moteurs: prets, enLigne: true })).toBe("incompatible");
    expect(Object.keys(LIBELLES_ETAT_OUTIL).sort()).toEqual(["decouvert", "en-chargement", "erreur", "incompatible", "interdit", "non-disponible", "non-installe-hors-ligne", "pret"]);
    // Toujours découvrable : un outil en erreur ou interdit reste trouvé par la recherche.
    expect(rechercher("union").map((e) => e.identifiant)).toContain("studio.solide.booleen");
    expect(STUDIO_TOOLS.every((t) => etatOutilCatalogue(entree(t.toolId), { raison: null, moteurs: [], enLigne: true }) !== undefined)).toBe(true);
  });
});
