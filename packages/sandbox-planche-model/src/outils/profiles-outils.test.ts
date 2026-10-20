/** Lot L12 : machines Profilé et Profilés depuis arêtes — section de l'interface, placement, un pas par pose. */
import { describe, expect, it } from "vitest";
import { type Id, type Modele, ajouterSegment, contexte, grouperVide, modeleVide, piecesLiees, tourner, volume } from "../geometrie-libre.js";
import { geometrieVisible } from "../inference.js";
import type { SectionCourante } from "../profiles.js";
import { v3 } from "../vecteur.js";
import { clicVers, echap, partie, saisie, survolVers, touche } from "./essais-modification.js";
import type { ContexteOutil, MachineOutil } from "./machine.js";
import { ERREUR_SANS_SECTION, machineProfile } from "./profile.js";
import { ERREUR_SANS_ARETES, chaineFermee, machineProfilesAretes } from "./profiles-aretes.js";

/** Section d'essai (donnée du test) : rectangle 0,10 × 0,05, saisie. */
const SECTION: SectionCourante = {
  designation: "Rectangle 100 × 50 mm (saisie d'essai)",
  section: { exterieur: [{ y: -0.05, z: -0.025 }, { y: 0.05, z: -0.025 }, { y: 0.05, z: 0.025 }, { y: -0.05, z: 0.025 }], trous: [] },
  source: { genre: "saisie" },
};

/** Partie dont le contexte porte une section courante (comme la fournit l'interface). */
function avecSection<E>(machine: MachineOutil<E>, m: Modele, selection: readonly string[] = [], section: SectionCourante | null = SECTION) {
  const p = partie(machine, m, selection);
  const ctx0 = p.ctx;
  p.ctx = (): ContexteOutil => ({ ...ctx0(), ...(section ? { sectionCourante: section } : {}) });
  return p;
}
const occs = (m: Modele) => Object.keys(contexte(m).occurrences);

describe("Profilé (L12)", () => {
  it("sans section : consigne et refus nommés, rien n'est posé", () => {
    const p = avecSection(machineProfile, modeleVide(), [], null).jouer(clicVers(v3(0, 0, 0)));
    expect(p.vue().erreur).toBe(ERREUR_SANS_SECTION);
    expect(p.vue().consigne).toContain(ERREUR_SANS_SECTION);
    expect(p.historique).toHaveLength(1);
  });

  it("deux clics : une pièce de 3,00 m (0,015 m³), un pas « Profilé », la pièce sélectionnée, retour à l'étape 1", () => {
    const p = avecSection(machineProfile, modeleVide()).jouer(clicVers(v3(0, 0, 0)), survolVers(v3(3, 0, 0)));
    expect(p.vue().apercu.faces.length).toBe(6);
    expect(p.vue().mesures?.valeur).toBe("3.00");
    p.jouer(clicVers(v3(3, 0, 0)));
    expect(p.operations).toEqual(["Profilé"]);
    const [o] = occs(p.modele);
    expect(p.selection).toEqual([o]);
    expect(volume(p.modele, o as Id)).toBeCloseTo(0.015, 9);
    expect((p.etat as { etape: number }).etape).toBe(1);
    expect(p.modele.definitions[contexte(p.modele).occurrences[o as Id]!.definition]!.piece?.source).toEqual({ genre: "saisie" });
  });

  it("longueur tapée dans la direction du curseur ; flèche droite = verrou rouge", () => {
    const p = avecSection(machineProfile, modeleVide()).jouer(clicVers(v3(0, 0, 0)), touche("FlecheDroite"), survolVers(v3(2, 1, 0)), saisie("3"));
    expect(p.operations).toEqual(["Profilé"]);
    const [o] = occs(p.modele);
    expect(volume(p.modele, o as Id)).toBeCloseTo(0.015, 9);
    const t = contexte(p.modele).occurrences[o as Id]!.transformation;
    expect([t[0], t[4], t[8]]).toEqual([1, 0, 0]); // axe le long de X rouge
  });

  it("Ctrl seul fait défiler le point de placement, Alt seul bascule la rotation ; Échap annule le début", () => {
    const p = avecSection(machineProfile, modeleVide());
    const opt = (id: string) => p.vue().options?.find((o) => o.id === id)?.valeur;
    expect(opt("point")).toBe("centre");
    p.seule("Ctrl");
    expect(opt("point")).toBe("haut-gauche");
    p.seule("Alt");
    expect(opt("rotation")).toBe("oui");
    p.jouer(clicVers(v3(0, 0, 0)), echap);
    expect((p.etat as { etape: number }).etape).toBe(1);
  });
});

