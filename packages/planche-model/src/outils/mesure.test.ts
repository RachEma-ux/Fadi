import { describe, expect, it } from "vitest";
import { ajouterPolygone, ajouterRectangle, modeleVide, pousserTirer, volume, grouper, deplacer } from "../geometrie-libre.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { v3, dist } from "../vecteur.js";
import { machineAxes } from "./axes.js";
import { machineCotation } from "./cotation.js";
import { clicVers, partie, saisie, survolVers, touche } from "./essais-modification.js";
import { machineMetre } from "./metre.js";
import { machinePlanDeCoupe, modifierPlanDeCoupe } from "./plan-de-coupe.js";
import { machineRapporteur } from "./rapporteur.js";
import { viserAnnotation } from "./selection.js";
import { machineTexte } from "./texte.js";
import type { EvenementOutil } from "./machine.js";

const sol = () => ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 2.7, 0)).modele;
const guides = (m: ReturnType<typeof sol>) => Object.values(m.annotations?.guides ?? {});
const double = (p: ReturnType<typeof v3>): EvenementOutil => ({ ...(clicVers(p) as Extract<EvenementOutil, { genre: "clic" }>), double: true });

describe("Mètre — CA-MET", () => {
  it("CA-MET-1 : survol d'une face 4 × 2,7 → Mesures « Aire · 10,8 m² »", () => {
    const p = partie(machineMetre, sol()).jouer(survolVers(v3(2, 1, 0)));
    expect(p.vue().mesures).toMatchObject({ libelle: "Aire", valeur: "10.8 m²" });
  });
  it("CA-MET-2 : depuis une arête, « 1 » → une ligne de guide infinie parallèle à 1 m (annulable)", () => {
    const p = partie(machineMetre, sol()).jouer(survolVers(v3(2, 0, 0)), clicVers(v3(2, 0, 0)), survolVers(v3(2, 1.15, 0)), saisie("1"));
    const g = guides(p.modele);
    expect(g).toHaveLength(1);
    expect(g[0]!.genre).toBe("ligne");
    if (g[0]!.genre === "ligne") {
      expect(Math.abs(g[0]!.direction.x)).toBeCloseTo(1, 9);
      expect(g[0]!.origine.y).toBeCloseTo(1, 9);
    }
    expect(p.operations).toEqual(["Ligne de guide"]);
    expect(p.etat.etape).toBe(1);
    expect(p.vue().mesures?.valeur).toBe("1");
  });
  it("depuis un sommet vers un sommet : mesure seule, aucun guide, étape de redimensionnement ; « 8 » puis Entrée redimensionne × 2 après confirmation", () => {
    const p = partie(machineMetre, sol()).jouer(survolVers(v3(0, 0, 0)), clicVers(v3(0, 0, 0)), survolVers(v3(4, 0, 0)), clicVers(v3(4, 0, 0)));
    expect(guides(p.modele)).toHaveLength(0);
    expect(p.etat.etape).toBe(3);
    expect(p.vue().mesures?.valeur).toBe("4.00 m");
    p.jouer(saisie("8"));
    expect(p.etat.confirmation?.facteur).toBeCloseTo(2, 9);
    expect(p.vue().consigne).toMatch(/Entrée = confirmer/);
    p.jouer(touche("Entree"));
    const xs = Object.values(p.modele.racine.sommets).map((s) => s.position.x);
    expect(Math.max(...xs)).toBeCloseTo(8, 9);
    expect(p.operations).toEqual(["Redimensionner la Planche"]);
  });
  it("depuis un point vers le vide : guide fini ; en mode Points (Ctrl) : point de guide ; CA-MET-3 : mode Mesure, rien", () => {
    const p = partie(machineMetre, sol()).jouer(clicVers(v3(0, 0, 0)), survolVers(v3(0, -2, 0)), clicVers(v3(0, -2, 0)));
    expect(guides(p.modele).map((g) => g.genre)).toEqual(["segment"]);
    p.jouer(touche("Ctrl"), clicVers(v3(1, -1, 0)), survolVers(v3(1, -3, 0)), clicVers(v3(1, -3, 0)));
    expect(guides(p.modele).map((g) => g.genre)).toEqual(["segment", "point"]);
    p.jouer(touche("Ctrl"), clicVers(v3(2, -1, 0)), survolVers(v3(2, -3, 0)), clicVers(v3(2, -3, 0)));
    expect(p.etat.mode).toBe("mesure");
    expect(guides(p.modele)).toHaveLength(2);
    expect(p.etat.etape).toBe(3);
  });
  it("CA-MET-4 : un lecteur mesure sans créer de guide", () => {
    const p = partie(machineMetre, sol());
    const ctx = () => ({ ...p.ctx(), lecture: true });
    const t = machineMetre.traiter(machineMetre.traiter(p.etat, survolVers(v3(2, 0, 0)), ctx()).etat, clicVers(v3(2, 0, 0)), ctx());
    const t2 = machineMetre.traiter({ ...t.etat, inference: machineMetre.traiter(t.etat, survolVers(v3(2, 1, 0)), ctx()).etat.inference }, saisie("1"), ctx());
    expect(t2.modele).toBeUndefined();
    expect(t2.etat.etape).toBe(3);
  });
});

