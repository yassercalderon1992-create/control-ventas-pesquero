import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { collection, getDocs } from "firebase/firestore";
import { Link } from "react-router-dom";

import MainLayout from "../layout/MainLayout";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase/firestore";
import { hasPermission } from "../models/permissions";

const ALL_ASSOCIATIONS = "__ALL_ASSOCIATIONS__";
type PeriodKey = "today" | "month" | "last30";
type DataMap = Record<string, unknown>;

interface AssociationOption {
  id: string;
  name: string;
}

interface DataRecord {
  id: string;
  associationId: string;
  associationName: string;
  data: DataMap;
}

interface TrendDay {
  date: Date;
  label: string;
  sales: number;
  purchases: number;
}

interface RecentOperation {
  id: string;
  associationId: string;
  associationName: string;
  type: "Venta" | "Compra";
  code: string;
  partner: string;
  date: Date | null;
  total: number;
  status: string;
}

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: 20, padding: 26, minHeight: "100%", boxSizing: "border-box", background: "#f1f5f9", color: "#172033" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 },
  title: { margin: 0, fontSize: 28, fontWeight: 800 },
  subtitle: { margin: "7px 0 0", color: "#64748b", lineHeight: 1.5 },
  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 11, padding: 19, minWidth: 0 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 },
  label: { display: "grid", gap: 7, color: "#475569", fontSize: 13, fontWeight: 650 },
  input: { width: "100%", minWidth: 0, boxSizing: "border-box", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", color: "#0f172a", font: "inherit", fontWeight: 400 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 },
  cardLabel: { color: "#64748b", fontSize: 12, fontWeight: 650, marginBottom: 10 },
  cardValue: { fontSize: 25, margin: 0, fontWeight: 800, letterSpacing: "-0.025em", color: "#0f172a" },
  cardFoot: { marginTop: 8, fontSize: 12, color: "#64748b", lineHeight: 1.4 },
  sectionTitle: { margin: 0, fontSize: 17, fontWeight: 750 },
  tableWrap: { width: "100%", overflowX: "auto" },
  table: { width: "100%", minWidth: 720, borderCollapse: "collapse", textAlign: "left" },
  th: { padding: "11px 10px", background: "#f8fafc", color: "#64748b", fontSize: 12, fontWeight: 700, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" },
  td: { padding: "12px 10px", color: "#334155", fontSize: 13, borderBottom: "1px solid #e2e8f0", verticalAlign: "middle" },
  muted: { color: "#64748b", fontSize: 13, lineHeight: 1.5 },
  notice: { padding: 13, borderRadius: 8, border: "1px solid #bfdbfe", color: "#1d4ed8", background: "#eff6ff", lineHeight: 1.5, fontSize: 13 },
  error: { padding: 13, borderRadius: 8, border: "1px solid #fecaca", color: "#991b1b", background: "#fef2f2", lineHeight: 1.5, fontSize: 13 },
  button: { border: "1px solid #cbd5e1", borderRadius: 7, padding: "10px 13px", color: "#334155", background: "#fff", fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7 },
  buttonPrimary: { border: "1px solid #2563eb", borderRadius: 7, padding: "10px 13px", color: "#fff", background: "#2563eb", fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7 },
  tag: { display: "inline-flex", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 750, background: "#dcfce7", color: "#166534", whiteSpace: "nowrap" },
  lowTag: { display: "inline-flex", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 750, background: "#fef3c7", color: "#92400e", whiteSpace: "nowrap" },
};

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function money(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `L ${new Intl.NumberFormat("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe)}`;
}

function toDate(value: unknown): Date | null {
  try {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value;
    // Firestore Timestamp.toDate() usa la instancia como contexto (this).
    // Invocarlo separado del objeto puede lanzar un error en tiempo de ejecución.
    if (value && typeof value === "object" && "toDate" in value) {
      const fn = (value as { toDate?: unknown }).toDate;
      if (typeof fn === "function") {
        const parsed = (fn as () => unknown).call(value);
        return parsed instanceof Date && Number.isFinite(parsed.getTime()) ? parsed : null;
      }
    }
    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    }
  } catch (error) {
    console.warn("No se pudo interpretar una fecha del Dashboard:", error);
  }
  return null;
}

function normalizedAssociationId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordDate(record: DataRecord): Date | null {
  return toDate(record.data.transactionDate) ?? toDate(record.data.createdAt) ?? toDate(record.data.date);
}

