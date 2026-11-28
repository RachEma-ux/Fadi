/** Outil interactif d'une extension (lot 6) : machine adaptatrice, description relue, clés et curseurs. */
import { describe, expect, it } from "vitest";
import { ajouterRectangle, modeleVide } from "../geometrie-libre.js";
import { v3 } from "../vecteur.js";
import { validerPaquetExtension } from "../protocole-extensions.js";
import { clic, echap, partie, saisie, survol, touche } from "./essais-formes.js";
import { machineParId } from "./index.js";
import {
  BORNES_OUTIL, DESCRIPTION_OUTIL_VIDE, MACHINE_OUTIL_EXTENSION, avecDescription, cleOutilExtension, lireCleOutilExtension, lireDescriptionOutil, nomAppelOutil, pointVise,
  type DescriptionOutil, type EtatOutilExtension,
} from "./outil-extension.js";

const sol = () => ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 2, 0)).modele;
const lue = (v: unknown): DescriptionOutil => {
  const r = lireDescriptionOutil(v);
  if (!r.ok || !r.description) throw new Error(r.ok ? "vide" : r.detail);
  return r.description;
};

describe("clé et machine d'un outil d'extension", () => {
  it("la clé nomme l'extension et l'outil ; toute clé d'extension mène à la même machine", () => {
    expect(cleOutilExtension("essai-outil", "trait")).toBe("extension:essai-outil:trait");
    expect(lireCleOutilExtension("extension:essai-outil:trait")).toEqual({ extension: "essai-outil", outil: "trait" });
    expect(lireCleOutilExtension("ligne")).toBeNull();
    expect(lireCleOutilExtension("extension:essai-outil")).toBeNull();
    expect(machineParId("extension:essai-outil:trait")).toBe(MACHINE_OUTIL_EXTENSION);
    expect(machineParId("ligne")).not.toBe(MACHINE_OUTIL_EXTENSION);
    expect(nomAppelOutil("trait", "double-clic")).toBe("outil.trait.double-clic");
  });
});

