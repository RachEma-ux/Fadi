import { describe, expect, it } from "vitest";
import { ajouterSegment, contexte, modeleVide } from "../geometrie-libre.js";
import { v3 } from "../vecteur.js";
import { partie, survolVers } from "./essais-modification.js";
import { MACHINES } from "./index.js";

/**
 * Les inférences ne sont pas propres à l'outil Ligne : tout outil qui reçoit un point (dessin, déplacement, mesure,
 * décalage…) montre déjà, au survol, l'inférence de la géométrie visée (ici l'extrémité d'une arête).
 */
const OUTILS_A_POINTS = [
  "ligne",
  "rectangle",
  "rectangle-pivote",
  "cercle",
  "polygone",
  "arc",
  "arc-2-points",
  "arc-3-points",
  "secteur",
  "deplacer",
  "faire-pivoter",
  "decalage",
  "cotation",
  "rapporteur",
  "axes",
  "texte",
  "plan-de-coupe",
  "profile",
  "metre",
] as const;

describe("Inférences pour tous les outils à points", () => {
  const modele = () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    m = ajouterSegment(m, v3(8, 5, 0), v3(9, 5, 0)).modele;
    return { m, autre: Object.keys(contexte(m).aretes)[1] as string };
  };

  it.each(OUTILS_A_POINTS)("%s : l'extrémité visée est signalée (sans et avec sélection préalable)", (id) => {
    const machine = MACHINES.get(id);
    expect(machine, id).toBeDefined();
    const { m, autre } = modele();
    for (const sel of [[], [autre]]) {
      const p = partie(machine as never, m, sel).jouer(survolVers(v3(4.004, 0.004, 0)));
      expect(p.vue().inference?.type, `${id} ${sel.length ? "avec" : "sans"} sélection`).toBe("extremite");
    }
  });
});
