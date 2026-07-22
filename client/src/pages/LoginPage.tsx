// client/src/pages/LoginPage.jsx
import { useState } from "react";
import { signIn } from "../lib/auth-client";
import useStore from "../store";

interface LoginPageProps {
  onSwitchToRegister: () => void;
}

export default function LoginPage({ onSwitchToRegister }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const showToast = useStore((s) => s.showToast);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data, error } = await signIn.email({
        email,
        password,
      });
      if (error) {
        setError(error.message || "Email ou mot de passe incorrect");
        return;
      }
      showToast(`Bienvenue !`);
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
        <h1>Connexion</h1>
        <p className="auth-subtitle">Connecte-toi à MiniSocial</p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
        <p className="auth-switch">
          Pas de compte ? <button onClick={onSwitchToRegister}>Créer un compte</button>
        </p>
      </div>
    </div>
  );
}
