/** Objets O-5 (D-207) : isolement et « Masquer le reste du modèle » — options de vue, le modèle n'est jamais touché. */
import { describe, expect, it } from "vitest";
import { type Id, type Modele, ajouterRectangle, contexte, copier, grouper, masquerEntites, modeleVide } from "./geometrie-libre.js";
import { geometrieVisible } from "./inference.js";
import { v3 } from "./vecteur.js";

const tout = (m: Modele): Id[] => [...Object.keys(contexte(m).faces), ...Object.keys(contexte(m).aretes)];

/** Trois carrés : A et B groupés séparément, C libre ; B contient un sous-groupe D. */
function scene() {
  let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
  const a = grouper(m, tout(m));
  m = ajouterRectangle(a.modele, v3(3, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
  const d = grouper(m, tout(m));
  const b = grouper(d.modele, [d.occurrence]);
  m = ajouterRectangle(b.modele, v3(6, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
  return { m, a: a.occurrence, b: b.occurrence, d: d.occurrence };
}
const xs = (m: Modele, o: Parameters<typeof geometrieVisible>[1]) =>
  geometrieVisible(m, o)
    .faces.map((f) => Math.round(Math.min(...f.exterieur.map((p) => p.x))))
    .sort((x, y) => x - y);

describe("Isoler (O-5)", () => {
  it("isoler A : seul A reste ; isoler A et la face libre C : les deux ; sans isolement, tout", () => {
    const { m, a } = scene();
    expect(xs(m, {})).toEqual([0, 3, 6]);
    expect(xs(m, { isole: { chemin: [], ids: [a] } })).toEqual([0]);
    const c = Object.values(contexte(m).faces).find((f) => contexte(m).sommets[f.exterieur[0]!]!.position.x > 5)!.id;
    expect(xs(m, { isole: { chemin: [], ids: [a, c] } })).toEqual([0, 6]);
    expect(xs(m, { isole: { chemin: [], ids: [] } })).toEqual([0, 3, 6]);
  });

  it("isoler un objet imbriqué (D dans B) : seul D, le contexte traversé n'est pas rendu", () => {
    const { m, b, d } = scene();
    expect(xs(m, { isole: { chemin: [b], ids: [d] } })).toEqual([3]);
  });

  it("restauration : les objets masqués avant l'isolement le restent après, le modèle est inchangé", () => {
    const { m: m0, a } = scene();
    const m = masquerEntites(m0, [a]).modele;
    const fige = JSON.stringify(m);
    expect(xs(m, { isole: { chemin: [], ids: [a] } })).toEqual([]);
    expect(xs(m, {})).toEqual([3, 6]);
    expect(JSON.stringify(m)).toBe(fige);
  });
});

describe("Masquer le reste du modèle (O-5)", () => {
  it("dans B ouvert : délavé par défaut, masqué avec l'option ; sans effet à la racine", () => {
    const { m, b } = scene();
    const delave = geometrieVisible(m, { chemin: [b] }).faces;
    expect(delave.filter((f) => f.horsContexte)).toHaveLength(2);
    expect(xs(m, { chemin: [b], masquerReste: true })).toEqual([3]);
    expect(xs(m, { chemin: [], masquerReste: true })).toEqual([0, 3, 6]);
  });

  it("composants semblables : dans un composant ouvert, ses autres occurrences ne sont pas rendues", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const k = grouper(m, tout(m), { genre: "composant", nom: "Module" });
    m = copier(k.modele, [k.occurrence], v3(4, 0, 0)).modele;
    expect(xs(m, { chemin: [k.occurrence] })).toEqual([0, 4]);
    expect(xs(m, { chemin: [k.occurrence], masquerSemblables: true })).toEqual([0]);
  });

  it("composant imbriqué dans un parent copié : seul le chemin ouvert reste, l'autre copie du parent est masquée", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const k = grouper(m, tout(m), { genre: "composant", nom: "Module" });
    const p = grouper(k.modele, [k.occurrence], { genre: "composant", nom: "Parent" });
    m = copier(p.modele, [p.occurrence], v3(4, 0, 0)).modele;
    expect(xs(m, { chemin: [p.occurrence, k.occurrence] })).toEqual([0, 4]);
    expect(xs(m, { chemin: [p.occurrence, k.occurrence], masquerSemblables: true })).toEqual([0]);
  });
});