describe("Cotes — CA-COT", () => {
  it("CA-COT-1 : deux sommets à 4 m → cote « 4,00 m » associée ; la valeur suit le déplacement d'un sommet", () => {
    const p = partie(machineCotation, sol()).jouer(survolVers(v3(0, 0, 0)), clicVers(v3(0, 0, 0)), survolVers(v3(4, 0, 0)), clicVers(v3(4, 0, 0)), survolVers(v3(2, -1, 0)), clicVers(v3(2, -1, 0)));
    const cotes = Object.values(p.modele.annotations?.cotes ?? {});
    expect(cotes).toHaveLength(1);
    const c = cotes[0]!;
    expect(c.genre).toBe("lineaire");
    if (c.genre !== "lineaire") return;
    expect(dist(c.a, c.b)).toBeCloseTo(4, 9);
    expect(c.sommets).toBeDefined();
    expect(p.etat.etape).toBe(1);
    // Association : la valeur est lue sur les sommets courants.
    const [sa, sb] = c.sommets as [string, string];
    const m2 = deplacer(p.modele, [sb], v3(1, 0, 0)).modele;
    const pa = m2.racine.sommets[sa]!.position;
    const pb = m2.racine.sommets[sb]!.position;
    expect(dist(pa, pb)).toBeCloseTo(5, 9);
  });
  it("clic sur une arête : ses deux extrémités, puis placement", () => {
    const p = partie(machineCotation, sol()).jouer(survolVers(v3(1, 0, 0)), clicVers(v3(1, 0, 0)));
    expect(p.etat.etape).toBe(3);
    p.jouer(survolVers(v3(2, -1, 0)), clicVers(v3(2, -1, 0)));
    expect(Object.keys(p.modele.annotations?.cotes ?? {})).toHaveLength(1);
  });
  it("CA-COT-2 : clic sur un cercle de rayon 0,6 → cote de diamètre « ⌀ 1,20 m »", () => {
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 0.6, 24).modele;
    const p = partie(machineCotation, m).jouer(survolVers(v3(0.6 * Math.cos(Math.PI / 36), 0.6 * Math.sin(Math.PI / 36), 0)), clicVers(v3(0.6 * Math.cos(Math.PI / 36), 0.6 * Math.sin(Math.PI / 36), 0)));
    expect(p.etat.etape).toBe(3);
    expect(p.etat.diametre?.rayon).toBeCloseTo(0.6, 9);
    expect(p.vue().apercu.etiquettes?.[0]?.texte).toBe("⌀ 1.20 m");
    p.jouer(survolVers(v3(1.5, 0, 0)), clicVers(v3(1.5, 0, 0)));
    const c = Object.values(p.modele.annotations?.cotes ?? {})[0]!;
    expect(c.genre).toBe("diametre");
  });
});

