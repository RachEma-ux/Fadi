/**
 * Exports autorisés (plan GD-09, GEO 09) : la composition et les versions de la carte sont FIGÉES à la demande ; chaque
 * couche visible est contrôlée (consultable, droit `export` autorisé), le fond aussi. Un seul refus bloque l'export et le
 * motive : aucune couche ni attribution n'est omise silencieusement — l'utilisateur retire lui-même la couche, ce qui crée
 * une nouvelle révision de sa carte. Export permis : fiche de sources HTML conservée 30 jours (privée, téléchargement
 * contrôlé) et liste des attributions à porter sur l'image PNG composée par le navigateur.
 */
import { Router, type Request } from "express";
import { LIBELLES_USAGES, lireDroits, PREFIXE_FOND_NAVIGATEUR, verifierUsage, type Composition } from "@parcours/geodata-model";
import { erreur, espacePersonnel, fondsConfigures, introuvable, journal, requete, rolesDe, VERSION_CONSULTABLE } from "../../lib/geodata/acces.js";
import { capacitesPrixDe } from "../../lib/geodata/prix/droits.js";
import { newId } from "../../lib/ids.js";
import { COLONNES_VERSION, lireVersion } from "./consultation.js";

export const exportsRouter = Router();

const espaceDe = async (req: Request) => (await espacePersonnel(req.user!.id)).id;
const DUREE_EXPORT_MS = 30 * 24 * 3_600_000;

const echapper = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

interface LigneSource { titre: string; version: ReturnType<typeof lireVersion> }

