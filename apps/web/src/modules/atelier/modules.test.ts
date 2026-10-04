import { describe, expect, it } from "vitest";
import { MODULES_ATELIER, transportReference } from "./NouvelAtelier";
import type { TransportAtelier } from "./bus";
import { creerRegistres } from "./socle";
import { tableRaccourcis } from "./ui/raccourcis";

describe("modules installés dans le nouvel Atelier", () => {
  it("plan 2D, architecture et documents s'installent ensemble, sans conflit de raccourci (D-037)", () => {
    const r = creerRegistres();
    for (const installer of MODULES_ATELIER) installer(r);
    const outils = r.outils.lister();
    expect(tableRaccourcis(outils).conflits).toEqual([]);
    const parRaccourci = Object.fromEntries(outils.filter((o) => o.raccourci).map((o) => [o.raccourci, o.id]));
    expect(Object.keys(parRaccourci).sort()).toEqual(["A", "C", "E", "F", "K", "L", "M", "O", "P", "R", "S", "T", "U"]);
    expect(parRaccourci.M).toBe("creer.mur");
    expect(parRaccourci.P).toBe("creer.porte");
    for (const classe of ["mur", "porte", "piece", "cotation", "texte"]) expect(r.dessinateurs.pour(classe), classe).not.toBeNull();
  });
});

describe("référence protégée de l'exemple (D-052 §7)", () => {
  it("la première écriture crée une seule copie de travail, y envoie le lot, puis bascule ; les lectures restent sur la référence", async () => {
    const envois: string[] = [];
    const lectures: string[] = [];
    const base = {
      lireModele: async (id: string) => (lectures.push(id), {}),
      lireJournal: async (id: string) => (lectures.push(id), {}),
      envoyerCommandes: async (id: string) => (envois.push(id), { ok: true }),
    } as unknown as TransportAtelier;
    let copies = 0;
    const bascules: string[] = [];
    const t = transportReference(base, async () => ({ id: `copie-${++copies}` }), (c) => bascules.push(c.id));
    await t.lireModele("ref");
    const env = { requestId: "r", baseRevision: 1, contract: "atelier-commands/1", label: "Mur", commands: [] } as never;
    await Promise.all([t.envoyerCommandes("ref", env), t.envoyerCommandes("ref", env)]);
    expect(copies).toBe(1);
    expect(envois).toEqual(["copie-1", "copie-1"]);
    expect(bascules).toEqual(["copie-1", "copie-1"]);
    expect(lectures).toEqual(["ref"]);
  });
});
