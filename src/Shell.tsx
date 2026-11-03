import type { ReactNode } from "react";

interface ShellProps {
  admin: boolean;
  children: ReactNode;
}

export function Shell({ admin, children }: ShellProps) {
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Saltar al contenido
      </a>
      <div className="demo-bar">
        <strong>Demostración:</strong> las solicitudes solo se guardan en este navegador y no llegan
        automáticamente al propietario. El QR permite transferencias reales.
      </div>
      <header className="app-header">
        <a className="app-brand" href="#/" aria-label="Boss Barber Shop by RF, inicio">
          <span className="app-brand-mark" aria-hidden="true">
            B.
          </span>
          <span className="app-brand-name">
            Boss Barber Shop <small>by RF · Reservas y gestión demo</small>
          </span>
        </a>
        <nav className="app-nav" aria-label="Navegación principal">
          <a href="#/" aria-current={!admin ? "page" : undefined}>
            Reservar
          </a>
          <a href="#/admin" aria-current={admin ? "page" : undefined}>
            Administración
          </a>
        </nav>
      </header>
      <div id="main-content" tabIndex={-1}>
        {children}
      </div>
      <footer className="app-footer">
        Demo sin servidor ni sincronización. Usa datos ficticios; el acceso y los enlaces externos
        requieren conexión.
      </footer>
    </>
  );
}
