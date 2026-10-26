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
import { BASCULES, COMMANDES_COLLABORATION, COMMANDES_COM, COMMANDES_ECHANGE_OBSERVATIONS, COMMANDES_TEMPS_REEL, COMMANDES_TRACABILITE, declenche, propsRaccourci, type CommandeCollaboration } from "./commandes-collaboration";
import { IconeCollaboration, RaccourciCollaboration } from "./IconeCollaboration";

const SRC = new URL("../../", import.meta.url).pathname;
const lire = (chemin: string) => readFileSync(join(SRC, chemin), "utf8");
const COMMANDES = Object.keys(COMMANDES_COLLABORATION) as CommandeCollaboration[];

const PANNEAU_COM = "modules/collaboration/communication/CommunicationPanel.tsx";
const PANNEAU_DEMANDES = "modules/collaboration/communication/DemandesPanel.tsx";

/** Écrans où chaque commande agit (sa barre) : formulaire de rédaction, en-tête du fil, ligne du membre. */
const ECRANS: Record<CommandeCollaboration, string[]> = {
  "visible-lecteurs": [
    "modules/collaboration/CollaborationModule.tsx", "modules/atelier/nouveau/panneaux/Modifications.tsx",
    "modules/studio/commentaires/PanneauCommentaires.tsx", "modules/studio/observations/PanneauObservations.tsx",
  ],
  "rendre-visible": ["modules/collaboration/CollaborationModule.tsx", "modules/studio/commentaires/PanneauCommentaires.tsx"],
  "reserver-equipe": ["modules/collaboration/CollaborationModule.tsx", "modules/studio/commentaires/PanneauCommentaires.tsx"],
  "export-lecteur": ["modules/collaboration/CollaborationModule.tsx"],
  // Invitations acceptées (Issue #262, phase 3) : formulaire d'invitation, carte d'une invitation reçue.
  "apercu-invitation": ["modules/collaboration/InvitationProjet.tsx"],
  "accepter-invitation": ["modules/collaboration/InvitationsRecues.tsx"],
  "decliner-invitation": ["modules/collaboration/InvitationsRecues.tsx"],
  // Communication (COM-D14) : liste et fil des conversations, messages ; demandes de précision.
  "nouvelle-conversation": [PANNEAU_COM], "envoyer-message": [PANNEAU_COM], "partager-extrait": [PANNEAU_COM], "action-liee": [PANNEAU_COM],
  "audience-conversation": [PANNEAU_COM], "accuser-reception": [PANNEAU_COM], "ajouter-participant": [PANNEAU_COM], "retirer-participant": [PANNEAU_COM],
  "transferer-animation": [PANNEAU_COM], "modifier-message": [PANNEAU_COM], "retirer-message": [PANNEAU_COM],
  "joindre-photo": [PANNEAU_COM], "epingler": [PANNEAU_COM],
  "nouvelle-demande": [PANNEAU_DEMANDES], "repondre-demande": [PANNEAU_DEMANDES], "cloturer-demande": [PANNEAU_DEMANDES], "rouvrir-demande": [PANNEAU_DEMANDES], "reattribuer-demande": [PANNEAU_DEMANDES],
  // Participants et équipe (Issue #262, phase 2) : en-tête de l'annuaire, ligne du participant, formulaire des rôles.
  ...Object.fromEntries((["nouveau-contact", "modifier-participation", "attribuer-role", "retirer-role", "suspendre-participation", "reactiver-participation",
    "terminer-participation", "retour-participant", "effacer-contact", "clore-projet", "rouvrir-projet"] as const).map((c) => [c, ["modules/collaboration/Participants.tsx"]])),
  // Temps réel (Issue #283) : bandeau de session et ligne d'un participant, dans le même écran.
  ...Object.fromEntries(COMMANDES_TEMPS_REEL.map((c) => [c, ["modules/studio/temps-reel/BandeauSession.tsx"]])),
  // Lot F4 : barre des délégations et ligne d'une délégation (EX-085) ; barre du panneau Observations (EX-086).
  "deleguer-approbation": ["modules/studio/publication/PanneauDelegations.tsx"],
  "revoquer-delegation": ["modules/studio/publication/PanneauDelegations.tsx"],
  "rapprocher-observations": ["modules/studio/observations/PanneauObservations.tsx"],
  // Lot PUB : barre du panneau Observations (IF-010).
  "exporter-bcf": ["modules/studio/observations/PanneauObservations.tsx"],
  "importer-bcf": ["modules/studio/observations/PanneauObservations.tsx"],
} as Record<CommandeCollaboration, string[]>;

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

  it("chaque commande a un raccourci ; seuls les deux sens d'une même bascule le partagent", () => {
    const parRaccourci = new Map<string, CommandeCollaboration[]>();
    for (const c of COMMANDES) parRaccourci.set(COMMANDES_COLLABORATION[c].raccourci.libelle, [...(parRaccourci.get(COMMANDES_COLLABORATION[c].raccourci.libelle) ?? []), c]);
    for (const [r, cs] of parRaccourci) expect(cs.length === 1 || BASCULES.some((b) => [...cs].sort().join() === [...b].sort().join()), `${r} : ${cs.join(", ")}`).toBe(true);
  });

  it("aucun autre raccourci de Fadi n'emploie ces combinaisons", () => {
    const nos = new Set(COMMANDES.map((c) => COMMANDES_COLLABORATION[c].raccourci.libelle));
    const ailleurs = sources(SRC).filter((f) => !f.includes("/modules/collaboration/"))
      .flatMap((f) => [...readFileSync(f, "utf8").matchAll(/(?:Ctrl\+)?Alt\+Maj\+(?:[A-Z0-9]+|[-=[\];',./\\`])/g)].map((m) => ({ f, r: m[0] })))
      .filter(({ r, f }) => nos.has(r) && !(f.endsWith("Modifications.tsx") || f.includes("/studio/commentaires/") || f.includes("/studio/observations/")));
    expect(ailleurs).toEqual([]);
  });

  it("chaque écran porte l'icône, le raccourci affiché et déclaré, et un gestionnaire clavier de la commande", () => {
    for (const c of COMMANDES) {
      for (const ecran of ECRANS[c]) {
        const src = lire(ecran);
        expect(src.includes(`"${c}"`), `${ecran} : ${c}`).toBe(true);
        // Le bouton commun des commandes COM (`BoutonCommande`) porte lui-même icône, raccourci affiché et déclaré.
        const bouton = src.includes(`<BoutonCommande commande="${c}"`);
        expect(bouton || src.includes("<IconeCollaboration commande="), `${ecran} : icône`).toBe(true);
        expect(bouton || src.includes("<RaccourciCollaboration commande="), `${ecran} : raccourci affiché`).toBe(true);
        expect(bouton || src.includes("propsRaccourci("), `${ecran} : aria-keyshortcuts`).toBe(true);
        expect(src.includes("declenche(e, "), `${ecran} : gestionnaire clavier`).toBe(true);
      }
    }
  });

  it("le raccourci ne se déclenche qu'avec Alt et Maj (Ctrl seulement pour les Participants), jamais Méta, touche physique", () => {
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
    // Participants et équipe : Ctrl+Alt+Maj, jamais confondus avec les Alt+Maj de Communication sur la même touche.
    const c = (code: string) => t(code, { ctrlKey: true });
    expect(declenche(c("Digit6"), "nouveau-contact")).toBe(true);
    expect(declenche(t("Digit6"), "nouveau-contact")).toBe(false);
    expect(declenche(c("Digit6"), "partager-extrait")).toBe(false);
    expect(declenche(c("Minus"), "effacer-contact")).toBe(true);
    expect(declenche(c("Equal"), "clore-projet") && declenche(c("Equal"), "rouvrir-projet")).toBe(true);
    expect(declenche(c("Digit9"), "terminer-participation")).toBe(false);
    expect(propsRaccourci("nouveau-contact")["aria-keyshortcuts"]).toBe("Control+Alt+Shift+6");
    // Invitations acceptées (phase 3) : Ctrl+Alt+Maj+' aperçu, +\ accepter, +` décliner (touches restées libres après la
    // revue externe, qui prend 1 à 5 et , . / ;) ; jamais confondues avec Alt+Maj+\ (retirer un message).
    expect(declenche(c("Quote"), "apercu-invitation") && !declenche(t("Quote"), "apercu-invitation")).toBe(true);
    expect(declenche(c("Backslash"), "accepter-invitation") && declenche(c("Backquote"), "decliner-invitation")).toBe(true);
    expect(declenche(c("Backslash"), "decliner-invitation") || declenche(c("Backslash"), "retirer-message")).toBe(false);
  });

  it("Communication (COM-D14) : dix-huit commandes, Alt+Maj+chiffre ou ponctuation, touche physique", () => {
    expect(COMMANDES_COM).toHaveLength(18);
    for (const c of COMMANDES_COM) expect(COMMANDES_COLLABORATION[c].raccourci.libelle, c).toMatch(/^Alt\+Maj\+(?:[0-9]|[-=[\];',./\\`])$/);
    const t = (code: string) => ({ code, altKey: true, shiftKey: true, ctrlKey: false, metaKey: false });
    expect(declenche(t("Digit5"), "envoyer-message")).toBe(true);
    expect(declenche(t("Minus"), "ajouter-participant")).toBe(true);
    expect(declenche(t("Backslash"), "retirer-message")).toBe(true);
    expect(declenche(t("Digit5"), "nouvelle-conversation")).toBe(false);
    const panneau = lire(PANNEAU_COM);
    expect(panneau.includes("BoutonCommande") && panneau.includes("<IconeCollaboration commande={commande}") && panneau.includes("<RaccourciCollaboration commande={commande}") && panneau.includes("propsRaccourci(commande)")).toBe(true);
  });

  it("Temps réel (Issue #283) : dix-neuf commandes, Ctrl+Alt+Maj+lettre, touche physique ; suivre et naviguer librement sont une bascule", () => {
    expect(COMMANDES_TEMPS_REEL).toHaveLength(19);
    for (const c of COMMANDES_TEMPS_REEL) expect(COMMANDES_COLLABORATION[c].raccourci.libelle, c).toMatch(/^Ctrl\+Alt\+Maj\+[A-Z]$/);
    const t = (code: string, ctrlKey = true) => ({ code, altKey: true, shiftKey: true, ctrlKey, metaKey: false });
    expect(declenche(t("KeyO"), "ouvrir-session")).toBe(true);
    expect(declenche(t("KeyA"), "annoter") && declenche(t("KeyE"), "enregistrer-annotation") && declenche(t("KeyG"), "voir-point-de-vue") && declenche(t("KeyU"), "ouvrir-revue")).toBe(true);
    expect(declenche(t("KeyO", false), "ouvrir-session")).toBe(false);
    expect(declenche(t("KeyF"), "suivre-presentateur") && declenche(t("KeyF"), "naviguer-librement")).toBe(true);
    expect(propsRaccourci("clore-session")["aria-keyshortcuts"]).toBe("Control+Alt+Shift+C");
    const bandeau = lire("modules/studio/temps-reel/BandeauSession.tsx");
    expect(bandeau.includes("<IconeCollaboration commande={commande}") && bandeau.includes("<RaccourciCollaboration commande={commande}") && bandeau.includes("propsRaccourci(commande)")).toBe(true);
  });

  it("Lot F4 (EX-085, EX-086) : déléguer, révoquer, rapprocher — Ctrl+Alt+Maj+B, X, M, chacune dans sa barre", () => {
    expect(COMMANDES_TRACABILITE.map((c) => [c, COMMANDES_COLLABORATION[c].raccourci.libelle, COMMANDES_COLLABORATION[c].barre])).toEqual([
      ["deleguer-approbation", "Ctrl+Alt+Maj+B", "publications"], ["revoquer-delegation", "Ctrl+Alt+Maj+X", "délégation"], ["rapprocher-observations", "Ctrl+Alt+Maj+M", "observations"],
    ]);
    const t = (code: string, ctrlKey = true) => ({ code, altKey: true, shiftKey: true, ctrlKey, metaKey: false });
    expect(declenche(t("KeyB"), "deleguer-approbation") && declenche(t("KeyX"), "revoquer-delegation") && declenche(t("KeyM"), "rapprocher-observations")).toBe(true);
    expect(declenche(t("KeyB", false), "deleguer-approbation")).toBe(false);
  });

  it("Lot PUB (IF-010) : exporter et importer en BCF — Ctrl+Alt+Maj+Y, I, dans la barre du panneau Observations", () => {
    expect(COMMANDES_ECHANGE_OBSERVATIONS.map((c) => [c, COMMANDES_COLLABORATION[c].raccourci.libelle, COMMANDES_COLLABORATION[c].barre])).toEqual([
      ["exporter-bcf", "Ctrl+Alt+Maj+Y", "observations"], ["importer-bcf", "Ctrl+Alt+Maj+I", "observations"],
    ]);
    const t = (code: string) => ({ code, altKey: true, shiftKey: true, ctrlKey: true, metaKey: false });
    expect(declenche(t("KeyY"), "exporter-bcf") && declenche(t("KeyI"), "importer-bcf")).toBe(true);
  });

  it("rendu : icône SVG décorative, raccourci affiché", () => {
    for (const c of COMMANDES) {
      const svg = renderToStaticMarkup(createElement(IconeCollaboration, { commande: c }));
      expect(svg).toMatch(/^<svg [^>]*aria-hidden="true"/);
      expect(svg.replace(/<[^>]+>/g, "")).toBe("");
      expect(renderToStaticMarkup(createElement(RaccourciCollaboration, { commande: c })).replaceAll("&#x27;", "'")).toContain(COMMANDES_COLLABORATION[c].raccourci.libelle);
    }
  });
});
