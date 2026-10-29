/**
 * Cartes et collections (plan GD-06, GEO 05, GEO 13, D-GD-36) : enregistrement explicite d'une composition complète,
 * révision attendue obligatoire à chaque modification (écriture atomique `WHERE revision = $attendue` ; périmée → 409 avec
 * l'état courant, jamais de fusion silencieuse), duplication, archivage. À la lecture, chaque couche référencée est
 * qualifiée : disponible, retirée (motif) ou inaccessible — la référence est conservée, aucune source n'est substituée.
 * Une collection est un ensemble nommé et ordonné de RÉFÉRENCES vers des cartes de l'espace (`geodata_collection_cartes`,
 * rang) : une carte peut être dans plusieurs collections ; supprimer une collection ne supprime aucune carte.
 */
import { Router, type Request } from "express";
import { COMPOSITION_INITIALE, validerComposition, type Composition } from "@parcours/geodata-model";
import { erreur, espacePersonnel, introuvable, journal, requete, transaction, VERSION_CONSULTABLE } from "../../lib/geodata/acces.js";
import { newId } from "../../lib/ids.js";

export const cartesRouter = Router();

const espaceDe = async (req: Request) => (await espacePersonnel(req.user!.id)).id;
const nomValide = (x: unknown): x is string => typeof x === "string" && x.trim().length >= 1 && x.trim().length <= 120;

/** Disponibilité de chaque couche d'une composition pour l'espace (concept § 6.2). */
export async function disponibilites(espaceId: string, composition: Composition) {
  const ids = composition.couches.map((c) => c.versionId);
  if (!ids.length) return {};
  const lignes = await requete(
    `SELECT v.id, v.etat, v.motif_retrait, v.source_id, ${VERSION_CONSULTABLE("v", "$1")} AS consultable,
            (v.etat = 'retiree' AND (v.espace_id IS NULL OR v.espace_id = $1)) AS retrait_visible,
            (SELECT v2.id FROM geodata_versions v2 WHERE v2.source_id = v.source_id AND v2.id <> v.id AND ${VERSION_CONSULTABLE("v2", "$1")}
              AND v2.publiee_le > coalesce(v.publiee_le, v.preparee_le) ORDER BY v2.publiee_le DESC LIMIT 1) AS plus_recente
       FROM geodata_versions v WHERE v.id = ANY($2)`,
    [espaceId, ids],
  );
  const parId = new Map(lignes.map((l) => [l["id"] as string, l]));
  return Object.fromEntries(composition.couches.map((c) => {
    const l = parId.get(c.versionId);
    if (!l || (!l["consultable"] && !l["retrait_visible"])) return [c.coucheId, { etat: "inaccessible", motif: "Couche absente ou non accessible à ce compte ; sa référence est conservée." }];
    if (l["retrait_visible"]) return [c.coucheId, { etat: "retiree", motif: `Version retirée : ${l["motif_retrait"]}` }];
    return [c.coucheId, { etat: "disponible", versionPlusRecente: l["plus_recente"] ?? null }];
  }));
}

/**
 * Chaque couche AJOUTÉE à une composition doit être consultable et appartenir à la version indiquée ; une couche déjà
 * présente dans la composition enregistrée garde sa référence même devenue indisponible (retrait, droit perdu).
 */
async function referencesRefusees(espaceId: string, composition: Composition, ancienne: Composition | null): Promise<string[]> {
  const deja = new Set((ancienne?.couches ?? []).map((c) => `${c.coucheId}|${c.versionId}`));
  const nouvelles = composition.couches.filter((c) => !deja.has(`${c.coucheId}|${c.versionId}`));
  if (!nouvelles.length) return [];
  const lignes = await requete<{ id: string; version_id: string }>(
    `SELECT c.id, c.version_id FROM geodata_couches c JOIN geodata_versions v ON v.id = c.version_id WHERE c.id = ANY($2) AND ${VERSION_CONSULTABLE("v", "$1")}`,
    [espaceId, nouvelles.map((c) => c.coucheId)],
  );
  const ok = new Set(lignes.map((l) => `${l.id}|${l.version_id}`));
  return nouvelles.filter((c) => !ok.has(`${c.coucheId}|${c.versionId}`)).map((c) => c.coucheId);
}

