import { useAuth } from "../contexts/AuthContext";

export default function Header() {
  const { user, loading } = useAuth();

  const userLabel = user?.email?.split("@")[0] || "Usuario";
  const associationLabel =
    user?.associationId?.trim().toLowerCase() === "todas"
      ? "Administración global"
      : user?.associationName || user?.associationId || "ERP Pesquero";
  const userInitial = userLabel.trim().charAt(0).toUpperCase() || "U";

  return (
    <header className="header">
      <div className="header-brand">
        <div className="header-brand-mark" aria-hidden="true">
          <img
            className="header-brand-logo"
            src="/erp-pesquero-icon.png"
            alt=""
            draggable={false}
          />
        </div>
        <div className="header-brand-copy">
          <p className="header-eyebrow">GESTIÓN INTEGRAL</p>
          <h1 className="header-title">ERP Pesquero Honduras</h1>
          <p className="header-subtitle">
            Control comercial, inventario y finanzas
          </p>
        </div>
      </div>

      <div className="header-actions">
        {!loading && user && (
          <div className="header-user" aria-label="Usuario conectado">
            <div className="header-avatar" aria-hidden="true">
              {userInitial}
            </div>
            <div className="header-user-copy">
              <span className="header-welcome-label">Bienvenido</span>
              <strong className="header-user-name">{userLabel}</strong>
              <span className="header-user-context">
                {user.role || "Usuario"} <span aria-hidden="true">·</span> {associationLabel}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
