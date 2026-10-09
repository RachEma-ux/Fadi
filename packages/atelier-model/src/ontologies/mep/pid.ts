/**
 * Schéma de principe P&ID (P2-5, DA-12-16) — vue dérivée pure, jamais stockée : nœuds (équipements, vannes, raccords,
 * ports libres) et arêtes (segments) lus du modèle, dessinés en projection plan avec des symboles de schéma ; les
 * libellés portent la section, le fluide et l'état de la connectivité. Un seul fichier SVG reproductible par révision.
 */
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque } from "../../modele.js";
import { echapperXml } from "../../documents/rendu-svg.js";
import { connexions, etatConnexions, portsDe, portsLibres, portsConnexion, reseauxConnexes, type PortAbsolu } from "./connectivite.js";
import { designationReseau } from "./sections.js";
import { longueurSegment } from "./geometrie.js";

export interface NoeudPid { id: string; classe: OccurrenceQuelconque["classe"]; nom: string; x: number; y: number; libelle: string }
export interface ArretePid { id: string; nom: string; de: { x: number; y: number }; a: { x: number; y: number }; libelle: string; sens: "a-vers-b" | "b-vers-a" | "indifferent" }
export interface SchemaPid {
  noeuds: NoeudPid[];
  aretes: ArretePid[];
  portsLibres: PortAbsolu[];
  connexionsInvalides: { id: string; motifs: string[] }[];
  reseaux: ReturnType<typeof reseauxConnexes>;
}

const nomDe = (o: OccurrenceQuelconque): string => ((o.params as { nom?: string | null }).nom ?? null) || o.id;

export function schemaPid(etat: ModeleAtelier, filtre?: (o: OccurrenceQuelconque) => boolean): SchemaPid {
  const objets = (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o) => (!filtre || filtre(o))).sort((a, b) => (a.id < b.id ? -1 : 1));
  const noeuds: NoeudPid[] = [];
  const aretes: ArretePid[] = [];
  for (const o of objets) {
    switch (o.classe) {
      case "segment-reseau": {
        const s = o.params.sommets, a = s[0]!, b = s[s.length - 1]!;
        aretes.push({ id: o.id, nom: nomDe(o), de: { x: a.x, y: a.y }, a: { x: b.x, y: b.y }, libelle: `${designationReseau(o.params.section, o.params.profil)}${o.params.fluide ? ` · ${o.params.fluide}` : ""} · ${Math.round(longueurSegment(o.params) * 100) / 100} m`, sens: o.params.sens });
        break;
      }
      case "raccord-reseau":
        noeuds.push({ id: o.id, classe: o.classe, nom: nomDe(o), x: o.params.position.x, y: o.params.position.y, libelle: o.params.type });
        break;
      case "vanne":
        noeuds.push({ id: o.id, classe: o.classe, nom: nomDe(o), x: o.params.position.x, y: o.params.position.y, libelle: `${o.params.type} · ${designationReseau(o.params.section, o.params.profil)}` });
        break;
      case "equipement-reseau":
        noeuds.push({ id: o.id, classe: o.classe, nom: o.params.nom, x: o.params.position.x, y: o.params.position.y, libelle: `${o.params.type} (${o.params.categorie})` });
        break;
      default:
        break;
    }
  }
  const invalides = etatConnexions(etat).filter((c) => c.motifs.length).map((c) => ({ id: c.relation.id, motifs: c.motifs }));
  return { noeuds, aretes, portsLibres: portsLibres(etat, filtre), connexionsInvalides: invalides, reseaux: reseauxConnexes(etat) };
}

const SYMBOLES: Record<string, (x: number, y: number) => string> = {
  "raccord-reseau": (x, y) => `<circle cx="${x}" cy="${y}" r="4" fill="#fff" stroke="#1a1a1a" stroke-width="1.2"/>`,
  vanne: (x, y) => `<path d="M${x - 8},${y - 6} L${x + 8},${y + 6} L${x + 8},${y - 6} L${x - 8},${y + 6} Z" fill="#fff" stroke="#1a1a1a" stroke-width="1.2"/>`,
  "equipement-reseau": (x, y) => `<rect x="${x - 16}" y="${y - 10}" width="32" height="20" rx="3" fill="#eef3f1" stroke="#1a1a1a" stroke-width="1.2"/>`,
};

