/**
 * Pages publiques des comptes (gestion des comptes, phase 5) : invitation, mot de passe oublié, réinitialisation,
 * vérification d'e-mail, annulation d'une suppression programmée. Le jeton d'un lien reçu arrive dans le fragment
 * (`#jeton=…`) : il n'est envoyé qu'au corps d'une requête POST, jamais dans une adresse ni un journal.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { accountApi, ROLE_LABEL, type InvitationLookup } from "../lib/api";
import { noticeApresAcceptation } from "../modules/collaboration/InvitationsRecues";
import { rolesLisibles } from "../modules/collaboration/participants-api";
import { describeAuthError, useAuth } from "../lib/auth-context";
import { LOCALE, LANGUE } from "../lib/i18n";
import { ChoixLangue } from "../components/ChoixLangue";
import { apiMessage, PasswordField, tokenFromHash } from "../components/comptes/ComptesUI";
import { PASSWORD_MIN } from "../lib/password-strength";

function PublicPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="auth-page public-account-page">
      <ChoixLangue className="choix-langue choix-langue-auth" />
      <h1>{title}</h1>
      {children}
    </main>
  );
}

const missingToken = <p role="alert" className="form-error">Lien incomplet : ouvrez le lien reçu par courriel tel quel (il contient un jeton après « #jeton= »).</p>;
const dateLong = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { day: "2-digit", month: "long", year: "numeric" });

export function MotDePasseOubliePage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { setDone((await accountApi.forgotPassword(email.trim(), LANGUE)).message); }
    catch (err) { setError(apiMessage(err, "La demande n’a pas pu être envoyée.")); }
    finally { setBusy(false); }
  }
  return (
    <PublicPage title="Mot de passe oublié">
      {done ? (
        <p role="status">Si un compte actif correspond à cette adresse, un lien de réinitialisation vient d’être envoyé. Il est valable 1 heure.</p>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} noValidate>
          <label htmlFor="forgot-email">E-mail du compte</label>
          <input id="forgot-email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <p role="alert" className="form-error">{error}</p>}
          <button type="submit" disabled={busy || !email.trim()}>{busy ? "Envoi…" : "Recevoir un lien"}</button>
        </form>
      )}
      <p><Link to="/connexion">Retour à la connexion</Link></p>
    </PublicPage>
  );
}

export function ReinitialiserPage() {
  const token = tokenFromHash();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if ([...password].length < PASSWORD_MIN) { setError("Le mot de passe doit contenir au moins 12 caractères."); return; }
    setBusy(true); setError(null);
    try { await accountApi.resetPassword(token, password); setDone(true); }
    catch (err) { setError(apiMessage(err, "La réinitialisation a échoué.")); }
    finally { setBusy(false); }
  }
  return (
    <PublicPage title="Nouveau mot de passe">
      {!token ? missingToken : done ? (
        <p role="status">Mot de passe modifié : toutes vos sessions ont été fermées. <Link to="/connexion">Se connecter</Link></p>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} noValidate>
          <PasswordField id="reset-password" label="Nouveau mot de passe" value={password} onChange={setPassword} />
          {error && <p role="alert" className="form-error">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer le mot de passe"}</button>
        </form>
      )}
    </PublicPage>
  );
}

/** Confirmation d'un jeton à usage unique (vérification d'e-mail, annulation de suppression), sur action explicite. */
function TokenActionPage({ title, intro, action, success, run }: { title: string; intro: string; action: string; success: ReactNode; run: (token: string) => Promise<unknown> }) {
  const token = tokenFromHash();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  return (
    <PublicPage title={title}>
      {!token ? missingToken : state === "done" ? <div role="status">{success}</div> : (
        <>
          <p>{intro}</p>
          {error && <p role="alert" className="form-error">{error}</p>}
          <button type="button" className="button-primary" disabled={state === "busy"} onClick={() => {
            setState("busy"); setError(null);
            run(token).then(() => setState("done")).catch((err: unknown) => { setError(apiMessage(err, "Le lien n’a pas pu être utilisé.")); setState("idle"); });
          }}>{state === "busy" ? "En cours…" : action}</button>
        </>
      )}
      <p><Link to="/connexion">Aller à la connexion</Link></p>
    </PublicPage>
  );
}

