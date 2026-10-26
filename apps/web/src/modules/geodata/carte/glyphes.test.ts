import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLAGES_GLYPHES, POLICE_ETIQUETTES } from "@parcours/geodata-model";

const PUBLIC = new URL("../../../../public/", import.meta.url);

describe("glyphes hébergés des libellés (D-GD-24)", () => {
  const dossier = new URL(`geodata/glyphes/${POLICE_ETIQUETTES}/`, PUBLIC);
  const notice = readFileSync(new URL("licences/noto-sans/NOTICE.txt", PUBLIC), "utf8");
  it("exactement les plages déclarées, ni plus ni moins", () => {
    expect(readdirSync(dossier).sort()).toEqual(PLAGES_GLYPHES.map(([a, b]) => `${a}-${b}.pbf`).sort());
  });
  it("chaque fichier a l'empreinte consignée dans la notice ; la licence OFL est servie", () => {
    for (const [a, b] of PLAGES_GLYPHES) {
      const nom = `${a}-${b}.pbf`;
      const sha = createHash("sha256").update(readFileSync(new URL(nom, dossier))).digest("hex");
      expect(notice).toMatch(new RegExp(`^${nom.replace(".", "\\.")}\\s+${sha}$`, "m"));
    }
    expect(readFileSync(new URL("licences/noto-sans/OFL.txt", PUBLIC), "utf8")).toContain("SIL Open Font License, Version 1.1");
  });
});
