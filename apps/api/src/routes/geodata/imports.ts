/**
 * Import GeoJSON personnel (plan GD-07, D-GD-07) : réception (taille bornée, empreinte), validation par le modèle partagé
 * (`validerGeoJSON` : CRS, plages, structure, limites, attributs inertes), aperçu et diagnostic, puis confirmation
 * explicite → couche **privée** versionnée de l'espace (jamais publiée au catalogue commun). Une réception n'est pas un
 * import validé ; un fichier rejeté ne laisse aucun état publié. Idempotent par `requestId` ; un import non confirmé
 * expire après 24 h et son contenu est effacé.
 */
import { createHash } from "node:crypto";
import express, { Router, type Request } from "express";
import { DROITS_IMPORT_PERSONNEL, LIMITES_IMPORT, validerGeoJSON, type ObjetImporte, type RapportImport } from "@parcours/geodata-model";
import { erreur, espacePersonnel, introuvable, journal, requete, transaction } from "../../lib/geodata/acces.js";
import { ecrireVersion } from "../../lib/geodata/versions.js";
import { newId } from "../../lib/ids.js";

export const importsRouter = Router();
const corps = express.json({ limit: Math.ceil(LIMITES_IMPORT.octets * 1.2) });

const espaceDe = async (req: Request) => (await espacePersonnel(req.user!.id)).id;
const DUREE_IMPORT_MS = 24 * 3_600_000;

const vueImport = (l: Record<string, unknown>) => ({
  id: l["id"], requestId: l["request_id"], etat: l["etat"], nomFichier: l["nom_fichier"], taille: l["taille"], empreinte: l["empreinte"],
  rapport: l["rapport"], versionId: l["version_id"], creeLe: l["cree_le"], expireLe: l["expire_le"],
});

async function expirer(espaceId: string) {
  await requete(`UPDATE geodata_imports SET etat = 'expire', contenu = NULL WHERE espace_id = $1 AND etat = 'valide' AND expire_le < now()`, [espaceId]);
}

importsRouter.get("/imports", async (req, res) => {
  const espaceId = await espaceDe(req);
  await expirer(espaceId);
  const lignes = await requete(`SELECT id, request_id, etat, nom_fichier, taille, empreinte, rapport, version_id, cree_le, expire_le FROM geodata_imports WHERE espace_id = $1 ORDER BY cree_le DESC LIMIT 100`, [espaceId]);
  res.json({ imports: lignes.map(vueImport), limites: LIMITES_IMPORT });
});

importsRouter.post("/imports", corps, async (req, res) => {
  const espaceId = await espaceDe(req);
  await expirer(espaceId);
  const { requestId, nomFichier, contenu } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) return erreur(res, 400, "invalid_input", "Identifiant de demande attendu.", { champs: ["requestId"] });
  if (typeof nomFichier !== "string" || !/\.(geo)?json$/i.test(nomFichier) || nomFichier.length > 200) return erreur(res, 400, "format_non_pris_en_charge", "Fichier GeoJSON attendu (.geojson ou .json).", { champs: ["nomFichier"] });
  const [deja] = await requete(`SELECT id, request_id, etat, nom_fichier, taille, empreinte, rapport, version_id, cree_le, expire_le FROM geodata_imports WHERE espace_id = $1 AND request_id = $2`, [espaceId, requestId]);
  if (deja) return void res.status(200).json(vueImport(deja));
  if (typeof contenu !== "string") return erreur(res, 400, "invalid_input", "Contenu du fichier attendu.", { champs: ["contenu"] });
  const taille = Buffer.byteLength(contenu, "utf8");
  if (taille > LIMITES_IMPORT.octets) return erreur(res, 413, "limite_depassee", `Fichier de ${taille} octets : ${LIMITES_IMPORT.octets} au plus.`, { limite: LIMITES_IMPORT.octets });
  const empreinte = createHash("sha256").update(contenu, "utf8").digest("hex");
  let brut: unknown;
  let rapport: RapportImport;
  let objets: readonly ObjetImporte[] | null = null;
  try {
    brut = JSON.parse(contenu);
    const v = validerGeoJSON(brut);
    rapport = v.rapport;
    if (v.ok) objets = v.objets;
  } catch {
    rapport = { objets: 0, sommets: 0, types: {}, emprise: null, proprietes: [], diagnostics: [{ niveau: "erreur", code: "json-illisible", message: "Le fichier n'est pas un JSON valide." }] };
  }
  const id = newId("gdimp");
  const [l] = await requete(
    `INSERT INTO geodata_imports (id, espace_id, demandeur_id, request_id, etat, nom_fichier, taille, empreinte, rapport, contenu, expire_le)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (espace_id, request_id) DO UPDATE SET request_id = EXCLUDED.request_id
     RETURNING id, request_id, etat, nom_fichier, taille, empreinte, rapport, version_id, cree_le, expire_le`,
    [id, espaceId, req.user!.id, requestId, objets ? "valide" : "rejete", nomFichier, taille, empreinte, JSON.stringify(rapport), objets ? JSON.stringify(objets) : null, new Date(Date.now() + DUREE_IMPORT_MS)],
  );
  await journal(req.user!.id, objets ? "import.valide" : "import.rejete", l!["id"] as string, objets ? "succes" : "refus", { objets: rapport.objets, taille });
  res.status(201).json(vueImport(l!));
});