async function lireCarte(espaceId: string, id: string) {
  const [c] = await requete(
    `SELECT id, nom, revision, etat, composition, cree_le, modifie_le FROM geodata_cartes WHERE id = $1 AND espace_id = $2`, [id, espaceId]);
  return c ?? null;
}

/** Collections actives qui référencent une carte (une carte peut être dans plusieurs collections). */
const collectionsDe = async (espaceId: string, carteId: string) => (await requete<{ id: string; nom: string }>(
  `SELECT co.id, co.nom FROM geodata_collection_cartes l JOIN geodata_collections co ON co.id = l.collection_id
    WHERE l.carte_id = $1 AND l.espace_id = $2 AND co.etat = 'active' ORDER BY co.nom`, [carteId, espaceId])).map((l) => ({ id: l.id, nom: l.nom }));

const vueCarte = async (espaceId: string, c: Record<string, unknown>) => ({
  id: c["id"], nom: c["nom"], revision: c["revision"], etat: c["etat"], collections: await collectionsDe(espaceId, String(c["id"])), creeLe: c["cree_le"], modifieLe: c["modifie_le"],
  composition: c["composition"], disponibilite: await disponibilites(espaceId, c["composition"] as Composition),
});

async function collectionDeLEspace(espaceId: string, id: unknown): Promise<boolean> {
  if (id === null || id === undefined) return true;
  if (typeof id !== "string") return false;
  const [c] = await requete("SELECT 1 FROM geodata_collections WHERE id = $1 AND espace_id = $2 AND etat = 'active'", [id, espaceId]);
  return !!c;
}

/** Ajoute une carte à la fin d'une collection (sans doublon) et date la modification de la collection. */
async function ajouterEnFin(espaceId: string, collectionId: string, carteId: string) {
  await requete(`INSERT INTO geodata_collection_cartes (collection_id, carte_id, espace_id, rang)
      VALUES ($1, $2, $3, coalesce((SELECT max(rang) FROM geodata_collection_cartes WHERE collection_id = $1), 0) + 1)
    ON CONFLICT (collection_id, carte_id) DO NOTHING`, [collectionId, carteId, espaceId]);
  await requete("UPDATE geodata_collections SET modifie_le = now() WHERE id = $1 AND espace_id = $2", [collectionId, espaceId]);
}

const MAX_CARTES_COLLECTION = 500;
const descriptionValide = (x: unknown): x is string => typeof x === "string" && x.length <= 2000;

/** Liste ordonnée de cartes d'une collection : identifiants distincts, tous des cartes de l'espace (actives ou archivées). */
async function cartesDeLEspace(espaceId: string, x: unknown): Promise<string[] | null> {
  if (!Array.isArray(x) || x.length > MAX_CARTES_COLLECTION || !x.every((i) => typeof i === "string") || new Set(x).size !== x.length) return null;
  if (!x.length) return [];
  const lignes = await requete<{ id: string }>("SELECT id FROM geodata_cartes WHERE espace_id = $1 AND id = ANY($2)", [espaceId, x]);
  return lignes.length === x.length ? (x as string[]) : null;
}

cartesRouter.get("/cartes", async (req, res) => {
  const espaceId = await espaceDe(req);
  const etat = req.query["etat"] === "archivee" ? "archivee" : "active";
  const lignes = await requete(
    `SELECT id, nom, revision, etat, cree_le, modifie_le, jsonb_array_length(composition -> 'couches') AS couches
       FROM geodata_cartes WHERE espace_id = $1 AND etat = $2 ORDER BY modifie_le DESC LIMIT 500`, [espaceId, etat]);
  res.json({ cartes: lignes.map((l) => ({ id: l["id"], nom: l["nom"], revision: l["revision"], etat: l["etat"], creeLe: l["cree_le"], modifieLe: l["modifie_le"], couches: l["couches"] })) });
});

