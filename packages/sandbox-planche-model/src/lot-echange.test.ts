import { describe, expect, it } from "vitest";
import { sha256Hex } from "./empreinte.js";
import { apercuManifeste, ecrireLot, enregistrerJeu, manifesteLot, nomArchive, nomCourtJeu, nomSortie, noterLot, type FichierLot } from "./lot-echange.js";
import { lireRegistreVersions, registreVide, serialiserRegistreVersions } from "./versions-l7.js";

const DATE = new Date("2026-11-28T11:10:00Z");
const o = { jeu: "DCE lot 02", planche: "Maison Dupuis", empreinteModele: "7f3a91c0aaaaaaaa2c21", destinataire: "bureau d'ingénieurs", date: DATE };
const f = (sortie: FichierLot["sortie"], suffixe: string, texte: string): FichierLot => ({ sortie, nom: nomSortie(o.planche, o.jeu, suffixe), donnees: new TextEncoder().encode(texte), details: `essai ${sortie}` });

describe("lot d'échange daté (cas 4, lot C4, étape 7e)", () => {
  it("noms : jeu court, sorties et archive datée en heure suisse", () => {
    expect(nomCourtJeu("DCE lot 02")).toBe("DCE02");
    expect(nomCourtJeu("Permis")).toBe("Permis");
    expect(nomSortie("Maison Dupuis", "DCE lot 02", "modele.ifc")).toBe("Maison-Dupuis-DCE02-modele.ifc");
    expect(nomArchive("Maison Dupuis", "DCE lot 02", DATE)).toBe("Maison-Dupuis-DCE02-2026-11-28.zip");
    expect(nomArchive("Maison Dupuis", "Permis", new Date("2026-11-28T23:30:00Z"))).toBe("Maison-Dupuis-Permis-2026-11-29.zip");
  });

  it("manifeste : en-tête, empreinte entière de chaque sortie et de chaque rapport", () => {
    const fichiers = [f("ifc", "modele.ifc", "ISO-10303-21;"), f("csv", "debit.csv", "a;b\n")];
    const m = manifesteLot(fichiers, o);
    expect(m.split("\n")[0]).toBe("Lot « DCE lot 02 » · émis le 28.11.2026 à 12 h 10");
    expect(m).toContain("Planche « Maison Dupuis » · empreinte du modèle 7f3a 91c0 … 2c21");
    expect(m).toContain("Destinataire : bureau d'ingénieurs");
    expect(m).toContain(`Maison-Dupuis-DCE02-modele.ifc`);
    expect(m).toContain(sha256Hex("ISO-10303-21;"));
    expect(m).toContain("rapports/Maison-Dupuis-DCE02-debit.csv.txt");
    expect(manifesteLot(fichiers, o)).toBe(m);
    expect(manifesteLot(fichiers, { ...o, destinataire: " " })).toContain("Destinataire : non renseigné");
  });

  it("aperçu : empreintes abrégées et rapports résumés, comme la maquette", () => {
    const a = apercuManifeste([{ nom: "Maison-Dupuis-DCE02-modele.ifc", empreinte: "3b1e00009a40" }, { nom: "Maison-Dupuis-DCE02-debit.csv", empreinte: null }], o);
    expect(a).toContain("Destinataire : bureau d'ingénieurs (saisi)");
    expect(a).toContain("3b1e … 9a40");
    expect(a).toContain("à l'émission");
    expect(a.trimEnd().endsWith("2 fichiers")).toBe(true);
  });

  it("archive : sorties, rapports et manifeste ; refus nommés ; reproductible", () => {
    const fichiers = [f("ifc", "modele.ifc", "x"), f("pdf", "feuilles.pdf", "%PDF")];
    const r = ecrireLot(fichiers, o);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lot.archive).toBe("Maison-Dupuis-DCE02-2026-11-28.zip");
    expect(r.lot.fichiers).toBe(5);
    expect(r.lot.empreinteManifeste).toBe(sha256Hex(r.lot.manifeste));
    const texte = new TextDecoder().decode(r.lot.octets);
    for (const n of ["Maison-Dupuis-DCE02-modele.ifc", "rapports/Maison-Dupuis-DCE02-feuilles.pdf.txt", "manifeste.txt"]) expect(texte).toContain(n);
    expect(ecrireLot(fichiers, o)).toEqual(r);
    expect(ecrireLot([], o)).toEqual({ ok: false, erreur: "aucune-sortie" });
    expect(ecrireLot(fichiers, { ...o, jeu: "  " })).toEqual({ ok: false, erreur: "jeu-sans-nom" });
    expect(ecrireLot([fichiers[0]!, fichiers[0]!], o)).toEqual({ ok: false, erreur: "noms-en-double" });
  });

  it("registre : jeux enregistrés par nom, lots en tête, relus après sérialisation ; ancien registre lisible", () => {
    let r = enregistrerJeu(registreVide(), { id: "j1", nom: "Permis", sorties: ["pdf"] });
    r = enregistrerJeu(r, { id: "j2", nom: " DCE  lot 02 ", sorties: ["ifc", "dxf", "pdf", "csv"] });
    r = enregistrerJeu(r, { id: "j3", nom: "Permis", sorties: ["pdf", "png"] });
    expect(r.jeux!.map((j) => [j.nom, j.sorties.join(",")])).toEqual([["DCE lot 02", "ifc,dxf,pdf,csv"], ["Permis", "pdf,png"]]);
    r = noterLot(r, { id: "l1", date: "2026-11-21T15:02:00Z", jeu: "Permis", destinataire: "commune", archive: "a.zip", manifeste: "19bf", fichiers: 3 });
    r = noterLot(r, { id: "l2", date: DATE.toISOString(), jeu: "DCE lot 02", destinataire: "  ", archive: "b.zip", manifeste: "a4d2", fichiers: 9 });
    expect(r.lots!.map((l) => [l.id, l.destinataire])).toEqual([["l2", null], ["l1", "commune"]]);
    expect(lireRegistreVersions(serialiserRegistreVersions(r))).toEqual(r);
    const ancien = JSON.stringify({ format: "fadi-planche-versions/1", jalons: [], emissions: [] });
    expect(lireRegistreVersions(ancien)).toEqual(registreVide());
    expect(serialiserRegistreVersions(registreVide())).toBe(ancien);
  });
});
