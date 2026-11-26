/** Extensions installées (protocole 1.0, lot 3) : règles d'import d'un paquet et relecture de la liste reçue. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleCommandeExtension, estDessinSvg, idBarreExtension, imageIcone, jugerImportPaquet, lirePaquetsInstalles, nomAppelCommande } from "./extensions-installees.js";
import type { PaquetExtension } from "./protocole-extensions.js";

const lire = (nom: string): unknown => JSON.parse(readFileSync(new URL(`../../../apps/web/e2e/donnees/${nom}.fadi-addon.json`, import.meta.url), "utf8"));
const essai = (): PaquetExtension => lire("essai-commandes") as PaquetExtension;
/** Copie du paquet d'essai, modifiée. */
const avec = (f: (p: { fiche: { id: string; commandes: { id: string; icone: string; raccourci: string }[] }; pages: Record<string, string> }) => void): unknown => {
  const p = JSON.parse(JSON.stringify(essai()));
  f(p);
  return p;
};

describe("import d'un paquet d'extension", () => {
  it("le paquet d'essai du lot 3 est admis, et rendu tel quel", () => {
    const j = jugerImportPaquet(essai());
    expect(j).toMatchObject({ ok: true });
    if (j.ok) expect(j.paquet.fiche.commandes.map((c) => c.id)).toEqual(["poser-boite", "boite-sur-mesure", "compter", "trainer", "echouer"]);
  });

  it("la forme du paquet est jugée d'abord : le motif du protocole est rendu", () => {
    expect(jugerImportPaquet("paquet")).toMatchObject({ ok: false, erreur: "forme_invalide" });
    expect(jugerImportPaquet(avec((p) => void ((p as unknown as { format: string }).format = "fadi-addon/9")))).toMatchObject({ ok: false, erreur: "version_non_prise_en_charge" });
  });

  it("l'identifiant d'une extension livrée par Fadi est réservé", () => {
    expect(jugerImportPaquet(avec((p) => void (p.fiche.id = "bois")))).toMatchObject({ ok: false, erreur: "identifiant_reserve" });
  });

  it("raccourci : modificateur ou touche de fonction, jamais pris par la Planche, le navigateur ou une autre extension", () => {
    const raccourci = (r: string) => jugerImportPaquet(avec((p) => void (p.fiche.commandes[0]!.raccourci = r)));
    for (const r of ["G", "Maj+G", "9"]) expect(raccourci(r), r).toMatchObject({ ok: false, erreur: "raccourci_refuse" });
    // Ctrl+G : Grouper (registre) ; Ctrl+Z : annuler (Planche) ; Ctrl+P : impression (navigateur) ; F8 : Zoom avant.
    for (const r of ["Ctrl+G", "Ctrl+Z", "Ctrl+P", "F8", "Maj+S"]) {
      const j = raccourci(r);
      expect(j, r).toMatchObject({ ok: false, erreur: "raccourci_refuse" });
      if (!j.ok) expect(j.detail, r).toContain(r);
    }
    for (const r of ["Alt+Maj+F8", "Ctrl+Alt+9", "Alt+F5"]) expect(raccourci(r).ok, r).toBe(true);
    // Une autre extension installée tient déjà Alt+Maj+F2 ; la même extension, réimportée, se remplace.
    const autre = avec((p) => void (p.fiche.id = "autre")) as PaquetExtension;
    expect(jugerImportPaquet(essai(), [autre])).toMatchObject({ ok: false, erreur: "raccourci_refuse" });
    expect(jugerImportPaquet(essai(), [essai()])).toMatchObject({ ok: true });
  });

  it("icône : un dessin SVG du paquet, dans un fichier .svg", () => {
    expect(jugerImportPaquet(avec((p) => void (p.pages["poser-boite.svg"] = "<html><script>1</script></html>")))).toMatchObject({ ok: false, erreur: "icone_invalide" });
    expect(jugerImportPaquet(avec((p) => {
      p.pages["icone.txt"] = p.pages["poser-boite.svg"]!;
      p.fiche.commandes[0]!.icone = "icone.txt";
    }))).toMatchObject({ ok: false, erreur: "icone_invalide" });
    expect(estDessinSvg('<?xml version="1.0"?>\n<svg viewBox="0 0 1 1"></svg>\n')).toBe(true);
    expect(estDessinSvg("<svg>")).toBe(false);
  });

  it("les paquets d'essai des lots 1 et 2 passent aussi les règles d'import", () => {
    for (const nom of ["essai-socle", "essai-modele"]) expect(jugerImportPaquet(lire(nom)), nom).toMatchObject({ ok: true });
  });
});

describe("relecture de la liste reçue du serveur", () => {
  it("garde les paquets valides dans l'ordre, écarte les autres et les doublons", () => {
    const autre = avec((p) => {
      p.fiche.id = "autre";
      p.fiche.commandes.forEach((c, i) => void (c.raccourci = `Ctrl+Alt+${i + 1}`));
    });
    const conflit = avec((p) => void (p.fiche.id = "conflit"));
    expect(lirePaquetsInstalles([essai(), { format: "x" }, autre, essai(), conflit, null]).map((p) => p.fiche.id)).toEqual(["essai-commandes", "autre"]);
    expect(lirePaquetsInstalles("rien")).toEqual([]);
    expect(lirePaquetsInstalles(undefined)).toEqual([]);
  });
});

describe("noms et images", () => {
  it("clés, barre, appel et image d'icône", () => {
    expect(cleCommandeExtension("essai-commandes", "compter")).toBe("extension:essai-commandes:compter");
    expect(idBarreExtension("essai-commandes")).toBe("extension:essai-commandes");
    expect(nomAppelCommande("compter")).toBe("commande.compter");
    const image = imageIcone(essai(), "compter.svg");
    expect(image).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    expect(decodeURIComponent(image!.split(",")[1]!)).toBe(essai().pages["compter.svg"]);
    expect(imageIcone(essai(), "absente.svg")).toBeNull();
  });
});
