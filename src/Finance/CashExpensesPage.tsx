import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";

import MainLayout from "../layout/MainLayout";
import { auth } from "../firebase/auth";
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
type Tab = "summary" | "cash" | "expenses" | "closings";
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

interface CashClosingRecord {
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
  panel: { background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: "#e2e8f0", borderRadius: 10, padding: 20, minWidth: 0 },
  label: { display: "grid", gap: 7, color: "#475569", fontSize: 13, fontWeight: 650 },
  input: { width: "100%", minWidth: 0, boxSizing: "border-box", padding: "11px 12px", borderWidth: 1, borderStyle: "solid", borderColor: "#cbd5e1", borderRadius: 7, background: "#fff", color: "#0f172a", font: "inherit", fontWeight: 400 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 },
  row: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  primary: { borderWidth: 0, borderStyle: "solid", borderColor: "transparent", borderRadius: 7, background: "#2563eb", color: "#fff", padding: "11px 15px", fontWeight: 700, cursor: "pointer" },
  secondary: { borderWidth: 1, borderStyle: "solid", borderColor: "#cbd5e1", borderRadius: 7, background: "#fff", color: "#334155", padding: "10px 13px", fontWeight: 650, cursor: "pointer" },
  tab: { borderWidth: 1, borderStyle: "solid", borderColor: "#cbd5e1", borderRadius: 7, background: "#fff", color: "#334155", padding: "10px 14px", fontWeight: 700, cursor: "pointer" },
  activeTab: { borderColor: "#1d4ed8", background: "#1d4ed8", color: "#fff" },
  tableWrap: { overflowX: "auto", width: "100%" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 750 },
  th: { textAlign: "left", background: "#f8fafc", color: "#475569", padding: "12px 10px", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" },
  td: { padding: "12px 10px", borderBottom: "1px solid #e2e8f0", verticalAlign: "top" },
  notice: { padding: 12, borderRadius: 8, background: "#eff6ff", color: "#1d4ed8", borderWidth: 1, borderStyle: "solid", borderColor: "#bfdbfe", lineHeight: 1.5 },
  error: { padding: 12, borderRadius: 8, background: "#fef2f2", color: "#b91c1c", borderWidth: 1, borderStyle: "solid", borderColor: "#fecaca", lineHeight: 1.5 },
  success: { padding: 12, borderRadius: 8, background: "#f0fdf4", color: "#166534", borderWidth: 1, borderStyle: "solid", borderColor: "#bbf7d0", lineHeight: 1.5 },
  tag: { display: "inline-block", padding: "4px 9px", borderRadius: 999, background: "#dcfce7", color: "#166534", fontSize: 11, fontWeight: 750 },
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

// Un documento heredado o de prueba sin campos financieros válidos se conserva
// en el historial, pero no se suma como gasto activo ni se presenta como válido.
function hasRequiredExpenseFields(record: FinanceRecord): boolean {
  const data = record.data;
  const amount = numberValue(data.amount);
  const paymentStatus = textValue(data.paymentStatus, "").toUpperCase();
  const category = textValue(data.category, "");
  const description = textValue(data.description, "");
  const expenseDate = dateValue(data.expenseDate ?? data.createdAt);

  return Boolean(
    category &&
    description &&
    Number.isFinite(amount) &&
    amount > 0 &&
    (paymentStatus === "PAID" || paymentStatus === "PENDING") &&
    expenseDate
  );
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
  // El responsable de caja puede cerrar su propio corte si es Administrador o Vendedor.
  // Esto no amplía el permiso para registrar ingresos/egresos manuales.
  const canCloseCash = Boolean(user && user.active && (user.role === "Administrador" || user.role === "Vendedor"));
  const canViewExpenses = Boolean(user && user.active && (user.role === "Vendedor" || hasPermission(user.role, "expenses:view")));
  const canCreateExpense = Boolean(user && user.active && (user.role === "Vendedor" || hasPermission(user.role, "expenses:create")));
  const canCancelExpense = Boolean(user && user.active && hasPermission(user.role, "expenses:cancel"));

  const [tab, setTab] = useState<Tab>("summary");
  const [associations, setAssociations] = useState<AssociationOption[]>([]);
  const [associationId, setAssociationId] = useState("");
  const [cashRecords, setCashRecords] = useState<FinanceRecord[]>([]);
  const [expenseRecords, setExpenseRecords] = useState<FinanceRecord[]>([]);
  const [cashClosings, setCashClosings] = useState<CashClosingRecord[]>([]);
  const [cashClosingsWarning, setCashClosingsWarning] = useState("");
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

  const [closingShift, setClosingShift] = useState("Turno 1");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [openingNotes, setOpeningNotes] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [closingNotes, setClosingNotes] = useState("");

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
      const collectedClosings: CashClosingRecord[] = [];
      let closingReadFailed = false;
      for (const association of selected) {
        const cashRef = collection(db, "associations", association.id, "cashMovements");
        const cashSnapshot = await getDocs(cashRef);
        collectedCash.push(...cashSnapshot.docs.map((document) => ({ id: document.id, associationId: association.id, associationName: association.name, data: document.data() })));

        if (canViewExpenses) {
          const expensesRef = collection(db, "associations", association.id, "expenses");
          const expensesSnapshot = await getDocs(expensesRef);
          collectedExpenses.push(...expensesSnapshot.docs.map((document) => ({ id: document.id, associationId: association.id, associationName: association.name, data: document.data() })));
        }

        // El historial de cortes se consulta por separado para que una regla
        // todavía no publicada no interrumpa el módulo anterior de Caja/Gastos.
        try {
          const closingsRef = collection(db, "associations", association.id, "cashClosings");
          // El administrador consulta todas las cajas de la asociación.
          // Los demás roles solo consultan cajas cuyo responsable sea su propio correo.
          const closingQuery = user?.role === "Administrador"
            ? closingsRef
            : query(
                closingsRef,
                where("responsibleEmail", "==", (user?.email ?? "").trim().toLowerCase())
              );
          const closingsSnapshot = await getDocs(closingQuery);
          collectedClosings.push(...closingsSnapshot.docs.map((document) => ({
            id: document.id,
            associationId: association.id,
            associationName: association.name,
            data: document.data(),
          })));
        } catch (closingReadError: unknown) {
          closingReadFailed = true;
          console.warn("No se pudieron leer los cortes de caja:", closingReadError);
        }
      }
      collectedCash.sort((a, b) => (dateValue(b.data.createdAt ?? b.data.date)?.getTime() ?? 0) - (dateValue(a.data.createdAt ?? a.data.date)?.getTime() ?? 0));
      collectedExpenses.sort((a, b) => (dateValue(b.data.expenseDate ?? b.data.createdAt)?.getTime() ?? 0) - (dateValue(a.data.expenseDate ?? a.data.createdAt)?.getTime() ?? 0));
      collectedClosings.sort((a, b) => (dateValue(b.data.periodEndAt ?? b.data.closedAt ?? b.data.createdAt)?.getTime() ?? 0) - (dateValue(a.data.periodEndAt ?? a.data.closedAt ?? a.data.createdAt)?.getTime() ?? 0));
      setCashRecords(collectedCash);
      setExpenseRecords(collectedExpenses);
      setCashClosings(collectedClosings);
      setCashClosingsWarning(closingReadFailed
        ? "No se pudo leer el historial de cortes. Para calcular el siguiente turno sin solapamientos, primero hay que habilitar la lectura de la subcolección cashClosings en las reglas de Firestore."
        : "");
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
  const activeExpenseRecords = expenseRecords.filter((record) => isActive(record.data.status));
  const activeExpenses = activeExpenseRecords.filter(hasRequiredExpenseFields);
  const incompleteActiveExpenses = activeExpenseRecords.filter((record) => !hasRequiredExpenseFields(record));
  const paidExpenseTotal = activeExpenses.filter((record) => textValue(record.data.paymentStatus).toUpperCase() === "PAID").reduce((sum, record) => sum + numberValue(record.data.amount), 0);
  const pendingExpenseTotal = activeExpenses.filter((record) => textValue(record.data.paymentStatus).toUpperCase() === "PENDING").reduce((sum, record) => sum + numberValue(record.data.amount), 0);
  const selectedAssociation = associations.find((association) => association.id === associationId);
  const currentAssociationName = selectedAssociation?.name ?? (associationId === ALL_ASSOCIATIONS ? "Todas las empresas" : "");

  const selectedCashClosings = cashClosings
    .filter((record) => associationId === ALL_ASSOCIATIONS || record.associationId === associationId)
    .sort((a, b) => (dateValue(b.data.periodEndAt ?? b.data.closedAt ?? b.data.openedAt ?? b.data.createdAt)?.getTime() ?? 0) - (dateValue(a.data.periodEndAt ?? a.data.closedAt ?? a.data.openedAt ?? a.data.createdAt)?.getTime() ?? 0));
  // Cada responsable administra su propia caja abierta; el historial de la asociación
  // muestra cajas abiertas y cerradas sin permitir reescribir cierres históricos.
  const currentResponsibleClosings = selectedCashClosings.filter((record) =>
    textValue(record.data.responsibleEmail ?? record.data.createdBy, "").trim().toLowerCase() === (user?.email ?? "").trim().toLowerCase()
  );
  const activeCashRegister = associationId !== ALL_ASSOCIATIONS
    ? currentResponsibleClosings.find((record) => textValue(record.data.status).toUpperCase() === "OPEN")
    : undefined;
  const latestCashClosing = associationId !== ALL_ASSOCIATIONS
    ? currentResponsibleClosings.find((record) => textValue(record.data.status).toUpperCase() === "CLOSED")
    : undefined;
  const latestClosingEnd = latestCashClosing ? dateValue(latestCashClosing.data.periodEndAt) : null;
  const closingPeriodStart = activeCashRegister
    ? dateValue(activeCashRegister.data.periodStartAt)
    : (latestClosingEnd ?? (() => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return start;
    })());
  const closingCalculationEnd = new Date();
  const cashMovementsInClosingWindow = activeCash.filter((record) => {
    if (record.associationId !== associationId || associationId === ALL_ASSOCIATIONS || !closingPeriodStart) return false;
    const method = textValue(record.data.paymentMethod, "").toUpperCase();
    if (method !== "CASH") return false;
    const movementDate = dateValue(record.data.createdAt ?? record.data.date);
    return Boolean(movementDate && movementDate.getTime() > closingPeriodStart.getTime() && movementDate.getTime() <= closingCalculationEnd.getTime());
  });
  const cashMovementsMissingResponsible = cashMovementsInClosingWindow.filter((record) =>
    !textValue(record.data.createdBy ?? record.data.createdByEmail ?? record.data.actorEmail ?? record.data.userEmail, "").trim()
  );
  const cashMovementsInClosingPeriod = cashMovementsInClosingWindow.filter((record) => {
    // No mezclar cobros o pagos de otro responsable en esta caja individual.
    const movementResponsible = textValue(
      record.data.createdBy ?? record.data.createdByEmail ?? record.data.actorEmail ?? record.data.userEmail,
      ""
    ).trim().toLowerCase();
    return Boolean(user?.email && movementResponsible === user.email.trim().toLowerCase());
  });
  const closingCashIncome = cashMovementsInClosingPeriod
    .filter((record) => textValue(record.data.type).toUpperCase() === "INCOME")
    .reduce((sum, record) => sum + numberValue(record.data.amount), 0);
  const closingCashExpense = cashMovementsInClosingPeriod
    .filter((record) => textValue(record.data.type).toUpperCase() === "EXPENSE")
    .reduce((sum, record) => sum + numberValue(record.data.amount), 0);
  const openingBalanceValue = activeCashRegister
    ? numberValue(activeCashRegister.data.openingBalance)
    : Number(openingBalance);
  const closingExpectedCash = (Number.isFinite(openingBalanceValue) ? openingBalanceValue : 0) + closingCashIncome - closingCashExpense;
  const countedCashValue = Number(countedCash);
  const closingDifference = Math.round((((Number.isFinite(countedCashValue) ? countedCashValue : 0) - closingExpectedCash) + Number.EPSILON) * 100) / 100;

  useEffect(() => {
    // El saldo inicial sugerido proviene del efectivo contado en la última caja cerrada
    // por este responsable. Una caja abierta conserva su propio saldo inicial.
    if (associationId === ALL_ASSOCIATIONS || !associationId) return;
    if (activeCashRegister) {
      setOpeningBalance(String(numberValue(activeCashRegister.data.openingBalance)));
      setClosingShift(textValue(activeCashRegister.data.shiftLabel, "Turno 1"));
      setOpeningNotes(textValue(activeCashRegister.data.openingNotes, ""));
      setCountedCash("");
      setClosingNotes("");
      return;
    }
    setOpeningBalance(latestCashClosing ? String(numberValue(latestCashClosing.data.countedCash)) : "0");
    setClosingShift("Turno 1");
    setOpeningNotes("");
    setCountedCash("");
    setClosingNotes("");
  }, [associationId, activeCashRegister?.id, latestCashClosing?.id]);

  const handleCashRegisterOpenSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!user?.active || !canCloseCash) {
      setError("Tu perfil no tiene permiso para abrir una caja.");
      return;
    }
    if (!selectedAssociation || associationId === ALL_ASSOCIATIONS) {
      setError("Selecciona una asociación específica antes de abrir la caja.");
      return;
    }
    if (cashClosingsWarning) {
      setError("No se puede abrir caja de forma segura hasta habilitar las reglas de Firestore para cashClosings.");
      return;
    }
    if (activeCashRegister) {
      setError("Ya tienes una caja abierta. Ciérrala antes de abrir otra.");
      return;
    }
    const opening = Number(openingBalance);
    if (!Number.isFinite(opening) || opening < 0 || openingBalance.trim() === "") {
      setError("Indica un saldo inicial válido, igual o mayor que cero.");
      return;
    }
    if (!closingShift.trim()) {
      setError("Escribe un nombre para identificar la caja o el turno.");
      return;
    }
    const currentAuthUser = auth.currentUser;
    if (!currentAuthUser?.uid || !currentAuthUser.email) {
      setError("No se pudo identificar la cuenta autenticada. Cierra y vuelve a iniciar sesión antes de abrir la caja.");
      return;
    }
    const responsibleEmail = currentAuthUser.email.trim().toLowerCase();

