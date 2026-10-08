/**
 * Assemblages soudés (P2-3, DA-10-10 « weldments ») — pur. Un assemblage soudé est une composante connexe du graphe
 * « élément — soudure — élément » : il n'est pas un objet mais une lecture dérivée (nomenclature, IFC
 * IfcElementAssembly .WELDED.). Ordre déterministe : composantes nommées par leur plus petit identifiant d'élément.
 */
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque } from "../../modele.js";

export interface AssemblageSoude {
  id: string;
  elements: string[];
  soudures: string[];
  /** Longueur totale de cordon (m). */
  longueur: number;
}

export function assemblagesSoudes(etat: ModeleAtelier): AssemblageSoude[] {
  const soudures = (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o): o is Occurrence<"soudure"> => o.classe === "soudure").sort((a, b) => (a.id < b.id ? -1 : 1));
  const parent = new Map<string, string>();
  const racine = (x: string): string => { let r = x; while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  const unir = (a: string, b: string) => { const ra = racine(a), rb = racine(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
  for (const s of soudures) { if (!parent.has(s.params.a)) parent.set(s.params.a, s.params.a); if (!parent.has(s.params.b)) parent.set(s.params.b, s.params.b); unir(s.params.a, s.params.b); }
  const groupes = new Map<string, AssemblageSoude>();
  for (const el of [...parent.keys()].sort()) {
    const r = racine(el);
    const g = groupes.get(r) ?? { id: `soude:${r}`, elements: [], soudures: [], longueur: 0 };
    g.elements.push(el);
    groupes.set(r, g);
  }
  for (const s of soudures) {
    const g = groupes.get(racine(s.params.a))!;
    g.soudures.push(s.id);
    g.longueur += s.params.longueur.value;
  }
  return [...groupes.values()].map((g) => ({ ...g, longueur: Math.round(g.longueur * 1000) / 1000 })).sort((a, b) => (a.id < b.id ? -1 : 1));
}
