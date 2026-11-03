/**
 * BD-7.6 (chantier base-donnees, constat A7) : la liste des préfixes d'API du service worker (`public/sw.js`, `API`) est
 * identique à celle du serveur (`apps/api/src/app.ts`, `API_PREFIX`). Une route ajoutée d'un côté seulement fait échouer
 * ce test : hors ligne, une navigation vers l'API recevrait sinon la page de l'application au lieu d'une erreur.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SW = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const SERVEUR = readFileSync(new URL("../../../api/src/app.ts", import.meta.url), "utf8");

function regex(source: string, motif: RegExp): string {
  const m = motif.exec(source);
  if (!m?.[1]) throw new Error(`liste de préfixes introuvable (${motif.source})`);
  return m[1];
}

describe("BD-7.6 — préfixes d'API partagés service worker / serveur", () => {
  const sw = regex(SW, /^const API = (\/.+\/);$/m);
  const serveur = regex(SERVEUR, /^const API_PREFIX = (\/.+\/);$/m);

  it("les deux expressions sont identiques", () => {
    expect(sw).toBe(serveur);
  });

  it("chaque préfixe du serveur est reconnu par le service worker, et les routes de l'application ne le sont pas", () => {
    const api = new Function(`return ${sw};`)() as RegExp;
    for (const p of ["/auth/me", "/projects/p1", "/geodata/api/exports/x", "/organizations", "/admin/users", "/reviews/r", "/mcp", "/sandbox/preferences", "/version", "/com/boite"]) expect(api.test(p), p).toBe(true);
    for (const p of ["/", "/geodata", "/geodata/carte", "/organisations", "/admin/utilisateurs", "/sandbox", "/assets/app.js", "/parcelle/"]) expect(api.test(p), p).toBe(false);
  });
});
