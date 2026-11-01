/**
 * Revue des rattachements territoriaux des prix (Concept Prix v1.1 §3 et §5, Plan §6 « Review ») : une file unique
 * `a-revoir` et des décisions revues, jamais automatiques.
 *
 * Trois cibles :
 * - `observation` : rattachement ambigu ou absent d'une observation d'annonce ; une décision validée choisit un
 *   territoire de la hiérarchie en base, **jamais plus fin que la précision déclarée par la source** (PRX06) ;
 * - `zone` : attribution d'une zone officielle (décrite en texte ou dessinée) à un territoire (Concept §3 : un réviseur
 *   approuve l'interprétation spatiale) ;
 * - `libelle` : libellé de localité publié par un tiers et non rattaché (ex. quartier commercial FeenWay) ; une décision
 *   validée enregistre une **correspondance revue** libellé → unité administrative (Concept §5). La ligne publiée reste
 *   telle quelle (code nul) ; la correspondance est servie à côté, avec son auteur, sa date et l'édition du découpage.
 * Chaque décision est conservée en ajout seul (`geodata_prix_decisions_rattachement`) et journalisée ; la plus récente
 * l'emporte. Ce module n'ouvre ni pool ni transaction : l'appelant les fournit.
 */
import { normaliserLibelleLocalite, precisionSuffisante } from "@parcours/geodata-model";
import type { Executeur } from "../archive-fichiers.js";
import { ErreurPrix } from "./pipeline.js";

export type CibleRevue = "observation" | "zone" | "libelle";

/** Identifiant d'un élément de la file : `observation:<id>`, `zone:<id>` ou `libelle:<source>:<clé base64url>`. */
export const idLibelle = (source: string, ville: string, libelle: string) =>
  `libelle:${source}:${Buffer.from(JSON.stringify([normaliserLibelleLocalite(ville), normaliserLibelleLocalite(libelle)]), "utf8").toString("base64url")}`;

export function lireIdRevue(id: string): { cible: "observation"; observationId: string } | { cible: "zone"; zoneId: string } | { cible: "libelle"; source: string; ville: string; libelle: string } | null {
  const m = /^(observation|zone|libelle):(.{1,400})$/.exec(id);
  if (!m) return null;
  if (m[1] === "observation") return /^\d{1,18}$/.test(m[2]!) ? { cible: "observation", observationId: m[2]! } : null;
  if (m[1] === "zone") return /^[A-Za-z0-9_-]{1,80}$/.test(m[2]!) ? { cible: "zone", zoneId: m[2]! } : null;
  const n = /^([a-z0-9][a-z0-9-]{1,79}):([A-Za-z0-9_-]{1,300})$/.exec(m[2]!);
  if (!n) return null;
  try {
    const [ville, libelle] = JSON.parse(Buffer.from(n[2]!, "base64url").toString("utf8")) as unknown[];
    if (typeof ville !== "string" || typeof libelle !== "string" || !ville || !libelle) return null;
    return { cible: "libelle", source: n[1]!, ville, libelle };
  } catch { return null; }
}

/** Libellés publiés non rattachés des éditions consultables d'une source autorisée (lignes brutes, normalisées en JS). */
async function libellesNonRattaches(ex: Executeur) {
  const lignes = (await ex.query<{ source: string; ville: string; libelle: string; niveau: string; version_id: string; n: string }>(
    `SELECT ps.cle AS source, a.ville, a.libelle_geo AS libelle, a.niveau_geo AS niveau, a.version_id, count(*) AS n
       FROM geodata_prix_agregats_publies a JOIN geodata_versions v ON v.id = a.version_id JOIN geodata_sources s ON s.id = v.source_id
       JOIN geodata_prix_sources ps ON ps.fiche_geodata = s.cle AND ps.statut IN ('active', 'autorisee')
      WHERE a.code_rattache IS NULL AND v.etat = 'publiee' AND v.espace_id IS NULL AND v.droits->>'consultation' = 'autorise'
      GROUP BY ps.cle, a.ville, a.libelle_geo, a.niveau_geo, a.version_id ORDER BY ps.cle, a.ville, a.libelle_geo, a.version_id`,
  )).rows;
  const parId = new Map<string, { id: string; source: string; ville: string; libelle: string; niveau: string; versions: string[]; lignes: number }>();
  for (const l of lignes) {
    const id = idLibelle(l.source, l.ville, l.libelle);
    const x = parId.get(id) ?? { id, source: l.source, ville: l.ville, libelle: l.libelle, niveau: l.niveau, versions: [], lignes: 0 };
    if (!x.versions.includes(l.version_id)) x.versions.push(l.version_id);
    x.lignes += Number(l.n);
    parId.set(id, x);
  }
  return [...parId.values()];
}

