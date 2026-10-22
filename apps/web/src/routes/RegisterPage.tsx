import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { describeAuthError, useAuth } from "../lib/auth-context";
import { ChoixLangue } from "../components/ChoixLangue";
import { PasswordField } from "../components/comptes/ComptesUI";
import { PASSWORD_MIN } from "../lib/password-strength";

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/accueil" replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if ([...password].length < PASSWORD_MIN) {
      setError("Le mot de passe doit contenir au moins 12 caractères.");
      return;
    }
    setSubmitting(true);
    try {
      await register(email, password);
      navigate("/accueil");
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <ChoixLangue className="choix-langue choix-langue-auth" />
      <h1>Créer un compte</h1>
      <form onSubmit={onSubmit} noValidate>
        <label htmlFor="register-email">E-mail</label>
        <input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <PasswordField id="register-password" label="Mot de passe (12 caractères minimum)" value={password} onChange={setPassword} />

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? "Création…" : "Créer le compte"}
        </button>
      </form>
      <p>
        Déjà un compte ? <Link to="/connexion">Se connecter</Link>
      </p>
    </main>
  );
}
