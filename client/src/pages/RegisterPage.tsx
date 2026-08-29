// client/src/pages/RegisterPage.jsx
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
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Mot de passe (6+ caractères)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Création..." : "Créer mon compte"}
          </button>
        </form>
        <p className="auth-switch">
          Déjà un compte ? <button onClick={onSwitchToLogin}>Se connecter</button>
        </p>
      </div>
    </div>
  );
}