function active(record: DataRecord): boolean {
  const status = str(record.data.status, "ACTIVE").toUpperCase();
  return !["CANCELLED", "CANCELED", "INACTIVE", "DELETED"].includes(status);
}

function inRange(date: Date | null, start: Date, end: Date): boolean {
  return Boolean(date && date.getTime() >= start.getTime() && date.getTime() <= end.getTime());
}

function periodStart(period: PeriodKey, now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "today") return start;
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  start.setDate(start.getDate() - 29);
  return start;
}

function saleTotal(record: DataRecord): number {
  return num(record.data.total, num(record.data.subtotal));
}

function estimatedGrossProfit(record: DataRecord): { value: number; complete: boolean } {
  const rawItems = record.data.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) return { value: 0, complete: false };
  let total = 0;
  let complete = true;
  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== "object") {
      complete = false;
      continue;
    }
    const item = rawItem as DataMap;
    const quantity = num(item.quantity, num(item.qty, NaN));
    const unitPrice = num(item.unitPrice, NaN);
    const unitCost = num(item.purchaseCost, num(item.purchaseCostLb, NaN));
    if (![quantity, unitPrice, unitCost].every(Number.isFinite) || quantity < 0) {
      complete = false;
      continue;
    }
    total += quantity * (unitPrice - unitCost);
  }
  return { value: total, complete };
}

