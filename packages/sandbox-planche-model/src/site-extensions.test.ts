/** Protocole 1.6 (cas 3, lot 4, site) : site.lire, geometrie.rayon et la fonction de dessin « triangles ». */
import { describe, expect, it } from "vitest";
import { REGLAGES_DEFAUT } from "./annotations.js";
import { ajouterRectangle, baliserOccurrences, grouper, modeleVide, modifierAnnotations, type Id, type Modele } from "./geometrie-libre.js";
import type { PermissionExtension } from "./protocole-extensions.js";
import { MAX_RAYONS_APPEL, MAX_TRIANGLES_APPEL, creerServicesExtension, type AccesPlanche } from "./services-extensions.js";
import { v3 } from "./vecteur.js";

function planche(depart: Modele = modeleVide()) {
  const etat = { modele: depart, pas: [] as string[] };
  const acces: AccesPlanche = {
    modele: () => etat.modele,
    selection: () => [],
    dans: () => undefined,
    appliquer: (travail, nom) => {
      etat.modele = travail;
      etat.pas.push(nom);
      return true;
    },
    selectionner: () => {},
  };
  return { etat, acces };
}
const MODIF: readonly PermissionExtension[] = ["modele.lire", "modele.modifier"];
const servir = (acces: AccesPlanche, nom: string, donnees: unknown, permissions: readonly PermissionExtension[] = MODIF) => {
  const s = creerServicesExtension({ id: "essai", permissions }, acces);
  s.debutAppel("commande.essai");
  const r = s.servir(nom, donnees);
  s.finAppel(r.ok);
  return r;
};
const ok = <T>(r: { ok: boolean; resultat?: unknown }): T => {
  expect(r).toMatchObject({ ok: true });
  return (r as { resultat: T }).resultat;
};
const avecEmplacement = (m: Modele, emplacement: unknown): Modele =>
  modifierAnnotations(m, (a) => {
    a.reglages = { ...REGLAGES_DEFAUT, ...a.reglages, emplacement } as never;
  }).modele;

describe("protocole 1.6 : site.lire", () => {
  it("rend l'Emplacement saisi tel quel, altitude et lieu à null s'ils manquent ; null sans Emplacement", () => {
    const { acces } = planche(avecEmplacement(modeleVide(), { latitude: 46.2, longitude: 6.15, nord: 12.5, altitude: 375, lieu: "Atelier" }));
    expect(ok(servir(acces, "site.lire", null))).toEqual({ emplacement: { latitude: 46.2, longitude: 6.15, altitude: 375, lieu: "Atelier", nord: 12.5 } });
    const sansAlt = planche(avecEmplacement(modeleVide(), { latitude: 46.2, longitude: 6.15, nord: 0 }));
    expect(ok(servir(sansAlt.acces, "site.lire", null))).toEqual({ emplacement: { latitude: 46.2, longitude: 6.15, altitude: null, lieu: null, nord: 0 } });
    expect(ok(servir(planche().acces, "site.lire", null))).toEqual({ emplacement: null });
  });
  it("exige la permission modele.lire", () => {
    expect(servir(planche().acces, "site.lire", null, [])).toEqual({ ok: false, erreur: "permission_refusee", detail: "modele.lire" });
  });
});

