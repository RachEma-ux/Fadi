/**
 * Règle d'or (AGENTS.md) appliquée aux commandes de la corbeille d'administration (UM-27) : « Restaurer » et
 * « Anonymiser maintenant » ont chacune leur propre icône, jamais partagée, et l'écran les affiche sur leur bouton.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ICONES_ADMIN, type CommandeAdmin } from "./icones-admin";
import { IconeAdmin } from "./IconeAdmin";

const ECRAN = readFileSync(new URL("../../routes/admin/AdminUsersPage.tsx", import.meta.url), "utf8");
const COMMANDES: CommandeAdmin[] = ["restaurer", "anonymiser"];

describe("Règle d'or — icônes des commandes d'administration", () => {
  it("chaque commande a une icône non vide", () => {
    for (const c of Object.keys(ICONES_ADMIN) as CommandeAdmin[]) expect(ICONES_ADMIN[c].length, c).toBeGreaterThan(0);
  });
  it("aucune icône n'est partagée entre deux entrées", () => {
    const dessins = Object.values(ICONES_ADMIN).map((d) => d.join(" "));
    expect(new Set(dessins).size).toBe(dessins.length);
  });
  it("chaque nouvelle commande de la corbeille porte son icône sur son bouton", () => {
    const ligne = (attr: string) => ECRAN.split("\n").find((l) => l.includes(attr)) ?? "";
    expect(ligne("data-trash-restore")).toContain('<IconeAdmin commande="restaurer" />Restaurer</button>');
    expect(ligne("data-trash-anonymize")).toContain('<IconeAdmin commande="anonymiser" />Anonymiser maintenant…</button>');
    for (const c of COMMANDES) expect(ECRAN.split(`<IconeAdmin commande="${c}"`).length - 1, c).toBe(1);
  });
  it("rendu : SVG décoratif, sans texte", () => {
    for (const c of COMMANDES) {
      const html = renderToStaticMarkup(createElement(IconeAdmin, { commande: c }));
      expect(html).toMatch(/^<svg [^>]*aria-hidden="true"/);
      expect(html.replace(/<[^>]+>/g, "")).toBe("");
    }
  });
});
