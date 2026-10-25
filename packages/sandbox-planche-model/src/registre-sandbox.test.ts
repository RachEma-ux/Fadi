/**
 * Registre unique du Sandbox (lots 2 à 4) : entrées du catalogue de référence (52 outils, 20 commandes, 13 panneaux),
 * chacune avec identifiant, pictogramme, famille, raccourci, emplacement et disponibilité ; outils dérivés du catalogue
 * relevé sans copie ; raccourcis uniques là où ils existent ; aucun raccourci de panneau.
 */
import { describe, expect, it } from "vitest";
import { OUTILS, normaliserRaccourci } from "./catalogue-outils.js";
import { BARRE_GAUCHE_SANDBOX, PICTOGRAMMES_PARTAGES, RACCOURCI_RECHERCHE, RACCOURCIS_HARMONISES, RACCOURCIS_NAVIGATEUR, REGISTRE_SANDBOX, RACCOURCIS_FADI_OUTILS, clePictogramme, entreeCommande, entreeOutil, entreePanneau, entreeSandbox, entreesSandbox } from "./registre-sandbox.js";

const catalogue = REGISTRE_SANDBOX.filter((e) => !e.horsCatalogue);

describe("registre du Sandbox — contenu", () => {
  it("85 entrées du catalogue : 52 outils, 20 commandes, 13 panneaux (la sous-liste « Objets et vue » a disparu, lot 4)", () => {
    expect(catalogue).toHaveLength(85);
    expect(catalogue.filter((e) => e.nature === "outil")).toHaveLength(52);
    expect(catalogue.filter((e) => e.nature === "commande")).toHaveLength(20);
    expect(catalogue.filter((e) => e.nature === "panneau")).toHaveLength(13);
    expect(entreeSandbox("panneau", "objets")).toBeUndefined();
  });

  it("hors catalogue : seulement zoom + / − ; la commande Diviser, doublon de l'outil, a disparu (lot 6)", () => {
    // Hors catalogue : zoom + / − (lot 4) et les commandes de la barre « Axes et repères » (chantier Axes, AX-2).
    expect(REGISTRE_SANDBOX.filter((e) => e.horsCatalogue && e.famille !== "repere" && e.id !== "reperes").map((e) => `${e.nature}:${e.id}`)).toEqual(["commande:zoom-plus", "commande:zoom-moins"]);
    expect(entreePanneau("reperes").horsCatalogue).toBe(true);
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
    expect(r).toEqual(["Alt+Maj+1", "Alt+Maj+2", "Alt+Maj+3", "Alt+Maj+4", "Alt+Maj+5", "Alt+Maj+6", "Alt+Maj+7", "Alt+Maj+8", "F4", "Alt+Maj+9", "Alt+Maj+0"]);
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
      "instructeur", "info-entite", "materiaux", "composants", "styles", "balises", "scenes", "ombres", "affichage", "adoucir", "navigateur", "debit", "reperes",
    ]);
    expect(entreesSandbox("panneau").filter((e) => e.emplacement === "colonne-bas").map((e) => e.id)).toEqual(["info-modele"]);
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
    expect(axes.sort()).toEqual(["axes-affichage", "plan-travail", "plan-verrou", "repere-actif", "repere-aligner", "repere-enregistrer", "repere-modele", "repere-pivoter", "repere-precedent", "reperes-liste", "vue-normale"]);
  });

  it("le registre est figé", () => {
    expect(Object.isFrozen(REGISTRE_SANDBOX)).toBe(true);
    expect(Object.isFrozen(BARRE_GAUCHE_SANDBOX)).toBe(true);
    expect(Object.isFrozen(PICTOGRAMMES_PARTAGES)).toBe(true);
  });
});