/** SVG du schéma P&ID (1000 × 700, marges), symboles de schéma, libellés, ports libres marqués, légende des réseaux. */
export function svgPid(etat: ModeleAtelier, revision: number, titre = "Schéma de principe (P&ID dérivé)"): string {
  const sch = schemaPid(etat);
  const pts = [...sch.noeuds.map((n) => [n.x, n.y]), ...sch.aretes.flatMap((a) => [[a.de.x, a.de.y], [a.a.x, a.a.y]])];
  const x0 = pts.length ? Math.min(...pts.map((p) => p[0]!)) : 0, x1 = pts.length ? Math.max(...pts.map((p) => p[0]!)) : 1;
  const y0 = pts.length ? Math.min(...pts.map((p) => p[1]!)) : 0, y1 = pts.length ? Math.max(...pts.map((p) => p[1]!)) : 1;
  const W = 1000, H = 700, M = 60;
  const S = Math.min((W - 2 * M) / Math.max(1e-6, x1 - x0), (H - 2 * M - 60) / Math.max(1e-6, y1 - y0));
  const X = (x: number) => Math.round((M + (x - x0) * S) * 10) / 10, Y = (y: number) => Math.round((H - M - 60 - (y - y0) * S) * 10) / 10;
  const parts: string[] = [];
  parts.push(`<text x="${M}" y="30" font-size="16" font-weight="600">${echapperXml(titre)}</text>`);
  parts.push(`<text x="${M}" y="48" font-size="11" fill="#4a5a55">Révision ${revision} · ${sch.reseaux.length} réseau(x) · ${sch.aretes.length} segment(s) · ${sch.noeuds.length} nœud(s) · ${sch.portsLibres.length} port(s) libre(s) · ${sch.connexionsInvalides.length} connexion(s) incompatible(s)</text>`);
  for (const a of sch.aretes) {
    // Sens b-vers-a : la flèche part du dernier sommet vers le premier (extrémités inversées).
    const inverse = a.sens === "b-vers-a";
    const ax = X(inverse ? a.a.x : a.de.x), ay = Y(inverse ? a.a.y : a.de.y), bx = X(inverse ? a.de.x : a.a.x), by = Y(inverse ? a.de.y : a.a.y);
    parts.push(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#1a1a1a" stroke-width="1.6"${a.sens === "indifferent" ? "" : ` marker-end="url(#fleche)"`} data-segment="${echapperXml(a.id)}" data-sens="${a.sens}"/>`);
    parts.push(`<text x="${(ax + bx) / 2}" y="${(ay + by) / 2 - 4}" font-size="9" text-anchor="middle" fill="#2b3a35">${echapperXml(`${a.nom} · ${a.libelle}`)}</text>`);
  }
  for (const n of sch.noeuds) {
    const x = X(n.x), y = Y(n.y);
    parts.push(`<g data-noeud="${echapperXml(n.id)}">${(SYMBOLES[n.classe] ?? SYMBOLES["raccord-reseau"]!)(x, y)}<text x="${x}" y="${y + 22}" font-size="9" text-anchor="middle">${echapperXml(`${n.nom} · ${n.libelle}`)}</text></g>`);
  }
  for (const p of sch.portsLibres) {
    const x = X(p.position.x), y = Y(p.position.y);
    parts.push(`<g data-port-libre="${echapperXml(`${p.objetId}:${p.id}`)}"><path d="M${x - 4},${y - 4} L${x + 4},${y + 4} M${x - 4},${y + 4} L${x + 4},${y - 4}" stroke="#b3261e" stroke-width="1.4"/></g>`);
  }
  const legende = sch.reseaux.map((r, i) => `<text x="${M}" y="${H - 40 + i * 12}" font-size="9" fill="#2b3a35">${echapperXml(`${r.id} : ${r.objets.length} objet(s), ${r.connexions.length} connexion(s), ${r.systemes.join(" + ")}${r.fluides.length ? ` · ${r.fluides.join(", ")}` : ""}`)}</text>`).slice(0, 3).join("");
  const invalides = sch.connexionsInvalides.map((c, i) => `<text x="${W / 2}" y="${H - 40 + i * 12}" font-size="9" fill="#b3261e">${echapperXml(`${c.id} : ${c.motifs.join(" ; ")}`)}</text>`).slice(0, 3).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif" data-pid data-revision="${revision}">
<defs><marker id="fleche" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#1a1a1a"/></marker></defs>
<rect width="${W}" height="${H}" fill="#fff"/>
${parts.join("\n")}
${legende}${invalides}
<text x="${M}" y="${H - 8}" font-size="9" fill="#4a5a55">Vue dérivée du modèle (symboles de schéma, projection plan) ; les ports libres sont marqués d'une croix ; aucune valeur de débit ni de pression n'est évaluée.</text>
</svg>
`;
}

export { connexions, portsDe, portsConnexion };
export type { Occurrence };
