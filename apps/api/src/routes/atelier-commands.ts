/**
 * Routes du nouvel Atelier (cahier des charges §5.4, D-029), montées sous `/projects/:projectId/atelier` à côté de
 * l'ancien Atelier (`routes/atelier.ts`, `/store`, intact jusqu'au lot 4). Aucune écriture ici : tout passe par le
 * service de commandes (`lib/atelier-commands.ts`, R9).
 *
 *   GET  /model?revision=n         → EtatModele (courant, ou reconstruit à la révision n) ; 404
 *   GET  /model/niveaux/:niveauId  → { revision, empreinte, niveauId, niveau, objets, relations } ; 404
 *   POST /commands                 → 200 { revision, empreinte, applique, effets, journalId } ; 400 ; 403 ; 404 ; 409 ; 423
 *   POST /commands/annuler         → { requestId, baseRevision, journalId? } ; réponses comme /commands
 *   POST /commands/retablir        → idem
 *   POST /commands/essai           → enveloppe ; 200 comme /commands sans journalId ; 400 ; 403 ; 409
 *   GET  /journal?apres=n          → { revisionCourante, entrees } (sans `apres` : tout le journal)
 *   GET  /problemes                → { revision, problemes }
 */
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import { essayerLot, executerLot, inverserEntree, lireJournal, lireModele, lireNiveau, lireProblemes, ReponseAtelier } from "../lib/atelier-commands.js";

export const atelierCommandsRouter = Router({ mergeParams: true });
atelierCommandsRouter.use(requireAuth);

const projetDe = (req: Request) => (req.params as Record<string, string>)["projectId"] ?? "";

/** Entier ≥ 0 d'un paramètre de requête, `undefined` s'il est absent ; lève 400 s'il est illisible. */
function entierRequete(req: Request, nom: string): number | undefined {
  const v = req.query[nom];
  if (v === undefined || v === "") return undefined;
  const n = typeof v === "string" && /^\d{1,9}$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n)) {
    const message = `Paramètre ${nom} : ${String(v)} n'est pas une révision. Action : envoyer un entier ≥ 0.`;
    throw new ReponseAtelier(400, { erreur: "invalide", message, details: [{ code: "parametre-invalide", chemin: nom, objet: `Paramètre ${nom}`, cause: "entier ≥ 0 attendu", action: "envoyer un entier ≥ 0", message }] });
  }
  return n;
}

/** Exécute le service ; un échec attendu (`ReponseAtelier`) devient sa réponse HTTP, le reste va au gestionnaire final. */
function route(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      if (err instanceof ReponseAtelier) {
        res.status(err.status).json(err.body);
        return;
      }
      throw err;
    }
  };
}

atelierCommandsRouter.get(
  "/model",
  route((req) => lireModele(projetDe(req), req.user!, entierRequete(req, "revision"))),
);
atelierCommandsRouter.get(
  "/model/niveaux/:niveauId",
  route((req) => lireNiveau(projetDe(req), req.user!, (req.params as Record<string, string>)["niveauId"] ?? "")),
);
atelierCommandsRouter.post(
  "/commands",
  route((req) => executerLot(projetDe(req), req.user!, req.body)),
);
atelierCommandsRouter.post(
  "/commands/annuler",
  route((req) => inverserEntree(projetDe(req), req.user!, "annuler", req.body)),
);
atelierCommandsRouter.post(
  "/commands/retablir",
  route((req) => inverserEntree(projetDe(req), req.user!, "retablir", req.body)),
);
atelierCommandsRouter.post(
  "/commands/essai",
  route((req) => essayerLot(projetDe(req), req.user!, req.body)),
);
atelierCommandsRouter.get(
  "/journal",
  route((req) => lireJournal(projetDe(req), req.user!, entierRequete(req, "apres") ?? -1)),
);
atelierCommandsRouter.get(
  "/problemes",
  route((req) => lireProblemes(projetDe(req), req.user!)),
);
