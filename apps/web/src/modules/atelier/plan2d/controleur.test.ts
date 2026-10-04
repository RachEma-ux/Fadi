import { beforeEach, describe, expect, it } from "vitest";
import type { ObjetModele } from "@parcours/atelier-model";
import { ControleurPlan, type EntreePointeur, type TypePointeur } from "./controleur";
import { oublierParametres } from "./outils/commun";
import { banc, cmd, etatDeTest, P, SANS, type Banc } from "./__tests__/contexte-de-test";

const t = { niveauId: "rdc", calqueId: "C1" };
const params = (o: ObjetModele | undefined) => o?.params as unknown as Record<string, unknown>;

/** Cadre de test : 100 px/m, le point (0 ; 10) m au coin haut-gauche. */
const CADRE = { zoom: 100, origineX: 0, origineY: 10, largeur: 800, hauteur: 600 };
/** Entrée de pointeur à la position écran du point (x ; y) m. */
const en = (x: number, y: number, o: { id?: number; type?: TypePointeur; maj?: boolean; ctrl?: boolean } = {}): EntreePointeur => ({
  id: o.id ?? 1,
  x: x * 100,
  y: (10 - y) * 100,
  type: o.type ?? "mouse",
  bouton: 0,
  modificateurs: { ...SANS, maj: o.maj ?? false, ctrl: o.ctrl ?? false },
});
const clic = (c: ControleurPlan, x: number, y: number, o: Parameters<typeof en>[2] = {}) => {
  c.pointeurDeplace(en(x, y, o));
  c.pointeurBas(en(x, y, o));
  c.pointeurHaut(en(x, y, o));
};
const attendreTout = () => new Promise((r) => setTimeout(r, 0));

function zone(b: Banc): ControleurPlan {
  const c = new ControleurPlan({ registres: b.registres, pilote: b.pilote, ctx: b.ctx, vue: b.vue });
  c.definirCadre(CADRE);
  return c;
}

const deuxLignes = () =>
  etatDeTest(cmd("esquisse.ligne", { id: "L1", ...t, a: P(0, 0), b: P(4, 0) }), cmd("esquisse.ligne", { id: "L2", ...t, a: P(0, 2), b: P(4, 2) }));

beforeEach(() => oublierParametres());

describe("contrôleur : pointeur écran → EvenementPlan en mètres après accrochage", () => {
  it("ligne au pointeur : les deux points posés sur la grille 0,50 m, y vers le haut", async () => {
    const b = banc();
    const c = zone(b);
    b.pilote.activer("creer.ligne");
    clic(c, 1.26, 0.74);
    clic(c, 3.02, 0.49);
    await c.attendre();
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "esquisse.ligne", params: { ...t, a: P(1.5, 0.5), b: P(3, 0.5) } });
  });

  it("accrochage visible : extrémité marquée et libellée près du curseur, tolérance 8 px convertie en mètres", async () => {
    const b = banc(deuxLignes());
    const c = zone(b);
    b.pilote.activer("creer.ligne");
    c.pointeurDeplace(en(3.95, 0.03));
    expect(c.lire().accrochage?.type).toBe("extremite");
    expect(c.lire().curseurMetres).toMatchObject({ x: 4, y: 0 });
    expect(c.lire().curseur).toEqual({ x: 400, y: 1000 });
    // 0,12 m = 12 px > 8 px : plus d'extrémité, la grille prend le relais.
    c.pointeurDeplace(en(3.88, 0.1));
    expect(c.lire().accrochage?.type).toBe("grille");
    c.basculerAccrochage();
    c.pointeurDeplace(en(3.88, 0.1));
    expect(c.lire().accrochage).toBeNull();
    await c.attendre();
  });

  it("pointeur annulé pendant un trait à main levée : abandon sans commande", async () => {
    const b = banc();
    const c = zone(b);
    b.pilote.activer("creer.main-levee");
    c.pointeurBas(en(0, 0));
    for (let i = 1; i <= 20; i++) c.pointeurDeplace(en(i * 0.1, (i % 3) * 0.2));
    c.pointeurAnnule(en(2, 0));
    c.pointeurHaut(en(2, 0));
    await c.attendre();
    expect(b.valides).toHaveLength(0);
  });

  it("deux doigts : pincer zoome autour du milieu, jamais de trait", async () => {
    const b = banc();
    const c = zone(b);
    b.pilote.activer("creer.ligne");
    c.pointeurBas({ ...en(1, 9, { id: 1, type: "touch" }) });
    c.pointeurBas({ ...en(2, 9, { id: 2, type: "touch" }) });
    c.pointeurDeplace({ ...en(3, 9, { id: 2, type: "touch" }) });
    expect(c.lire().cadre.zoom).toBeCloseTo(200, 9);
    c.pointeurHaut(en(3, 9, { id: 2, type: "touch" }));
    c.pointeurHaut(en(1, 9, { id: 1, type: "touch" }));
    await c.attendre();
    expect(b.valides).toHaveLength(0);
  });
});

