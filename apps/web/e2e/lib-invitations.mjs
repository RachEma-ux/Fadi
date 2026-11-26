/**
 * Aides de recette : invitation acceptée (Issue #262, phase 3, OP-D2 a — plus aucun ajout direct d'un compte existant).
 * Un propriétaire invite (`POST /projects/:id/members` → 202) ; le compte visé accepte depuis sa notification
 * (`POST /notifications/invitations/:id/accept`). Sans le lien du courriel, l'acceptation exige une adresse vérifiée :
 * l'aide confirme alors l'adresse du compte avec le lien de vérification reçu à l'inscription, lu dans Mailpit
 * (`MAILPIT_URL`, CI) ou dans le journal de l'API (`API_LOG`, `MAIL_TRANSPORT=console`, poste local).
 *
 * `call` : toute fonction `(méthode, chemin, corps?) => Promise<{ status, body }>` portant la session du compte.
 */
import { readFileSync } from "node:fs";

const MAILPIT = process.env.MAILPIT_URL?.replace(/\/$/, "");
const API_LOG = process.env.API_LOG;

/**
 * Dernier jeton d'un lien `…<chemin>#jeton=…` envoyé à cette adresse (attente bornée : la file part toutes les 5 s).
 * `attendus` : nombre de courriels de ce type à attendre avant de rendre le plus récent (un renvoi remplace le lien
 * précédent : sans cette attente, le premier courriel arrivé seul rendrait un jeton périmé). À défaut, le plus récent
 * reçu à la fin de l'attente.
 */
export async function jetonDuCourriel(to, chemin, { tentatives = 60, attendus = 1 } = {}) {
  let dernier = null;
  for (let i = 0; i < tentatives; i++) {
    const links = await jetonsDuCourriel(to, chemin);
    if (links.length) {
      dernier = links[0];
      if (links.length >= attendus) return dernier;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return dernier;
}

/** Jetons des liens `…<chemin>#jeton=…` déjà reçus à cette adresse, du plus récent au plus ancien (une seule lecture). */
export async function jetonsDuCourriel(to, chemin) {
  if (!MAILPIT && !API_LOG) throw new Error("lib-invitations : MAILPIT_URL ou API_LOG requis pour lire les courriels de la recette");
  let text = "";
  if (MAILPIT) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
    for (const msg of list.messages ?? []) text += `${(await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()).Text ?? ""}\n`;
  } else {
    text = readFileSync(API_LOG, "utf8").split("\n").filter((l) => l.includes(`"to":"${to}"`)).map((l) => { try { return JSON.parse(l).text; } catch { return ""; } }).join("\n");
  }
  const links = [...text.matchAll(/https?:\/\/\S+#jeton=([A-Za-z0-9_%-]+)/g)].filter((m) => m[0].includes(chemin)).map((m) => decodeURIComponent(m[1]));
  // Mailpit rend les messages du plus récent au plus ancien ; le journal de l'API, dans l'ordre d'écriture.
  return MAILPIT ? links : links.reverse();
}

/**
 * Confirme l'adresse du compte. Depuis l'inscription par lien (Issue #425), un compte créé par le lien a déjà son adresse
 * vérifiée : 200 sans courriel. Sinon (compte antérieur), lien de vérification demandé puis suivi.
 */
export async function verifierAdresse(call, email) {
  const me = await call("GET", "/auth/me");
  if (me.status === 200 && me.body?.emailVerified) return { status: 200, body: { verified: true, already: true } };
  await call("POST", "/auth/verify-email/request", {});
  const token = await jetonDuCourriel(email, "/compte/verifier-email");
  if (!token) return { status: 0, body: { error: "verification_mail_missing" } };
  return call("POST", "/auth/verify-email/confirm", { token });
}

/** Le compte accepte l'invitation depuis sa notification ; adresse vérifiée d'abord si le serveur l'exige. */
export async function accepterInvitation(call, email, invitationId) {
  const path = `/notifications/invitations/${encodeURIComponent(invitationId)}/accept`;
  let r = await call("POST", path, {});
  if (r.status === 403 && r.body?.error === "email_unverified") {
    await verifierAdresse(call, email);
    r = await call("POST", path, {});
  }
  return r;
}

/**
 * Invitation puis acceptation — par le lien rendu quand aucun courriel n'est parti, sinon depuis la notification :
 * `ok` vrai si l'invitation est partie (202) et a été acceptée (200), ou si le compte était
 * déjà membre (200, rôle changé). `body` : réponse de l'acceptation ({ projectId, participationId, pendingWork }).
 */
export async function inviterEtAccepter(owner, member, projectId, email, roleOrRoles = "lecteur") {
  const body = Array.isArray(roleOrRoles) ? { email, roles: roleOrRoles } : { email, role: roleOrRoles };
  const invite = await owner("POST", `/projects/${projectId}/members`, body);
  if (invite.status === 200) return { ok: true, invite, accept: null };
  if (invite.status !== 202) return { ok: false, invite, accept: null };
  // Sans envoi de courriel (transport désactivé, D-1), l'API rend le lien au propriétaire : l'acceptation par ce lien
  // prouve la détention de la boîte et n'exige donc aucune vérification d'adresse (aucun courriel à lire).
  const lien = invite.body?.mail?.link;
  const jeton = typeof lien === "string" ? lien.split("#jeton=")[1] : null;
  const accept = jeton
    ? await member("POST", "/auth/invitations/accept", { token: decodeURIComponent(jeton) })
    : await accepterInvitation(member, email, invite.body.invitation.id);
  return { ok: accept.status === 200 && accept.body?.projectId === projectId, invite, accept };
}

/** Adaptateur pour un contexte de requêtes Playwright (`page.request` ou `request.newContext()`). */
export const appelPlaywright = (ctx, base) => async (method, path, body) => {
  const r = await ctx.fetch(`${base}${path}`, { method, headers: { origin: base, ...(body === undefined ? {} : { "content-type": "application/json" }) }, data: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await r.json(); } catch { json = null; }
  return { status: r.status(), body: json };
};
