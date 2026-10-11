import { describe, expect, it } from "vitest";
import { type Id, ajouterRectangle, aire, contexte, decaler, grouper, modeleVide, tourner } from "../geometrie-libre.js";
import { type Vec3, v3 } from "../vecteur.js";
import { pointsDe } from "./commun-modif.js";
import { ERREUR_BRANCHE_AXE, machinePivoter } from "./faire-pivoter.js";
import { machineDecalage } from "./decalage.js";
import { machineDeplacer, poigneesRotation, poigneeVisee } from "./deplacer.js";
import { ERREUR_AXES_OBJET, machineRetourner } from "./retourner.js";
import { appuiVers, boite, clicVers, contientPoint, emprise, glisserVers, partie, relacheVers, saisie, sommets, survolVers, toutSelectionner, touche } from "./essais-modification.js";

const O = v3(0, 0, 0);
const DEPUIS = v3(-1, -1, 4);

/** Carré 4 × 4 au sol percé d'un carré 1 × 1 centré (la face intérieure reste une face distincte). */
function carrePerce() {
  let m = modeleVide();
  m = ajouterRectangle(m, O, v3(4, 0, 0), v3(0, 4, 0)).modele;
  m = ajouterRectangle(m, v3(1.5, 1.5, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
  const c = contexte(m);
  const percee = Object.values(c.faces).find((f) => f.trous.length === 1) as { id: Id };
  return { m, percee: percee.id };
}

const aires = (m: ReturnType<typeof modeleVide>) => Object.keys(contexte(m).faces).map((f) => Math.round(aire(m, f) * 1e9) / 1e9).sort((a, b) => a - b);

describe("Lot L18 — Décalage d'une face à trous, Alt = chevauchement", () => {
  it("0,5 vers l'intérieur : contour 3 × 3 et trou agrandi à 2 × 2 (faces 1, 3, 5, 7 m²)", () => {
    const { m, percee } = carrePerce();
    const r = decaler(m, percee, 0.5);
    expect(aires(r.modele)).toEqual([1, 3, 5, 7]);
    expect(contientPoint(sommets(r.modele), v3(1, 1, 0))).toBe(true);
    expect(contientPoint(sommets(r.modele), v3(3.5, 3.5, 0))).toBe(true);
    // La face rendue est celle du contour décalé, percée du trou agrandi.
    expect(r.face).toBeDefined();
    expect(aire(r.modele, r.face as Id)).toBeCloseTo(5, 9);
  });

  it("1,2 : le trou agrandi croise le contour décalé — refusé en nommant les boucles ; Alt l'autorise", () => {
    const { m, percee } = carrePerce();
    expect(() => decaler(m, percee, 1.2)).toThrow(/chevauche.*contour extérieur et trou 1/);
    expect(() => decaler(m, percee, 1.2, { chevauchement: true })).not.toThrow();
  });

  it("outil : Alt frappé seul bascule l'option Chevauchement (Refusé ⇄ Autorisé), sans pas d'historique", () => {
    const { m } = carrePerce();
    const p = partie(machineDecalage, m);
    expect(p.vue().options?.[0]).toMatchObject({ id: "chevauchement", valeur: "refuse" });
    p.seule("Alt");
    expect(p.vue().options?.[0]?.valeur).toBe("autorise");
    p.configurer("chevauchement", "refuse");
    expect(p.vue().options?.[0]?.valeur).toBe("refuse");
    expect(p.historique).toHaveLength(1);
  });
});

describe("Lot L18 — Faire pivoter : Maj, flèches après le 1er clic, axe par glisser", () => {
  it("Maj maintenue avant le 1er clic garde le plan du rapporteur ; relâchée, il suit de nouveau la face survolée", () => {
    const m = boite(1, 1, 1);
    const p = partie(machinePivoter, m, toutSelectionner(m));
    p.jouer(survolVers(v3(0.5, 0.5, 1), v3(0, 0, 1)));
    expect(p.etat.normale).toEqual(v3(0, 0, 1));
    p.jouer(touche("Maj"), survolVers(v3(1, 0.5, 0.5), v3(1, 0, 0)));
    expect(p.etat.normale).toEqual(v3(0, 0, 1));
    p.jouer(touche("Maj", "relachee"), survolVers(v3(1, 0.5, 0.5), v3(1, 0, 0)));
    expect(Math.abs(p.etat.normale.x)).toBeCloseTo(1, 9);
  });

  it("→ après le 1er clic : le départ est projeté sur l'axe rouge ; ↑ (axe = normale) refusé avec motif", () => {
    const m = boite(1, 1, 1);
    const p = partie(machinePivoter, m, toutSelectionner(m)).jouer(clicVers(O, DEPUIS), touche("FlecheDroite"), clicVers(v3(1, 0.3, 0), DEPUIS));
    expect(p.etat.etape).toBe(3);
    expect(contientPoint([p.etat.depart as Vec3], v3(1, 0, 0), 1e-9)).toBe(true);
    const q = partie(machinePivoter, m, toutSelectionner(m)).jouer(clicVers(O, DEPUIS), touche("FlecheHaut"));
    expect(q.etat.erreur).toBe(ERREUR_BRANCHE_AXE);
    expect(q.etat.branche).toBeNull();
  });

  it("glisser depuis le centre : axe quelconque (ici rouge), puis départ et 90° → la boîte tourne autour de x", () => {
    const m = boite(1, 1, 1);
    const p = partie(machinePivoter, m, toutSelectionner(m)).jouer(
      appuiVers(O, DEPUIS, { x: 0, y: 0 }),
      glisserVers(v3(1, 0, 0), DEPUIS, { x: 60, y: 0 }),
      relacheVers(v3(1, 0, 0), DEPUIS, { x: 60, y: 0 }),
      clicVers(v3(1, 0, 0), DEPUIS), // clic qui suit le relâcher : ignoré
    );
    expect(p.etat.etape).toBe(2);
    expect(Math.abs(p.etat.normale.x)).toBeCloseTo(1, 9);
    p.jouer(clicVers(v3(0, 1, 0), DEPUIS), saisie("90"));
    const e = emprise(p.modele);
    expect([e.min.x, e.max.x].map((x) => Math.round(x * 1e9) / 1e9)).toEqual([0, 1]);
    expect(Math.min(e.min.y, e.min.z)).toBeCloseTo(-1, 9);
    expect(p.operations).toEqual(["Rotation"]);
  });
});

describe("Lot L18 — Retourner : Alt = axes de l'objet", () => {
  it("groupe tourné de 30° : le plan « rouge » de l'objet suit son axe x propre et passe par le centre de sa boîte orientée", () => {
    let m = boite(2, 1, 1);
    const g = grouper(m, toutSelectionner(m));
    const o = g.occurrence as Id;
    m = tourner(g.modele, [o], O, v3(0, 0, 1), Math.PI / 6).modele;
    const avant = pointsDe(m, [o]);
    const p = partie(machineRetourner, m, [o]);
    p.seule("Alt");
    expect(p.vue().options?.[0]).toMatchObject({ id: "axes", valeur: "objet" });
    // Flèche droite : retournement selon le plan rouge de l'objet → l'ensemble des points est inchangé (boîte symétrique).
    p.jouer(touche("FlecheDroite"));
    expect(p.operations).toEqual(["Retourner"]);
    const apres = pointsDe(p.modele, [o]);
    for (const q of avant) expect(contientPoint(apres, q, 1e-9)).toBe(true);
    // Axes du contexte : la même flèche ne laisse pas la boîte tournée en place.
    const c = partie(machineRetourner, m, [o]).jouer(touche("FlecheDroite"));
    const apresContexte = pointsDe(c.modele, [o]);
    expect(avant.every((q) => contientPoint(apresContexte, q, 1e-9))).toBe(false);
  });

  it("Alt sans un seul objet sélectionné : refus nommé, l'option Objet est indisponible", () => {
    const m = boite(1, 1, 1);
    const p = partie(machineRetourner, m, toutSelectionner(m));
    p.seule("Alt");
    expect(p.etat.erreur).toBe(ERREUR_AXES_OBJET);
    expect(p.vue().options?.[0]?.valeurs.find((v) => v.id === "objet")?.disponible).toBe(false);
  });
});

describe("Lot L18 — Déplacer : poignées de rotation de la boîte", () => {
  it("24 poignées (4 par face), à mi-chemin du centre de la face vers ses bords", () => {
    const b = { min: O, max: v3(2, 2, 2), centre: v3(1, 1, 1) };
    const pg = poigneesRotation(b);
    expect(pg).toHaveLength(24);
    expect(pg.some((p) => contientPoint([p.point], v3(1.5, 1, 2)) && p.normale.z === 1)).toBe(true);
    expect(poigneeVisee(b, { origine: v3(1.5, 1, 10), direction: v3(0, 0, -1) })?.normale).toEqual(v3(0, 0, 1));
    expect(poigneeVisee(b, { origine: v3(1, 1, 10), direction: v3(0, 0, -1) })).toBeNull();
  });

  it("clic sur une poignée du dessus d'un groupe, « 90 » : l'objet pivote de 90° autour de la verticale du centre du dessus", () => {
    let m = boite(2, 1, 1);
    const g = grouper(m, toutSelectionner(m));
    m = g.modele;
    const o = g.occurrence as Id;
    const p = partie(machineDeplacer, m, [o]);
    // Poignée du dessus en (1,5 ; 0,5 ; 1) (centre du dessus (1 ; 0,5 ; 1), demi-largeur x = 1 → mi-chemin 0,5).
    p.jouer(clicVers(v3(1.5, 0.5, 1), v3(0, 0, 1)));
    expect(p.etat.rotation).not.toBeNull();
    expect(p.vue().mesures?.libelle).toBe("Angle");
    p.jouer(survolVers(v3(1, 1.5, 1), v3(0, 0, 1)), saisie("90"));
    expect(p.operations).toEqual(["Rotation"]);
    const pts = pointsDe(p.modele, [o]);
    // Rotation de 90° autour de (1 ; 0,5) : x ∈ [0,5 ; 1,5], y ∈ [−0,5 ; 1,5].
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map((x) => Math.round(x * 1e9) / 1e9)).toEqual([0.5, 1.5, -0.5, 1.5]);
  });

  it("Échap abandonne la rotation par poignée ; sans objet unique, pas de poignée (déplacement ordinaire)", () => {
    let m = boite(2, 1, 1);
    const g = grouper(m, toutSelectionner(m));
    m = g.modele;
    const p = partie(machineDeplacer, m, [g.occurrence as Id]).jouer(clicVers(v3(1.5, 0.5, 1), v3(0, 0, 1)));
    p.jouer({ genre: "echap" });
    expect(p.etat.rotation).toBeNull();
    const q = partie(machineDeplacer, boite(2, 1, 1), toutSelectionner(boite(2, 1, 1))).jouer(clicVers(v3(1.5, 0.5, 1), v3(0, 0, 1)));
    expect(q.etat.rotation).toBeNull();
    expect(q.etat.etape).toBe(2);
  });
});
