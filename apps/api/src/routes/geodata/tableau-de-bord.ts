/**
 * Tableau de bord RGPH 2024 (D-GD-37) : lecture seule des annexes d'une version de référence **publiée** et consultable.
 *   GET /tableau-de-bord?pays=MA                      définition des blocs, zone nationale (couche, code), langues des concepts
 *   GET /tableau-de-bord/concepts?pays=MA&langue=fr   concepts et définitions du producteur dans une langue, avec la source
 * Les valeurs d'une zone se lisent par la fiche d'objet (`GET /couches/:id/objets/:code`) : rien n'est dupliqué ici.
 * Aucun pays n'est connu du code : seul ce qui est en base est servi (D-GD-29).
 */
import { Router } from "express";
import { erreur, requete } from "../../lib/geodata/acces.js";

export const tableauDeBordRouter = Router();

const PAYS = /^[A-Z]{2}$/;
/** Dernière version publiée de référence (pas d'espace), consultable, qui porte un tableau de bord pour ce pays. */
const VERSION_BORD = `SELECT t.version_id, t.pays, t.zone_code, t.zone_nom, t.definition, v.attribution, v.publiee_le, c.id AS couche_id
  FROM geodata_tableaux_bord t JOIN geodata_versions v ON v.id = t.version_id JOIN geodata_couches c ON c.version_id = v.id
 WHERE v.etat = 'publiee' AND v.espace_id IS NULL AND v.droits->>'consultation' = 'autorise' AND ($1::text IS NULL OR t.pays = $1)
 ORDER BY v.publiee_le DESC, t.pays LIMIT 1`;

const paysDemande = (q: unknown) => (typeof q === "string" ? q : null);

tableauDeBordRouter.get("/tableau-de-bord", async (req, res) => {
  const pays = paysDemande(req.query["pays"]);
  if (pays !== null && !PAYS.test(pays)) return erreur(res, 400, "invalid_input", "Pays invalide.");
  const [t] = await requete(VERSION_BORD, [pays]);
  if (!t) return erreur(res, 404, "not_found", "Aucun tableau de bord en base pour ce pays.");
  const langues = await requete<{ langue: string; n: number }>("SELECT langue, count(*)::int AS n FROM geodata_concepts WHERE version_id = $1 GROUP BY langue", [t["version_id"]]);
  res.json({
    pays: t["pays"], versionId: t["version_id"], attribution: t["attribution"],
    zone: { code: t["zone_code"], nom: t["zone_nom"], coucheId: t["couche_id"] },
    definition: t["definition"],
    concepts: Object.fromEntries(langues.map((l) => [l.langue, l.n])),
  });
});

tableauDeBordRouter.get("/tableau-de-bord/concepts", async (req, res) => {
  const pays = paysDemande(req.query["pays"]);
  const langue = req.query["langue"];
  if ((pays !== null && !PAYS.test(pays)) || (langue !== "fr" && langue !== "ar")) return erreur(res, 400, "invalid_input", "Pays ou langue invalide (fr, ar).");
  const [t] = await requete(VERSION_BORD, [pays]);
  if (!t) return erreur(res, 404, "not_found", "Aucun tableau de bord en base pour ce pays.");
  const lignes = await requete<{ titre: string; texte: string; source: string }>("SELECT titre, texte, source FROM geodata_concepts WHERE version_id = $1 AND langue = $2 ORDER BY ordre", [t["version_id"], langue]);
  res.json({ langue, source: lignes[0]?.source ?? null, concepts: lignes.map((l) => ({ titre: l.titre, texte: l.texte })) });
});
