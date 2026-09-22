import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { login } from "../firebase/auth";

export default function LoginForm() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const credential = await login(email, password);

      console.log("Usuario:", credential.user);

      navigate("/dashboard");
    } catch (err: any) {
      console.error(err);

      switch (err.code) {
        case "auth/invalid-credential":
        case "auth/user-not-found":
        case "auth/wrong-password":
          setError("Correo o contraseña incorrectos.");
          break;

        case "auth/invalid-email":
          setError("Correo electrónico inválido.");
          break;

        case "auth/too-many-requests":
          setError("Demasiados intentos.");
          break;

        default:
          setError("No fue posible iniciar sesión.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="login-form">

      <label>Correo</label>

      <input
        type="email"
        value={email}
        placeholder="correo@ejemplo.com"
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <label>Contraseña</label>

      <input
        type="password"
        value={password}
        placeholder="********"
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      {error && (
        <p style={{ color: "red" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
      >
        {loading ? "Ingresando..." : "Iniciar sesión"}
      </button>

    </form>
  );
}