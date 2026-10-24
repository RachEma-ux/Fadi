import { describe, expect, it } from "vitest";
import { AudienceError, audienceChangeRefusal, audienceOfNew, audienceVisible, seesTeam } from "./audience.js";

describe("audience à l'intérieur d'un projet (écart E1)", () => {
  it("l'équipe = propriétaire et éditeurs ; lecteur et accès support ne lisent que l'audience « projet » (NULL = projet)", () => {
    expect([seesTeam("proprietaire"), seesTeam("editeur"), seesTeam("lecteur"), seesTeam("support")]).toEqual([true, true, false, false]);
    expect(audienceVisible("lecteur", "equipe")).toBe(false);
    expect(audienceVisible("support", "equipe")).toBe(false);
    expect(audienceVisible("lecteur", "projet")).toBe(true);
    expect(audienceVisible("lecteur", null)).toBe(true);
    expect(audienceVisible("editeur", "equipe")).toBe(true);
  });

  it("un nouvel élément est réservé à l'équipe par défaut ; un lecteur écrit pour tout le projet ; une réponse suit son fil", () => {
    expect(audienceOfNew("proprietaire", undefined)).toBe("equipe");
    expect(audienceOfNew("editeur", "projet")).toBe("projet");
    expect(audienceOfNew("lecteur", undefined)).toBe("projet");
    expect(() => audienceOfNew("lecteur", "equipe")).toThrow(AudienceError);
    expect(audienceOfNew("editeur", undefined, "equipe")).toBe("equipe");
    expect(audienceOfNew("lecteur", undefined, null)).toBe("projet");
    expect(() => audienceOfNew("editeur", "projet", "equipe")).toThrow(AudienceError);
  });

  it("l'audience d'un fil change par son auteur ou le propriétaire, de l'équipe ; jamais vers l'équipe si un lecteur y a écrit", () => {
    expect(audienceChangeRefusal({ role: "editeur", isAuthor: true }, "projet", false)).toBeNull();
    expect(audienceChangeRefusal({ role: "proprietaire", isAuthor: false }, "equipe", false)).toBeNull();
    expect(audienceChangeRefusal({ role: "editeur", isAuthor: false }, "projet", false)?.status).toBe(403);
    expect(audienceChangeRefusal({ role: "lecteur", isAuthor: true }, "projet", false)?.status).toBe(403);
    expect(audienceChangeRefusal({ role: "proprietaire", isAuthor: true }, "equipe", true)?.status).toBe(409);
    expect(audienceChangeRefusal({ role: "proprietaire", isAuthor: true }, "projet", true)).toBeNull();
  });
});
