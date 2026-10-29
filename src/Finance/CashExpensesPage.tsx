import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { collection, getDocs } from "firebase/firestore";

import MainLayout from "../layout/MainLayout";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase/firestore";
import { hasPermission } from "../models/permissions";
import { cashService } from "../services/cash/cashService";
import {
  expenseService,
  type CreateExpenseInput,
} from "../services/expenses/xpenseService";

type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "OTHER";
type CashType = "INCOME" | "EXPENSE";
type Tab = "summary" | "cash" | "expenses";
type DataMap = Record<string, unknown>;

interface AssociationOption {
  id: string;
  name: string;
}

interface FinanceRecord {
  id: string;
  associationId: string;
  associationName: string;
  data: DataMap;
}

interface ManualCashInput {
  associationId: string;
  associationName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  concept: string;
  description: string;
  notes?: string;
}

// La firma se declara aquí de forma estructural para no depender de
// los detalles internos de la clase CashService en la interfaz.
type CashServiceApi = {
  registerIncome(input: ManualCashInput): Promise<unknown>;
  registerExpense(input: ManualCashInput): Promise<unknown>;
};

const ALL_ASSOCIATIONS = "__ALL_ASSOCIATIONS__";
const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Efectivo" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "CARD", label: "Tarjeta" },
  { value: "OTHER", label: "Otro" },
];

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: 20, color: "#172033", padding: 26, background: "#f1f5f9", minHeight: "100%", boxSizing: "border-box" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 },
  title: { margin: 0, fontSize: 28, fontWeight: 750 },
  muted: { color: "#64748b", lineHeight: 1.5, margin: "7px 0 0" },
  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20, minWidth: 0 },
  label: { display: "grid", gap: 7, color: "#475569", fontSize: 13, fontWeight: 650 },
  input: { width: "100%", minWidth: 0, boxSizing: "border-box", padding: "11px 12px", border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", color: "#0f172a", font: "inherit", fontWeight: 400 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 },
  row: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  primary: { border: 0, borderRadius: 7, background: "#2563eb", color: "#fff", padding: "11px 15px", fontWeight: 700, cursor: "pointer" },
  secondary: { border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", color: "#334155", padding: "10px 13px", fontWeight: 650, cursor: "pointer" },
  tab: { border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", color: "#334155", padding: "10px 14px", fontWeight: 700, cursor: "pointer" },
  activeTab: { borderColor: "#1d4ed8", background: "#1d4ed8", color: "#fff" },
  tableWrap: { overflowX: "auto", width: "100%" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 750 },
  th: { textAlign: "left", background: "#f8fafc", color: "#475569", padding: "12px 10px", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" },
  td: { padding: "12px 10px", borderBottom: "1px solid #e2e8f0", verticalAlign: "top" },
  notice: { padding: 12, borderRadius: 8, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", lineHeight: 1.5 },
  error: { padding: 12, borderRadius: 8, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", lineHeight: 1.5 },
  success: { padding: 12, borderRadius: 8, background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", lineHeight: 1.5 },
};

function textValue(value: unknown, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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
  if (typeof value === "string" || typeof value === "number") {
    const converted = new Date(value);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  return null;
}

function dateLabel(value: unknown): string {
  const date = dateValue(value);
  return date ? date.toLocaleString("es-HN", { dateStyle: "short", timeStyle: "short" }) : "Sin fecha";
}

function money(value: number): string {
  return new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL", minimumFractionDigits: 2 }).format(value);
}

function isActive(value: unknown): boolean {
  const status = textValue(value, "ACTIVE").toUpperCase();
  return status !== "CANCELLED" && status !== "CANCELED" && status !== "INACTIVE";
}

function localDateInput(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default function CashExpensesPage() {
  const { user, loading: authLoading } = useAuth();
  const isGlobalAdmin = Boolean(user && user.active && user.role === "Administrador" && user.associationId.trim().toLowerCase() === "todas");
  const canRegisterCash = Boolean(user && user.active && hasPermission(user.role, "cash:register"));
  const canViewExpenses = Boolean(user && user.active && hasPermission(user.role, "expenses:view"));
  const canCreateExpense = Boolean(user && user.active && hasPermission(user.role, "expenses:create"));
  const canCancelExpense = Boolean(user && user.active && hasPermission(user.role, "expenses:cancel"));

  const [tab, setTab] = useState<Tab>("summary");
  const [associations, setAssociations] = useState<AssociationOption[]>([]);
  const [associationId, setAssociationId] = useState("");
  const [cashRecords, setCashRecords] = useState<FinanceRecord[]>([]);
  const [expenseRecords, setExpenseRecords] = useState<FinanceRecord[]>([]);
  const [loadingAssociations, setLoadingAssociations] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  const [cashType, setCashType] = useState<CashType>("INCOME");
  const [cashAmount, setCashAmount] = useState("");
  const [cashMethod, setCashMethod] = useState<PaymentMethod>("CASH");
  const [cashConcept, setCashConcept] = useState("");
  const [cashNotes, setCashNotes] = useState("");

  const [expenseCategory, setExpenseCategory] = useState("Operativo");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(localDateInput());
  const [expensePaymentStatus, setExpensePaymentStatus] = useState<"PAID" | "PENDING">("PAID");
  const [expenseMethod, setExpenseMethod] = useState<PaymentMethod>("CASH");
  const [expenseSupplier, setExpenseSupplier] = useState("");
  const [expenseInvoice, setExpenseInvoice] = useState("");
  const [expenseNotes, setExpenseNotes] = useState("");

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
              return { id: document.id, name: textValue(data.name ?? data.associationName, document.id) };
            })
            .sort((a, b) => a.name.localeCompare(b.name, "es-HN"));
        } else if (user.associationId && user.associationId.trim().toLowerCase() !== "todas") {
          options = [{ id: user.associationId.trim(), name: user.associationName || user.associationId.trim() }];
        } else {
          options = [];
        }
        if (mounted) {
          setAssociations(options);
          setAssociationId((current) => {
            if (current === ALL_ASSOCIATIONS && isGlobalAdmin) return current;
            return options.some((option) => option.id === current) ? current : (isGlobalAdmin ? ALL_ASSOCIATIONS : (options[0]?.id ?? ""));
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
    if (!user?.active || !associations.length || !associationId) return;
    setLoadingData(true);
    setError("");
    try {
      const selected = associationId === ALL_ASSOCIATIONS ? associations : associations.filter((item) => item.id === associationId);
      const collectedCash: FinanceRecord[] = [];
      const collectedExpenses: FinanceRecord[] = [];
      for (const association of selected) {
        const cashRef = collection(db, "associations", association.id, "cashMovements");
        const cashSnapshot = await getDocs(cashRef);
        collectedCash.push(...cashSnapshot.docs.map((document) => ({ id: document.id, associationId: association.id, associationName: association.name, data: document.data() })));

        if (canViewExpenses) {
          const expensesRef = collection(db, "associations", association.id, "expenses");
          const expensesSnapshot = await getDocs(expensesRef);
          collectedExpenses.push(...expensesSnapshot.docs.map((document) => ({ id: document.id, associationId: association.id, associationName: association.name, data: document.data() })));
        }
      }
      collectedCash.sort((a, b) => (dateValue(b.data.createdAt ?? b.data.date)?.getTime() ?? 0) - (dateValue(a.data.createdAt ?? a.data.date)?.getTime() ?? 0));
      collectedExpenses.sort((a, b) => (dateValue(b.data.expenseDate ?? b.data.createdAt)?.getTime() ?? 0) - (dateValue(a.data.expenseDate ?? a.data.createdAt)?.getTime() ?? 0));
      setCashRecords(collectedCash);
      setExpenseRecords(collectedExpenses);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron consultar los movimientos de caja y gastos.");
    } finally {
      setLoadingData(false);
    }
  }, [user, associations, associationId, canViewExpenses]);

  useEffect(() => { void loadData(); }, [loadData]);

  const visibleCash = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return cashRecords;
    return cashRecords.filter((record) => [record.associationName, record.data.concept, record.data.description, record.data.createdBy, record.data.referenceId, record.data.type].some((value) => textValue(value, "").toLowerCase().includes(term)));
  }, [cashRecords, search]);

  const visibleExpenses = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return expenseRecords;
    return expenseRecords.filter((record) => [record.associationName, record.data.category, record.data.description, record.data.supplier, record.data.invoiceNumber, record.data.createdBy].some((value) => textValue(value, "").toLowerCase().includes(term)));
  }, [expenseRecords, search]);

  const activeCash = cashRecords.filter((record) => isActive(record.data.status));
  const totalIncome = activeCash.filter((record) => textValue(record.data.type).toUpperCase() === "INCOME").reduce((sum, record) => sum + numberValue(record.data.amount), 0);
  const totalCashExpense = activeCash.filter((record) => textValue(record.data.type).toUpperCase() === "EXPENSE").reduce((sum, record) => sum + numberValue(record.data.amount), 0);
  const activeExpenses = expenseRecords.filter((record) => isActive(record.data.status));
  const paidExpenseTotal = activeExpenses.filter((record) => textValue(record.data.paymentStatus).toUpperCase() === "PAID").reduce((sum, record) => sum + numberValue(record.data.amount), 0);
  const pendingExpenseTotal = activeExpenses.filter((record) => textValue(record.data.paymentStatus).toUpperCase() === "PENDING").reduce((sum, record) => sum + numberValue(record.data.amount), 0);
  const selectedAssociation = associations.find((association) => association.id === associationId);
  const currentAssociationName = selectedAssociation?.name ?? (associationId === ALL_ASSOCIATIONS ? "Todas las empresas" : "");

  const handleCashSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!user?.active || !canRegisterCash) {
      setError("Tu perfil no tiene permiso para registrar movimientos manuales de caja.");
      return;
    }
    if (!selectedAssociation || associationId === ALL_ASSOCIATIONS) {
      setError("Selecciona una empresa específica antes de registrar el movimiento.");
      return;
    }
    const amount = Number(cashAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !cashConcept.trim()) {
      setError("Indica un importe mayor que cero y un concepto.");
      return;
    }
    setSaving(true);
    try {
      const payload: ManualCashInput = {
        associationId: selectedAssociation.id,
        associationName: selectedAssociation.name,
        amount,
        paymentMethod: cashMethod,
        concept: cashConcept.trim(),
        description: cashConcept.trim(),
        ...(cashNotes.trim() ? { notes: cashNotes.trim() } : {}),
      };
      const api = cashService as unknown as CashServiceApi;
      if (cashType === "INCOME") await api.registerIncome(payload);
      else await api.registerExpense(payload);
      setCashAmount("");
      setCashConcept("");
      setCashNotes("");
      setNotice(cashType === "INCOME" ? "Ingreso de caja registrado." : "Egreso manual de caja registrado.");
      await loadData();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo registrar el movimiento de caja.");
    } finally {
      setSaving(false);
    }
  };

  const handleExpenseSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!user?.active || !canCreateExpense) {
      setError("Tu perfil no tiene permiso para registrar gastos.");
      return;
    }
    if (!selectedAssociation || associationId === ALL_ASSOCIATIONS) {
      setError("Selecciona una empresa específica antes de registrar el gasto.");
      return;
    }
    const amount = Number(expenseAmount);
    const parsedDate = new Date(`${expenseDate}T12:00:00`);
    if (!expenseCategory.trim() || !expenseDescription.trim() || !Number.isFinite(amount) || amount <= 0 || Number.isNaN(parsedDate.getTime())) {
      setError("Completa categoría, descripción, fecha e importe válido.");
      return;
    }
    if (expensePaymentStatus === "PAID" && !expenseMethod) {
      setError("Selecciona el método de pago para un gasto pagado.");
      return;
    }
    setSaving(true);
    try {
      const input: CreateExpenseInput = {
        associationId: selectedAssociation.id,
        associationName: selectedAssociation.name,
        category: expenseCategory.trim(),
        description: expenseDescription.trim(),
        amount,
        paymentStatus: expensePaymentStatus,
        expenseDate: parsedDate,
        createdBy: user.email,
        ...(expensePaymentStatus === "PAID" ? { paymentMethod: expenseMethod } : {}),
        ...(expenseSupplier.trim() ? { supplier: expenseSupplier.trim() } : {}),
        ...(expenseInvoice.trim() ? { invoiceNumber: expenseInvoice.trim() } : {}),
        ...(expenseNotes.trim() ? { notes: expenseNotes.trim() } : {}),
      };
      await expenseService.createExpense(input);
      setExpenseDescription("");
      setExpenseAmount("");
      setExpenseSupplier("");
      setExpenseInvoice("");
      setExpenseNotes("");
      setNotice(expensePaymentStatus === "PAID" ? "Gasto registrado y egreso de caja generado." : "Gasto pendiente registrado; todavía no afecta la caja.");
      await loadData();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo registrar el gasto.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelExpense = async (record: FinanceRecord) => {
    if (!canCancelExpense) return;
    const reason = window.prompt("Indica el motivo de la cancelación del gasto:");
    if (!reason?.trim()) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await expenseService.cancelExpense(record.associationId, record.id, reason.trim());
      setNotice("Gasto cancelado. El documento y la auditoría se conservan.");
      await loadData();
    } catch (cancelError: unknown) {
      setError(cancelError instanceof Error ? cancelError.message : "No se pudo cancelar el gasto.");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loadingAssociations) {
    return <MainLayout><div style={styles.page}><p>Cargando Caja y Gastos…</p></div></MainLayout>;
  }

  if (!user || !user.active) {
    return <MainLayout><div style={styles.page}><div style={styles.error}>Necesitas una cuenta activa para acceder a Caja y Gastos.</div></div></MainLayout>;
  }

  return (
    <MainLayout>
      <main style={styles.page}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Caja y Gastos</h1>
            <p style={styles.muted}>Controla ingresos, egresos y gastos por empresa, con trazabilidad.</p>
          </div>
          <button type="button" style={styles.secondary} onClick={() => void loadData()} disabled={loadingData || saving}>Actualizar datos</button>
        </header>

        <section style={styles.notice}>
          Las ventas y compras ya registran su movimiento de caja cuando corresponde. Los gastos con estado «Pagado» también generan automáticamente su egreso; no registres de nuevo ese mismo pago en Caja manual.
        </section>

        {error && <div role="alert" style={styles.error}>{error}</div>}
        {notice && <div role="status" style={styles.success}>{notice}</div>}

        <section style={styles.panel}>
          <label style={{ ...styles.label, maxWidth: 500 }}>
            Empresa
            <select style={styles.input} value={associationId} onChange={(event) => setAssociationId(event.target.value)}>
              {isGlobalAdmin && <option value={ALL_ASSOCIATIONS}>Todas las empresas</option>}
              {associations.map((association) => <option key={association.id} value={association.id}>{association.name}</option>)}
            </select>
          </label>
          <p style={styles.muted}>Empresa consultada: <strong>{currentAssociationName || "Sin empresa asignada"}</strong></p>
        </section>

        <section style={styles.grid}>
          <div style={styles.panel}><div style={styles.muted}>Ingresos de caja activos</div><h2>{money(totalIncome)}</h2><small>{activeCash.filter((record) => textValue(record.data.type).toUpperCase() === "INCOME").length} movimientos</small></div>
          <div style={styles.panel}><div style={styles.muted}>Egresos de caja activos</div><h2>{money(totalCashExpense)}</h2><small>{activeCash.filter((record) => textValue(record.data.type).toUpperCase() === "EXPENSE").length} movimientos</small></div>
          <div style={styles.panel}><div style={styles.muted}>Saldo neto de caja</div><h2>{money(totalIncome - totalCashExpense)}</h2><small>Ingresos menos egresos activos</small></div>
          <div style={styles.panel}><div style={styles.muted}>Gastos pagados / pendientes</div><h2>{money(paidExpenseTotal)} / {money(pendingExpenseTotal)}</h2><small>{activeExpenses.length} gastos activos</small></div>
        </section>

        <section style={styles.panel}>
          <nav style={styles.row} aria-label="Secciones de caja y gastos">
            {([ ["summary", "Resumen"], ["cash", "Movimientos de caja"], ["expenses", "Gastos"] ] as [Tab, string][]).map(([key, label]) => (
              <button key={key} type="button" style={{ ...styles.tab, ...(tab === key ? styles.activeTab : {}) }} onClick={() => { setTab(key); setSearch(""); }}>{label}</button>
            ))}
          </nav>

          {tab === "summary" && (
            <div style={{ display: "grid", gap: 18, marginTop: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Resumen financiero</h2>
              <p style={styles.muted}>Los valores se calculan a partir de los movimientos y gastos activos de la empresa seleccionada.</p>
              <div style={styles.grid}>
                <div style={{ ...styles.notice, color: "#0f766e", background: "#f0fdfa", borderColor: "#99f6e4" }}><strong>Saldo operativo</strong><br />{money(totalIncome - totalCashExpense)}</div>
                <div style={styles.notice}><strong>Gastos pagados</strong><br />{money(paidExpenseTotal)}</div>
                <div style={{ ...styles.notice, color: "#92400e", background: "#fffbeb", borderColor: "#fde68a" }}><strong>Gastos pendientes</strong><br />{money(pendingExpenseTotal)}</div>
              </div>
              {loadingData && <p style={styles.muted}>Actualizando cifras…</p>}
            </div>
          )}

          {tab === "cash" && (
            <div style={{ display: "grid", gap: 20, marginTop: 20 }}>
              {canRegisterCash && (
                <form style={{ ...styles.panel, background: "#f8fafc" }} onSubmit={(event) => void handleCashSubmit(event)}>
                  <h2 style={{ marginTop: 0, fontSize: 20 }}>Registrar movimiento manual</h2>
                  <p style={styles.muted}>Utiliza esta opción para entradas o salidas que no provienen de una venta, compra o gasto formal.</p>
                  <div style={styles.grid}>
                    <label style={styles.label}>Tipo
                      <select style={styles.input} value={cashType} onChange={(event) => setCashType(event.target.value as CashType)}><option value="INCOME">Ingreso</option><option value="EXPENSE">Egreso manual</option></select>
                    </label>
                    <label style={styles.label}>Importe (L)
                      <input style={styles.input} type="number" min="0.01" step="0.01" required value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} placeholder="0.00" />
                    </label>
                    <label style={styles.label}>Método
                      <select style={styles.input} value={cashMethod} onChange={(event) => setCashMethod(event.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select>
                    </label>
                    <label style={styles.label}>Concepto
                      <input style={styles.input} required value={cashConcept} onChange={(event) => setCashConcept(event.target.value)} placeholder="Ej. ajuste de caja justificado" />
                    </label>
                  </div>
                  <label style={{ ...styles.label, marginTop: 14 }}>Notas (opcional)
                    <input style={styles.input} value={cashNotes} onChange={(event) => setCashNotes(event.target.value)} placeholder="Detalle o referencia" />
                  </label>
                  <div style={{ ...styles.row, justifyContent: "flex-end", marginTop: 16 }}><button type="submit" style={styles.primary} disabled={saving || loadingData || associationId === ALL_ASSOCIATIONS}>{saving ? "Guardando…" : cashType === "INCOME" ? "Registrar ingreso" : "Registrar egreso"}</button></div>
                  {associationId === ALL_ASSOCIATIONS && <p style={styles.muted}>Selecciona una empresa específica para registrar el movimiento.</p>}
                </form>
              )}
              {!canRegisterCash && <div style={styles.notice}>Tu perfil puede consultar caja, pero no registrar movimientos manuales.</div>}
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                <h2 style={{ margin: 0, fontSize: 20 }}>Historial de caja</h2>
                <input style={{ ...styles.input, maxWidth: 330 }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar concepto, referencia o usuario…" />
              </div>
              <div style={styles.tableWrap}><table style={styles.table}><thead><tr><th style={styles.th}>Fecha</th><th style={styles.th}>Empresa</th><th style={styles.th}>Tipo</th><th style={styles.th}>Concepto</th><th style={styles.th}>Método</th><th style={styles.th}>Importe</th><th style={styles.th}>Estado</th></tr></thead><tbody>
                {visibleCash.map((record) => <tr key={`${record.associationId}-${record.id}`}><td style={styles.td}>{dateLabel(record.data.createdAt ?? record.data.date)}</td><td style={styles.td}>{record.associationName}</td><td style={styles.td}>{textValue(record.data.type)}</td><td style={styles.td}>{textValue(record.data.concept ?? record.data.description)}{record.data.notes ? <div style={styles.muted}>{textValue(record.data.notes, "")}</div> : null}</td><td style={styles.td}>{textValue(record.data.paymentMethod)}</td><td style={{ ...styles.td, fontWeight: 700 }}>{money(numberValue(record.data.amount))}</td><td style={styles.td}>{isActive(record.data.status) ? "Activo" : "Cancelado"}</td></tr>)}
                {!loadingData && visibleCash.length === 0 && <tr><td colSpan={7} style={{ ...styles.td, textAlign: "center", color: "#64748b" }}>No hay movimientos de caja para este filtro.</td></tr>}
              </tbody></table></div>
            </div>
          )}

          {tab === "expenses" && (
            <div style={{ display: "grid", gap: 20, marginTop: 20 }}>
              {canCreateExpense && (
                <form style={{ ...styles.panel, background: "#f8fafc" }} onSubmit={(event) => void handleExpenseSubmit(event)}>
                  <h2 style={{ marginTop: 0, fontSize: 20 }}>Registrar gasto</h2>
                  <p style={styles.muted}>Los gastos pagados generan su movimiento de caja automáticamente. Los pendientes se registran sin afectar el saldo hasta que exista un flujo de pago autorizado.</p>
                  <div style={styles.grid}>
                    <label style={styles.label}>Categoría
                      <select style={styles.input} value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)}><option>Operativo</option><option>Transporte</option><option>Combustible</option><option>Servicios</option><option>Mantenimiento</option><option>Personal</option><option>Alquiler</option><option>Impuestos</option><option>Otro</option></select>
                    </label>
                    <label style={styles.label}>Descripción
                      <input style={styles.input} required value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} placeholder="¿En qué se gastó?" />
                    </label>
                    <label style={styles.label}>Importe (L)
                      <input style={styles.input} required type="number" min="0.01" step="0.01" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} placeholder="0.00" />
                    </label>
                    <label style={styles.label}>Fecha del gasto
                      <input style={styles.input} required type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
                    </label>
                    <label style={styles.label}>Estado de pago
                      <select style={styles.input} value={expensePaymentStatus} onChange={(event) => setExpensePaymentStatus(event.target.value as "PAID" | "PENDING")}><option value="PAID">Pagado</option><option value="PENDING">Pendiente</option></select>
                    </label>
                    {expensePaymentStatus === "PAID" && <label style={styles.label}>Método de pago
                      <select style={styles.input} value={expenseMethod} onChange={(event) => setExpenseMethod(event.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select>
                    </label>}
                    <label style={styles.label}>Proveedor (opcional)
                      <input style={styles.input} value={expenseSupplier} onChange={(event) => setExpenseSupplier(event.target.value)} placeholder="Nombre del proveedor" />
                    </label>
                    <label style={styles.label}>N.º de factura (opcional)
                      <input style={styles.input} value={expenseInvoice} onChange={(event) => setExpenseInvoice(event.target.value)} placeholder="Número de factura" />
                    </label>
                  </div>
                  <label style={{ ...styles.label, marginTop: 14 }}>Notas (opcional)
                    <input style={styles.input} value={expenseNotes} onChange={(event) => setExpenseNotes(event.target.value)} placeholder="Información adicional" />
                  </label>
                  <div style={{ ...styles.row, justifyContent: "flex-end", marginTop: 16 }}><button type="submit" style={styles.primary} disabled={saving || loadingData || associationId === ALL_ASSOCIATIONS}>{saving ? "Guardando…" : "Registrar gasto"}</button></div>
                  {associationId === ALL_ASSOCIATIONS && <p style={styles.muted}>Selecciona una empresa específica para registrar el gasto.</p>}
                </form>
              )}
              {!canViewExpenses && <div style={styles.notice}>Tu rol no tiene permiso para consultar los gastos.</div>}
              {canViewExpenses && <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                  <h2 style={{ margin: 0, fontSize: 20 }}>Historial de gastos</h2>
                  <input style={{ ...styles.input, maxWidth: 330 }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar categoría, descripción o proveedor…" />
                </div>
                <div style={styles.tableWrap}><table style={styles.table}><thead><tr><th style={styles.th}>Fecha</th><th style={styles.th}>Empresa</th><th style={styles.th}>Categoría</th><th style={styles.th}>Descripción</th><th style={styles.th}>Proveedor / factura</th><th style={styles.th}>Pago</th><th style={styles.th}>Importe</th><th style={styles.th}>Estado</th><th style={styles.th}>Acción</th></tr></thead><tbody>
                  {visibleExpenses.map((record) => <tr key={`${record.associationId}-${record.id}`}><td style={styles.td}>{dateLabel(record.data.expenseDate ?? record.data.createdAt)}</td><td style={styles.td}>{record.associationName}</td><td style={styles.td}>{textValue(record.data.category)}</td><td style={styles.td}>{textValue(record.data.description)}{record.data.notes ? <div style={styles.muted}>{textValue(record.data.notes, "")}</div> : null}</td><td style={styles.td}>{textValue(record.data.supplier)}<div style={styles.muted}>{textValue(record.data.invoiceNumber, "")}</div></td><td style={styles.td}>{textValue(record.data.paymentStatus)}</td><td style={{ ...styles.td, fontWeight: 700 }}>{money(numberValue(record.data.amount))}</td><td style={styles.td}>{isActive(record.data.status) ? "Activo" : "Cancelado"}</td><td style={styles.td}>{canCancelExpense && isActive(record.data.status) ? <button type="button" style={styles.secondary} disabled={saving} onClick={() => void handleCancelExpense(record)}>Cancelar</button> : "—"}</td></tr>)}
                  {!loadingData && visibleExpenses.length === 0 && <tr><td colSpan={9} style={{ ...styles.td, textAlign: "center", color: "#64748b" }}>No hay gastos para este filtro.</td></tr>}
                </tbody></table></div>
              </>}
            </div>
          )}
          {loadingData && <p style={styles.muted}>Consultando los registros…</p>}
        </section>
      </main>
    </MainLayout>
  );
}