import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { OUTILS, CLES_PERSONNALISABLES, clesMasquees, extensionDeCle, outilParId } from "@parcours/sandbox-planche-model";
import { CATALOGUE } from "../messages";
import { BARRES, OBJET_DE } from "./barres-outils";
import {
  COMMANDES_DU_REGISTRE,
  GROUPES_COMMANDES,
  ID_PREMIERS_PAS,
  NOM_BARRE,
  OBJETS_BARRES,
  PREMIERS_PAS,
  barreDeLOutil,
  barresLivrees,
  barresPersonnelles,
  deplacerEntree,
  entreesDe,
  extensionDeLaCommande,
  groupeDeCommande,
  idBarreCanonique,
  idBarreGroupe,
  idBarreObjet,
  nomDeCopie,
  normaliserBarres,
} from "./barres-nommees";

describe("Barres d'outils nommées (25 novembre 2026) — chaque barre une seule fois", () => {
  it("barres livrées : « Premiers pas » puis une barre par objet, chacune avec un nom dans les deux langues", () => {
    const b = barresLivrees();
    expect(b.map((x) => x.id)).toEqual([ID_PREMIERS_PAS, ...OBJETS_BARRES.map(idBarreObjet)]);
    expect(new Set(b.map((x) => x.id)).size).toBe(b.length);
    expect([...OBJETS_BARRES].sort()).toEqual(Object.keys(BARRES).sort());
    for (const x of b) {
      expect(x.origine).toBe("livree");
      expect(CATALOGUE.fr[x.nomCle!], x.id).toBeTruthy();
      expect(CATALOGUE.en[x.nomCle!], x.id).toBeTruthy();
    }
    expect(Object.keys(NOM_BARRE).sort()).toEqual([...OBJETS_BARRES].sort());
  });

  it("« Premiers pas » : douze outils du catalogue, sans doublon, aucun d'une extension", () => {
    const ids = PREMIERS_PAS.flat();
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
    for (const id of ids) expect(outilParId(id), id).not.toBeNull();
    // Toutes les extensions coupées : la barre garde ses douze outils.
    const tout = clesMasquees({ bois: false, volumes: false });
    expect(entreesDe(barresLivrees(tout)[0]!)).toEqual(ids.map((id) => `outil:${id}`));
  });

  it("chaque outil du catalogue a une barre livrée, la même que son objet ; son contenu reprend ① ② ③", () => {
    for (const o of OUTILS) {
      const id = barreDeLOutil(o.id);
      expect(id, o.id).toBe(idBarreObjet(OBJET_DE[o.id]!));
      const barre = barresLivrees().find((x) => x.id === id)!;
      expect(entreesDe(barre), o.id).toContain(`outil:${o.id}`);
      expect(barre.sections.map((s) => s.section)).toEqual(["creer", "modifier", "mesurer"]);
    }
    expect(barreDeLOutil("inconnu")).toBeNull();
  });

  it("extension désactivée : ses outils quittent les barres, une barre sans outil propre n'est plus proposée", () => {
    const sansVolumes = barresLivrees(clesMasquees({ volumes: false }));
    expect(sansVolumes.map((x) => x.id)).not.toContain(idBarreObjet("solides"));
    expect(sansVolumes.flatMap(entreesDe)).not.toContain("outil:union");
    const sansBois = barresLivrees(clesMasquees({ bois: false }));
    expect(sansBois.flatMap(entreesDe)).not.toContain("outil:onglet");
    expect(sansBois.map((x) => x.id)).toContain(idBarreObjet("volumes"));
  });

  it("barres personnelles : un regroupement du compte = une barre, dans l'ordre de ses entrées", () => {
    const g = [{ id: "atelier", nom: "Mon agencement", entrees: ["outil:rectangle", "commande:groupe", "outil:onglet"] }];
    const [b] = barresPersonnelles(g);
    expect(b).toMatchObject({ id: idBarreGroupe("atelier"), origine: "personnelle", nom: "Mon agencement", groupe: "atelier" });
    expect(entreesDe(b!)).toEqual(g[0]!.entrees);
    expect(entreesDe(barresPersonnelles(g, clesMasquees({ bois: false }))[0]!)).toEqual(["outil:rectangle", "commande:groupe"]);
    for (const c of g[0]!.entrees) expect(CLES_PERSONNALISABLES).toContain(c);
  });
});

describe("État mémorisé des barres — reprise des identifiants d'outil d'avant le 25 novembre 2026", () => {
  it("un identifiant d'outil devient la barre de son objet, sans doublon ; un identifiant de barre est gardé", () => {
    expect(idBarreCanonique("lasso")).toBe("objet:selection");
    expect(idBarreCanonique("objet:aretes")).toBe("objet:aretes");
    expect(idBarreCanonique("groupe:atelier")).toBe("groupe:atelier");
    expect(idBarreCanonique(ID_PREMIERS_PAS)).toBe(ID_PREMIERS_PAS);
    const e = { visibles: ["selection", "lasso", "ligne"], positions: { lasso: { x: 10, y: 20 }, selection: { x: 1, y: 2 } } };
    expect(normaliserBarres(e)).toEqual({ visibles: ["objet:selection", "objet:aretes"], positions: { "objet:selection": { x: 10, y: 20 } } });
    const propre = { visibles: ["objet:aretes", ID_PREMIERS_PAS], positions: { "objet:aretes": { x: 3, y: 4 } } };
    expect(normaliserBarres(propre)).toBe(propre);
  });
});

