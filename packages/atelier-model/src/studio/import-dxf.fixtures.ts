/**
 * Fabrique de petits DXF ASCII (CRLF) pour les tests de `lireDxfStudio` : chaque fixture est écrite en clair dans le
 * test qui l'utilise. Pas exportée par le paquet.
 */
const crlf = (...lignes: (string | number)[]): string => lignes.map(String).join("\r\n");

/** LINE sur un calque ; `extra` = paires code / valeur ajoutées (Z, espace papier, direction d'extrusion…). */
export function ligne(x1: number, y1: number, x2: number, y2: number, calque = "0", extra: string[] = []): string {
  return crlf(0, "LINE", 8, calque, 10, x1, 20, y1, 11, x2, 21, y2, ...extra);
}

export function lwpolyligne(pts: [number, number][], o: { ferme?: boolean; calque?: string; bulges?: number[] } = {}): string {
  const sommets = pts.flatMap(([x, y], i) => [10, x, 20, y, ...(o.bulges?.[i] ? [42, o.bulges[i]!] : [])]);
  return crlf(0, "LWPOLYLINE", 8, o.calque ?? "0", 90, pts.length, 70, o.ferme ? 1 : 0, ...sommets);
}

/** POLYLINE R12 : en-tête, VERTEX, SEQEND ; `flags` = code 70 (1 fermée, 4 lissée, 8 3D…). */
export function polyligne(pts: [number, number][], o: { flags?: number; calque?: string } = {}): string {
  const calque = o.calque ?? "0";
  return crlf(0, "POLYLINE", 8, calque, 66, 1, 10, 0, 20, 0, 30, 0, 70, o.flags ?? 0,
    ...pts.flatMap(([x, y]) => [0, "VERTEX", 8, calque, 10, x, 20, y, 30, 0]), 0, "SEQEND", 8, calque);
}

export function table(calques: { nom: string; flags?: number; couleur?: number }[]): string {
  return crlf(0, "TABLE", 2, "LAYER", 70, calques.length, ...calques.flatMap((c) => [0, "LAYER", 2, c.nom, 70, c.flags ?? 0, 62, c.couleur ?? 7, 6, "CONTINUOUS"]), 0, "ENDTAB");
}

export function entete(variables: Record<string, [number, string]>): string[] {
  return Object.entries(variables).flatMap(([nom, [code, v]]) => [crlf(9, nom, code, v)]);
}

/** DXF complet : en-tête ($INSUNITS si fourni), tables, sections libres, entités, EOF. */
export function dxf(o: { insunits?: number; entete?: string[]; tables?: string[]; avant?: string[]; entites: string[] }): string {
  const tete = [...(o.entete ?? []), ...(o.insunits === undefined ? [] : [crlf(9, "$INSUNITS", 70, o.insunits)])];
  const parties = [
    crlf(0, "SECTION", 2, "HEADER"), ...tete, crlf(0, "ENDSEC"),
    crlf(0, "SECTION", 2, "TABLES"), ...(o.tables ?? []), crlf(0, "ENDSEC"),
    ...(o.avant ?? []),
    crlf(0, "SECTION", 2, "ENTITIES"), ...o.entites, crlf(0, "ENDSEC"),
    crlf(0, "EOF"),
  ];
  return parties.join("\r\n") + "\r\n";
}