export interface Correspondance { readonly decision: "validee" | "refusee"; readonly pays: string | null; readonly code: string | null; readonly niveau: string | null; readonly decoupage: string | null; readonly le: string; readonly motif: string }

/** Dernière décision de chaque libellé (source, ville et libellé normalisés). */
export async function correspondancesLibelles(ex: Executeur, sources?: readonly string[]): Promise<Map<string, Correspondance>> {
  const d = (await ex.query<{ source_cle: string; ville_normalisee: string; libelle_normalise: string; decision: "validee" | "refusee"; pays: string | null; territoire_code: string | null; territoire_niveau: string | null; decoupage: string | null; le: string; motif: string }>(
    `SELECT DISTINCT ON (source_cle, ville_normalisee, libelle_normalise) source_cle, ville_normalisee, libelle_normalise, decision, pays, territoire_code, territoire_niveau, decoupage,
            to_char(decide_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS le, motif
       FROM geodata_prix_decisions_rattachement WHERE cible = 'libelle' AND ($1::text[] IS NULL OR source_cle = ANY($1))
      ORDER BY source_cle, ville_normalisee, libelle_normalise, decide_le DESC, id DESC`, [sources ?? null],
  )).rows;
  return new Map(d.map((x) => [
    `libelle:${x.source_cle}:${Buffer.from(JSON.stringify([x.ville_normalisee, x.libelle_normalise]), "utf8").toString("base64url")}`,
    { decision: x.decision, pays: x.pays, code: x.territoire_code, niveau: x.territoire_niveau, decoupage: x.decoupage, le: x.le, motif: x.motif },
  ]));
}

/** File de revue : éléments `a-revoir` des trois cibles (au plus `limite` par cible). */
export async function fileARevoir(ex: Executeur, limite = 500) {
  const observations = (await ex.query<Record<string, unknown>>(
    `SELECT r.observation_id::text AS id, o.source_cle, o.annonce_id, o.libelle_localite, o.precision_niveau, r.resultat, r.motif, r.candidats, r.pays
       FROM geodata_prix_rattachements r JOIN geodata_prix_observations o ON o.id = r.observation_id
      WHERE r.revue = 'a-revoir' ORDER BY r.observation_id LIMIT $1`, [limite],
  )).rows.map((x) => ({
    id: `observation:${x["id"]}`, cible: "observation" as const, source: x["source_cle"], annonce: x["annonce_id"], libelle: x["libelle_localite"],
    precision: x["precision_niveau"] ?? null, resultat: x["resultat"], motif: x["motif"] ?? null, candidats: x["candidats"], pays: x["pays"] ?? null,
  }));
  const zones = (await ex.query<Record<string, unknown>>(
    `SELECT z.id, z.zone_code, z.libelle, z.description_textuelle, z.territoire_propose, z.geom IS NOT NULL AS dessinee, e.source_cle, e.libelle AS edition
       FROM geodata_prix_zones z JOIN geodata_prix_editions e ON e.id = z.edition_id WHERE z.revue = 'a-revoir' ORDER BY e.source_cle, z.zone_code LIMIT $1`, [limite],
  )).rows.map((x) => ({
    id: `zone:${x["id"]}`, cible: "zone" as const, source: x["source_cle"], edition: x["edition"], zone: x["zone_code"], libelle: x["libelle"] ?? x["zone_code"],
    description: x["description_textuelle"] ?? null, territoirePropose: x["territoire_propose"] ?? null, dessinee: x["dessinee"],
  }));
  const decides = await correspondancesLibelles(ex);
  const libelles = (await libellesNonRattaches(ex)).filter((l) => !decides.has(l.id)).slice(0, limite).map((l) => ({
    id: l.id, cible: "libelle" as const, source: l.source, ville: l.ville, libelle: l.libelle, niveau: l.niveau, versions: l.versions, lignes: l.lignes,
    motif: "libelle-source-sans-correspondance",
  }));
  return { observations, zones, libelles };
}

