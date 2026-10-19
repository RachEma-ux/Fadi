/**
 * I.4-01 / I.4-02 (NAV-005) : les quatre domaines affichés sont exactement ceux de la référence — Définition
 * officielle du Studio V2.1 (REF-01 §02, « Organisation fonctionnelle »), lue ici dans le document versionné
 * `Studio/Fadi_Studio_Definition_Officielle_Reference_V2_1.docx` (tableau DOMAINE / RESPONSABILITÉ, ligne par ligne) et
 * dans sa carte interactive `Studio/Fadi_Studio_Definition_V2_1_Mind_Map_Interactif.html` — et les deux planches
 * n'existent que dans « Dessin et modélisation ». Chaque commande de l'éditeur et chaque entrée du catalogue a un
 * domaine (ou « à définir », signalé dans ADR-STUDIO-NAV-01) ; la mise en page des sections est dérivée de ces tables.
 */
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { StudioDocument } from "@parcours/atelier-model";
import type { StudioContext } from "../../../lib/api";
import { CATALOGUE } from "../planche2d/catalogue";
import { COMMANDES_EDITEUR } from "../planche2d/raccourcis";
import { BandeauVariante, EnTeteStudio } from "../variante/BandeauVariante";
import { ATTRIBUT_SANS_GARDE, lienQuitteLaVariante } from "../variante/useGardeNavigation";
import { AccesDomaine, ApercuVisualisation, clicSimple, NavigationDomaines, SectionDomaine, SelecteurPlanche, TitreLegende } from "./DomainesStudio";
import {
  A_DEFINIR, commandesDuDomaine, domaineDeFonction, domaineEntree, DOMAINES_COMMANDES, DOMAINES_FAMILLES_OUTILS, DOMAINES_STUDIO, estDomaineStudio, estPlancheStudio,
  FONCTIONS_STUDIO, fonctionsDuDomaine, PLANCHES_STUDIO,
} from "./domaines";

const studioDocumentVide = (): StudioDocument => ({ id: "d1", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: [] });
const racine = (chemin: string) => new URL(`../../../../../../${chemin}`, import.meta.url);
const CARTE = readFileSync(racine("Studio/Fadi_Studio_Definition_V2_1_Mind_Map_Interactif.html"), "utf8");
const ADR = readFileSync(racine("docs/continuity/decisions/ADR-STUDIO-NAV-01.md"), "utf8");
const ESPACE = readFileSync(new URL("../VariantWorkspace.tsx", import.meta.url), "utf8");