describe("Rapporteur — CA-RAP", () => {
  it("CA-RAP-1 : centre (0;0;0), début sur +x, « 30 » → une ligne de guide de direction (cos 30° ; sin 30° ; 0) ; Ctrl coupe la création", () => {
    const p = partie(machineRapporteur, sol()).jouer(survolVers(v3(0, 0, 0)), clicVers(v3(0, 0, 0)), survolVers(v3(1, 0, 0)), clicVers(v3(1, 0, 0)), survolVers(v3(1, 0.5, 0)), saisie("30"));
    const g = guides(p.modele);
    expect(g).toHaveLength(1);
    if (g[0]!.genre === "ligne") {
      expect(g[0]!.direction.x).toBeCloseTo(Math.cos(Math.PI / 6), 9);
      expect(g[0]!.direction.y).toBeCloseTo(Math.sin(Math.PI / 6), 9);
    }
    expect(p.etat.etape).toBe(1);
    expect(p.vue().mesures?.valeur).toBe("30");
    p.jouer(touche("Ctrl"), clicVers(v3(0, 0, 0)), survolVers(v3(1, 0, 0)), clicVers(v3(1, 0, 0)), survolVers(v3(0, 1, 0)), clicVers(v3(0, 1, 0)));
    expect(guides(p.modele)).toHaveLength(1);
  });
  it("l'angle suit le curseur (Mesures « Angle » à une décimale) ; pente « 4:12 »", () => {
    const p = partie(machineRapporteur, sol()).jouer(clicVers(v3(0, 0, 0)), survolVers(v3(1, 0, 0)), clicVers(v3(1, 0, 0)), survolVers(v3(1, 1, 0)));
    expect(p.vue().mesures?.valeur).toBe("45.0");
    p.jouer(saisie("4:12"));
    const g = guides(p.modele)[0]!;
    if (g.genre === "ligne") expect(Math.atan2(g.direction.y, g.direction.x)).toBeCloseTo(Math.atan(4 / 12), 9);
  });
});

describe("Axes — CA-AXE", () => {
  it("CA-AXE-1 : origine (1;2;0), rouge vers +y → repère de saisie ; « [1;0;0] » lu dans ce repère donne (1;3;0) ; l'outil précédent revient", () => {
    const p = partie(machineAxes, sol()).jouer(clicVers(v3(1, 2, 0)), survolVers(v3(1, 5, 0)), clicVers(v3(1, 5, 0)), survolVers(v3(-2, 2, 0)), clicVers(v3(-2, 2, 0)));
    const r = p.modele.annotations?.repere;
    expect(r).toBeDefined();
    expect(r!.x.y).toBeCloseTo(1, 9);
    expect(r!.y.x).toBeCloseTo(-1, 9);
    expect(r!.z.z).toBeCloseTo(1, 9);
    expect(p.operations).toEqual(["Axes"]);
    const res = analyserSaisie("[1;0;0]", { attendu: "distance-reseau", separateurDecimal: ",", repere: r! });
    expect(res.genre).toBe("point");
    if (res.genre === "point") expect(res.point).toEqual({ x: 1, y: 3, z: 0 });
  });
  it("double-clic : axes tels qu'orientés à l'origine cliquée", () => {
    const p = partie(machineAxes, sol()).jouer(survolVers(v3(2, 1, 0)), double(v3(2, 1, 0)));
    expect(p.modele.annotations?.repere?.origine).toEqual({ x: 2, y: 1, z: 0 });
    expect(p.modele.annotations?.repere?.x).toEqual({ x: 1, y: 0, z: 0 });
  });
});

describe("Mètre et Sélection — remarques de revue (lots 4 à 6)", () => {
  it("verrou d'axe (→) puis « 2 » : la direction suit le repère de saisie des Axes (rouge vers +y), comme les saisies « [x;y;z] »", () => {
    const axes = partie(machineAxes, sol()).jouer(clicVers(v3(1, 2, 0)), survolVers(v3(1, 5, 0)), clicVers(v3(1, 5, 0)), survolVers(v3(-2, 2, 0)), clicVers(v3(-2, 2, 0)));
    const repere = axes.modele.annotations!.repere!;
    const p = partie(machineMetre, axes.modele);
    p.ctx = () => ({ modele: p.modele, selection: p.selection, separateurDecimal: p.separateurDecimal, repere });
    p.jouer(survolVers(v3(6, 5, 0)), clicVers(v3(6, 5, 0)), touche("FlecheDroite"), survolVers(v3(7, 6, 0)), saisie("2"));
    const g = guides(p.modele);
    expect(g).toHaveLength(1);
    expect(g[0]!.genre).toBe("segment");
    if (g[0]!.genre === "segment") {
      expect(g[0]!.fin.x).toBeCloseTo(6, 9);
      expect(g[0]!.fin.y).toBeCloseTo(7, 9);
    }
  });
  it("un texte écran (pixels) est visé par la position écran du clic, donc sélectionnable et effaçable", () => {
    const p = partie(machineTexte, sol()).jouer(survolVers(v3(9, 9, 0)), { ...(clicVers(v3(9, 9, 0)) as Extract<EvenementOutil, { genre: "clic" }>), ecran: { x: 300, y: 200 } });
    const id = Object.keys(p.modele.annotations!.textes)[0]!;
    const loin = { origine: v3(50, 50, 50), direction: v3(0, 0, -1) };
    expect(viserAnnotation(p.modele, loin, 0.05, { x: 340, y: 210 })).toBe(id);
    expect(viserAnnotation(p.modele, loin, 0.05, { x: 100, y: 100 })).toBeNull();
    expect(viserAnnotation(p.modele, loin, 0.05)).toBeNull();
  });
});