describe("Groupes de commandes de la liste « Outils » — « Objets et arêtes » scindé", () => {
  it("chaque commande du registre a un groupe : Groupe, Repères, Bois, Extensions ou Caméra", () => {
    const attendu: Record<string, string> = {
      groupe: "groupe", composant: "groupe", eclater: "groupe", "rendre-unique": "groupe", "diviser-courbe": "groupe",
      fermer: "groupe", "fermer-tout": "groupe", "detacher-lien": "groupe", "groupe-vide": "groupe", "deplacer-vers": "groupe", renommer: "groupe",
      isoler: "groupe", "masquer-reste": "groupe",
      "zoom-plus": "camera", "zoom-moins": "camera",
      "piece-section": "bois", "piece-rotation": "bois", "liste-debit": "bois", renumeroter: "bois", etiquettes: "bois", "effacer-etiquettes": "bois", "exporter-debit": "bois",
      "choisir-repere": "reperes", "aligner-repere": "reperes", "plan-de-travail": "reperes", "repere-precedent": "reperes", "repere-modele": "reperes", "pivoter-repere": "reperes",
      "verrouiller-plan": "reperes", "vue-normale-plan": "reperes", "affichage-axes": "reperes", "enregistrer-repere": "reperes", "gerer-reperes": "reperes", "origine-composant": "reperes",
    };
    for (const [id, g] of Object.entries(attendu)) {
      expect(COMMANDES_DU_REGISTRE, id).toContain(id);
      expect(groupeDeCommande(id), id).toBe(g);
    }
    for (const id of COMMANDES_DU_REGISTRE) expect(["groupe", "reperes", "bois", "extensions", "camera"]).toContain(groupeDeCommande(id));
    // Groupe « Extensions » (après « Bois ») : toute commande d'une extension autre que « Bois et menuiserie », et elles seules.
    for (const id of COMMANDES_DU_REGISTRE) {
      const x = extensionDeCle(`commande:${id}`);
      expect(groupeDeCommande(id) === "extensions", id).toBe(x !== undefined && x.id !== "bois");
      expect(extensionDeLaCommande(id), id).toBe(x && x.id !== "bois" ? x.id : null);
    }
    for (const id of ["controler", "nettoyer", "composant-dynamique", "redessiner-composant", "emplacement", "nord-arete", "afficher-nord"]) expect(groupeDeCommande(id), id).toBe("extensions");
    // Répartition validée par le maître d'ouvrage : 13 dans Groupe, 12 dans Repères, 7 dans Bois, 2 avec Caméra.
    const compte = (g: string) => Object.values(attendu).filter((x) => x === g).length;
    expect([compte("groupe"), compte("reperes"), compte("bois"), compte("camera")]).toEqual([13, 12, 7, 2]);
  });

  it("les trois groupes ont leur libellé dans les deux langues ; « Objets et arêtes » n'existe plus", () => {
    expect(GROUPES_COMMANDES.map((g) => CATALOGUE.fr[g.cle])).toEqual(["Groupe", "Repères", "Bois"]);
    for (const g of GROUPES_COMMANDES) expect(CATALOGUE.en[g.cle]).toBeTruthy();
    expect(Object.keys(CATALOGUE.fr)).not.toContain("outils.famille.objets");
  });
});

describe("Composition d'une barre personnelle", () => {
  it("nom de copie sans doublon, borné en longueur", () => {
    expect(nomDeCopie("Arêtes", [], 60)).toBe("Arêtes (copie)");
    expect(nomDeCopie("Arêtes", ["arêtes (copie)"], 60)).toBe("Arêtes (copie 2)");
    expect(nomDeCopie("x".repeat(60), [], 60)).toHaveLength(60);
  });
  it("monter et descendre une entrée ; aux bornes, rien ne bouge", () => {
    const l = ["a", "b", "c"];
    expect(deplacerEntree(l, "b", -1)).toEqual(["b", "a", "c"]);
    expect(deplacerEntree(l, "b", 1)).toEqual(["a", "c", "b"]);
    expect(deplacerEntree(l, "a", -1)).toEqual(l);
    expect(deplacerEntree(l, "c", 1)).toEqual(l);
    expect(deplacerEntree(l, "z", 1)).toEqual(l);
  });
});

describe("Liste « Outils » à deux niveaux (contrôle du source)", () => {
  const src = readFileSync(new URL("./BoutonOutils.tsx", import.meta.url), "utf8");
  it("le clic sur la ligne d'un outil l'active ; plus de barre dépliée sous l'outil ni de case par outil", () => {
    expect(src).toMatch(/data-outils-outil=\{o\.id\}[^>]*onClick=\{\(\) => choisir\(o\.id\)\}/);
    expect(src).not.toMatch(/data-outils-barre=\{o\.id\}/);
    expect(src).not.toMatch(/basculerOutil/);
  });
  it("chaque barre n'a qu'un interrupteur, et le pied porte un nom accessible traduit", () => {
    expect(src.match(/data-outils-afficher=/g)).toHaveLength(1);
    expect(src).toMatch(/aria-label=\{t\("outils\.pied"\)\}/);
  });
});
