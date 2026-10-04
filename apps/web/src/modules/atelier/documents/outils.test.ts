import { beforeEach, describe, expect, it } from "vitest";
import type { ObjetModele } from "@parcours/atelier-model";
import { DESSINATEUR_ANNOTATIONS, geometrieCote } from "./annotations";
import { DESCRIPTEUR_ANNOTATIONS } from "./descripteurs";
import { texteCote, texteExactMin, celluleCsv } from "./format";
import { controlerTexte, oublierDecalage } from "./outils/annotation";
import { mesurer, resumeMesure } from "./outils/mesure";
import { appui, banc, cmd, dernier, etatDeTest, lot, m, P, saisie, survol, texte, touche } from "./__tests__/banc";

const params = (o: ObjetModele | undefined) => o?.params as unknown as Record<string, unknown>;

beforeEach(() => oublierDecalage());

describe("installation", () => {
  it("outils K, T, U et exports Partager sans raccourci ; dessinateur et descripteur des annotations", () => {
    const b = banc();
    const outils = b.registres.outils.lister();
    expect(outils.map((o) => [o.id, o.famille, o.raccourci ?? null, o.ecrit])).toEqual([
      ["documenter.cotation", "documenter", "K", true],
      ["documenter.texte", "documenter", "T", true],
      ["analyser.metre", "analyser", "U", false],
      ["partager.exporter-svg", "partager", null, false],
      ["partager.exporter-png", "partager", null, false],
      ["partager.exporter-dxf", "partager", null, false],
      ["partager.imprimer", "partager", null, false],
      ["partager.exporter-metre", "partager", null, false],
    ]);
    expect(outils.every((o) => o.fiches.length > 0 && o.aide.exemple !== "" && o.vues.includes("plan"))).toBe(true);
    for (const c of ["cotation", "texte", "etiquette"]) {
      expect(b.registres.dessinateurs.pour(c)).toBe(DESSINATEUR_ANNOTATIONS);
      expect(b.registres.inspecteur.pour(c)).toBe(DESCRIPTEUR_ANNOTATIONS);
    }
    expect(b.registres.outils.rechercher("dimlinear", "complet").map((o) => o.id)).toEqual(["documenter.cotation"]);
    expect(b.registres.outils.rechercher("tape", "complet").map((o) => o.id)).toEqual(["analyser.metre"]);
  });
});

describe("format", () => {
  it("cote exacte, au moins deux décimales, jamais arrondie ; CSV protégé", () => {
    expect(texteCote(4.5)).toBe("4,50 m");
    expect(texteCote(38.13)).toBe("38,13 m");
    expect(texteCote(4.125)).toBe("4,125 m");
    expect(texteExactMin(1 / 3)).toBe("0,3333333333333333");
    expect(celluleCsv("=SOMME(A1)")).toBe(`"'=SOMME(A1)"`);
    expect(celluleCsv('a"b')).toBe(`"a""b"`);
    expect(celluleCsv(0.1 + 0.2)).toBe("0.30000000000000004");
  });
});

