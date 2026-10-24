/**
 * Règle d'or (AGENTS.md) appliquée aux commandes de collaboration des écarts E1 et E2 (CR-C1) : chaque commande a sa
 * propre icône (jamais partagée), sa place dans la barre où elle agit, et un raccourci — affiché, déclaré par
 * `aria-keyshortcuts` et branché sur un gestionnaire clavier — qui n'entre en collision avec aucun autre raccourci de
 * Fadi. Les sources des écrans sont relues : une commande sans icône, sans raccourci affiché ou sans gestionnaire
 * fait échouer la CI.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BASCULE_AUDIENCE, COMMANDES_COLLABORATION, declenche, propsRaccourci, type CommandeCollaboration } from "./commandes-collaboration";
import { IconeCollaboration, RaccourciCollaboration } from "./IconeCollaboration";

const SRC = new URL("../../", import.meta.url).pathname;
const lire = (chemin: string) => readFileSync(join(SRC, chemin), "utf8");
const COMMANDES = Object.keys(COMMANDES_COLLABORATION) as CommandeCollaboration[];

/** Écrans où chaque commande agit (sa barre) : formulaire de rédaction, en-tête du fil, ligne du membre. */
const ECRANS: Record<CommandeCollaboration, string[]> = {
  "visible-lecteurs": [
    "modules/collaboration/CollaborationModule.tsx", "modules/atelier/nouveau/panneaux/Modifications.tsx",
    "modules/studio/commentaires/PanneauCommentaires.tsx", "modules/studio/observations/PanneauObservations.tsx",
  ],
  "rendre-visible": ["modules/collaboration/CollaborationModule.tsx", "modules/studio/commentaires/PanneauCommentaires.tsx"],
  "reserver-equipe": ["modules/collaboration/CollaborationModule.tsx", "modules/studio/commentaires/PanneauCommentaires.tsx"],
  "export-lecteur": ["modules/collaboration/CollaborationModule.tsx"],
  approbateur: ["modules/collaboration/CollaborationModule.tsx"],
  diffuseur: ["modules/collaboration/CollaborationModule.tsx"],
  "gardien-contenu": ["modules/collaboration/CollaborationModule.tsx"],
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "node_modules" ? [] : sources(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

describe("Règle d'or — commandes de collaboration (audience, export du lecteur)", () => {
  it("chaque commande a sa propre icône, jamais partagée", () => {
    const dessins = COMMANDES.map((c) => COMMANDES_COLLABORATION[c].icone.join(" "));
    for (const [i, d] of dessins.entries()) expect(d.length, COMMANDES[i]).toBeGreaterThan(0);
    expect(new Set(dessins).size).toBe(dessins.length);
  });

  it("chaque commande a un raccourci ; seuls les deux sens de la bascule d'audience le partagent", () => {
    const parRaccourci = new Map<string, CommandeCollaboration[]>();
    for (const c of COMMANDES) parRaccourci.set(COMMANDES_COLLABORATION[c].raccourci.libelle, [...(parRaccourci.get(COMMANDES_COLLABORATION[c].raccourci.libelle) ?? []), c]);
    for (const [r, cs] of parRaccourci) expect(cs.length === 1 || [...cs].sort().join() === [...BASCULE_AUDIENCE].sort().join(), `${r} : ${cs.join(", ")}`).toBe(true);
  });

  it("aucun autre raccourci de Fadi n'emploie ces combinaisons", () => {
    const nos = new Set(COMMANDES.map((c) => COMMANDES_COLLABORATION[c].raccourci.libelle));
    const ailleurs = sources(SRC).filter((f) => !f.includes("/modules/collaboration/"))
      .flatMap((f) => [...readFileSync(f, "utf8").matchAll(/Alt\+Maj\+[A-Z0-9]+/g)].map((m) => ({ f, r: m[0] })))
      .filter(({ r, f }) => nos.has(r) && !(f.endsWith("Modifications.tsx") || f.includes("/studio/commentaires/") || f.includes("/studio/observations/")));
    expect(ailleurs).toEqual([]);
  });

  it("chaque écran porte l'icône, le raccourci affiché et déclaré, et un gestionnaire clavier de la commande", () => {
    for (const c of COMMANDES) {
      for (const ecran of ECRANS[c]) {
        const src = lire(ecran);
        expect(src.includes(`"${c}"`), `${ecran} : ${c}`).toBe(true);
        expect(src.includes("<IconeCollaboration commande="), `${ecran} : icône`).toBe(true);
        expect(src.includes("<RaccourciCollaboration commande="), `${ecran} : raccourci affiché`).toBe(true);
        expect(src.includes("propsRaccourci("), `${ecran} : aria-keyshortcuts`).toBe(true);
        expect(src.includes("declenche(e, "), `${ecran} : gestionnaire clavier`).toBe(true);
      }
    }
  });

  it("le raccourci ne se déclenche qu'avec Alt et Maj, ni Ctrl ni Méta, touche physique", () => {
    const t = (code: string, m: Partial<{ altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) =>
      ({ code, altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, ...m });
    expect(declenche(t("Digit1"), "visible-lecteurs")).toBe(true);
    expect(declenche(t("Digit1", { shiftKey: false }), "visible-lecteurs")).toBe(false);
    expect(declenche(t("Digit1", { ctrlKey: true }), "visible-lecteurs")).toBe(false);
    expect(declenche(t("Digit2"), "rendre-visible")).toBe(true);
    expect(declenche(t("Digit2"), "reserver-equipe")).toBe(true);
    expect(declenche(t("Digit3"), "export-lecteur")).toBe(true);
    expect(declenche(t("Digit3"), "visible-lecteurs")).toBe(false);
    expect(propsRaccourci("export-lecteur")["aria-keyshortcuts"]).toBe("Alt+Shift+3");
    expect(declenche(t("Digit4"), "approbateur")).toBe(true);
    expect(declenche(t("Digit5"), "diffuseur")).toBe(true);
    expect(declenche(t("Digit6"), "gardien-contenu")).toBe(true);
    expect(declenche(t("Digit4"), "diffuseur")).toBe(false);
  });

  it("rendu : icône SVG décorative, raccourci affiché", () => {
    for (const c of COMMANDES) {
      const svg = renderToStaticMarkup(createElement(IconeCollaboration, { commande: c }));
      expect(svg).toMatch(/^<svg [^>]*aria-hidden="true"/);
      expect(svg.replace(/<[^>]+>/g, "")).toBe("");
      expect(renderToStaticMarkup(createElement(RaccourciCollaboration, { commande: c }))).toContain(COMMANDES_COLLABORATION[c].raccourci.libelle);
    }
  });
});
