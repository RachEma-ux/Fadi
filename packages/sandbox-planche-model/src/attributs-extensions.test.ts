/** Matières, balises et unités servies à une extension (protocole 1.0, lot 7). */
import { describe, expect, it } from "vitest";
import { contexte, modeleVide, modifierAnnotations, type Id, type Modele } from "./geometrie-libre.js";
import { creerFonctionsPlanche } from "./scripts.js";
import { creerServicesExtension, type AccesPlanche, type ModeleLu } from "./services-extensions.js";

/** Une boîte groupée, une face libre, une matière et une balise. */
function depart() {
  const f = creerFonctionsPlanche(modeleVide());
  const objet = f.api.grouper(f.api.boite([0, 0, 0], 1, 1, 1) as Id[], "Boîte") as Id;
  const face = f.api.rectangle([5, 0, 0], [1, 0, 0], [0, 1, 0]) as Id;
  const r = modifierAnnotations(f.modele(), (a, id) => {
    const matiere = id("m");
    const balise = id("b");
    a.materiaux[matiere] = { id: matiere, nom: "Chêne", couleur: "#b08040" };
    a.balises[balise] = { id: balise, nom: "Mobilier", couleur: "#3366cc", visible: true };
    return { matiere, balise };
  });
  return { modele: r.modele, objet, face, ...r.extra };
}
function planche(m: Modele, separateur?: "." | ",") {
  const etat = { modele: m, pas: [] as string[] };
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
    ...(separateur ? { separateur: () => separateur } : {}),
  };
  return { etat, s: creerServicesExtension({ id: "essai", permissions: ["modele.lire", "modele.modifier"] }, acces), acces };
}
const ok = (r: { ok: boolean; resultat?: unknown }) => {
  expect(r).toMatchObject({ ok: true });
  return (r as { resultat: unknown }).resultat;
};

describe("matières et balises d'une extension", () => {
  it("lit les matières et les balises du dessin", () => {
    const d = depart();
    const { s } = planche(d.modele);
    expect(ok(s.servir("matieres.lire", null))).toEqual([{ id: d.matiere, nom: "Chêne", couleur: "#b08040" }]);
    expect(ok(s.servir("balises.lire", null))).toEqual([{ id: d.balise, nom: "Mobilier", couleur: "#3366cc", visible: true }]);
  });

  it("applique une matière à une face et à un objet, une balise à un objet, en un seul pas ; la lecture les rend", () => {
    const d = depart();
    const { etat, s } = planche(d.modele);
    s.debutAppel("Habiller");
    ok(s.servir("matieres.appliquer", { ids: [d.face, d.objet], matiere: d.matiere }));
    ok(s.servir("balises.appliquer", { ids: [d.objet], balise: d.balise }));
    expect(etat.pas).toEqual([]);
    expect(s.finAppel(true)).toBe(true);
    expect(etat.pas).toEqual(["Habiller"]);
    const c = contexte(etat.modele, undefined);
    expect(c.faces[d.face]!.materiauRecto).toBe(d.matiere);
    expect(c.occurrences[d.objet]).toMatchObject({ materiau: d.matiere, balise: d.balise });
    const lu = ok(s.servir("modele.lire", null)) as ModeleLu;
    expect(lu.faces.find((f) => f.id === d.face)?.matiere).toBe(d.matiere);
    expect(lu.objets[0]).toMatchObject({ matiere: d.matiere, balise: d.balise });
    s.debutAppel("Retirer");
    ok(s.servir("matieres.appliquer", { ids: [d.face], matiere: null }));
    s.finAppel(true);
    expect(contexte(etat.modele, undefined).faces[d.face]!.materiauRecto).toBeUndefined();
  });

  it("refus nommés : matière ou objet inconnu, balise sur une face, forme, permission ; rien n'est gardé", () => {
    const d = depart();
    const { etat, s, acces } = planche(d.modele);
    s.debutAppel("x");
    expect(s.servir("matieres.appliquer", { ids: [d.face], matiere: "m999" })).toMatchObject({ ok: false, erreur: "objet_introuvable" });
    expect(s.servir("matieres.appliquer", { ids: ["f999"], matiere: d.matiere })).toMatchObject({ ok: false, erreur: "objet_introuvable" });
    expect(s.servir("balises.appliquer", { ids: [d.face], balise: d.balise })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    expect(s.servir("matieres.appliquer", { ids: [], matiere: d.matiere })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    expect(s.servir("matieres.appliquer", { ids: [d.face] })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    s.finAppel(true);
    expect(etat.modele).toBe(d.modele);
    const lecture = creerServicesExtension({ id: "essai", permissions: ["modele.lire"] }, acces);
    expect(lecture.servir("matieres.appliquer", { ids: [d.face], matiere: d.matiere })).toEqual({ ok: false, erreur: "permission_refusee", detail: "modele.modifier" });
    expect(creerServicesExtension({ id: "essai", permissions: [] }, acces).servir("matieres.lire", null)).toMatchObject({ ok: false, erreur: "permission_refusee" });
  });
});

describe("unités d'une extension", () => {
  it("le dessin est en mètres ; la mise en forme suit le séparateur de l'interface, sans permission", () => {
    const d = depart();
    const sans = creerServicesExtension({ id: "essai", permissions: [] }, planche(d.modele).acces);
    expect(ok(sans.servir("unites.lire", null))).toEqual({ longueur: "m", aire: "m²", decimales: 2, separateur: "," });
    expect(ok(sans.servir("unites.formater", { valeur: 3.6 }))).toBe("3,60 m");
    expect(ok(sans.servir("unites.formater", { valeur: 12.345, genre: "aire" }))).toBe("12,3 m²");
    const point = creerServicesExtension({ id: "essai", permissions: [] }, planche(d.modele, ".").acces);
    expect(ok(point.servir("unites.formater", { valeur: 3.6 }))).toBe("3.60 m");
    expect(sans.servir("unites.formater", { valeur: "3" })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    expect(sans.servir("unites.formater", { valeur: 1, genre: "volume" })).toMatchObject({ ok: false, erreur: "argument_invalide" });
  });
});
