/**
 * IF-010 (correctif revue PR #330) : un `.bcfzip` aux entrées DEFLATE (méthode 8, la forme courante des outils BCF) se
 * lit côté serveur avec le décompresseur borné ; une bombe de décompression est refusée. L'archive compressée est
 * construite ici avec `zlib.deflateRawSync`.
 */
import { describe, expect, it } from "vitest";
import { lireZip, studioExporterBcf, studioLireBcf, studioSujetsBcf } from "@parcours/atelier-model";
import { inflateBcfBorne } from "./studio-bcf-inflate.js";
import { bcfCompresse, zipDeflate } from "../testing/bcf-compresse.js";

describe("IF-010 — archive BCF compressée (DEFLATE)", () => {
  it("IF-010 [+] .bcfzip aux entrées DEFLATE : lu avec le décompresseur borné (même sujet, même Guid que l'archive stockée)", async () => {
    const archive = await bcfCompresse("P");
    // Toutes les entrées de l'archive sont compressées (méthode 8 dans chaque en-tête local).
    expect(new DataView(archive.buffer, archive.byteOffset).getUint16(8, true)).toBe(8);
    // Sans décompresseur, le modèle pur refuse (comportement d'avant le correctif).
    await expect(studioLireBcf(archive)).rejects.toThrow(/compressée sans décompresseur/);
    const lu = await studioLireBcf(archive, inflateBcfBorne());
    expect(lu.sujets.map((s) => s.titre)).toEqual(["Sujet compressé"]);
    const stocke = await studioLireBcf(studioExporterBcf(studioSujetsBcf([{ issueId: "x1", titre: "Sujet compressé", description: "Constat", statut: "Open", categorie: "coordination", gravite: "majeure", creeLe: "2026-10-25T08:00:00.000Z", auteur: "a@x", responsable: null, objets: [], journal: [] }]), { id: "P", nom: "P" }));
    expect([lu.projetId, lu.sujets.map((s) => s.guid)]).toEqual([stocke.projetId, stocke.sujets.map((s) => s.guid)]);
  });

  it("IF-010 [−] bombe de décompression : entrée ou archive au-delà de la borne refusée, rien n'est rendu", async () => {
    const zeros = new Uint8Array(4 * 1024 * 1024);
    const bombe = zipDeflate([{ nom: "bcf.version", octets: zeros }]);
    expect(bombe.byteLength).toBeLessThan(64 * 1024);
    await expect(lireZip(bombe, inflateBcfBorne(1024 * 1024, 8 * 1024 * 1024))).rejects.toThrow(/au-delà de la borne/);
    const deux = zipDeflate([{ nom: "a", octets: zeros }, { nom: "b", octets: zeros }]);
    await expect(lireZip(deux, inflateBcfBorne(8 * 1024 * 1024, 6 * 1024 * 1024))).rejects.toThrow(/au-delà/);
    expect((await lireZip(deux, inflateBcfBorne(8 * 1024 * 1024, 8 * 1024 * 1024))).map((f) => f.octets.byteLength)).toEqual([zeros.byteLength, zeros.byteLength]);
  });
});