cartesRouter.post("/cartes", async (req, res) => {
  const espaceId = await espaceDe(req);
  const { nom, composition, collectionId } = (req.body ?? {}) as Record<string, unknown>;
  if (!nomValide(nom)) return erreur(res, 400, "invalid_input", "Nom de carte de 1 à 120 caractères.", { champs: ["nom"] });
  const v = validerComposition(composition ?? COMPOSITION_INITIALE);
  if (!v.ok) return erreur(res, 400, "composition_invalide", "Composition invalide.", { champs: ["composition"], details: v.erreurs });
  if (!(await collectionDeLEspace(espaceId, collectionId))) return erreur(res, 400, "invalid_input", "Collection inconnue dans cet espace.", { champs: ["collectionId"] });
  const refusees = await referencesRefusees(espaceId, v.composition, null);
  if (refusees.length) return erreur(res, 400, "couche_inaccessible", "Couche inconnue ou non consultable par ce compte.", { couches: refusees });
  const id = newId("gdcarte");
  await requete(`INSERT INTO geodata_cartes (id, espace_id, proprietaire_id, nom, composition) VALUES ($1, $2, $3, $4, $5)`,
    [id, espaceId, req.user!.id, nom.trim(), JSON.stringify(v.composition)]);
  // Collection choisie à l'enregistrement : la carte y est ajoutée en dernière position.
  if (typeof collectionId === "string") await ajouterEnFin(espaceId, collectionId, id);
  await journal(req.user!.id, "carte.creee", id, "succes");
  res.status(201).json(await vueCarte(espaceId, (await lireCarte(espaceId, id))!));
});

cartesRouter.get("/cartes/:id", async (req, res) => {
  const espaceId = await espaceDe(req);
  const c = await lireCarte(espaceId, req.params.id);
  if (!c) return introuvable(res);
  res.json(await vueCarte(espaceId, c));
});

/** Révision : `revisionAttendue` obligatoire ; nom et composition facultatifs (au moins un). Les collections se gèrent par `/collections`. */
cartesRouter.put("/cartes/:id", async (req, res) => {
  const espaceId = await espaceDe(req);
  const { revisionAttendue, nom, composition, collectionId } = (req.body ?? {}) as Record<string, unknown>;
  if (collectionId !== undefined) return erreur(res, 400, "invalid_input", "Une carte se range dans une collection par la collection (PUT /collections/:id).", { champs: ["collectionId"] });
  if (!Number.isInteger(revisionAttendue)) return erreur(res, 400, "invalid_input", "Révision attendue obligatoire.", { champs: ["revisionAttendue"] });
  if (nom !== undefined && !nomValide(nom)) return erreur(res, 400, "invalid_input", "Nom de carte de 1 à 120 caractères.", { champs: ["nom"] });
  let comp: Composition | undefined;
  if (composition !== undefined) {
    const v = validerComposition(composition);
    if (!v.ok) return erreur(res, 400, "composition_invalide", "Composition invalide.", { champs: ["composition"], details: v.erreurs });
    comp = v.composition;
  }
  if (nom === undefined && comp === undefined) return erreur(res, 400, "invalid_input", "Aucune modification demandée.");
  if (comp) {
    const actuelle = await lireCarte(espaceId, req.params.id);
    if (!actuelle) return introuvable(res);
    const refusees = await referencesRefusees(espaceId, comp, actuelle["composition"] as Composition);
    if (refusees.length) return erreur(res, 400, "couche_inaccessible", "Couche inconnue ou non consultable par ce compte.", { couches: refusees });
  }
  const lignes = await requete(
    `UPDATE geodata_cartes SET nom = coalesce($4, nom), composition = coalesce($5::jsonb, composition), revision = revision + 1, modifie_le = now()
      WHERE id = $1 AND espace_id = $2 AND revision = $3 AND etat = 'active' RETURNING id`,
    [req.params.id, espaceId, revisionAttendue, nom === undefined ? null : (nom as string).trim(), comp ? JSON.stringify(comp) : null],
  );
  if (!lignes.length) {
    const actuelle = await lireCarte(espaceId, req.params.id);
    if (!actuelle) return introuvable(res);
    if (actuelle["etat"] !== "active") return erreur(res, 409, "carte_archivee", "Carte archivée : restaurez-la avant de la modifier.");
    await journal(req.user!.id, "carte.conflit", req.params.id, "refus", { attendue: revisionAttendue, courante: actuelle["revision"] });
    return erreur(res, 409, "revision_conflict", "La carte a été modifiée ailleurs depuis votre ouverture : rechargez-la ou enregistrez votre version comme une copie.", {
      revisionCourante: actuelle["revision"], carte: await vueCarte(espaceId, actuelle),
    });
  }
  await journal(req.user!.id, "carte.revisee", req.params.id, "succes");
  res.json(await vueCarte(espaceId, (await lireCarte(espaceId, req.params.id))!));
});

