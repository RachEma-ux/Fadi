import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { basculerPaquet, codeRepondA, controlesPaquet, controlesReussis, lireBrouillonPaquet, lireChoixPaquets, lireFichesPaquetsCompte, nomFichierPaquet, paquetInstalle, paquetVide, validerChangementReglagePaquet } from "./administration-extensions.js";
import { jugerImportPaquet } from "./extensions-installees.js";
import type { PaquetExtension } from "./protocole-extensions.js";

const essai = (): PaquetExtension => JSON.parse(readFileSync(new URL("../../../apps/web/e2e/donnees/essai-commandes.fadi-addon.json", import.meta.url), "utf8"));

describe("administration des extensions ajoutées", () => {
  it("réglage : état et installée d'origine seulement, valeurs connues", () => {
    expect(validerChangementReglagePaquet({ etat: "disponible" })).toEqual({ ok: true, reglage: { etat: "disponible" } });
    expect(validerChangementReglagePaquet({ activeParDefaut: true, etat: "experimentale" })).toEqual({ ok: true, reglage: { etat: "experimentale", activeParDefaut: true } });
    for (const corps of [null, [], {}, { etat: "retiree" }, { activeParDefaut: "oui" }, { etat: "disponible", autre: 1 }]) expect(validerChangementReglagePaquet(corps).ok).toBe(false);
  });

  it("choix d'un compte : relu avec tolérance, le geste l'emporte sur le réglage d'origine", () => {
    expect(lireChoixPaquets({ "garde-corps": true, "Mauvais Id": true, autre: "oui" })).toEqual({ "garde-corps": true });
    expect(lireChoixPaquets("rien")).toEqual({});
    expect(paquetInstalle("a", {}, true)).toBe(true);
    expect(paquetInstalle("a", {}, false)).toBe(false);
    expect(paquetInstalle("a", { a: false }, true)).toBe(false);
    expect(basculerPaquet({ a: true, partie: true }, "b", true, ["a", "b"])).toEqual({ a: true, b: true });
    expect(basculerPaquet({ a: true }, "inconnue", true, ["a"])).toEqual({ a: true });
  });

  it("fiches reçues par un compte : une fiche mal formée est écartée", () => {
    const bonne = { id: "garde-corps", nom: { fr: "Garde-corps", en: "Railings" }, description: { fr: "d", en: "d" }, version: "1.0.0", etat: "experimentale", commandes: 3, outils: 0, panneaux: 0, installee: false };
    expect(lireFichesPaquetsCompte([bonne, { ...bonne, etat: "retiree" }, { ...bonne, id: "X" }, null])).toEqual([bonne]);
    expect(lireFichesPaquetsCompte("rien")).toEqual([]);
  });

  it("brouillon vide : la forme d'un paquet, des contrôles en rouge, un nom de fichier", () => {
    const vide = paquetVide();
    expect(vide.format).toBe("fadi-addon/1");
    const controles = controlesPaquet(vide, [], null);
    expect(controles.find((c) => c.genre === "fiche")).toMatchObject({ ok: false, detail: "identifiant" });
    expect(controles.find((c) => c.genre === "commandes")?.ok).toBe(false);
    expect(controlesReussis(controles)).toBe(false);
    expect(nomFichierPaquet("garde-corps")).toBe("garde-corps.fadi-addon.json");
    expect(nomFichierPaquet("")).toBe("extension.fadi-addon.json");
  });

  it("paquet d'essai : tous les contrôles passent, comme les règles d'import", () => {
    const p = essai();
    expect(jugerImportPaquet(p).ok).toBe(true);
    const controles = controlesPaquet(p, [], null);
    expect(controles.map((c) => c.genre)).toEqual(["fiche", "commandes", "raccourcis", "code"]);
    expect(controles.find((c) => c.genre === "commandes")?.detail).toBe(String(p.fiche.commandes.length));
    expect(controlesReussis(controles)).toBe(true);
  });

  it("contrôles en rouge : code illisible, commande sans réponse, raccourci pris, autre refus d'import", () => {
    const p = essai();
    expect(controlesPaquet(p, [], "Unexpected token").find((c) => c.genre === "code")).toMatchObject({ ok: false, detail: "Unexpected token" });
    const sansReponse = { ...p, code: p.code.replace('"commande.compter"', '"commande.compte"') };
    expect(codeRepondA(sansReponse.code, "compter")).toBe(false);
    expect(controlesPaquet(sansReponse, [], null).filter((c) => c.genre === "reponse")).toEqual([{ genre: "reponse", ok: false, detail: "commande.compter", commande: "compter" }]);
    const pris = { ...p, fiche: { ...p.fiche, commandes: p.fiche.commandes.map((c, i) => (i === 0 ? { ...c, raccourci: "Ctrl+Z" } : c)) } };
    expect(controlesPaquet(pris, [], null).find((c) => c.genre === "raccourcis")?.ok).toBe(false);
    const reserve = { ...p, fiche: { ...p.fiche, id: "bois" } };
    expect(controlesPaquet(reserve, [], null).at(-1)).toMatchObject({ genre: "paquet", ok: false });
    // Une autre extension installée tient déjà le raccourci.
    const autre = { ...p, fiche: { ...p.fiche, id: "autre-essai" } };
    expect(controlesPaquet(autre, [p], null).find((c) => c.genre === "raccourcis")?.ok).toBe(false);
  });

  it("brouillon tiré d'un fichier refusé : ce qui est lisible est repris, rien n'est jugé", () => {
    const p = essai();
    expect(lireBrouillonPaquet(p)).toEqual(p);
    const abime = { fiche: { id: "trames", nom: { fr: "Trames" }, permissions: ["modele.lire", "reseau"], commandes: [{ id: "tracer", raccourci: "Ctrl+Z" }] }, code: 12, pages: { "a.svg": "<svg></svg>", b: 3 } };
    const lu = lireBrouillonPaquet(abime)!;
    expect(lu.fiche).toMatchObject({ id: "trames", nom: { fr: "Trames", en: "" }, permissions: ["modele.lire"], protocole: "1.0" });
    expect(lu.fiche.commandes).toEqual([{ id: "tracer", libelle: { fr: "", en: "" }, icone: "", raccourci: "Ctrl+Z" }]);
    expect(lu.code).toBe("");
    expect(lu.pages).toEqual({ "a.svg": "<svg></svg>" });
    for (const v of [null, "texte", [], { code: "x" }]) expect(lireBrouillonPaquet(v)).toBeNull();
    // Des entrées abîmées n'atteignent pas l'éditeur : les contrôles se lisent sans erreur.
    const troue = lireBrouillonPaquet({ fiche: { id: "troue", outils: [null, 3, { id: "trait", curseur: "croix" }], panneaux: [null, { id: "p" }], abonnements: [null, "selection"] }, code: "" })!;
    expect(troue.fiche.outils).toEqual([{ id: "trait", libelle: { fr: "", en: "" }, icone: "", raccourci: "", curseur: "croix" }]);
    expect(troue.fiche.panneaux).toEqual([{ id: "p" }]);
    expect(troue.fiche.abonnements).toEqual(["selection"]);
    expect(() => controlesPaquet(troue, [], null)).not.toThrow();
  });

  it("une extension faite d'un seul outil passe les contrôles", () => {
    const p = essai();
    const outil = { ...p.fiche.commandes[0]!, id: "trait" };
    const seul = { ...p, fiche: { ...p.fiche, commandes: [], outils: [outil], permissions: [...new Set([...p.fiche.permissions, "outil" as const])] } };
    expect(controlesPaquet(seul, [], null).find((c) => c.genre === "commandes")).toMatchObject({ ok: true, detail: "1" });
    expect(controlesPaquet({ ...seul, fiche: { ...seul.fiche, outils: [] } }, [], null).find((c) => c.genre === "commandes")?.ok).toBe(false);
  });
});
