import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bilanImport, etatImportAuto, lancerImportAuto } from "./import-auto.js";

const attendreFin = async () => {
  for (let i = 0; i < 100 && etatImportAuto().etat === "en-cours"; i++) await new Promise((r) => setTimeout(r, 50));
  return etatImportAuto();
};

describe("import automatique des données GeoData au déploiement (D-GD-23)", () => {
  it("désactivé sans GEODATA_IMPORT_AUTO_PAR : rien n'est lancé", () => {
    lancerImportAuto({}, "/inexistant.js");
    expect(etatImportAuto().etat).toBe("desactive");
  });
  it("adresse invalide ou outil absent : échec déclaré, jamais un import silencieux", () => {
    lancerImportAuto({ GEODATA_IMPORT_AUTO_PAR: "pas-une-adresse" }, "/inexistant.js");
    expect(etatImportAuto()).toMatchObject({ etat: "echec", message: expect.stringContaining("courriel") });
    lancerImportAuto({ GEODATA_IMPORT_AUTO_PAR: "donnees@example.test" }, "/inexistant.js");
    expect(etatImportAuto()).toMatchObject({ etat: "echec", message: expect.stringContaining("absent") });
  });
  it("lance la chaîne d'import (--fiche toutes, préparateur et publieur), en tire un bilan ; un échec garde la dernière erreur", async () => {
    const dossier = mkdtempSync(join(tmpdir(), "gd-auto-"));
    const ok = join(dossier, "ok.mjs");
    writeFileSync(ok, `const a = process.argv.slice(2).join(" ");
if (a !== "--archiver --fiche toutes --preparateur donnees@example.test --publier-par donnees@example.test") { console.error("arguments : " + a); process.exit(2); }
console.log("Archive des fichiers : 2 ajouté(s), 0 modifié(s), 5 inchangé(s), 0 retiré(s).\\nVersion préparée : gdver_1 (couche c, 2 objets)\\nVersion gdver_1 publiée par donnees@example.test.\\nVersion déjà présente (même source, empreinte identique) : gdver_0 (publiee) ; aucune nouvelle version.\\nRetrait : osm-mar-villes (gdver_9) — remplacée");`);
    lancerImportAuto({ GEODATA_IMPORT_AUTO_PAR: "donnees@example.test" }, ok);
    expect(etatImportAuto().etat).toBe("en-cours");
    expect(await attendreFin()).toMatchObject({ etat: "termine", message: "Archive des fichiers : 2 ajouté(s), 0 modifié(s), 5 inchangé(s), 0 retiré(s). 1 version(s) préparée(s), 1 publiée(s), 1 retirée(s), 1 fiche(s) déjà en base." });
    const ko = join(dossier, "ko.mjs");
    writeFileSync(ko, `console.error("Publication bloquée (droits enregistrés ou contrôles)"); process.exit(1);`);
    lancerImportAuto({ GEODATA_IMPORT_AUTO_PAR: "donnees@example.test" }, ko);
    expect(await attendreFin()).toMatchObject({ etat: "echec", message: expect.stringContaining("Publication bloquée") });
  });
  it("sans GEODATA_IMPORT_AUTO_PAR, l'outil présent : seule l'archive des fichiers est faite (--archiver), sans compte", async () => {
    const dossier = mkdtempSync(join(tmpdir(), "gd-archive-"));
    const script = join(dossier, "archive.mjs");
    writeFileSync(script, `const a = process.argv.slice(2).join(" ");
if (a !== "--archiver") { console.error("arguments : " + a); process.exit(2); }
console.log("Archive des fichiers : 121 ajouté(s), 0 modifié(s), 0 inchangé(s), 0 retiré(s).");`);
    lancerImportAuto({}, script);
    expect(await attendreFin()).toMatchObject({ etat: "termine", message: "Archive des fichiers : 121 ajouté(s), 0 modifié(s), 0 inchangé(s), 0 retiré(s). Import automatique désactivé (GEODATA_IMPORT_AUTO_PAR absent)." });
  });
  it("bilan : compte les lignes du journal de la chaîne d'import", () => {
    expect(bilanImport("")).toBe("0 version(s) préparée(s), 0 publiée(s), 0 retirée(s), 0 fiche(s) déjà en base.");
  });
});
