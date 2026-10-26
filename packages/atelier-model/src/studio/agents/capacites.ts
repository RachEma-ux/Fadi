/**
 * Capacités avancées du lot F engagées par la décision P-12 (F.2-01, F.2-04, F.3-01) : pour chacune, son contrat, ses
 * droits, ses coûts, sa confidentialité, sa provenance et son corpus de preuves (fichiers de test et cas contrôlés).
 * Une capacité dont l'une de ces rubriques manque n'est pas déclarée livrée (`studioCapaciteIncomplete`). Les coûts ne
 * sont jamais devinés : le traitement local n'en a aucun ; un service externe n'a que le coût **déclaré par
 * l'administrateur** (sans déclaration, il reste désactivé). Pur.
 */

export type StudioIdCapacite = "illustration-locale" | "illustration-externe" | "adaptateur-mcp" | "declaration-extensions";

export interface StudioCapaciteAvancee {
  id: StudioIdCapacite;
  libelle: string;
  lot: "F.2" | "F.3";
  /** `livree` : active par défaut ; `configurable` : livrée désactivée, activée par l'administrateur seulement. */
  etat: "livree" | "configurable";
  contrat: { version: string; routes: string[]; entrees: string[]; sorties: string[]; erreurs: string[] };
  droits: { lecture: string; ecriture: string; autres: string[] };
  couts: { nature: "aucun" | "declare-par-administrateur"; detail: string };
  confidentialite: { transfertExterne: boolean; donneesEnvoyees: string[]; controle: string };
  provenance: { champs: string[] };
  corpus: { fichiers: string[]; cas: string[] };
}

const CORPUS_MODELE = "packages/atelier-model/src/studio/agents/agents.test.ts";
const CORPUS_ILLUSTRATIONS = "apps/api/src/routes/studio-illustrations.test.ts";
const CORPUS_AGENTS = "apps/api/src/routes/studio-agents.test.ts";
const CORPUS_WEB = "apps/web/src/modules/studio/illustration/illustration.test.ts";
const CORPUS_E2E = "apps/web/e2e/studio-lot-f.mjs";

