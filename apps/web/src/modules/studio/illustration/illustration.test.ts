import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import en from "../../../lib/i18n/en.json";
import { COMMANDES_EDITEUR, RACCOURCIS_RESERVES } from "../planche2d/raccourcis";
import { CATALOGUE } from "../planche2d/catalogue";
import type { FournisseurIllustration } from "./api-lot-f";
import { DialogueIllustration } from "./DialogueIllustration";
import { PanneauAgents } from "./PanneauAgents";
import { base64DeOctets, CHOIX_ILLUSTRATION_INITIAL, corpsIllustration, LIBELLES_ACTION_AGENT, LIBELLES_STATUT_PROPOSITION, messageRefusIllustration, raisonIndisponible } from "./illustration-ui";

/**
 * Boîtes « Illustration depuis la vue » et « Agents (MCP) » (lot F, décision P-12) : corps envoyé (jamais de
 * consentement ni de classification inventés), raisons d'indisponibilité, règle d'or des deux commandes, traductions,
 * et absence de tout appel distant lié au pointeur dans le client (F.3-03).
 */
const local: FournisseurIllustration = { id: "local-derive", nom: "Illustration dérivée du rendu (locale, sans IA)", nature: "local-deterministe", version: "studio-illustration-locale/1", reseau: false, disponible: true, manque: [], cout: { montant: 0, devise: null }, styles: ["trait", "lavis", "sepia"] };
const externe: FournisseurIllustration = { id: "externe", nom: "Service d’essai", nature: "ia-externe", version: "inconnue", reseau: true, disponible: true, manque: [], cout: { montant: 0.04, devise: "CHF" }, styles: ["trait"] };
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 250]);

describe("F.2-03 — corps d'une illustration : rien n'est complété à la place de la personne", () => {
  it("F.2-03 [+] fournisseur local : image en base64, paramètres au centième, ni classification ni consentement envoyés", () => {
    const c = corpsIllustration("r-1", png, { ...CHOIX_ILLUSTRATION_INITIAL, intensite: 35 }, local);
    expect(c).toEqual({ requestId: "r-1", fournisseur: "local-derive", image: base64DeOctets(png), parametres: { style: "trait", intensite: 0.35 } });
    expect(Buffer.from(c.image, "base64")).toEqual(Buffer.from(png));
    expect(raisonIndisponible(CHOIX_ILLUSTRATION_INITIAL, local, true)).toBeNull();
  });
  it("TR-EX-094 [−] service externe : sans classification choisie → « inconnue » ; sans case cochée → aucun consentement ; le bouton reste indisponible avec sa raison", () => {
    const choix = { ...CHOIX_ILLUSTRATION_INITIAL, fournisseur: "externe" as const };
    expect(corpsIllustration("r-2", png, choix, externe)).toMatchObject({ classification: "inconnue" });
    expect(corpsIllustration("r-2", png, choix, externe).consentement).toBeUndefined();
    expect(raisonIndisponible(choix, externe, true)).toMatch(/classification/);
    expect(raisonIndisponible({ ...choix, classification: "interne" }, externe, true)).toMatch(/consentement/);
    expect(corpsIllustration("r-3", png, { ...choix, classification: "interne", consentement: true }, externe)).toMatchObject({ classification: "interne", consentement: { transfertExterne: true, coutAccepte: { montant: 0.04, devise: "CHF" } } });
    expect(raisonIndisponible(CHOIX_ILLUSTRATION_INITIAL, local, false)).toMatch(/Lecture seule/);
    expect(raisonIndisponible(choix, { ...externe, disponible: false, manque: ["aucune clé fournie par l’administrateur"] }, true)).toBe("Indisponible : aucune clé fournie par l’administrateur.");
    expect(messageRefusIllustration(422, { error: "transfert_refuse", refus: [{ message: "Le transfert vers le service externe n’a pas été consenti." }] })).toMatch(/^Transfert refusé avant tout envoi/);
  });
});

