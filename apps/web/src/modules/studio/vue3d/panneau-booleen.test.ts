import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand } from "@parcours/atelier-model";
import en from "../../../lib/i18n/en.json";
import { Traducteur } from "../../../lib/i18n/traduire";
import { MESSAGES_NOYAU_EXACT } from "../exact/client-exact";
import { MESSAGES_BOOLEEN } from "../exact/booleen-session";
import { Vue3DStudio } from "./Vue3DStudio";

/**
 * Panneau « Booléen exact » de la vue 3D (lot F2) : rendu sans noyau (aucun Worker créé au rendu), rien choisi d'office,
 * solides exacts listés et sélectionnables, et chaque texte d'interface traduit (D-163).
 */
const boite = (id: string, x: number): StudioCommand => ({ toolId: "studio.solide.boite", params: { id, type: "box", placement: { origin: { x, y: 0, z: 0 }, rotation: 0 }, width: 2, depth: 2, height: 2 } });
const tetra = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0], indices: [0, 1, 2, 3, 4, 5] };
const resultat = { brep: "U1lOVEhFVElRVUU=", maillage: tetra, volume: 12, aire: 1, faces: 10, solides: 1, moteur: "occt-wasm" as const, versionMoteur: "5.6.1", empreinte: "0123456789abcdef" };
const doc = () => applyStudioCommands(newStudioDocument("p"), [boite("A", 0), boite("B", 1), boite("C", 5), boite("D", 6),
  { toolId: "studio.solide.booleen", params: { id: "E", operation: "union", operandes: ["A", "B"], resultat } }]);
const t = new Traducteur(en as Record<string, string>);
/** Textes visibles du HTML statique (nœuds texte et options), entités décodées. */
const textes = (html: string) => [...html.replace(/<(script|style)[\s\S]*?<\/\1>/g, "").matchAll(/>([^<]+)</g)].map((m) => m[1]!.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim()).filter((s) => /[A-Za-zÀ-ÿ]{3}/.test(s));

describe("Panneau du booléen exact (lot F2)", () => {
  it("rendu : noyau non chargé (aucun Worker au rendu), opération et solides vides, solides libres et exacts proposés, licence citée", () => {
    const html = renderToStaticMarkup(createElement(Vue3DStudio, { doc: doc(), outil: "studio.solide.booleen", modifiable: true }));
    expect(html).toContain('data-studio-exact-noyau="absent"');
    expect(html).toContain('data-studio-exact-etat="inactif"');
    expect(html).toMatch(/<select name="booleen-operation" required=""[^>]*><option value="" selected="">Choisir l’opération…/);
    for (const id of ["C", "D", "E"]) expect(html).toContain(`<option value="${id}">`);
    expect(html).not.toContain('<option value="A">');
    expect(html).toContain('data-studio-solide-type="exact" data-studio-solide-operation="union" data-studio-solide-operandes="A B"');
    expect(html).toContain('href="/licences/occt-wasm/NOTICE.txt"');
  });

  it("solide exact sélectionné : description, opérandes conservés, seule la suppression est offerte", () => {
    const html = renderToStaticMarkup(createElement(Vue3DStudio, { doc: doc(), outil: "studio.solide.booleen", modifiable: true, selection: "E" }));
    expect(html).toContain('data-studio-exact-choisi="E"');
    expect(html).toMatch(/Sélection : Solide exact \(union\) · 12 m³, 10 face\(s\), opérandes conservés : Boîte 2 × 2 × 2 m ; Boîte 2 × 2 × 2 m/);
    expect(html).not.toContain('data-studio-solide-choisi="E"');
  });

  it("chaque texte du panneau, de la liste et des messages a sa traduction anglaise (en.json)", () => {
    const html = renderToStaticMarkup(createElement(Vue3DStudio, { doc: doc(), outil: "studio.solide.booleen", modifiable: true, selection: "E" }));
    // Parties du lot F2 seulement : le panneau, la ligne du solide exact et son bloc de sélection.
    const parties = [/<form[^>]*data-studio-booleen[\s\S]*?<\/form>/, /<li><button[^>]*data-studio-solide-type="exact"[\s\S]*?<\/li>/, /<div data-studio-exact-choisi[\s\S]*?<\/fieldset><\/div>/]
      .map((re) => re.exec(html)?.[0] ?? "");
    expect(parties.every((x) => x.length > 0)).toBe(true);
    const dico = en as Record<string, string>;
    const manquants = [...parties.flatMap(textes), ...Object.values(MESSAGES_NOYAU_EXACT), ...Object.values(MESSAGES_BOOLEEN).filter((m) => !m.includes("{0}")), MESSAGES_BOOLEEN.calculRefuse.replace("{0}", "x")]
      .filter((s) => !Object.hasOwn(dico, s) && t.traduire(s) === s);
    expect(manquants).toEqual([]);
  });
});
