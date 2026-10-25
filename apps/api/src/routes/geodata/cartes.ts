/**
 * Cartes et collections (plan GD-06, GEO 05, GEO 13) : enregistrement explicite d'une composition complète, révision
 * attendue obligatoire à chaque modification (écriture atomique `WHERE revision = $attendue` ; périmée → 409 avec l'état
 * courant, jamais de fusion silencieuse), duplication, classement, archivage. À la lecture, chaque couche référencée est
 * qualifiée : disponible, retirée (motif) ou inaccessible — la référence est conservée, aucune source n'est substituée.
 */
import { Router, type Request } from "express";
import { COMPOSITION_INITIALE, validerComposition, type Composition } from "@parcours/geodata-model";
import { erreur, espacePersonnel, introuvable, journal, requete, VERSION_CONSULTABLE } from "../../lib/geodata/acces.js";
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
    `SELECT id, nom, revision, etat, composition, collection_id, cree_le, modifie_le FROM geodata_cartes WHERE id = $1 AND espace_id = $2`, [id, espaceId]);
  return c ?? null;
}

const vueCarte = async (espaceId: string, c: Record<string, unknown>) => ({
  id: c["id"], nom: c["nom"], revision: c["revision"], etat: c["etat"], collectionId: c["collection_id"], creeLe: c["cree_le"], modifieLe: c["modifie_le"],
  composition: c["composition"], disponibilite: await disponibilites(espaceId, c["composition"] as Composition),
});

async function collectionDeLEspace(espaceId: string, id: unknown): Promise<boolean> {
  if (id === null || id === undefined) return true;
  if (typeof id !== "string") return false;
  const [c] = await requete("SELECT 1 FROM geodata_collections WHERE id = $1 AND espace_id = $2 AND etat = 'active'", [id, espaceId]);
  return !!c;
}

cartesRouter.get("/cartes", async (req, res) => {
  const espaceId = await espaceDe(req);
  const etat = req.query["etat"] === "archivee" ? "archivee" : "active";
  const lignes = await requete(
    `SELECT id, nom, revision, etat, collection_id, cree_le, modifie_le, jsonb_array_length(composition -> 'couches') AS couches
       FROM geodata_cartes WHERE espace_id = $1 AND etat = $2 ORDER BY modifie_le DESC LIMIT 500`, [espaceId, etat]);
  res.json({ cartes: lignes.map((l) => ({ id: l["id"], nom: l["nom"], revision: l["revision"], etat: l["etat"], collectionId: l["collection_id"], creeLe: l["cree_le"], modifieLe: l["modifie_le"], couches: l["couches"] })) });
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
  await requete(`INSERT INTO geodata_cartes (id, espace_id, proprietaire_id, nom, collection_id, composition) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, espaceId, req.user!.id, nom.trim(), collectionId ?? null, JSON.stringify(v.composition)]);
  await journal(req.user!.id, "carte.creee", id, "succes");
  res.status(201).json(await vueCarte(espaceId, (await lireCarte(espaceId, id))!));
});

cartesRouter.get("/cartes/:id", async (req, res) => {
  const espaceId = await espaceDe(req);
  const c = await lireCarte(espaceId, req.params.id);
  if (!c) return introuvable(res);
  res.json(await vueCarte(espaceId, c));
});

/** Révision : `revisionAttendue` obligatoire ; nom, composition et collection facultatifs (au moins un). */
cartesRouter.put("/cartes/:id", async (req, res) => {
  const espaceId = await espaceDe(req);
  const { revisionAttendue, nom, composition, collectionId } = (req.body ?? {}) as Record<string, unknown>;
  if (!Number.isInteger(revisionAttendue)) return erreur(res, 400, "invalid_input", "Révision attendue obligatoire.", { champs: ["revisionAttendue"] });
  if (nom !== undefined && !nomValide(nom)) return erreur(res, 400, "invalid_input", "Nom de carte de 1 à 120 caractères.", { champs: ["nom"] });
  let comp: Composition | undefined;
  if (composition !== undefined) {
    const v = validerComposition(composition);
    if (!v.ok) return erreur(res, 400, "composition_invalide", "Composition invalide.", { champs: ["composition"], details: v.erreurs });
    comp = v.composition;
  }
  if (collectionId !== undefined && !(await collectionDeLEspace(espaceId, collectionId))) return erreur(res, 400, "invalid_input", "Collection inconnue dans cet espace.", { champs: ["collectionId"] });
  if (nom === undefined && comp === undefined && collectionId === undefined) return erreur(res, 400, "invalid_input", "Aucune modification demandée.");
  if (comp) {
    const actuelle = await lireCarte(espaceId, req.params.id);
    if (!actuelle) return introuvable(res);
    const refusees = await referencesRefusees(espaceId, comp, actuelle["composition"] as Composition);
    if (refusees.length) return erreur(res, 400, "couche_inaccessible", "Couche inconnue ou non consultable par ce compte.", { couches: refusees });
  }
  const lignes = await requete(
    `UPDATE geodata_cartes SET nom = coalesce($4, nom), composition = coalesce($5::jsonb, composition),
            collection_id = CASE WHEN $6 THEN $7 ELSE collection_id END, revision = revision + 1, modifie_le = now()
      WHERE id = $1 AND espace_id = $2 AND revision = $3 AND etat = 'active' RETURNING id`,
    [req.params.id, espaceId, revisionAttendue, nom === undefined ? null : (nom as string).trim(), comp ? JSON.stringify(comp) : null, collectionId !== undefined, collectionId ?? null],
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
  await requete(`INSERT INTO geodata_cartes (id, espace_id, proprietaire_id, nom, collection_id, composition) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, espaceId, req.user!.id, nouveauNom, c["collection_id"], JSON.stringify(v.composition)]);
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
  const lignes = await requete(`SELECT co.id, co.nom, co.etat, co.cree_le, count(ca.id) FILTER (WHERE ca.etat = 'active') AS cartes FROM geodata_collections co
    LEFT JOIN geodata_cartes ca ON ca.collection_id = co.id WHERE co.espace_id = $1 GROUP BY co.id ORDER BY co.etat, co.nom`, [espaceId]);
  res.json({ collections: lignes.map((l) => ({ id: l["id"], nom: l["nom"], etat: l["etat"], creeLe: l["cree_le"], cartes: Number(l["cartes"]) })) });
});