/** Duplication : nouvelle carte (révision 1) ; la composition peut être celle, locale, d'un conflit à préserver. */
cartesRouter.post("/cartes/:id/dupliquer", async (req, res) => {
  const espaceId = await espaceDe(req);
  const c = await lireCarte(espaceId, req.params.id);
  if (!c) return introuvable(res);
  const { nom, composition } = (req.body ?? {}) as Record<string, unknown>;
  const v = validerComposition(composition ?? c["composition"]);
  if (!v.ok) return erreur(res, 400, "composition_invalide", "Composition invalide.", { details: v.erreurs });
  const refusees = await referencesRefusees(espaceId, v.composition, c["composition"] as Composition);
  if (refusees.length) return erreur(res, 400, "couche_inaccessible", "Couche inconnue ou non consultable par ce compte.", { couches: refusees });
  const nouveauNom = nomValide(nom) ? nom.trim() : `${String(c["nom"]).slice(0, 110)} (copie)`;
  const id = newId("gdcarte");
  // Une copie est une nouvelle carte : elle n'entre dans aucune collection (une collection référence des cartes choisies).
  await requete(`INSERT INTO geodata_cartes (id, espace_id, proprietaire_id, nom, composition) VALUES ($1, $2, $3, $4, $5)`,
    [id, espaceId, req.user!.id, nouveauNom, JSON.stringify(v.composition)]);
  await journal(req.user!.id, "carte.dupliquee", id, "succes", { depuis: req.params.id });
  res.status(201).json(await vueCarte(espaceId, (await lireCarte(espaceId, id))!));
});

for (const [chemin, etat, action] of [["archiver", "archivee", "carte.archivee"], ["restaurer", "active", "carte.restauree"]] as const) {
  cartesRouter.post(`/cartes/:id/${chemin}`, async (req, res) => {
    const espaceId = await espaceDe(req);
    const lignes = await requete(`UPDATE geodata_cartes SET etat = $3, revision = revision + 1, modifie_le = now() WHERE id = $1 AND espace_id = $2 RETURNING id`, [req.params.id, espaceId, etat]);
    if (!lignes.length) return introuvable(res);
    await journal(req.user!.id, action, req.params.id, "succes");
    res.json(await vueCarte(espaceId, (await lireCarte(espaceId, req.params.id))!));
  });
}

cartesRouter.get("/collections", async (req, res) => {
  const espaceId = await espaceDe(req);
  const lignes = await requete(`SELECT co.id, co.nom, co.description, co.etat, co.cree_le, co.modifie_le,
      count(ca.id) FILTER (WHERE ca.etat = 'active') AS cartes
    FROM geodata_collections co LEFT JOIN geodata_collection_cartes l ON l.collection_id = co.id LEFT JOIN geodata_cartes ca ON ca.id = l.carte_id
    WHERE co.espace_id = $1 GROUP BY co.id ORDER BY co.etat, co.nom`, [espaceId]);
  res.json({ collections: lignes.map((l) => ({ id: l["id"], nom: l["nom"], description: l["description"], etat: l["etat"], creeLe: l["cree_le"], modifieLe: l["modifie_le"], cartes: Number(l["cartes"]) })) });
});

/** Détail d'une collection : titre, description et cartes dans leur ordre (une carte archivée reste listée, signalée). */
async function lireCollection(espaceId: string, id: string) {
  const [co] = await requete(`SELECT id, nom, description, etat, cree_le, modifie_le FROM geodata_collections WHERE id = $1 AND espace_id = $2`, [id, espaceId]);
  if (!co) return null;
  const cartes = await requete(`SELECT ca.id, ca.nom, ca.etat, l.rang FROM geodata_collection_cartes l JOIN geodata_cartes ca ON ca.id = l.carte_id
    WHERE l.collection_id = $1 AND l.espace_id = $2 ORDER BY l.rang, ca.nom`, [id, espaceId]);
  return { id: co["id"], nom: co["nom"], description: co["description"], etat: co["etat"], creeLe: co["cree_le"], modifieLe: co["modifie_le"],
    cartes: cartes.map((c) => ({ id: c["id"], nom: c["nom"], etat: c["etat"] })) };
}

