/** Panneau d'une extension (lot 4) : page composée, messages de la page, envois de l'extension. */
import { describe, expect, it } from "vitest";
import { BORNES_PANNEAU, CSP_PAGE_PANNEAU, composerPagePanneau, creerExecutantExtension, donneesPanneau, jugerDemandeExtension, lireEnvoiPanneau, lireMessagePagePanneau, nomAppelPanneau, lireMessageProtocole, demandeProtocole, type MessageProtocole } from "./index.js";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';
const paquet = (page: string, pages: Record<string, string> = {}) => ({
  fiche: { panneaux: [{ id: "reglages", titre: { fr: "Réglages", en: "Settings" }, page: "reglages.html", icone: "reglages.svg" }] },
  pages: { "reglages.html": page, "reglages.svg": SVG, ...pages },
}) as unknown as Parameters<typeof composerPagePanneau>[0];

describe("page du panneau", () => {
  it("la règle « aucun réseau » et le pont précèdent la page ; la langue est donnée", () => {
    const doc = composerPagePanneau(paquet("<p>Bonjour</p>"), "reglages", "en")!;
    expect(doc.startsWith('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(doc).toContain(`content="${CSP_PAGE_PANNEAU}"`);
    expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("window.fadi="));
    expect(doc.indexOf("window.fadi=")).toBeLessThan(doc.indexOf("<p>Bonjour</p>"));
    expect(doc).toContain('langue:"en"');
    expect(CSP_PAGE_PANNEAU).toContain("default-src 'none'");
    expect(CSP_PAGE_PANNEAU).not.toMatch(/https?:|connect-src [^']/);
    expect(composerPagePanneau(paquet("<p>x</p>"), "absent", "fr")).toBeNull();
  });

  it("styles, scripts et dessins du paquet sont recopiés ; une adresse d'ailleurs reste lettre morte", () => {
    const page = '<link rel="stylesheet" href="page.css"><link rel="stylesheet" href="https://exemple.test/x.css"><img src="logo.svg"><img src="https://exemple.test/y.svg"><script src="page.js"></script><script src="https://exemple.test/z.js"></script>';
    const doc = composerPagePanneau(paquet(page, { "page.css": "p{color:red}</style><b>", "page.js": 'fadi.action("etat");//</script>', "logo.svg": SVG }), "reglages", "fr")!;
    expect(doc).toContain("<style>p{color:red}<\\/style><b></style>");
    expect(doc).toContain('<script>fadi.action("etat");//<\\/script></script>');
    expect(doc).toContain(`<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}">`);
    // La feuille d'ailleurs est retirée ; l'image et le script d'ailleurs restent écrits, mais la règle les bloque.
    expect(doc).not.toContain("exemple.test/x.css");
    expect(doc).toContain('<img src="https://exemple.test/y.svg">');
  });
});

describe("messages de la page", () => {
  it("action : nom simple, numéro, données en JSON bornées", () => {
    expect(lireMessagePagePanneau({ fadi: "action", id: 3, nom: "poser", donnees: { h: 1 } })).toEqual({ sorte: "action", id: 3, nom: "poser", donnees: { h: 1 } });
    expect(lireMessagePagePanneau({ fadi: "action", id: 3, nom: "poser" })).toMatchObject({ donnees: null });
    for (const nom of ["", "Poser", "a.b", "x".repeat(BORNES_PANNEAU.action + 1), 4]) expect(lireMessagePagePanneau({ fadi: "action", id: 1, nom })).toBeNull();
    expect(lireMessagePagePanneau({ fadi: "action", id: -1, nom: "poser" })).toBeNull();
    expect(lireMessagePagePanneau({ fadi: "action", id: 1, nom: "poser", donnees: "x".repeat(BORNES_PANNEAU.donnees) })!).toMatchObject({ donnees: undefined });
    expect(lireMessagePagePanneau("action")).toBeNull();
    expect(lireMessagePagePanneau({ fadi: "autre" })).toBeNull();
  });

  it("hauteur : bornée", () => {
    expect(lireMessagePagePanneau({ fadi: "hauteur", px: 320.2 })).toEqual({ sorte: "hauteur", px: 321 });
    expect(lireMessagePagePanneau({ fadi: "hauteur", px: 1e9 })).toEqual({ sorte: "hauteur", px: BORNES_PANNEAU.hauteurMax });
    expect(lireMessagePagePanneau({ fadi: "hauteur", px: 0 })).toEqual({ sorte: "hauteur", px: BORNES_PANNEAU.hauteurMin });
    expect(lireMessagePagePanneau({ fadi: "hauteur", px: "12" })).toBeNull();
  });

  it("le nom de l'appel est un nom de message du protocole", () => {
    expect(nomAppelPanneau("reglages", "poser")).toBe("panneau.reglages.poser");
    expect(lireMessageProtocole(demandeProtocole(1, nomAppelPanneau("a".repeat(40), "b".repeat(BORNES_PANNEAU.action))!))).not.toBeNull();
    expect(nomAppelPanneau("reglages", "a.b")).toBeNull();
    expect(nomAppelPanneau("reglages", 3)).toBeNull();
  });
});

describe("demandes de l'extension", () => {
  const fiche = { panneaux: [{ id: "reglages", titre: { fr: "R", en: "S" }, page: "reglages.html", icone: "reglages.svg" }] };

  it("envoyer et ouvrir : un panneau de la fiche, des données qui passent", () => {
    expect(lireEnvoiPanneau(fiche, { panneau: "reglages", donnees: { n: 2 } })).toEqual({ ok: true, panneau: "reglages", donnees: { n: 2 } });
    expect(lireEnvoiPanneau(fiche, { panneau: "reglages" })).toEqual({ ok: true, panneau: "reglages", donnees: null });
    expect(lireEnvoiPanneau(fiche, { panneau: "autre" })).toMatchObject({ ok: false });
    expect(lireEnvoiPanneau(fiche, { panneau: "reglages", donnees: "x".repeat(BORNES_PANNEAU.donnees) })).toMatchObject({ ok: false });
    expect(donneesPanneau(() => 1)).toBeUndefined();
  });

  it("permission « panneau » exigée", () => {
    expect(jugerDemandeExtension({ permissions: ["panneau"] }, "panneau.envoyer")).toEqual({ ok: true });
    expect(jugerDemandeExtension({ permissions: [] }, "panneau.ouvrir")).toMatchObject({ ok: false, erreur: "permission_refusee", detail: "panneau" });
  });

  it("planche.panneau : sur, envoyer, ouvrir", async () => {
    const postes: MessageProtocole[] = [];
    const code = 'planche.panneau.sur("reglages", "poser", async (d) => { await planche.panneau.envoyer("reglages", { recu: d }); return "fait"; });';
    const x = creerExecutantExtension({ fiche: { id: "essai", version: "1.0.0" }, code }, (m) => postes.push(m));
    expect(x.demarrer()).toBeNull();
    x.recevoir(demandeProtocole(7, "panneau.reglages.poser", { h: 1 }));
    expect(postes[0]).toMatchObject({ sorte: "demande", nom: "panneau.envoyer", donnees: { panneau: "reglages", donnees: { recu: { h: 1 } } } });
    x.recevoir({ protocole: postes[0]!.protocole, sorte: "reponse", id: postes[0]!.id, ok: true, resultat: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(postes[1]).toMatchObject({ sorte: "reponse", id: 7, ok: true, resultat: "fait" });
    const refus = creerExecutantExtension({ fiche: { id: "essai", version: "1.0.0" }, code: 'planche.panneau.sur("Réglages", "poser", () => 1);' }, () => {});
    expect(refus.demarrer()).toMatchObject({ genre: "execution" });
  });
});
