/**
 * Règle d'or (AGENTS.md) appliquée aux commandes de la revue externe (phase 4) : chaque commande a sa propre icône
 * (jamais partagée, y compris avec les commandes de collaboration), sa place dans la barre où elle agit, et un raccourci
 * — affiché, déclaré par `aria-keyshortcuts` et branché sur un gestionnaire clavier — qu'aucun autre raccourci de Fadi
 * n'emploie. Les sources des écrans sont relues : une commande sans icône, sans raccourci ou sans gestionnaire échoue.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Traducteur } from "../../lib/i18n/traduire";
import dico from "../../lib/i18n/en.json";
import { COMMANDES_COLLABORATION } from "./commandes-collaboration";
import { COMMANDES_REVUE, declencheRevue, propsRaccourciRevue, type CommandeRevue } from "./commandes-revue";
import { IconeRevue, RaccourciRevue } from "./IconeRevue";

const SRC = new URL("../../", import.meta.url).pathname;
const lire = (chemin: string) => readFileSync(join(SRC, chemin), "utf8");
const COMMANDES = Object.keys(COMMANDES_REVUE) as CommandeRevue[];
const ECRAN = { destinataire: "routes/revues/RevuesPage.tsx", equipe: "modules/collaboration/RevuesExternes.tsx" } as const;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "node_modules" ? [] : sources(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

describe("Règle d'or — commandes de la revue externe", () => {
  it("chaque commande a sa propre icône, distincte aussi des commandes de collaboration", () => {
    const dessins = [...COMMANDES.map((c) => COMMANDES_REVUE[c].icone.join(" ")), ...Object.values(COMMANDES_COLLABORATION).map((c) => c.icone.join(" "))];
    expect(new Set(dessins).size).toBe(dessins.length);
  });

  it("chaque commande a son raccourci, unique", () => {
    const libelles = COMMANDES.map((c) => COMMANDES_REVUE[c].raccourci.libelle);
    expect(new Set(libelles).size).toBe(libelles.length);
    // Aucune combinaison partagée avec une commande de collaboration (Communication, Participants compris).
    for (const c of Object.values(COMMANDES_COLLABORATION)) expect(libelles).not.toContain(c.raccourci.libelle);
  });

  it("aucun autre écran de Fadi n'emploie ces combinaisons", () => {
    const nos = new Set(COMMANDES.map((c) => COMMANDES_REVUE[c].raccourci.libelle));
    const ailleurs = sources(SRC).filter((f) => !f.endsWith("commandes-revue.ts"))
      .flatMap((f) => [...readFileSync(f, "utf8").matchAll(/Ctrl\+Alt\+Maj\+[^\s"'`]+/g)].map((m) => ({ f, r: m[0] })))
      .filter(({ r }) => nos.has(r));
    expect(ailleurs).toEqual([]);
  });

  it("chaque écran porte l'icône, le raccourci affiché et déclaré, et un gestionnaire clavier de chaque commande", () => {
    for (const c of COMMANDES) {
      const src = lire(ECRAN[COMMANDES_REVUE[c].ecran]);
      expect(src.includes(`commande="${c}"`), `${c} : bouton`).toBe(true);
      expect(src.includes("<IconeRevue commande="), `${c} : icône`).toBe(true);
      expect(src.includes("<RaccourciRevue commande="), `${c} : raccourci affiché`).toBe(true);
      expect(src.includes("propsRaccourciRevue("), `${c} : aria-keyshortcuts`).toBe(true);
      expect(new RegExp(`declencheRevue\\([^,]+, "${c}"\\)`).test(src), `${c} : gestionnaire clavier`).toBe(true);
    }
  });

  it("le raccourci ne se déclenche qu'avec Alt et Maj, ni Ctrl ni Méta, touche physique", () => {
    const t = (code: string, m: Partial<{ altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => ({ code, altKey: true, shiftKey: true, ctrlKey: true, metaKey: false, ...m });
    expect(declencheRevue(t("Comma"), "nouveau-constat")).toBe(true);
    expect(declencheRevue(t("Comma", { ctrlKey: false }), "nouveau-constat")).toBe(false);
    expect(declencheRevue(t("Comma", { shiftKey: false }), "nouveau-constat")).toBe(false);
    expect(declencheRevue(t("Comma", { metaKey: true }), "nouveau-constat")).toBe(false);
    expect(declencheRevue(t("Digit5"), "revoquer-acces")).toBe(true);
    expect(propsRaccourciRevue("partager-paquet")["aria-keyshortcuts"]).toBe("Control+Alt+Shift+3");
  });

  it("rendu : icône SVG décorative, raccourci affiché ; libellés traduits", () => {
    const tr = new Traducteur(dico as Record<string, string>);
    for (const c of COMMANDES) {
      const svg = renderToStaticMarkup(createElement(IconeRevue, { commande: c }));
      expect(svg).toMatch(/^<svg [^>]*aria-hidden="true"/);
      expect(renderToStaticMarkup(createElement(RaccourciRevue, { commande: c }))).toContain(COMMANDES_REVUE[c].raccourci.libelle);
      expect(tr.traduire(COMMANDES_REVUE[c].libelle), c).not.toBe(COMMANDES_REVUE[c].libelle);
    }
  });
});