function ficheHtml(carte: { nom: string; revision: number }, sources: LigneSource[], fond: { libelle: string; attribution: string }, analyses: Record<string, unknown>[], date: Date): string {
  const lignes = sources.map(({ titre, version: v }) => `<section><h2>${echapper(titre)}</h2><dl>
<dt>Source</dt><dd>${echapper(v.source.titre)} — ${echapper(v.source.producteur)}</dd>
<dt>Version</dt><dd>${echapper(v.libelle)} (${echapper(v.id)})</dd>
<dt>Période</dt><dd>${echapper(v.periode ?? "Non renseignée")}</dd>
<dt>Licence</dt><dd>${echapper(v.licence)}</dd>
<dt>Attribution</dt><dd>${echapper(v.attribution)}</dd>
<dt>Adresse source</dt><dd>${echapper(v.urlSource ?? "Non applicable")}</dd>
<dt>Récupérée le</dt><dd>${echapper(v.recupereLe ?? "Non renseigné")}</dd>
<dt>Système source</dt><dd>${echapper(v.crsSource)}</dd>
<dt>Empreinte SHA-256</dt><dd><code>${echapper(v.empreinte)}</code></dd>
<dt>Transformations</dt><dd>${(v.transformations as string[] | null)?.map(echapper).join("<br>") || "Aucune"}</dd>
<dt>Droits</dt><dd>${Object.entries(v.droits).map(([u, e]) => `${echapper(LIBELLES_USAGES[u as keyof typeof LIBELLES_USAGES])} : ${echapper(e)}`).join(" · ")}</dd>
${v.synthetique ? "<dt>Nature</dt><dd><strong>Jeu synthétique de test — aucune donnée réelle</strong></dd>" : ""}
</dl></section>`).join("\n");
  const ana = analyses.map((a) => {
    const r = a["resultat"] as Record<string, unknown>;
    const ver = r["version"] as Record<string, unknown>;
    return `<section><h2>Analyse ${echapper(a["id"])}</h2><p>${echapper(r["methode"])}</p><p>Méthode ${echapper(a["methode"])} v${echapper(a["version_methode"])} · zone révision ${echapper(a["zone_revision"])} · version ${echapper(ver["libelle"])} (${echapper(ver["id"])}) · calculée le ${echapper(new Date(a["cree_le"] as string).toISOString())}</p><p>${echapper(r["limites"])}</p></section>`;
  }).join("\n");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fiche de sources — ${echapper(carte.nom)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;max-width:900px}dt{font-weight:600}dd{margin:0 0 6px 0}section{border-top:1px solid #ccc;padding-top:8px;margin-top:12px}code{word-break:break-all}</style></head>
<body><h1>Fiche de sources — ${echapper(carte.nom)}</h1>
<p>Carte GeoData, révision ${carte.revision}, composition figée le ${echapper(date.toISOString())}. Fond : ${echapper(fond.libelle)}${fond.attribution ? ` (${echapper(fond.attribution)})` : ""}.</p>
<p>Les mesures et analyses sont indicatives : elles ne valent ni document cadastral, ni relevé topographique, ni conclusion réglementaire.</p>
${lignes || "<p>Aucune couche visible.</p>"}
${ana}
</body></html>`;
}

exportsRouter.post("/exports", async (req, res) => {
  const espaceId = await espaceDe(req);
  const { carteId, analyseIds, revisionAttendue } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof carteId !== "string") return erreur(res, 400, "invalid_input", "Carte obligatoire.", { champs: ["carteId"] });
  if (!Number.isInteger(revisionAttendue)) return erreur(res, 400, "invalid_input", "Révision attendue obligatoire.", { champs: ["revisionAttendue"] });
  const [carte] = await requete(`SELECT id, nom, revision, composition FROM geodata_cartes WHERE id = $1 AND espace_id = $2 AND etat = 'active'`, [carteId, espaceId]);
  if (!carte) return introuvable(res);
  // L'export porte sur la révision affichée par le demandeur : une révision plus récente enregistrée ailleurs est refusée
  // (l'image capturée et les droits vérifiés porteraient sinon sur deux compositions différentes).
  if (carte["revision"] !== revisionAttendue) return erreur(res, 409, "revision_conflict", "La carte a été modifiée ailleurs : rechargez-la avant d'exporter.", { revisionCourante: carte["revision"] });
  const composition = carte["composition"] as Composition;
  const visibles = composition.couches.filter((c) => c.visible);
  const refus: { coucheId: string | null; titre: string; motif: string }[] = [];
  const fond = fondsConfigures().find((f) => f.id === composition.fond);
  // Fond d'un fournisseur réglé dans le navigateur (D-GD-15) : conditions d'export non établies, jamais exportable.
  if (!fond && String(composition.fond).startsWith(PREFIXE_FOND_NAVIGATEUR)) refus.push({ coucheId: null, titre: "Fond de fournisseur", motif: "Fond d'un fournisseur réglé dans Paramètres : ses conditions d'export ne sont pas établies ; choisissez le fond neutre pour exporter." });
  else if (!fond) refus.push({ coucheId: null, titre: "Fond cartographique", motif: "Fond non configuré sur ce serveur." });
  else if (!fond.export) refus.push({ coucheId: null, titre: fond.libelle, motif: "Les conditions de ce fond n'autorisent pas l'export ; choisissez le fond neutre." });
  const lignes = visibles.length ? await requete(
    `SELECT c.id AS couche_id, c.titre AS couche_titre, c.version_id, ${COLONNES_VERSION},
            ${VERSION_CONSULTABLE("v", "$1")} AS consultable,
            EXISTS (SELECT 1 FROM geodata_prix_sources ps WHERE ps.fiche_geodata = s.cle AND s.espace_id IS NULL) AS source_prix
       FROM geodata_couches c JOIN geodata_versions v ON v.id = c.version_id JOIN geodata_sources s ON s.id = v.source_id
      WHERE c.id = ANY($2)`, [espaceId, visibles.map((c) => c.coucheId)]) : [];
  const sources: LigneSource[] = [];
  // Couche d'une source de prix (fiche du registre des prix, ex. baromètre FeenWay) : même droit que l'export des prix
  // (`prix-exporter`, rôle GeoData) en plus du droit « export » de sa version — l'export de la carte et `/prix/export`
  // obéissent ainsi à la même règle (choix documenté dans docs/geodata/README.md).
  const peutExporterPrix = lignes.some((l) => l["source_prix"]) ? capacitesPrixDe(await rolesDe(req.user!.id)).has("prix-exporter") : true;
  for (const c of visibles) {
    const l = lignes.find((x) => x["couche_id"] === c.coucheId && x["version_id"] === c.versionId);
    if (!l || !l["consultable"]) { refus.push({ coucheId: c.coucheId, titre: (l?.["couche_titre"] as string) ?? c.coucheId, motif: "Couche indisponible (retirée ou inaccessible) : retirez-la de la carte avant d'exporter." }); continue; }
    if (l["source_prix"] && !peutExporterPrix) { refus.push({ coucheId: c.coucheId, titre: l["couche_titre"] as string, motif: "Couche de prix immobiliers : export réservé aux rôles GeoData autorisés à exporter les prix." }); continue; }
    const d = verifierUsage(lireDroits(l["droits"]), "export");
    if (!d.ok) refus.push({ coucheId: c.coucheId, titre: l["couche_titre"] as string, motif: d.motif });
    else sources.push({ titre: l["couche_titre"] as string, version: lireVersion(l) });
  }
  const ids = Array.isArray(analyseIds) ? analyseIds.filter((x): x is string => typeof x === "string").slice(0, 20) : [];
  const analyses = ids.length ? await requete(`SELECT id, methode, version_methode, zone_revision, resultat, cree_le FROM geodata_analyses WHERE espace_id = $1 AND id = ANY($2)`, [espaceId, ids]) : [];
  const maintenant = new Date();
  const attributions = [...new Set([...(fond?.attribution ? [fond.attribution] : []), ...sources.map((s) => s.version.attribution as string)])];
  const etat = refus.length ? "refuse" : "autorise";
  const id = newId("gdexp");
  const fiche = etat === "autorise" ? ficheHtml({ nom: carte["nom"] as string, revision: carte["revision"] as number }, sources, fond!, analyses, maintenant) : null;
  await requete(`INSERT INTO geodata_exports (id, espace_id, demandeur_id, carte_id, carte_revision, composition, etat, refus, attributions, fiche_html, expire_le) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, espaceId, req.user!.id, carteId, carte["revision"], JSON.stringify(composition), etat, JSON.stringify(refus), JSON.stringify(attributions), fiche, new Date(maintenant.getTime() + DUREE_EXPORT_MS)]);
  await journal(req.user!.id, etat === "autorise" ? "export.autorise" : "export.refuse", id, etat === "autorise" ? "succes" : "refus", { couches: visibles.length, refus: refus.length });
  res.status(201).json({
    id, etat, carteId, carteRevision: carte["revision"], refus, attributions,
    sources: sources.map((s) => ({ titre: s.titre, version: s.version.libelle, licence: s.version.licence, attribution: s.version.attribution, periode: s.version.periode })),
    fiche: etat === "autorise" ? `/geodata/api/exports/${id}/fiche` : null, expireLe: new Date(maintenant.getTime() + DUREE_EXPORT_MS),
  });
});

/** Téléchargement de la fiche : propriétaire seul, avant expiration (contrôle à la remise, pas seulement au lancement). */
exportsRouter.get("/exports/:id/fiche", async (req, res) => {
  const espaceId = await espaceDe(req);
  const [e] = await requete(`SELECT fiche_html, expire_le FROM geodata_exports WHERE id = $1 AND espace_id = $2 AND etat = 'autorise'`, [req.params.id, espaceId]);
  if (!e || !e["fiche_html"]) return introuvable(res);
  if (new Date(e["expire_le"] as string) < new Date()) return erreur(res, 410, "export_expire", "Fiche expirée : relancez l'export.");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="fiche-sources-${req.params.id}.html"`);
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
  res.send(e["fiche_html"]);
});
