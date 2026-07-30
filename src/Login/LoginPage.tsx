import LoginForm from "./LoginForm";
import "./Login.css";

export default function LoginPage() {
  return (
    <div className="login-container">
      <div className="login-card">

        <div className="logo">
          🐟
        </div>

        <h1>ERP Pesquero Honduras</h1>

        <p>
          Sistema Integral de Comercialización
        </p>

        <LoginForm />

      </div>
    </div>
  );
}