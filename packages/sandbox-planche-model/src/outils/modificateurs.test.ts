/** Touches de modification frappées seules (lot Planche 9, EX-CMD-04 ; cas A-04, A-05, A-06 de la V1). */
import { describe, expect, it } from "vitest";
import { type EtatFrappeSeule, FRAPPE_SEULE_VIDE, appuiFrappe, consommerFrappe, oublierFrappe, relacheFrappe } from "./modificateurs.js";

/** Joue une suite « +X » (appui) / « -X » (relâchement) et rend les frappes seules obtenues. */
function jouer(suite: string, depart: EtatFrappeSeule = FRAPPE_SEULE_VIDE): string[] {
  let e = depart;
  const seules: string[] = [];
  for (const pas of suite.split(" ")) {
    const t = pas.slice(1);
    if (pas[0] === "+") e = appuiFrappe(e, t);
    else if (pas[0] === "*") e = appuiFrappe(e, t, true);
    else if (pas === "!pointeur") e = consommerFrappe(e);
    else {
      const r = relacheFrappe(e, t);
      e = r.etat;
      if (r.seule) seules.push(r.seule);
    }
  }
  return seules;
}

describe("Frappe seule d'un modificateur (EX-CMD-04)", () => {
  it("appui puis relâchement seul : une frappe ; la répétition automatique est ignorée ; aucun seuil de durée", () => {
    expect(jouer("+Maj -Maj")).toEqual(["Maj"]);
    expect(jouer("+Ctrl *Ctrl *Ctrl -Ctrl")).toEqual(["Ctrl"]);
    expect(jouer("+Alt -Alt +Alt -Alt")).toEqual(["Alt", "Alt"]);
  });

  it("A-04 : Maj + F choisit Suivez-moi, sans frappe seule de Maj", () => {
    expect(jouer("+Maj +F -F -Maj")).toEqual([]);
  });

  it("A-05 : Maj + chiffre (clavier français) tape un nombre, sans frappe seule", () => {
    expect(jouer("+Maj +1 -1 +2 -2 -Maj")).toEqual([]);
  });

  it("A-06 : Ctrl + Z, Ctrl + Maj + Z, Maj + Tab et AltGr ne déclenchent rien", () => {
    expect(jouer("+Ctrl +z -z -Ctrl")).toEqual([]);
    expect(jouer("+Ctrl +Maj +z -z -Maj -Ctrl")).toEqual([]);
    expect(jouer("+Maj +Tab -Tab -Maj")).toEqual([]);
    // AltGr arrive comme Ctrl puis Alt (Windows) : deux modificateurs, aucune frappe seule.
    expect(jouer("+Ctrl +Alt -Alt -Ctrl")).toEqual([]);
  });

  it("un geste du pointeur pendant l'appui consomme la frappe ; la perte de focus oublie tout", () => {
    expect(jouer("+Maj !pointeur -Maj")).toEqual([]);
    const tenu = appuiFrappe(FRAPPE_SEULE_VIDE, "Alt");
    expect(relacheFrappe(oublierFrappe(), "Alt").seule).toBeNull();
    expect(tenu.attente).toBe("Alt");
  });

  it("relâcher un modificateur jamais vu enfoncé (focus revenu entre-temps) ne déclenche rien", () => {
    expect(jouer("-Maj")).toEqual([]);
  });
});