describe("contrôleur : sélection sans outil", () => {
  it("clic, Maj = ajouter, Échap = vider", () => {
    const b = banc(deuxLignes());
    const c = zone(b);
    clic(c, 2, 0.02);
    expect(b.ctx.selection.lire().ids).toEqual(["L1"]);
    clic(c, 2, 2.02, { maj: true });
    expect([...b.ctx.selection.lire().ids].sort()).toEqual(["L1", "L2"]);
    expect(c.touche("Escape", SANS)).toBe(true);
    expect(b.ctx.selection.lire().ids).toEqual([]);
  });

  it("lasso de gauche à droite : inclus ; de droite à gauche : touchés", () => {
    const b = banc(deuxLignes());
    const c = zone(b);
    const glisser = (de: [number, number], a: [number, number]) => {
      c.pointeurBas(en(...de));
      c.pointeurDeplace(en(...a));
      expect(c.lire().lasso?.sens).toBe(a[0] >= de[0] ? "inclus" : "touches");
      c.pointeurHaut(en(...a));
    };
    glisser([-1, -1], [5, 1]);
    expect(b.ctx.selection.lire().ids).toEqual(["L1"]);
    glisser([2, 1], [5, 3]);
    expect(b.ctx.selection.lire().ids).toEqual([]);
    glisser([5, 1], [2, 3]);
    expect(b.ctx.selection.lire().ids).toEqual(["L2"]);
  });

  it("manipulateur : glisser un objet sélectionné le déplace (une commande), accroché sur la grille", async () => {
    const b = banc(deuxLignes());
    const c = zone(b);
    b.ctx.selection.choisir(["L1"]);
    c.pointeurBas(en(2, 0));
    c.pointeurDeplace(en(2, 1.02));
    expect(c.lire().manipulation).toMatchObject({ dx: 0, dy: 1, copie: false });
    c.pointeurHaut(en(2, 1.02));
    await attendreTout();
    expect(b.valides).toHaveLength(1);
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "transformer.deplacer", cibles: ["L1"], params: { vecteur: { dx: 0, dy: 1, unit: "m" } } });
    expect(params(b.etat().objets.L1)?.a).toEqual(P(0, 1));
  });
});

describe("contrôleur : clavier seul et saisie de précision", () => {
  it("flèches = un pas de grille depuis le centre de la vue, Entrée pose le point", async () => {
    const b = banc();
    const c = zone(b);
    b.pilote.activer("creer.ligne");
    // Centre de la vue : (4 ; 7) m.
    c.touche("ArrowRight", SANS);
    expect(c.lire().curseurMetres).toMatchObject({ x: 4.5, y: 7 });
    c.touche("Enter", SANS);
    c.touche("ArrowUp", SANS);
    c.touche("ArrowUp", SANS);
    c.touche("Enter", SANS);
    await c.attendre();
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "esquisse.ligne", params: { a: P(4.5, 7), b: P(4.5, 8) } });
  });

  it("taper un nombre ouvre le champ proposé ; Tab passe au suivant ; Entrée envoie et pose", async () => {
    const b = banc();
    const c = zone(b);
    b.pilote.activer("creer.ligne");
    clic(c, 0, 0);
    c.pointeurDeplace(en(3, 0.5));
    await c.attendre();
    expect(c.touche("4", SANS)).toBe(true);
    expect(c.lire().saisie).toMatchObject({ indice: 0, texte: "4" });
    expect(c.champActif().champ).toBe("longueur");
    c.ecrireSaisie("4,5");
    c.validerSaisie("suivant");
    expect(c.champActif().champ).toBe("angle");
    c.ecrireSaisie("90");
    c.validerSaisie("entree");
    await c.attendre();
    expect(c.lire().saisie).toBeNull();
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "esquisse.ligne", params: { a: P(0, 0), b: P(0, 4.5) } });
  });

  it("saisie erronée : erreur lisible, rien d'envoyé", async () => {
    const b = banc();
    const c = zone(b);
    b.pilote.activer("creer.ligne");
    clic(c, 0, 0);
    await c.attendre();
    c.touche("1", SANS);
    c.ecrireSaisie("abc");
    c.validerSaisie("entree");
    await c.attendre();
    expect(c.lire().saisie?.erreur).not.toBeNull();
    expect(b.valides).toHaveLength(0);
  });
});