    setSaving(true);
    try {
      await addDoc(collection(db, "associations", selectedAssociation.id, "cashClosings"), {
        associationId: selectedAssociation.id,
        associationName: selectedAssociation.name,
        type: "CASH_REGISTER",
        status: "OPEN",
        shiftLabel: closingShift.trim(),
        periodStartAt: serverTimestamp(),
        openingBalance: opening,
        responsibleEmail,
        createdBy: responsibleEmail,
        createdByUid: currentAuthUser.uid,
        createdAt: serverTimestamp(),
        openedAt: serverTimestamp(),
        openingNotes: openingNotes.trim(),
      });
      setNotice(`Caja «${closingShift.trim()}» abierta con saldo inicial de ${money(opening)}. Ya puedes trabajar y luego realizar el cierre.`);
      setCountedCash("");
      setClosingNotes("");
      await loadData();
    } catch (saveError: unknown) {
      const message = saveError instanceof Error ? saveError.message : "No se pudo abrir la caja.";
      setError(message.includes("permission-denied") || message.toLowerCase().includes("missing or insufficient permissions")
        ? "Firebase rechazó la apertura porque las reglas de cashClosings todavía no permiten crear cajas abiertas. Revisa el bloque de reglas actualizado incluido en el paquete."
        : message);
    } finally {
      setSaving(false);
    }
  };

  const handleCashClosingSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!user?.active || !canCloseCash) {
      setError("Tu perfil no tiene permiso para cerrar caja.");
      return;
    }
    if (!selectedAssociation || associationId === ALL_ASSOCIATIONS) {
      setError("Selecciona una asociación específica antes de hacer el corte.");
      return;
    }
    if (!activeCashRegister) {
      setError("Primero debes abrir una caja antes de poder cerrarla.");
      return;
    }
    if (cashClosingsWarning) {
      setError("No se puede cerrar caja de forma segura mientras no esté disponible el historial de cajas. Habilita primero las reglas de Firestore para cashClosings.");
      return;
    }
    if (cashMovementsMissingResponsible.length > 0) {
      setError(`Hay ${cashMovementsMissingResponsible.length} movimiento(s) en efectivo del período sin responsable identificado. Por seguridad, revisa esos registros antes de cerrar la caja.`);
      return;
    }
    const startAt = dateValue(activeCashRegister.data.periodStartAt);
    const counted = Number(countedCash);
    const endAt = new Date();
    if (!startAt || startAt.getTime() >= endAt.getTime()) {
      setError("La fecha inicial de esta caja no es válida. Actualiza los datos y vuelve a intentarlo.");
      return;
    }
    if (!Number.isFinite(counted) || counted < 0 || countedCash.trim() === "") {
      setError("Indica el efectivo contado físicamente, igual o mayor que cero.");
      return;
    }
    const opening = numberValue(activeCashRegister.data.openingBalance);
    const expected = opening + closingCashIncome - closingCashExpense;
    const difference = Math.round((counted - expected + Number.EPSILON) * 100) / 100;
    setSaving(true);
    try {
      await updateDoc(doc(db, "associations", selectedAssociation.id, "cashClosings", activeCashRegister.id), {
        status: "CLOSED",
        periodEndAt: serverTimestamp(),
        cashIncome: closingCashIncome,
        cashExpense: closingCashExpense,
        cashIncomeMovementCount: cashMovementsInClosingPeriod.filter((record) => textValue(record.data.type).toUpperCase() === "INCOME").length,
        cashExpenseMovementCount: cashMovementsInClosingPeriod.filter((record) => textValue(record.data.type).toUpperCase() === "EXPENSE").length,
        expectedCash: expected,
        countedCash: counted,
        difference,
        closedAt: serverTimestamp(),
        closingNotes: closingNotes.trim(),
      });
      setCountedCash("");
      setClosingNotes("");
      setOpeningNotes("");
      setNotice(`Caja «${textValue(activeCashRegister.data.shiftLabel)}» cerrada. Efectivo esperado: ${money(expected)}; contado: ${money(counted)}; diferencia: ${money(difference)}. El cierre quedó guardado en el historial.`);
      await loadData();
    } catch (saveError: unknown) {
      const message = saveError instanceof Error ? saveError.message : "No se pudo cerrar la caja.";
      setError(message.includes("permission-denied") || message.toLowerCase().includes("missing or insufficient permissions")
        ? "Firebase rechazó el cierre. Comprueba que las reglas de cashClosings permitan al responsable cerrar únicamente su propia caja abierta. No se confirmó el cierre."
        : message);
    } finally {
      setSaving(false);
    }
  };

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
          <div style={styles.panel}><div style={styles.muted}>Gastos pagados / pendientes</div><h2>{money(paidExpenseTotal)} / {money(pendingExpenseTotal)}</h2><small>{activeExpenses.length} gastos válidos activos{incompleteActiveExpenses.length > 0 ? ` · ${incompleteActiveExpenses.length} registro(s) incompleto(s)` : ""}</small></div>
        </section>

        <section style={styles.panel}>
          <nav style={styles.row} aria-label="Secciones de caja y gastos">
            {([ ["summary", "Resumen"], ["cash", "Movimientos de caja"], ["expenses", "Gastos"], ["closings", "Cortes de caja"] ] as [Tab, string][]).map(([key, label]) => (
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
                      <select style={styles.input} value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)}><option>Operativo</option><option>Energía eléctrica / ENEE</option><option>Agua</option><option>Internet</option><option>Telefonía</option><option>Servicios públicos</option><option>Transporte</option><option>Combustible</option><option>Hielo</option><option>Alimentación</option><option>Mantenimiento</option><option>Personal</option><option>Alquiler</option><option>Impuestos</option><option>Aseo y recolección</option><option>Otro</option></select>
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
                {incompleteActiveExpenses.length > 0 && <div role="status" style={styles.notice}>Se encontraron {incompleteActiveExpenses.length} registro(s) de gasto incompleto(s). Se conservan en el historial, pero no se incluyen en los totales financieros hasta revisar sus datos. No se ha eliminado ni modificado ningún registro.</div>}
                <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                  <h2 style={{ margin: 0, fontSize: 20 }}>Historial de gastos</h2>
                  <input style={{ ...styles.input, maxWidth: 330 }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar categoría, descripción o proveedor…" />
                </div>
                <div style={styles.tableWrap}><table style={styles.table}><thead><tr><th style={styles.th}>Fecha</th><th style={styles.th}>Empresa</th><th style={styles.th}>Categoría</th><th style={styles.th}>Descripción</th><th style={styles.th}>Proveedor / factura</th><th style={styles.th}>Pago</th><th style={styles.th}>Importe</th><th style={styles.th}>Estado</th><th style={styles.th}>Acción</th></tr></thead><tbody>
                  {visibleExpenses.map((record) => <tr key={`${record.associationId}-${record.id}`}><td style={styles.td}>{dateLabel(record.data.expenseDate ?? record.data.createdAt)}</td><td style={styles.td}>{record.associationName}</td><td style={styles.td}>{textValue(record.data.category)}</td><td style={styles.td}>{textValue(record.data.description)}{record.data.notes ? <div style={styles.muted}>{textValue(record.data.notes, "")}</div> : null}</td><td style={styles.td}>{textValue(record.data.supplier)}<div style={styles.muted}>{textValue(record.data.invoiceNumber, "")}</div></td><td style={styles.td}>{textValue(record.data.paymentStatus)}</td><td style={{ ...styles.td, fontWeight: 700 }}>{money(numberValue(record.data.amount))}</td><td style={styles.td}>{!hasRequiredExpenseFields(record) ? <span title="Faltan categoría, descripción, fecha, importe válido o estado de pago.">Incompleto · revisar</span> : isActive(record.data.status) ? "Activo" : "Cancelado"}</td><td style={styles.td}>{canCancelExpense && isActive(record.data.status) ? <button type="button" style={styles.secondary} disabled={saving} onClick={() => void handleCancelExpense(record)}>Cancelar</button> : "—"}</td></tr>)}
                  {!loadingData && visibleExpenses.length === 0 && <tr><td colSpan={9} style={{ ...styles.td, textAlign: "center", color: "#64748b" }}>No hay gastos para este filtro.</td></tr>}
                </tbody></table></div>
              </>}
            </div>
          )}
          {tab === "closings" && (
            <div style={{ display: "grid", gap: 20, marginTop: 20 }}>
              <div style={styles.notice}>
                Primero abre una caja para iniciar el turno. Al finalizar, cuenta el efectivo y ciérrala. El sistema compara saldo inicial + ingresos − egresos en efectivo con el dinero contado. Transferencias, tarjeta y gastos pendientes no se suman al efectivo físico.
              </div>
              {cashClosingsWarning && <div role="alert" style={styles.error}>{cashClosingsWarning}</div>}
              {cashMovementsMissingResponsible.length > 0 && activeCashRegister && <div role="alert" style={styles.error}>Hay {cashMovementsMissingResponsible.length} movimiento(s) en efectivo del período sin responsable identificado. El sistema bloqueará el cierre para evitar un saldo incorrecto.</div>}

              {canCloseCash ? activeCashRegister ? (
                <form style={{ ...styles.panel, background: "#f0fdf4", borderColor: "#bbf7d0" }} onSubmit={(event) => void handleCashClosingSubmit(event)}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 20, color: "#166534" }}>Caja abierta · {textValue(activeCashRegister.data.shiftLabel, "Turno sin nombre")}</h2>
                      <p style={styles.muted}>Responsable: <strong>{user.email}</strong> · Desde {dateLabel(activeCashRegister.data.openedAt ?? activeCashRegister.data.createdAt)}</p>
                    </div>
                    <span style={{ ...styles.tag, background: "#dcfce7", color: "#166534" }}>ABIERTA</span>
                  </div>
                  <div style={styles.grid}>
                    <label style={styles.label}>Asociación
                      <input style={styles.input} value={selectedAssociation?.name ?? "Selecciona una asociación"} readOnly />
                    </label>
                    <label style={styles.label}>Saldo inicial (L)
                      <input style={styles.input} value={money(numberValue(activeCashRegister.data.openingBalance))} readOnly />
                    </label>
                  </div>
                  <div style={{ ...styles.grid, marginTop: 16 }}>
                    <div style={{ ...styles.panel, background: "#fff" }}><div style={styles.muted}>Ingresos en efectivo desde apertura</div><h2 style={{ margin: "8px 0 0", color: "#047857" }}>{money(closingCashIncome)}</h2><small>{cashMovementsInClosingPeriod.filter((record) => textValue(record.data.type).toUpperCase() === "INCOME").length} movimientos</small></div>
                    <div style={{ ...styles.panel, background: "#fff" }}><div style={styles.muted}>Egresos en efectivo desde apertura</div><h2 style={{ margin: "8px 0 0", color: "#b91c1c" }}>{money(closingCashExpense)}</h2><small>{cashMovementsInClosingPeriod.filter((record) => textValue(record.data.type).toUpperCase() === "EXPENSE").length} movimientos</small></div>
                    <div style={{ ...styles.panel, background: "#fff" }}><div style={styles.muted}>Efectivo esperado</div><h2 style={{ margin: "8px 0 0" }}>{money(numberValue(activeCashRegister.data.openingBalance) + closingCashIncome - closingCashExpense)}</h2><small>Saldo inicial + ingresos − egresos</small></div>
                    <div style={{ ...styles.panel, background: "#fff" }}><div style={styles.muted}>Diferencia preliminar</div><h2 style={{ margin: "8px 0 0", color: countedCash.trim() === "" ? "#64748b" : closingDifference === 0 ? "#047857" : closingDifference > 0 ? "#b45309" : "#b91c1c" }}>{countedCash.trim() === "" ? "Pendiente de conteo" : money(closingDifference)}</h2><small>{countedCash.trim() === "" ? "Ingresa el efectivo contado" : closingDifference === 0 ? "Caja cuadrada" : closingDifference > 0 ? "Sobrante de efectivo" : "Faltante de efectivo"}</small></div>
                  </div>
                  <div style={{ ...styles.grid, marginTop: 16 }}>
                    <label style={styles.label}>Efectivo contado físicamente (L)
                      <input style={styles.input} required type="number" min="0" step="0.01" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} placeholder="Cuenta el efectivo físico" />
                    </label>
                    <label style={styles.label}>Observaciones del cierre (opcional)
                      <input style={styles.input} value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} placeholder="Explica una diferencia o deja una observación" maxLength={500} />
                    </label>
                  </div>
                  {activeCashRegister.data.openingNotes ? <p style={styles.muted}>Notas de apertura: {textValue(activeCashRegister.data.openingNotes, "")}</p> : null}
                  <div style={{ ...styles.row, justifyContent: "flex-end", marginTop: 16 }}>
                    <button type="submit" style={styles.primary} disabled={saving || loadingData || associationId === ALL_ASSOCIATIONS || Boolean(cashClosingsWarning) || cashMovementsMissingResponsible.length > 0}>{saving ? "Cerrando caja…" : "Cerrar caja y guardar corte"}</button>
                  </div>
                </form>
              ) : (
                <form style={{ ...styles.panel, background: "#f8fafc" }} onSubmit={(event) => void handleCashRegisterOpenSubmit(event)}>
                  <h2 style={{ marginTop: 0, fontSize: 20 }}>Abrir una caja nueva</h2>
                  <p style={styles.muted}>Responsable: <strong>{user.email}</strong>. Cada vendedor solo puede tener una caja abierta a la vez. El saldo inicial sugerido viene del último cierre propio en esta asociación.</p>
                  <div style={styles.grid}>
                    <label style={styles.label}>Asociación
                      <input style={styles.input} value={selectedAssociation?.name ?? "Selecciona una asociación"} readOnly />
                    </label>
                    <label style={styles.label}>Nombre de caja / turno
                      <input style={styles.input} required value={closingShift} onChange={(event) => setClosingShift(event.target.value)} placeholder="Ej. Turno mañana, Caja 1" maxLength={60} />
                    </label>
                    <label style={styles.label}>Saldo inicial (L)
                      <input style={styles.input} required type="number" min="0" step="0.01" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} />
                    </label>
                  </div>
                  <label style={{ ...styles.label, marginTop: 16 }}>Notas de apertura (opcional)
                    <input style={styles.input} value={openingNotes} onChange={(event) => setOpeningNotes(event.target.value)} placeholder="Efectivo recibido, observaciones del turno…" maxLength={500} />
                  </label>
                  <div style={{ ...styles.row, justifyContent: "flex-end", marginTop: 16 }}>
                    <button type="submit" style={styles.primary} disabled={saving || loadingData || associationId === ALL_ASSOCIATIONS || Boolean(cashClosingsWarning)}>{saving ? "Abriendo caja…" : "＋ Abrir caja"}</button>
                  </div>
                  {associationId === ALL_ASSOCIATIONS && <p style={styles.muted}>Selecciona una asociación concreta para abrir una caja.</p>}
                </form>
              ) : (
                <div style={styles.notice}>Tu perfil no tiene permiso para abrir o cerrar una caja. Solicita acceso al administrador de tu asociación.</div>
              )}

              <section style={styles.panel}>
                <div style={{ ...styles.row, justifyContent: "space-between", marginBottom: 12 }}>
                  <div><h2 style={{ margin: 0, fontSize: 20 }}>Historial de cajas</h2><p style={styles.muted}>Las cajas abiertas aparecen aquí y se actualizan a cerradas al confirmar su corte. Los cierres históricos no se pueden editar ni eliminar.</p></div>
                  <button type="button" style={styles.secondary} onClick={() => void loadData()} disabled={loadingData || saving}>Actualizar historial</button>
                </div>
                <div style={styles.tableWrap}><table style={styles.table}><thead><tr>
                  {(associationId === ALL_ASSOCIATIONS ? ["Asociación", "Apertura / cierre", "Caja / turno", "Responsable", "Estado", "Esperado", "Contado", "Diferencia"] : ["Apertura / cierre", "Caja / turno", "Responsable", "Saldo inicial", "Ingresos efectivo", "Egresos efectivo", "Estado", "Esperado", "Contado", "Diferencia"]).map((heading) => <th key={heading} style={styles.th}>{heading}</th>)}
                </tr></thead><tbody>
                  {selectedCashClosings.map((record) => {
                    const isClosed = textValue(record.data.status).toUpperCase() === "CLOSED";
                    const eventAt = dateValue(isClosed ? (record.data.closedAt ?? record.data.periodEndAt) : (record.data.openedAt ?? record.data.createdAt));
                    const difference = numberValue(record.data.difference);
                    return <tr key={`${record.associationId}-${record.id}`}>
                      {associationId === ALL_ASSOCIATIONS && <td style={styles.td}>{record.associationName}</td>}
                      <td style={styles.td}>{eventAt ? eventAt.toLocaleString("es-HN", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                      <td style={styles.td}>{textValue(record.data.shiftLabel)}</td>
                      <td style={styles.td}>{textValue(record.data.responsibleEmail ?? record.data.createdBy)}</td>
                      {associationId !== ALL_ASSOCIATIONS && <>
                        <td style={styles.td}>{money(numberValue(record.data.openingBalance))}</td>
                        <td style={styles.td}>{isClosed ? money(numberValue(record.data.cashIncome)) : "—"}</td>
                        <td style={styles.td}>{isClosed ? money(numberValue(record.data.cashExpense)) : "—"}</td>
                      </>}
                      <td style={styles.td}><span style={{ ...styles.tag, ...(isClosed ? { background: "#e2e8f0", color: "#334155" } : { background: "#dcfce7", color: "#166534" }) }}>{isClosed ? "Cerrada" : "Abierta"}</span></td>
                      <td style={styles.td}>{isClosed ? money(numberValue(record.data.expectedCash)) : "—"}</td>
                      <td style={styles.td}>{isClosed ? money(numberValue(record.data.countedCash)) : "—"}</td>
                      <td style={{ ...styles.td, fontWeight: 750, color: difference === 0 ? "#047857" : difference > 0 ? "#b45309" : "#b91c1c" }}>{isClosed ? money(difference) : "—"}{record.data.closingNotes ? <div style={styles.muted}>{textValue(record.data.closingNotes, "")}</div> : null}</td>
                    </tr>;
                  })}
                  {!loadingData && selectedCashClosings.length === 0 && <tr><td colSpan={associationId === ALL_ASSOCIATIONS ? 8 : 10} style={{ ...styles.td, textAlign: "center", color: "#64748b" }}>{cashClosingsWarning ? "El historial no está disponible hasta habilitar los permisos de Firestore." : "Todavía no hay cajas registradas."}</td></tr>}
                </tbody></table></div>
              </section>
            </div>
          )}

          {loadingData && <p style={styles.muted}>Consultando los registros…</p>}
        </section>
      </main>
    </MainLayout>
  );
}