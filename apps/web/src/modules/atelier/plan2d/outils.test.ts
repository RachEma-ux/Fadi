import { beforeEach, describe, expect, it } from "vitest";
import type { ObjetModele } from "@parcours/atelier-model";
import { oublierParametres } from "./outils/commun";
import { arcParTroisPoints, simplifierTrait } from "./outils/esquisse";
import { appui, banc, cmd, deg, dernier, etatDeTest, glisse, m, P, relache, saisie, survol, touche } from "./__tests__/contexte-de-test";

const t = { niveauId: "rdc", calqueId: "C1" };
const params = (o: ObjetModele | undefined) => o?.params as unknown as Record<string, unknown>;

beforeEach(() => oublierParametres());

describe("installation : outils et dessinateurs enregistrés", () => {
  it("familles Créer et Modifier, raccourcis L/A/C/R, fiches citées, dessinateurs des esquisses et de la référence", () => {
    const b = banc();
    const outils = b.registres.outils.lister();
    expect(outils.filter((o) => o.famille === "creer").map((o) => o.id)).toEqual(["creer.ligne", "creer.polyligne", "creer.arc", "creer.cercle", "creer.rectangle", "creer.polygone", "creer.spline", "creer.main-levee", "creer.axe", "creer.construction", "creer.hachure"]);
    expect(outils.filter((o) => o.famille === "modifier")).toHaveLength(13);
    expect(outils.filter((o) => o.raccourci).map((o) => o.raccourci)).toEqual(["L", "A", "C", "R"]);
    expect(outils.every((o) => o.fiches.length > 0 && o.vues.includes("plan") && o.aide.exemple !== "")).toBe(true);
    expect(b.registres.outils.rechercher("offset", "complet").map((o) => o.id)).toEqual(["modifier.decaler"]);
    expect(b.registres.outils.rechercher("trim", "complet").map((o) => o.id)).toEqual(["modifier.ajuster"]);
    expect(b.registres.dessinateurs.pour("esquisse.spline")).not.toBeNull();
    expect(b.registres.dessinateurs.pour("reference-plan")).not.toBeNull();
    expect(b.registres.dessinateurs.pour("mur")).toBeNull();
  });
  it("activation : niveau et calque exigés pour créer, sélection exigée pour transformer", () => {
    const b = banc();
    expect(b.pilote.activer("modifier.deplacer")).toEqual({ ok: false, motif: "sélectionner d'abord au moins un objet" });
    b.vue.modifier({ calqueActifId: null });
    expect(b.pilote.activer("creer.ligne")).toEqual({ ok: false, motif: "choisir d'abord un calque actif" });
  });
});

