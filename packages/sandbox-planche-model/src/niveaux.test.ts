/**
 * Cas 4 du catalogue, étape 1 : niveaux d'étage nommés (D4-F5-001, D4-F5-054). Les objets rattachés suivent l'altitude
 * de leur niveau en un pas ; la suppression détache sans déplacer ; l'altitude NGF n'est jamais supposée.
 */
import { describe, expect, it } from "vitest";
import { appliquerDeltaPlanche, differencePlanche, empreintePlanche, estDeltaPlanche, lireModelePlanche } from "./delta.js";
import { type Modele, ajouterRectangle, grouper, modeleVide, verrouillerOccurrences } from "./geometrie-libre.js";
import {
  ajouterNiveau,
  altitudeNGF,
  empriseNiveaux,
  estNiveau,
  lireSaisieNiveau,
  modifierNiveau,
  niveauSuivant,
  niveauxTries,
  objetsDuNiveau,
  rattacherAuNiveau,
  rattacherNouveauxObjets,
  repereDuNiveau,
  supprimerNiveau,
  texteAltitude,
} from "./niveaux.js";
import { v3 } from "./vecteur.js";

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

/** Une dalle groupée à l'altitude z. */
function dalle(m: Modele, z: number): { modele: Modele; occ: string } {
  const r = ajouterRectangle(m, v3(0, 0, z), v3(4, 0, 0), v3(0, 3, 0));
  const faces = Object.keys(r.modele.racine.faces).filter((f) => !m.racine.faces[f]);
  const g = grouper(r.modele, faces);
  return { modele: g.modele, occ: g.occurrence };
}
const zDe = (m: Modele, occ: string): number => m.racine.occurrences[occ]!.transformation[11]!;