describe("cotation libre (K)", () => {
  it("deux points puis la ligne de cote : cotation.creer libre, décalage signé exact, appliqué par le réducteur", async () => {
    const b = banc();
    expect(b.pilote.activer("documenter.cotation")).toEqual({ ok: true });
    await b.jouer(appui(0, 0), survol(4.5, 0));
    expect(b.pilote.apercu().champs.map((c) => c.champ)).toEqual(["longueur", "angle"]);
    await b.jouer(appui(4.5, 0), survol(2, 0.6));
    expect(b.pilote.apercu().champs).toEqual([{ champ: "decalage", libelle: "Décalage", unite: "m", valeur: 0.6 }]);
    expect(b.pilote.apercu().formes.some((f) => f.forme === "texte" && f.texte === "4,50 m")).toBe(true);
    await b.jouer(appui(2, 0.6));
    expect(b.valides).toHaveLength(1);
    expect(b.valides[0]?.label).toBe("Coter 4,50 m");
    expect(b.valides[0]?.commandes).toEqual([cmd("cotation.creer", { niveauId: "rdc", calqueId: "C1", id: "cotation-1", a: P(0, 0), b: P(4.5, 0), decalage: m(0.6), references: [] })]);
    expect(b.valides[0]?.commandes.some((c) => c.type === "cotation.rattacher")).toBe(false);
    const o = dernier(b.etat(), "cotation");
    expect(o?.niveauId).toBe("rdc");
    expect(params(o)).toMatchObject({ a: P(0, 0), b: P(4.5, 0), decalage: m(0.6), references: [], etat: "libre" });
    // L'outil reste actif ; décalage saisi au clavier, négatif (côté droit), exact.
    expect(b.pilote.outilActif()?.id).toBe("documenter.cotation");
    await b.jouer(appui(0, 1), appui(0, 4), survol(1, 2), saisie("decalage", -0.35), appui(1, 2));
    expect(params(dernier(b.etat(), "cotation"))).toMatchObject({ a: P(0, 1), b: P(0, 4), decalage: m(-0.35) });
    // Saisie de précision de la longueur au deuxième point.
    await b.jouer(appui(10, 10), survol(11, 10), saisie("longueur", 2.25), saisie("angle", 90), appui(11, 10), appui(9, 11));
    const c3 = params(dernier(b.etat(), "cotation"));
    expect(c3?.b).toEqual(P(10, 12.25));
    expect(b.valides.map((v) => v.label)).toEqual(["Coter 4,50 m", "Coter 3,00 m", "Coter 2,25 m"]);
  });

  it("décalage proposé : 0,60 m, puis le dernier posé ; contrôle refusé sur un calque verrouillé (rien n'est écrit)", async () => {
    const b = banc(etatDeTest(cmd("calque.creer", { id: "CV", nom: "Verrouillé", couleur: "#999999", visible: true, verrouille: true, ordre: 2 })));
    b.pilote.activer("documenter.cotation");
    await b.jouer(appui(0, 0), appui(2, 0), saisie("decalage", 1.2), appui(1, 5));
    expect(params(dernier(b.etat(), "cotation"))?.decalage).toEqual(m(1.2));
    await b.jouer(appui(0, 3), appui(2, 3));
    expect(b.pilote.apercu().champs[0]?.valeur).toBe(1.2);
    b.vue.modifier({ calqueActifId: "CV" });
    await b.jouer(appui(0, 7), appui(2, 7), appui(1, 8));
    expect(b.pilote.apercu().erreurs.length).toBeGreaterThan(0);
    expect(b.valides).toHaveLength(1);
  });

  it("dessin : ligne de cote décalée, attaches, tirets, valeur exacte ; accrochage sur la ligne de cote et a, b", () => {
    const etat = etatDeTest(cmd("cotation.creer", { id: "K1", niveauId: "rdc", calqueId: "C1", a: P(0, 0), b: P(4.5, 0), decalage: m(0.6), references: [] }));
    const d = DESSINATEUR_ANNOTATIONS.dessiner(etat.objets.K1 as ObjetModele, etat);
    expect(d?.couche).toBe("annotation");
    expect(d?.points).toEqual([P(0, 0), P(4.5, 0)]);
    expect(d?.segments).toEqual([{ a: P(0, 0.6), b: P(4.5, 0.6) }]);
    expect(d?.formes.filter((f) => f.forme === "polyligne")).toHaveLength(5);
    expect(d?.formes.find((f) => f.forme === "texte")).toMatchObject({ texte: "4,50 m" });
    expect(geometrieCote(P(0, 0), P(0, 3), 1)?.a2).toEqual({ x: -1, y: 0 });
  });

  it("inspecteur : valeur dérivée en lecture seule, décalage et points modifiables par cotation.modifier", () => {
    const etat = etatDeTest(cmd("cotation.creer", { id: "K1", niveauId: "rdc", calqueId: "C1", a: P(0, 0), b: P(4.5, 0), decalage: m(0.6), references: [] }));
    const b = banc(etat);
    const champs = Object.fromEntries(DESCRIPTEUR_ANNOTATIONS.champs(etat.objets.K1 as ObjetModele, b.ctx).map((c) => [c.cle, c]));
    expect(champs.valeur).toMatchObject({ valeur: 4.5, lectureSeule: true, unite: "m" });
    expect(champs.etat?.valeur).toBe("Cotation libre : ne suit pas les objets");
    expect(champs.decalage?.controler("x")).not.toBeNull();
    const c = champs.decalage?.commandes(1) ?? [];
    expect(c).toEqual([cmd("cotation.modifier", { modifications: { decalage: m(1) } }, ["K1"])]);
    const r = lot(etat, c);
    expect(r.ok && params(r.etat.objets.K1)?.decalage).toEqual(m(1));
    const bx = champs["b.x"]?.commandes(6) ?? [];
    const r2 = lot(etat, bx);
    expect(r2.ok && params(r2.etat.objets.K1)?.b).toEqual(P(6, 0));
    const tr = lot(etat, champs.texteRemplacement?.commandes("env. 4,5") ?? []);
    expect(tr.ok && params(tr.etat.objets.K1)?.texteRemplacement).toBe("env. 4,5");
  });
});