/** Confirmation : couche privée versionnée de l'espace, en une transaction. */
importsRouter.post("/imports/:id/confirmer", async (req, res) => {
  const espaceId = await espaceDe(req);
  await expirer(espaceId);
  const { titre } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof titre !== "string" || titre.trim().length < 1 || titre.trim().length > 120) return erreur(res, 400, "invalid_input", "Titre de couche de 1 à 120 caractères.", { champs: ["titre"] });
  const resultat = await transaction(async (client) => {
    const [imp] = (await client.query(`SELECT * FROM geodata_imports WHERE id = $1 AND espace_id = $2 FOR UPDATE`, [req.params.id, espaceId])).rows;
    if (!imp) return { statut: 404 as const };
    if (imp.etat === "confirme") return { statut: 200 as const, imp };
    if (imp.etat !== "valide" || !imp.contenu) return { statut: 409 as const, etat: imp.etat };
    const objets = imp.contenu as ObjetImporte[];
    const ecrite = await ecrireVersion(client, {
      source: { cle: `import-${imp.id}`, titre: titre.trim(), producteur: "Import de l'utilisateur", theme: "donnees-personnelles", couverture: "Selon le fichier importé", description: `Fichier « ${imp.nom_fichier} » importé dans l'espace personnel.` },
      espaceId,
      version: {
        libelle: `Import du ${new Date().toISOString().slice(0, 10)}`, empreinte: imp.empreinte, fichierNom: imp.nom_fichier, fichierTaille: imp.taille, urlSource: null,
        recupereLe: new Date(imp.cree_le).toISOString(), periode: null, licence: "Données de l'utilisateur", attribution: `Import : ${imp.nom_fichier}`,
        droits: DROITS_IMPORT_PERSONNEL, crsSource: "WGS 84 (CRS84, RFC 7946)", precision: null,
        transformations: ["Validation GeoJSON GeoData (RFC 7946) ; attributs non primitifs écartés ; altitudes non conservées"], controles: { rapport: imp.rapport }, synthetique: false,
      },
      couche: { titre: titre.trim(), description: "", niveau: null, champCode: null, champNom: (imp.rapport.proprietes as string[]).find((p) => /^(nom|name|libelle|titre)$/i.test(p)) ?? null, proprietesExposees: (imp.rapport.proprietes as string[]).slice(0, 50), styleDefaut: { mode: "simple", couleur: "#d95f02" } },
      objets, indicateurs: [], superficie: true, preparePar: req.user!.id,
    });
    await client.query(`UPDATE geodata_versions SET etat = 'publiee', publiee_par = $2, publiee_le = now() WHERE id = $1`, [ecrite.versionId, req.user!.id]);
    const [maj] = (await client.query(`UPDATE geodata_imports SET etat = 'confirme', contenu = NULL, version_id = $2 WHERE id = $1 RETURNING *`, [imp.id, ecrite.versionId])).rows;
    return { statut: 201 as const, imp: maj, ecrite };
  });
  if (resultat.statut === 404) return introuvable(res);
  if (resultat.statut === 409) return erreur(res, 409, "import_non_confirmable", resultat.etat === "expire" ? "Import expiré : déposez à nouveau le fichier." : "Import rejeté ou annulé : rien n'a été publié.", { etat: resultat.etat });
  const [couche] = await requete<{ id: string }>(`SELECT c.id FROM geodata_couches c WHERE c.version_id = $1`, [resultat.imp.version_id]);
  if (resultat.statut === 201) await journal(req.user!.id, "import.confirme", req.params.id, "succes", { objets: resultat.ecrite.objets, reparees: resultat.ecrite.reparees });
  res.status(resultat.statut).json({ ...vueImport(resultat.imp), coucheId: couche?.id ?? null, reparees: resultat.statut === 201 ? resultat.ecrite.reparees : undefined });
});

importsRouter.post("/imports/:id/annuler", async (req, res) => {
  const espaceId = await espaceDe(req);
  const lignes = await requete(`UPDATE geodata_imports SET etat = 'annule', contenu = NULL WHERE id = $1 AND espace_id = $2 AND etat IN ('valide', 'rejete') RETURNING id, request_id, etat, nom_fichier, taille, empreinte, rapport, version_id, cree_le, expire_le`, [req.params.id, espaceId]);
  if (!lignes.length) {
    const [l] = await requete(`SELECT etat FROM geodata_imports WHERE id = $1 AND espace_id = $2`, [req.params.id, espaceId]);
    if (!l) return introuvable(res);
    return erreur(res, 409, "import_non_annulable", "Import déjà confirmé, annulé ou expiré.", { etat: l["etat"] });
  }
  await journal(req.user!.id, "import.annule", req.params.id, "succes");
  res.json(vueImport(lignes[0]!));
});
