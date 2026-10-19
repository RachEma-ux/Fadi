/**
 * Import DXF de Studio côté interface : découpage de l'enregistrement en enveloppes (≤ 500 commandes, ≤ 1 Mo), rejeu
 * à l'identique d'un lot, messages et rapport affiché (unité, objets, entités non prises), lecture seule.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, lireDxfStudio, newStudioDocument, STUDIO_CONTRACT, StudioValidationError, type StudioCommand } from "@parcours/atelier-model";
import dico from "../../../lib/i18n/en.json";
import { DialogueImportDxf, ETAPES_LECTURE, Rapport } from "./DialogueImportDxf";
import { MESSAGE_REPLI, messageHote } from "../workers/client-studio";
import { ErreurHote } from "../workers/hote-worker";
import { accuserLot, commandesNonEnvoyees, decouperCommandes, ENVELOPPE_MAX_COMMANDES, ENVELOPPE_MAX_OCTETS, enveloppeSuivante, envoiPartiel, envoiTermine, planEnvoi } from "./envoi";
import { CIBLES_CALQUE, lireDxf, messageImport, typeNonPris, UNITES_PROPOSEES } from "./import-dxf-ui";

const ligne = (i: number): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id: `l${i}`, type: "line", start: { x: 0, y: i }, end: { x: 1, y: i } } });
const lignes = (n: number) => Array.from({ length: n }, (_, i) => ligne(i));
const compteur = () => { let n = 0; return () => `req-${++n}`; };

/** DXF (CRLF) : 2 LINE, 1 LWPOLYLINE fermée rectangulaire, 1 CIRCLE ; $INSUNITS facultatif. */
function petitDxf(insunits?: number): string {
  const l = [
    "0", "SECTION", "2", "HEADER", ...(insunits === undefined ? [] : ["9", "$INSUNITS", "70", String(insunits)]), "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    "0", "LINE", "8", "0", "10", "0", "20", "0", "11", "4000", "21", "0",
    "0", "LINE", "8", "MURS", "10", "0", "20", "0", "11", "0", "21", "3000",
    "0", "LWPOLYLINE", "8", "0", "90", "4", "70", "1", "10", "1000", "20", "1000", "10", "3000", "20", "1000", "10", "3000", "20", "2500", "10", "1000", "20", "2500",
    "0", "CIRCLE", "8", "0", "10", "500", "20", "500", "40", "250",
    "0", "ENDSEC", "0", "EOF",
  ];
  return l.join("\r\n") + "\r\n";
}

