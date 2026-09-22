import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <h3 className="sidebar-title">
        Menú
      </h3>

      <nav className="sidebar-menu">

        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            isActive ? "menu-item active" : "menu-item"
          }
        >
          📊 Dashboard
        </NavLink>

        <NavLink
          to="/inventory"
          className={({ isActive }) =>
            isActive ? "menu-item active" : "menu-item"
          }
        >
          📦 Inventario
        </NavLink>

        <NavLink
          to="/movements"
          className={({ isActive }) =>
            isActive ? "menu-item active" : "menu-item"
          }
        >
          🚚 Movimientos
        </NavLink>

        <NavLink
          to="/reports"
          className={({ isActive }) =>
            isActive ? "menu-item active" : "menu-item"
          }
        >
          📈 Reportes
        </NavLink>

        <NavLink
          to="/admin"
          className={({ isActive }) =>
            isActive ? "menu-item active" : "menu-item"
          }
        >
          ⚙️ Administración
        </NavLink>

      </nav>
    </aside>
  );
}