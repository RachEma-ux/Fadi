/**
 * Catégories du catalogue GeoData (D-GD-14) : lecture pour tout compte connecté ; création, renommage, ordre,
 * suppression et rangement des sources communes réservés à la capacité « organiser-catalogue » (gestionnaire de
 * données ou administrateur GeoData). Une source privée (import d'un compte) n'est jamais rangée par un tiers : seul
 * son thème la classe. Supprimer une catégorie ne supprime aucune couche : ses sources reviennent à leur thème, sinon
 * à « Autres ». Chaque modification est journalisée.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { CATEGORIES_CATALOGUE, validerLibelleCategorie } from "@parcours/geodata-model";
import { capacites, erreur, introuvable, journal, requete, transaction } from "../../lib/geodata/acces.js";
import { newId } from "../../lib/ids.js";

export const categoriesRouter = Router();

/**
 * Catégories initiales semées une seule fois (repère `categories-semees`) : le premier appel qui pose le repère les
 * insère, dans la même transaction ; une catégorie supprimée ensuite ne revient jamais.
 */
let semees = false;
export async function semerCategories(): Promise<void> {
  if (semees) return;
  await transaction(async (c) => {
    const pose = await c.query(`INSERT INTO geodata_reglages (cle) VALUES ('categories-semees') ON CONFLICT DO NOTHING RETURNING cle`);
    if (!pose.rowCount) return;
    for (const [i, k] of CATEGORIES_CATALOGUE.entries()) {
      await c.query(`INSERT INTO geodata_categories (id, libelle, ordre, themes) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [k.cle, k.libelle, i * 10, [...k.themes]]);
    }
  });
  semees = true;
}

const organiser = async (req: Request, res: Response, next: NextFunction) => {
  if (!(await capacites(req.user!.id)).has("organiser-catalogue")) {
    await journal(req.user!.id, "categorie.refusee", req.path, "refus");
    return erreur(res, 403, "forbidden", "Rôle GeoData « gestionnaire de données » requis pour organiser les catégories.");
  }
  await semerCategories();
  next();
};

const lireCategorie = (l: Record<string, unknown>) => ({ id: String(l["id"]), libelle: String(l["libelle"]), ordre: Number(l["ordre"]), themes: (l["themes"] as string[] | null) ?? [] });

/** Doublon de libellé arrivé entre le contrôle et l'écriture (index unique) : 400 explicite, jamais 500. */
const doublon = (e: unknown) => (e as { code?: string })?.code === "23505";

async function libellesExistants(sauf: string | null): Promise<string[]> {
  return (await requete(`SELECT libelle FROM geodata_categories WHERE $1::text IS NULL OR id <> $1`, [sauf])).map((l) => String(l["libelle"]));
}

/** Catégories, affectations explicites (source → catégorie) et droit de les modifier. */
categoriesRouter.get("/categories", async (req, res) => {
  await semerCategories();
  const categories = (await requete(`SELECT id, libelle, ordre, themes FROM geodata_categories ORDER BY ordre, libelle`)).map(lireCategorie);
  const affectations = Object.fromEntries((await requete(`SELECT a.source_id, a.categorie_id FROM geodata_categories_sources a JOIN geodata_sources s ON s.id = a.source_id WHERE s.espace_id IS NULL`)).map((l) => [String(l["source_id"]), String(l["categorie_id"])]));
  res.json({ categories, affectations, modifiable: (await capacites(req.user!.id)).has("organiser-catalogue") });
});

categoriesRouter.post("/categories", organiser, async (req, res) => {
  const v = validerLibelleCategorie((req.body ?? {})["libelle"], await libellesExistants(null));
  if (!v.ok) return erreur(res, 400, "invalid_input", v.erreur, { champs: ["libelle"] });
  const [max] = await requete(`SELECT coalesce(max(ordre), 0) + 10 AS ordre FROM geodata_categories`);
  const id = newId("gdcat");
  let l: Record<string, unknown> | undefined;
  try { [l] = await requete(`INSERT INTO geodata_categories (id, libelle, ordre) VALUES ($1, $2, $3) RETURNING id, libelle, ordre, themes`, [id, v.libelle, Number(max!["ordre"])]); }
  catch (e) { if (doublon(e)) return erreur(res, 400, "invalid_input", "Une catégorie porte déjà ce libellé.", { champs: ["libelle"] }); throw e; }
  await journal(req.user!.id, "categorie.creee", id, "succes");
  res.status(201).json(lireCategorie(l!));
});

categoriesRouter.patch("/categories/:id", organiser, async (req, res) => {
  const id = String(req.params["id"]);
  const v = validerLibelleCategorie((req.body ?? {})["libelle"], await libellesExistants(id));
  if (!v.ok) return erreur(res, 400, "invalid_input", v.erreur, { champs: ["libelle"] });
  let l: Record<string, unknown> | undefined;
  try { [l] = await requete(`UPDATE geodata_categories SET libelle = $2, modifie_le = now() WHERE id = $1 RETURNING id, libelle, ordre, themes`, [id, v.libelle]); }
  catch (e) { if (doublon(e)) return erreur(res, 400, "invalid_input", "Une catégorie porte déjà ce libellé.", { champs: ["libelle"] }); throw e; }
  if (!l) return introuvable(res);
  await journal(req.user!.id, "categorie.renommee", id, "succes");
  res.json(lireCategorie(l));
});

/** Ordre complet des catégories (liste exacte des identifiants existants). */
categoriesRouter.put("/categories-ordre", organiser, async (req, res) => {
  const ids = (req.body ?? {})["ids"];
  const existants = (await requete(`SELECT id FROM geodata_categories`)).map((l) => String(l["id"]));
  if (!Array.isArray(ids) || ids.length !== existants.length || new Set(ids).size !== ids.length || !ids.every((x) => existants.includes(String(x)))) {
    return erreur(res, 400, "invalid_input", "Ordre attendu : la liste exacte des catégories existantes.", { champs: ["ids"] });
  }
  await transaction(async (c) => { for (const [i, x] of ids.entries()) await c.query(`UPDATE geodata_categories SET ordre = $2, modifie_le = now() WHERE id = $1`, [String(x), (i + 1) * 10]); });
  await journal(req.user!.id, "categorie.ordonnee", null, "succes");
  res.json({ ids });
});

categoriesRouter.delete("/categories/:id", organiser, async (req, res) => {
  const lignes = await requete(`DELETE FROM geodata_categories WHERE id = $1 RETURNING id`, [String(req.params["id"])]);
  if (!lignes.length) return introuvable(res);
  await journal(req.user!.id, "categorie.supprimee", String(req.params["id"]), "succes");
  res.status(204).end();
});

/** Range une source commune dans une catégorie (remplace son rangement précédent). */
categoriesRouter.put("/categories/:id/sources/:sourceId", organiser, async (req, res) => {
  const [cat] = await requete(`SELECT id FROM geodata_categories WHERE id = $1`, [String(req.params["id"])]);
  const [src] = await requete(`SELECT id FROM geodata_sources WHERE id = $1 AND espace_id IS NULL`, [String(req.params["sourceId"])]);
  if (!cat || !src) return introuvable(res);
  await requete(`INSERT INTO geodata_categories_sources (source_id, categorie_id) VALUES ($1, $2) ON CONFLICT (source_id) DO UPDATE SET categorie_id = EXCLUDED.categorie_id, affectee_le = now()`, [String(src["id"]), String(cat["id"])]);
  await journal(req.user!.id, "categorie.source_rangee", String(src["id"]), "succes", { categorie: String(cat["id"]) });
  res.json({ sourceId: String(src["id"]), categorieId: String(cat["id"]) });
});

/** Retire le rangement explicite d'une source : elle revient à son thème (ou à « Autres »). */
categoriesRouter.delete("/categories-sources/:sourceId", organiser, async (req, res) => {
  const lignes = await requete(`DELETE FROM geodata_categories_sources WHERE source_id = $1 RETURNING source_id`, [String(req.params["sourceId"])]);
  if (!lignes.length) return introuvable(res);
  await journal(req.user!.id, "categorie.source_liberee", String(req.params["sourceId"]), "succes");
  res.status(204).end();
});
