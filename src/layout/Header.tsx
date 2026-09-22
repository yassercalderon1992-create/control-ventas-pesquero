import { useNavigate } from "react-router-dom";

import { logout } from "../firebase/auth";

export default function Header() {

  const navigate = useNavigate();

  async function handleLogout() {

    await logout();

    navigate("/");
  }

  return (
    <header className="header">

      <div className="header-left">
        <h2>ERP Pesquero Honduras</h2>
      </div>

      <div className="header-right">

        <span>Bienvenido</span>

        <button
          className="logout-button"
          onClick={handleLogout}
        >
          Cerrar sesión
        </button>

      </div>

    </header>
  );
}