describe("Enregistrement en plusieurs enveloppes", () => {
  it("jusqu'à 500 commandes : une seule enveloppe, sur la tête chargée", () => {
    const plan = planEnvoi(lignes(500), "rev-0", compteur());
    expect(plan.lots).toHaveLength(1);
    expect(enveloppeSuivante(plan)).toEqual({ contractVersion: STUDIO_CONTRACT, requestId: "req-1", baseRevisionId: "rev-0", commands: lignes(500) });
  });

  it("au-delà : lots de 500 au plus, dans l'ordre, chacun sur la révision produite par le précédent", () => {
    const cs = lignes(1201);
    let plan = planEnvoi(cs, "rev-0", compteur());
    expect(plan.lots.map((l) => l.length)).toEqual([500, 500, 201]);
    expect(plan.lots.flat()).toEqual(cs);
    const envoyees = [];
    for (let e = enveloppeSuivante(plan), n = 1; e; e = enveloppeSuivante(plan), n++) {
      envoyees.push(e);
      // Le même lot est rendu tant qu'il n'est pas confirmé (nouvel essai = même requestId, même contenu).
      expect(enveloppeSuivante(plan)).toEqual(e);
      if (n === 1) expect(envoiPartiel(plan)).toBe(false);
      plan = accuserLot(plan, `rev-${n}`);
      if (n < 3) expect(envoiPartiel(plan)).toBe(true);
    }
    expect(envoiTermine(plan) && !envoiPartiel(plan)).toBe(true);
    expect(envoyees.map((e) => [e.requestId, e.baseRevisionId, e.commands.length])).toEqual([["req-1", "rev-0", 500], ["req-2", "rev-1", 500], ["req-3", "rev-2", 201]]);
    expect(accuserLot(plan, "x")).toBe(plan);
    // Appliquer les lots l'un après l'autre donne le document d'un envoi unique.
    const doc0 = newStudioDocument("d");
    expect(envoyees.reduce((d, e) => applyStudioCommands(d, e.commands), doc0)).toEqual(applyStudioCommands(doc0, cs));
  });

  it("refus d'un lot suivant : seules les commandes non envoyées restent à rejouer sur la dernière révision confirmée", () => {
    const cs = lignes(1201);
    const doc0 = newStudioDocument("d");
    const plan = accuserLot(planEnvoi(cs, "rev-0", compteur()), "rev-1");
    const reste = commandesNonEnvoyees(plan);
    expect(reste).toEqual(cs.slice(500));
    // Le brouillon rebâti (révision confirmée + reste) aboutit au même document que l'envoi complet.
    const confirme = applyStudioCommands(doc0, plan.lots[0]!);
    expect(applyStudioCommands(confirme, reste)).toEqual(applyStudioCommands(doc0, cs));
    expect(commandesNonEnvoyees(planEnvoi([], "r", compteur()))).toEqual([]);
  });

  it("borne d'octets : un lot ne dépasse jamais la taille admise par le serveur", () => {
    const cs = lignes(10);
    const taille = new TextEncoder().encode(JSON.stringify(cs[0])).length + 1;
    expect(decouperCommandes(cs, 500, taille * 3).map((l) => l.length)).toEqual([3, 3, 3, 1]);
    expect(() => decouperCommandes(cs, 500, 10)).toThrow(RangeError);
    expect(decouperCommandes([])).toEqual([]);
    expect([ENVELOPPE_MAX_COMMANDES, ENVELOPPE_MAX_OCTETS]).toEqual([500, 900_000]);
  });

  it("un import DXF de 1 200 lignes part en 3 enveloppes conformes à l'API (≤ 500 commandes, < 1 Mo)", () => {
    const entites = Array.from({ length: 1200 }, (_, i) => `0\r\nLINE\r\n8\r\nCALQUE_AVEC_UN_NOM_ASSEZ_LONG\r\n10\r\n${i}.123456\r\n20\r\n0\r\n11\r\n${i}.987654\r\n21\r\n1000.5`).join("\r\n");
    const texte = `0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$INSUNITS\r\n70\r\n6\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nENTITIES\r\n${entites}\r\n0\r\nENDSEC\r\n0\r\nEOF\r\n`;
    const r = lireDxfStudio(texte);
    expect(r.commandes).toHaveLength(1201);
    let plan = planEnvoi(r.commandes, "rev-0", compteur());
    let doc = newStudioDocument("d");
    for (let e = enveloppeSuivante(plan); e; e = enveloppeSuivante(plan)) {
      expect(e.commands.length).toBeLessThanOrEqual(500);
      expect(new TextEncoder().encode(JSON.stringify(e)).length).toBeLessThan(1024 * 1024);
      doc = applyStudioCommands(doc, e.commands);
      plan = accuserLot(plan, `rev-${plan.envoyes + 1}`);
    }
    expect(plan.lots).toHaveLength(3);
    expect(doc.objects).toHaveLength(1200);
  });
});