describe("événements préparés pour l'extension", () => {
  it("un déplacement porte le point accroché, sa nature et l'objet touché — sans rien changer au dessin", () => {
    const p = partie(MACHINE_OUTIL_EXTENSION, sol()).jouer(survol(0, 0));
    const e = p.etat as EtatOutilExtension;
    expect(e.emis).toMatchObject({ n: 1, nom: "deplacement", donnees: { point: [0, 0, 0], nature: "sommet", appuye: false } });
    expect(typeof e.emis!.donnees["objet"] === "string" || e.emis!.donnees["objet"] === null).toBe(true);
    expect(p.historique).toHaveLength(1);
    const milieu = partie(MACHINE_OUTIL_EXTENSION, sol()).jouer(survol(2, 0)).etat as EtatOutilExtension;
    expect(milieu.emis!.donnees).toMatchObject({ point: [2, 0, 0], nature: "milieu" });
    const face = partie(MACHINE_OUTIL_EXTENSION, sol()).jouer(survol(1.3, 0.7)).etat as EtatOutilExtension;
    expect(face.emis!.donnees).toMatchObject({ nature: "face" });
    const vide = partie(MACHINE_OUTIL_EXTENSION, sol()).jouer(survol(9, 9)).etat as EtatOutilExtension;
    expect(vide.emis!.donnees).toMatchObject({ nature: "libre", objet: null });
  });

  it("(1.3) un événement de souris porte aussi le point visé, avant accrochage, sur le plan de travail", () => {
    const e = partie(MACHINE_OUTIL_EXTENSION, sol()).jouer(survol(0.004, 0.003)).etat as EtatOutilExtension;
    expect(e.emis!.donnees).toMatchObject({ point: [0, 0, 0], nature: "sommet" });
    const v = e.emis!.donnees["vise"] as number[];
    expect(v[0]).toBeCloseTo(0.004, 9);
    expect(v[1]).toBeCloseTo(0.003, 9);
    expect(v[2]).toBeCloseTo(0, 9);
    const c = partie(MACHINE_OUTIL_EXTENSION, sol()).jouer(clic(9, 9)).etat as EtatOutilExtension;
    expect((c.emis!.donnees["vise"] as number[]).map((x) => Math.round(x * 1e6) / 1e6)).toEqual([9, 9, 0]);
    expect(pointVise({ origine: v3(0, 0, 5), direction: v3(1, 0, 0) }, undefined)).toBeNull();
    expect(pointVise({ origine: v3(0, 0, 5), direction: v3(0, 0, 1) }, undefined)).toBeNull();
    expect(pointVise({ origine: v3(1, 2, 5), direction: v3(0, 0, -1) }, { origine: v3(0, 0, 3), normale: v3(0, 0, 1) })).toEqual([1, 2, 3]);
  });

  it("clic, double clic, touche, validation, saisie et annulation ont chacun leur événement, numéroté", () => {
    const p = partie(MACHINE_OUTIL_EXTENSION, sol(), ",");
    const noms: string[] = [];
    for (const ev of [clic(1, 1), clic(1, 1, true), touche("Ctrl"), touche("Entree"), touche("Entree", "relachee"), saisie("2,5"), saisie("abc"), echap]) {
      const avant = (p.etat as EtatOutilExtension).emis;
      p.jouer(ev);
      const e = (p.etat as EtatOutilExtension).emis;
      if (e !== avant) noms.push(`${e!.n}:${e!.nom}`);
    }
    expect(noms).toEqual(["1:clic", "2:double-clic", "3:touche", "4:validation", "5:saisie", "6:saisie", "7:annulation"]);
    const q = partie(MACHINE_OUTIL_EXTENSION, sol(), ",").jouer(saisie("2,5"));
    expect((q.etat as EtatOutilExtension).emis!.donnees).toEqual({ texte: "2,5", longueur: 2.5 });
    expect((q.jouer(saisie("abc")).etat as EtatOutilExtension).emis!.donnees).toEqual({ texte: "abc", longueur: null });
  });

  it("le point de référence rendu par l'outil sert de départ à l'accrochage (axes)", () => {
    const p = partie(MACHINE_OUTIL_EXTENSION, modeleVide());
    p.etat = avecDescription(p.etat as EtatOutilExtension, lue({ reference: [1, 1, 0] }));
    p.jouer(survol(3, 1.001));
    expect((p.etat as EtatOutilExtension).emis!.donnees).toMatchObject({ nature: "axe", point: [3, 1, 0] });
  });
});

