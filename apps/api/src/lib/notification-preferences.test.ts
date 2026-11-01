import { describe, expect, it } from "vitest";
import { basculerProjet, filtrerNotifications, fusionner, lirePreferences, NOTIFICATION_KINDS } from "./notification-preferences.js";

const it1 = { kind: "commentaire" as const, projectId: "p1" };
const it2 = { kind: "acces" as const, projectId: "p2" };
const it3 = { kind: "commentaire-studio" as const, projectId: "p2" };

describe("préférences de notification", () => {
  it("lit une colonne absente ou illisible comme « tout affiché »", () => {
    expect(lirePreferences(null)).toEqual({ typesMasques: [], projetsMuets: [] });
    expect(lirePreferences("x")).toEqual({ typesMasques: [], projetsMuets: [] });
    expect(lirePreferences({ typesMasques: ["inconnu", "acces", "acces"], projetsMuets: ["p1", 3, "p1"] })).toEqual({ typesMasques: ["acces"], projetsMuets: ["p1"] });
  });

  it("filtre par type masqué et par projet muet, et compte ce qui est masqué", () => {
    expect(filtrerNotifications([it1, it2, it3], { typesMasques: [], projetsMuets: [] })).toEqual({ items: [it1, it2, it3], masquees: 0 });
    expect(filtrerNotifications([it1, it2, it3], { typesMasques: ["commentaire"], projetsMuets: [] })).toEqual({ items: [it2, it3], masquees: 1 });
    expect(filtrerNotifications([it1, it2, it3], { typesMasques: [], projetsMuets: ["p2"] })).toEqual({ items: [it1], masquees: 2 });
  });

  it("fusionne une mise à jour partielle et bascule un projet sans doublon", () => {
    const base = { typesMasques: ["verrou" as const], projetsMuets: ["p1"] };
    expect(fusionner(base, { typesMasques: ["peremption", "acces"] })).toEqual({ typesMasques: ["acces", "peremption"], projetsMuets: ["p1"] });
    expect(basculerProjet(base, "p1", true).projetsMuets).toEqual(["p1"]);
    expect(basculerProjet(base, "p2", true).projetsMuets).toEqual(["p1", "p2"]);
    expect(basculerProjet(base, "p1", false).projetsMuets).toEqual([]);
  });

  it("couvre les dix types calculés (dont `message`, `demande` et `revue`)", () => {
    expect([...NOTIFICATION_KINDS].sort()).toEqual(["acces", "commentaire", "commentaire-studio", "demande", "message", "modification", "peremption", "reservation", "revue", "verrou"]);
  });
});
