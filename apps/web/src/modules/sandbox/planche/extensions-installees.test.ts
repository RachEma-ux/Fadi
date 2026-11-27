/** Extensions installées dans la Planche (lot 3) : file des avis, règle d'or des commandes du paquet d'essai. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REGISTRE_SANDBOX, jugerImportPaquet, normaliserRaccourci, type PaquetExtension } from "@parcours/sandbox-planche-model";
import { LIGNES_APERCU_FICHIER, MAX_AVIS_AFFICHES, ajouterAvis, lignesExtensionsAjoutees, apercuFichier, clePanneauExtension, retirerFichier, retirerSaisie, tailleFichier, type AvisAffiche, type FichierDemande, type SaisieOuverte } from "./extensions-installees";
import { idBarreCanonique, normaliserBarres } from "./barres-nommees";

describe("avis des extensions", () => {
  it("les trois derniers avis restent affichés, dans l'ordre", () => {
    let liste: readonly AvisAffiche[] = [];
    for (let cle = 1; cle <= 5; cle++) liste = ajouterAvis(liste, { cle, extension: "Essai", texte: `avis ${cle}`, genre: "info" });
    expect(liste.map((a) => a.cle)).toEqual([3, 4, 5]);
    expect(liste).toHaveLength(MAX_AVIS_AFFICHES);
  });
});

describe("fenêtres de saisie de plusieurs extensions", () => {
  it("elles font la file : la première demandée reste affichée, aucune n'est remplacée ni perdue", () => {
    const saisie = (cle: number): SaisieOuverte => ({ cle, extension: `E${cle}`, demande: { titre: "T", champs: [] }, repondre: () => {} });
    const file = [saisie(1), saisie(2), saisie(3)];
    expect(retirerSaisie(file, 2).map((x) => x.cle)).toEqual([1, 3]);
    expect(retirerSaisie(file, 1)[0]!.cle).toBe(2);
    expect(retirerSaisie(file, 9)).toBe(file);
  });
});

describe("règle d'or — commandes d'une extension installée", () => {
  const essai = JSON.parse(readFileSync(new URL("../../../../e2e/donnees/essai-commandes.fadi-addon.json", import.meta.url), "utf8")) as PaquetExtension;

  it("chaque commande a sa propre icône, et aucun raccourci n'est pris par la Planche", () => {
    expect(jugerImportPaquet(essai).ok).toBe(true);
    const pris = new Set(REGISTRE_SANDBOX.flatMap((e) => (e.raccourci ? [normaliserRaccourci(e.raccourci)] : [])));
    expect(new Set(essai.fiche.commandes.map((c) => c.icone)).size).toBe(essai.fiche.commandes.length);
    for (const c of essai.fiche.commandes) {
      expect(pris.has(normaliserRaccourci(c.raccourci)), c.id).toBe(false);
    }
  });

  it("la barre d'une extension garde son identifiant dans l'état mémorisé des barres", () => {
    expect(idBarreCanonique("extension:essai-commandes")).toBe("extension:essai-commandes");
    const etat = { visibles: ["extension:essai-commandes"], positions: { "extension:essai-commandes": { x: 10, y: 20 } } };
    expect(normaliserBarres(etat)).toBe(etat);
  });
});

describe("fenêtres de fichier des extensions (lot 7)", () => {
  it("l'aperçu montre les premières lignes seulement, et dit qu'il en reste", () => {
    expect(apercuFichier("a\nb")).toBe("a\nb");
    const long = Array.from({ length: LIGNES_APERCU_FICHIER + 3 }, (_, i) => `ligne ${i + 1}`).join("\n");
    const vu = apercuFichier(long).split("\n");
    expect(vu.slice(0, LIGNES_APERCU_FICHIER)).toEqual(long.split("\n").slice(0, LIGNES_APERCU_FICHIER));
    expect(vu).toHaveLength(LIGNES_APERCU_FICHIER + 1);
    expect(vu[LIGNES_APERCU_FICHIER]).toBe("…");
  });

  it("la taille annoncée est celle du texte, jamais vide", () => {
    expect(tailleFichier("")).not.toBe("");
    expect(tailleFichier("abc")).not.toBe(tailleFichier("x".repeat(5000)));
  });

  it("elles font la file comme les fenêtres de saisie", () => {
    const f = (cle: number): FichierDemande => ({ sorte: "ouvrir", cle, extension: `E${cle}`, demande: { types: [".csv"] }, repondre: () => {} });
    const file = [f(1), f(2)];
    expect(retirerFichier(file, 1).map((x) => x.cle)).toEqual([2]);
    expect(retirerFichier(file, 9)).toBe(file);
  });

  it("règle d'or : le paquet d'essai des fichiers a une icône par commande et des raccourcis libres", () => {
    const essai = JSON.parse(readFileSync(new URL("../../../../e2e/donnees/essai-fichiers.fadi-addon.json", import.meta.url), "utf8")) as PaquetExtension;
    expect(jugerImportPaquet(essai).ok).toBe(true);
    const pris = new Set(REGISTRE_SANDBOX.flatMap((e) => (e.raccourci ? [normaliserRaccourci(e.raccourci)] : [])));
    expect(new Set(essai.fiche.commandes.map((c) => c.icone)).size).toBe(essai.fiche.commandes.length);
    for (const c of essai.fiche.commandes) expect(pris.has(normaliserRaccourci(c.raccourci)), c.id).toBe(false);
  });
});

describe("panneau d'une extension (lot 4)", () => {
  const essai = JSON.parse(readFileSync(new URL("../../../../e2e/donnees/essai-panneau.fadi-addon.json", import.meta.url), "utf8")) as PaquetExtension;

  it("règle d'or : le paquet d'essai est accepté, le panneau a sa propre icône, le raccourci de la commande est libre", () => {
    expect(jugerImportPaquet(essai).ok).toBe(true);
    const icones = [...essai.fiche.commandes, ...essai.fiche.panneaux].map((x) => x.icone);
    expect(new Set(icones).size).toBe(icones.length);
    const pris = new Set(REGISTRE_SANDBOX.flatMap((e) => (e.raccourci ? [normaliserRaccourci(e.raccourci)] : [])));
    for (const c of essai.fiche.commandes) expect(pris.has(normaliserRaccourci(c.raccourci)), c.id).toBe(false);
  });

  it("une icône de panneau qui n'est pas un dessin SVG est refusée à l'import", () => {
    const sans = { ...essai, pages: { ...essai.pages, "releve.svg": "<p>pas un dessin</p>" } };
    expect(jugerImportPaquet(sans)).toMatchObject({ ok: false, erreur: "icone_invalide" });
  });

  it("la clé du panneau dans la colonne nomme l'extension et le panneau", () => {
    expect(clePanneauExtension("essai-panneau", "releve")).toBe("extension:essai-panneau:releve");
  });
});

describe("outil interactif d'une extension (lot 6)", () => {
  const essai = JSON.parse(readFileSync(new URL("../../../../e2e/donnees/essai-outil.fadi-addon.json", import.meta.url), "utf8")) as PaquetExtension;

  it("règle d'or : le paquet d'essai est accepté, l'outil a sa propre icône, un raccourci libre et un curseur", () => {
    expect(jugerImportPaquet(essai).ok).toBe(true);
    const pris = new Set(REGISTRE_SANDBOX.flatMap((e) => (e.raccourci ? [normaliserRaccourci(e.raccourci)] : [])));
    expect(essai.fiche.outils).toHaveLength(1);
    for (const o of essai.fiche.outils) {
      expect(pris.has(normaliserRaccourci(o.raccourci)), o.id).toBe(false);
      expect(o.icone.endsWith(".svg")).toBe(true);
      expect(o.curseur).toBe("croix");
    }
  });
});

describe("extensions ajoutées rangées dans « Extensions » (maquette du 27 novembre 2026)", () => {
  const fiche = (id: string, fr: string, en: string, installee: boolean) => ({ id, nom: { fr, en }, description: { fr: "", en: "" }, version: "1.0.0", etat: "experimentale" as const, commandes: 1, outils: 0, panneaux: 1, installee });
  const fiches = [fiche("toitures", "Toitures et combles", "Roofs and attics", true), fiche("escaliers", "Escaliers", "Stairs", false), fiche("controles", "Contrôles réglementaires et accessibilité", "Regulatory and accessibility checks", true)];

  it("une ligne par extension proposée, par ordre alphabétique, cochée selon le choix du compte", () => {
    expect(lignesExtensionsAjoutees(fiches, [], "fr")).toEqual([
      { id: "controles", nom: "Contrôles réglementaires et accessibilité", affichee: true },
      { id: "escaliers", nom: "Escaliers", affichee: false },
      { id: "toitures", nom: "Toitures et combles", affichee: true },
    ]);
    expect(lignesExtensionsAjoutees(fiches, [], "en").map((l) => l.nom)).toEqual(["Regulatory and accessibility checks", "Roofs and attics", "Stairs"]);
  });

  it("un paquet reçu sans fiche garde sa ligne, cochée", () => {
    const paquet = { fiche: { id: "site", nom: { fr: "Site et terrain", en: "Site and terrain" } } } as unknown as PaquetExtension;
    expect(lignesExtensionsAjoutees(fiches, [paquet], "fr").find((l) => l.id === "site")).toEqual({ id: "site", nom: "Site et terrain", affichee: true });
    expect(lignesExtensionsAjoutees([], [], "fr")).toEqual([]);
  });
});
