/** Services rendus à une extension (protocole 1.0, lot 2) : lecture du modèle, opération explicite, sélection. */
import { describe, expect, it } from "vitest";
import { ajouterRectangle, modeleVide, type Id, type Modele } from "./geometrie-libre.js";
import { DEMANDES_EXTENSION, ERREURS_PROTOCOLE, FONCTIONS_MODIFICATION, type PermissionExtension } from "./protocole-extensions.js";
import { FONCTIONS_SCRIPT, creerFonctionsPlanche } from "./scripts.js";
import { creerServicesExtension, type AccesPlanche, type ModeleLu } from "./services-extensions.js";
import { v3 } from "./vecteur.js";

const TOUTES: readonly PermissionExtension[] = ["modele.lire", "modele.modifier", "selection"];

/** Planche de remplacement : un modèle, une sélection, et le relevé des pas d'annulation appliqués. */
function planche(depart: Modele = modeleVide()) {
  const etat = { modele: depart, selection: [] as Id[], dans: undefined as Id | undefined, pas: [] as string[], refuser: false };
  const acces: AccesPlanche = {
    modele: () => etat.modele,
    selection: () => etat.selection,
    dans: () => etat.dans,
    appliquer: (travail, nom) => {
      if (etat.refuser) return false;
      etat.modele = travail;
      etat.pas.push(nom);
      return true;
    },
    selectionner: (ids) => void (etat.selection = [...ids]),
  };
  return { etat, acces };
}
const carre = () => ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
const ok = (r: { ok: boolean; resultat?: unknown }) => {
  expect(r).toMatchObject({ ok: true });
  return (r as { resultat: unknown }).resultat;
};

