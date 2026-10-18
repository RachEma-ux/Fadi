/**
 * Règle d'or (AGENTS.md, D-202) appliquée à la planche 2D de Studio V1 : chaque outil du registre `STUDIO_TOOLS` et
 * chaque commande de l'éditeur a sa propre icône (existante dans Icon.tsx, jamais partagée), une place dans une barre
 * appropriée et un raccourci unique ; la table clavier de l'éditeur est exactement celle du registre.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STUDIO_COMMAND_TOOL_IDS, STUDIO_TOOLS } from "@parcours/atelier-model";
import { Icon, type IconName } from "../../../components/Icon";
import { BarreOutils } from "./BarreOutils";
import { BARRES_STUDIO, cibleRaccourci, combinaison, COMMANDES_EDITEUR, commandesDeBarre, libelleRaccourci, outilsDeBarre, TABLE_CLAVIER } from "./raccourcis";

const entrees = [
  ...STUDIO_TOOLS.map((t) => ({ id: t.toolId, icone: t.iconeSymbolique as IconName, raccourcis: [t.raccourci], barre: t.groupe as string })),
  ...COMMANDES_EDITEUR.map((c) => ({ id: c.id, icone: c.iconeSymbolique as IconName, raccourcis: [c.raccourci, ...(c.autres ?? [])], barre: c.groupe as string })),
];
const trace = (name: IconName) => /<path d="([^"]*)"/.exec(renderToStaticMarkup(createElement(Icon, { name })))?.[1] ?? "";

/** Événement clavier qui produit le raccourci (lettre en minuscule sans Maj, comme un vrai clavier). */
function evenement(r: string) {
  const parts = r.split("+");
  const touche = parts[parts.length - 1]!;
  const shiftKey = parts.includes("Shift");
  const key = touche === "Space" ? " " : touche.length === 1 ? (shiftKey ? touche.toUpperCase() : touche.toLowerCase()) : touche;
  return { key, ctrlKey: parts.includes("Ctrl"), metaKey: false, shiftKey, altKey: false };
}

describe("Planche 2D de Studio — règle d'or", () => {
  it("chaque outil et chaque commande a sa propre icône, dessinée dans Icon.tsx", () => {
    const icones = entrees.map((e) => e.icone);
    expect(new Set(icones).size, "nom d'icône partagé").toBe(icones.length);
    const traces = icones.map(trace);
    for (const [i, d] of traces.entries()) expect(d.length, `icône absente : ${icones[i]}`).toBeGreaterThan(0);
    expect(new Set(traces).size, "dessin d'icône partagé").toBe(traces.length);
  });

  it("chaque outil et chaque commande est rangé dans une barre déclarée", () => {
    const barres = new Set(BARRES_STUDIO.map((b) => b.id as string));
    for (const e of entrees) expect(barres.has(e.barre), e.id).toBe(true);
    const ranges = BARRES_STUDIO.flatMap((b) => [...outilsDeBarre(b.id).map((t) => t.toolId as string), ...commandesDeBarre(b.id).map((c) => c.id as string)]);
    expect(ranges.sort()).toEqual(entrees.map((e) => e.id).sort());
    // Les mutations du registre sont exactement les commandes envoyées au serveur.
    expect(STUDIO_TOOLS.filter((t) => t.nature === "mutation").map((t) => t.toolId)).toEqual([...STUDIO_COMMAND_TOOL_IDS]);
  });

  it("chaque raccourci est unique et la table clavier de l'éditeur est celle du registre", () => {
    const tous = entrees.flatMap((e) => e.raccourcis);
    expect(new Set(tous).size).toBe(tous.length);
    expect(TABLE_CLAVIER.size).toBe(tous.length);
    for (const t of STUDIO_TOOLS) {
      expect(cibleRaccourci(combinaison(evenement(t.raccourci))), t.toolId).toEqual({ type: "outil", toolId: t.toolId });
    }
    for (const c of COMMANDES_EDITEUR) {
      for (const r of [c.raccourci, ...(c.autres ?? [])]) expect(cibleRaccourci(combinaison(evenement(r))), r).toEqual({ type: "commande", id: c.id });
    }
    // Rien dans la table qui ne vienne du registre ou des commandes déclarées.
    for (const [r, cible] of TABLE_CLAVIER) {
      if (cible.type === "outil") expect(STUDIO_TOOLS.find((t) => t.toolId === cible.toolId)?.raccourci).toBe(r);
      else expect(entrees.find((e) => e.id === cible.id)?.raccourcis).toContain(r);
    }
  });

  it("la barre rendue montre chaque outil et chaque commande : icône, nom visible et raccourci", () => {
    const html = renderToStaticMarkup(createElement(BarreOutils, {
      outil: "studio.dessin.selection", outilDisponible: () => true, commandeDisponible: () => true, surOutil: () => {}, surCommande: () => {},
    }));
    expect(html).toContain('role="toolbar" aria-label="Outils de dessin"');
    for (const t of STUDIO_TOOLS) {
      const bouton = new RegExp(`<button[^>]*aria-label="${t.libelleFR}"[^>]*aria-keyshortcuts="[^"]+"[^>]*data-studio-outil="${t.toolId}"[^>]*>(.*?)</button>`).exec(html);
      expect(bouton, t.toolId).not.toBeNull();
      expect(bouton![1]).toContain(`<path d="${trace(t.iconeSymbolique)}"`);
      expect(bouton![1]).toContain(`<span>${t.libelleFR}</span>`);
      expect(bouton![1]).toContain(`<kbd aria-hidden="true">${libelleRaccourci(t.raccourci)}</kbd>`);
    }
    for (const c of COMMANDES_EDITEUR) expect(html, c.id).toMatch(new RegExp(`data-studio-commande="${c.id}"`));
  });

  it("lecture du clavier : modificateur seul ou Alt ignorés, Cmd vaut Ctrl", () => {
    expect(combinaison({ key: "Shift", ctrlKey: false, metaKey: false, shiftKey: true, altKey: false })).toBeNull();
    expect(combinaison({ key: "l", ctrlKey: false, metaKey: false, shiftKey: false, altKey: true })).toBeNull();
    expect(combinaison({ key: "z", ctrlKey: false, metaKey: true, shiftKey: false, altKey: false })).toBe("Ctrl+Z");
    expect(cibleRaccourci("Ctrl+Shift+Z")).toEqual({ type: "commande", id: "retablir" });
    expect(cibleRaccourci("Q")).toBeNull();
    expect(libelleRaccourci("Ctrl+Shift+N")).toBe("Ctrl+Maj+N");
    expect(libelleRaccourci("Delete")).toBe("Suppr");
  });
});
