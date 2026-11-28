import { describe, expect, it } from "vitest";
import { ajouterRectangle, grouper, modeleVide, pousserTirer, type Modele } from "./geometrie-libre.js";
import { ajouterScenes } from "./balises-l4.js";
import { v3 } from "./vecteur.js";
import { donneesVisionneuse, ecrireVisionneuse, empreinteAbregee, jsonDansScript, trianglesVisionneuse, versionVisionneuse } from "./visionneuse.js";
import { SCRIPT_VISIONNEUSE } from "./visionneuse-script.js";

const MAINTENANT = new Date("2026-11-28T10:58:00Z");

/** Une boîte (composant) sur la balise « Façades » masquée, une face libre, deux scènes. */
const maison = (): { m: Modele; scenes: string[] } => {
  const r = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
  const b = pousserTirer(r, Object.keys(r.racine.faces)[0]!, 1).modele;
  const g = grouper(b, [...Object.keys(b.racine.faces), ...Object.keys(b.racine.aretes)], { nom: "Boîte <1>", genre: "composant" }).modele;
  const f = ajouterRectangle(g, v3(5, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
  const s = ajouterScenes(f, [
    { nom: "Vue d'ensemble", position: v3(10, -10, 8), cible: v3(1, 1, 0.5), champDeVision: 35, projection: "perspective" },
    { nom: "Façade sud", position: v3(1, -20, 0.5), cible: v3(1, 1, 0.5), champDeVision: 35, projection: "parallele" },
  ]);
  const occ = Object.values(s.modele.racine.occurrences)[0]!;
  const m: Modele = {
    ...s.modele,
    racine: { ...s.modele.racine, occurrences: { ...s.modele.racine.occurrences, [occ.id]: { ...occ, balise: "b1" } } },
    annotations: { ...s.modele.annotations!, balises: { b1: { id: "b1", nom: "Façades", couleur: "#d6452f", visible: false } } },
  };
  return { m, scenes: s.extra };
};

describe("visionneuse hors ligne (cas 4, lot C4, étape 7d)", () => {
  it("version en heure suisse et empreinte abrégée", () => {
    expect(versionVisionneuse(MAINTENANT)).toBe("28.11.2026, 11 h 58");
    expect(versionVisionneuse(new Date("2026-07-01T06:05:00Z"))).toBe("01.07.2026, 8 h 05");
    expect(empreinteAbregee("7f3a91c0aaaa2c21")).toBe("7f3a 91c0 … 2c21");
  });

  it("données : millimètres entiers, balises portées sur option, vues retenues dans l'ordre demandé", () => {
    const { m, scenes } = maison();
    const d = donneesVisionneuse(m, { nom: "Maison", balises: true, scenes: [scenes[1]!, "inconnue"], maintenant: MAINTENANT });
    expect(d.maillages).toHaveLength(2);
    expect(d.balises).toEqual([{ id: "b1", nom: "Façades", couleur: "#d6452f", visible: false }]);
    expect(d.maillages.find((x) => x.nom === "Boîte <1>")!.balise).toBe(0);
    for (const x of d.maillages) for (const p of x.positions) expect(Number.isInteger(p)).toBe(true);
    expect(Math.max(...d.maillages.flatMap((x) => x.positions))).toBe(6000);
    expect(d.vues.map((v) => v.nom)).toEqual(["Façade sud"]);
    expect(d.vues[0]!.projection).toBe("parallele");
    expect(trianglesVisionneuse(m)).toBe(14);
  });

  it("sans les balises : ce qui est masqué par sa balise ne part pas", () => {
    const { m } = maison();
    const d = donneesVisionneuse(m, { nom: "Maison", balises: false, scenes: [], maintenant: MAINTENANT });
    expect(d.balises).toEqual([]);
    expect(d.maillages.map((x) => x.nom)).toEqual(["Géométrie libre"]);
  });

  it("fichier : autonome (aucune ressource externe), lecture seule, texte échappé, reproductible", () => {
    const { m, scenes } = maison();
    const o = { nom: "Maison <Dupuis>", balises: true, scenes, maintenant: MAINTENANT };
    const r = ecrireVisionneuse(m, o);
    expect(r.html.startsWith("<!doctype html>")).toBe(true);
    expect(r.html).toContain("default-src 'none'");
    expect(r.html).not.toMatch(/\b(src|href)=["']?(https?:)?\/\//);
    expect(r.html).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|import\(/);
    expect(r.html).toContain("Lecture seule");
    expect(r.html).toContain("Maison &lt;Dupuis&gt;");
    expect(r.html).not.toContain("<Dupuis>");
    expect(r.html).toContain(`Version du 28.11.2026, 11 h 58 · empreinte ${empreinteAbregee(r.empreinte)}`);
    expect(r.html).toContain("Fichier autonome : aucun réseau, aucun serveur");
    expect(r.triangles).toBe(14);
    expect(r.vues).toBe(2);
    expect(r.octets).toBe(new TextEncoder().encode(r.html).length);
    expect(ecrireVisionneuse(m, o).html).toBe(r.html);
    // Une seule fermeture de balise <script> par script : rien dans les données ni dans le code ne la referme.
    expect(r.html.match(/<\/script>/g)).toHaveLength(2);
  });

  it("JSON dans une balise <script> : « < » et séparateurs de ligne échappés", () => {
    expect(jsonDansScript({ a: "</script><b>\u2028" })).toBe('{"a":"\\u003c/script>\\u003cb>\\u2028"}');
    expect(JSON.parse(jsonDansScript({ a: "</script>" }))).toEqual({ a: "</script>" });
  });

  it("script embarqué : sans accent grave ni « </ », sans réseau", () => {
    expect(SCRIPT_VISIONNEUSE).not.toContain("`");
    expect(SCRIPT_VISIONNEUSE).not.toContain("</");
    expect(SCRIPT_VISIONNEUSE).not.toMatch(/fetch|XMLHttpRequest|WebSocket|localStorage|indexedDB/);
    expect(() => new Function(SCRIPT_VISIONNEUSE)).not.toThrow();
  });
});
