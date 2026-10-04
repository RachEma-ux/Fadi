/**
 * Empreinte reproductible d'un ensemble d'entrées (FNV-1a 64 bits sur une sérialisation à clés triées) : mêmes
 * entrées, même empreinte, dans le navigateur comme sur le serveur. Sert à la fraîcheur des documents dérivés
 * (cahier §5.9 : chaque vue porte ses objets référencés, sa révision et son empreinte).
 */

/** Sérialisation JSON à clés triées (les objets du modèle n'ont pas d'ordre de clés garanti). */
export function serialisationStable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(serialisationStable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${serialisationStable(o[k])}`)
    .join(",")}}`;
}

/** FNV-1a 64 bits (deux moitiés de 32 bits), en hexadécimal sur 16 caractères. */
export function empreinte(texte: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c * 31 + (h1 & 0xff)) & 0xffff), 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export const empreinteDe = (v: unknown): string => empreinte(serialisationStable(v));
