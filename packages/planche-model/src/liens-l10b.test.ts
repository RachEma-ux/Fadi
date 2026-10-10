/** Lot 10b (EX-LINK-01 à 05 ; cas L-01 à L-05 de la V1) : cycle de vie des liens d'extrusion. */
import { describe, expect, it } from "vitest";
import { type Id, type Modele, ERREUR_RECALCUL_LIEN, ajouterPolygone, ajouterSegment, contexte, couronne, deplacer, effacerEntites, etirerAretes, grouper, modeleVide } from "./geometrie-libre.js";
import { v3 } from "./vecteur.js";
import { clicVers, partie, saisie, survolVers } from "./outils/essais-modification.js";
import { CONSIGNE_LIEN_RACINE, actionExtrusion, machinePousserTirer } from "./outils/pousser-tirer.js";

const liens = (m: Modele) => Object.keys(m.annotations?.extrusions ?? {});
const ligne = () => {
  const m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
  return { m, a: Object.keys(m.racine.aretes)[0] as Id };
};

describe("Création du lien (EX-LINK-02)", () => {
  it("par défaut lié à la racine ; `lier: false` crée une surface indépendante", () => {
    const { m, a } = ligne();
    expect(liens(etirerAretes(m, [a], v3(0, 0, 2)).modele)).toHaveLength(1);
    expect(liens(etirerAretes(m, [a], v3(0, 0, 2), { lier: false }).modele)).toHaveLength(0);
  });
  it("L-02 : dans un groupe, la géométrie est créée, indépendante (aucun lien hors de la racine)", () => {
    const { m, a } = ligne();
    const g = grouper(m, [a]);
    const dedans = Object.keys(g.modele.definitions[g.definition]!.contenu.aretes)[0] as Id;
    const r = etirerAretes(g.modele, [dedans], v3(0, 0, 2), { dans: g.occurrence }).modele;
    expect(Object.keys(r.definitions[g.definition]!.contenu.faces)).toHaveLength(1);
    expect(liens(r)).toHaveLength(0);
  });
});

describe("Cycle de vie (EX-LINK-03)", () => {
  it("L-01 : déplacer la source seule recalcule la surface dans la même opération", () => {
    const { m, a } = ligne();
    const r = etirerAretes(m, [a], v3(0, 0, 2)).modele;
    const d = deplacer(r, [a], v3(0, 1, 0)).modele;
    expect(liens(d)).toHaveLength(1);
    const ys = Object.values(contexte(d).sommets).map((s) => s.position.y);
    expect(Math.min(...ys)).toBeCloseTo(1, 9);
    expect(Math.max(...ys)).toBeCloseTo(1, 9);
  });
  it("L-03 : source supprimée — lien rompu ; le modèle d'avant (annuler) garde la relation intacte", () => {
    const { m, a } = ligne();
    const r = etirerAretes(m, [a], v3(0, 0, 2)).modele;
    const e = effacerEntites(r, [a]).modele;
    expect(liens(e)).toHaveLength(0);
    expect(liens(r)).toHaveLength(1);
  });
  it("L-04 : un recalcul invalide refuse la modification de la source ; le modèle précédent est conservé", () => {
    // Couronne sur un hexagone, puis un sommet du contour sorti de son plan : la couronne ne peut plus être recalculée.
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 6).modele;
    const ids = Object.keys(m.racine.aretes);
    const r = couronne(m, ids, 0.5).modele;
    const s = Object.values(m.racine.sommets)[0]!;
    const arete = Object.values(contexte(r).aretes).find((x) => (x.a === s.id || x.b === s.id) && ids.includes(x.id))!;
    let refus: unknown = null;
    try {
      deplacer(r, [arete.id], v3(0, 0, 0.7));
    } catch (err) {
      refus = err;
    }
    expect(String(refus)).toContain(ERREUR_RECALCUL_LIEN);
    expect(liens(r)).toHaveLength(1);
  });
});

describe("Ordre déterministe (EX-LINK-04)", () => {
  it("L-05 : une surface tirée d'une sortie liée détache la première (géométrie étrangère) — aucune chaîne, donc aucun cycle ; résultat déterministe", () => {
    const { m, a } = ligne();
    const r1 = etirerAretes(m, [a], v3(0, 0, 2)).modele;
    const [premier] = liens(r1);
    const haut = Object.values(contexte(r1).aretes).find((x) => x.id !== a && Math.abs(contexte(r1).sommets[x.a]!.position.z - 2) < 1e-9 && Math.abs(contexte(r1).sommets[x.b]!.position.z - 2) < 1e-9)!;
    const r2 = etirerAretes(r1, [haut.id], v3(0, 2, 0)).modele;
    expect(liens(r2)).toHaveLength(1);
    expect(liens(r2)).not.toContain(premier);
    const x = deplacer(r2, [haut.id], v3(0, 0, 1)).modele;
    const y = deplacer(r2, [haut.id], v3(0, 0, 1)).modele;
    expect(JSON.stringify(x)).toBe(JSON.stringify(y));
    expect(liens(x)).toHaveLength(1);
  });
});

describe("Option « Lien » de Pousser/Tirer (EX-LINK-02)", () => {
  it("par défaut liée ; « Indépendant » (bouton ou action) crée la surface sans lien", () => {
    const { m } = ligne();
    const p = partie(machinePousserTirer, m).jouer(clicVers(v3(2, 0, 0)), survolVers(v3(2, 0, 1), v3(2, -10, 1)), saisie("2"));
    expect(liens(p.modele)).toHaveLength(1);
    const q = partie(machinePousserTirer, m);
    q.etat = actionExtrusion(q.etat, { type: "set-option", option: "keep-source-link", value: false }).etat;
    q.jouer(clicVers(v3(2, 0, 0)), survolVers(v3(2, 0, 1), v3(2, -10, 1)), saisie("2"));
    expect(Object.keys(q.modele.racine.faces)).toHaveLength(1);
    expect(liens(q.modele)).toHaveLength(0);
  });
  it("L-02 : dans un groupe, la consigne dit la restriction et « Liée » n'est pas proposée", () => {
    const { m, a } = ligne();
    const g = grouper(m, [a]);
    const p = partie(machinePousserTirer, g.modele);
    const ctx = { ...p.ctx(), dans: g.occurrence };
    const t = machinePousserTirer.traiter(p.etat, clicVers(v3(2, 0, 0)), ctx);
    const v = machinePousserTirer.vue(t.etat, ctx);
    expect(v.consigne).toContain(CONSIGNE_LIEN_RACINE);
    expect(v.options?.find((o) => o.id === "lien")?.valeurs.find((x) => x.id === "lie")?.disponible).toBe(false);
  });
});

describe("P-11 — distance par côté et total (EX-NUM-03)", () => {
  it("en symétrique, la consigne donne le total des deux côtés", () => {
    const { m } = ligne();
    const p = partie(machinePousserTirer, m).jouer(clicVers(v3(2, 0, 0))).configurer("arete", "deux-cotes").jouer(survolVers(v3(2, 0, 1), v3(2, -10, 1)));
    expect(p.vue().consigne).toMatch(/total 2[.,]00 m/);
  });
});