describe("niveaux d'étage", () => {
  it("ajoute des niveaux nommés, triés du plus haut au plus bas ; un nom ne sert qu'une fois", () => {
    let m = modeleVide();
    m = ok(ajouterNiveau(m, { nom: "RDC", altitude: 0, hauteur: 2.85 })).modele;
    m = ok(ajouterNiveau(m, { nom: "R+1", altitude: 2.85, hauteur: 2.85 })).modele;
    m = ok(ajouterNiveau(m, { nom: "R+2", altitude: 5.7, hauteur: 2.85 })).modele;
    expect(niveauxTries(m).map((n) => n.nom)).toEqual(["R+2", "R+1", "RDC"]);
    expect(niveauxTries(m).every((n) => n.id.startsWith("n"))).toBe(true);
    expect(ajouterNiveau(m, { nom: " r+1 ", altitude: 9, hauteur: 3 })).toEqual({ ok: false, erreur: "nom-pris" });
    expect(ajouterNiveau(m, { nom: " ", altitude: 9, hauteur: 3 })).toEqual({ ok: false, erreur: "nom" });
    expect(ajouterNiveau(m, { nom: "R+3", altitude: 9, hauteur: 0 })).toEqual({ ok: false, erreur: "hauteur" });
    expect(ajouterNiveau(m, { nom: "R+3", altitude: Number.NaN, hauteur: 3 })).toEqual({ ok: false, erreur: "altitude" });
  });

  it("propose l'étage suivant d'après les niveaux déclarés, jamais une valeur supposée", () => {
    let m = modeleVide();
    expect(niveauSuivant(m)).toBeNull();
    m = ok(ajouterNiveau(m, { nom: "RDC", altitude: 0, hauteur: 2.85 })).modele;
    expect(niveauSuivant(m)).toEqual({ nom: "R+1", altitude: 2.85, hauteur: 2.85 });
    m = ok(ajouterNiveau(m, niveauSuivant(m)!)).modele;
    expect(niveauSuivant(m)).toEqual({ nom: "R+2", altitude: 5.7, hauteur: 2.85 });
    m = ok(ajouterNiveau(m, { nom: "Combles", altitude: 8, hauteur: 2 })).modele;
    expect(niveauSuivant(m)).toEqual({ nom: "Niveau 4", altitude: 10, hauteur: 2 });
  });

  it("lit la saisie à la virgule ou au point, sans rien corriger en silence", () => {
    expect(lireSaisieNiveau({ nom: " R+1 ", altitude: "+2,85", hauteur: "2.85" })).toEqual({ valeurs: { nom: "R+1", altitude: 2.85, hauteur: 2.85 } });
    expect(lireSaisieNiveau({ nom: "Sous-sol", altitude: "−3", hauteur: "3" })).toEqual({ erreur: "altitude" });
    expect(lireSaisieNiveau({ nom: "Sous-sol", altitude: "-3", hauteur: "3" })).toEqual({ valeurs: { nom: "Sous-sol", altitude: -3, hauteur: 3 } });
    expect(lireSaisieNiveau({ nom: "RDC", altitude: "±0,00", hauteur: "2,85" })).toEqual({ valeurs: { nom: "RDC", altitude: 0, hauteur: 2.85 } });
    expect(lireSaisieNiveau({ nom: "RDC", altitude: "", hauteur: "2,85" })).toEqual({ erreur: "altitude" });
    expect(lireSaisieNiveau({ nom: "RDC", altitude: "0", hauteur: "-1" })).toEqual({ erreur: "hauteur" });
    expect(lireSaisieNiveau({ nom: "", altitude: "0", hauteur: "1" })).toEqual({ erreur: "nom" });
  });

  it("changer l'altitude d'un niveau déplace tous ses objets du même écart, et eux seuls", () => {
    let m = modeleVide();
    const a = dalle(m, 2.85);
    const b = dalle(a.modele, 0);
    m = b.modele;
    const r1 = ok(ajouterNiveau(m, { nom: "R+1", altitude: 2.85, hauteur: 2.85 }));
    m = r1.modele;
    const rat = rattacherAuNiveau(m, [a.occ], r1.id);
    if ("erreur" in rat) throw new Error(rat.erreur);
    expect(rat.nombre).toBe(1);
    m = rat.modele;
    expect(objetsDuNiveau(m, r1.id)).toEqual([a.occ]);
    const zA = zDe(m, a.occ);
    const zB = zDe(m, b.occ);
    m = ok(modifierNiveau(m, r1.id, { nom: "R+1", altitude: 3.1, hauteur: 3.1 })).modele;
    expect(zDe(m, a.occ)).toBeCloseTo(zA + 0.25, 9);
    expect(zDe(m, b.occ)).toBe(zB);
    expect(m.annotations?.niveaux?.[r1.id]).toEqual({ id: r1.id, nom: "R+1", altitude: 3.1, hauteur: 3.1 });
  });

  it("un objet verrouillé bloque le changement d'altitude de son niveau ; le renommage reste possible", () => {
    let m = modeleVide();
    const a = dalle(m, 0);
    const r = ok(ajouterNiveau(a.modele, { nom: "RDC", altitude: 0, hauteur: 2.5 }));
    const rat = rattacherAuNiveau(r.modele, [a.occ], r.id);
    if ("erreur" in rat) throw new Error(rat.erreur);
    m = verrouillerOccurrences(rat.modele, [a.occ], true).modele;
    expect(modifierNiveau(m, r.id, { nom: "RDC", altitude: 1, hauteur: 2.5 })).toEqual({ ok: false, erreur: "verrou" });
    expect(ok(modifierNiveau(m, r.id, { nom: "Rez", altitude: 0, hauteur: 2.6 })).modele.annotations?.niveaux?.[r.id]?.nom).toBe("Rez");
  });

  it("supprimer un niveau détache ses objets sans les déplacer", () => {
    const a = dalle(modeleVide(), 2.85);
    const r = ok(ajouterNiveau(a.modele, { nom: "R+1", altitude: 2.85, hauteur: 2.85 }));
    const rat = rattacherAuNiveau(r.modele, [a.occ], r.id);
    if ("erreur" in rat) throw new Error(rat.erreur);
    const z = zDe(rat.modele, a.occ);
    const s = ok(supprimerNiveau(rat.modele, r.id)).modele;
    expect(s.annotations?.niveaux).toBeUndefined();
    expect(s.racine.occurrences[a.occ]?.niveau).toBeUndefined();
    expect(zDe(s, a.occ)).toBe(z);
    expect(supprimerNiveau(s, r.id)).toEqual({ ok: false, erreur: "absent" });
  });

  it("niveau de travail : seuls les objets nouveaux et sans niveau lui sont rattachés", () => {
    const a = dalle(modeleVide(), 0);
    const r = ok(ajouterNiveau(a.modele, { nom: "RDC", altitude: 0, hauteur: 2.5 }));
    const b = dalle(r.modele, 0);
    const apres = rattacherNouveauxObjets(r.modele, b.modele, r.id);
    expect(apres.racine.occurrences[b.occ]?.niveau).toBe(r.id);
    expect(apres.racine.occurrences[a.occ]?.niveau).toBeUndefined();
    expect(rattacherNouveauxObjets(r.modele, r.modele, r.id)).toBe(r.modele);
    expect(rattacherNouveauxObjets(r.modele, b.modele, "n999")).toBe(b.modele);
    expect(repereDuNiveau({ id: "n1", nom: "R+1", altitude: 2.85, hauteur: 2.85 }).origine).toEqual({ x: 0, y: 0, z: 2.85 });
  });

  it("altitude NGF depuis le niveau de référence, sinon non évaluée ; écriture à la française", () => {
    expect(altitudeNGF(2.85, 375.2)).toBeCloseTo(378.05, 9);
    expect(altitudeNGF(2.85, null)).toBeNull();
    expect(texteAltitude(0)).toBe("±0,00");
    expect(texteAltitude(2.85)).toBe("+2,85");
    expect(texteAltitude(-1.2)).toBe("−1,20");
    expect(texteAltitude(5.7, ".")).toBe("+5.70");
  });

  it("emprise des plans de niveau : le dessin plus 1 m, ou un carré de 10 m pour un dessin vide", () => {
    expect(empriseNiveaux(modeleVide())).toEqual({ min: { x: -5, y: -5, z: 0 }, max: { x: 5, y: 5, z: 0 } });
    const e = empriseNiveaux(dalle(modeleVide(), 0).modele);
    expect(e.min.x).toBeCloseTo(-1, 9);
    expect(e.max.x).toBeCloseTo(5, 9);
    expect(e.max.y).toBeCloseTo(4, 9);
  });

  it("persistance : delta, application, empreinte et lecture validée du document", () => {
    const a = dalle(modeleVide(), 0);
    const r = ok(ajouterNiveau(a.modele, { nom: "RDC", altitude: 0, hauteur: 2.5 }));
    const rat = rattacherAuNiveau(r.modele, [a.occ], r.id);
    if ("erreur" in rat) throw new Error(rat.erreur);
    const d = differencePlanche(a.modele, rat.modele);
    expect(d && estDeltaPlanche(JSON.parse(JSON.stringify(d)))).toBe(true);
    expect(empreintePlanche(appliquerDeltaPlanche(a.modele, d!))).toBe(empreintePlanche(rat.modele));
    expect(lireModelePlanche(JSON.parse(JSON.stringify(rat.modele)))).not.toBeNull();
    const faux = JSON.parse(JSON.stringify(rat.modele));
    faux.annotations.niveaux[r.id].hauteur = 0;
    expect(lireModelePlanche(faux)).toBeNull();
    expect(estDeltaPlanche({ annotations: { niveaux: { n1: { id: "n1", nom: "", altitude: 0, hauteur: 1 } } } })).toBe(false);
    expect(estNiveau("n1", { id: "n1", nom: "RDC", altitude: 0, hauteur: 2.5 })).toBe(true);
  });
});
