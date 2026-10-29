import { NavLink } from "react-router-dom";

export default function Sidebar() {
  const itemClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? "menu-item active" : "menu-item";

  return (
    <aside className="sidebar">
      <h3 className="sidebar-title">Menú</h3>
      <nav className="sidebar-menu">
        <NavLink to="/dashboard" className={itemClass}>📊 Dashboard</NavLink>
        <NavLink to="/inventory" className={itemClass}>📦 Inventario</NavLink>
        <NavLink to="/operations" className={itemClass}>🧾 Ventas y compras</NavLink>
        <NavLink to="/finance" className={itemClass}>💵 Caja y gastos</NavLink>
        <NavLink to="/movements" className={itemClass}>🚚 Movimientos</NavLink>
        <NavLink to="/reports" className={itemClass}>📈 Reportes</NavLink>
        <NavLink to="/admin" className={itemClass}>⚙️ Administración</NavLink>
      </nav>
    </aside>
  );
}
