export default function Header() {
    return (
      <header className="header">
        <div className="header-left">
          <h2>ERP Pesquero Honduras</h2>
        </div>
  
        <div className="header-right">
          <span>Bienvenido</span>
  
          <button className="logout-button">
            Cerrar sesión
          </button>
        </div>
      </header>
    );
  }