import LoginForm from "./LoginForm";
import "./Login.css";

export default function LoginPage() {
  return (
    <div className="login-container">
      <div className="login-card">
        <img
          src="/erp-pesquero-icon.png"
          alt="Logo de ERP Pesquero Honduras"
          style={{
            display: "block",
            width: "84px",
            height: "84px",
            objectFit: "contain",
            margin: "0 auto 20px",
          }}
        />

        <h1>ERP Pesquero Honduras</h1>

        <p>
          Sistema Integral de Comercialización
        </p>

        <LoginForm />
      </div>
    </div>
  );
}