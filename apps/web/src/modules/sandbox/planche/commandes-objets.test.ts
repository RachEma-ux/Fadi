import { describe, expect, it } from "vitest";
import { ajouterRectangle, ajouterSegment, contexte, copier, etirerAretes, grouper, grouperVide, modeleVide, v3 } from "@parcours/sandbox-planche-model";
import { COMMANDES_DEBIT, COMMANDES_OBJETS, ciblesDeplacement, disponibiliteDebit, disponibiliteNavigateur, disponibiliteObjet, disponibiliteVue, filAriane, liensRompus } from "./commandes-objets";

const base = { lecture: false, entites: 0, objets: 0, verrouilles: false };

describe("Commandes d'objet (Objets O-1, D-203)", () => {
  it("disponibilité commune au menu, à la barre et au clavier, avec un motif quand c'est grisé", () => {
    expect(disponibiliteObjet("groupe", base)).toEqual({ disponible: false, motif: "planche.objets.motif.vide" });
    expect(disponibiliteObjet("composant", { ...base, entites: 2 }).disponible).toBe(true);
    expect(disponibiliteObjet("eclater", { ...base, entites: 3 })).toEqual({ disponible: false, motif: "planche.objets.motif.eclater" });
    expect(disponibiliteObjet("eclater", { ...base, entites: 1, objets: 1 }).disponible).toBe(true);
    expect(disponibiliteObjet("eclater", { ...base, entites: 1, objets: 1, verrouilles: true }).motif).toBe("planche.objets.motif.verrouille");
    for (const c of COMMANDES_OBJETS) expect(disponibiliteObjet(c.id, { ...base, lecture: true, entites: 1, objets: 1 }).motif).toBe("planche.objets.motif.lecture");
  });
  it("Objets O-3 : Rendre unique demande un objet partagé ; Diviser en segments une courbe (Diviser est l'outil, lot 6)", () => {
    expect(disponibiliteObjet("rendre-unique", { ...base, entites: 1, objets: 1, partages: 0 }).motif).toBe("planche.objets.motif.unique");
    expect(disponibiliteObjet("rendre-unique", { ...base, entites: 1, objets: 1, partages: 1 }).disponible).toBe(true);
    expect(disponibiliteObjet("diviser-courbe", { ...base, entites: 1, aretes: 1 }).motif).toBe("planche.objets.motif.courbe");
    expect(disponibiliteObjet("diviser-courbe", { ...base, entites: 1, aretes: 1, courbes: 1 }).disponible).toBe(true);
    // Les commandes d'arête sont contextuelles (barre d'actions), les commandes d'objet toujours présentes.
    expect(COMMANDES_OBJETS.filter((c) => c.contextuelle).map((c) => c.id)).toEqual(["diviser-courbe"]);
    expect(COMMANDES_OBJETS.map((c) => c.id)).not.toContain("diviser");
  });

  it("grouper une surface liée à son arête rompt le lien, et le nombre de liens rompus est compté", () => {
    const ligne = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    const a = Object.keys(contexte(ligne).aretes)[0]!;
    const tiree = etirerAretes(ligne, [a], v3(0, 0, 2)).modele;
    expect(Object.keys(tiree.annotations?.extrusions ?? {})).toHaveLength(1);
    const c = contexte(tiree);
    const g = grouper(tiree, [...Object.keys(c.faces), ...Object.keys(c.aretes)]);
    expect(liensRompus(tiree, g.modele)).toBe(1);
    expect(liensRompus(ligne, tiree)).toBe(0);
  });
});

describe("Fil d'Ariane (Objets O-2)", () => {
  it("racine, puis chaque objet du chemin dans l'ordre", () => {
    const noms: Record<string, string> = { a: "Établi", b: "Cadre" };
    expect(filAriane(["a", "b"], (id) => noms[id]!, "Planche")).toEqual([
      { id: undefined, nom: "Planche" },
      { id: "a", nom: "Établi" },
      { id: "b", nom: "Cadre" },
    ]);
    expect(filAriane([], (id) => id, "Planche")).toEqual([{ id: undefined, nom: "Planche" }]);
  });
});