export function VerifierEmailPage() {
  return <TokenActionPage title="Confirmer votre adresse" intro="Confirmez que cette adresse e-mail est bien la vôtre." action="Confirmer mon adresse"
    success={<p>Adresse confirmée. Merci.</p>} run={(t) => accountApi.confirmEmail(t)} />;
}

export function AnnulerSuppressionPage() {
  return <TokenActionPage title="Annuler la suppression du compte" intro="La suppression de votre compte est programmée. Vous pouvez l’annuler tant que les 30 jours ne sont pas écoulés." action="Annuler la suppression"
    success={<p>Suppression annulée : votre compte est conservé. <Link to="/connexion">Se connecter</Link></p>} run={(t) => accountApi.cancelDeletion(t)} />;
}

export function InvitationPage() {
  const token = tokenFromHash();
  const { user, login, loginMfa, logout, adoptSession } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [lookup, setLookup] = useState<InvitationLookup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [terms, setTerms] = useState(false);
  const [mfaStep, setMfaStep] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    if (!token) return;
    accountApi.lookupInvitation(token).then(setLookup).catch((err: unknown) => setLoadError(apiMessage(err, "Invitation introuvable.")));
  }, [token, user?.id]);

  if (!token) return <PublicPage title="Invitation">{missingToken}</PublicPage>;
  if (loadError) return <PublicPage title="Invitation"><p role="alert" className="form-error">{loadError}</p><p><Link to="/connexion">Aller à la connexion</Link></p></PublicPage>;
  if (!lookup) return <PublicPage title="Invitation"><p role="status">Lecture de l’invitation…</p></PublicPage>;

  const inv = lookup.invitation;
  // Entrée dans le bon espace après acceptation : le projet, l'organisation (phase 5), sinon l'accueil.
  // Revue externe (phase 4) : l'espace de revue du paquet, jamais le projet. Phase 3 : entrée dans le projet avec le
  // travail en attente du compte (message affiché à l'arrivée).
  const finish = (projectId: string | null, organizationId?: string | null, reviewPackageId?: string | null, work?: { openObservations: number; openTasks: number }) => {
    void queryClient.invalidateQueries();
    if (reviewPackageId) navigate(`/revues/${reviewPackageId}`);
    else if (projectId) navigate(`/projets/${projectId}`, { state: { notice: noticeApresAcceptation(inv.projectName ?? "", work) } });
    else navigate(organizationId ? `/organisations/${organizationId}` : "/accueil");
  };
  const wrongAccount = !!user && user.email.toLowerCase() !== inv.email.toLowerCase();
  const blocking = lookup.refusal && lookup.refusal !== "wrong_account" ? lookup.message : null;

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (err) { setError(apiMessage(err, describeAuthError(err))); } finally { setBusy(false); }
  }
  const accept = () => run(async () => { const r = await accountApi.acceptInvitation(token); finish(r.projectId, r.organizationId, r.reviewPackageId, r.pendingWork); });
  const activate = (e: FormEvent) => {
    e.preventDefault();
    if ([...password].length < PASSWORD_MIN) { setError("Le mot de passe doit contenir au moins 12 caractères."); return; }
    if (!terms) { setError("Acceptez les conditions d’utilisation pour créer le compte."); return; }
    void run(async () => {
      const r = await accountApi.activate({ token, password, ...(displayName.trim() ? { displayName: displayName.trim() } : {}) });
      await adoptSession(r.user);
      // Compte créé à l'instant : aucun travail ne peut encore l'attendre.
      finish(r.projectId, r.organizationId, r.reviewPackageId);
    });
  };
  const signIn = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (mfaStep) { await loginMfa({ code: code.replace(/\s/g, "") }); return; }
      if ((await login(inv.email, password)) === "mfa") setMfaStep(true);
    });
  };

  return (
    <PublicPage title="Invitation">
      <dl data-invitation>
        <dt>Pour</dt><dd translate="no">{inv.email}</dd>
        <dt>De la part de</dt><dd translate="no">{inv.invitedBy || "—"}</dd>
        {inv.purpose === "organization_membership" ? (
          <>
            <dt>Organisation</dt><dd translate="no">{inv.organizationName ?? "—"}</dd>
            <dt>Rôle proposé</dt><dd>{inv.organizationRole === "administrateur" ? "Administrateur de l’organisation" : "Membre de l’organisation"}</dd>
            {inv.organizationJobTitle ? <><dt>Fonction</dt><dd translate="no">{inv.organizationJobTitle}</dd></> : null}
          </>
        ) : inv.purpose === "review_package" && inv.reviewPackage ? (
          <>
            <dt>Paquet de revue</dt><dd translate="no">{inv.reviewPackage.title} (version {inv.reviewPackage.version})</dd>
            <dt>Projet</dt><dd translate="no">{inv.reviewPackage.projectLabel}</dd>
            <dt>Responsabilité</dt><dd>{inv.reviewPackage.responsibility === "approbation" ? "Approbation" : "Relecture"}</dd>
            {inv.accessExpiresAt ? <><dt>Accès jusqu’au</dt><dd>{dateLong(inv.accessExpiresAt)}</dd></> : null}
          </>
        ) : inv.projectName ? (
          <>
            <dt>Projet</dt><dd translate="no">{inv.projectName}</dd>
            <dt>Rôle proposé</dt><dd>{inv.projectRole ? ROLE_LABEL[inv.projectRole] : "—"}</dd>
            {inv.roles?.length ? <><dt>Rôles par portée</dt><dd data-invitation-roles>{rolesLisibles(inv.roles)}</dd></> : null}
            <dt>Accès</dt><dd>{inv.accessExpiresAt ? `jusqu’au ${dateLong(inv.accessExpiresAt)}` : "sans échéance"}</dd>
          </>
        ) : <><dt>Objet</dt><dd>Création d’un compte Fadi</dd></>}
        <dt>Valable jusqu’au</dt><dd>{dateLong(inv.expiresAt)}</dd>
      </dl>
      <p className="h7-muted">Une invitation est une proposition : rien n’est créé ni partagé tant que vous ne l’acceptez pas.</p>
      {inv.purpose === "review_package" && <p className="h7-muted" data-invitation-review>Une invitation de revue donne accès à ce paquet seulement : ni au projet, ni à l’organisation qui l’a préparé.</p>}
      {inv.purpose === "organization_membership" && <p className="h7-muted" data-invitation-organization>Une adhésion à une organisation n’ouvre aucun projet : chaque projet vous invite séparément.</p>}
      {declined ? <p role="status">Invitation déclinée. Aucun accès n’a été donné.</p>
        : blocking ? <p role="alert" className="form-error">{blocking}</p>
        : wrongAccount ? (
          <>
            <p role="alert" className="form-error">Cette invitation est destinée à une autre adresse que celle du compte connecté (<span translate="no">{user.email}</span>). Connectez-vous avec le compte invité.</p>
            <button type="button" className="button-secondary" onClick={() => void logout()}>Se déconnecter</button>
          </>
        ) : user ? (
          <div className="h7-actions">
            <button type="button" className="button-primary" disabled={busy} onClick={() => void accept()} data-accept-invitation>Accepter l’invitation</button>
          </div>
        ) : lookup.accountExists ? (
          <form onSubmit={signIn} noValidate>
            <p>Un compte existe déjà pour cette adresse : connectez-vous pour accepter.</p>
            {mfaStep ? (
              <>
                <label htmlFor="inv-code">Code à 6 chiffres</label>
                <input id="inv-code" name="code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
              </>
            ) : (
              <>
                <label htmlFor="inv-login-password">Mot de passe</label>
                <input id="inv-login-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </>
            )}
            <button type="submit" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}</button>
          </form>
        ) : (
          <form onSubmit={activate} noValidate data-activate>
            <p>Créez votre compte pour accepter l’invitation. L’adresse est celle de l’invitation.</p>
            <label htmlFor="inv-name">Nom affiché (facultatif)</label>
            <input id="inv-name" name="displayName" type="text" maxLength={60} autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <PasswordField id="inv-password" label="Mot de passe (12 caractères minimum)" value={password} onChange={setPassword} />
            <label className="h7-checkbox">
              <input type="checkbox" name="acceptTerms" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> J’accepte les conditions d’utilisation de Fadi
            </label>
            <button type="submit" disabled={busy}>{busy ? "Création…" : "Créer mon compte et accepter"}</button>
          </form>
        )}
      {error && <p role="alert" className="form-error">{error}</p>}
      {!declined && !blocking && !wrongAccount && (
        <p>
          <button type="button" className="link-button" disabled={busy} onClick={() => void run(async () => { await accountApi.declineInvitation(token); setDeclined(true); })}>
            Décliner l’invitation
          </button>
        </p>
      )}
    </PublicPage>
  );
}
