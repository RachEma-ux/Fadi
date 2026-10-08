/**
 * Béton déclaré (P2-3, coulages) — pur. Un élément n'entre dans un coulage que si son béton est déclaré : `materiau =
 * beton` d'une poutre ou d'une plaque, propriété « materiau » commençant par « béton » d'un poteau ou d'une dalle.
 * Rien n'est déduit de la classe (R3).
 */
import type { OccurrenceQuelconque } from "../../modele.js";

export function estBetonDeclare(o: OccurrenceQuelconque): boolean {
  const norm = (v: unknown) => (typeof v === "string" ? v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim() : "");
  if (o.classe === "poutre" || o.classe === "plaque") return o.params.materiau === "beton";
  return norm(o.proprietes["materiau"]?.valeur).startsWith("beton");
}