describe("Texte — CA-TXT", () => {
  it("CA-TXT-1 : texte avec repère sur la face de 10,8 m² → texte par défaut « 10,8 m² », saisie demandée puis remplacée en un pas", () => {
    const p = partie(machineTexte, sol()).jouer(survolVers(v3(2, 1, 0)), clicVers(v3(2, 1, 0)));
    expect(p.etat.etape).toBe(2);
    expect(p.etat.defaut).toBe("10.8 m²");
    p.jouer(survolVers(v3(2, 4, 0)), clicVers(v3(2, 4, 0)));
    const textes = Object.values(p.modele.annotations?.textes ?? {});
    expect(textes).toHaveLength(1);
    expect(textes[0]!.texte).toBe("10.8 m²");
    expect(p.historique).toHaveLength(2);
    p.jouer(saisie("Séjour"));
    expect(Object.values(p.modele.annotations!.textes)[0]!.texte).toBe("Séjour");
    expect(p.historique).toHaveLength(2); // remplaceDernier
    expect(p.etat.etape).toBe(1);
  });
  it("clic dans le vide : texte écran fixé en pixels", () => {
    const ev: EvenementOutil = { genre: "clic", rayon: { origine: v3(50, 50, 10), direction: v3(0, 0, -1) }, tolerance: 0.01, ecran: { x: 120, y: 80 } };
    const p = partie(machineTexte, sol()).jouer(ev);
    const t = Object.values(p.modele.annotations?.textes ?? {})[0]!;
    expect(t.genre).toBe("ecran");
    if (t.genre === "ecran") expect(t.ecran).toEqual({ x: 120, y: 80 });
  });
});

describe("Plan de coupe — CA-CPE", () => {
  it("CA-CPE-1 : pose sur le dessus d'une boîte → plan actif de normale +z, outil Sélection, plan sélectionné ; CA-CPE-2 : inverser, désactiver", () => {
    const m0 = sol();
    const f = Object.keys(m0.racine.faces)[0]!;
    const m = pousserTirer(m0, f, 2).modele;
    const p = partie(machinePlanDeCoupe, m).jouer(survolVers(v3(2, 1, 2)), clicVers(v3(2, 1, 2)));
    const plans = Object.values(p.modele.annotations?.plansDeCoupe ?? {});
    expect(plans).toHaveLength(1);
    expect(plans[0]!.normale.z).toBeCloseTo(1, 9);
    expect(plans[0]!.actif).toBe(true);
    expect(p.outilDemande).toBe("selection");
    expect(p.selection).toEqual([plans[0]!.id]);
    const t = modifierPlanDeCoupe(p.ctx(), plans[0]!.id, { inverse: true });
    expect(t.modele?.annotations?.plansDeCoupe[plans[0]!.id]?.inverse).toBe(true);
    const t2 = modifierPlanDeCoupe({ ...p.ctx(), modele: t.modele! }, plans[0]!.id, { actif: false });
    expect(t2.modele?.annotations?.plansDeCoupe[plans[0]!.id]?.actif).toBe(false);
    // Le volume de la boîte n'est pas touché par un plan de coupe (état de vue, R10).
    const g = grouper(t2.modele!, [...Object.keys(t2.modele!.racine.faces), ...Object.keys(t2.modele!.racine.aretes)]);
    expect(volume(g.modele, g.occurrence)).toBeCloseTo(21.6, 9);
  });
});