describe("Profilés depuis arêtes (L12)", () => {
  function rectangle(): { m: Modele; ids: Id[] } {
    let m = modeleVide();
    const P = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0)];
    for (let i = 0; i < 4; i++) m = ajouterSegment(m, P[i]!, P[(i + 1) % 4]!).modele;
    return { m, ids: Object.keys(m.racine.aretes) };
  }

  it("sans arêtes sélectionnées : consigne et refus nommés", () => {
    const p = avecSection(machineProfilesAretes, rectangle().m).jouer(clicVers(v3(1, 1, 0)));
    expect(p.vue().erreur).toContain(ERREUR_SANS_ARETES);
    expect(p.historique).toHaveLength(1);
  });

  it("rectangle d'arêtes : aperçu au survol (rien d'écrit), puis 4 pièces liées en un seul pas", () => {
    const { m, ids } = rectangle();
    const p = avecSection(machineProfilesAretes, m, ids).jouer(survolVers(v3(1, 1, 0)));
    expect(p.historique).toHaveLength(1);
    expect(p.vue().apercu.faces.length).toBe(4 * 6);
    p.jouer(clicVers(v3(1, 1, 0)));
    expect(p.operations).toEqual(["Profilés depuis arêtes"]);
    expect(occs(p.modele)).toHaveLength(4);
    expect(p.selection).toHaveLength(4);
    expect(Object.keys(piecesLiees(p.modele))).toHaveLength(4);
  });

  it("deux chaînes séparées dans la sélection : posées ensemble, un seul pas ; Entrée au champ vide pose aussi", () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(2, 0, 0)).modele;
    m = ajouterSegment(m, v3(0, 5, 0), v3(2, 5, 0)).modele;
    const p = avecSection(machineProfilesAretes, m, Object.keys(m.racine.aretes)).jouer(saisie(""));
    expect(p.operations).toEqual(["Profilés depuis arêtes"]);
    expect(occs(p.modele)).toHaveLength(2);
  });

  it("décalage tapé (0,05) : pièces allongées aux extrémités libres ; fusion des colinéaires : une seule pièce non liée", () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(1, 0, 0)).modele;
    m = ajouterSegment(m, v3(1, 0, 0), v3(3, 0, 0)).modele;
    const ids = Object.keys(m.racine.aretes);
    const a = avecSection(machineProfilesAretes, m, ids).configurer("fusion", "oui").jouer(saisie("0.05"), clicVers(v3(1, 1, 0)));
    expect(occs(a.modele)).toHaveLength(1);
    expect(volume(a.modele, occs(a.modele)[0] as Id)).toBeCloseTo(3.1 * 0.005, 9);
    expect(Object.keys(piecesLiees(a.modele))).toHaveLength(0);
  });

  it("Ctrl seul fait défiler centre → extérieur → intérieur ; Alt seul bascule la rotation", () => {
    const p = avecSection(machineProfilesAretes, rectangle().m);
    const opt = (id: string) => p.vue().options?.find((o) => o.id === id)?.valeur;
    p.seule("Ctrl");
    expect(opt("position")).toBe("exterieur");
    p.seule("Ctrl");
    expect(opt("position")).toBe("interieur");
    p.seule("Alt");
    expect(opt("rotation")).toBe("oui");
  });
});

describe("Revue de #126 — aperçus fidèles à la pose", () => {
  const cle = (p: { x: number; y: number; z: number }) => [p.x, p.y, p.z].map((x) => (Math.abs(x) < 1e-9 ? 0 : x).toFixed(6)).join(",");
  it("dans un groupe tourné : l'aperçu a le même roulis que la pièce posée (repère du contexte, haut local)", () => {
    const g = grouperVide(modeleVide());
    const m = tourner(g.modele, [g.occurrence], v3(0, 0, 0), v3(1, 0, 0), Math.PI / 2).modele;
    const p = avecSection(machineProfile, m);
    const ctx0 = p.ctx;
    p.ctx = (): ContexteOutil => ({ ...ctx0(), dans: g.occurrence });
    p.jouer(clicVers(v3(0, 0, 0)), survolVers(v3(3, 0, 0)));
    const apercu = new Set(p.vue().apercu.faces.flat().map(cle));
    p.jouer(clicVers(v3(3, 0, 0)));
    expect(p.operations).toEqual(["Profilé"]);
    const pose = new Set(geometrieVisible(p.modele).faces.flatMap((f) => f.exterieur).map(cle));
    expect(pose.size).toBe(8);
    expect([...apercu].sort()).toEqual([...pose].sort());
  });

  it("section creuse : l'aperçu porte les trous des bouts (Profilé et Profilés depuis arêtes)", () => {
    const creuse: SectionCourante = {
      ...SECTION,
      section: { ...SECTION.section, trous: [[{ y: -0.04, z: -0.015 }, { y: -0.04, z: 0.015 }, { y: 0.04, z: 0.015 }, { y: 0.04, z: -0.015 }]] },
    };
    const p = avecSection(machineProfile, modeleVide(), [], creuse).jouer(clicVers(v3(0, 0, 0)), survolVers(v3(3, 0, 0)));
    expect((p.vue().apercu.trous ?? []).filter((t) => t.length === 1)).toHaveLength(2);
    const m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(3, 0, 0)).modele;
    const q = avecSection(machineProfilesAretes, m, Object.keys(m.racine.aretes), creuse).jouer(survolVers(v3(1, 1, 1)));
    expect((q.vue().apercu.trous ?? []).filter((t) => t.length === 1)).toHaveLength(2);
  });
});

describe("Revue de #127 — Couper après pose : rebouclage sur chaîne fermée seulement", () => {
  it("rectangle fermé : fermée ; U ouvert de trois arêtes : ouverte (la première n'est pas coupée par la dernière)", () => {
    let m = modeleVide();
    const P = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0)];
    for (let i = 0; i < 4; i++) m = ajouterSegment(m, P[i]!, P[(i + 1) % 4]!).modele;
    const ids = Object.keys(m.racine.aretes) as Id[];
    const ctx = partie(machineProfilesAretes, m, ids).ctx();
    expect(chaineFermee(ctx, ids)).toBe(true);
    expect(chaineFermee(ctx, ids.slice(0, 3))).toBe(false);
  });
});
