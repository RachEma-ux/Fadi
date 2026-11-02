/**
 * Règle d'or (AGENTS.md) appliquée aux commandes de l'administration des comptes : « Restaurer » et « Anonymiser
 * maintenant » (corbeille, UM-27), « Renvoyer », « Copier le lien » et « Masquer les comptes de test » (UM-31) ont
 * chacune leur propre icône, jamais partagée, affichée sur leur contrôle ; les commandes UM-31 ont aussi un raccourci
 * propre, annoncé par `aria-keyshortcuts`.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ICONES_ADMIN, type CommandeAdmin } from "./icones-admin";
import { IconeAdmin } from "./IconeAdmin";
import { commandeAdminDuClavier, RACCOURCIS_ADMIN, type CommandeRaccourcie } from "./raccourcis-admin";

const ECRAN = readFileSync(new URL("../../routes/admin/AdminUsersPage.tsx", import.meta.url), "utf8");
const COMMANDES: CommandeAdmin[] = ["restaurer", "anonymiser", "renvoyer", "copier-lien", "comptes-test", "auto-controle"];
const RACCOURCIES = Object.keys(RACCOURCIS_ADMIN) as CommandeRaccourcie[];
const ligne = (attr: string) => ECRAN.split("\n").find((l) => l.includes(attr)) ?? "";

describe("Règle d'or — icônes des commandes d'administration", () => {
  it("chaque commande a une icône non vide", () => {
    for (const c of Object.keys(ICONES_ADMIN) as CommandeAdmin[]) expect(ICONES_ADMIN[c].length, c).toBeGreaterThan(0);
  });
  it("aucune icône n'est partagée entre deux entrées", () => {
    const dessins = Object.values(ICONES_ADMIN).map((d) => d.join(" "));
    expect(new Set(dessins).size).toBe(dessins.length);
  });
  it("chaque nouvelle commande de la corbeille porte son icône sur son bouton", () => {
    expect(ligne("data-trash-restore")).toContain('<IconeAdmin commande="restaurer" />Restaurer</button>');
    expect(ligne("data-trash-anonymize")).toContain('<IconeAdmin commande="anonymiser" />Anonymiser maintenant…</button>');
    for (const c of COMMANDES) expect(ECRAN.split(`<IconeAdmin commande="${c}"`).length - 1, c).toBe(1);
  });
  it("UM-31 : « Renvoyer », « Copier le lien » et « Masquer les comptes de test » portent leur icône et leur raccourci", () => {
    expect(ligne("data-invitation-resend")).toContain('<IconeAdmin commande="renvoyer" />Renvoyer</button>');
    expect(ligne("data-invitation-resend")).toContain("aria-keyshortcuts={RACCOURCIS_ADMIN.renvoyer.aria}");
    expect(ligne("data-invitation-copy")).toContain('<IconeAdmin commande="copier-lien" />Copier le lien</button>');
    expect(ligne("data-invitation-copy")).toContain('aria-keyshortcuts={RACCOURCIS_ADMIN["copier-lien"].aria}');
    expect(ligne("data-hide-test")).toContain('aria-keyshortcuts={RACCOURCIS_ADMIN["comptes-test"].aria}');
    expect(ECRAN).toContain('<IconeAdmin commande="comptes-test" />Masquer les comptes de test');
  });
  it("OP-6 : l'interrupteur « Auto-contrôle » porte son icône, son raccourci et sa barre (groupe « Autorisations » de la fiche)", () => {
    expect(ligne("data-self-control ")).toContain('aria-keyshortcuts={RACCOURCIS_ADMIN["auto-controle"].aria}');
    expect(ligne("data-self-control ")).toContain('role="switch"');
    expect(ECRAN).toContain('<IconeAdmin commande="auto-controle" />Auto-contrôle');
    expect(ECRAN).toMatch(/role="group" aria-labelledby="admin-autorisations" data-admin-autorisations/);
    expect(ECRAN).toContain('commandeAdminDuClavier(e) !== "auto-controle"');
  });
  it("chaque commande UM-31 a un raccourci propre, reconnu au clavier (Alt+Maj, touche physique)", () => {
    const touches = RACCOURCIES.map((c) => RACCOURCIS_ADMIN[c].touche);
    expect(new Set(touches).size).toBe(touches.length);
    for (const c of RACCOURCIES) {
      const { touche, aria, libelle } = RACCOURCIS_ADMIN[c];
      expect(ICONES_ADMIN[c].length, c).toBeGreaterThan(0);
      expect(aria).toBe(`Alt+Shift+${touche.replace("Key", "")}`);
      expect(libelle).toBe(`Raccourci : Alt+Maj+${touche.replace("Key", "")}`);
      expect(commandeAdminDuClavier({ code: touche, altKey: true, shiftKey: true, ctrlKey: false, metaKey: false })).toBe(c);
      expect(commandeAdminDuClavier({ code: touche, altKey: true, shiftKey: false, ctrlKey: false, metaKey: false })).toBeNull();
      expect(commandeAdminDuClavier({ code: touche, altKey: true, shiftKey: true, ctrlKey: true, metaKey: false })).toBeNull();
    }
  });
  it("rendu : SVG décoratif, sans texte", () => {
    for (const c of COMMANDES) {
      const html = renderToStaticMarkup(createElement(IconeAdmin, { commande: c }));
      expect(html).toMatch(/^<svg [^>]*aria-hidden="true"/);
      expect(html.replace(/<[^>]+>/g, "")).toBe("");
    }
  });
});