describe("services d'une extension — table et permissions", () => {
  it("chaque demande de la table est servie, et chacune exige sa permission", () => {
    const { acces } = planche();
    const sans = creerServicesExtension({ id: "essai", permissions: [] }, acces);
    for (const [nom, permission] of Object.entries(DEMANDES_EXTENSION)) {
      if (permission === null) continue;
      expect(sans.servir(nom, null), nom).toEqual({ ok: false, erreur: "permission_refusee", detail: permission });
      const r = creerServicesExtension({ id: "essai", permissions: TOUTES }, acces).servir(nom, null);
      expect(r.ok === false && r.erreur === "demande_inconnue", nom).toBe(false);
    }
    expect(sans.servir("serveur.appeler", null)).toEqual({ ok: false, erreur: "demande_inconnue", detail: "serveur.appeler" });
  });

  it("les fonctions de modification sont des fonctions d'un script personnel ; les erreurs nouvelles ont leur texte", () => {
    for (const f of FONCTIONS_MODIFICATION) expect(FONCTIONS_SCRIPT).toContain(f);
    expect(ERREURS_PROTOCOLE.operation_absente).toMatch(/opération/);
    expect(ERREURS_PROTOCOLE.operation_refusee).toMatch(/rien n'a été appliqué/);
  });
});

describe("services d'une extension — lecture complète du modèle", () => {
  it("rend faces, arêtes et objets du contexte, en mètres, sans rien modifier", () => {
    const { etat, acces } = planche(carre());
    const avant = etat.modele;
    const lu = ok(creerServicesExtension({ id: "essai", permissions: ["modele.lire"] }, acces).servir("modele.lire", null)) as ModeleLu;
    expect(lu.faces).toHaveLength(1);
    expect(lu.faces[0]).toMatchObject({ trous: 0 });
    expect(lu.faces[0]!.aire).toBeCloseTo(1, 9);
    expect(lu.faces[0]!.points).toHaveLength(4);
    expect(lu.aretes).toHaveLength(4);
    expect(lu.aretes.every((a) => Math.abs(a.longueur - 1) < 1e-9 && a.points.length === 2)).toBe(true);
    expect(lu.objets).toEqual([]);
    expect(lu.enOperation).toBe(false);
    expect(etat.modele).toBe(avant);
    expect(JSON.parse(JSON.stringify(lu))).toEqual(lu);
  });
});

describe("services d'une extension — opération", () => {
  it("opération explicite : rien n'est visible avant la validation, puis un seul pas d'annulation au nom donné", () => {
    const { etat, acces } = planche();
    const s = creerServicesExtension({ id: "essai", permissions: TOUTES }, acces);
    ok(s.servir("operation.ouvrir", { nom: "Poser une boîte" }));
    const elements = ok(s.servir("modele.modifier", { fonction: "boite", arguments: [[0, 0, 0], 1, 1, 1] })) as Id[];
    const objet = ok(s.servir("modele.modifier", { fonction: "grouper", arguments: [elements, "Boîte"] })) as Id;
    // L'extension voit son modèle de travail ; la Planche, rien encore.
    expect((ok(s.servir("modele.lire", null)) as ModeleLu)).toMatchObject({ enOperation: true, objets: [{ id: objet, nom: "Boîte", genre: "groupe" }] });
    expect(Object.keys(etat.modele.racine.occurrences)).toHaveLength(0);
    ok(s.servir("selection.definir", { ids: [objet] }));
    expect(etat.selection).toEqual([]);
    expect(ok(s.servir("operation.valider", null))).toEqual({ crees: [objet] });
    expect(etat.pas).toEqual(["Poser une boîte"]);
    expect(Object.keys(etat.modele.racine.occurrences)).toEqual([objet]);
    expect(etat.selection).toEqual([objet]);
    expect(s.operationOuverte()).toBe(false);
  });

  it("une seule opération à la fois : la seconde est une erreur nommée, la première reste ouverte", () => {
    const s = creerServicesExtension({ id: "essai", permissions: TOUTES }, planche().acces);
    ok(s.servir("operation.ouvrir", { nom: "Première" }));
    expect(s.servir("operation.ouvrir", { nom: "Seconde" })).toEqual({ ok: false, erreur: "operation_deja_ouverte", detail: "Première" });
    expect(s.operationOuverte()).toBe(true);
    expect(s.servir("operation.ouvrir", { nom: "  " }).ok).toBe(false);
  });

  it("abandon : rien n'est appliqué ; valider ou abandonner sans opération est une erreur nommée", () => {
    const { etat, acces } = planche();
    const s = creerServicesExtension({ id: "essai", permissions: TOUTES }, acces);
    expect(s.servir("operation.valider", null)).toMatchObject({ ok: false, erreur: "operation_absente" });
    expect(s.servir("operation.abandonner", null)).toMatchObject({ ok: false, erreur: "operation_absente" });
    ok(s.servir("operation.ouvrir", { nom: "Essai" }));
    ok(s.servir("modele.modifier", { fonction: "ligne", arguments: [[0, 0, 0], [1, 0, 0]] }));
    ok(s.servir("operation.abandonner", null));
    expect(etat.pas).toEqual([]);
    expect(Object.keys(etat.modele.racine.aretes)).toHaveLength(0);
  });

  it("dessin changé depuis l'ouverture : l'opération est refusée par son nom, rien n'est appliqué", () => {
    const { etat, acces } = planche();
    const s = creerServicesExtension({ id: "essai", permissions: TOUTES }, acces);
    ok(s.servir("operation.ouvrir", { nom: "Essai" }));
    ok(s.servir("modele.modifier", { fonction: "ligne", arguments: [[0, 0, 0], [1, 0, 0]] }));
    const autre = carre();
    etat.modele = autre; // l'utilisateur a dessiné entre-temps
    expect(s.servir("operation.valider", null)).toMatchObject({ ok: false, erreur: "operation_refusee" });
    expect(etat.modele).toBe(autre);
    expect(etat.pas).toEqual([]);
    expect(s.operationOuverte()).toBe(false);
  });

  it("la Planche peut refuser d'appliquer : erreur nommée", () => {
    const { etat, acces } = planche();
    etat.refuser = true;
    const s = creerServicesExtension({ id: "essai", permissions: TOUTES }, acces);
    ok(s.servir("operation.ouvrir", { nom: "Essai" }));
    ok(s.servir("modele.modifier", { fonction: "ligne", arguments: [[0, 0, 0], [1, 0, 0]] }));
    expect(s.servir("operation.valider", null)).toMatchObject({ ok: false, erreur: "operation_refusee" });
  });

  it("modification sans opération : opération automatique au nom de l'appel, validée à la fin de l'appel", () => {
    const { etat, acces } = planche();
    const s = creerServicesExtension({ id: "essai", permissions: TOUTES }, acces);
    s.debutAppel("commande.tracer");
    ok(s.servir("modele.modifier", { fonction: "ligne", arguments: [[0, 0, 0], [1, 0, 0]] }));
    ok(s.servir("modele.modifier", { fonction: "ligne", arguments: [[1, 0, 0], [1, 1, 0]] }));
    expect(etat.pas).toEqual([]);
    expect(s.finAppel(true)).toBe(true);
    expect(etat.pas).toEqual(["commande.tracer"]);
    expect(Object.keys(etat.modele.racine.aretes)).toHaveLength(2);
  });

  it("appel en échec : l'opération en cours est abandonnée, automatique ou explicite ; réussi, l'explicite reste ouverte", () => {
    const { etat, acces } = planche();
    const s = creerServicesExtension({ id: "essai", permissions: TOUTES }, acces);
    s.debutAppel("commande.tracer");
    ok(s.servir("modele.modifier", { fonction: "ligne", arguments: [[0, 0, 0], [1, 0, 0]] }));
    expect(s.finAppel(false)).toBe(true);
    expect(etat.pas).toEqual([]);
    expect(s.operationOuverte()).toBe(false);
    s.debutAppel("commande.longue");
    ok(s.servir("operation.ouvrir", { nom: "Longue" }));
    expect(s.finAppel(true)).toBe(true);
    expect(s.operationOuverte()).toBe(true);
    s.abandonner();
    expect(s.operationOuverte()).toBe(false);
  });

  it("arguments refusés : erreur nommée, l'opération reste ouverte et le modèle de travail intact", () => {
    const s = creerServicesExtension({ id: "essai", permissions: TOUTES }, planche().acces);
    ok(s.servir("operation.ouvrir", { nom: "Essai" }));
    expect(s.servir("modele.modifier", { fonction: "afficher", arguments: ["x"] })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    expect(s.servir("modele.modifier", { fonction: "boite", arguments: [[0, 0, 0], -1, 1, 1] })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    expect(s.servir("modele.modifier", { fonction: "effacer", arguments: [["inconnu"]] })).toMatchObject({ ok: false, erreur: "objet_introuvable" });
    expect(s.operationOuverte()).toBe(true);
    expect((ok(s.servir("modele.lire", null)) as ModeleLu).aretes).toHaveLength(0);
  });
});

describe("services d'une extension — remarques de relecture", () => {
  it("une fonction refusée à mi-chemin ne laisse rien dans le modèle de travail", () => {
    // `figer` rend l'état d'avant, opérations comptées et éléments créés compris.
    const f = creerFonctionsPlanche(modeleVide());
    f.api.ligne([0, 0, 5], [1, 0, 5]);
    const [modele, crees] = [f.modele(), f.crees()];
    const revenir = f.figer();
    f.api.boite([0, 0, 0], 1, 1, 1);
    expect(f.modele()).not.toBe(modele);
    revenir();
    expect(f.modele()).toBe(modele);
    expect(f.crees()).toEqual(crees);

    // Par le service : une boîte dont la base tombe sur une face existante trace sa base puis est refusée.
    const { etat, acces } = planche(carre());
    const s = creerServicesExtension({ id: "essai", permissions: TOUTES }, acces);
    ok(s.servir("operation.ouvrir", { nom: "Essai" }));
    expect(s.servir("modele.modifier", { fonction: "boite", arguments: [[0, 0, 0], 1, 1, 1] })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    ok(s.servir("operation.valider", null));
    expect(etat.pas).toEqual([]);
  });

  it("pendant une opération, la sélection demandée se relit, même vide", () => {
    const { etat, acces } = planche(carre());
    const face = Object.keys(etat.modele.racine.faces)[0]!;
    etat.selection = [face];
    const s = creerServicesExtension({ id: "essai", permissions: TOUTES }, acces);
    ok(s.servir("operation.ouvrir", { nom: "Essai" }));
    const objet = ok(s.servir("modele.modifier", { fonction: "grouper", arguments: [[face], "G"] })) as Id;
    ok(s.servir("selection.definir", { ids: [objet] }));
    expect(ok(s.servir("selection.lire", null))).toEqual([objet]);
    ok(s.servir("selection.definir", { ids: [] }));
    expect(ok(s.servir("selection.lire", null))).toEqual([]);
    expect(etat.selection).toEqual([face]);
  });

  it("opération qui ne change que la sélection : refusée si le dessin a changé, la sélection n'est pas posée", () => {
    const { etat, acces } = planche(carre());
    const face = Object.keys(etat.modele.racine.faces)[0]!;
    const s = creerServicesExtension({ id: "essai", permissions: TOUTES }, acces);
    ok(s.servir("operation.ouvrir", { nom: "Choisir" }));
    ok(s.servir("selection.definir", { ids: [face] }));
    etat.modele = modeleVide(); // l'utilisateur a effacé la face entre-temps
    expect(s.servir("operation.valider", null)).toMatchObject({ ok: false, erreur: "operation_refusee" });
    expect(etat.selection).toEqual([]);
    // Sans changement entre-temps : la sélection seule est posée, sans pas d'annulation.
    etat.modele = carre();
    const autre = Object.keys(etat.modele.racine.faces)[0]!;
    ok(s.servir("operation.ouvrir", { nom: "Choisir" }));
    ok(s.servir("selection.definir", { ids: [autre] }));
    ok(s.servir("operation.valider", null));
    expect(etat.selection).toEqual([autre]);
    expect(etat.pas).toEqual([]);
  });
});

describe("services d'une extension — sélection", () => {
  it("lit la sélection existante ; pose une sélection d'objets présents, refuse un identifiant absent", () => {
    const { etat, acces } = planche(carre());
    const face = Object.keys(etat.modele.racine.faces)[0]!;
    etat.selection = [face, "disparu"];
    const s = creerServicesExtension({ id: "essai", permissions: ["selection"] }, acces);
    expect(ok(s.servir("selection.lire", null))).toEqual([face]);
    expect(s.servir("selection.definir", { ids: ["disparu"] })).toEqual({ ok: false, erreur: "objet_introuvable", detail: "disparu" });
    expect(s.servir("selection.definir", { ids: "x" })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    ok(s.servir("selection.definir", { ids: [face, face] }));
    expect(etat.selection).toEqual([face]);
    ok(s.servir("selection.definir", { ids: [] }));
    expect(etat.selection).toEqual([]);
  });
});
