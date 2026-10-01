import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { describeAuthError, useAuth } from "../lib/auth-context";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/projets" replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/projets");
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <h1>Connexion</h1>
      <form onSubmit={onSubmit} noValidate>
        <label htmlFor="login-email">E-mail</label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="login-password">Mot de passe</label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? "Connexion…" : "Se connecter"}
        </button>
      </form>
      <p>
        Pas encore de compte ? <Link to="/inscription">Créer un compte</Link>
      </p>
    </main>
  );
}
