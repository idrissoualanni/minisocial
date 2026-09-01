// client/src/pages/RegisterPage.tsx
import { useState } from "react";
import { signUp, signIn } from "../lib/auth-client";
import useStore from "../store";

interface RegisterPageProps {
  onSwitchToLogin: () => void;
}

export default function RegisterPage({ onSwitchToLogin }: RegisterPageProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const showToast = useStore((s) => s.showToast);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Le mot de passe doit avoir au moins 6 caractères");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await signUp.email({
        name,
        email,
        password,
      });
      if (error) {
        setError(error.message || "Erreur lors de l'inscription");
        return;
      }
      // Better Auth ne pose pas de cookie au signup → auto-login explicite
      const login = await signIn.email({ email, password });
      if (login.error) {
        showToast("Compte créé ! Connecte-toi maintenant.", "info");
        onSwitchToLogin();
        return;
      }
      showToast(`Bienvenue ${data.user.name} !`);
      // Reload to trigger useSession in App
      window.location.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Créer un compte</h1>
        <p className="auth-subtitle">Rejoins MiniSocial</p>
        {error && (
          <div className="auth-error" role="alert">
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true" style={{ marginRight: 6, verticalAlign: "-2px" }}>
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
            </svg>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} noValidate={false}>
          <div className="auth-field">
            <label htmlFor="register-name">Nom</label>
            <input
              id="register-name"
              type="text"
              placeholder="Ton nom"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              minLength={2}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
              type="email"
              placeholder="tu@exemple.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="auth-field">
            <label htmlFor="register-password">Mot de passe</label>
            <input
              id="register-password"
              type="password"
              placeholder="6 caractères minimum"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
              aria-describedby="register-password-hint"
            />
            <span id="register-password-hint" className="auth-hint">Au moins 6 caractères</span>
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? (
              <>
                <svg className="btn-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="16" height="16" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Création...
              </>
            ) : (
              "Créer mon compte"
            )}
          </button>
        </form>
        <p className="auth-switch">
          Déjà un compte ? <button onClick={onSwitchToLogin}>Se connecter</button>
        </p>
      </div>
    </div>
  );
}
