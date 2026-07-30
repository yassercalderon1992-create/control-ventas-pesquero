import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/authService";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const profile = await authService.login(email, password);

      console.log("Usuario autenticado:", profile);

      navigate("/dashboard");
    } catch (err: any) {
      console.error(err);

      setError(err.message || "Error al iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <label>Correo electrónico</label>

      <input
        type="email"
        placeholder="usuario@correo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <label>Contraseña</label>

      <input
        type="password"
        placeholder="********"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      {error && (
        <p style={{ color: "red", marginTop: "10px" }}>
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