describe("description rendue par l'outil", () => {
  it("elle devient ce que la Planche dessine : aperçu, barre d'état, zone de saisie", () => {
    const d = lue({
      apercu: { segments: [[[0, 0, 0], [1, 0, 0]]], pointilles: [[[0, 0, 0], [0, 1, 0]]], points: [[0, 0, 0]], contours: [[[0, 0, 0], [1, 0, 0], [1, 1, 0]]], textes: [{ point: [0.5, 0, 0], texte: "1,00 m" }] },
      etat: "Cliquez le point d'arrivée.",
      saisie: { libelle: "Longueur", valeur: "1,00 m" },
      curseur: "cible",
    });
    const p = partie(MACHINE_OUTIL_EXTENSION, modeleVide());
    p.etat = avecDescription(p.etat as EtatOutilExtension, d);
    const v = p.vue();
    expect(v.consigne).toBe("Cliquez le point d'arrivée.");
    expect(v.mesures).toMatchObject({ libelle: "Longueur", valeur: "1,00 m" });
    expect(v.apercu.lignes).toHaveLength(2);
    // Un contour est refermé.
    expect(v.apercu.lignes[1]).toHaveLength(4);
    expect(v.apercu.pointilles).toHaveLength(1);
    expect(v.apercu.points).toEqual([v3(0, 0, 0)]);
    expect(v.apercu.etiquettes).toEqual([{ point: v3(0.5, 0, 0), texte: "1,00 m" }]);
    expect(v.apercu.faces).toEqual([]);
  });

  it("rien = la description précédente reste ; une description vide efface l'aperçu", () => {
    expect(lireDescriptionOutil(null)).toEqual({ ok: true, description: null });
    expect(lireDescriptionOutil(undefined)).toEqual({ ok: true, description: null });
    const e: EtatOutilExtension = { inference: null, description: lue({ etat: "a" }), emis: null };
    expect(avecDescription(e, null)).toBe(e);
    expect(lue({})).toEqual(DESCRIPTION_OUTIL_VIDE);
  });

  it("forme et bornes : tout écart refuse la description entière", () => {
    const refus = (v: unknown) => {
      const r = lireDescriptionOutil(v);
      return r.ok ? "accepté" : r.detail;
    };
    expect(refus("texte")).toMatch(/objet attendu/);
    expect(refus({ dessin: 1 })).toMatch(/champ inconnu « dessin »/);
    expect(refus({ apercu: { cercles: [] } })).toMatch(/champ inconnu « cercles »/);
    expect(refus({ apercu: { segments: [[[0, 0, 0]]] } })).toMatch(/segments/);
    expect(refus({ apercu: { segments: [[[0, 0, 0], [0, 0, Number.NaN]]] } })).toMatch(/segments/);
    expect(refus({ apercu: { points: [[0, 0, BORNES_OUTIL.coordonnee * 2]] } })).toMatch(/points/);
    expect(refus({ apercu: { segments: Array.from({ length: BORNES_OUTIL.segments + 1 }, () => [[0, 0, 0], [1, 0, 0]]) } })).toMatch(/segments/);
    expect(refus({ apercu: { textes: [{ point: [0, 0, 0], texte: "x".repeat(BORNES_OUTIL.texte + 1) }] } })).toMatch(/textes/);
    expect(refus({ apercu: { contours: [[[0, 0, 0]]] } })).toMatch(/contours/);
    expect(refus({ etat: "x".repeat(BORNES_OUTIL.etat + 1) })).toMatch(/etat/);
    expect(refus({ saisie: { libelle: "" } })).toMatch(/saisie/);
    expect(refus({ curseur: "url(https://exemple.test/c.png)" })).toMatch(/curseur/);
    expect(refus({ reference: [0, 0] })).toMatch(/reference/);
    expect(refus({ saisie: { libelle: "Longueur" } })).toBe("accepté");
  });
});

describe("fiche : curseur d'un outil", () => {
  const ICONE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';
  const paquet = (outil: Record<string, unknown>, commande: Record<string, unknown> = {}) => ({
    format: "fadi-addon/1",
    fiche: {
      id: "essai", nom: { fr: "Essai", en: "Trial" }, description: { fr: "Essai.", en: "Trial." }, version: "1.0.0", auteur: "Fadi", protocole: "1.0", permissions: ["outil"],
      commandes: [{ id: "c", libelle: { fr: "C", en: "C" }, icone: "c.svg", raccourci: "Ctrl+Alt+C", ...commande }],
      outils: [{ id: "trait", libelle: { fr: "Trait", en: "Line" }, icone: "trait.svg", raccourci: "Ctrl+Alt+T", ...outil }],
      panneaux: [], abonnements: [],
    },
    code: "planche.afficher(1);",
    pages: { "c.svg": ICONE, "trait.svg": ICONE },
  });
  it("facultatif, pris dans la liste fermée, réservé aux outils", () => {
    const sans = validerPaquetExtension(paquet({}));
    expect(sans.ok ? "" : sans.detail).toBe("");
    expect(sans.ok && sans.paquet.fiche.outils[0]!.curseur).toBeUndefined();
    const avec = validerPaquetExtension(paquet({ curseur: "cible" }));
    expect(avec.ok && avec.paquet.fiche.outils[0]!.curseur).toBe("cible");
    expect(validerPaquetExtension(paquet({ curseur: "url(x)" }))).toMatchObject({ ok: false, detail: expect.stringMatching(/curseur inconnu/) });
    expect(validerPaquetExtension(paquet({}, { curseur: "cible" }))).toMatchObject({ ok: false, detail: expect.stringMatching(/champ inconnu « curseur »/) });
  });
});
