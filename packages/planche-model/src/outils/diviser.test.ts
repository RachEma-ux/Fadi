import { describe, expect, it } from "vitest";
import { type Id, ajouterRectangle, contexte, modeleVide } from "../geometrie-libre.js";
import { dist, v3 } from "../vecteur.js";
import { etape } from "./commun-formes.js";
import { machineDiviser } from "./diviser.js";
import { aretes, clicVers, faces, partie, saisie, survolVers } from "./essais-modification.js";

const rect = () => ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(3, 0, 0), v3(0, 2, 0)).modele;

describe("Diviser (§4.26)", () => {
  it("consigne du catalogue, champ « Segments » à 5 par défaut", () => {
    const p = partie(machineDiviser, rect());
    expect(p.vue().consigne).toBe(etape("diviser", 0).consigne);
    expect(p.vue().mesures?.libelle).toBe("Segments");
    expect(p.vue().mesures?.valeur).toBe("5");
  });

  it("survol d'une arête : points de division et infobulle « 5 segments · longueur »", () => {
    const p = partie(machineDiviser, rect()).jouer(survolVers(v3(1.5, 0, 0), v3(0, -1, 1)));
    expect(p.vue().apercu.lignes).toHaveLength(4);
    expect(p.vue().inference?.libelle.fr).toBe("5 segments · longueur 3.00 m");
  });

  it("CA-DIV-1 : arête de 3 m, 3 → 3 arêtes de 1 m colinéaires, faces bordantes conservées, outil Sélection rétabli", () => {
    const m = rect();
    const p = partie(machineDiviser, m).jouer(clicVers(v3(1.5, 0, 0), v3(0, -1, 1)), saisie("3"));
    expect(p.outilDemande).toBe("selection");
    const c = contexte(p.modele);
    const bas = Object.values(c.aretes).filter((e) => Math.abs((c.sommets[e.a] as { position: { y: number } }).position.y) < 1e-9 && Math.abs((c.sommets[e.b] as { position: { y: number } }).position.y) < 1e-9);
    expect(bas).toHaveLength(3);
    for (const e of bas) expect(dist((c.sommets[e.a] as { position: ReturnType<typeof v3> }).position, (c.sommets[e.b] as { position: ReturnType<typeof v3> }).position)).toBeCloseTo(1, 9);
    expect(faces(p.modele)).toHaveLength(1);
    expect((faces(p.modele)[0] as { exterieur: readonly Id[] }).exterieur).toHaveLength(6); // le contour gagne 2 sommets
    expect(aretes(p.modele)).toHaveLength(6);
    expect(p.operations).toEqual(["Diviser"]);
  });

  it("arête présélectionnée : la saisie suffit ; nombre invalide ou sans arête : messages", () => {
    const m = rect();
    const id = Object.keys(m.racine.aretes)[0] as Id;
    const a = partie(machineDiviser, m, [id]).jouer(saisie("2"));
    expect(a.outilDemande).toBe("selection");
    expect(aretes(a.modele)).toHaveLength(5);
    const b = partie(machineDiviser, m).jouer(saisie("3"));
    expect(b.vue().erreur).toMatch(/Cliquez d'abord/);
    const c = partie(machineDiviser, m, [id]).jouer(saisie("0"));
    expect(c.vue().erreur).not.toBeNull();
    expect(c.historique).toHaveLength(1);
    const d = partie(machineDiviser, m, [id]).jouer(saisie("2,5"));
    expect(d.vue().erreur).not.toBeNull();
  });

  it("le nombre choisi est conservé comme défaut ; Échap annule le choix", () => {
    const m = rect();
    const id = Object.keys(m.racine.aretes)[0] as Id;
    const p = partie(machineDiviser, m, [id]).jouer(saisie("7"));
    expect(p.vue().mesures?.valeur).toBe("7");
    const q = partie(machineDiviser, m).jouer(clicVers(v3(1.5, 0, 0), v3(0, -1, 1)), { genre: "echap" });
    expect(q.vue().consigne).toBe(etape("diviser", 0).consigne);
    expect(q.historique).toHaveLength(1);
  });
});
