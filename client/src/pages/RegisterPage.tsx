// client/src/pages/RegisterPage.jsx
import { useState } from "react";
import { signUp } from "../lib/auth-client";
import useStore from "../store";

export default function RegisterPage({ onSwitchToLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const showToast = useStore((s) => s.showToast);

  const handleSubmit = async (e) => {
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
      showToast(`Bienvenue ${data.user.name} !`);
      // Reload to trigger useSession in App
      window.location.reload();
    } catch (err) {
      setError(err.message);
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
