import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { collection, getDocs } from "firebase/firestore";

import MainLayout from "../layout/MainLayout";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase/firestore";
import { hasPermission } from "../models/permissions";

type ReportTab = "summary" | "sales" | "purchases" | "inventory" | "cash" | "expenses" | "movements";
type DataMap = Record<string, unknown>;

interface AssociationOption {
  id: string;
  name: string;
}

interface ReportRecord {
  id: string;
  associationId: string;
  associationName: string;
  data: DataMap;
}

const ALL_ASSOCIATIONS = "__ALL_ASSOCIATIONS__";
const REPORT_TABS: { value: ReportTab; label: string }[] = [
  { value: "summary", label: "Resumen" },
  { value: "sales", label: "Ventas" },
  { value: "purchases", label: "Compras" },
  { value: "inventory", label: "Inventario" },
  { value: "cash", label: "Caja" },
  { value: "expenses", label: "Gastos" },
  { value: "movements", label: "Movimientos" },
];

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: 20, padding: 26, background: "#f1f5f9", color: "#172033", minHeight: "100%", boxSizing: "border-box" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 },
  title: { margin: 0, fontSize: 28, fontWeight: 750 },
  subtitle: { margin: "7px 0 0", color: "#64748b", lineHeight: 1.5 },
  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18, minWidth: 0 },
  filters: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "end" },
  label: { display: "grid", gap: 7, color: "#475569", fontSize: 13, fontWeight: 650 },
  input: { width: "100%", minWidth: 0, boxSizing: "border-box", padding: "10px 11px", border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", color: "#0f172a", font: "inherit", fontWeight: 400 },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  tab: { border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", color: "#334155", padding: "10px 13px", fontWeight: 700, cursor: "pointer" },
  activeTab: { border: "1px solid #1d4ed8", background: "#1d4ed8", color: "#fff" },
  primary: { border: 0, borderRadius: 7, background: "#2563eb", color: "#fff", padding: "10px 14px", fontWeight: 700, cursor: "pointer" },
  secondary: { border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", color: "#334155", padding: "10px 13px", fontWeight: 650, cursor: "pointer" },
  metricGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 },
  metric: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 17 },
  metricLabel: { margin: 0, color: "#64748b", fontSize: 12 },
  metricValue: { margin: "8px 0 0", color: "#0f172a", fontSize: 23, fontWeight: 800 },
  tableWrap: { overflowX: "auto", width: "100%" },
  table: { width: "100%", minWidth: 850, borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", background: "#f8fafc", color: "#475569", padding: "12px 10px", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" },
  td: { padding: "12px 10px", borderBottom: "1px solid #e2e8f0", verticalAlign: "top" },
  notice: { padding: 12, borderRadius: 8, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", lineHeight: 1.5 },
  error: { padding: 12, borderRadius: 8, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", lineHeight: 1.5 },
  muted: { color: "#64748b", fontSize: 13 },
};

function textValue(value: unknown, fallback = "—"): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const converted = value.toDate();
    return converted instanceof Date && !Number.isNaN(converted.getTime()) ? converted : null;
  }
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    const millis = value.toMillis();
    const converted = new Date(millis);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  if (typeof value === "string" || typeof value === "number") {
    const converted = new Date(value);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  return null;
}

function recordDate(data: DataMap): Date | null {
  for (const key of ["createdAt", "transactionDate", "saleDate", "purchaseDate", "expenseDate", "date", "updatedAt"]) {
    const parsed = dateValue(data[key]);
    if (parsed) return parsed;
  }
  return null;
}

function dateLabel(data: DataMap): string {
  const date = recordDate(data);
  return date ? date.toLocaleString("es-HN", { dateStyle: "short", timeStyle: "short" }) : "Sin fecha";
}

function money(value: number): string {
  return new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
}

function isActive(data: DataMap): boolean {
  const status = textValue(data.status, "ACTIVE").toUpperCase();
  return !["CANCELLED", "CANCELED", "INACTIVE", "DELETED"].includes(status);
}

function localDateInput(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function totalOf(record: ReportRecord): number {
  return numberValue(record.data.total ?? record.data.amount);
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  // Escapar comillas dobles para conservar comas, punto y coma y saltos de línea
  // dentro de una celda sin desplazar el resto de las columnas.
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCsv(filename: string, headers: string[], rows: unknown[][]): void {
  // Excel en configuraciones regionales de español suele esperar punto y coma
  // como separador. La directiva `sep=;` le indica explícitamente el delimitador,
  // evitando que toda la fila aparezca dentro de la columna A.
  const csvRows = [headers, ...rows]
    .map((row) => row.map(csvCell).join(";"))
    .join("\r\n");
  const content = `sep=;\r\n${csvRows}`;
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.toLowerCase().endsWith(".csv") ? filename : `${filename}.csv`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revocar después de que el navegador haya iniciado la descarga.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mapDocs(snapshot: Awaited<ReturnType<typeof getDocs>>, association: AssociationOption): ReportRecord[] {
  return snapshot.docs.map((document) => ({
    id: document.id,
    associationId: association.id,
    associationName: association.name,
    data: document.data() as DataMap,
  }));
}

export default function ReportsPage() {
  const { user, loading: authLoading } = useAuth();
  const isGlobalAdmin = Boolean(user && user.active && user.role === "Administrador" && user.associationId.trim().toLowerCase() === "todas");
  const canViewExpenses = Boolean(user && user.active && hasPermission(user.role, "expenses:view"));

  const [associations, setAssociations] = useState<AssociationOption[]>([]);
  const [associationId, setAssociationId] = useState("");
  const [sales, setSales] = useState<ReportRecord[]>([]);
  const [purchases, setPurchases] = useState<ReportRecord[]>([]);
  const [products, setProducts] = useState<ReportRecord[]>([]);
  const [cashRecords, setCashRecords] = useState<ReportRecord[]>([]);
  const [expenses, setExpenses] = useState<ReportRecord[]>([]);
  const [movements, setMovements] = useState<ReportRecord[]>([]);
  const [tab, setTab] = useState<ReportTab>("summary");
  const [startDate, setStartDate] = useState(localDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [endDate, setEndDate] = useState(localDateInput());
  const [search, setSearch] = useState("");
  const [loadingAssociations, setLoadingAssociations] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadAssociations() {
      if (authLoading) return;
      if (!user || !user.active) {
        if (mounted) {
          setAssociations([]);
          setAssociationId("");
          setLoadingAssociations(false);
        }
        return;
      }
      setLoadingAssociations(true);
      try {
        let options: AssociationOption[];
        if (isGlobalAdmin) {
          const snapshot = await getDocs(collection(db, "associations"));
          options = snapshot.docs
            .filter((document) => document.data().active !== false)
            .map((document) => ({
              id: document.id,
              name: textValue(document.data().name ?? document.data().associationName, document.id),
            }))
            .sort((a, b) => a.name.localeCompare(b.name, "es-HN"));
        } else if (user.associationId && user.associationId.trim().toLowerCase() !== "todas") {
          options = [{ id: user.associationId.trim(), name: user.associationName || user.associationId.trim() }];
        } else {
          options = [];
        }
        if (mounted) {
          setAssociations(options);
          setAssociationId((current) => {
            if (isGlobalAdmin && current === ALL_ASSOCIATIONS) return current;
            if (options.some((option) => option.id === current)) return current;
            return isGlobalAdmin ? ALL_ASSOCIATIONS : (options[0]?.id ?? "");
          });
        }
      } catch (loadError: unknown) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las empresas.");
      } finally {
        if (mounted) setLoadingAssociations(false);
      }
    }
    void loadAssociations();
    return () => { mounted = false; };
  }, [authLoading, user, isGlobalAdmin]);

  const loadData = useCallback(async () => {
    if (!user?.active || !associationId || !associations.length) {
      setSales([]); setPurchases([]); setProducts([]); setCashRecords([]); setExpenses([]); setMovements([]);
      return;
    }
    setLoadingData(true);
    setError("");
    try {
      const selected = associationId === ALL_ASSOCIATIONS && isGlobalAdmin
        ? associations
        : associations.filter((association) => association.id === associationId);
      const collectedSales: ReportRecord[] = [];
      const collectedPurchases: ReportRecord[] = [];
      const collectedProducts: ReportRecord[] = [];
      const collectedCash: ReportRecord[] = [];
      const collectedExpenses: ReportRecord[] = [];
      const collectedMovements: ReportRecord[] = [];

      for (const association of selected) {
        const jobs = [
          getDocs(collection(db, "associations", association.id, "sales")),
          getDocs(collection(db, "associations", association.id, "purchases")),
          getDocs(collection(db, "associations", association.id, "products")),
          getDocs(collection(db, "associations", association.id, "cashMovements")),
          getDocs(collection(db, "associations", association.id, "movements")),
        ] as const;
        const [saleSnapshot, purchaseSnapshot, productSnapshot, cashSnapshot, movementSnapshot] = await Promise.all(jobs);
        collectedSales.push(...mapDocs(saleSnapshot, association));
        collectedPurchases.push(...mapDocs(purchaseSnapshot, association));
        collectedProducts.push(...mapDocs(productSnapshot, association));
        collectedCash.push(...mapDocs(cashSnapshot, association));
        collectedMovements.push(...mapDocs(movementSnapshot, association));

        if (canViewExpenses) {
          const expenseSnapshot = await getDocs(collection(db, "associations", association.id, "expenses"));
          collectedExpenses.push(...mapDocs(expenseSnapshot, association));
        }
      }

      const latestFirst = (a: ReportRecord, b: ReportRecord) => (recordDate(b.data)?.getTime() ?? 0) - (recordDate(a.data)?.getTime() ?? 0);
      setSales(collectedSales.sort(latestFirst));
      setPurchases(collectedPurchases.sort(latestFirst));
      setProducts(collectedProducts.sort((a, b) => textValue(a.data.name).localeCompare(textValue(b.data.name), "es-HN")));
      setCashRecords(collectedCash.sort(latestFirst));
      setExpenses(collectedExpenses.sort(latestFirst));
      setMovements(collectedMovements.sort(latestFirst));
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron consultar los reportes. Verifica los permisos de lectura de Firestore.");
    } finally {
      setLoadingData(false);
    }
  }, [user?.active, associationId, associations, isGlobalAdmin, canViewExpenses]);

  useEffect(() => { void loadData(); }, [loadData]);

  const selectedAssociations = associationId === ALL_ASSOCIATIONS && isGlobalAdmin
    ? associations
    : associations.filter((association) => association.id === associationId);
  const currentAssociationName = associationId === ALL_ASSOCIATIONS ? "Todas las empresas" : selectedAssociations[0]?.name ?? "";

  const fromMillis = startDate ? new Date(`${startDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const toMillis = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
  const withinPeriod = (record: ReportRecord): boolean => {
    if (tab === "inventory") return true;
    const date = recordDate(record.data);
    if (!date) return !startDate && !endDate;
    const millis = date.getTime();
    return millis >= fromMillis && millis <= toMillis;
  };
  const activeSales = useMemo(() => sales.filter((record) => isActive(record.data)), [sales]);
  const activePurchases = useMemo(() => purchases.filter((record) => isActive(record.data)), [purchases]);
  const activeCash = useMemo(() => cashRecords.filter((record) => isActive(record.data)), [cashRecords]);
  const activeExpenses = useMemo(() => expenses.filter((record) => isActive(record.data)), [expenses]);
  const activeProducts = useMemo(() => products.filter((record) => record.data.active !== false), [products]);
  const periodSales = activeSales.filter(withinPeriod);
  const periodPurchases = activePurchases.filter(withinPeriod);
  const periodCash = activeCash.filter(withinPeriod);
  const periodExpenses = activeExpenses.filter(withinPeriod);
  const periodMovements = movements.filter((record) => isActive(record.data) && withinPeriod(record));

  const salesTotal = periodSales.reduce((sum, record) => sum + totalOf(record), 0);
  const purchasesTotal = periodPurchases.reduce((sum, record) => sum + totalOf(record), 0);
  const cashIncome = periodCash.filter((record) => textValue(record.data.type).toUpperCase() === "INCOME").reduce((sum, record) => sum + numberValue(record.data.amount), 0);
  const cashExpense = periodCash.filter((record) => textValue(record.data.type).toUpperCase() === "EXPENSE").reduce((sum, record) => sum + numberValue(record.data.amount), 0);
  const paidExpensesTotal = periodExpenses.filter((record) => textValue(record.data.paymentStatus).toUpperCase() === "PAID").reduce((sum, record) => sum + numberValue(record.data.amount), 0);
  const pendingExpensesTotal = periodExpenses.filter((record) => textValue(record.data.paymentStatus).toUpperCase() === "PENDING").reduce((sum, record) => sum + numberValue(record.data.amount), 0);
  const inventoryValue = activeProducts.reduce((sum, record) => sum + numberValue(record.data.stock) * numberValue(record.data.purchaseCostLb), 0);

  const companySummary = selectedAssociations.map((association) => {
    const companySales = periodSales.filter((record) => record.associationId === association.id).reduce((sum, record) => sum + totalOf(record), 0);
    const companyPurchases = periodPurchases.filter((record) => record.associationId === association.id).reduce((sum, record) => sum + totalOf(record), 0);
    const companyCash = periodCash.filter((record) => record.associationId === association.id);
    const income = companyCash.filter((record) => textValue(record.data.type).toUpperCase() === "INCOME").reduce((sum, record) => sum + numberValue(record.data.amount), 0);
    const expense = companyCash.filter((record) => textValue(record.data.type).toUpperCase() === "EXPENSE").reduce((sum, record) => sum + numberValue(record.data.amount), 0);
    const companyExpenses = periodExpenses.filter((record) => record.associationId === association.id).reduce((sum, record) => sum + numberValue(record.data.amount), 0);
    const companyInventory = activeProducts.filter((record) => record.associationId === association.id).reduce((sum, record) => sum + numberValue(record.data.stock) * numberValue(record.data.purchaseCostLb), 0);
    return { association, sales: companySales, purchases: companyPurchases, expenses: companyExpenses, cashNet: income - expense, inventory: companyInventory };
  });

  const tabRecords: ReportRecord[] = tab === "sales" ? periodSales
    : tab === "purchases" ? periodPurchases
      : tab === "inventory" ? activeProducts
        : tab === "cash" ? periodCash
          : tab === "expenses" ? periodExpenses
            : tab === "movements" ? periodMovements : [];
  const visibleRecords = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-HN");
    if (!term) return tabRecords;
    return tabRecords.filter((record) => [record.id, record.associationName, ...Object.values(record.data)]
      .filter((value) => typeof value === "string" || typeof value === "number")
      .map((value) => String(value).toLocaleLowerCase("es-HN"))
      .some((value) => value.includes(term)));
  }, [tabRecords, search]);

  const handleExport = () => {
    if (tab === "summary") {
      exportCsv("resumen_empresas.csv", ["Empresa", "Ventas HNL", "Compras HNL", "Gastos HNL", "Caja neta HNL", "Inventario estimado HNL"], companySummary.map((row) => [row.association.name, row.sales.toFixed(2), row.purchases.toFixed(2), row.expenses.toFixed(2), row.cashNet.toFixed(2), row.inventory.toFixed(2)]));
      return;
    }
    const rows = visibleRecords.map((record) => {
      const data = record.data;
      if (tab === "inventory") return [record.associationName, data.code, data.name, data.category, data.stock, data.unit, data.purchaseCostLb, numberValue(data.stock) * numberValue(data.purchaseCostLb), data.active === false ? "Inactivo" : "Activo"];
      if (tab === "cash") return [record.associationName, dateLabel(data), data.type, data.concept ?? data.description, data.amount, data.paymentMethod, data.referenceType, data.referenceId, data.status];
      if (tab === "expenses") return [record.associationName, dateLabel(data), data.category, data.description, data.amount, data.paymentStatus, data.paymentMethod, data.supplier, data.invoiceNumber, data.status];
      if (tab === "movements") return [record.associationName, dateLabel(data), data.type, data.code, data.product, data.qty, data.purchaseCostLb, data.salePriceLb, data.status];
      return [record.associationName, dateLabel(data), data.code, tab === "sales" ? data.customer : data.supplier, data.paymentMethod, data.total, data.createdBy, data.status, record.id];
    });
    const headers = tab === "inventory" ? ["Empresa", "Código", "Producto", "Categoría", "Stock", "Unidad", "Costo unitario", "Valor inventario", "Estado"]
      : tab === "cash" ? ["Empresa", "Fecha", "Tipo", "Concepto", "Importe", "Método", "Referencia tipo", "Referencia ID", "Estado"]
        : tab === "expenses" ? ["Empresa", "Fecha", "Categoría", "Descripción", "Importe", "Pago", "Método", "Proveedor", "Factura", "Estado"]
          : tab === "movements" ? ["Empresa", "Fecha", "Tipo", "Código", "Producto", "Cantidad", "Costo compra", "Precio venta", "Estado"]
            : ["Empresa", "Fecha", "Código", tab === "sales" ? "Cliente" : "Proveedor", "Método de pago", "Total", "Usuario", "Estado", "ID"];
    exportCsv(`reporte_${tab}.csv`, headers, rows);
  };

  if (!user || !user.active) {
    return <MainLayout><div style={styles.page}><h1 style={styles.title}>Reportes</h1><div style={styles.error}>Inicia sesión con un perfil activo para consultar reportes.</div></div></MainLayout>;
  }

  return (
    <MainLayout>
      <main style={styles.page}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Reportes comerciales</h1>
            <p style={styles.subtitle}>Consulta ventas, compras, inventario, caja, gastos y movimientos por empresa y período.</p>
          </div>
          <div style={styles.row}>
            <button type="button" style={styles.secondary} onClick={() => { void loadData(); }}>Actualizar datos</button>
            <button type="button" style={styles.primary} onClick={handleExport} disabled={loadingData || loadingAssociations}>Exportar CSV</button>
          </div>
        </header>

        <section style={styles.panel}>
          <div style={styles.filters}>
            <label style={styles.label}>Empresa
              <select style={styles.input} value={associationId} onChange={(event) => setAssociationId(event.target.value)} disabled={!isGlobalAdmin || loadingAssociations}>
                {isGlobalAdmin && <option value={ALL_ASSOCIATIONS}>Todas las empresas</option>}
                {associations.map((association) => <option key={association.id} value={association.id}>{association.name}</option>)}
              </select>
            </label>
            <label style={styles.label}>Desde
              <input type="date" style={styles.input} value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label style={styles.label}>Hasta
              <input type="date" style={styles.input} value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label style={styles.label}>Buscar
              <input style={styles.input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Código, producto, cliente, proveedor..." />
            </label>
          </div>
          <p style={{ ...styles.muted, marginBottom: 0 }}>Empresa consultada: <strong>{currentAssociationName || "—"}</strong>. El inventario refleja existencias actuales; las operaciones financieras se filtran por el período indicado.</p>
        </section>

        {error && <div style={styles.error}>{error}</div>}
        {loadingData && <div style={styles.notice}>Consultando documentos de Firestore...</div>}
        {!loadingData && !error && <div style={styles.notice}>Los importes se calculan a partir de documentos activos. Los reportes no modifican datos operativos.</div>}

        <section style={styles.metricGrid}>
          <article style={styles.metric}><p style={styles.metricLabel}>Ventas del período</p><p style={styles.metricValue}>{money(salesTotal)}</p><span style={styles.muted}>{periodSales.length} ventas activas</span></article>
          <article style={styles.metric}><p style={styles.metricLabel}>Compras del período</p><p style={styles.metricValue}>{money(purchasesTotal)}</p><span style={styles.muted}>{periodPurchases.length} compras activas</span></article>
          <article style={styles.metric}><p style={styles.metricLabel}>Saldo neto de caja</p><p style={styles.metricValue}>{money(cashIncome - cashExpense)}</p><span style={styles.muted}>{money(cashIncome)} ingresos · {money(cashExpense)} egresos</span></article>
          <article style={styles.metric}><p style={styles.metricLabel}>Inventario estimado actual</p><p style={styles.metricValue}>{money(inventoryValue)}</p><span style={styles.muted}>{activeProducts.length} productos activos</span></article>
          {canViewExpenses && <article style={styles.metric}><p style={styles.metricLabel}>Gastos pagados / pendientes</p><p style={styles.metricValue}>{money(paidExpensesTotal)} / {money(pendingExpensesTotal)}</p><span style={styles.muted}>{periodExpenses.length} gastos del período</span></article>}
        </section>

        <section style={styles.panel}>
          <div style={styles.row}>
            {REPORT_TABS.filter((item) => item.value !== "expenses" || canViewExpenses).map((item) => (
              <button key={item.value} type="button" style={{ ...styles.tab, ...(tab === item.value ? styles.activeTab : {}) }} onClick={() => setTab(item.value)}>{item.label}</button>
            ))}
          </div>

          {tab === "summary" ? (
            <div style={{ marginTop: 18 }}>
              <h2 style={{ fontSize: 18, margin: "0 0 7px" }}>Resumen por empresa</h2>
              <p style={styles.muted}>Totales por período seleccionado. El valor del inventario corresponde a las existencias actuales.</p>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead><tr>{["Empresa", "Ventas", "Compras", "Gastos", "Caja neta", "Inventario estimado"].map((heading) => <th key={heading} style={styles.th}>{heading}</th>)}</tr></thead>
                  <tbody>
                    {companySummary.length === 0 ? <tr><td colSpan={6} style={styles.td}>No hay empresas para mostrar.</td></tr> : companySummary.map((row) => (
                      <tr key={row.association.id}>
                        <td style={styles.td}><strong>{row.association.name}</strong><br /><span style={styles.muted}>ID: {row.association.id}</span></td>
                        <td style={styles.td}>{money(row.sales)}</td><td style={styles.td}>{money(row.purchases)}</td><td style={styles.td}>{money(row.expenses)}</td><td style={styles.td}>{money(row.cashNet)}</td><td style={styles.td}>{money(row.inventory)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 18 }}>
              <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>{REPORT_TABS.find((item) => item.value === tab)?.label ?? "Reporte"}</h2>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  {tab === "inventory" ? (
                    <><thead><tr>{["Empresa", "Código", "Producto", "Categoría", "Stock", "Unidad", "Costo unitario", "Valor estimado", "Estado"].map((heading) => <th key={heading} style={styles.th}>{heading}</th>)}</tr></thead><tbody>
                      {visibleRecords.slice(0, 500).map((record) => <tr key={`${record.associationId}-${record.id}`}><td style={styles.td}>{record.associationName}</td><td style={styles.td}>{textValue(record.data.code)}</td><td style={styles.td}>{textValue(record.data.name)}</td><td style={styles.td}>{textValue(record.data.category)}</td><td style={styles.td}>{numberValue(record.data.stock).toLocaleString("es-HN")}</td><td style={styles.td}>{textValue(record.data.unit)}</td><td style={styles.td}>{money(numberValue(record.data.purchaseCostLb))}</td><td style={styles.td}>{money(numberValue(record.data.stock) * numberValue(record.data.purchaseCostLb))}</td><td style={styles.td}>{record.data.active === false ? "Inactivo" : "Activo"}</td></tr>)}
                    </tbody></>
                  ) : tab === "cash" ? (
                    <><thead><tr>{["Fecha", "Empresa", "Tipo", "Concepto", "Método", "Importe", "Referencia", "Estado"].map((heading) => <th key={heading} style={styles.th}>{heading}</th>)}</tr></thead><tbody>
                      {visibleRecords.slice(0, 500).map((record) => <tr key={`${record.associationId}-${record.id}`}><td style={styles.td}>{dateLabel(record.data)}</td><td style={styles.td}>{record.associationName}</td><td style={styles.td}>{textValue(record.data.type)}</td><td style={styles.td}>{textValue(record.data.concept ?? record.data.description)}</td><td style={styles.td}>{textValue(record.data.paymentMethod)}</td><td style={styles.td}>{money(numberValue(record.data.amount))}</td><td style={styles.td}>{textValue(record.data.referenceId)}</td><td style={styles.td}>{textValue(record.data.status, "ACTIVE")}</td></tr>)}
                    </tbody></>
                  ) : tab === "expenses" ? (
                    <><thead><tr>{["Fecha", "Empresa", "Categoría", "Descripción", "Importe", "Pago", "Método", "Proveedor", "Estado"].map((heading) => <th key={heading} style={styles.th}>{heading}</th>)}</tr></thead><tbody>
                      {visibleRecords.slice(0, 500).map((record) => <tr key={`${record.associationId}-${record.id}`}><td style={styles.td}>{dateLabel(record.data)}</td><td style={styles.td}>{record.associationName}</td><td style={styles.td}>{textValue(record.data.category)}</td><td style={styles.td}>{textValue(record.data.description)}</td><td style={styles.td}>{money(numberValue(record.data.amount))}</td><td style={styles.td}>{textValue(record.data.paymentStatus)}</td><td style={styles.td}>{textValue(record.data.paymentMethod)}</td><td style={styles.td}>{textValue(record.data.supplier)}</td><td style={styles.td}>{textValue(record.data.status, "ACTIVE")}</td></tr>)}
                    </tbody></>
                  ) : tab === "movements" ? (
                    <><thead><tr>{["Fecha", "Empresa", "Tipo", "Código", "Producto", "Cantidad", "Costo compra", "Precio venta", "Importe estimado"].map((heading) => <th key={heading} style={styles.th}>{heading}</th>)}</tr></thead><tbody>
                      {visibleRecords.slice(0, 500).map((record) => { const qty = numberValue(record.data.qty); const purchaseCost = numberValue(record.data.purchaseCostLb); const salePrice = numberValue(record.data.salePriceLb); const isSale = textValue(record.data.type).toLowerCase() === "venta"; return <tr key={`${record.associationId}-${record.id}`}><td style={styles.td}>{dateLabel(record.data)}</td><td style={styles.td}>{record.associationName}</td><td style={styles.td}>{textValue(record.data.type)}</td><td style={styles.td}>{textValue(record.data.code)}</td><td style={styles.td}>{textValue(record.data.product)}</td><td style={styles.td}>{qty.toLocaleString("es-HN")}</td><td style={styles.td}>{money(purchaseCost)}</td><td style={styles.td}>{money(salePrice)}</td><td style={styles.td}>{money(qty * (isSale ? salePrice : purchaseCost))}</td></tr>; })}
                    </tbody></>
                  ) : (
                    <><thead><tr>{["Fecha", "Empresa", "Código", tab === "sales" ? "Cliente" : "Proveedor", "Método", "Total", "Registrado por", "Estado", "ID"].map((heading) => <th key={heading} style={styles.th}>{heading}</th>)}</tr></thead><tbody>
                      {visibleRecords.slice(0, 500).map((record) => <tr key={`${record.associationId}-${record.id}`}><td style={styles.td}>{dateLabel(record.data)}</td><td style={styles.td}>{record.associationName}</td><td style={styles.td}>{textValue(record.data.code)}</td><td style={styles.td}>{textValue(tab === "sales" ? record.data.customer : record.data.supplier)}</td><td style={styles.td}>{textValue(record.data.paymentMethod)}</td><td style={styles.td}>{money(totalOf(record))}</td><td style={styles.td}>{textValue(record.data.createdBy ?? record.data.userEmail)}</td><td style={styles.td}>{textValue(record.data.status, "ACTIVE")}</td><td style={styles.td}>{record.id}</td></tr>)}
                    </tbody></>
                  )}
                  {visibleRecords.length === 0 && <tbody><tr><td style={styles.td} colSpan={10}>No hay registros con los filtros seleccionados.</td></tr></tbody>}
                </table>
              </div>
              <p style={styles.muted}>Mostrando {Math.min(visibleRecords.length, 500)} de {visibleRecords.length} registros en pantalla. La exportación CSV incluye todos los resultados filtrados.</p>
            </div>
          )}
        </section>
      </main>
    </MainLayout>
  );
}