describe("texte libre (T)", () => {
  it("point puis texte saisi : texte.creer appliqué par le réducteur ; plusieurs lignes ; HTML stocké tel quel", async () => {
    const b = banc();
    b.pilote.activer("documenter.texte");
    await b.jouer(appui(2, 3));
    expect(b.pilote.apercu().consigne).toMatch(/Texte à poser/);
    expect(b.pilote.apercu().champs).toEqual([{ champ: "texte", libelle: "Texte à poser", unite: "", valeur: null, genre: "texte" }]);
    await b.jouer(texte("  ASC  "));
    expect(b.valides[0]).toEqual({ label: "Écrire « ASC »", commandes: [cmd("texte.creer", { niveauId: "rdc", calqueId: "C1", id: "texte-1", position: P(2, 3), texte: "ASC" })] });
    expect(params(dernier(b.etat(), "texte"))).toEqual({ position: P(2, 3), texte: "ASC" });
    // Texte tapé avant le point : posé au clic ; plusieurs lignes (D-019).
    await b.jouer(texte("Local vélos\n12 places"), appui(5, 5));
    expect(params(dernier(b.etat(), "texte"))?.texte).toBe("Local vélos\n12 places");
    await b.jouer(appui(1, 1), texte("<b>x</b>"));
    expect(params(dernier(b.etat(), "texte"))?.texte).toBe("<b>x</b>");
    // Un autre champ de texte n'est pas le contenu.
    await b.jouer(appui(0, 0), { type: "saisie-texte", champ: "autre", texte: "Non" });
    expect(b.valides).toHaveLength(3);
  });

  it("refus : texte vide, trop long, caractère de contrôle ; rien n'est écrit", async () => {
    expect(controlerTexte("   ").ok).toBe(false);
    expect(controlerTexte("x".repeat(2001)).ok).toBe(false);
    expect(controlerTexte("a\tb").ok).toBe(false);
    expect(controlerTexte("a\r\nb")).toEqual({ ok: true, texte: "a\nb" });
    const b = banc();
    b.pilote.activer("documenter.texte");
    await b.jouer(appui(1, 1), texte("   "));
    expect(b.pilote.apercu().erreurs[0]?.cause).toBe("texte vide");
    await b.jouer(touche("Escape"), texte("plus tard"));
    expect(b.valides).toHaveLength(0);
  });

  it("dessin et inspecteur du texte", () => {
    const etat = etatDeTest(cmd("texte.creer", { id: "T1", niveauId: "rdc", calqueId: "C1", position: P(2, 3), texte: "A\nBC" }));
    const d = DESSINATEUR_ANNOTATIONS.dessiner(etat.objets.T1 as ObjetModele, etat);
    expect(d).toMatchObject({ couche: "annotation", points: [P(2, 3)], segments: [] });
    expect(d?.contour).toHaveLength(4);
    const b = banc(etat);
    const champs = Object.fromEntries(DESCRIPTEUR_ANNOTATIONS.champs(etat.objets.T1 as ObjetModele, b.ctx).map((c) => [c.cle, c]));
    expect(champs.texte?.controler(null)).not.toBeNull();
    const r = lot(etat, champs.texte?.commandes("ASC") ?? []);
    expect(r.ok && params(r.etat.objets.T1)?.texte).toBe("ASC");
    const r2 = lot(etat, champs["position.y"]?.commandes(7) ?? []);
    expect(r2.ok && params(r2.etat.objets.T1)?.position).toEqual(P(2, 7));
  });

  it("étiquette : dessin (repère sans texte) et inspecteur", () => {
    const etat = etatDeTest(cmd("etiquette.creer", { id: "E1", niveauId: "rdc", calqueId: "C1", position: P(1, 1) }));
    const d = DESSINATEUR_ANNOTATIONS.dessiner(etat.objets.E1 as ObjetModele, etat);
    expect(d?.formes[0]?.forme).toBe("cercle");
    const b = banc(etat);
    const champs = Object.fromEntries(DESCRIPTEUR_ANNOTATIONS.champs(etat.objets.E1 as ObjetModele, b.ctx).map((c) => [c.cle, c]));
    expect(champs.objetId?.lectureSeule).toBe(true);
    const r = lot(etat, champs.texte?.commandes("R01") ?? []);
    expect(r.ok && params(r.etat.objets.E1)?.texte).toBe("R01");
  });
});

