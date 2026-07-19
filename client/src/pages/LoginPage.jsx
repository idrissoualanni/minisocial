// client/src/pages/LoginPage.jsx
import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import useStore from "../store";

const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      accessToken refreshToken
      user { id name email role }
    }
  }
`;

export default function LoginPage({ onSwitchToRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setAuth = useStore((s) => s.setAuth);
  const showToast = useStore((s) => s.showToast);

  const [login] = useMutation(LOGIN);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await login({ variables: { email, password } });
      setAuth(data.login.user, data.login.accessToken, data.login.refreshToken);
      showToast(`Bienvenue ${data.login.user.name} !`);
    } catch (err) {
      setError(err.message);
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