/** Remplace la liste ordonnée des cartes d'une collection (rang 1..n), dans la transaction donnée. */
async function ecrireCartes(client: import("pg").PoolClient, espaceId: string, collectionId: string, cartes: string[]) {
  await requete("DELETE FROM geodata_collection_cartes WHERE collection_id = $1 AND espace_id = $2", [collectionId, espaceId], client);
  if (cartes.length) await requete(`INSERT INTO geodata_collection_cartes (collection_id, carte_id, espace_id, rang)
    SELECT $1, c.id, $2, c.rang FROM unnest($3::text[]) WITH ORDINALITY AS c(id, rang)`, [collectionId, espaceId, cartes], client);
}

cartesRouter.get("/collections/:id", async (req, res) => {
  const espaceId = await espaceDe(req);
  const c = await lireCollection(espaceId, req.params.id);
  if (!c) return introuvable(res);
  res.json(c);
});

/** Création (Nouveau, ou Enregistrer sous avec la liste des cartes de la collection copiée : mêmes références). */
cartesRouter.post("/collections", async (req, res) => {
  const espaceId = await espaceDe(req);
  const { nom, description, cartes } = (req.body ?? {}) as Record<string, unknown>;
  if (!nomValide(nom)) return erreur(res, 400, "invalid_input", "Titre de collection de 1 à 120 caractères.", { champs: ["nom"] });
  if (description !== undefined && !descriptionValide(description)) return erreur(res, 400, "invalid_input", "Description de 2000 caractères au plus.", { champs: ["description"] });
  const liste = cartes === undefined ? [] : await cartesDeLEspace(espaceId, cartes);
  if (!liste) return erreur(res, 400, "invalid_input", "Cartes inconnues dans cet espace, en double ou trop nombreuses.", { champs: ["cartes"] });
  const id = newId("gdcol");
  await transaction(async (client) => {
    await requete("INSERT INTO geodata_collections (id, espace_id, proprietaire_id, nom, description) VALUES ($1, $2, $3, $4, $5)",
      [id, espaceId, req.user!.id, nom.trim(), typeof description === "string" ? description : ""], client);
    await ecrireCartes(client, espaceId, id, liste);
  });
  await journal(req.user!.id, "collection.creee", id, "succes");
  res.status(201).json(await lireCollection(espaceId, id));
});

/** Enregistrement : titre, description, état et/ou liste ordonnée des cartes (remplacée en entier). */
cartesRouter.put("/collections/:id", async (req, res) => {
  const espaceId = await espaceDe(req);
  const { nom, description, etat, cartes } = (req.body ?? {}) as Record<string, unknown>;
  if (nom !== undefined && !nomValide(nom)) return erreur(res, 400, "invalid_input", "Titre de collection de 1 à 120 caractères.", { champs: ["nom"] });
  if (description !== undefined && !descriptionValide(description)) return erreur(res, 400, "invalid_input", "Description de 2000 caractères au plus.", { champs: ["description"] });
  if (etat !== undefined && etat !== "active" && etat !== "archivee") return erreur(res, 400, "invalid_input", "État : active ou archivee.", { champs: ["etat"] });
  const liste = cartes === undefined ? undefined : await cartesDeLEspace(espaceId, cartes);
  if (liste === null) return erreur(res, 400, "invalid_input", "Cartes inconnues dans cet espace, en double ou trop nombreuses.", { champs: ["cartes"] });
  const trouvee = await transaction(async (client) => {
    const lignes = await requete(`UPDATE geodata_collections SET nom = coalesce($3, nom), description = coalesce($4, description), etat = coalesce($5, etat), modifie_le = now()
      WHERE id = $1 AND espace_id = $2 RETURNING id`, [req.params.id, espaceId, typeof nom === "string" ? nom.trim() : null, typeof description === "string" ? description : null, etat ?? null], client);
    if (!lignes.length) return false;
    if (liste) await ecrireCartes(client, espaceId, req.params.id, liste);
    return true;
  });
  if (!trouvee) return introuvable(res);
  await journal(req.user!.id, "collection.enregistree", req.params.id, "succes");
  res.json(await lireCollection(espaceId, req.params.id));
});

/** Suppression : la collection et ses références disparaissent ; ses cartes restent intactes dans Mes cartes. */
cartesRouter.delete("/collections/:id", async (req, res) => {
  const espaceId = await espaceDe(req);
  const lignes = await requete("DELETE FROM geodata_collections WHERE id = $1 AND espace_id = $2 RETURNING id", [req.params.id, espaceId]);
  if (!lignes.length) return introuvable(res);
  await journal(req.user!.id, "collection.supprimee", req.params.id, "succes");
  res.status(204).end();
});