export const STUDIO_CAPACITES_AVANCEES: readonly StudioCapaciteAvancee[] = Object.freeze([
  {
    id: "illustration-locale", libelle: "Illustration dérivée du rendu (locale, sans IA)", lot: "F.2", etat: "livree",
    contrat: {
      version: "studio-illustration/1",
      routes: ["GET …/variants/:v/illustrations", "GET …/variants/:v/illustrations/fournisseurs", "POST …/variants/:v/illustrations", "GET …/variants/:v/illustrations/:id/image"],
      entrees: ["rendu PNG de la vue portant sa provenance fadi:rendu", "révision enregistrée de la variante", "paramètres { style, intensite }", "requestId"],
      sorties: ["image PNG séparée portant sa provenance fadi:illustration", "provenance complète", "statut de vérification", "limites de reproductibilité"],
      erreurs: ["400 invalid_input", "403 droits", "404 not_found", "409 archived", "409 request_conflict", "422 source_inconnue", "422 revision_differente"],
    },
    droits: { lecture: "read (tout membre qui lit la variante)", ecriture: "modify (propriétaire, éditeur)", autres: ["étude ou variante archivée : refus 409"] },
    couts: { nature: "aucun", detail: "Traitement local du serveur, sans réseau ni service tiers." },
    confidentialite: { transfertExterne: false, donneesEnvoyees: [], controle: "studioControlerTransfert : transfert « aucun »" },
    provenance: { champs: ["source.rendu", "source.empreinteImage", "modele.empreinteAvant", "modele.empreinteApres", "parametres", "auteur", "date", "fournisseur", "resultat", "verification", "reproductibilite"] },
    corpus: { fichiers: [CORPUS_MODELE, CORPUS_ILLUSTRATIONS, CORPUS_WEB, CORPUS_E2E], cas: ["mêmes pixels pour la même entrée", "modèle inchangé", "lecteur refusé", "provenance inconnue refusée"] },
  },
  {
    id: "illustration-externe", libelle: "Illustration par un service d’IA externe", lot: "F.2", etat: "configurable",
    contrat: {
      version: "studio-illustration/1",
      routes: ["POST …/variants/:v/illustrations (fournisseur « externe »)"],
      entrees: ["mêmes entrées que l’illustration locale", "classification de la source", "consentement { transfertExterne, coutAccepte }"],
      sorties: ["mêmes sorties ; fournisseur, version ou « inconnue », sources envoyées, droits, consentement, coûts et quotas"],
      erreurs: ["422 transfert_refuse (motifs du contrôle de politique)", "502 fournisseur_externe"],
    },
    droits: { lecture: "read", ecriture: "modify et droit d’export", autres: ["politique de l’administrateur", "consentement de l’utilisateur à chaque génération"] },
    couts: { nature: "declare-par-administrateur", detail: "Coût par génération déclaré par l’administrateur (STUDIO_ILLUSTRATION_EXTERNE_COUT) ; sans déclaration, le service reste désactivé." },
    confidentialite: { transfertExterne: true, donneesEnvoyees: ["image du rendu de la vue (PNG)", "paramètres de style"], controle: "studioControlerTransfert avant toute transmission" },
    provenance: { champs: ["fournisseur.version", "fournisseur.service", "sourcesEnvoyees", "droits", "autorisation.consentement", "couts", "quotas", "reproductibilite.inconnues"] },
    corpus: { fichiers: [CORPUS_MODELE, CORPUS_ILLUSTRATIONS], cas: ["désactivé par défaut", "jamais appelé sans politique, consentement, coût et clé", "double de fournisseur", "génération non garantie identique"] },
  },
  {
    id: "adaptateur-mcp", libelle: "Adaptateur d’agents (MCP)", lot: "F.3", etat: "livree",
    contrat: {
      version: "MCP 2025-06-18 (JSON-RPC 2.0), transports HTTP et stdio",
      routes: ["POST /mcp/studio", "GET|POST|DELETE …/studio/agents/jetons", "GET …/studio/agents/propositions", "POST …/studio/agents/propositions/:id/confirmer|refuser"],
      entrees: ["jeton d’agent (Authorization: Bearer) lié à un compte et à un projet", "enveloppe studio-commands/1"],
      sorties: ["lectures de l’interface", "proposition à confirmer", "révision créée par le point d’entrée commun, source « agent-mcp »"],
      erreurs: ["401 jeton", "-32602 arguments ou permission", "403 droits", "409 stale_revision", "409 request_conflict"],
    },
    droits: { lecture: "read du compte titulaire", ecriture: "modify du compte titulaire, après sa confirmation dans Studio", autres: ["un jeton ne confirme jamais", "révocation immédiate"] },
    couts: { nature: "aucun", detail: "Aucun service tiers ; l’agent est celui de l’utilisateur." },
    confidentialite: { transfertExterne: false, donneesEnvoyees: ["ce que le compte titulaire peut déjà lire, à la demande explicite de son agent"], controle: "droits de lecture du compte, revérifiés à chaque appel" },
    provenance: { champs: ["revision.source = agent-mcp", "journal studio_agent_events (acteur agent / humain)", "proposition (jeton, requestId, empreinte)"] },
    corpus: { fichiers: [CORPUS_MODELE, CORPUS_AGENTS, CORPUS_E2E], cas: ["même schéma", "mêmes droits", "confirmation humaine", "idempotence", "aucun appel par mouvement du pointeur"] },
  },
  {
    id: "declaration-extensions", libelle: "Déclaration et évaluation d’extensions", lot: "F.3", etat: "livree",
    contrat: {
      version: "studio-extension/1",
      routes: ["GET …/studio/extensions", "POST …/studio/extensions/evaluer"],
      entrees: ["déclaration : provenance, version, confiance, permissions, dépendances, mises à jour, support"],
      sorties: ["état refusee | decouverte | verifiee | autorisee", "chargement « aucun »"],
      erreurs: ["400 invalid_input"],
    },
    droits: { lecture: "read", ecriture: "aucune (évaluation sans écriture)", autres: ["autorisation de l’administrateur par identifiant@version"] },
    couts: { nature: "aucun", detail: "Évaluation locale." },
    confidentialite: { transfertExterne: false, donneesEnvoyees: [], controle: "aucun code chargé" },
    provenance: { champs: ["provenance.editeur", "provenance.source", "provenance.empreinte", "confiance", "version"] },
    corpus: { fichiers: [CORPUS_MODELE, CORPUS_AGENTS], cas: ["signature de confiance", "trouvée ≠ autorisée", "script arbitraire refusé"] },
  },
] as StudioCapaciteAvancee[]);

/** Rubriques manquantes d'une capacité ; vide : déclaration complète. */
export function studioCapaciteIncomplete(c: StudioCapaciteAvancee): string[] {
  const manque: string[] = [];
  if (!c.contrat.version || !c.contrat.routes.length || !c.contrat.entrees.length || !c.contrat.sorties.length || !c.contrat.erreurs.length) manque.push("contrat");
  if (!c.droits.lecture || !c.droits.ecriture) manque.push("droits");
  if (!c.couts.detail) manque.push("couts");
  if (!c.confidentialite.controle || (c.confidentialite.transfertExterne && !c.confidentialite.donneesEnvoyees.length)) manque.push("confidentialite");
  if (!c.provenance.champs.length) manque.push("provenance");
  if (!c.corpus.fichiers.length || !c.corpus.cas.length) manque.push("corpus");
  return manque;
}
