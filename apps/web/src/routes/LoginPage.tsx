import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { describeAuthError, useAuth } from "../lib/auth-context";
import { safeDossierReturnTo } from "../lib/dossier-return";
import { ChoixLangue } from "../components/ChoixLangue";
import "../components/comptes/comptes.css";

/**
 * Connexion en deux étapes (D-6) : mot de passe, puis — si la double authentification est active — un code à 6 chiffres
 * de l'application d'authentification ou un code de secours. L'étape « code attendu » dure 5 minutes au plus.
 */
export function LoginPage() {
  const { user, login, loginMfa } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const destination = safeDossierReturnTo(params.get("returnTo")) ?? "/accueil";
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"password" | "mfa">("password");
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user && params.get("renouveler") !== "1") {
    return <Navigate to={destination} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (step === "password") {
        const result = await login(email, password);
        if (result === "mfa") {
          setStep("mfa");
          setPassword("");
          return;
        }
      } else {
        await loginMfa(useRecovery ? { recoveryCode: code.trim() } : { code: code.replace(/\s/g, "") });
      }
      void queryClient.invalidateQueries();
      navigate(destination);
    } catch (err) {
      const message = describeAuthError(err);
      setError(message);
      if (step === "mfa" && /expiré/.test(message)) { setStep("password"); setCode(""); }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <ChoixLangue className="choix-langue choix-langue-auth" />
      <h1>Connexion</h1>
      {step === "password" ? (
        <form onSubmit={onSubmit} noValidate>
          <label htmlFor="login-email">E-mail</label>
          <input id="login-email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />

          <label htmlFor="login-password">Mot de passe</label>
          <input id="login-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />

          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      ) : (
        <form onSubmit={onSubmit} noValidate data-login-mfa>
          <p>Double authentification : saisissez le code à 6 chiffres affiché par votre application d’authentification.</p>
          <label htmlFor="login-code">{useRecovery ? "Code de secours" : "Code à 6 chiffres"}</label>
          <input
            id="login-code"
            name="code"
            type="text"
            inputMode={useRecovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            required
            autoFocus
            maxLength={useRecovery ? 32 : 8}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button type="submit" disabled={submitting || !code.trim()}>
            {submitting ? "Vérification…" : "Valider"}
          </button>
          <button type="button" className="link-button" onClick={() => { setUseRecovery(!useRecovery); setCode(""); setError(null); }}>
            {useRecovery ? "Utiliser le code de l’application" : "Utiliser un code de secours"}
          </button>
          <button type="button" className="link-button" onClick={() => { setStep("password"); setCode(""); setError(null); }}>
            Recommencer la connexion
          </button>
        </form>
      )}
      <p>
        <Link to="/compte/mot-de-passe-oublie">Mot de passe oublié ?</Link>
      </p>
      <p>
        Pas encore de compte ? <Link to="/inscription">Créer un compte</Link>
      </p>
    </main>
  );
}
