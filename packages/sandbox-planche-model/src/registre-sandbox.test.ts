/**
 * Registre unique du Sandbox (lots 2 à 4) : entrées du catalogue de référence (52 outils, 20 commandes, 13 panneaux),
 * chacune avec identifiant, pictogramme, famille, raccourci, emplacement et disponibilité ; outils dérivés du catalogue
 * relevé sans copie ; raccourcis uniques là où ils existent ; aucun raccourci de panneau.
 */
import { describe, expect, it } from "vitest";
import { OUTILS, normaliserRaccourci } from "./catalogue-outils.js";
import { extensionDe } from "./extensions-sandbox.js";
import { BARRE_GAUCHE_SANDBOX, PICTOGRAMMES_PARTAGES, RACCOURCI_RECHERCHE, RACCOURCIS_HARMONISES, RACCOURCIS_NAVIGATEUR, REGISTRE_SANDBOX, RACCOURCIS_FADI_OUTILS, clePictogramme, entreeCommande, entreeOutil, entreePanneau, entreeSandbox, entreesSandbox } from "./registre-sandbox.js";

const catalogue = REGISTRE_SANDBOX.filter((e) => !e.horsCatalogue);

describe("registre du Sandbox — contenu", () => {
  it("88 entrées du catalogue : 55 outils (Mur, Réserve et Calage compris, cas 4), 20 commandes, 13 panneaux (la sous-liste « Objets et vue » a disparu, lot 4)", () => {
    expect(catalogue).toHaveLength(88);
    expect(catalogue.filter((e) => e.nature === "outil")).toHaveLength(55);
    expect(catalogue.filter((e) => e.nature === "commande")).toHaveLength(20);
    expect(catalogue.filter((e) => e.nature === "panneau")).toHaveLength(13);
    expect(entreeSandbox("panneau", "objets")).toBeUndefined();
  });

  it("hors catalogue : seulement zoom + / − ; la commande Diviser, doublon de l'outil, a disparu (lot 6)", () => {
    // Hors catalogue : zoom + / − (lot 4) et les commandes de la barre « Axes et repères » (chantier Axes, AX-2).
    expect(REGISTRE_SANDBOX.filter((e) => e.horsCatalogue && e.famille !== "repere" && e.famille !== "niveau" && e.famille !== "local" && e.famille !== "mur" && e.famille !== "plan" && e.famille !== "feuille" && e.famille !== "accrochage" && e.famille !== "reserve" && e.famille !== "fond" && e.famille !== "reference" && e.famille !== "pdf" && e.famille !== "dxf" && e.famille !== "travaux" && e.famille !== "enveloppe" && e.famille !== "consultation" && e.famille !== "balise" && e.famille !== "scene" && e.famille !== "gabarit" && e.famille !== "echange" && e.id !== "reperes" && e.id !== "niveaux" && e.id !== "locaux" && e.id !== "plan-vectoriel" && e.id !== "feuilles" && e.id !== "reserves" && e.id !== "fonds" && e.id !== "references" && e.id !== "pdf-recu" && e.id !== "feuilles-dxf" && e.id !== "statut-travaux" && e.famille !== "numerotation" && e.id !== "numerotation" && e.id !== "enveloppe" && e.id !== "consultations" && e.famille !== "version" && extensionDe(e.nature, e.id) === undefined).map((e) => `${e.nature}:${e.id}`)).toEqual(["commande:zoom-plus", "commande:zoom-moins"]);
    // Extension « Contrôle et nettoyage » : ses entrées sont hors catalogue, dans la barre de son panneau.
    expect(REGISTRE_SANDBOX.filter((e) => e.famille === "controle").map((e) => [e.id, e.horsCatalogue, e.emplacement])).toEqual(["controler", "nettoyer", "defaut-precedent", "defaut-suivant", "corriger-defaut", "preparer-fond-dao", "fusionner-volumes", "pieces-permis"].map((id) => [id, true, "panneau-controle"]));
    expect(entreePanneau("controle").horsCatalogue).toBe(true);
    expect(REGISTRE_SANDBOX.filter((e) => e.famille === "dynamique").map((e) => [e.id, e.horsCatalogue, e.emplacement])).toEqual([["composant-dynamique", true, "panneau-dynamique"], ["redessiner-composant", true, "panneau-dynamique"]]);
    expect(entreePanneau("dynamique").horsCatalogue).toBe(true);
    expect(REGISTRE_SANDBOX.filter((e) => e.famille === "emplacement").map((e) => [e.id, e.horsCatalogue, e.emplacement])).toEqual([["emplacement", true, "panneau-emplacement"], ["nord-arete", true, "panneau-emplacement"], ["afficher-nord", true, "panneau-emplacement"], ["point-de-base", true, "panneau-emplacement"]]);
    expect(entreePanneau("emplacement").horsCatalogue).toBe(true);
    expect(REGISTRE_SANDBOX.filter((e) => e.famille === "scripts").map((e) => [e.id, e.horsCatalogue, e.emplacement])).toEqual([["scripts", true, "panneau-scripts"], ["executer-script", true, "panneau-scripts"]]);
    expect(entreePanneau("scripts").horsCatalogue).toBe(true);
    expect(REGISTRE_SANDBOX.filter((e) => e.famille === "numerotation").map((e) => [e.id, e.horsCatalogue, e.emplacement])).toEqual([["numerotation", true, "panneau-numerotation"], ["numeroter-serie", true, "panneau-numerotation"]]);
    expect(entreePanneau("reperes").horsCatalogue).toBe(true);
    // Cas 2, lot 2 : accrochage et saisie, panneaux contextuels ouverts par leur commande (aucun panneau de colonne ajouté).
    expect(REGISTRE_SANDBOX.filter((e) => e.famille === "accrochage").map((e) => [e.id, e.raccourci, e.emplacement])).toEqual([
      ["accrochage", "Alt+F8", "panneau-accrochage"], ["forcer-sommet", "Alt+1", "panneau-accrochage"], ["forcer-milieu", "Alt+2", "panneau-accrochage"], ["forcer-intersection", "Alt+3", "panneau-accrochage"],
      ["forcer-quadrant", "Alt+4", "panneau-accrochage"], ["forcer-axe", "Alt+5", "panneau-accrochage"], ["forcer-guide", "Alt+6", "panneau-accrochage"],
      ["metre-mesure", "Alt+F9", "panneau-metre"], ["guide-reseau", "Alt+F10", "panneau-metre"], ["repartir", "Alt+F11", "panneau-metre"], ["remettre-echelle", "Alt+F12", "panneau-info-entite"],
    ]);
    expect(REGISTRE_SANDBOX.filter((e) => e.famille === "accrochage").every((e) => e.horsCatalogue)).toBe(true);
    // Cas 2, lot 4 : balises, scènes, plans de coupe et gabarit d'agence, hors catalogue, Ctrl + Alt + Maj + F1 à F12.
    expect(REGISTRE_SANDBOX.filter((e) => ["balise", "scene", "gabarit"].includes(e.famille)).map((e) => [e.id, e.raccourci, e.emplacement, e.horsCatalogue])).toEqual([
      ["verrouiller-balise", "Ctrl+Maj+1", "panneau-balises", true], ["balises-phase", "Ctrl+Maj+2", "panneau-balises", true], ["classer-selection", "Ctrl+Maj+3", "panneau-balises", true], ["vue-etat", "Ctrl+Maj+4", "panneau-balises", true],
      ["scenes-types", "Ctrl+Maj+5", "panneau-scenes", true], ["avancer-coupe", "Ctrl+Maj+6", "panneau-info-entite", true], ["reculer-coupe", "Ctrl+Maj+7", "panneau-info-entite", true], ["scene-face-coupe", "Ctrl+Maj+8", "panneau-info-entite", true],
      ["gabarit", "Ctrl+Maj+9", "panneau-gabarit", true], ["importer-gabarit", "Ctrl+Maj+0", "panneau-gabarit", true], ["enregistrer-gabarit", "Alt+7", "panneau-gabarit", true], ["creer-planche-gabarit", "Alt+8", "panneau-gabarit", true],
    ]);
    expect(REGISTRE_SANDBOX.filter((e) => e.famille === "niveau").map((e) => [e.id, e.horsCatalogue, e.emplacement])).toEqual([["niveaux", true, "panneau-niveaux"], ["ajouter-niveau", true, "panneau-niveaux"], ["travailler-niveau", true, "panneau-niveaux"], ["rattacher-niveau", true, "panneau-niveaux"], ["supprimer-niveau", true, "panneau-niveaux"]]);
    expect(REGISTRE_SANDBOX.filter((e) => e.famille === "local").map((e) => [e.id, e.horsCatalogue, e.emplacement])).toEqual([["locaux", true, "panneau-locaux"], ["creer-local", true, "panneau-locaux"], ["supprimer-local", true, "panneau-locaux"]]);
    expect(REGISTRE_SANDBOX.filter((e) => e.famille === "echange").map((e) => [e.id, e.raccourci, e.emplacement, e.horsCatalogue])).toEqual([["natif-image", "Alt+F1", "panneau-natif-image", true]]);
    expect(REGISTRE_SANDBOX.filter((e) => e.famille === "plan").map((e) => [e.id, e.raccourci])).toEqual([["plan-vectoriel", "Ctrl+F7"], ["exporter-plan-svg", "Ctrl+F8"], ["rafraichir-plan", "Ctrl+F1"], ["motifs-hachure", "Ctrl+F9"], ["nouveau-motif", "Ctrl+F10"], ["importer-motif", "Ctrl+F11"], ["supprimer-motif", "Ctrl+F12"]]);
    expect(REGISTRE_SANDBOX.filter((e) => e.famille === "feuille").map((e) => [e.id, e.raccourci])).toEqual([["feuilles", "Ctrl+Alt+Maj+1"], ["nouvelle-feuille", "Ctrl+Alt+Maj+2"], ["supprimer-feuille", "Ctrl+Alt+Maj+3"], ["ajouter-fenetre", "Ctrl+Alt+Maj+4"], ["supprimer-fenetre", "Ctrl+Alt+Maj+5"], ["exporter-feuille-pdf", "Ctrl+Alt+Maj+6"], ["exporter-jeu-pdf", "Ctrl+Alt+Maj+7"]]);
    expect(entreePanneau("niveaux").horsCatalogue).toBe(true);
    expect(REGISTRE_SANDBOX.filter((e) => e.famille === "repere").every((e) => e.horsCatalogue && e.emplacement === "barre-reperes")).toBe(true);
    expect(entreeSandbox("commande", "diviser")).toBeUndefined();
    expect(entreeOutil("diviser").horsCatalogue).toBeUndefined();
    expect(entreeOutil("diviser").raccourci).toBe("Maj+D");
  });

  it("lot 6 : raccourcis harmonisés avec SketchUp (Zoom étendu Maj+Z, recherche Maj+S), sans doublon", () => {
    expect(entreeOutil("zoom-etendu").raccourci).toBe("Maj+Z");
    expect(entreeOutil("texte-3d").raccourci).toBe("Alt+Maj+Z");
    expect(entreeCommande("exporter-debit").raccourci).toBe("Alt+Maj+X");
    expect(entreeCommande("zoom-plus").raccourci).toBe("F8");
    // Aucune entrée ne prend une combinaison que le navigateur se réserve (revue Codex : Ctrl+Maj+E est à Firefox).
    const reserves = new Set(RACCOURCIS_NAVIGATEUR.map(normaliserRaccourci));
    for (const e of REGISTRE_SANDBOX.filter((x) => x.raccourci !== null)) expect(reserves.has(normaliserRaccourci(e.raccourci!)), `${e.nature}:${e.id} : ${e.raccourci}`).toBe(false);
    expect(reserves.has(normaliserRaccourci(RACCOURCI_RECHERCHE))).toBe(false);
    expect(entreeOutil("soustraction").raccourci).toBe("Alt+Maj+D");
    expect(RACCOURCI_RECHERCHE).toBe("Maj+S");
    // La recherche n'est pas une entrée : aucun outil ni aucune commande ne prend son raccourci.
    const pris = REGISTRE_SANDBOX.filter((e) => e.raccourci !== null).map((e) => normaliserRaccourci(e.raccourci!));
    expect(pris).not.toContain(normaliserRaccourci(RACCOURCI_RECHERCHE));
    // Une harmonisation ne vise qu'un outil du catalogue, et change bien son raccourci relevé.
    for (const [id, r] of Object.entries(RACCOURCIS_HARMONISES)) expect(OUTILS.find((o) => o.id === id)?.raccourci, id).not.toBe(r);
  });

  it("identifiant unique par nature ; chaque entrée a un pictogramme, une famille, un emplacement et une disponibilité", () => {
    const cles = REGISTRE_SANDBOX.map((e) => `${e.nature}:${e.id}`);
    expect(new Set(cles).size).toBe(cles.length);
    for (const e of REGISTRE_SANDBOX) {
      expect(e.pictogramme.nom, e.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(e.famille, e.id).toBeTruthy();
      expect(e.emplacement, e.id).toBeTruthy();
      expect(e.disponibilite, e.id).toBe("livree");
    }
  });

  it("outils : dérivés du catalogue relevé (ordre, famille), raccourci harmonisé, sinon relevé, sinon couche Fadi ; emplacement Sandbox", () => {
    expect(entreesSandbox("outil").map((e) => e.id)).toEqual(OUTILS.map((o) => o.id));
    for (const o of OUTILS) {
      const e = entreeOutil(o.id);
      expect(e.famille, o.id).toBe(o.famille);
      // Lot 4 : la barre gauche est celle du Sandbox ; hors d'elle, un outil va à la grille (le clic droit reste).
      const attendu = BARRE_GAUCHE_SANDBOX.includes(o.id) ? "barre" : o.emplacement === "barre" ? "grille" : o.emplacement;
      expect(e.emplacement, o.id).toBe(attendu);
      expect(e.raccourci, o.id).toBe(RACCOURCIS_HARMONISES[o.id] ?? o.raccourci ?? RACCOURCIS_FADI_OUTILS[o.id]);
    }
    // La couche Fadi ne couvre que des outils sans raccourci relevé, et tous ceux-là.
    for (const id of Object.keys(RACCOURCIS_FADI_OUTILS)) expect(OUTILS.find((o) => o.id === id)?.raccourci, id).toBeNull();
    for (const o of OUTILS.filter((x) => x.raccourci === null)) expect(RACCOURCIS_FADI_OUTILS[o.id], o.id).toBeDefined();
  });

  it("chantier Axes (AX-D6) : Alt + Maj + chiffre et F4 pour la barre « Axes et repères » ; Placer reste l'outil Axes (Maj + Y)", () => {
    expect(entreeOutil("axes").raccourci).toBe("Maj+Y");
    const r = entreesSandbox("commande").filter((e) => e.famille === "repere").map((e) => e.raccourci);
    expect(r).toEqual(["Alt+Maj+1", "Alt+Maj+2", "Alt+Maj+3", "Alt+Maj+4", "Alt+Maj+5", "Alt+Maj+6", "Alt+Maj+7", "Alt+Maj+8", "F4", "Alt+Maj+9", "Alt+Maj+0", "Maj+F4"]);
  });

  it("raccourcis : les 52 outils et les 20 commandes en ont un, unique ; les 13 panneaux n'en ont pas", () => {
    const avec = REGISTRE_SANDBOX.filter((e) => e.nature !== "panneau");
    for (const e of avec) expect(e.raccourci, `${e.nature}:${e.id}`).not.toBeNull();
    const vus = new Map<string, string>();
    for (const e of avec) {
      const r = normaliserRaccourci(e.raccourci!);
      expect(vus.get(r), `${e.nature}:${e.id} et ${vus.get(r)} : ${e.raccourci}`).toBeUndefined();
      vus.set(r, `${e.nature}:${e.id}`);
    }
    for (const e of entreesSandbox("panneau")) expect(e.raccourci, e.id).toBeNull();
  });

  it("panneaux : chacun à un clic dans la colonne de droite, Info modèle en bas (lot 4)", () => {
    expect(entreesSandbox("panneau").filter((e) => e.emplacement === "colonne").map((e) => e.id)).toEqual([
      "instructeur", "info-entite", "materiaux", "composants", "styles", "balises", "scenes", "ombres", "affichage", "adoucir", "navigateur", "debit", "reperes", "controle", "dynamique", "emplacement", "niveaux", "locaux", "plan-vectoriel", "scripts", "numerotation",
    ]);
    expect(entreesSandbox("panneau").filter((e) => e.emplacement === "colonne-bas").map((e) => e.id)).toEqual(["info-modele"]);
    // Feuilles (cas 4, étape 6) : hors de la colonne, ouvert depuis le panneau Plan vectoriel.
    expect(entreesSandbox("panneau").filter((e) => e.emplacement === "panneau-plan-vectoriel").map((e) => e.id)).toEqual(["feuilles"]);
  });

  it("barre gauche par défaut : les seize outils essentiels, dans l'ordre de SketchUp (lot 4)", () => {
    expect([...BARRE_GAUCHE_SANDBOX]).toEqual([
      "selection", "gomme", "ligne", "arc", "rectangle", "pousser-tirer", "decalage", "deplacer", "faire-pivoter", "echelle",
      "metre", "peinture", "orbite", "panoramique", "zoom", "zoom-etendu",
    ]);
    for (const id of BARRE_GAUCHE_SANDBOX) expect(entreeOutil(id).emplacement, id).toBe("barre");
    expect(new Set(BARRE_GAUCHE_SANDBOX)).toEqual(new Set(entreesSandbox("outil").filter((e) => e.emplacement === "barre").map((e) => e.id)));
  });

  it("recherche par nature : une entrée absente vaut undefined, et l'accès exigé lève une erreur", () => {
    expect(entreeSandbox("panneau", "inexistant")).toBeUndefined();
    expect(() => entreeCommande("inexistante")).toThrow(/absent/);
    expect(clePictogramme(entreePanneau("debit").pictogramme)).toBe(clePictogramme(entreeCommande("liste-debit").pictogramme));
  });

  it("règle d'or : chaque entrée a un pictogramme Tabler ou sur mesure, jamais un caractère ni du texte", () => {
    for (const e of REGISTRE_SANDBOX) {
      expect(["tabler", "fadi"], e.id).toContain(e.pictogramme.source);
      expect(e.pictogramme.nom, e.id).not.toMatch(/[^\x20-\x7e]/);
    }
  });

  it("pictogrammes uniques, sauf les trois partages déclarés (outil ou commande et le panneau qu'il ouvre)", () => {
    const cle = (e: (typeof REGISTRE_SANDBOX)[number]) => `${e.nature}:${e.id}`;
    const parPicto = new Map<string, string[]>();
    for (const e of REGISTRE_SANDBOX) parPicto.set(clePictogramme(e.pictogramme), [...(parPicto.get(clePictogramme(e.pictogramme)) ?? []), cle(e)]);
    const partages = [...parPicto.values()].filter((l) => l.length > 1).map((l) => [...l].sort().join(" + ")).sort();
    expect(partages).toEqual(PICTOGRAMMES_PARTAGES.map(([a, b]) => [a, b].sort().join(" + ")).sort());
    // Chaque partage déclaré relie un outil ou une commande à un panneau.
    for (const [a, b] of PICTOGRAMMES_PARTAGES) {
      expect(a, a).toMatch(/^(outil|commande):/);
      expect(b, b).toMatch(/^panneau:/);
    }
  });

  it("les paires du catalogue qui ne sont pas des partages reçoivent des pictogrammes distincts", () => {
    const differents = (a: string, b: string) => expect(clePictogramme(entreeSandbox(a.split(":")[0] as "outil", a.split(":")[1]!)!.pictogramme), `${a} / ${b}`).not.toBe(clePictogramme(entreeSandbox(b.split(":")[0] as "outil", b.split(":")[1]!)!.pictogramme));
    differents("outil:arc", "panneau:adoucir");
    differents("outil:regarder-autour", "panneau:styles");
    differents("commande:composant", "panneau:composants");
    differents("panneau:info-entite", "panneau:info-modele");
  });

  it("teinte par famille : dessin, modification (solides compris), mesure (annotation comprise), matériau, caméra, objets, info", () => {
    expect(entreeOutil("ligne").pictogramme.teinte).toBe("dessin");
    expect(entreeOutil("union").pictogramme.teinte).toBe("modification");
    expect(entreeOutil("cotation").pictogramme.teinte).toBe("mesure");
    expect(entreeOutil("peinture").pictogramme.teinte).toBe("materiau");
    expect(entreeOutil("orbite").pictogramme.teinte).toBe("camera");
    expect(entreeOutil("selection").pictogramme.teinte).toBe("objets");
    for (const e of entreesSandbox("commande")) expect(e.pictogramme.teinte, e.id).toBe("objets");
    for (const e of entreesSandbox("panneau")) expect(e.pictogramme.teinte, e.id).toBe("info");
  });

  it("douze dessins sur mesure validés le 20 octobre 2026, plus ceux de la barre « Axes et repères » (chantier Axes)", () => {
    const fadi = new Set(REGISTRE_SANDBOX.filter((e) => e.pictogramme.source === "fadi" && e.famille !== "repere" && e.id !== "reperes").map((e) => e.pictogramme.nom));
    expect([...fadi].sort()).toEqual(["aligner", "allonger", "coupe-profil", "debit", "decalage", "eclater", "epaissir", "onglet", "pousser", "profile", "rapporteur", "suivez"]);
    const axes = REGISTRE_SANDBOX.filter((e) => e.famille === "repere").map((e) => e.pictogramme.nom);
    expect(axes.sort()).toEqual(["axes-affichage", "origine-composant", "plan-travail", "plan-verrou", "repere-actif", "repere-aligner", "repere-enregistrer", "repere-modele", "repere-pivoter", "repere-precedent", "reperes-liste", "vue-normale"]);
  });

  it("le registre est figé", () => {
    expect(Object.isFrozen(REGISTRE_SANDBOX)).toBe(true);
    expect(Object.isFrozen(BARRE_GAUCHE_SANDBOX)).toBe(true);
    expect(Object.isFrozen(PICTOGRAMMES_PARTAGES)).toBe(true);
  });
});