describe("Boîte « Importer DXF »", () => {
  const doc = newStudioDocument("d");

  it("rapport d'un DXF en millimètres : unité du fichier, 4 objets dont 1 cercle, rien de non pris", () => {
    const lecture = lireDxf(petitDxf(4), doc, null);
    if (!("resultat" in lecture)) throw new Error("lecture attendue");
    const html = renderToStaticMarkup(createElement(Rapport, { nom: "plan.dxf", resultat: lecture.resultat, unite: null, surUnite: () => {} }));
    expect(html).toContain('data-studio-import-statut="pret"');
    expect(html).toContain('data-studio-import-objets="4"');
    expect(html).toContain('data-studio-import-non-pris="0"');
    expect(html).toContain('data-studio-import-unite="mm"');
    expect(html).not.toContain("data-studio-import-non-pris-type");
    expect(html).toContain("Courbes : 1 cercle(s), 0 arc(s), 0 polyligne(s).");
    expect(html).toContain("Unité du fichier ($INSUNITS = 4) : mm · 1 unité = 0,001 m");
    expect(html).toContain("4 objet(s) à ajouter : 2 ligne(s), 1 rectangle(s), 0 segment(s) de polyligne.");
    expect(html).not.toContain("data-studio-import-choix-unite");
    expect(html).toContain('<span translate="no">plan.dxf</span>');
  });

  it("unité inconnue : aucune commande, choix d'unité sans présélection ; le choix rend les commandes", () => {
    const inconnue = lireDxf(petitDxf(), doc, null);
    if (!("resultat" in inconnue)) throw new Error("lecture attendue");
    expect(inconnue.resultat).toMatchObject({ statut: "unite-inconnue", commandes: [] });
    const html = renderToStaticMarkup(createElement(Rapport, { nom: "x.dxf", resultat: inconnue.resultat, unite: null, surUnite: () => {} }));
    expect(html).toContain("data-studio-import-unite-inconnue");
    expect(html).toMatch(/<select[^>]*data-studio-import-choix-unite[^>]*><option value="" selected="">Choisir…<\/option>/);
    for (const u of UNITES_PROPOSEES) expect(html).toContain(`<option value="${u.valeur}">${u.libelle}</option>`);
    const choisie = lireDxf(petitDxf(), doc, "mm");
    expect("resultat" in choisie && choisie.resultat.statut === "pret" && choisie.resultat.commandes.length === 5).toBe(true);
  });

  it("la boîte : bouton « Ajouter au brouillon » désactivé sans fichier ; lecture seule annoncée", () => {
    const html = renderToStaticMarkup(createElement(DialogueImportDxf, { doc, modifiable: false, surAjouter: () => true, surFermer: () => {} }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('<h2 id="studio-import-dxf-titre">Importer DXF</h2>');
    expect(html).toMatch(/<input type="file" accept="\.dxf[^"]*" disabled="" data-studio-import-fichier="true"\/>/);
    expect(html).toMatch(/<button type="button" disabled=""[^>]*data-studio-import-ajouter/);
    expect(html).toContain("Lecture seule : l’import est indisponible.");
  });

  it("refus du lecteur : message d'interface, jamais le message technique", () => {
    expect(lireDxf("AutoCAD Binary DXF\r\n", doc, null)).toEqual({ erreur: "DXF binaire non pris en charge : enregistrez le fichier en DXF ASCII." });
    expect(lireDxf("0\nSECTION\nxx\nHEADER\n", doc, null)).toEqual({ erreur: "Fichier DXF illisible : seul le DXF ASCII (R12 ou suivant) est lu." });
    expect(messageImport(new StudioValidationError("dxf.calques", "calque verrouillé dans le document : Murs"))).toBe("Calque verrouillé dans le document : Murs. Déverrouillez-le avant l’import.");
    expect(messageImport(new StudioValidationError("dxf.objets", "20000 objets au plus par document : …"))).toBe("L’import dépasserait la limite de 20000 objets du document : rien n’est ajouté.");
    expect(messageImport(new Error("x"))).toBe("Fichier DXF illisible : seul le DXF ASCII (R12 ou suivant) est lu.");
    expect(typeNonPris("LWPOLYLINE (segment courbe)")).toEqual({ base: "LWPOLYLINE", precision: "segment courbe" });
    expect(typeNonPris("CIRCLE")).toEqual({ base: "CIRCLE", precision: null });
  });

  it("chaque texte d'interface de l'import a sa traduction anglaise", () => {
    const en = dico as Record<string, string>;
    const textes = [
      "Importer DXF", "Importer", "Fichier DXF", "Ajouter au brouillon", "Fichier :", "Rapport d’import", "Unité du dessin", "Choisir…",
      "Toutes les entités lues sont prises.", "Calques", "Lecture seule : l’import est indisponible.", "Ajout refusé par le modèle : le brouillon est inchangé.",
      "Choisissez l’unité du dessin ; elle n’est jamais devinée.", "Unité inconnue : le fichier ne déclare pas d’unité ($INSUNITS).", "— nom raccourci", "Lecture du fichier impossible.",
      "Unité du fichier ($INSUNITS = {0}) : {1} · 1 unité = {2} m", "Unité inconnue : code $INSUNITS {0} non pris en charge.",
      "{0} objet(s) à ajouter : {1} ligne(s), {2} rectangle(s), {3} segment(s) de polyligne.", "Étendue : X de {0} à {1} m, Y de {2} à {3} m (repère local).",
      "{0} entité(s) avec une cote Z non nulle : projetée(s) sur le plan, Z ignoré.", "Non pris : {0} élément(s), listés par type.", "({0} objet(s))",
      "Import DXF ajouté au brouillon : {0} objet(s). Enregistrez pour l’envoyer au serveur.",
      "Enregistrement partiel : {0} lot(s) sur {1} enregistré(s), puis une autre révision est devenue la version courante. Les {2} commande(s) non envoyée(s) restent dans ce brouillon, sur votre dernière révision enregistrée ; recharger la version serveur les perdra.",
      "Enregistrement partiel : {0} lot(s) sur {1} enregistré(s), la suite est refusée. Les {2} commande(s) non envoyée(s) restent en attente dans le brouillon, sur la dernière révision enregistrée.",
      "coordonnées manquantes", "largeur ignorée", "épaisseur ignorée", "coordonnée au-delà de 10⁹ m", "longueur nulle après conversion",
      "L’import dépasserait la limite de {0} objets du document : rien n’est ajouté.", "L’import dépasserait la limite de {0} calques du document : rien n’est ajouté.",
      "Calque verrouillé dans le document : {0}. Déverrouillez-le avant l’import.",
      "DXF binaire non pris en charge : enregistrez le fichier en DXF ASCII.", "Fichier trop volumineux : 5 Mo au plus.",
      "Le calque implicite du document est verrouillé : déverrouillez-le avant l’import.", "Un segment ou un rectangle devient nul après conversion : vérifiez l’unité.",
      "Fichier DXF illisible : seul le DXF ASCII (R12 ou suivant) est lu.",
      "DXF ASCII (R12 ou suivant). Lignes et polylignes deviennent des lignes et des rectangles du brouillon ; les autres entités sont listées, jamais écartées en silence. Rien n’est enregistré avant « Enregistrer ».",
      ...UNITES_PROPOSEES.map((u) => u.libelle), ...Object.values(CIBLES_CALQUE),
      "espace papier", "hors plan XY", "longueur nulle", "segment courbe", "segment de longueur nulle", "maillage", "lissée", "moins de deux sommets",
    ];
    for (const t of textes) expect(en[t], t).toBeTruthy();
  });

  it("lecture hors du fil principal : étapes, annulation et échecs du calcul ont leur traduction anglaise", () => {
    const en = dico as Record<string, string>;
    const echecs = (["delai", "indisponible", "interrompu", "illisible", "calcul"] as const).map((code) => messageHote(new ErreurHote(code, "x"))!);
    expect(messageHote(new ErreurHote("annulee", "x"))).toBeNull();
    expect(messageHote(new ErreurHote("remplacee", "x"))).toBeNull();
    const textes = [...Object.values(ETAPES_LECTURE), ...echecs, MESSAGE_REPLI, "Lecture du DXF en cours", "Annuler la lecture",
      "Lecture annulée : rien n’est ajouté. Choisissez de nouveau un fichier.", "Composition de la feuille…"];
    for (const t of textes) expect(en[t], t).toBeTruthy();
  });

  it("rapport pendant une relecture (autre unité) : marqué en cours, pas à jour", () => {
    const lecture = lireDxf(petitDxf(), newStudioDocument("d"), "mm");
    if (!("resultat" in lecture)) throw new Error("lecture attendue");
    const html = renderToStaticMarkup(createElement(Rapport, { nom: "x.dxf", resultat: lecture.resultat, unite: "mm", surUnite: () => {}, enCours: true }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-studio-import-a-jour="non"');
  });
});