/** Lit une entrée d'une archive ZIP (.docx) sans bibliothèque : répertoire central, puis données compressées (deflate). */
function lireZip(fichier: Buffer, nom: string): string {
  const fin = fichier.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = fichier.readUInt32LE(fin + 16);
  for (let n = fichier.readUInt16LE(fin + 10); n > 0; n--) {
    const methode = fichier.readUInt16LE(p + 10), taille = fichier.readUInt32LE(p + 20), lNom = fichier.readUInt16LE(p + 28), lExtra = fichier.readUInt16LE(p + 30), lCom = fichier.readUInt16LE(p + 32);
    const local = fichier.readUInt32LE(p + 42);
    if (fichier.toString("utf8", p + 46, p + 46 + lNom) === nom) {
      const debut = local + 30 + fichier.readUInt16LE(local + 26) + fichier.readUInt16LE(local + 28);
      const donnees = fichier.subarray(debut, debut + taille);
      return (methode === 8 ? inflateRawSync(donnees) : donnees).toString("utf8");
    }
    p += 46 + lNom + lExtra + lCom;
  }
  throw new Error(`${nom} absent de l'archive`);
}
/** Lignes des tableaux du document Word : texte de chaque cellule (runs concaténés, espaces normalisés). */
function lignesTableaux(xml: string): string[][] {
  const texte = (x: string) => [...x.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("").replace(/\s+/g, " ").trim();
  return [...xml.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)].map((tr) => [...tr[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((tc) => texte(tc[0])));
}
const DOCX = lireZip(readFileSync(racine("Studio/Fadi_Studio_Definition_Officielle_Reference_V2_1.docx")), "word/document.xml");
const LIGNES = lignesTableaux(DOCX);

describe("domaines fonctionnels du Studio (REF-01 §02)", () => {
  it("document de référence (.docx) : tableau DOMAINE / RESPONSABILITÉ, chaque ligne exactement « numéro · domaine » | responsabilité", () => {
    const entete = LIGNES.findIndex((l) => l.length === 2 && l[0] === "DOMAINE" && l[1] === "RESPONSABILITÉ");
    expect(entete, "en-tête du tableau").toBeGreaterThanOrEqual(0);
    const lignes = LIGNES.slice(entete + 1, entete + 1 + DOMAINES_STUDIO.length);
    expect(lignes).toEqual(DOMAINES_STUDIO.map((d) => [`${d.numero} · ${d.libelleFR}`, d.responsabiliteFR]));
    // Le tableau n'a pas de cinquième domaine (la ligne suivante, s'il y en a une, n'est pas numérotée « 05 · »).
    expect(LIGNES[entete + 1 + DOMAINES_STUDIO.length]?.[0] ?? "").not.toMatch(/^05 · /);
  });

  it("carte interactive : même ligne de tableau, domaine et responsabilité appariés, délimiteurs compris", () => {
    expect(DOMAINES_STUDIO.map((d) => d.numero)).toEqual(["01", "02", "03", "04"]);
    expect(CARTE).toContain("L’organisation de référence comprend quatre domaines fonctionnels");
    for (const d of DOMAINES_STUDIO) {
      const ligne = `{"label":"${d.numero} · ${d.libelleFR}","children":[{"label":"RESPONSABILITÉ : ${d.responsabiliteFR}","kind":"text",`;
      expect(CARTE.split(ligne).length - 1, d.libelleFR).toBe(1);
    }
    expect(CARTE).not.toMatch(/"label":"05 · /);
  });

  it("les deux planches (Planche 2D, Planche 3D) appartiennent seulement à Dessin et modélisation", () => {
    expect(DOCX.replace(/<[^>]+>/g, "")).toContain("deux planches de travail complètes : Planche 2D et Planche 3D");
    expect(PLANCHES_STUDIO.map((p) => p.libelleFR)).toEqual(["Planche 2D", "Planche 3D"]);
    expect(new Set(PLANCHES_STUDIO.map((p) => p.domaine))).toEqual(new Set(["dessin"]));
    expect(domaineDeFonction("planches")).toBe("dessin");
  });

  it("identifiants d'adresse : seuls les quatre domaines et les deux planches sont reconnus", () => {
    expect(DOMAINES_STUDIO.map((d) => d.id)).toEqual(["dessin", "bim", "visualisation", "documentation"]);
    for (const x of ["", "Dessin", "dessin ", "atelier", "parcours", A_DEFINIR]) expect(estDomaineStudio(x), x).toBe(false);
    expect(["2d", "3d"].every(estPlancheStudio)).toBe(true);
    for (const x of ["", "2D", "4d"]) expect(estPlancheStudio(x), x).toBe(false);
  });
});

describe("rattachement exhaustif aux domaines (I-1)", () => {
  const valeurs = new Set<string>([...DOMAINES_STUDIO.map((d) => d.id), A_DEFINIR]);

  it("chaque commande de COMMANDES_EDITEUR a exactement une entrée de domaine, et aucune entrée n'est orpheline", () => {
    expect(Object.keys(DOMAINES_COMMANDES).sort()).toEqual(COMMANDES_EDITEUR.map((c) => c.id).sort());
    for (const [id, d] of Object.entries(DOMAINES_COMMANDES)) expect(valeurs.has(d), id).toBe(true);
  });

  it("chaque entrée du CATALOGUE (outils du registre et commandes) a un domaine", () => {
    expect(CATALOGUE.length).toBeGreaterThan(COMMANDES_EDITEUR.length);
    for (const e of CATALOGUE) expect(valeurs.has(domaineEntree(e)), e.identifiant).toBe(true);
    const familles = new Set(CATALOGUE.flatMap((e) => (e.outil ? [e.outil.groupe] : [])));
    expect(Object.keys(DOMAINES_FAMILLES_OUTILS).sort()).toEqual([...familles].sort());
  });

  it("domaines fixés par la lecture de REF-01 ; ce qu'elle ne fixe pas reste « à définir » (exports, import, matrice d'échanges, système d'outils)", () => {
    const aDefinir = COMMANDES_EDITEUR.filter((c) => DOMAINES_COMMANDES[c.id] === A_DEFINIR).map((c) => c.id);
    expect(aDefinir.sort()).toEqual(["echanges", "exporter-dxf", "exporter-ifc", "exporter-png", "exporter-svg", "importer-dxf", "outils", "palette"]);
    expect(commandesDuDomaine("documentation")).toEqual(["feuille", "dossier"]);
    expect(commandesDuDomaine("bim")).toEqual(["exigences"]);
    expect(commandesDuDomaine("visualisation")).toEqual([]);
    expect(DOMAINES_COMMANDES["vue-3d"]).toBe("dessin");
    expect(DOMAINES_FAMILLES_OUTILS.proprietes).toBe("bim");
    expect(DOMAINES_FAMILLES_OUTILS.visualisation).toBe("visualisation");
    // Chaque domaine « à définir » est posé en question au maître d'ouvrage dans l'ADR, par son nom.
    const question = ADR.slice(ADR.indexOf("Domaine « à définir »"));
    expect(question.length).toBeLessThan(ADR.length);
    for (const id of aDefinir) expect(question, id).toContain(COMMANDES_EDITEUR.find((c) => c.id === id)!.libelleFR);
  });

  it("chaque bloc de l'espace est rangé sous un domaine ; chaque domaine en porte au moins un ; la mise en page lit ces tables", () => {
    for (const d of Object.values(FONCTIONS_STUDIO)) expect(estDomaineStudio(d)).toBe(true);
    for (const d of DOMAINES_STUDIO) expect(fonctionsDuDomaine(d.id).length, d.id).toBeGreaterThan(0);
    expect(fonctionsDuDomaine("dessin")).toEqual(["outils", "planches", "portee-annuler", "elements"]);
    expect(fonctionsDuDomaine("bim")).toEqual(["exigences"]);
    expect(fonctionsDuDomaine("visualisation")).toEqual(["scenes-rendus"]);
    expect(fonctionsDuDomaine("documentation")).toEqual(["publications", "commentaires-observations", "revisions", "metre"]);
    // L'espace d'une variante rend ses sections depuis ces tables, sans liste manuelle de commandes.
    expect(ESPACE).toContain("fonctionsDuDomaine(d.id)");
    expect(ESPACE).toContain("commandesDuDomaine(d.id)");
    expect(ESPACE).not.toMatch(/commandes=\{\[/);
    for (const f of Object.keys(FONCTIONS_STUDIO)) expect(ESPACE, f).toContain(`case "${f}":`);
  });
});

const CONTEXTE: StudioContext = {
  study: { id: "s", name: "Étude", projectId: "p" }, variant: { id: "v", name: "Variante", studyId: "s", headRevisionId: "r2" },
  revision: { id: "r1", parentRevisionId: null, document: studioDocumentVide() }, canWrite: false,
};

describe("présentation des domaines", () => {
  const adresse = (id: string) => `/studio/projets/p/etudes/s/variantes/v?domaine=${id}`;

  it("navigation : quatre liens vers l'adresse de la variante avec leur domaine, exemptés de la garde, l'actif marqué aria-current", () => {
    const html = renderToStaticMarkup(createElement(NavigationDomaines, { actif: "bim", adresse, surChoix: () => {} }));
    expect(html).toContain('aria-label="Domaines du Studio"');
    expect(html.match(/<a /g)).toHaveLength(4);
    for (const d of DOMAINES_STUDIO) {
      expect(html).toContain(`href="${adresse(d.id)}"`);
      expect(html).toContain(`<span>${d.libelleFR}</span>`);
    }
    expect(html.match(new RegExp(`${ATTRIBUT_SANS_GARDE}=""`, "g"))).toHaveLength(4);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="true"[^>]*data-studio-domaine-lien="bim"/);
  });

  it("liens de domaine : seul le clic simple est traité sur place ; Ctrl, Cmd, Maj, Alt ou un autre bouton suivent l'adresse", () => {
    const base = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
    expect(clicSimple(base)).toBe(true);
    for (const autre of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) expect(clicSimple({ ...base, ...autre }), JSON.stringify(autre)).toBe(false);
  });

  it("garde de navigation : un lien de domaine, une ancre ou un téléchargement ne quittent pas la variante ; un autre lien si", () => {
    const lien = (attrs: Record<string, string>) => ({ hasAttribute: (n: string) => n in attrs, getAttribute: (n: string) => attrs[n] ?? null });
    expect(lienQuitteLaVariante(lien({ href: adresse("bim"), [ATTRIBUT_SANS_GARDE]: "" }))).toBe(false);
    expect(lienQuitteLaVariante(lien({ href: "#x" }))).toBe(false);
    expect(lienQuitteLaVariante(lien({ href: "/export", download: "" }))).toBe(false);
    expect(lienQuitteLaVariante(lien({ href: adresse("bim") }))).toBe(true);
  });

  it("section : titre du domaine et responsabilité ; Dessin et modélisation titré dans la légende de sa planche", () => {
    const visible = renderToStaticMarkup(createElement(SectionDomaine, { id: "documentation", actif: true, children: null }));
    expect(visible).toContain('aria-labelledby="studio-domaine-documentation-titre"');
    expect(visible).toContain("data-studio-domaine-actif");
    expect(visible).toContain("Produire les documents, quantités, observations, revues et publications.");
    expect(visible).toMatch(/<h2 id="studio-domaine-documentation-titre" tabindex="-1">/);
    expect(visible).not.toMatch(/<section[^>]*tabindex/);
    const dessin = renderToStaticMarkup(createElement(SectionDomaine, { id: "dessin", actif: false, titreVisible: false, children: createElement(TitreLegende, { id: "dessin" }) }));
    expect(dessin).toContain('aria-labelledby="studio-domaine-dessin-titre"');
    expect(dessin).toContain('<h2 id="studio-domaine-dessin-titre" class="studio-legende-titre" tabindex="-1">Dessin et modélisation</h2>');
    expect(dessin.match(/<h2/g)).toHaveLength(1);
    expect(dessin).not.toContain("data-studio-domaine-actif");
  });

  it("choix de planche : deux boutons enfoncés ou non ; le raccourci de la bascule « Vue 3D » n'est annoncé que sur le bouton inactif", () => {
    const html = renderToStaticMarkup(createElement(SelecteurPlanche, { active: "3d", surChoix: () => {} }));
    const bascule = COMMANDES_EDITEUR.find((c) => c.id === "vue-3d")!;
    expect(bascule.raccourci).toBe("Shift+D");
    expect(html.match(/aria-keyshortcuts=/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="false" aria-keyshortcuts="Shift\+D"[^>]*data-studio-planche="2d"/);
    expect(html).toMatch(/<button type="button" aria-pressed="true" data-studio-planche="3d">/);
  });

  it("accès d'un domaine : les commandes dérivées de la table, avec leur icône et leur raccourci ; aucun accès vide", () => {
    const html = renderToStaticMarkup(createElement(AccesDomaine, { domaine: "documentation", commandes: commandesDuDomaine("documentation"), disponible: (c) => c.id === "feuille", surCommande: () => {} }));
    expect(html).toMatch(/aria-keyshortcuts="Shift\+P"[^>]*data-studio-domaine-commande="feuille"/);
    expect(html).toMatch(/disabled=""[^>]*aria-keyshortcuts="Control\+Shift\+D"[^>]*data-studio-domaine-commande="dossier"/);
    expect(html.match(/<svg/g)?.length).toBe(2);
    expect(renderToStaticMarkup(createElement(AccesDomaine, { domaine: "visualisation", commandes: [], disponible: () => true, surCommande: () => {} }))).toBe("");
  });

  it("visualisation : un aperçu, l'édition des scènes et du rendu restant dans la Planche 3D", () => {
    const html = renderToStaticMarkup(createElement(ApercuVisualisation, { doc: studioDocumentVide(), surOuvrir3d: () => {} }));
    expect(html).toContain("Aperçu ; l’édition des scènes et du rendu se fait dans la Planche 3D.");
    expect(html).toContain(">Ouvrir la Planche 3D</button>");
  });

  it("en-tête : badge et sous-titre suivent la planche active", () => {
    const deux = renderToStaticMarkup(createElement(EnTeteStudio, { context: null, planche: "2d" }));
    const trois = renderToStaticMarkup(createElement(EnTeteStudio, { context: null, planche: "3d" }));
    expect(deux).toContain(">Dessin 2D · Repère local · Mètres</p>");
    expect(deux).toContain(">Planche 2D</span>");
    expect(trois).toContain(">Vue 3D · Repère local · Mètres</p>");
    expect(trois).toContain(">Planche 3D</span>");
  });

  it("révision historique : « Revenir à la version courante » garde le domaine et la planche de l'adresse", () => {
    const rendre = (adresse?: { domaine: "dessin" | "bim"; planche: "3d" | null }) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(BandeauVariante, {
      projectId: "p", studyId: "s", variantId: "v", context: CONTEXTE, historical: true, etat: "Révision historique", commentaires: false, surCommentaires: () => {}, adresse,
    })));
    const lien = (html: string) => /data-studio-version-courante="true" href="([^"]*)"/.exec(html)?.[1];
    expect(lien(rendre())).toBe("/studio/projets/p/etudes/s/variantes/v");
    expect(lien(rendre({ domaine: "dessin", planche: "3d" }))).toBe("/studio/projets/p/etudes/s/variantes/v?domaine=dessin&amp;planche=3d");
    expect(lien(rendre({ domaine: "bim", planche: null }))).toBe("/studio/projets/p/etudes/s/variantes/v?domaine=bim");
  });
});
