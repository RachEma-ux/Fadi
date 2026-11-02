/** Aides de test : archive ZIP aux entrées DEFLATE (méthode 8) construite avec `zlib.deflateRawSync` (IF-010). */
import { crc32, deflateRawSync } from "node:zlib";
import { lireZip, studioExporterBcf, studioSujetsBcf } from "@parcours/atelier-model";

/** Archive ZIP dont chaque entrée est compressée DEFLATE (méthode 8). */
export function zipDeflate(fichiers: readonly { nom: string; octets: Uint8Array }[]): Uint8Array {
  const locaux: Buffer[] = [], centraux: Buffer[] = [];
  let decalage = 0;
  for (const f of fichiers) {
    const nom = Buffer.from(f.nom, "utf8");
    const comp = deflateRawSync(f.octets);
    const crc = crc32(f.octets);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0x0800, 6); l.writeUInt16LE(8, 8);
    l.writeUInt32LE(crc, 14); l.writeUInt32LE(comp.byteLength, 18); l.writeUInt32LE(f.octets.byteLength, 22); l.writeUInt16LE(nom.byteLength, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.byteLength, 20); c.writeUInt32LE(f.octets.byteLength, 24); c.writeUInt16LE(nom.byteLength, 28);
    c.writeUInt32LE(decalage, 42);
    locaux.push(l, nom, comp); centraux.push(c, nom);
    decalage += 30 + nom.byteLength + comp.byteLength;
  }
  const central = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(fichiers.length, 8); fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(central.byteLength, 12); fin.writeUInt32LE(decalage, 16);
  return new Uint8Array(Buffer.concat([...locaux, central, fin]));
}

/** Notre export BCF (entrées stockées) recompressé en DEFLATE. */
export async function bcfCompresse(projet: string): Promise<Uint8Array> {
  const stocke = studioExporterBcf(studioSujetsBcf([{ issueId: "x1", titre: "Sujet compressé", description: "Constat", statut: "Open", categorie: "coordination", gravite: "majeure", creeLe: "2026-10-25T08:00:00.000Z", auteur: "a@x", responsable: null, objets: [], journal: [] }]), { id: projet, nom: projet });
  return zipDeflate(await lireZip(stocke));
}
