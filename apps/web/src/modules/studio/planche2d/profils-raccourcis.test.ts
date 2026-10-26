/**
 * TR-EX-034 / EX-034 (interface) — raccourcis personnels d'un profil : conflits détectés contre toute la table du clavier
 * (outils du registre, commandes de l'éditeur, combinaisons du navigateur, doublons) et explicités ; seuls les raccourcis
 * sans conflit sont appliqués, après la table native.
 */
import { describe, expect, it } from "vitest";
import { conflitsRaccourcisPersonnels, normaliserPreferences, tableRaccourcisPersonnels } from "./profils";
import { TABLE_CLAVIER } from "./raccourcis";

describe("TR-EX-034 — raccourcis personnels et conflits (interface)", () => {
  it("conflits explicités : doublon, raccourci natif d'un autre outil, commande de l'éditeur, combinaison du navigateur", () => {
    const r = { "studio.dessin.cote": "Ctrl+Shift+M", "studio.dessin.ligne": "Ctrl+Shift+M", "studio.dessin.arc": "R", "studio.dessin.cercle": "Ctrl+S", "studio.dessin.texte": "Ctrl+P" };
    expect(conflitsRaccourcisPersonnels(r)).toEqual([
      { raccourci: "Ctrl+Shift+M", capacite: "studio.dessin.ligne", type: "doublon", avec: "studio.dessin.cote" },
      { raccourci: "R", capacite: "studio.dessin.arc", type: "registre", avec: "studio.dessin.rectangle" },
      { raccourci: "Ctrl+S", capacite: "studio.dessin.cercle", type: "editeur", avec: "enregistrer" },
      { raccourci: "Ctrl+P", capacite: "studio.dessin.texte", type: "navigateur", avec: "Ctrl+P" },
    ]);
    // La configuration source n'est pas modifiée par la détection.
    expect(r["studio.dessin.ligne"]).toBe("Ctrl+Shift+M");
  });

  it("table appliquée : seuls les raccourcis sans conflit, outils du registre seulement, jamais une combinaison native", () => {
    const prefs = normaliserPreferences({ profil: "standard", favoris: [], personnel: [], raccourcis: { "studio.dessin.cote": "Ctrl+Shift+M", "studio.dessin.arc": "R", "studio.publication.publier": "Ctrl+Shift+9" } });
    const t = tableRaccourcisPersonnels(prefs);
    expect([...t]).toEqual([["Ctrl+Shift+M", { type: "outil", toolId: "studio.dessin.cote" }]]);
    for (const c of t.keys()) expect(TABLE_CLAVIER.has(c)).toBe(false);
  });
});
