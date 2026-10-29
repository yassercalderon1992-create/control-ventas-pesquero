
import type { ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  title?: string;
  children: ReactNode;
  onClose: () => void;
}

export default function Modal({
  open,
  title,
  children,
  onClose,
}: ModalProps) {
  if (!open) return null;

  return (
    <div
      style={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Ventana"}
        style={styles.modal}
      >
        <header style={styles.header}>
          <h2>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
          >
            Cerrar
          </button>
        </header>

        {children}
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 900,
    display: "grid",
    placeItems: "center",
    padding: 16,
    background: "rgba(0,0,0,0.45)",
  },
  modal: {
    width: "100%",
    maxWidth: 700,
    maxHeight: "90vh",
    overflowY: "auto",
    padding: 24,
    borderRadius: 10,
    background: "#fff",
    color: "#1f2937",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
};