cartesRouter.post("/collections", async (req, res) => {
  const espaceId = await espaceDe(req);
  const { nom } = (req.body ?? {}) as Record<string, unknown>;
  if (!nomValide(nom)) return erreur(res, 400, "invalid_input", "Nom de collection de 1 à 120 caractères.", { champs: ["nom"] });
  const id = newId("gdcol");
  await requete("INSERT INTO geodata_collections (id, espace_id, nom) VALUES ($1, $2, $3)", [id, espaceId, nom.trim()]);
  await journal(req.user!.id, "collection.creee", id, "succes");
  res.status(201).json({ id, nom: nom.trim(), etat: "active", cartes: 0 });
});

cartesRouter.put("/collections/:id", async (req, res) => {
  const espaceId = await espaceDe(req);
  const { nom, etat } = (req.body ?? {}) as Record<string, unknown>;
  if (nom !== undefined && !nomValide(nom)) return erreur(res, 400, "invalid_input", "Nom de collection de 1 à 120 caractères.", { champs: ["nom"] });
  if (etat !== undefined && etat !== "active" && etat !== "archivee") return erreur(res, 400, "invalid_input", "État : active ou archivee.", { champs: ["etat"] });
  const lignes = await requete(`UPDATE geodata_collections SET nom = coalesce($3, nom), etat = coalesce($4, etat) WHERE id = $1 AND espace_id = $2 RETURNING id, nom, etat`,
    [req.params.id, espaceId, typeof nom === "string" ? nom.trim() : null, etat ?? null]);
  if (!lignes.length) return introuvable(res);
  // Archiver une collection ne détruit ni ses cartes ni leurs sources : les cartes en sont simplement retirées.
  if (etat === "archivee") await requete("UPDATE geodata_cartes SET collection_id = NULL, revision = revision + 1, modifie_le = now() WHERE collection_id = $1 AND espace_id = $2", [req.params.id, espaceId]);
  res.json(lignes[0]);
});