describe("outils d'esquisse : évènements → commandes → réducteur", () => {
  it("ligne par deux clics, puis par saisie de longueur et d'angle (valeurs exactes)", async () => {
    const b = banc();
    b.pilote.activer("creer.ligne");
    await b.jouer(appui(0, 0), survol(3, 0.1));
    expect(b.pilote.apercu().champs.map((c) => c.champ)).toEqual(["longueur", "angle"]);
    expect(b.pilote.apercu().formes.some((f) => f.forme === "cote")).toBe(true);
    await b.jouer(appui(3, 0));
    expect(b.valides[0]?.label).toBe("Tracer une ligne");
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "esquisse.ligne", params: { ...t, a: P(0, 0), b: P(3, 0) } });
    // L'outil reste actif : deuxième ligne de 4,5 m à 90° depuis (1 ; 1).
    expect(b.pilote.outilActif()?.id).toBe("creer.ligne");
    await b.jouer(appui(1, 1), survol(2, 2), saisie("longueur", 4.5), saisie("angle", 90), appui(2, 2));
    expect(params(dernier(b.etat(), "esquisse.ligne"))?.b).toEqual(P(1, 5.5));
  });

  it("polyligne : Retour arrière, double appui pour finir, appui sur le premier sommet pour fermer", async () => {
    const b = banc();
    b.pilote.activer("creer.polyligne");
    await b.jouer(appui(0, 0), appui(4, 0), appui(9, 9), touche("Backspace"), appui(4, 3), appui(4, 3));
    expect(params(dernier(b.etat(), "esquisse.polyligne"))).toMatchObject({ points: [P(0, 0), P(4, 0), P(4, 3)], ferme: false });
    await b.jouer(appui(10, 0), appui(12, 0), appui(12, 2), appui(10, 0));
    expect(params(dernier(b.etat(), "esquisse.polyligne"))).toMatchObject({ points: [P(10, 0), P(12, 0), P(12, 2)], ferme: true });
    expect(b.valides.map((v) => v.label)).toEqual(["Tracer une polyligne", "Tracer une polyligne"]);
  });

  it("arc par trois points : centre, rayon, angles et sens canoniques ; points alignés refusés", async () => {
    expect(arcParTroisPoints({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 })).toMatchObject({ centre: { x: 0, y: 0 }, rayon: 1, angleDebut: 0, angleFin: 180, sens: "trigo" });
    const b = banc();
    b.pilote.activer("creer.arc");
    await b.jouer(appui(1, 0), appui(0, -1), appui(-1, 0));
    const a = params(dernier(b.etat(), "esquisse.arc"));
    expect(a?.sens).toBe("horaire");
    expect((a?.rayon as { value: number }).value).toBeCloseTo(1, 12);
    await b.jouer(appui(0, 0), appui(1, 0), appui(2, 0));
    expect(b.pilote.apercu().erreurs[0]?.cause).toMatch(/alignés/);
    expect(b.valides).toHaveLength(1);
  });

  it("cercle : rayon verrouillé par saisie", async () => {
    const b = banc();
    b.pilote.activer("creer.cercle");
    await b.jouer(appui(2, 2), survol(5, 2), saisie("rayon", 1.5), appui(5, 2));
    expect(params(dernier(b.etat(), "esquisse.cercle"))).toMatchObject({ centre: P(2, 2), rayon: { value: 1.5, unit: "m" } });
  });

  it("rectangle : coins dans n'importe quel ordre normalisés ; largeur et profondeur saisies", async () => {
    const b = banc();
    b.pilote.activer("creer.rectangle");
    await b.jouer(appui(4, 3), appui(1, 1));
    expect(params(dernier(b.etat(), "esquisse.rectangle"))).toMatchObject({ origine: P(1, 1), largeur: { value: 3 }, profondeur: { value: 2 }, angle: { value: 0 } });
    await b.jouer(appui(10, 10), survol(12, 12), saisie("largeur", 4), saisie("profondeur", 0.5), appui(12, 12));
    expect(params(dernier(b.etat(), "esquisse.rectangle"))).toMatchObject({ origine: P(10, 10), largeur: { value: 4 }, profondeur: { value: 0.5 } });
  });

  it("polygone : nombre de côtés en paramètre (contrôlé), centre et sommet", async () => {
    const b = banc();
    b.pilote.activer("creer.polygone");
    await b.jouer(saisie("cotes", 2));
    expect(b.pilote.apercu().erreurs[0]?.action).toMatch(/de 3 à 1000/);
    await b.jouer(saisie("cotes", 8), appui(0, 0), appui(0, 2));
    expect(params(dernier(b.etat(), "esquisse.polygone"))).toMatchObject({ centre: P(0, 0), nombreCotes: 8, rayon: { value: 2 }, mode: "inscrit", angle: { value: 90 } });
  });

  it("spline de passage, degré 3, fermée", async () => {
    const b = banc();
    b.pilote.activer("creer.spline");
    await b.jouer(appui(0, 0), appui(2, 1), appui(4, 0), appui(0, 0));
    expect(params(dernier(b.etat(), "esquisse.spline"))).toMatchObject({ mode: "passage", degre: 3, ferme: true, points: [P(0, 0), P(2, 1), P(4, 0)] });
  });

  it("main levée : trait simplifié en polyligne au relâcher ; Alt : spline ; trait trop court refusé", async () => {
    const s = simplifierTrait(Array.from({ length: 30 }, (_, i) => ({ x: i * 0.1, y: 0.0001 * (i % 2) })));
    expect(s.points).toHaveLength(2);
    const b = banc();
    b.pilote.activer("creer.main-levee");
    const trait = [...Array.from({ length: 20 }, (_, i) => glisse(i * 0.1, 0)), ...Array.from({ length: 20 }, (_, i) => glisse(1.9, (i + 1) * 0.1))];
    await b.jouer(appui(0, 0), ...trait);
    expect(b.pilote.apercu().formes.some((f) => f.forme === "texte" && f.texte === "3 sommets")).toBe(true);
    await b.jouer(relache(1.9, 2));
    const pl = params(dernier(b.etat(), "esquisse.polyligne"));
    expect(pl?.ferme).toBe(false);
    const sommets = pl?.points as { x: number; y: number }[];
    expect(sommets).toHaveLength(3);
    [P(0, 0), P(1.9, 0), P(1.9, 2)].forEach((q, i) => {
      expect(sommets[i]?.x).toBeCloseTo(q.x, 12);
      expect(sommets[i]?.y).toBeCloseTo(q.y, 12);
    });
    await b.jouer(appui(5, 5), ...Array.from({ length: 10 }, (_, i) => glisse(5 + i * 0.3, 5 + Math.sin(i) * 0.5)), relache(8, 5, { alt: true }));
    expect(dernier(b.etat(), "esquisse.spline")).toBeDefined();
    await b.jouer(appui(0, 0), relache(0, 0));
    expect(b.pilote.apercu().erreurs[0]?.cause).toBe("trait trop court");
  });

  it("axe et ligne de construction (DA-01-10)", async () => {
    const b = banc();
    b.pilote.activer("creer.axe");
    await b.jouer(appui(0, 0), appui(0, 5));
    expect(params(dernier(b.etat(), "esquisse.construction"))).toMatchObject({ nature: "axe", a: P(0, 0), b: P(0, 5) });
    b.pilote.activer("creer.construction");
    await b.jouer(appui(1, 1), appui(2, 2, { alt: true }));
    expect(params(dernier(b.etat(), "esquisse.construction"))).toMatchObject({ nature: "construction", point: P(1, 1), direction: { value: 45 }, etendue: "demi-droite" });
  });

  it("hachure : paramètres exigés, contour et trou copiés par clic intérieur", async () => {
    const b = banc(
      etatDeTest(
        cmd("esquisse.rectangle", { id: "R", ...t, origine: P(0, 0), largeur: m(4), profondeur: m(4), angle: deg(0) }),
        cmd("esquisse.rectangle", { id: "T", ...t, origine: P(1, 1), largeur: m(1), profondeur: m(1), angle: deg(0) }),
      ),
    );
    b.pilote.activer("creer.hachure");
    await b.jouer(appui(3, 3));
    expect(b.pilote.apercu().erreurs[0]?.action).toMatch(/espacement/);
    await b.jouer(saisie("espacement", 0.2), saisie("angle", 45), survol(3, 3));
    expect(b.pilote.apercu().formes.find((f) => f.forme === "texte")).toMatchObject({ texte: "15 m² nets" });
    await b.jouer(appui(3, 3));
    const h = params(dernier(b.etat(), "esquisse.hachure"));
    expect(h).toMatchObject({ motifId: "lignes", angle: { value: 45 }, espacement: { value: 0.2 } });
    expect((h?.contour as unknown[]).length).toBe(4);
    expect((h?.trous as unknown[]).length).toBe(1);
  });

  it("contrôle avant validation : calque verrouillé refusé, rien d'écrit, erreur lisible", async () => {
    const b = banc(etatDeTest(), { calque: "CV" });
    b.pilote.activer("creer.ligne");
    await b.jouer(appui(0, 0), appui(2, 0));
    expect(b.valides).toHaveLength(0);
    expect(b.pilote.apercu().erreurs.length).toBeGreaterThan(0);
    expect(b.pilote.apercu().erreurs[0]?.message).toMatch(/verrouill/i);
  });
});