describe("Commandes du Navigateur (Objets O-4)", () => {
  it("disponibilités : groupe vide toujours (hors lecture), déplacer des objets seuls et non verrouillés, renommer un seul objet", () => {
    expect(disponibiliteNavigateur("groupe-vide", base).disponible).toBe(true);
    expect(disponibiliteNavigateur("groupe-vide", { ...base, lecture: true }).motif).toBe("planche.objets.motif.lecture");
    expect(disponibiliteNavigateur("deplacer-vers", { ...base, entites: 2, objets: 1 }).motif).toBe("planche.objets.motif.deplacer");
    expect(disponibiliteNavigateur("deplacer-vers", { ...base, entites: 1, objets: 1, verrouilles: true }).motif).toBe("planche.objets.motif.verrouille");
    expect(disponibiliteNavigateur("deplacer-vers", { ...base, entites: 2, objets: 2 }).disponible).toBe(true);
    expect(disponibiliteNavigateur("renommer", { ...base, entites: 2, objets: 2 }).motif).toBe("planche.objets.motif.renommer");
    expect(disponibiliteNavigateur("renommer", { ...base, entites: 1, objets: 1 }).disponible).toBe(true);
  });
  it("cibles de « Déplacer vers… » : ni l'objet déplacé, ni son contenu, ni le contexte de départ ; la racine si l'on part d'un groupe", () => {
    const m0 = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const c0 = contexte(m0);
    const a = grouper(m0, [...Object.keys(c0.faces), ...Object.keys(c0.aretes)]);
    const b = grouper(a.modele, [a.occurrence]);
    const vide = grouperVide(b.modele);
    const nom = (id: string) => id;
    expect(ciblesDeplacement(vide.modele, [b.occurrence], undefined, nom, "Planche").map((c) => c.id)).toEqual([vide.occurrence]);
    expect(ciblesDeplacement(vide.modele, [a.occurrence], b.occurrence, nom, "Planche").map((c) => c.id)).toEqual([undefined, vide.occurrence]);
  });
});

describe("Commandes de vue (Objets O-5)", () => {
  it("Isoler : avec une sélection ou pour lever l'isolement ; Masquer le reste : dans un objet ouvert", () => {
    expect(disponibiliteVue("isoler", { entites: 0, isole: false, dansObjet: false }).motif).toBe("planche.objets.motif.isoler");
    expect(disponibiliteVue("isoler", { entites: 2, isole: false, dansObjet: false }).disponible).toBe(true);
    expect(disponibiliteVue("isoler", { entites: 0, isole: true, dansObjet: false }).disponible).toBe(true);
    expect(disponibiliteVue("masquer-reste", { entites: 0, isole: false, dansObjet: false }).motif).toBe("planche.contexte.motif");
    expect(disponibiliteVue("masquer-reste", { entites: 0, isole: false, dansObjet: true }).disponible).toBe(true);
  });
});

describe("Cibles de « Déplacer vers… » — revue de la PR (O-4)", () => {
  it("ni l'autre occurrence du composant ouvert, ni une définition contenue par l'objet déplacé", () => {
    const m0 = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const c0 = contexte(m0);
    const x = grouper(m0, [...Object.keys(c0.faces), ...Object.keys(c0.aretes)]);
    const k = grouper(x.modele, [x.occurrence], { genre: "composant" });
    const m = copier(k.modele, [k.occurrence], v3(5, 0, 0)).modele;
    const k2 = Object.keys(contexte(m).occurrences).find((id) => id !== k.occurrence)!;
    const nom = (id: string) => id;
    expect(ciblesDeplacement(m, [x.occurrence], k.occurrence, nom, "Planche").map((c) => c.id)).toEqual([undefined]);
    // Depuis la racine, ranger le composant K dans sa copie (même définition, donc cycle) n'est pas proposé.
    expect(ciblesDeplacement(m, [k.occurrence], undefined, nom, "Planche").map((c) => c.id)).not.toContain(k2);
  });
});

