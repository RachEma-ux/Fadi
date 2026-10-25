/**
 * Invitations de projet reçues, dans l'application (Issue #262, phase 3, OP-D2 a : notification en plus du courriel).
 * Monté sous `/notifications/invitations` (limite de l'API, session requise).
 *
 *   GET  /              → { invitations: ReceivedInvitation[] } : invitations de projet en attente adressées à votre
 *                         adresse (jamais le jeton) ; `emailVerified` dit si l'acceptation ici est possible
 *   POST /:id/accept    → { accepted, projectId, participationId, pendingWork, replay } : mêmes refus que le lien du
 *                         courriel (expirée, annulée, déclinée, invitant révoqué, fiche d'un autre compte, participation
 *                         suspendue ou terminée, accès expiré), plus `email_unverified` (403 : sans le lien du courriel,
 *                         seule une adresse vérifiée prouve l'identité visée) ; une invitation d'une autre adresse = 404 ;
 *                         double soumission : même résultat, aucun nouvel effet (`replay: true`)
 *   POST /:id/decline   → { declined: true } ; 404 si elle n'est pas (ou plus) en attente pour vous
 */
import { Router } from "express";
import { clientIp } from "../lib/audit.js";
import { activateInvitation, inviterStillAuthorized } from "../lib/invitations.js";
import { acceptInvitationById, declineInvitationById, pendingProjectInvitationsFor } from "../lib/project-invitations-db.js";
import { INVITATION_REFUSAL_MESSAGE } from "../lib/security/invitation-rules.js";

export const notificationInvitationsRouter = Router();

notificationInvitationsRouter.get("/", async (req, res) => {
  res.json({ invitations: await pendingProjectInvitationsFor(req.user!.email), emailVerified: req.user!.emailVerified });
});

notificationInvitationsRouter.post("/:id/accept", async (req, res) => {
  const id = String(req.params["id"] ?? "").slice(0, 80);
  const user = req.user!;
  const ip = clientIp(req);
  const outcome = await acceptInvitationById(user, id, ip, {
    inviterStillAuthorized: (inv, tx) => inviterStillAuthorized(inv, tx),
    activate: (tx, inv) => activateInvitation(tx, inv, user.id, ip),
  });
  if (!outcome.ok) {
    res.status(outcome.status).json({ error: outcome.refusal, message: outcome.status === 404 ? INVITATION_REFUSAL_MESSAGE.not_found : outcome.message });
    return;
  }
  res.json({ accepted: true, projectId: outcome.projectId, participationId: outcome.participationId, pendingWork: outcome.pendingWork, replay: outcome.replay });
});

notificationInvitationsRouter.post("/:id/decline", async (req, res) => {
  const id = String(req.params["id"] ?? "").slice(0, 80);
  // Comme l'acceptation : sans le lien du courriel, seule une adresse vérifiée parle pour l'identité visée.
  if (!req.user!.emailVerified) {
    res.status(403).json({ error: "email_unverified", message: INVITATION_REFUSAL_MESSAGE.email_unverified });
    return;
  }
  if (!(await declineInvitationById(req.user!, id, clientIp(req)))) {
    res.status(404).json({ error: "not_found", message: INVITATION_REFUSAL_MESSAGE.not_found });
    return;
  }
  res.json({ declined: true });
});