function createDay(now: Date, daysAgo: number): Date {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

function belongsToDate(date: Date | null, expected: Date): boolean {
  return Boolean(date && date.getFullYear() === expected.getFullYear() && date.getMonth() === expected.getMonth() && date.getDate() === expected.getDate());
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const isGlobalAdmin = Boolean(user && user.active && user.role === "Administrador" && normalizedAssociationId(user.associationId).toLowerCase() === "todas");
  const canViewExpenses = Boolean(user && user.active && hasPermission(user.role, "expenses:view"));

  const [associations, setAssociations] = useState<AssociationOption[]>([]);
  const [associationId, setAssociationId] = useState("");
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [sales, setSales] = useState<DataRecord[]>([]);
  const [purchases, setPurchases] = useState<DataRecord[]>([]);
  const [products, setProducts] = useState<DataRecord[]>([]);
  const [cash, setCash] = useState<DataRecord[]>([]);
  const [expenses, setExpenses] = useState<DataRecord[]>([]);
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
            .map((document) => {
              const data = document.data();
              return {
                id: document.id,
                name: str(data.name, str(data.associationName, document.id)),
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name, "es-HN"));
        } else {
          const ownAssociationId = normalizedAssociationId(user.associationId);
          options = ownAssociationId && ownAssociationId.toLowerCase() !== "todas"
            ? [{ id: ownAssociationId, name: user.associationName || ownAssociationId }]
            : [];
        }
        if (mounted) {
          setAssociations(options);
          setAssociationId((current) => {
            if (current === ALL_ASSOCIATIONS && isGlobalAdmin) return current;
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

  const loadDashboardData = useCallback(async () => {
    if (!user?.active || !associationId || !associations.length) {
      setSales([]);
      setPurchases([]);
      setProducts([]);
      setCash([]);
      setExpenses([]);
      setLoadingData(false);
      return;
    }
    const selectedAssociations = associationId === ALL_ASSOCIATIONS
      ? associations
      : associations.filter((association) => association.id === associationId);
    if (!selectedAssociations.length) return;

    setLoadingData(true);
    setError("");
    try {
      const batches = await Promise.all(selectedAssociations.map(async (association) => {
        const [saleSnapshot, purchaseSnapshot, productSnapshot, cashSnapshot, expenseSnapshot] = await Promise.all([
          getDocs(collection(db, "associations", association.id, "sales")),
          getDocs(collection(db, "associations", association.id, "purchases")),
          getDocs(collection(db, "associations", association.id, "products")),
          getDocs(collection(db, "associations", association.id, "cashMovements")),
          canViewExpenses
            ? getDocs(collection(db, "associations", association.id, "expenses"))
            : Promise.resolve(null),
        ]);
        const mapRecords = (snapshot: { docs: Array<{ id: string; data: () => unknown }> } | null): DataRecord[] =>
          snapshot ? snapshot.docs.map((document) => ({
            id: document.id,
            associationId: association.id,
            associationName: association.name,
            data: document.data() as DataMap,
          })) : [];
        return {
          sales: mapRecords(saleSnapshot),
          purchases: mapRecords(purchaseSnapshot),
          products: mapRecords(productSnapshot),
          cash: mapRecords(cashSnapshot),
          expenses: mapRecords(expenseSnapshot),
        };
      }));
      setSales(batches.flatMap((batch) => batch.sales));
      setPurchases(batches.flatMap((batch) => batch.purchases));
      setProducts(batches.flatMap((batch) => batch.products).filter((record) => record.data.active !== false));
      setCash(batches.flatMap((batch) => batch.cash));
      setExpenses(batches.flatMap((batch) => batch.expenses));
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el resumen del Dashboard.");
    } finally {
      setLoadingData(false);
    }
  }, [user?.active, associationId, associations, canViewExpenses]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  const now = new Date();
  const start = periodStart(period, now);
  const activeSales = useMemo(() => sales.filter(active), [sales]);
  const activePurchases = useMemo(() => purchases.filter(active), [purchases]);
  const activeCash = useMemo(() => cash.filter(active), [cash]);
  const activeExpenses = useMemo(() => expenses.filter(active), [expenses]);
  const periodSales = activeSales.filter((record) => inRange(recordDate(record), start, now));
  const periodPurchases = activePurchases.filter((record) => inRange(recordDate(record), start, now));
  const periodCash = activeCash.filter((record) => inRange(recordDate(record), start, now));
  const periodExpenses = activeExpenses.filter((record) => inRange(toDate(record.data.expenseDate) ?? recordDate(record), start, now));

  const totalSales = periodSales.reduce((sum, record) => sum + saleTotal(record), 0);
  const totalPurchases = periodPurchases.reduce((sum, record) => sum + num(record.data.total, num(record.data.subtotal)), 0);
  const totalIncome = periodCash.filter((record) => str(record.data.type).toUpperCase() === "INCOME").reduce((sum, record) => sum + num(record.data.amount), 0);
  const totalCashOut = periodCash.filter((record) => str(record.data.type).toUpperCase() === "EXPENSE").reduce((sum, record) => sum + num(record.data.amount), 0);
  const paidExpenses = periodExpenses.filter((record) => str(record.data.paymentStatus).toUpperCase() === "PAID").reduce((sum, record) => sum + num(record.data.amount), 0);
  const pendingExpenses = periodExpenses.filter((record) => str(record.data.paymentStatus).toUpperCase() === "PENDING").reduce((sum, record) => sum + num(record.data.amount), 0);

  const grossProfitSummary = useMemo(() => {
    let value = 0;
    let incomplete = false;
    for (const record of periodSales) {
      const margin = estimatedGrossProfit(record);
      value += margin.value;
      if (!margin.complete) incomplete = true;
    }
    return { value, incomplete };
  }, [periodSales]);

  const stockValue = products.reduce((sum, record) => sum + num(record.data.stock) * num(record.data.purchaseCostLb), 0);
  const lowStockProducts = products
    .filter((record) => num(record.data.stock) <= num(record.data.stockMinimo, 10))
    .sort((a, b) => num(a.data.stock) - num(b.data.stock))
    .slice(0, 8);
  const overdueCredit = activeSales
    .filter((record) => str(record.data.paymentStatus).toUpperCase() === "PENDING")
    .reduce((sum, record) => sum + saleTotal(record), 0);

  const selectedAssociationName = associationId === ALL_ASSOCIATIONS
    ? "Todas las empresas"
    : associations.find((association) => association.id === associationId)?.name ?? "Empresa sin asignar";

  const trends: TrendDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = createDay(now, 6 - index);
    const daySales = activeSales.filter((record) => belongsToDate(recordDate(record), date)).reduce((sum, record) => sum + saleTotal(record), 0);
    const dayPurchases = activePurchases.filter((record) => belongsToDate(recordDate(record), date)).reduce((sum, record) => sum + num(record.data.total, num(record.data.subtotal)), 0);
    return { date, label: new Intl.DateTimeFormat("es-HN", { weekday: "short", day: "2-digit" }).format(date), sales: daySales, purchases: dayPurchases };
  });
  const trendMax = Math.max(1, ...trends.flatMap((day) => [day.sales, day.purchases]));

  const recentOperations: RecentOperation[] = [
    ...activeSales.map((record): RecentOperation => ({
      id: record.id,
      associationId: record.associationId,
      associationName: record.associationName,
      type: "Venta",
      code: str(record.data.code, record.id),
      partner: str(record.data.customer, "Cliente no indicado"),
      date: recordDate(record),
      total: saleTotal(record),
      status: str(record.data.status, "ACTIVE"),
    })),
    ...activePurchases.map((record): RecentOperation => ({
      id: record.id,
      associationId: record.associationId,
      associationName: record.associationName,
      type: "Compra",
      code: str(record.data.code, record.id),
      partner: str(record.data.supplier, "Proveedor no indicado"),
      date: recordDate(record),
      total: num(record.data.total, num(record.data.subtotal)),
      status: str(record.data.status, "ACTIVE"),
    })),
  ].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0)).slice(0, 8);

  const today = new Date();
  const todaySales = activeSales.filter((record) => belongsToDate(recordDate(record), today)).reduce((sum, record) => sum + saleTotal(record), 0);
  const todayPurchases = activePurchases.filter((record) => belongsToDate(recordDate(record), today)).reduce((sum, record) => sum + num(record.data.total, num(record.data.subtotal)), 0);
  const todayExpenses = activeExpenses.filter((record) => belongsToDate(toDate(record.data.expenseDate) ?? recordDate(record), today)).reduce((sum, record) => sum + num(record.data.amount), 0);

  if (authLoading || loadingAssociations) {
    return <MainLayout><main style={styles.page}><p style={styles.muted}>Cargando Dashboard…</p></main></MainLayout>;
  }
  if (!user || !user.active) {
    return <MainLayout><main style={styles.page}><div style={styles.error}>Necesitas una cuenta activa para consultar el Dashboard.</div></main></MainLayout>;
  }

  const periodLabel = period === "today" ? "Hoy" : period === "month" ? "Mes actual" : "Últimos 30 días";

  return (
    <MainLayout>
      <main style={styles.page}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Dashboard</h1>
            <p style={styles.subtitle}>Resumen ejecutivo de ventas, compras, rentabilidad, caja e inventario.</p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" style={styles.button} onClick={() => void loadDashboardData()} disabled={loadingData}>↻ Actualizar datos</button>
            <Link to="/operations" style={styles.buttonPrimary}>＋ Nueva operación</Link>
          </div>
        </header>

        <section style={styles.panel}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
            <label style={styles.label}>
              Empresa
              <select style={styles.input} value={associationId} onChange={(event) => setAssociationId(event.target.value)}>
                {isGlobalAdmin && <option value={ALL_ASSOCIATIONS}>Todas las empresas</option>}
                {associations.map((association) => <option key={association.id} value={association.id}>{association.name}</option>)}
              </select>
            </label>
            <label style={styles.label}>
              Período financiero
              <select style={styles.input} value={period} onChange={(event) => setPeriod(event.target.value as PeriodKey)}>
                <option value="today">Hoy</option>
                <option value="month">Mes actual</option>
                <option value="last30">Últimos 30 días</option>
              </select>
            </label>
          </div>
          <p style={{ ...styles.muted, marginBottom: 0 }}>Vista: <strong>{selectedAssociationName}</strong> · Período: <strong>{periodLabel}</strong>. El inventario corresponde a existencias actuales.</p>
        </section>

        {error && <div role="alert" style={styles.error}>{error}</div>}
        {loadingData && <div style={styles.notice}>Actualizando indicadores…</div>}

        <section style={styles.grid}>
          <article style={styles.panel}>
            <div style={styles.cardLabel}>Ventas del período</div>
            <h2 style={styles.cardValue}>{money(totalSales)}</h2>
            <div style={styles.cardFoot}>{periodSales.length} ventas activas</div>
          </article>
          <article style={styles.panel}>
            <div style={styles.cardLabel}>Compras del período</div>
            <h2 style={styles.cardValue}>{money(totalPurchases)}</h2>
            <div style={styles.cardFoot}>{periodPurchases.length} compras activas</div>
          </article>
          <article style={styles.panel}>
            <div style={styles.cardLabel}>Utilidad bruta estimada</div>
            <h2 style={{ ...styles.cardValue, color: grossProfitSummary.value < 0 ? "#b91c1c" : "#047857" }}>{money(grossProfitSummary.value)}</h2>
            <div style={styles.cardFoot}>{grossProfitSummary.incomplete ? "Parcial: faltan costos históricos en una o más ventas." : "Ventas menos costo histórico registrado en las líneas."}</div>
          </article>
          <article style={styles.panel}>
            <div style={styles.cardLabel}>Saldo neto de caja del período</div>
            <h2 style={styles.cardValue}>{money(totalIncome - totalCashOut)}</h2>
            <div style={styles.cardFoot}>{money(totalIncome)} ingresos · {money(totalCashOut)} egresos</div>
          </article>
          <article style={styles.panel}>
            <div style={styles.cardLabel}>Inventario estimado actual</div>
            <h2 style={styles.cardValue}>{money(stockValue)}</h2>
            <div style={styles.cardFoot}>{products.length} productos activos · al costo de compra actual</div>
          </article>
          <article style={styles.panel}>
            <div style={styles.cardLabel}>Gastos pagados / pendientes</div>
            <h2 style={{ ...styles.cardValue, fontSize: 20 }}>{canViewExpenses ? `${money(paidExpenses)} / ${money(pendingExpenses)}` : "Sin permiso"}</h2>
            <div style={styles.cardFoot}>{canViewExpenses ? `${periodExpenses.length} gastos activos en el período` : "Tu rol no tiene acceso al detalle de gastos."}</div>
          </article>
        </section>

        <section style={styles.grid}>
          <article style={styles.panel}>
            <div style={styles.cardLabel}>Ventas de hoy</div>
            <h2 style={{ ...styles.cardValue, fontSize: 21 }}>{money(todaySales)}</h2>
          </article>
          <article style={styles.panel}>
            <div style={styles.cardLabel}>Compras de hoy</div>
            <h2 style={{ ...styles.cardValue, fontSize: 21 }}>{money(todayPurchases)}</h2>
          </article>
          <article style={styles.panel}>
            <div style={styles.cardLabel}>Gastos registrados hoy</div>
            <h2 style={{ ...styles.cardValue, fontSize: 21 }}>{canViewExpenses ? money(todayExpenses) : "Sin permiso"}</h2>
            <div style={styles.cardFoot}>{canViewExpenses ? `${activeExpenses.filter((record) => belongsToDate(toDate(record.data.expenseDate) ?? recordDate(record), today)).length} gastos activos` : "Tu rol no tiene acceso al detalle de gastos."}</div>
          </article>
          <article style={styles.panel}>
            <div style={styles.cardLabel}>Crédito pendiente</div>
            <h2 style={{ ...styles.cardValue, fontSize: 21 }}>{money(overdueCredit)}</h2>
            <div style={styles.cardFoot}>Ventas activas con pago pendiente</div>
          </article>
          <article style={styles.panel}>
            <div style={styles.cardLabel}>Productos con stock bajo</div>
            <h2 style={{ ...styles.cardValue, fontSize: 21, color: lowStockProducts.length ? "#b45309" : "#047857" }}>{lowStockProducts.length}</h2>
            <div style={styles.cardFoot}>De los productos activos consultados</div>
          </article>
        </section>

        <section style={styles.grid}>
          <article style={{ ...styles.panel, gridColumn: "span 2" }}>
            <div style={styles.row}>
              <h2 style={styles.sectionTitle}>Actividad comercial · últimos 7 días</h2>
              <span style={styles.muted}>Ventas y compras registradas</span>
            </div>
            <div style={{ display: "grid", gap: 15, marginTop: 18 }}>
              {trends.map((day) => (
                <div key={day.date.toISOString()} style={{ display: "grid", gridTemplateColumns: "65px minmax(0, 1fr)", gap: 12, alignItems: "center" }}>
                  <span style={{ color: "#64748b", fontSize: 12, textTransform: "capitalize" }}>{day.label}</span>
                  <div style={{ display: "grid", gap: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{ flex: 1, height: 9, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.max(day.sales > 0 ? 2 : 0, (day.sales / trendMax) * 100)}%`, background: "#2563eb", borderRadius: 999 }} /></div>
                      <span style={{ minWidth: 94, textAlign: "right", fontSize: 12, color: "#334155" }}>{money(day.sales)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{ flex: 1, height: 7, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.max(day.purchases > 0 ? 2 : 0, (day.purchases / trendMax) * 100)}%`, background: "#0d9488", borderRadius: 999 }} /></div>
                      <span style={{ minWidth: 94, textAlign: "right", fontSize: 12, color: "#64748b" }}>{money(day.purchases)}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 15, fontSize: 12, color: "#64748b" }}>
                <span><span style={{ display: "inline-block", width: 9, height: 9, background: "#2563eb", borderRadius: 3, marginRight: 5 }} />Ventas</span>
                <span><span style={{ display: "inline-block", width: 9, height: 9, background: "#0d9488", borderRadius: 3, marginRight: 5 }} />Compras</span>
              </div>
            </div>
          </article>
          <article style={styles.panel}>
            <h2 style={styles.sectionTitle}>Accesos rápidos</h2>
            <p style={styles.muted}>Continúa con las tareas operativas.</p>
            <div style={{ display: "grid", gap: 9, marginTop: 15 }}>
              <Link to="/operations" style={styles.buttonPrimary}>Ventas y compras</Link>
              <Link to="/inventory" style={styles.button}>Consultar inventario</Link>
              <Link to="/finance" style={styles.button}>Caja y gastos</Link>
              <Link to="/reports" style={styles.button}>Reportes comerciales</Link>
              {isGlobalAdmin && <Link to="/admin" style={styles.button}>Administración global</Link>}
            </div>
          </article>
        </section>

        <section style={styles.grid}>
          <article style={{ ...styles.panel, minWidth: 0 }}>
            <div style={styles.row}>
              <h2 style={styles.sectionTitle}>Operaciones recientes</h2>
              <Link to="/operations" style={{ ...styles.button, padding: "7px 10px", fontSize: 12 }}>Ver historial</Link>
            </div>
            <div style={{ ...styles.tableWrap, marginTop: 15 }}>
              <table style={styles.table}>
                <thead><tr>{["Fecha", ...(associationId === ALL_ASSOCIATIONS ? ["Empresa"] : []), "Tipo", "Código", "Cliente / proveedor", "Total", "Estado"].map((header) => <th key={header} style={styles.th}>{header}</th>)}</tr></thead>
                <tbody>
                  {recentOperations.length === 0 ? <tr><td colSpan={associationId === ALL_ASSOCIATIONS ? 7 : 6} style={{ ...styles.td, textAlign: "center", color: "#64748b" }}>No hay operaciones registradas para mostrar.</td></tr> : recentOperations.map((operation) => (
                    <tr key={`${operation.associationId}-${operation.type}-${operation.id}`}>
                      <td style={styles.td}>{operation.date ? operation.date.toLocaleString("es-HN", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                      {associationId === ALL_ASSOCIATIONS && <td style={styles.td}>{operation.associationName}</td>}
                      <td style={styles.td}><span style={{ ...styles.tag, background: operation.type === "Venta" ? "#dbeafe" : "#ccfbf1", color: operation.type === "Venta" ? "#1d4ed8" : "#0f766e" }}>{operation.type}</span></td>
                      <td style={styles.td}>{operation.code}</td>
                      <td style={styles.td}>{operation.partner}</td>
                      <td style={{ ...styles.td, fontWeight: 750 }}>{money(operation.total)}</td>
                      <td style={styles.td}><span style={styles.tag}>{operation.status.toUpperCase() === "ACTIVE" ? "Activa" : operation.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article style={styles.panel}>
            <div style={styles.row}>
              <h2 style={styles.sectionTitle}>Alertas de inventario</h2>
              <Link to="/inventory" style={{ ...styles.button, padding: "7px 10px", fontSize: 12 }}>Ver inventario</Link>
            </div>
            <p style={styles.muted}>Productos en su stock mínimo o por debajo.</p>
            <div style={{ ...styles.tableWrap, marginTop: 10 }}>
              <table style={{ ...styles.table, minWidth: 360 }}>
                <thead><tr>{[...(associationId === ALL_ASSOCIATIONS ? ["Empresa"] : []), "Producto", "Existencias", "Mínimo"].map((header) => <th key={header} style={styles.th}>{header}</th>)}</tr></thead>
                <tbody>
                  {lowStockProducts.length === 0 ? <tr><td colSpan={associationId === ALL_ASSOCIATIONS ? 4 : 3} style={{ ...styles.td, textAlign: "center", color: "#64748b" }}>No hay alertas de stock bajo.</td></tr> : lowStockProducts.map((product) => (
                    <tr key={`${product.associationId}-${product.id}`}>
                      {associationId === ALL_ASSOCIATIONS && <td style={styles.td}>{product.associationName}</td>}
                      <td style={styles.td}><strong>{str(product.data.name, product.id)}</strong><div style={{ color: "#64748b", fontSize: 11 }}>{str(product.data.code, product.id)}</div></td>
                      <td style={styles.td}><span style={styles.lowTag}>{num(product.data.stock).toLocaleString("es-HN")}</span></td>
                      <td style={styles.td}>{num(product.data.stockMinimo, 10).toLocaleString("es-HN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <p style={{ ...styles.muted, margin: 0 }}>Los importes se calculan con documentos activos. La utilidad bruta es estimada según el costo registrado por línea de venta; no incluye gastos operativos. El saldo de caja considera movimientos activos del período y no equivale necesariamente al efectivo físico contado.</p>
      </main>
    </MainLayout>
  );
}