/** Décisions déjà prises (historique, plus récentes d'abord). */
export async function decisionsRevues(ex: Executeur, limite = 500) {
  return (await ex.query<Record<string, unknown>>(
    `SELECT d.id::text AS id, d.cible, d.observation_id::text AS observation_id, d.zone_id, d.source_cle, d.libelle, d.decision, d.pays, d.territoire_code, d.territoire_niveau,
            d.decoupage, d.motif, d.decide_le, u.email AS auteur
       FROM geodata_prix_decisions_rattachement d LEFT JOIN users u ON u.id = d.auteur_id ORDER BY d.decide_le DESC, d.id DESC LIMIT $1`, [limite],
  )).rows.map((x) => ({
    id: x["id"], cible: x["cible"], observationId: x["observation_id"] ?? null, zoneId: x["zone_id"] ?? null, source: x["source_cle"] ?? null, libelle: x["libelle"] ?? null,
    decision: x["decision"], territoire: x["territoire_code"] ? { pays: x["pays"], code: x["territoire_code"], niveau: x["territoire_niveau"] } : null,
    decoupage: x["decoupage"] ?? null, motif: x["motif"], le: x["decide_le"], auteur: x["auteur"] ?? null,
  }));
}

export interface DemandeDecision {
  readonly decision: "validee" | "refusee";
  /** Territoire choisi (décision validée) : pays et code de la hiérarchie administrative en base. */
  readonly territoire: { readonly pays: string; readonly code: string } | null;
  readonly motif: string;
  readonly acteur: string;
}

/** Territoire de la hiérarchie en base (non retiré), avec son niveau et son rang ; édition du découpage. */
async function territoireEnBase(ex: Executeur, pays: string, code: string) {
  const [t] = (await ex.query<{ niveau: string; rang: number }>(
    `SELECT e.niveau, n.rang FROM geodata_entites_administratives e JOIN geodata_niveaux_administratifs n ON n.pays = e.pays AND n.code = e.niveau
      WHERE e.pays = $1 AND e.code = $2 AND e.retire_le IS NULL`, [pays, code],
  )).rows;
  if (!t) throw new ErreurPrix(404, "territoire_inconnu", "Territoire absent de la hiérarchie administrative en base.", { pays, code });
  const [d] = (await ex.query<{ empreinte: string; source: string }>("SELECT empreinte, source FROM geodata_decoupage_imports WHERE pays = $1 ORDER BY importe_le DESC, id DESC LIMIT 1", [pays])).rows;
  return { niveau: t.niveau, rang: Number(t.rang), decoupage: d ? `${d.source} (${d.empreinte.slice(0, 12)})` : null };
}

