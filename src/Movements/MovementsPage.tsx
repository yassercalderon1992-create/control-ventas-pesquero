
import { useEffect, useMemo, useState } from "react";

import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "firebase/firestore";

import MainLayout from "../layout/MainLayout";
import { auth } from "../firebase/auth";
import { db } from "../firebase/firestore";
import { movementService } from "../services/inventory/movementService";

import type { Movement } from "../types/movement";

type TypeFilter = "TODOS" | "Compra" | "Venta";
type StatusFilter = "TODOS" | "active" | "deleted";

const moneyFormatter = new Intl.NumberFormat("es-HN", {
  style: "currency",
  currency: "HNL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("es-HN", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDate(value?: string): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return dateFormatter.format(date);
}

function getMovementTotal(movement: Movement): number {
  const total =
    movement.type === "Compra"
      ? movement.qty * movement.purchaseCostLb
      : movement.qty * movement.salePriceLb;

  return Number.isFinite(total) ? total : 0;
}

export default function MovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [associationLabel, setAssociationLabel] = useState("");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("TODOS");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("TODOS");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadMovements() {
      setLoading(true);
      setError("");

      try {
        const currentUser = auth.currentUser;

        if (!currentUser?.email) {
          throw new Error(
            "No hay una sesión autenticada. Inicia sesión para consultar los movimientos."
          );
        }

        const email = currentUser.email.trim().toLowerCase();

        const profileSnapshot = await getDoc(
          doc(db, "users", email)
        );

        if (!profileSnapshot.exists()) {
          throw new Error(
            "No se encontró el perfil del usuario en Firestore."
          );
        }

        const profile = profileSnapshot.data();

        if (profile.active === false) {
          throw new Error(
            "El usuario está inactivo y no puede consultar los movimientos."
          );
        }

        const associationId = String(
          profile.associationId ?? ""
        ).trim();

        if (!associationId) {
          throw new Error(
            "El perfil no tiene una asociación asignada."
          );
        }

        let result: Movement[] = [];

        if (associationId.toLowerCase() === "todas") {
          if (profile.role !== "Administrador") {
            throw new Error(
              "No tienes permisos para consultar todas las asociaciones."
            );
          }

          const associationsSnapshot = await getDocs(
            collection(db, "associations")
          );

          const movementGroups = await Promise.all(
            associationsSnapshot.docs.map((association) =>
              movementService.getMovements(association.id)
            )
          );

          result = movementGroups.flat();

          setAssociationLabel("Todas las asociaciones");
        } else {
          result = await movementService.getMovements(
            associationId
          );

          setAssociationLabel(
            String(profile.associationName ?? associationId)
          );
        }

        result.sort((a, b) => {
          const dateA = Date.parse(a.date ?? "");
          const dateB = Date.parse(b.date ?? "");

          return (
            (Number.isFinite(dateB) ? dateB : 0) -
            (Number.isFinite(dateA) ? dateA : 0)
          );
        });

        if (!cancelled) {
          setMovements(result);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : "No se pudieron consultar los movimientos.";

          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMovements();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredMovements = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return movements.filter((movement) => {
      const matchesType =
        typeFilter === "TODOS" ||
        movement.type === typeFilter;

      const normalizedStatus =
        movement.status ?? "active";

      const matchesStatus =
        statusFilter === "TODOS" ||
        normalizedStatus === statusFilter;

      const searchableText = [
        movement.code,
        movement.product,
        movement.associationName,
        movement.supplierName ?? "",
        movement.supplierCommunity ?? "",
        movement.userEmail,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !normalizedSearch ||
        searchableText.includes(normalizedSearch);

      return matchesType && matchesStatus && matchesSearch;
    });
  }, [movements, search, typeFilter, statusFilter]);

  const summary = useMemo(() => {
    const activeMovements = movements.filter(
      (movement) => (movement.status ?? "active") === "active"
    );

    const purchases = activeMovements
      .filter((movement) => movement.type === "Compra")
      .reduce(
        (sum, movement) => sum + getMovementTotal(movement),
        0
      );

    const sales = activeMovements
      .filter((movement) => movement.type === "Venta")
      .reduce(
        (sum, movement) => sum + getMovementTotal(movement),
        0
      );

    return {
      count: movements.length,
      activeCount: activeMovements.length,
      purchases,
      sales,
    };
  }, [movements]);

  return (
    <MainLayout>
      <main style={styles.page}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Movimientos</h1>
            <p style={styles.subtitle}>
              Historial de compras y ventas del ERP Pesquero Honduras.
            </p>
            {associationLabel && (
              <p style={styles.association}>
                Asociación: {associationLabel}
              </p>
            )}
          </div>
        </header>

        <section style={styles.summaryGrid}>
          <SummaryCard
            title="Movimientos registrados"
            value={String(summary.count)}
          />
          <SummaryCard
            title="Movimientos activos"
            value={String(summary.activeCount)}
          />
          <SummaryCard
            title="Compras registradas"
            value={moneyFormatter.format(summary.purchases)}
          />
          <SummaryCard
            title="Ventas registradas"
            value={moneyFormatter.format(summary.sales)}
          />
        </section>

        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>
            Historial de operaciones
          </h2>

          <div style={styles.filters}>
            <input
              type="search"
              aria-label="Buscar movimientos"
              placeholder="Buscar código, producto, proveedor o usuario..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={styles.search}
            />

            <select
              aria-label="Filtrar por tipo"
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as TypeFilter)
              }
              style={styles.select}
            >
              <option value="TODOS">Todas las operaciones</option>
              <option value="Compra">Compras</option>
              <option value="Venta">Ventas</option>
            </select>

            <select
              aria-label="Filtrar por estado"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              style={styles.select}
            >
              <option value="TODOS">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="deleted">Eliminados antiguos</option>
            </select>
          </div>

          {loading ? (
            <p style={styles.message}>
              Consultando movimientos...
            </p>
          ) : error ? (
            <div role="alert" style={styles.error}>
              <strong>No se pudieron cargar los movimientos.</strong>
              <p style={{ marginBottom: 0 }}>{error}</p>
            </div>
          ) : filteredMovements.length === 0 ? (
            <p style={styles.message}>
              No hay movimientos que coincidan con los filtros.
            </p>
          ) : (
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Fecha</th>
                    <th style={styles.th}>Código</th>
                    <th style={styles.th}>Tipo</th>
                    <th style={styles.th}>Producto</th>
                    <th style={styles.thRight}>Cantidad</th>
                    <th style={styles.thRight}>Precio unitario</th>
                    <th style={styles.thRight}>Total calculado</th>
                    <th style={styles.th}>Proveedor</th>
                    <th style={styles.th}>Usuario</th>
                    <th style={styles.th}>Estado</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredMovements.map((movement, index) => {
                    const status =
                      movement.status ?? "active";

                    const unitPrice =
                      movement.type === "Compra"
                        ? movement.purchaseCostLb
                        : movement.salePriceLb;

                    return (
                      <tr
                        key={`${movement.id ?? movement.code}-${index}`}
                      >
                        <td style={styles.td}>
                          {formatDate(movement.date)}
                        </td>
                        <td style={styles.td}>
                          {movement.code || "—"}
                        </td>
                        <td style={styles.td}>
                          <span
                            style={{
                              ...styles.badge,
                              ...(movement.type === "Compra"
                                ? styles.purchaseBadge
                                : styles.saleBadge),
                            }}
                          >
                            {movement.type}
                          </span>
                        </td>
                        <td style={styles.td}>
                          {movement.product}
                        </td>
                        <td style={styles.tdRight}>
                        {(
  Number.isFinite(Number(movement.qty))
    ? Number(movement.qty)
    : 0
).toLocaleString("es-HN")}
                        </td>
                        <td style={styles.tdRight}>
                          {moneyFormatter.format(unitPrice || 0)}
                        </td>
                        <td style={styles.tdRight}>
                          {moneyFormatter.format(
                            getMovementTotal(movement)
                          )}
                        </td>
                        <td style={styles.td}>
                          {movement.supplierName ?? "—"}
                        </td>
                        <td style={styles.td}>
                          {movement.userEmail}
                        </td>
                        <td style={styles.td}>
                          {status === "deleted"
                            ? "Eliminado antiguo"
                            : "Activo"}
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
              Mostrando {filteredMovements.length} de {movements.length}{" "}
              movimientos. Los importes se calculan a partir de la
              cantidad y el precio unitario.
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

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: "24px",
    maxWidth: "1600px",
    margin: "0 auto",
    color: "#1f2937",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    marginBottom: "24px",
  },
  title: {
    margin: 0,
    fontSize: "28px",
    fontWeight: 700,
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#6b7280",
  },
  association: {
    margin: "8px 0 0",
    fontSize: "14px",
    fontWeight: 600,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "20px",
    minWidth: 0,
  },
  cardTitle: {
    margin: "0 0 12px",
    color: "#6b7280",
    fontSize: "14px",
  },
  cardValue: {
    fontSize: "23px",
    overflowWrap: "anywhere",
  },
  panel: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "20px",
  },
  sectionTitle: {
    margin: "0 0 18px",
    fontSize: "19px",
  },
  filters: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    marginBottom: "20px",
  },
  search: {
    flex: "1 1 280px",
    minWidth: 0,
    padding: "11px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "14px",
  },
  select: {
    flex: "0 1 200px",
    minWidth: "170px",
    padding: "11px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    background: "#ffffff",
    fontSize: "14px",
  },
  tableContainer: {
    width: "100%",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "13px",
    whiteSpace: "nowrap",
  },
  th: {
    padding: "12px",
    textAlign: "left",
    background: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
    color: "#4b5563",
  },
  thRight: {
    padding: "12px",
    textAlign: "right",
    background: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
    color: "#4b5563",
  },
  td: {
    padding: "12px",
    borderBottom: "1px solid #e5e7eb",
    verticalAlign: "top",
  },
  tdRight: {
    padding: "12px",
    borderBottom: "1px solid #e5e7eb",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  badge: {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 600,
  },
  purchaseBadge: {
    background: "#dcfce7",
    color: "#166534",
  },
  saleBadge: {
    background: "#dbeafe",
    color: "#1d4ed8",
  },
  message: {
    padding: "28px 12px",
    textAlign: "center",
    color: "#6b7280",
  },
  error: {
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#991b1b",
    borderRadius: "8px",
    padding: "16px",
  },
  footer: {
    margin: "16px 0 0",
    color: "#6b7280",
    fontSize: "12px",
  },
};