describe("Liste de débit (lot L14) : commandes et disponibilités", () => {
  it("ouvrir toujours ; exporter avec une liste non vide ; écritures hors lecture ; effacer avec des étiquettes", () => {
    const s = { lignes: 2, etiquettes: 0, lecture: false };
    expect(disponibiliteDebit("liste-debit", { ...s, lignes: 0 }).disponible).toBe(true);
    expect(disponibiliteDebit("exporter-debit", { ...s, lignes: 0 }).motif).toBe("planche.debit.motif.vide");
    expect(disponibiliteDebit("exporter-debit", { ...s, lecture: true }).disponible).toBe(true);
    expect(disponibiliteDebit("renumeroter", { ...s, lecture: true }).motif).toBe("planche.debit.motif.lecture");
    expect(disponibiliteDebit("effacer-etiquettes", s).motif).toBe("planche.debit.motif.sans-etiquette");
    expect(disponibiliteDebit("effacer-etiquettes", { ...s, etiquettes: 3 }).disponible).toBe(true);
    expect(COMMANDES_DEBIT.map((c) => c.raccourci)).toEqual(["Alt+Maj+T", "Alt+Maj+N", "Alt+Maj+E", "Alt+Maj+W", "Alt+Maj+X"]);
  });
});

describe("Extension « Contrôle et nettoyage » — disponibilité des commandes", () => {
  it("contrôler toujours ; nettoyer hors lecture, à la racine, avec quelque chose de coché à retirer", async () => {
    const { disponibiliteControle } = await import("./commandes-objets");
    const s = { aNettoyer: true, dansObjet: false, lecture: false };
    expect(disponibiliteControle("controler", { aNettoyer: false, dansObjet: true, lecture: true }).disponible).toBe(true);
    expect(disponibiliteControle("nettoyer", s).disponible).toBe(true);
    expect(disponibiliteControle("nettoyer", { ...s, lecture: true }).motif).toBe("planche.debit.motif.lecture");
    expect(disponibiliteControle("nettoyer", { ...s, dansObjet: true }).motif).toBe("planche.controle.motif.objet");
    expect(disponibiliteControle("nettoyer", { ...s, aNettoyer: false }).motif).toBe("planche.controle.motif.rien");
  });
  it("Emplacement : le panneau et la flèche sont toujours offerts ; le nord sur l'arête demande une arête et une Planche modifiable", async () => {
    const { disponibiliteEmplacement } = await import("./commandes-objets");
    expect(disponibiliteEmplacement("emplacement", { arete: false, position: false, lecture: true }).disponible).toBe(true);
    expect(disponibiliteEmplacement("afficher-nord", { arete: false, position: false, lecture: true }).disponible).toBe(true);
    expect(disponibiliteEmplacement("nord-arete", { arete: true, position: true, lecture: false }).disponible).toBe(true);
    expect(disponibiliteEmplacement("nord-arete", { arete: true, position: false, lecture: false }).motif).toBe("planche.emplacement.motif.position");
    expect(disponibiliteEmplacement("nord-arete", { arete: false, position: true, lecture: false }).motif).toBe("planche.emplacement.motif.arete");
    expect(disponibiliteEmplacement("nord-arete", { arete: true, position: true, lecture: true }).motif).toBe("planche.debit.motif.lecture");
  });
});