/** Enregistre une décision de revue (voir l'en-tête) ; rien n'est décidé sans réviseur, motif et territoire existant. */
export async function deciderRattachement(ex: Executeur, id: string, d: DemandeDecision): Promise<{ id: string; cible: CibleRevue; decision: string; territoire: { pays: string; code: string; niveau: string } | null }> {
  const cible = lireIdRevue(id);
  if (!cible) throw new ErreurPrix(404, "not_found", "Élément de revue inconnu.");
  if ((d.decision === "validee") !== (d.territoire !== null)) throw new ErreurPrix(400, "invalid_input", "Une décision validée désigne un territoire ; un refus n'en désigne aucun.", { champs: ["territoire"] });
  const t = d.territoire ? { ...d.territoire, ...(await territoireEnBase(ex, d.territoire.pays, d.territoire.code)) } : null;
  if (cible.cible === "observation") {
    const [o] = (await ex.query<{ precision_niveau: string | null; pays: string | null }>(
      `SELECT o.precision_niveau, r.pays FROM geodata_prix_rattachements r JOIN geodata_prix_observations o ON o.id = r.observation_id WHERE r.observation_id = $1 FOR UPDATE OF r`, [cible.observationId],
    )).rows;
    if (!o) throw new ErreurPrix(404, "not_found", "Observation sans rattachement à revoir.");
    if (t) {
      // PRX06 : jamais plus fin que la précision déclarée par la source (précision inconnue : aucun rattachement).
      const [p] = o.precision_niveau ? (await ex.query<{ rang: number }>("SELECT rang FROM geodata_niveaux_administratifs WHERE pays = $1 AND code = $2", [t.pays, o.precision_niveau])).rows : [];
      if (!p || !precisionSuffisante(Number(p.rang), t.rang)) {
        throw new ErreurPrix(409, "precision_insuffisante", "Territoire plus fin que la précision déclarée par la source : rattachement refusé.", { precision: o.precision_niveau, niveau: t.niveau });
      }
      await ex.query(
        `UPDATE geodata_prix_rattachements SET resultat = 'exact', pays = $2, territoire_code = $3, territoire_niveau = $4, methode = 'revue', motif = NULL, decoupage = $5,
           revue = 'validee', revue_par = $6, revue_le = clock_timestamp(), revue_motif = $7 WHERE observation_id = $1`,
        [cible.observationId, t.pays, t.code, t.niveau, t.decoupage, d.acteur, d.motif],
      );
    } else {
      await ex.query(
        `UPDATE geodata_prix_rattachements SET resultat = 'non-rattache', territoire_code = NULL, territoire_niveau = NULL, methode = NULL, motif = 'refuse-revue',
           revue = 'refusee', revue_par = $2, revue_le = clock_timestamp(), revue_motif = $3 WHERE observation_id = $1`,
        [cible.observationId, d.acteur, d.motif],
      );
    }
    await ex.query(
      `INSERT INTO geodata_prix_decisions_rattachement (cible, observation_id, decision, pays, territoire_code, territoire_niveau, decoupage, motif, auteur_id)
       VALUES ('observation', $1, $2, $3, $4, $5, $6, $7, $8)`,
      [cible.observationId, d.decision, t?.pays ?? null, t?.code ?? null, t?.niveau ?? null, t?.decoupage ?? null, d.motif, d.acteur],
    );
  } else if (cible.cible === "zone") {
    const z = (await ex.query("SELECT id FROM geodata_prix_zones WHERE id = $1 FOR UPDATE", [cible.zoneId])).rows;
    if (!z.length) throw new ErreurPrix(404, "not_found", "Zone officielle inconnue.");
    await ex.query("UPDATE geodata_prix_zones SET territoire_code = $2, revue = $3 WHERE id = $1", [cible.zoneId, t?.code ?? null, d.decision]);
    await ex.query(
      `INSERT INTO geodata_prix_decisions_rattachement (cible, zone_id, decision, pays, territoire_code, territoire_niveau, decoupage, motif, auteur_id)
       VALUES ('zone', $1, $2, $3, $4, $5, $6, $7, $8)`,
      [cible.zoneId, d.decision, t?.pays ?? null, t?.code ?? null, t?.niveau ?? null, t?.decoupage ?? null, d.motif, d.acteur],
    );
  } else {
    const connu = (await libellesNonRattaches(ex)).find((l) => l.id === id);
    if (!connu) throw new ErreurPrix(404, "not_found", "Libellé publié non rattaché inconnu (ou source non autorisée).");
    await ex.query(
      `INSERT INTO geodata_prix_decisions_rattachement (cible, source_cle, ville_normalisee, libelle_normalise, libelle, decision, pays, territoire_code, territoire_niveau, decoupage, motif, auteur_id)
       VALUES ('libelle', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [connu.source, normaliserLibelleLocalite(connu.ville), normaliserLibelleLocalite(connu.libelle), connu.libelle, d.decision, t?.pays ?? null, t?.code ?? null, t?.niveau ?? null,
        t?.decoupage ?? null, d.motif, d.acteur],
    );
  }
  await ex.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, 'prix.rattachement.decision', $2, 'succes', $3)",
    [d.acteur, id.slice(0, 200), JSON.stringify({ cible: cible.cible, decision: d.decision, territoire: t ? { pays: t.pays, code: t.code, niveau: t.niveau } : null })]);
  return { id, cible: cible.cible, decision: d.decision, territoire: t ? { pays: t.pays, code: t.code, niveau: t.niveau } : null };
}
