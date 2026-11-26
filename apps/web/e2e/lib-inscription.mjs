/**
 * Aides de recette : inscription par le lien du courriel (Issue #425). `POST /auth/register` répond 202 pour toute
 * adresse et n'ouvre aucune session ; le compte naît sur la page du lien (`/compte/creer#jeton=…`, même page que les invitations), où la personne
 * choisit son mot de passe et accepte les conditions (`POST /auth/activate`, qui ouvre la session). Le lien est lu dans
 * Mailpit (`MAILPIT_URL`, CI) ou dans le journal de l'API (`API_LOG`, `MAIL_TRANSPORT=console`, poste local).
 */
import { jetonDuCourriel, jetonsDuCourriel } from "./lib-invitations.mjs";

export const CHEMIN_INSCRIPTION = "/compte/creer";
const CHEMIN = CHEMIN_INSCRIPTION;
const adresse = (email) => String(email).trim().toLowerCase();
/** Liens déjà reçus avant la demande : le lien attendu est le suivant (une réinscription de la même adresse en reçoit un nouveau). */
export const liensAvant = async (email) => (await jetonsDuCourriel(adresse(email), CHEMIN)).length;
export const lienAttendu = async (email, avant) => {
  const jeton = await jetonDuCourriel(adresse(email), CHEMIN, { attendus: avant + 1 });
  if (!jeton) throw new Error(`lib-inscription : aucun lien d'inscription reçu pour ${email}`);
  return jeton;
};

/**
 * Inscription par l'API, session ouverte dans `call` (`(méthode, chemin, corps?) => Promise<{ status, body }>`).
 * Rend la forme de l'ancienne inscription : `{ status: 201, body: compte }` ; toute autre réponse telle quelle.
 * `methode` : la casse attendue par `call` ("POST" ou "post").
 */
export async function inscrire(call, identifiants, methode = "POST") {
  const { email, password, displayName } = identifiants;
  const avant = await liensAvant(email);
  const demande = await call(methode, "/auth/register", { email });
  if (demande.status !== 202) return demande;
  const token = await lienAttendu(email, avant);
  const r = await call(methode, "/auth/activate", { token, password, acceptTerms: true, ...(displayName ? { displayName } : {}) });
  return { ...r, body: r.status === 201 ? r.body?.user ?? r.body : r.body };
}

/**
 * Inscription dans l'interface : adresse sur /inscription, puis mot de passe et conditions sur la page du lien.
 * `dejaSurLaPage` : la page d'inscription est déjà ouverte (langue choisie dessus, par exemple).
 */
export async function inscrireDansLaPage(page, email, password, base, { dejaSurLaPage = false } = {}) {
  if (!dejaSurLaPage) await page.goto(`${base}/inscription`);
  const avant = await liensAvant(email);
  await page.fill('input[name="email"]', email);
  await page.click('button[type="submit"]');
  await page.locator("[data-register-sent]").waitFor();
  const token = await lienAttendu(email, avant);
  await page.goto(`${base}${CHEMIN}#jeton=${encodeURIComponent(token)}`);
  await page.locator("form[data-activate]").waitFor();
  await page.fill("#inv-password", password);
  await page.check('input[name="acceptTerms"]');
  await page.click('form[data-activate] button[type="submit"]');
}

/**
 * Inscription par un contexte de requêtes Playwright (`page.request`, `context.request`, `request.newContext()`) : la
 * session ouverte par l'activation reste dans ce contexte. Rend `{ status, body }` (201 et le compte en cas de succès).
 */
export async function inscrireAvecContexte(ctx, base, identifiants, headers = {}) {
  const call = async (method, path, data) => {
    const r = await ctx.fetch(`${base}${path}`, { method, headers: { origin: base, ...headers }, data });
    return { status: r.status(), body: await r.json().catch(() => null) };
  };
  return inscrire(call, identifiants, "POST");
}