describe("transformations : sélection → aperçu fantôme → commande → réducteur", () => {
  const base = () =>
    etatDeTest(
      cmd("esquisse.ligne", { id: "L1", ...t, a: P(0, 0), b: P(4, 0) }),
      cmd("esquisse.ligne", { id: "LIM", ...t, a: P(3, -1), b: P(3, 3) }),
      cmd("esquisse.rectangle", { id: "R1", ...t, origine: P(10, 0), largeur: m(4), profondeur: m(2), angle: deg(0) }),
      cmd("esquisse.polyligne", { id: "PL", ...t, points: [P(0, 10), P(4, 10), P(4, 14)], ferme: false }),
      cmd("mur.tracer", { id: "M1", ...t, a: P(0, 20), b: P(6, 20), epaisseur: m(0.2), hauteur: m(3), alignement: "axe", typeId: "non-type", exterieur: true }),
      cmd("ouverture.poser", { id: "P1", ...t, classe: "porte", murHoteId: "M1", position: { t: 0.5 }, largeur: m(0.9), hauteur: m(2.1), allege: m(0), typeId: "non-type" }),
    );

  it("déplacer : fantôme pendant le survol, vecteur exact ; Ctrl au second point : copie", async () => {
    const b = banc(base());
    b.ctx.selection.choisir(["L1"]);
    b.pilote.activer("modifier.deplacer");
    await b.jouer(appui(0, 0), survol(1, 1));
    expect(b.pilote.apercu().formes.some((f) => f.forme === "polyligne" && f.style === "fantome")).toBe(true);
    await b.jouer(saisie("longueur", 2), saisie("angle", 90), appui(1, 1));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "transformer.deplacer", cibles: ["L1"], params: { vecteur: { dx: 0, dy: 2, unit: "m" } } });
    expect(params(b.etat().objets.L1)?.a).toEqual(P(0, 2));
    expect(b.pilote.outilActif()).toBeNull();
    b.pilote.activer("modifier.deplacer");
    await b.jouer(appui(0, 0), appui(0, 5, { ctrl: true }));
    expect(b.valides[1]?.commandes[0]).toMatchObject({ type: "transformer.copier", params: { nouveauxIds: ["esquisse-ligne-1"] } });
  });

  it("copier un mur : ses ouvertures sont copiées avec lui (nouveaux identifiants, un par objet)", async () => {
    const b = banc(base());
    b.ctx.selection.choisir(["M1"]);
    b.pilote.activer("modifier.copier");
    await b.jouer(appui(0, 20), appui(0, 25));
    const c = b.valides[0]?.commandes[0];
    expect(c).toMatchObject({ type: "transformer.copier", cibles: ["M1", "P1"], params: { nouveauxIds: ["mur-1", "porte-2"] } });
    expect(params(b.etat().objets["porte-2"])?.murHoteId).toBe("mur-1");
    expect(b.pilote.outilActif()?.id).toBe("modifier.copier");
  });

  it("tourner de 90° par saisie ; miroir en place et avec copie (Ctrl)", async () => {
    const b = banc(base());
    b.ctx.selection.choisir(["L1"]);
    b.pilote.activer("modifier.tourner");
    await b.jouer(appui(0, 0), survol(1, 1), saisie("angle", 90), appui(1, 1));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "transformer.tourner", params: { centre: P(0, 0), angle: { value: 90, unit: "°" } } });
    const l = params(b.etat().objets.L1)?.b as { x: number; y: number };
    expect(l.x).toBeCloseTo(0, 12);
    expect(l.y).toBeCloseTo(4, 12);
    b.ctx.selection.choisir(["R1"]);
    b.pilote.activer("modifier.miroir");
    await b.jouer(appui(0, -5), appui(1, -5));
    expect(b.valides[1]?.commandes[0]).toMatchObject({ type: "transformer.miroir", params: { conserverOriginal: false } });
    expect(params(b.etat().objets.R1)?.origine).toEqual(P(10, -12));
    b.pilote.activer("modifier.miroir");
    await b.jouer(appui(0, -5), appui(1, -5, { ctrl: true }));
    expect(b.valides[2]?.commandes[0]).toMatchObject({ type: "transformer.miroir", params: { conserverOriginal: true, nouveauxIds: ["esquisse-rectangle-1"] } });
  });

  it("échelle : facteur par trois points ou par saisie ; épaisseur de mur inchangée (D-014)", async () => {
    const b = banc(base());
    b.ctx.selection.choisir(["R1"]);
    b.pilote.activer("modifier.echelle");
    await b.jouer(appui(10, 0), appui(12, 0), appui(14, 0));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "transformer.echelle", params: { centre: P(10, 0), facteur: 2 } });
    expect(params(b.etat().objets.R1)?.largeur).toEqual({ value: 8, unit: "m" });
    b.ctx.selection.choisir(["M1"]);
    b.pilote.activer("modifier.echelle");
    await b.jouer(appui(0, 20), survol(1, 20), saisie("facteur", 0.5), appui(1, 20));
    expect(params(b.etat().objets.M1)).toMatchObject({ axe: { b: P(3, 20) }, epaisseur: { value: 0.2 } });
  });

  it("étirer : fenêtre de capture, sans sélection les objets touchés", async () => {
    const b = banc(base(), { repli: true });
    b.pilote.activer("modifier.etirer");
    await b.jouer(appui(3.5, -0.5), appui(4.5, 0.5), appui(4, 0), appui(5, 0));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "transformer.etirer", cibles: ["L1"], params: { vecteur: { dx: 1, dy: 0 } } });
    expect(params(b.etat().objets.L1)?.b).toEqual(P(5, 0));
  });

  it("ajuster et prolonger une ligne sur une limite sélectionnée", async () => {
    const b = banc(base());
    b.ctx.selection.choisir(["LIM"]);
    b.pilote.activer("modifier.ajuster");
    await b.jouer(appui(9, 9));
    expect(b.pilote.apercu().erreurs[0]?.cause).toMatch(/aucune ligne/);
    await b.jouer(survol(3.5, 0, {}, "L1"), appui(3.5, 0, {}, "L1"));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "transformer.ajuster", cibles: ["L1"], params: { limiteIds: ["LIM"], pointChoix: P(3.5, 0) } });
    expect(params(b.etat().objets.L1)?.b).toEqual(P(3, 0));
    b.pilote.activer("modifier.prolonger");
    b.ctx.selection.choisir(["R1"]);
    b.pilote.activer("modifier.prolonger");
    await b.jouer(appui(2.9, 0, {}, "L1"));
    expect(params(b.etat().objets.L1)?.b).toEqual(P(10, 0));
  });

  it("décaler : distance saisie, côté désigné ; sans sélection l'objet est désigné d'abord", async () => {
    const b = banc(base(), { repli: true });
    b.pilote.activer("modifier.decaler");
    await b.jouer(saisie("distance", 0.5), appui(1, 0, {}, "L1"), appui(1, 3));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "transformer.decaler", cibles: ["L1"], params: { distance: { value: 0.5 }, cote: P(1, 3), nouveauxIds: ["esquisse-ligne-1"] } });
    expect(params(b.etat().objets["esquisse-ligne-1"])).toMatchObject({ a: P(0, 0.5), b: P(4, 0.5) });
    b.ctx.selection.choisir(["R1"]);
    b.pilote.activer("modifier.decaler");
    await b.jouer(appui(12, 1));
    expect(b.valides[1]?.commandes[0]).toMatchObject({ type: "transformer.decaler", cibles: ["R1"], params: { distance: { value: 0.5 } } });
  });

  it("répéter : n copies, nouveaux identifiants n × sélection", async () => {
    const b = banc(base());
    b.ctx.selection.choisir(["L1", "LIM"]);
    b.pilote.activer("modifier.repeter");
    await b.jouer(saisie("nombre", 3), appui(0, 0), appui(0, 1));
    const c = b.valides[0]?.commandes[0];
    expect(c).toMatchObject({ type: "transformer.repeter", params: { nombre: 3, vecteur: { dx: 0, dy: 1 } } });
    expect((params(c as never)?.nouveauxIds as unknown[]).length).toBe(6);
    expect(Object.values(b.etat().objets).filter((o) => o.classe === "esquisse.ligne")).toHaveLength(8);
  });

  it("décomposer : pertes annoncées, rectangle → 4 lignes ; classe non décomposable refusée", async () => {
    const b = banc(base());
    b.ctx.selection.choisir(["R1", "PL"]);
    b.pilote.activer("modifier.decomposer");
    expect(b.pilote.apercu().consigne).toMatch(/largeur, profondeur et angle du rectangle/);
    await b.jouer(appui(0, 0));
    expect((params(b.valides[0]?.commandes[0] as never)?.nouveauxIds as unknown[]).length).toBe(6);
    expect(b.etat().objets.R1).toBeUndefined();
    b.ctx.selection.choisir(["L1"]);
    b.pilote.activer("modifier.decomposer");
    await b.jouer(appui(0, 0));
    expect(b.pilote.apercu().erreurs[0]?.cause).toMatch(/ne se décompose pas/);
  });

  it("points de contrôle : poignées, clic-clic et glisser-relâcher, une commande par geste", async () => {
    const b = banc(base());
    b.ctx.selection.choisir(["PL"]);
    b.pilote.activer("modifier.points");
    expect(b.pilote.apercu().formes.filter((f) => f.forme === "cercle" && f.rayon === 0)).toHaveLength(3);
    await b.jouer(appui(4.1, 13.9), survol(5, 15), appui(5, 15));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "transformer.pointsDeControle", cibles: ["PL"], params: { deplacements: [{ indice: 2, point: P(5, 15) }] } });
    await b.jouer(appui(0, 10), glisse(-1, 10), glisse(-2, 10), relache(-2, 10));
    expect(params(b.etat().objets.PL)?.points).toEqual([P(-2, 10), P(4, 10), P(5, 15)]);
    expect(b.valides).toHaveLength(2);
    b.ctx.selection.choisir(["L1", "LIM"]);
    expect(b.pilote.activer("modifier.points")).toEqual({ ok: false, motif: "sélectionner un seul objet" });
  });

  it("baie seule : refus lisible du réducteur, rien d'écrit", async () => {
    const b = banc(base());
    b.ctx.selection.choisir(["P1"]);
    b.pilote.activer("modifier.deplacer");
    await b.jouer(appui(0, 0), appui(1, 0));
    expect(b.valides).toHaveLength(0);
    expect(b.pilote.apercu().erreurs[0]?.cause).toMatch(/baie seule/);
  });
});