describe("Extension « Composants dynamiques » — commandes et liste de choix", () => {
  it("le panneau toujours ; redessiner hors lecture avec un composant dynamique sélectionné", async () => {
    const { disponibiliteDynamique } = await import("./commandes-objets");
    expect(disponibiliteDynamique("composant-dynamique", { dynamique: false, lecture: true }).disponible).toBe(true);
    expect(disponibiliteDynamique("redessiner-composant", { dynamique: true, lecture: false }).disponible).toBe(true);
    expect(disponibiliteDynamique("redessiner-composant", { dynamique: false, lecture: false }).motif).toBe("planche.dynamique.motif.selection");
    expect(disponibiliteDynamique("redessiner-composant", { dynamique: true, lecture: true }).motif).toBe("planche.debit.motif.lecture");
  });

  it("liste de choix : « Libellé=valeur ; … », un choix sans « = » vaut son libellé, aller-retour stable", async () => {
    const { lireChoix, ecrireChoix } = await import("./panneau-dynamique");
    const choix = lireChoix("Chêne=chene ; Hêtre ; ; Pin = pin ");
    expect(choix).toEqual([{ libelle: "Chêne", valeur: "chene" }, { libelle: "Hêtre", valeur: "Hêtre" }, { libelle: "Pin", valeur: "pin" }]);
    expect(lireChoix(ecrireChoix(choix))).toEqual(choix);
  });
});

describe("Composants dynamiques — erreurs traduites", () => {
  it("chaque erreur du modèle a son message français (le même texte) et son message anglais", async () => {
    const { MESSAGES_ERREUR_DYNAMIQUE } = await import("@parcours/sandbox-planche-model");
    const { CATALOGUE } = await import("../messages");
    for (const [cle, texte] of Object.entries(MESSAGES_ERREUR_DYNAMIQUE)) {
      const k = `planche.dynamique.erreur.${cle}` as keyof typeof CATALOGUE.fr;
      expect(CATALOGUE.fr[k], k).toBe(texte);
      expect(CATALOGUE.en[k], k).toBeTruthy();
      expect(CATALOGUE.en[k], k).not.toBe(texte);
    }
  });
});

describe("Extension « Scripts » — commandes, erreurs et aide traduites", () => {
  it("le panneau toujours ; exécuter avec un texte et aucun script en cours", async () => {
    const { disponibiliteScripts } = await import("./commandes-objets");
    expect(disponibiliteScripts("scripts", { vide: true, enCours: true }).disponible).toBe(true);
    expect(disponibiliteScripts("executer-script", { vide: false, enCours: false }).disponible).toBe(true);
    expect(disponibiliteScripts("executer-script", { vide: true, enCours: false }).motif).toBe("planche.scripts.motif.vide");
    expect(disponibiliteScripts("executer-script", { vide: false, enCours: true }).motif).toBe("planche.scripts.motif.encours");
  });
  it("chaque erreur, chaque fonction et chaque exemple a son texte français et anglais", async () => {
    const { MESSAGES_ERREUR_SCRIPT, FONCTIONS_SCRIPT, EXEMPLES_SCRIPTS } = await import("@parcours/sandbox-planche-model");
    const { CATALOGUE } = await import("../messages");
    const { SIGNATURES_SCRIPT } = await import("./panneau-scripts");
    for (const [cle, texte] of Object.entries(MESSAGES_ERREUR_SCRIPT)) {
      const k = `planche.scripts.erreur.${cle}` as keyof typeof CATALOGUE.fr;
      expect(CATALOGUE.fr[k], k).toBe(texte);
      expect(CATALOGUE.en[k], k).toBeTruthy();
      if (cle !== "execution") expect(CATALOGUE.en[k], k).not.toBe(texte);
    }
    expect(Object.keys(SIGNATURES_SCRIPT)).toEqual([...FONCTIONS_SCRIPT]);
    for (const f of FONCTIONS_SCRIPT) {
      const k = `planche.scripts.fonction.${f}` as keyof typeof CATALOGUE.fr;
      expect(CATALOGUE.fr[k], k).toBeTruthy();
      expect(CATALOGUE.en[k], k).toBeTruthy();
      expect(SIGNATURES_SCRIPT[f].startsWith(`planche.${f}(`), f).toBe(true);
    }
    for (const e of EXEMPLES_SCRIPTS) {
      const k = `planche.scripts.exemple.${e.id}` as keyof typeof CATALOGUE.fr;
      expect(CATALOGUE.fr[k], k).toBe(e.nom);
      expect(CATALOGUE.en[k], k).toBeTruthy();
    }
  });
});
