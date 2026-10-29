
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import MainLayout from "../layout/MainLayout";
import ProductForm from "./ProductForm";
import { useProducts } from "./useProducts";

const moneyFormatter = new Intl.NumberFormat("es-HN", {
  style: "currency",
  currency: "HNL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function InventoryPage() {
  const {
    products,
    loading,
    error,
    reload,
  } = useProducts();

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return products;
    }

    return products.filter((product) =>
      [
        product.code,
        product.name,
        product.category,
        product.unit,
        product.associationName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [products, search]);

  const lowStockCount = products.filter(
    (product) =>
      product.stock <= (product.stockMinimo ?? 10)
  ).length;

  const inventoryValue = products.reduce(
    (total, product) =>
      total + product.stock * product.purchaseCostLb,
    0
  );

  return (
    <MainLayout>
      <main style={styles.page}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Inventario</h1>
            <p style={styles.subtitle}>
              Administración de productos y existencias por asociación.
            </p>
          </div>

          <button
            type="button"
            style={styles.primaryButton}
            onClick={() => setShowForm((current) => !current)}
          >
            {showForm ? "Cerrar formulario" : "+ Nuevo producto"}
          </button>
        </header>

        {showForm && (
          <section style={styles.panel}>
            {/* Recargar el inventario automáticamente tras guardar. */}
            <ProductForm onSaved={reload} />

            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => void reload()}
              disabled={loading}
            >
              Actualizar lista de productos
            </button>
          </section>
        )}

        <section style={styles.summaryGrid}>
          <SummaryCard
            title="Productos activos"
            value={String(products.length)}
          />

          <SummaryCard
            title="Productos con stock bajo"
            value={String(lowStockCount)}
          />

          <SummaryCard
            title="Valor estimado del inventario"
            value={moneyFormatter.format(inventoryValue)}
          />
        </section>

        <section style={styles.panel}>
          <div style={styles.tableHeader}>
            <h2 style={styles.sectionTitle}>
              Catálogo de productos
            </h2>

            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => void reload()}
              disabled={loading}
            >
              {loading ? "Actualizando..." : "Actualizar"}
            </button>
          </div>

          <input
            type="search"
            aria-label="Buscar productos"
            placeholder="Buscar por código, nombre, categoría o asociación..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={styles.search}
          />

          {loading ? (
            <p style={styles.message}>
              Consultando productos...
            </p>
          ) : error ? (
            <div role="alert" style={styles.error}>
              <strong>No se pudo cargar el inventario.</strong>
              <p>{error}</p>

              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => void reload()}
              >
                Reintentar
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <p style={styles.message}>
              {products.length === 0
                ? "Todavía no hay productos activos registrados."
                : "No se encontraron productos con ese criterio."}
            </p>
          ) : (
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Código</th>
                    <th style={styles.th}>Producto</th>
                    <th style={styles.th}>Categoría</th>
                    <th style={styles.th}>Unidad</th>
                    <th style={styles.thRight}>Existencias</th>
                    <th style={styles.thRight}>Stock mínimo</th>
                    <th style={styles.thRight}>Costo unitario</th>
                    <th style={styles.thRight}>Valor estimado</th>
                    <th style={styles.th}>Estado</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredProducts.map((product, index) => {
                    const minimumStock =
                      product.stockMinimo ?? 10;

                    const isLow =
                      product.stock <= minimumStock;

                    return (
                      <tr
                        key={product.id ?? `${product.code}-${index}`}
                      >
                        <td style={styles.td}>
                          {product.code}
                        </td>

                        <td style={styles.td}>
                          <strong>{product.name}</strong>
                        </td>

                        <td style={styles.td}>
                          {product.category}
                        </td>

                        <td style={styles.td}>
                          {product.unit}
                        </td>

                        <td style={styles.tdRight}>
                          {product.stock.toLocaleString("es-HN")}
                        </td>

                        <td style={styles.tdRight}>
                          {minimumStock.toLocaleString("es-HN")}
                        </td>

                        <td style={styles.tdRight}>
                          {moneyFormatter.format(
                            product.purchaseCostLb
                          )}
                        </td>

                        <td style={styles.tdRight}>
                          {moneyFormatter.format(
                            product.stock * product.purchaseCostLb
                          )}
                        </td>

                        <td style={styles.td}>
                          <span
                            style={{
                              ...styles.badge,
                              ...(isLow
                                ? styles.lowBadge
                                : styles.normalBadge),
                            }}
                          >
                            {isLow ? "Stock bajo" : "Normal"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && (
            <p style={styles.footer}>
              Mostrando {filteredProducts.length} de{" "}
              {products.length} productos activos.
            </p>
          )}
        </section>
      </main>
    </MainLayout>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <article style={styles.card}>
      <p style={styles.cardTitle}>{title}</p>
      <strong style={styles.cardValue}>{value}</strong>
    </article>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    padding: 24,
    maxWidth: 1600,
    margin: "0 auto",
    color: "#1f2937",
  },

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 24,
  },

  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 700,
  },

  subtitle: {
    margin: "8px 0 0",
    color: "#6b7280",
  },

  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 16,
    marginBottom: 24,
  },

  card: {
    padding: 20,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    minWidth: 0,
  },

  cardTitle: {
    margin: "0 0 12px",
    color: "#6b7280",
    fontSize: 14,
  },

  cardValue: {
    fontSize: 23,
    overflowWrap: "anywhere",
  },

  panel: {
    padding: 20,
    marginBottom: 24,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
  },

  tableHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },

  sectionTitle: {
    margin: 0,
    fontSize: 19,
  },

  primaryButton: {
    padding: "10px 16px",
    color: "#fff",
    background: "#1764c0",
    border: 0,
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 600,
  },

  secondaryButton: {
    padding: "9px 13px",
    color: "#1f2937",
    background: "#f3f4f6",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    cursor: "pointer",
  },

  search: {
    boxSizing: "border-box",
    width: "100%",
    padding: "11px 12px",
    marginBottom: 18,
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 14,
  },

  tableContainer: {
    width: "100%",
    overflowX: "auto",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    whiteSpace: "nowrap",
  },

  th: {
    padding: 12,
    textAlign: "left",
    background: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
    color: "#4b5563",
  },

  thRight: {
    padding: 12,
    textAlign: "right",
    background: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
    color: "#4b5563",
  },

  td: {
    padding: 12,
    borderBottom: "1px solid #e5e7eb",
  },

  tdRight: {
    padding: 12,
    textAlign: "right",
    borderBottom: "1px solid #e5e7eb",
    fontVariantNumeric: "tabular-nums",
  },

  badge: {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
  },

  lowBadge: {
    color: "#92400e",
    background: "#fef3c7",
  },

  normalBadge: {
    color: "#166534",
    background: "#dcfce7",
  },

  message: {
    padding: 24,
    color: "#6b7280",
    textAlign: "center",
  },

  error: {
    padding: 16,
    color: "#991b1b",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 8,
  },

  footer: {
    margin: "16px 0 0",
    color: "#6b7280",
    fontSize: 12,
  },
};