describe("mètre (U)", () => {
  it("mesure pure exacte : 5 m, Δx, Δy, angle ; points confondus → angle non défini", () => {
    const r = mesurer([P(0, 0), P(3, 4)]);
    expect(r.segments[0]).toMatchObject({ longueur: 5, dx: 3, dy: 4 });
    expect(r.segments[0]?.angle).toBeCloseTo(53.13010235415598, 12);
    expect(mesurer([P(1, 1), P(1, 1)]).segments[0]?.angle).toBeNull();
    expect(resumeMesure(mesurer([P(0, 0), P(4.5, 0)]))).toBe("Distance : 4,500 m (Δx 4,500 m, Δy 0,000 m, angle 0,0°)");
    expect(mesurer([P(0, 0), P(1, 0), P(1, 2)]).total).toBe(3);
  });

  it("aucune commande, aucun essai, état inchangé ; chaîne, double clic, Échap efface ; permis en lecture seule", async () => {
    const etat = etatDeTest();
    const b = banc(etat, { ecriture: false });
    expect(b.pilote.activer("analyser.metre")).toEqual({ ok: true });
    await b.jouer(appui(0, 0), survol(4.5, 0));
    expect(b.pilote.apercu().consigne).toBe("Distance : 4,500 m (Δx 4,500 m, Δy 0,000 m, angle 0,0°)");
    await b.jouer(appui(4.5, 0), appui(4.5, 2), appui(4.5, 2));
    expect(b.pilote.apercu().consigne).toMatch(/cumul de 2 segments : 6,500 m/);
    expect(b.pilote.apercu().formes.filter((f) => f.forme === "cote")).toHaveLength(2);
    await b.jouer(appui(0, 0), saisie("longueur", 2), saisie("angle", 90), survol(5, 5), appui(5, 5));
    expect(b.pilote.apercu().consigne).toMatch(/^Distance : 2,000 m \(Δx 0,000 m, Δy 2,000 m, angle 90,0°\)$/);
    await b.jouer(touche("Escape"));
    expect(b.pilote.apercu().formes).toEqual([]);
    expect(b.valides).toEqual([]);
    expect(b.essais).toEqual([]);
    expect(b.etat()).toBe(etat);
    expect(b.pilote.outilActif()?.id).toBe("analyser.metre");
  });

  it("changement de niveau actif : mesure effacée", async () => {
    const b = banc();
    b.pilote.activer("analyser.metre");
    await b.jouer(appui(0, 0), appui(1, 0));
    b.vue.modifier({ niveauActifId: "r1" });
    await b.jouer(survol(2, 2));
    expect(b.pilote.apercu().formes).toEqual([]);
  });
});
