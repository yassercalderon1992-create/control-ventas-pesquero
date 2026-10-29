import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { logout } from "../firebase/auth";

type MenuItem = {
  to: string;
  label: string;
  icon: string;
};

// Conserva el orden de los módulos del ERP, incluido el Libro Diario (/journal).
const baseMenuItems: MenuItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: "▦" },
  { to: "/inventory", label: "Inventario", icon: "▤" },
  { to: "/operations", label: "Ventas y compras", icon: "⇄" },
  { to: "/finance", label: "Caja y gastos", icon: "$" },
  { to: "/movements", label: "Movimientos", icon: "↗" },
  { to: "/journal", label: "Libro diario", icon: "▤" },
  { to: "/reports", label: "Reportes", icon: "▥" },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isGlobalAdmin =
    user?.active === true &&
    user?.role === "Administrador" &&
    (user?.associationId ?? "").trim().toLowerCase() === "todas";

  const menuItems: MenuItem[] = isGlobalAdmin
    ? [...baseMenuItems, { to: "/admin", label: "Administración", icon: "⚙" }]
    : baseMenuItems;

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? "menu-item active" : "menu-item";

  async function handleLogout() {
    const confirmed = window.confirm("¿Seguro que deseas cerrar la sesión?");
    if (!confirmed) return;

    try {
      await logout();
      navigate("/", { replace: true });
    } catch (error) {
      console.error("No se pudo cerrar la sesión:", error);
      window.alert("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-heading">
        <div className="sidebar-heading-mark" aria-hidden="true">
          <img
            className="sidebar-brand-logo"
            src="/erp-pesquero-icon.png"
            alt=""
            draggable={false}
          />
        </div>
        <div>
          <p className="sidebar-kicker">ERP PESQUERO</p>
          <h2 className="sidebar-title">Panel de gestión</h2>
        </div>
      </div>

      <p className="sidebar-section-label">MENÚ PRINCIPAL</p>
      <nav className="sidebar-menu" aria-label="Navegación principal">
        {menuItems.map((item) => (
          <NavLink key={item.to} to={item.to} className={itemClass}>
            <span className="menu-icon" aria-hidden="true">{item.icon}</span>
            <span className="menu-label">{item.label}</span>
            <span className="menu-arrow" aria-hidden="true">›</span>
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        className="sidebar-logout-button"
        onClick={() => void handleLogout()}
      >
        <span className="sidebar-logout-icon" aria-hidden="true">↪</span>
        <span>Cerrar sesión</span>
      </button>

      <div className="sidebar-footer">
        <span className="sidebar-footer-dot" aria-hidden="true" />
        <span>Gestión pesquera comunitaria</span>
      </div>
    </aside>
  );
}