describe("Règle d'or — « Illustration depuis la vue » et « Agents (MCP) » ont chacune leur icône, leur barre et leur raccourci", () => {
  it("F.2-03 [+] F.3-02 [+] deux commandes de l'éditeur, icône propre, barre et raccourci uniques non réservés", () => {
    const cmds = COMMANDES_EDITEUR.filter((c) => c.id === "illustration" || c.id === "agents");
    expect(cmds.map((c) => [c.id, c.iconeSymbolique, c.groupe, c.raccourci])).toEqual([["illustration", "studio-illustration", "visualisation", "Ctrl+Shift+F4"], ["agents", "studio-agents", "catalogue", "Ctrl+Shift+F9"]]);
    for (const c of cmds) {
      expect(RACCOURCIS_RESERVES).not.toContain(c.raccourci);
      expect(CATALOGUE.filter((e) => e.raccourcis.includes(c.raccourci))).toHaveLength(1);
      expect(CATALOGUE.filter((e) => e.icone === c.iconeSymbolique)).toHaveLength(1);
    }
  });
});

describe("Boîtes du lot F : rendu et traductions", () => {
  it("F.2-03 [+] la boîte d'illustration annonce une image séparée, non vérifiée, sans modification du modèle ; la boîte des agents annonce la confirmation et l'absence d'appel au pointeur", () => {
    const illustration = renderToStaticMarkup(createElement(DialogueIllustration, { projectId: "p", studyId: "s", variantId: "v", capture: { png, provenance: { revisionId: "studio_revision_12345678", scene: null } }, modifiable: true, surFermer: () => {} }));
    expect(illustration).toContain("non vérifiée");
    expect(illustration).toContain("Le modèle n’est jamais modifié.");
    expect(illustration).toContain("data-studio-illustration-generer");
    const agents = renderToStaticMarkup(createElement(PanneauAgents, { projectId: "p", surFermer: () => {} }));
    expect(agents).toContain("rien n’est écrit avant votre confirmation ici");
    expect(agents).toContain("Aucun appel n’est fait au mouvement du pointeur.");
  });
  it("chaque libellé des boîtes du lot F a sa traduction anglaise", () => {
    const textes = [
      "Illustration depuis la vue", "Agents (MCP)", "Produire l’illustration", "Illustrations archivées de la variante", "Propositions à confirmer", "Jetons d’agent",
      "Journal agent / humain", "Confirmer", "Refuser", "Proposition d’agent (MCP) confirmée",
      ...Object.values(LIBELLES_STATUT_PROPOSITION), ...Object.values(LIBELLES_ACTION_AGENT),
    ];
    for (const t of textes) expect((en as Record<string, string>)[t], t).toBeTruthy();
  });
});

describe("F.3-03 — aucun appel distant au mouvement du pointeur", () => {
  it("F.3-03 [−] le client Studio n'appelle jamais le serveur MCP, et les routes du lot F ne sont appelées que depuis des gestes explicites (ouverture, bouton), jamais d'un gestionnaire de pointeur", () => {
    const racine = new URL("../", import.meta.url);
    const fichiers = (readdirSync(racine, { recursive: true }) as string[]).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
    for (const f of fichiers) {
      const src = readFileSync(new URL(f, racine), "utf8");
      // Le client n'est jamais un agent : aucun appel au point d'entrée MCP (seule son adresse est affichée).
      expect(/fetch\([^)]*mcp/i.test(src), f).toBe(false);
      // Aucun gestionnaire de pointeur ne déclenche un appel du lot F.
      for (const m of src.matchAll(/on(?:Pointer|Mouse)(?:Move|Over|Enter)=\{([^}]*)\}/g)) expect(m[1], f).not.toMatch(/apiIllustrations|apiAgents|fetch\(/);
    }
    const lotF = ["illustration/DialogueIllustration.tsx", "illustration/PanneauAgents.tsx"].map((f) => readFileSync(new URL(f, racine), "utf8"));
    for (const src of lotF) expect(src).not.toMatch(/onPointer|onMouseMove|pointermove|mousemove/);
  });
});