describe("protocole 1.6 : triangles", () => {
  it("un pavé de 12 triangles devient 6 faces, en une seule opération", () => {
    const { etat, acces } = planche();
    const P = (x: number, y: number, z: number) => [x, y, z];
    const [a, b, c, d, e, f, g, h] = [P(0, 0, 0), P(2, 0, 0), P(2, 1, 0), P(0, 1, 0), P(0, 0, 3), P(2, 0, 3), P(2, 1, 3), P(0, 1, 3)];
    const tris = [[a, c, b], [a, d, c], [e, f, g], [e, g, h], [a, b, f], [a, f, e], [b, c, g], [b, g, f], [c, d, h], [c, h, g], [d, a, e], [d, e, h]];
    ok(servir(acces, "modele.modifier", { fonction: "triangles", arguments: [tris] }));
    expect(Object.keys(etat.modele.racine.faces)).toHaveLength(6);
    expect(etat.pas).toEqual(["commande.essai"]);
  });
  it("refuse sans rien créer : liste vide, trop longue, point mal formé, triangle d'aire nulle (rang nommé)", () => {
    const { etat, acces } = planche();
    const trop = Array.from({ length: MAX_TRIANGLES_APPEL + 1 }, (_, i) => [[i, 0, 0], [i + 1, 0, 0], [i, 1, 0]]);
    for (const faux of [[], trop, [[[0, 0, 0], [1, 0, 0]]], [[[0, 0, 0], [1, "a", 0], [0, 1, 0]]]]) {
      expect(servir(acces, "modele.modifier", { fonction: "triangles", arguments: [faux] })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    }
    expect(servir(acces, "modele.modifier", { fonction: "triangles", arguments: [[[[0, 0, 0], [1, 0, 0], [0, 1, 0]], [[0, 0, 0], [1, 0, 0], [2, 0, 0]]]] })).toEqual({ ok: false, erreur: "argument_invalide", detail: "triangles : le triangle 2 est d'aire nulle" });
    expect(etat.pas).toEqual([]);
    expect(Object.keys(etat.modele.racine.faces)).toHaveLength(0);
  });
});

describe("protocole 1.6 : geometrie.rayon", () => {
  // Deux carrés horizontaux : l'un au sol (racine), l'autre à 3 m dans un groupe.
  const deuxCarres = () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 4, 0)).modele;
    const avant = new Set(Object.keys(m.racine.faces));
    m = ajouterRectangle(m, v3(0, 0, 3), v3(4, 0, 0), v3(0, 4, 0)).modele;
    const haut = Object.keys(m.racine.faces).filter((id) => !avant.has(id));
    const g = grouper(m, [...haut, ...Object.keys(m.racine.aretes).filter((id) => { const ar = m.racine.aretes[id]!; return m.racine.sommets[ar.a]!.position.z === 3; })]);
    return { m: g.modele, groupe: g.rapport.crees.find((id) => g.modele.racine.occurrences[id]) as Id };
  };

  it("premier impact de chaque rayon : point, distance, face, chemin et normale ; null quand rien n'est touché", () => {
    const { m, groupe } = deuxCarres();
    const { acces } = planche(m);
    const { impacts } = ok<{ impacts: ({ point: number[]; distance: number; chemin: string[]; normale: number[] } | null)[] }>(
      servir(acces, "geometrie.rayon", { rayons: [{ origine: [1, 1, 10], direction: [0, 0, -2] }, { origine: [1, 1, 1], direction: [0, 0, -1] }, { origine: [9, 9, 10], direction: [0, 0, -1] }] }),
    );
    expect(impacts[0]).toMatchObject({ point: [1, 1, 3], distance: 7, chemin: [groupe] });
    expect(Math.abs(impacts[0]!.normale[2]!)).toBeCloseTo(1, 9);
    expect(impacts[1]).toMatchObject({ point: [1, 1, 0], distance: 1, chemin: [] });
    expect(impacts[2]).toBeNull();
  });
  it("distanceMax et objets limitent la visée ; une balise masquée n'est pas visée", () => {
    const { m, groupe } = deuxCarres();
    const vers = (acc: AccesPlanche, d: Record<string, unknown>) => ok<{ impacts: ({ distance: number } | null)[] }>(servir(acc, "geometrie.rayon", { rayons: [{ origine: [1, 1, 10], direction: [0, 0, -1] }], ...d })).impacts[0];
    expect(vers(planche(m).acces, { distanceMax: 5 })).toBeNull();
    expect(vers(planche(m).acces, { objets: [groupe] })).toMatchObject({ distance: 7 });
    const masque = modifierAnnotations(baliserOccurrences(m, [groupe], "b1").modele, (a) => {
      a.balises = { b1: { id: "b1", nom: "Contexte", couleur: "#888888", visible: false } } as never;
    }).modele;
    expect(vers(planche(masque).acces, {})).toMatchObject({ distance: 10 });
  });
  it("refuse les arguments faux, un objet inconnu, et sans permission modele.lire", () => {
    const { acces } = planche(deuxCarres().m);
    const trop = Array.from({ length: MAX_RAYONS_APPEL + 1 }, () => ({ origine: [0, 0, 1], direction: [0, 0, -1] }));
    for (const faux of [{}, { rayons: [] }, { rayons: trop }, { rayons: [{ origine: [0, 0], direction: [0, 0, 1] }] }, { rayons: [{ origine: [0, 0, 0], direction: [0, 0, 0] }] }, { rayons: [{ origine: [0, 0, 0], direction: [0, 0, 1] }], distanceMax: -1 }]) {
      expect(servir(acces, "geometrie.rayon", faux)).toMatchObject({ ok: false, erreur: "argument_invalide" });
    }
    expect(servir(acces, "geometrie.rayon", { rayons: [{ origine: [0, 0, 1], direction: [0, 0, -1] }], objets: ["inconnu"] })).toEqual({ ok: false, erreur: "objet_introuvable", detail: "inconnu" });
    expect(servir(acces, "geometrie.rayon", { rayons: [{ origine: [0, 0, 1], direction: [0, 0, -1] }] }, [])).toEqual({ ok: false, erreur: "permission_refusee", detail: "modele.lire" });
  });
});
