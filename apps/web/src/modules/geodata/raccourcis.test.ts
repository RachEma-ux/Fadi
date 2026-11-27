import { describe, expect, it } from "vitest";
import { commandeDeTouche, RACCOURCIS, RACCOURCIS_BARRE, RACCOURCIS_BARRE_BAS, RACCOURCIS_TERRAIN, type ContexteClavier } from "./raccourcis";

const libre: ContexteClavier = { saisie: false, dansRecherche: false, carteDisponible: true, ficheOuverte: false, niveauChoisi: false, descentePossible: false };
const alt = (key: string, code = `Key${key.toUpperCase()}`) => ({ altKey: true, key, code });

describe("table unique des raccourcis (P3)", () => {
  it("20 lettres Alt (dont les groupes Alt+N et Alt+A, P5), deux flèches et « ? », chacune une seule fois ; tables des barres dérivées et inchangées", () => {
    const touches = RACCOURCIS.map((x) => x.touche);
    expect(new Set(touches).size).toBe(touches.length);
    expect(touches.filter((t) => /^Alt\+[A-Z]$/.test(t))).toHaveLength(20);
    expect(RACCOURCIS_BARRE).toEqual({ etiquettes: "Alt+L", "mini-carte": "Alt+M", imprimer: "Alt+I", synthese: "Alt+V", regrouper: "Alt+G", lien: "Alt+K" });
    expect(RACCOURCIS_TERRAIN).toEqual({ terrain: "Alt+H", altitude: "Alt+O", profil: "Alt+U" });
    expect(RACCOURCIS_BARRE_BAS).toEqual({ carte: "Alt+X", chercher: "Alt+R", couches: "Alt+C", enregistrer: "Alt+E" });
  });

  it("sans Alt, rien ; touche inconnue, rien ; minuscule, majuscule et code physique équivalents", () => {
    expect(commandeDeTouche({ altKey: false, key: "m", code: "KeyM" }, libre)).toBeNull();
    expect(commandeDeTouche(alt("q"), libre)).toBeNull();
    expect(commandeDeTouche(alt("m"), libre)).toBe("mini-carte");
    expect(commandeDeTouche(alt("M"), libre)).toBe("mini-carte");
    expect(commandeDeTouche({ altKey: true, key: "µ", code: "KeyM" }, libre)).toBe("mini-carte");
  });

  it("dans un champ : seules Alt+P (fiche ouverte) et Alt+R (depuis la recherche) répondent", () => {
    const saisie = { ...libre, saisie: true };
    expect(commandeDeTouche(alt("l"), saisie)).toBeNull();
    expect(commandeDeTouche(alt("r"), saisie)).toBeNull();
    expect(commandeDeTouche(alt("r"), { ...saisie, dansRecherche: true })).toBe("recherche");
    expect(commandeDeTouche(alt("p"), { ...saisie, ficheOuverte: true })).toBe("imprimer-fiche");
    expect(commandeDeTouche(alt("p"), libre)).toBeNull();
  });

  it("carte indisponible : M, I, V, G, S, O, U coupées ; les autres restent", () => {
    const sans = { ...libre, carteDisponible: false };
    for (const k of ["m", "i", "v", "g", "s", "o", "u"]) expect(commandeDeTouche(alt(k), sans)).toBeNull();
    for (const k of ["r", "l", "k", "x", "c", "e", "t", "z", "j", "h"]) expect(commandeDeTouche(alt(k), sans)).not.toBeNull();
  });

  it("P5 : groupes Alt+N / Alt+A ; « ? » ouvre l'aide hors saisie, sans Alt", () => {
    expect(commandeDeTouche(alt("n"), libre)).toBe("groupe-mesurer");
    expect(commandeDeTouche(alt("a"), libre)).toBe("groupe-affichage");
    expect(commandeDeTouche({ altKey: false, key: "?", code: "Slash" }, libre)).toBe("aide-raccourcis");
    expect(commandeDeTouche({ altKey: false, key: "?", code: "Slash" }, { ...libre, saisie: true })).toBeNull();
    expect(RACCOURCIS.every((x) => x.libelle.length > 0)).toBe(true);
  });

  it("flèches : Alt+↑ remonte si un niveau est choisi, Alt+↓ descend si la fiche le permet", () => {
    expect(commandeDeTouche({ altKey: true, key: "ArrowUp", code: "ArrowUp" }, libre)).toBeNull();
    expect(commandeDeTouche({ altKey: true, key: "ArrowUp", code: "ArrowUp" }, { ...libre, niveauChoisi: true })).toBe("remonter");
    expect(commandeDeTouche({ altKey: true, key: "ArrowDown", code: "ArrowDown" }, { ...libre, descentePossible: true })).toBe("descendre");
    expect(commandeDeTouche({ altKey: true, key: "ArrowDown", code: "ArrowDown" }, { ...libre, saisie: true, descentePossible: true })).toBeNull();
  });
});
