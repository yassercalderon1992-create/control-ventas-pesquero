import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { collection, doc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";

import MainLayout from "../layout/MainLayout";
import { auth } from "../firebase/auth";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase/firestore";

type Tab = "journal" | "contributions" | "loans" | "taxes" | "dividends" | "fines" | "tourism" | "consolidation";
type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "OTHER";
type PaymentStatus = "PAID" | "PENDING";
type CashFlow = "INCOME" | "EXPENSE";
type OperationType =
  | "CONTRIBUTION_COLLECTION"
  | "LOAN_OPEN"
  | "LOAN_PAYMENT"
  | "TAX_OBLIGATION"
  | "TAX_PAYMENT"
  | "DIVIDEND_DECLARATION"
  | "DIVIDEND_PAYMENT"
  | "FINE_OBLIGATION"
  | "FINE_PAYMENT"
  | "TOURISM_SERVICE"
  | "TOURISM_SETTLEMENT";
type DataMap = Record<string, unknown>;

interface AssociationOption { id: string; name: string; }
interface SourceRecord { id: string; associationId: string; associationName: string; data: DataMap; }
interface JournalLine { accountCode: string; account: string; debit: number; credit: number; description: string; }
interface JournalEntry {
  id: string; associationId: string; associationName: string; date: Date | null;
  documentNumber: string; description: string; sourceType: string; sourceLabel: string;
  paymentMethod: string; status: string; sourceId: string; lines: JournalLine[];
  needsClassification: boolean;
}
interface FinancialOperationInput extends DataMap {
  operationType: OperationType;
  amount: number;
  description: string;
  operationDate: Date;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  direction?: "INCOME" | "EXPENSE" | "GIVEN" | "RECEIVED";
  relatedOperationId?: string;
  loanId?: string;
  capitalAmount?: number;
  interestAmount?: number;
  annualInterestRate?: number;
  termMonths?: number;
}

const ALL_ASSOCIATIONS = "__ALL_ASSOCIATIONS__";
const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Efectivo" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "CARD", label: "Tarjeta" },
  { value: "OTHER", label: "Otro" },
];
const TABS: { value: Tab; label: string }[] = [
  { value: "journal", label: "Libro diario" },
  { value: "contributions", label: "Aportes" },
  { value: "loans", label: "Préstamos" },
  { value: "taxes", label: "Impuestos" },
  { value: "dividends", label: "Dividendos" },
  { value: "fines", label: "Multas" },
  { value: "tourism", label: "Servicios turísticos" },
  { value: "consolidation", label: "Consolidación" },
];
const SETTLEMENT_TYPES = new Set<OperationType>(["TAX_PAYMENT", "DIVIDEND_PAYMENT", "FINE_PAYMENT", "TOURISM_SETTLEMENT"]);
const READ_ROLES = new Set(["Administrador", "Consulta", "Vendedor"]);

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: 18, padding: 26, background: "#f1f5f9", color: "#172033", minHeight: "100%", boxSizing: "border-box" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 },
  title: { margin: 0, fontSize: 28, fontWeight: 750 },
  subtitle: { margin: "7px 0 0", color: "#64748b", lineHeight: 1.5 },
  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18, minWidth: 0 },
  filters: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "end" },
  label: { display: "grid", gap: 7, color: "#475569", fontSize: 13, fontWeight: 650 },
  input: { width: "100%", minWidth: 0, boxSizing: "border-box", padding: "10px 11px", borderWidth: 1, borderStyle: "solid", borderColor: "#cbd5e1", borderRadius: 7, background: "#fff", color: "#0f172a", font: "inherit", fontWeight: 400 },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  primary: { border: 0, borderRadius: 7, background: "#2563eb", color: "#fff", padding: "10px 14px", fontWeight: 700, cursor: "pointer" },
  secondary: { borderWidth: 1, borderStyle: "solid", borderColor: "#cbd5e1", borderRadius: 7, background: "#fff", color: "#334155", padding: "9px 12px", fontWeight: 650, cursor: "pointer" },
  tab: { borderWidth: 1, borderStyle: "solid", borderColor: "#cbd5e1", borderRadius: 7, background: "#fff", color: "#334155", padding: "10px 12px", fontWeight: 700, cursor: "pointer" },
  activeTab: { borderColor: "#1d4ed8", background: "#1d4ed8", color: "#fff" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 },
  metric: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 },
  metricLabel: { margin: 0, color: "#64748b", fontSize: 12 },
  metricValue: { margin: "8px 0 0", color: "#0f172a", fontSize: 22, fontWeight: 800 },
  tableWrap: { overflowX: "auto", width: "100%" },
  table: { width: "100%", minWidth: 920, borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", background: "#f8fafc", color: "#475569", padding: "11px 9px", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" },
  td: { padding: "11px 9px", borderBottom: "1px solid #e2e8f0", verticalAlign: "top" },
  notice: { padding: 12, borderRadius: 8, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", lineHeight: 1.5 },
  warning: { padding: 12, borderRadius: 8, background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a", lineHeight: 1.5 },
  error: { padding: 12, borderRadius: 8, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", lineHeight: 1.5 },
  success: { padding: 12, borderRadius: 8, background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", lineHeight: 1.5 },
  muted: { color: "#64748b", fontSize: 13, lineHeight: 1.45 },
  badge: { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "#e2e8f0", color: "#334155", fontSize: 11, fontWeight: 700 },
};

function textValue(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}
function numberValue(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
function roundMoney(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
function dateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const converted = value.toDate();
    return converted instanceof Date && !Number.isNaN(converted.getTime()) ? converted : null;
  }
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    const converted = new Date(value.toMillis());
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  if (typeof value === "string" || typeof value === "number") {
    const converted = new Date(value);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  return null;
}
function recordDate(data: DataMap): Date | null {
  for (const key of ["operationDate", "transactionDate", "expenseDate", "createdAt", "date", "saleDate", "purchaseDate"]) {
    const parsed = dateValue(data[key]);
    if (parsed) return parsed;
  }
  return null;
}
function localDateInput(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function parseInputDate(value: string): Date {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error("Indica una fecha válida.");
  return parsed;
}
function formatDate(date: Date | null): string {
  return date ? date.toLocaleString("es-HN", { dateStyle: "short", timeStyle: "short" }) : "Sin fecha";
}
function money(value: number): string {
  return new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
}
function isActive(data: DataMap): boolean {
  return !["CANCELLED", "CANCELED", "INACTIVE", "DELETED"].includes(textValue(data.status, "ACTIVE").toUpperCase());
}
function mapDocs(snapshot: Awaited<ReturnType<typeof getDocs>>, association: AssociationOption): SourceRecord[] {
  return snapshot.docs.map((document) => ({ id: document.id, associationId: association.id, associationName: association.name, data: document.data() as DataMap }));
}
function line(accountCode: string, account: string, debit: number, credit: number, description: string): JournalLine {
  return { accountCode, account, debit: roundMoney(debit), credit: roundMoney(credit), description };
}
function methodAccount(method: string): { code: string; name: string } {
  if (method === "CASH") return { code: "1101", name: "Caja" };
  if (method === "TRANSFER") return { code: "1102", name: "Bancos" };
  if (method === "CARD") return { code: "1103", name: "Tarjetas por liquidar" };
  return { code: "1199", name: "Otros medios por clasificar" };
}
function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
function exportCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const content = [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFFsep=;\r\n", content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function makeLegacyEntry(args: {
  id: string; associationId: string; associationName: string; date: Date | null; documentNumber: string;
  description: string; sourceType: string; sourceLabel: string; paymentMethod: string; status: string;
  sourceId: string; lines: JournalLine[]; needsClassification?: boolean;
}): JournalEntry | null {
  if (!args.lines.length) return null;
  const debit = roundMoney(args.lines.reduce((sum, item) => sum + item.debit, 0));
  const credit = roundMoney(args.lines.reduce((sum, item) => sum + item.credit, 0));
  if (debit <= 0 || Math.abs(debit - credit) > 0.01) return null;
  return { ...args, needsClassification: args.needsClassification ?? false };
}
function monthlyInstallment(principal: number, annualRate: number, termMonths: number): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const monthlyRate = Math.max(0, annualRate) / 1200;
  if (monthlyRate === 0) return roundMoney(principal / termMonths);
  return roundMoney(principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths)));
}

function getRemainingForObligation(record: SourceRecord, operations: SourceRecord[]): number {
  const paid = operations.filter((item) => item.associationId === record.associationId && item.data.relatedOperationId === record.id && SETTLEMENT_TYPES.has(textValue(item.data.operationType) as OperationType))
    .reduce((sum, item) => sum + numberValue(item.data.amount), 0);
  return roundMoney(Math.max(0, numberValue(record.data.amount) - paid));
}
function getLoanPrincipalRemaining(loan: SourceRecord, operations: SourceRecord[]): number {
  const principalPaid = operations.filter((item) => item.data.operationType === "LOAN_PAYMENT" && item.data.loanId === loan.id && item.associationId === loan.associationId)
    .reduce((sum, item) => sum + numberValue(item.data.capitalAmount), 0);
  return roundMoney(Math.max(0, numberValue(loan.data.principalAmount ?? loan.data.amount) - principalPaid));
}

function buildLines(operationType: OperationType, data: DataMap): JournalLine[] {
  const amount = roundMoney(numberValue(data.amount));
  const method = textValue(data.paymentMethod, "CASH");
  const cash = methodAccount(method);
  const status = textValue(data.paymentStatus, "PAID").toUpperCase();
  const direction = textValue(data.direction, "INCOME").toUpperCase();
  const baseDescription = textValue(data.description, operationType.replace(/_/g, " "));
  const payableOrReceivable = (code: string, name: string, debit: boolean, description: string) => debit
    ? line(code, name, amount, 0, description)
    : line(code, name, 0, amount, description);
  const result: JournalLine[] = [];
  switch (operationType) {
    case "CONTRIBUTION_COLLECTION":
      result.push(line(cash.code, cash.name, amount, 0, "Cobro de aporte"));
      result.push(line("3101", "Aportes de socios", 0, amount, baseDescription));
      break;
    case "LOAN_OPEN":
      if (direction === "GIVEN") {
        result.push(line("1201", "Préstamos por cobrar", amount, 0, baseDescription));
        result.push(line(cash.code, cash.name, 0, amount, "Desembolso de préstamo otorgado"));
      } else {
        result.push(line(cash.code, cash.name, amount, 0, "Desembolso de préstamo recibido"));
        result.push(line("2201", "Préstamos por pagar", 0, amount, baseDescription));
      }
      break;
    case "LOAN_PAYMENT": {
      const capital = roundMoney(numberValue(data.capitalAmount));
      const interest = roundMoney(numberValue(data.interestAmount));
      const total = roundMoney(capital + interest);
      if (direction === "GIVEN") {
        result.push(line(cash.code, cash.name, total, 0, "Cobro de cuota de préstamo"));
        if (capital > 0) result.push(line("1201", "Préstamos por cobrar", 0, capital, "Abono a capital"));
        if (interest > 0) result.push(line("4201", "Ingresos por intereses", 0, interest, "Intereses cobrados"));
      } else {
        if (capital > 0) result.push(line("2201", "Préstamos por pagar", capital, 0, "Abono a capital de préstamo recibido"));
        if (interest > 0) result.push(line("5201", "Gastos por intereses", interest, 0, "Intereses pagados"));
        result.push(line(cash.code, cash.name, 0, total, "Pago de cuota de préstamo"));
      }
      break;
    }
    case "TAX_OBLIGATION":
      result.push(line("5301", "Gastos por impuestos", amount, 0, baseDescription));
      result.push(status === "PAID"
        ? line(cash.code, cash.name, 0, amount, "Pago de impuesto")
        : payableOrReceivable("2101", "Impuestos por pagar", false, "Obligación fiscal pendiente"));
      break;
    case "TAX_PAYMENT":
      result.push(line("2101", "Impuestos por pagar", amount, 0, "Cancelación de obligación fiscal"));
      result.push(line(cash.code, cash.name, 0, amount, "Pago de impuesto"));
      break;
    case "DIVIDEND_DECLARATION":
      result.push(line("3201", "Resultados acumulados / dividendos declarados", amount, 0, baseDescription));
      result.push(status === "PAID"
        ? line(cash.code, cash.name, 0, amount, "Distribución pagada")
        : line("2103", "Dividendos por pagar", 0, amount, "Dividendos pendientes de pago"));
      break;
    case "DIVIDEND_PAYMENT":
      result.push(line("2103", "Dividendos por pagar", amount, 0, "Pago de dividendos declarados"));
      result.push(line(cash.code, cash.name, 0, amount, "Pago de dividendos"));
      break;
    case "FINE_OBLIGATION":
      // La asociación impone la multa al socio: es ingreso, no gasto.
      result.push(status === "PAID"
        ? line(cash.code, cash.name, amount, 0, "Cobro de multa a socio")
        : line("1203", "Multas por cobrar a socios", amount, 0, "Multa pendiente de cobro"));
      result.push(line("4202", "Ingresos por multas a socios", 0, amount, baseDescription));
      break;
    case "FINE_PAYMENT":
      // El cobro de una multa previamente reconocida cancela la cuenta por cobrar:
      // débito a Caja/Bancos y crédito a Multas por cobrar. No se reconoce el ingreso dos veces.
      result.push(line(cash.code, cash.name, amount, 0, "Cobro de multa pendiente a socio"));
      result.push(line("1203", "Multas por cobrar a socios", 0, amount, "Aplicación del cobro a la cuenta por cobrar"));
      break;
    case "TOURISM_SERVICE":
      if (direction === "INCOME") {
        result.push(status === "PAID"
          ? line(cash.code, cash.name, amount, 0, "Cobro de servicio turístico")
          : line("1202", "Cuentas por cobrar - turismo", amount, 0, "Servicio turístico pendiente de cobro"));
        result.push(line("4102", "Ingresos por servicios turísticos", 0, amount, baseDescription));
      } else {
        result.push(line("5202", "Costos y gastos de servicios turísticos", amount, 0, baseDescription));
        result.push(status === "PAID"
          ? line(cash.code, cash.name, 0, amount, "Pago de servicio turístico")
          : line("2104", "Proveedores turísticos por pagar", 0, amount, "Servicio turístico pendiente de pago"));
      }
      break;
    case "TOURISM_SETTLEMENT":
      if (direction === "INCOME") {
        result.push(line(cash.code, cash.name, amount, 0, "Cobro de saldo de servicio turístico"));
        result.push(line("1202", "Cuentas por cobrar - turismo", 0, amount, "Aplicación de cobro a cuenta pendiente"));
      } else {
        result.push(line("2104", "Proveedores turísticos por pagar", amount, 0, "Pago de cuenta turística pendiente"));
        result.push(line(cash.code, cash.name, 0, amount, "Pago de servicio turístico"));
      }
      break;
  }
  return result;
}

function cashFlowFor(operationType: OperationType, data: DataMap): CashFlow | null {
  const status = textValue(data.paymentStatus, "PAID").toUpperCase();
  const direction = textValue(data.direction, "INCOME").toUpperCase();
  switch (operationType) {
    case "CONTRIBUTION_COLLECTION": return "INCOME";
    case "LOAN_OPEN": return direction === "GIVEN" ? "EXPENSE" : "INCOME";
    case "LOAN_PAYMENT": return direction === "GIVEN" ? "INCOME" : "EXPENSE";
    case "TAX_OBLIGATION": return status === "PAID" ? "EXPENSE" : null;
    case "TAX_PAYMENT": return "EXPENSE";
    case "DIVIDEND_DECLARATION": return status === "PAID" ? "EXPENSE" : null;
    case "DIVIDEND_PAYMENT": return "EXPENSE";
    case "FINE_OBLIGATION": return status === "PAID" ? "INCOME" : null;
    case "FINE_PAYMENT": return "INCOME";
    case "TOURISM_SERVICE": return status !== "PAID" ? null : direction === "INCOME" ? "INCOME" : "EXPENSE";
    case "TOURISM_SETTLEMENT": return direction === "INCOME" ? "INCOME" : "EXPENSE";
    default: return null;
  }
}

function operationLabel(type: string): string {
  const labels: Record<string, string> = {
    CONTRIBUTION_COLLECTION: "Cobro de aporte", LOAN_OPEN: "Apertura de préstamo", LOAN_PAYMENT: "Pago de préstamo",
    TAX_OBLIGATION: "Obligación de impuesto", TAX_PAYMENT: "Pago de impuesto", DIVIDEND_DECLARATION: "Distribución de dividendos",
    DIVIDEND_PAYMENT: "Pago de dividendos", FINE_OBLIGATION: "Multa impuesta a socio", FINE_PAYMENT: "Cobro de multa pendiente",
    TOURISM_SERVICE: "Servicio turístico", TOURISM_SETTLEMENT: "Liquidación de servicio turístico",
  };
  return labels[type] ?? type;
}

function initialForm(): Record<string, string> {
  return {
    operationDate: localDateInput(), amount: "", description: "", paymentMethod: "CASH", paymentStatus: "PAID", notes: "",
    memberName: "", contributionPeriod: "", memberReference: "",
    loanDirection: "GIVEN", loanCounterparty: "", loanPrincipal: "", annualInterestRate: "12", termMonths: "12", loanNotes: "", loanId: "", capitalPayment: "", interestPayment: "",
    taxType: "Impuesto municipal", taxPeriod: "", taxAuthority: "SAR / Municipalidad", dueDate: localDateInput(),
    beneficiaryName: "", dividendPeriod: "", fineMemberName: "", fineAuthority: "", fineNumber: "", tourismDirection: "INCOME", tourismClient: "", tourismType: "Servicio turístico", tourismReference: "",
    settlementAmount: "", settlementDate: localDateInput(), settlementPaymentMethod: "CASH", settlementNotes: "",
  };
}

export default function LibroDiarioPage() {
  const { user, loading: authLoading } = useAuth();
  const isGlobalAdmin = Boolean(user && user.active && user.role === "Administrador" && user.associationId.trim().toLowerCase() === "todas");
  const isFinanceReader = Boolean(user && user.active && READ_ROLES.has(user.role));
  const canManageFinance = Boolean(user && user.active && ["Administrador", "Vendedor"].includes(user.role));

  const [associations, setAssociations] = useState<AssociationOption[]>([]);
  const [associationId, setAssociationId] = useState("");
  const [tab, setTab] = useState<Tab>("journal");
  const [sales, setSales] = useState<SourceRecord[]>([]);
  const [purchases, setPurchases] = useState<SourceRecord[]>([]);
  const [expenses, setExpenses] = useState<SourceRecord[]>([]);
  const [cashRecords, setCashRecords] = useState<SourceRecord[]>([]);
  const [financialOperations, setFinancialOperations] = useState<SourceRecord[]>([]);
  const [storedEntries, setStoredEntries] = useState<SourceRecord[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [loadingAssociations, setLoadingAssociations] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<Record<string, string>>(initialForm);
  const [loanMode, setLoanMode] = useState<"open" | "payment">("open");
  const [settlementTarget, setSettlementTarget] = useState<SourceRecord | null>(null);

  const field = (key: string) => form[key] ?? "";
  const setField = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const resetForm = () => setForm(initialForm());

  const loadData = useCallback(async () => {
    if (!user?.active || !isFinanceReader || !associationId || associations.length === 0) {
      setSales([]); setPurchases([]); setExpenses([]); setCashRecords([]); setFinancialOperations([]); setStoredEntries([]); setLoadingData(false);
      return;
    }
    setLoadingData(true);
    setError("");
    try {
      const selected = associationId === ALL_ASSOCIATIONS && isGlobalAdmin
        ? associations
        : associations.filter((association) => association.id === associationId);
      const collectedSales: SourceRecord[] = [];
      const collectedPurchases: SourceRecord[] = [];
      const collectedExpenses: SourceRecord[] = [];
      const collectedCash: SourceRecord[] = [];
      const collectedFinancial: SourceRecord[] = [];
      const collectedEntries: SourceRecord[] = [];
      for (const association of selected) {
        const base = ["associations", association.id] as const;
        const [saleSnapshot, purchaseSnapshot, expenseSnapshot, cashSnapshot, financeSnapshot, entrySnapshot] = await Promise.all([
          getDocs(collection(db, ...base, "sales")),
          getDocs(collection(db, ...base, "purchases")),
          getDocs(collection(db, ...base, "expenses")),
          getDocs(collection(db, ...base, "cashMovements")),
          getDocs(collection(db, ...base, "financialOperations")),
          getDocs(collection(db, ...base, "journalEntries")),
        ]);
        collectedSales.push(...mapDocs(saleSnapshot, association));
        collectedPurchases.push(...mapDocs(purchaseSnapshot, association));
        collectedExpenses.push(...mapDocs(expenseSnapshot, association));
        collectedCash.push(...mapDocs(cashSnapshot, association));
        collectedFinancial.push(...mapDocs(financeSnapshot, association));
        collectedEntries.push(...mapDocs(entrySnapshot, association));
      }
      setSales(collectedSales);
      setPurchases(collectedPurchases);
      setExpenses(collectedExpenses);
      setCashRecords(collectedCash);
      setFinancialOperations(collectedFinancial);
      setStoredEntries(collectedEntries);
    } catch (loadError: unknown) {
      console.error("[Libro Diario] Fallo al LEER las colecciones", {
        role: user?.role ?? null,
        profileAssociationId: user?.associationId ?? null,
        selectedAssociationId: associationId,
        collections: ["sales", "purchases", "expenses", "cashMovements", "financialOperations", "journalEntries"],
      }, loadError);
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar Libro Diario. Comprueba los permisos de lectura de las nuevas colecciones financieras.");
    } finally {
      setLoadingData(false);
    }
  }, [user?.active, isFinanceReader, associationId, associations, isGlobalAdmin]);

  useEffect(() => {
    let mounted = true;
    async function loadAssociations() {
      if (authLoading) return;
      if (!user || !user.active || !isFinanceReader) {
        if (mounted) { setAssociations([]); setAssociationId(""); setLoadingAssociations(false); }
        return;
      }
      setLoadingAssociations(true);
      try {
        let options: AssociationOption[];
        if (isGlobalAdmin) {
          const snapshot = await getDocs(collection(db, "associations"));
          options = snapshot.docs.filter((item) => item.data().active !== false).map((item) => ({ id: item.id, name: textValue(item.data().name ?? item.data().associationName, item.id) })).sort((a,b)=>a.name.localeCompare(b.name,"es-HN"));
        } else if (user.associationId && user.associationId.trim().toLowerCase() !== "todas") {
          options = [{ id: user.associationId.trim(), name: user.associationName || user.associationId.trim() }];
        } else options = [];
        if (mounted) {
          setAssociations(options);
          setAssociationId((current) => isGlobalAdmin && current === ALL_ASSOCIATIONS ? current : options.some((item) => item.id === current) ? current : isGlobalAdmin ? ALL_ASSOCIATIONS : (options[0]?.id ?? ""));
        }
      } catch (loadError: unknown) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las asociaciones.");
      } finally { if (mounted) setLoadingAssociations(false); }
    }
    void loadAssociations();
    return () => { mounted = false; };
  }, [authLoading, user, isFinanceReader, isGlobalAdmin]);

  useEffect(() => { void loadData(); }, [loadData]);

  const selectedAssociation = associations.find((item) => item.id === associationId);
  const selectedName = associationId === ALL_ASSOCIATIONS ? "Todas las empresas" : selectedAssociation?.name ?? "";

  const operationalEntries = useMemo(() => {
    const entries: JournalEntry[] = [];
    for (const record of sales) {
      if (!isActive(record.data)) continue;
      const d = record.data;
      const method = textValue(d.paymentMethod, "CASH").toUpperCase();
      const pending = method === "CREDIT" || textValue(d.paymentStatus).toUpperCase() === "PENDING";
      const amount = roundMoney(numberValue(d.total ?? d.subtotal));
      const cash = methodAccount(method);
      const receivable = pending ? { code: "1203", name: "Cuentas por cobrar - ventas" } : cash;
      const date = recordDate(d);
      const docNo = textValue(d.code, record.id);
      const desc = `Venta${textValue(d.customer) ? ` a ${textValue(d.customer)}` : " sin cliente identificado"}`;
      const entry = makeLegacyEntry({
        id: `sale-${record.associationId}-${record.id}`, associationId: record.associationId, associationName: record.associationName,
        date, documentNumber: docNo, description: desc, sourceType: "SALE", sourceLabel: "Venta", paymentMethod: method,
        status: textValue(d.status, "ACTIVE"), sourceId: record.id,
        lines: [line(receivable.code, receivable.name, amount, 0, "Cuenta por cobrar / medio de cobro"), line("4100", "Ventas de productos", 0, amount, "Ingreso por venta de productos")],
      });
      if (entry) entries.push(entry);
      const items = Array.isArray(d.items) ? d.items as DataMap[] : [];
      const cost = roundMoney(items.reduce((sum, item) => sum + numberValue(item.quantity) * numberValue(item.purchaseCost ?? item.purchaseCostLb ?? item.averageCostAfter), 0));
      const cogs = makeLegacyEntry({
        id: `sale-cogs-${record.associationId}-${record.id}`, associationId: record.associationId, associationName: record.associationName,
        date, documentNumber: `${docNo}-COSTO`, description: `Costo de mercancía vendida (${docNo})`, sourceType: "SALE_COGS", sourceLabel: "Costo de venta", paymentMethod: method,
        status: textValue(d.status, "ACTIVE"), sourceId: record.id,
        lines: [line("5101", "Costo de ventas", cost, 0, "Costo de productos vendidos"), line("1301", "Inventario de mercaderías", 0, cost, "Salida de inventario al costo")],
      });
      if (cogs) entries.push(cogs);
    }
    for (const record of purchases) {
      if (!isActive(record.data)) continue;
      const d = record.data;
      const method = textValue(d.paymentMethod, "CASH").toUpperCase();
      const pending = method === "CREDIT" || textValue(d.paymentStatus).toUpperCase() === "PENDING";
      const amount = roundMoney(numberValue(d.total ?? d.subtotal));
      const cash = methodAccount(method);
      const payable = pending ? { code: "2100", name: "Cuentas por pagar a proveedores" } : cash;
      const docNo = textValue(d.code, record.id);
      const entry = makeLegacyEntry({
        id: `purchase-${record.associationId}-${record.id}`, associationId: record.associationId, associationName: record.associationName,
        date: recordDate(d), documentNumber: docNo, description: `Compra${textValue(d.supplier) ? ` a ${textValue(d.supplier)}` : " sin proveedor identificado"}`,
        sourceType: "PURCHASE", sourceLabel: "Compra", paymentMethod: method, status: textValue(d.status, "ACTIVE"), sourceId: record.id,
        lines: [line("1301", "Inventario de mercaderías", amount, 0, "Entrada de inventario por compra"), line(payable.code, payable.name, 0, amount, pending ? "Obligación pendiente a proveedor" : "Pago de compra")],
      });
      if (entry) entries.push(entry);
    }
    for (const record of expenses) {
      if (!isActive(record.data)) continue;
      const d = record.data;
      const amount = roundMoney(numberValue(d.amount));
      const pending = textValue(d.paymentStatus).toUpperCase() === "PENDING";
      const cash = methodAccount(textValue(d.paymentMethod, "CASH").toUpperCase());
      const desc = textValue(d.description, "Gasto sin descripción");
      const entry = makeLegacyEntry({
        id: `expense-${record.associationId}-${record.id}`, associationId: record.associationId, associationName: record.associationName,
        date: recordDate(d), documentNumber: textValue(d.invoiceNumber, record.id), description: desc,
        sourceType: "EXPENSE", sourceLabel: "Gasto", paymentMethod: textValue(d.paymentMethod, "PENDING"), status: textValue(d.status, "ACTIVE"), sourceId: record.id,
        lines: [line("5200", `Gastos - ${textValue(d.category, "Sin categoría")}`, amount, 0, desc), line(pending ? "2105" : cash.code, pending ? "Cuentas por pagar" : cash.name, 0, amount, pending ? "Gasto pendiente" : "Gasto pagado")],
      });
      if (entry) entries.push(entry);
    }
    // Las nuevas operaciones financieras ya tienen asiento persistido; aquí solo se derivan las legacy.
    const knownCashReferences = new Set(["SALE", "PURCHASE", "EXPENSE", "FINANCIAL_OPERATION"]);
    for (const record of cashRecords) {
      if (!isActive(record.data)) continue;
      const d = record.data;
      const refType = textValue(d.referenceType).toUpperCase();
      if (knownCashReferences.has(refType) || d.referenceId) continue;
      const method = textValue(d.paymentMethod, "OTHER").toUpperCase();
      const cash = methodAccount(method);
      const amount = roundMoney(numberValue(d.amount));
      const incoming = textValue(d.type).toUpperCase() === "INCOME";
      const desc = textValue(d.concept ?? d.description, "Movimiento manual de caja");
      const entry = makeLegacyEntry({
        id: `manual-cash-${record.associationId}-${record.id}`, associationId: record.associationId, associationName: record.associationName,
        date: recordDate(d), documentNumber: record.id, description: desc, sourceType: "MANUAL_CASH", sourceLabel: "Caja manual", paymentMethod: method,
        status: textValue(d.status, "ACTIVE"), sourceId: record.id, needsClassification: true,
        lines: incoming
          ? [line(cash.code, cash.name, amount, 0, "Ingreso manual registrado"), line("3999", "Ingresos por clasificar", 0, amount, desc)]
          : [line("5999", "Egresos por clasificar", amount, 0, desc), line(cash.code, cash.name, 0, amount, "Egreso manual registrado")],
      });
      if (entry) entries.push(entry);
    }
    return entries;
  }, [sales, purchases, expenses, cashRecords]);

  const persistentEntries = useMemo(() => storedEntries.filter((record) => isActive(record.data)).map((record) => {
    const d = record.data;
    const rawLines = Array.isArray(d.lines) ? d.lines as DataMap[] : [];
    const lines: JournalLine[] = rawLines.map((item) => ({
      accountCode: textValue(item.accountCode, "0000"), account: textValue(item.account, "Cuenta sin nombre"),
      debit: roundMoney(numberValue(item.debit)), credit: roundMoney(numberValue(item.credit)), description: textValue(item.description),
    }));
    return {
      id: record.id, associationId: record.associationId, associationName: record.associationName,
      date: recordDate(d), documentNumber: textValue(d.entryNumber ?? d.operationCode, record.id),
      description: textValue(d.description, "Asiento de operación financiera"),
      sourceType: textValue(d.sourceType, "FINANCIAL_OPERATION"), sourceLabel: operationLabel(textValue(d.sourceType, "FINANCIAL_OPERATION")),
      paymentMethod: textValue(d.paymentMethod, "—"), status: textValue(d.status, "POSTED"), sourceId: textValue(d.sourceId ?? d.operationId),
      lines, needsClassification: false,
    } as JournalEntry;
  }).filter((entry) => entry.lines.length > 0), [storedEntries]);

  const allEntries = useMemo(() => [...operationalEntries, ...persistentEntries].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0)), [operationalEntries, persistentEntries]);
  const filteredEntries = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-HN");
    const from = startDate ? new Date(`${startDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const to = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return allEntries.filter((entry) => {
      if (associationId !== ALL_ASSOCIATIONS && entry.associationId !== associationId) return false;
      if (entry.date) { const time = entry.date.getTime(); if (time < from || time > to) return false; }
      else if (startDate || endDate) return false;
      if (!term) return true;
      return [entry.associationName, entry.documentNumber, entry.description, entry.sourceLabel, entry.sourceId, entry.paymentMethod, ...entry.lines.flatMap((item) => [item.account, item.description, item.accountCode])].join(" ").toLocaleLowerCase("es-HN").includes(term);
    });
  }, [allEntries, associationId, startDate, endDate, search]);
  const visibleLines = useMemo(() => filteredEntries.flatMap((entry) => entry.lines.map((item, index) => ({ entry, line: item, index }))), [filteredEntries]);
  const totalDebit = roundMoney(filteredEntries.reduce((sum, entry) => sum + entry.lines.reduce((entrySum, item) => entrySum + item.debit, 0), 0));
  const totalCredit = roundMoney(filteredEntries.reduce((sum, entry) => sum + entry.lines.reduce((entrySum, item) => entrySum + item.credit, 0), 0));
  const difference = roundMoney(totalDebit - totalCredit);
  const unclassifiedCount = filteredEntries.filter((entry) => entry.needsClassification).length;

  const tabOperations = useMemo(() => financialOperations.filter((record) => associationId === ALL_ASSOCIATIONS || record.associationId === associationId).filter((record) => isActive(record.data)).sort((a,b)=>(recordDate(b.data)?.getTime() ?? 0)-(recordDate(a.data)?.getTime() ?? 0)), [financialOperations, associationId]);
  const openLoans = tabOperations.filter((record) => record.data.operationType === "LOAN_OPEN" && getLoanPrincipalRemaining(record, tabOperations) > 0.009);
  const chosenLoan = openLoans.find((loan) => `${loan.associationId}::${loan.id}` === field("loanId"));
  const currentLoanBalance = chosenLoan ? getLoanPrincipalRemaining(chosenLoan, tabOperations) : 0;
  const currentLoanRate = chosenLoan ? numberValue(chosenLoan.data.annualInterestRate) : 0;
  const currentLoanInterest = roundMoney(currentLoanBalance * currentLoanRate / 1200);
  const chosenLoanPaymentsCount = chosenLoan ? tabOperations.filter((item) => item.data.operationType === "LOAN_PAYMENT" && item.data.loanId === chosenLoan.id && item.associationId === chosenLoan.associationId).length : 0;
  const remainingLoanTerm = chosenLoan ? Math.max(1, numberValue(chosenLoan.data.termMonths) - chosenLoanPaymentsCount) : 1;
  const monthlyDue = chosenLoan ? monthlyInstallment(currentLoanBalance, currentLoanRate, remainingLoanTerm) : 0;

  async function writeFinancialOperation(input: FinancialOperationInput, cashFlow: CashFlow | null, lines: JournalLine[], options?: { relatedOperationId?: string; targetAssociation?: AssociationOption }) {
    const currentUser = auth.currentUser;
    if (!user || !user.active || !["Administrador", "Vendedor"].includes(user.role) || !currentUser?.uid || !currentUser.email) {
      throw new Error("Solo un administrador o vendedor activo puede registrar estas operaciones financieras.");
    }
    const association = options?.targetAssociation ?? selectedAssociation;
    if (!association || (!options?.targetAssociation && associationId === ALL_ASSOCIATIONS)) {
      throw new Error("Selecciona una asociación específica antes de registrar una operación.");
    }
    const userAssociationId = String(user.associationId ?? "").trim();
    const isGlobalAdminForWrite = user.role === "Administrador" && userAssociationId.toLowerCase() === "todas";
    if (!isGlobalAdminForWrite && association.id.trim() !== userAssociationId) {
      throw new Error("Solo puedes registrar operaciones para la empresa asignada a tu perfil.");
    }
    const debitTotal = roundMoney(lines.reduce((sum, item) => sum + item.debit, 0));
    const creditTotal = roundMoney(lines.reduce((sum, item) => sum + item.credit, 0));
    if (lines.length < 2 || debitTotal <= 0 || Math.abs(debitTotal - creditTotal) > 0.01) throw new Error("El asiento contable no está balanceado. No se guardó la operación.");
    const email = currentUser.email.trim().toLowerCase();
    const operationRef = doc(collection(db, "associations", association.id, "financialOperations"));
    const journalRef = doc(collection(db, "associations", association.id, "journalEntries"));
    const cashRef = cashFlow ? doc(collection(db, "associations", association.id, "cashMovements")) : null;
    const auditRef = doc(collection(db, "auditLogs"));
    const code = `FIN-${new Date().getFullYear()}-${operationRef.id.slice(0, 8).toUpperCase()}`;
    const operationDate = input.operationDate;
    const cashMovementId = cashRef?.id ?? null;
    const baseData = { ...input } as DataMap;
    delete baseData.operationType;
    const opData = {
      ...baseData,
      id: operationRef.id,
      operationCode: code,
      associationId: association.id,
      associationName: association.name,
      operationType: input.operationType,
      amount: roundMoney(input.amount),
      description: input.description.trim(),
      operationDate,
      status: "ACTIVE",
      createdBy: email,
      createdByUid: currentUser.uid,
      createdAt: serverTimestamp(),
      journalEntryId: journalRef.id,
      cashMovementId,
      ...(options?.relatedOperationId ? { relatedOperationId: options.relatedOperationId } : {}),
    };
    const entryNumber = `LD-${new Date().getFullYear()}-${journalRef.id.slice(0, 8).toUpperCase()}`;
    const journalData = {
      id: journalRef.id,
      associationId: association.id,
      associationName: association.name,
      entryNumber,
      operationCode: code,
      sourceType: input.operationType,
      sourceId: operationRef.id,
      operationId: operationRef.id,
      description: input.description.trim(),
      operationDate,
      paymentMethod: input.paymentMethod ?? null,
      lines,
      debitTotal,
      creditTotal,
      status: "POSTED",
      createdBy: email,
      createdByUid: currentUser.uid,
      createdAt: serverTimestamp(),
    };
    const batch = writeBatch(db);
    batch.set(operationRef, opData);
    batch.set(journalRef, journalData);
    if (cashRef && cashFlow) {
      batch.set(cashRef, {
        associationId: association.id,
        associationName: association.name,
        type: cashFlow,
        amount: roundMoney(input.amount),
        paymentMethod: input.paymentMethod ?? "OTHER",
        concept: `${code} · ${input.description.trim()}`,
        description: input.description.trim(),
        referenceType: "FINANCIAL_OPERATION",
        referenceId: operationRef.id,
        financialOperationType: input.operationType,
        createdBy: email,
        createdByUid: currentUser.uid,
        createdAt: serverTimestamp(),
        status: "ACTIVE",
      });
    }
    batch.set(auditRef, {
      action: "FINANCIAL_OPERATION_CREATED",
      actorUid: currentUser.uid,
      actorEmail: email,
      createdBy: email,
      associationId: association.id,
      entityType: "financialOperation",
      entityId: operationRef.id,
      details: { operationType: input.operationType, operationCode: code, amount: roundMoney(input.amount), journalEntryId: journalRef.id, cashMovementId, relatedOperationId: options?.relatedOperationId ?? null },
      createdAt: serverTimestamp(),
    });
    try {
      await batch.commit();
    } catch (commitError: unknown) {
      const errorCode =
        typeof commitError === "object" && commitError !== null && "code" in commitError
          ? String((commitError as { code?: unknown }).code ?? "unknown")
          : "unknown";
      console.error("[Libro Diario] Fallo al GUARDAR el lote atómico", {
        errorCode,
        // Permite confirmar que la app apunta al proyecto Firebase esperado.
        firebaseProjectId: db.app.options.projectId ?? "desconocido",
        operationType: input.operationType,
        role: user.role,
        profileAssociationId: user.associationId,
        targetAssociationId: association.id,
        targetAssociationName: association.name,
        paymentStatus: input.paymentStatus ?? "PAID",
        paymentMethod: input.paymentMethod ?? null,
        amount: opData.amount,
        needsCashMovement: Boolean(cashRef && cashFlow),
        operationId: operationRef.id,
        journalEntryId: journalRef.id,
        cashMovementId,
        auditLogId: auditRef.id,
        // No se imprimen notas, nombres de socios ni otros datos personales.
      }, commitError);
      throw new Error(
        `Firestore rechazó el registro de ${operationLabel(input.operationType)} (${errorCode}). No se guardó ningún documento del lote. Abre la consola del navegador (F12) para ver el diagnóstico [Libro Diario].`
      );
    }
    setNotice(`${operationLabel(input.operationType)} registrada con código ${code}. Se guardó el asiento ${entryNumber}${cashMovementId ? " y su movimiento de caja" : ""}.`);
    setError("");
    await loadData();
  }

  const submitGeneralOperation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setNotice("");
    if (!canManageFinance) { setError("Tu perfil no tiene permiso para registrar operaciones financieras."); return; }
    if (!selectedAssociation || associationId === ALL_ASSOCIATIONS) { setError("Selecciona una asociación específica."); return; }
    const amount = roundMoney(Number(field("amount")));
    if (!Number.isFinite(amount) || amount <= 0) { setError("El importe debe ser mayor que cero."); return; }
    if (!field("description").trim()) { setError("La descripción/concepto es obligatorio."); return; }
    try {
      setSaving(true);
      const operationDate = parseInputDate(field("operationDate"));
      const paymentStatus = field("paymentStatus") as PaymentStatus;
      const paymentMethod = field("paymentMethod") as PaymentMethod;
      if (!["PAID", "PENDING"].includes(paymentStatus)) throw new Error("Estado de pago no válido.");
      if (paymentStatus === "PAID" && !PAYMENT_METHODS.some((m) => m.value === paymentMethod)) throw new Error("Selecciona un método de pago válido.");
      let operationType: OperationType;
      let extra: DataMap = {};
      if (tab === "contributions") {
        if (!field("memberName").trim()) throw new Error("Indica el socio que realiza el aporte.");
        operationType = "CONTRIBUTION_COLLECTION";
        extra = { memberName: field("memberName").trim(), contributionPeriod: field("contributionPeriod").trim() || null, memberReference: field("memberReference").trim() || null, paymentStatus: "PAID", paymentMethod, direction: "INCOME" };
      } else if (tab === "taxes") {
        if (!field("taxType").trim() || !field("taxAuthority").trim()) throw new Error("Indica el tipo de impuesto y la autoridad recaudadora.");
        operationType = "TAX_OBLIGATION";
        extra = { taxType: field("taxType").trim(), taxPeriod: field("taxPeriod").trim() || null, taxAuthority: field("taxAuthority").trim(), dueDate: field("dueDate") ? parseInputDate(field("dueDate")) : null, paymentStatus, ...(paymentStatus === "PAID" ? { paymentMethod } : {}), direction: "EXPENSE" };
      } else if (tab === "dividends") {
        if (!field("beneficiaryName").trim()) throw new Error("Indica el socio o beneficiario del dividendo.");
        operationType = "DIVIDEND_DECLARATION";
        extra = { beneficiaryName: field("beneficiaryName").trim(), dividendPeriod: field("dividendPeriod").trim() || null, paymentStatus, ...(paymentStatus === "PAID" ? { paymentMethod } : {}), direction: "EXPENSE" };
      } else if (tab === "fines") {
        const fineMemberName = field("fineMemberName").trim();
        if (!fineMemberName) throw new Error("Indica el socio al que se impone la multa.");
        operationType = "FINE_OBLIGATION";
        // Se conserva fineAuthority como campo legado para no romper lecturas de registros previos.
        extra = { fineMemberName, memberName: fineMemberName, counterparty: fineMemberName, fineAuthority: fineMemberName, fineNumber: field("fineNumber").trim() || null, paymentStatus, ...(paymentStatus === "PAID" ? { paymentMethod } : {}), direction: "INCOME" };
      } else if (tab === "tourism") {
        if (!field("tourismClient").trim()) throw new Error("Indica el cliente/proveedor del servicio turístico.");
        const direction = field("tourismDirection") as "INCOME" | "EXPENSE";
        if (!["INCOME", "EXPENSE"].includes(direction)) throw new Error("Selecciona si el servicio es ingreso o gasto.");
        operationType = "TOURISM_SERVICE";
        extra = { direction, tourismClient: field("tourismClient").trim(), tourismType: field("tourismType").trim() || "Servicio turístico", tourismReference: field("tourismReference").trim() || null, paymentStatus, ...(paymentStatus === "PAID" ? { paymentMethod } : {}) };
      } else throw new Error("Selecciona un módulo de operación válido.");
      const input = { operationType, amount, description: field("description").trim(), operationDate, notes: field("notes").trim() || null, ...extra } as FinancialOperationInput;
      const lines = buildLines(operationType, input as DataMap);
      const flow = cashFlowFor(operationType, input as DataMap);
      await writeFinancialOperation(input, flow, lines);
      resetForm();
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo registrar la operación.");
    } finally { setSaving(false); }
  };

  const submitLoanOpen = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setNotice("");
    if (!canManageFinance) { setError("Tu perfil no tiene permiso para abrir préstamos."); return; }
    if (!selectedAssociation || associationId === ALL_ASSOCIATIONS) { setError("Selecciona una asociación específica."); return; }
    const principal = roundMoney(Number(field("loanPrincipal")));
    const rate = Number(field("annualInterestRate"));
    const term = Number(field("termMonths"));
    if (!field("loanCounterparty").trim()) { setError("Indica la contraparte del préstamo."); return; }
    if (!Number.isFinite(principal) || principal <= 0) { setError("El capital inicial debe ser mayor que cero."); return; }
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) { setError("La tasa anual debe estar entre 0% y 100%."); return; }
    if (!Number.isInteger(term) || term < 1 || term > 600) { setError("El plazo debe estar entre 1 y 600 meses."); return; }
    try {
      setSaving(true);
      const direction = field("loanDirection") as "GIVEN" | "RECEIVED";
      const method = field("paymentMethod") as PaymentMethod;
      const date = parseInputDate(field("operationDate"));
      const installment = monthlyInstallment(principal, rate, term);
      const maturityDate = new Date(date.getTime());
      maturityDate.setMonth(maturityDate.getMonth() + term);
      const description = `${direction === "GIVEN" ? "Préstamo otorgado a" : "Préstamo recibido de"} ${field("loanCounterparty").trim()}`;
      const input: FinancialOperationInput = {
        operationType: "LOAN_OPEN", amount: principal, principalAmount: principal, capitalAmount: 0, interestAmount: 0,
        description, operationDate: date, paymentStatus: "PAID", paymentMethod: method, direction,
        loanDirection: direction, counterparty: field("loanCounterparty").trim(), annualInterestRate: rate, termMonths: term,
        estimatedMonthlyInstallment: installment, installmentFrequency: "MONTHLY", maturityDate, loanNotes: field("loanNotes").trim() || null,
      };
      const lines = buildLines("LOAN_OPEN", input as DataMap);
      const flow = cashFlowFor("LOAN_OPEN", input as DataMap);
      await writeFinancialOperation(input, flow, lines);
      setField("loanPrincipal", ""); setField("loanNotes", ""); setField("loanCounterparty", "");
      setNotice(`Préstamo registrado. Cuota mensual estimada: ${money(installment)}. La cuota es una estimación con tasa anual y amortización de cuota fija; confirma las condiciones firmadas antes de usarla como contrato.`);
    } catch (submitError: unknown) { setError(submitError instanceof Error ? submitError.message : "No se pudo abrir el préstamo."); }
    finally { setSaving(false); }
  };

  const selectLoan = (key: string) => {
    setField("loanId", key);
    const loan = openLoans.find((item) => `${item.associationId}::${item.id}` === key);
    if (!loan) { setField("capitalPayment", ""); setField("interestPayment", ""); return; }
    const balance = getLoanPrincipalRemaining(loan, tabOperations);
    const interest = roundMoney(balance * numberValue(loan.data.annualInterestRate) / 1200);
    const paidCount = tabOperations.filter((item) => item.data.operationType === "LOAN_PAYMENT" && item.data.loanId === loan.id && item.associationId === loan.associationId).length;
    const remainingTerm = Math.max(1, numberValue(loan.data.termMonths) - paidCount);
    const installment = monthlyInstallment(balance, numberValue(loan.data.annualInterestRate), remainingTerm);
    const capital = roundMoney(Math.min(balance, Math.max(0, installment - interest)));
    setField("capitalPayment", String(capital));
    setField("interestPayment", String(interest));
    setField("operationDate", localDateInput());
  };

  const submitLoanPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setNotice("");
    if (!canManageFinance) { setError("Tu perfil no tiene permiso para registrar pagos de préstamos."); return; }
    const loan = openLoans.find((item) => `${item.associationId}::${item.id}` === field("loanId"));
    if (!loan) { setError("Selecciona un préstamo con saldo de capital pendiente."); return; }
    const capital = roundMoney(Number(field("capitalPayment")));
    const interest = roundMoney(Number(field("interestPayment")));
    const balance = getLoanPrincipalRemaining(loan, tabOperations);
    if (!Number.isFinite(capital) || capital < 0 || !Number.isFinite(interest) || interest < 0 || capital + interest <= 0) { setError("El abono a capital y los intereses deben sumar un importe mayor que cero."); return; }
    if (capital > balance + 0.01) { setError(`El abono de capital no puede superar el saldo pendiente de ${money(balance)}.`); return; }
    const amount = roundMoney(capital + interest);
    const direction = textValue(loan.data.loanDirection ?? loan.data.direction, "GIVEN") as "GIVEN" | "RECEIVED";
    const method = field("paymentMethod") as PaymentMethod;
    try {
      setSaving(true);
      const installmentNumber = tabOperations.filter((item) => item.data.operationType === "LOAN_PAYMENT" && item.data.loanId === loan.id && item.associationId === loan.associationId).length + 1;
      const description = `${direction === "GIVEN" ? "Cobro" : "Pago"} de cuota ${installmentNumber} de ${textValue(loan.data.counterparty, "préstamo")} · ${textValue(loan.data.operationCode, loan.id)}`;
      const input: FinancialOperationInput = {
        operationType: "LOAN_PAYMENT", amount, capitalAmount: capital, interestAmount: interest, installmentNumber,
        description, operationDate: parseInputDate(field("operationDate")), paymentStatus: "PAID", paymentMethod: method,
        direction, loanDirection: direction, loanId: loan.id, relatedOperationId: loan.id,
        counterparty: textValue(loan.data.counterparty), notes: field("notes").trim() || null,
      };
      const lines = buildLines("LOAN_PAYMENT", input as DataMap);
      const flow = cashFlowFor("LOAN_PAYMENT", input as DataMap);
      const loanAssociation = associations.find((item) => item.id === loan.associationId);
      if (!loanAssociation) throw new Error("No se encontró la asociación del préstamo seleccionado.");
      await writeFinancialOperation(input, flow, lines, { relatedOperationId: loan.id, targetAssociation: loanAssociation });
      setField("capitalPayment", ""); setField("interestPayment", ""); setField("loanId", ""); setField("notes", "");
    } catch (submitError: unknown) { setError(submitError instanceof Error ? submitError.message : "No se pudo registrar el pago del préstamo."); }
    finally { setSaving(false); }
  };

  const beginSettlement = (record: SourceRecord) => {
    const remaining = getRemainingForObligation(record, tabOperations);
    if (remaining <= 0) return;
    setSettlementTarget(record);
    setField("settlementAmount", String(remaining));
    setField("settlementDate", localDateInput());
    setField("settlementPaymentMethod", "CASH");
    setField("settlementNotes", "");
    setError(""); setNotice("");
  };

  const submitSettlement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setNotice("");
    if (!canManageFinance) {
      setError("Tu perfil no tiene permiso para registrar liquidaciones financieras.");
      return;
    }
    if (!settlementTarget) return;
    const amount = roundMoney(Number(field("settlementAmount")));
    const remaining = getRemainingForObligation(settlementTarget, tabOperations);
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.01) { setError(`El pago debe ser mayor que cero y no superar el saldo pendiente de ${money(remaining)}.`); return; }
    const method = field("settlementPaymentMethod") as PaymentMethod;
    const baseType = textValue(settlementTarget.data.operationType) as OperationType;
    let settlementType: OperationType;
    if (baseType === "TAX_OBLIGATION") settlementType = "TAX_PAYMENT";
    else if (baseType === "DIVIDEND_DECLARATION") settlementType = "DIVIDEND_PAYMENT";
    else if (baseType === "FINE_OBLIGATION") settlementType = "FINE_PAYMENT";
    else if (baseType === "TOURISM_SERVICE") settlementType = "TOURISM_SETTLEMENT";
    else { setError("Este registro no admite liquidación desde esta pantalla."); return; }
    const direction = textValue(settlementTarget.data.direction, "INCOME") as "INCOME" | "EXPENSE";
    const description = `Liquidación de ${operationLabel(baseType).toLowerCase()}: ${textValue(settlementTarget.data.description, textValue(settlementTarget.data.operationCode, settlementTarget.id))}`;
    const input: FinancialOperationInput = {
      operationType: settlementType, amount, description, operationDate: parseInputDate(field("settlementDate")), paymentStatus: "PAID", paymentMethod: method,
      direction, relatedOperationId: settlementTarget.id, relatedOperationType: baseType,
      counterparty: textValue(settlementTarget.data.fineMemberName ?? settlementTarget.data.counterparty ?? settlementTarget.data.memberName ?? settlementTarget.data.beneficiaryName ?? settlementTarget.data.tourismClient ?? settlementTarget.data.taxAuthority ?? settlementTarget.data.fineAuthority),
      notes: field("settlementNotes").trim() || null,
    };
    try {
      setSaving(true);
      const lines = buildLines(settlementType, input as DataMap);
      const association = associations.find((item) => item.id === settlementTarget.associationId);
      if (!association) throw new Error("No se encontró la asociación del registro pendiente.");
      await writeFinancialOperation(input, cashFlowFor(settlementType, input as DataMap), lines, { relatedOperationId: settlementTarget.id, targetAssociation: association });
      setSettlementTarget(null); setField("settlementAmount", ""); setField("settlementNotes", "");
    } catch (submitError: unknown) { setError(submitError instanceof Error ? submitError.message : "No se pudo registrar la liquidación."); }
    finally { setSaving(false); }
  };

  const exportJournal = () => {
    const rows = visibleLines.map(({ entry, line: journalLine }) => [formatDate(entry.date), entry.associationName, entry.documentNumber, entry.description, journalLine.accountCode, journalLine.account, journalLine.debit, journalLine.credit, entry.paymentMethod, entry.sourceLabel, entry.sourceId]);
    exportCsv("libro_diario.csv", ["Fecha", "Empresa", "Asiento", "Descripción", "Código cuenta", "Cuenta", "Debe HNL", "Haber HNL", "Método", "Origen", "Referencia"], rows);
  };
  const exportOperations = () => {
    const rows = filteredFinancialOperations.map((record) => [formatDate(recordDate(record.data)), record.associationName, record.data.operationCode, operationLabel(textValue(record.data.operationType)), record.data.description, record.data.fineMemberName ?? record.data.counterparty ?? record.data.memberName ?? record.data.beneficiaryName ?? record.data.tourismClient ?? record.data.taxAuthority ?? record.data.fineAuthority, record.data.amount, record.data.paymentStatus, record.data.paymentMethod, record.id]);
    exportCsv("operaciones_financieras.csv", ["Fecha", "Empresa", "Código", "Tipo", "Descripción", "Contraparte", "Importe HNL", "Estado de pago", "Método", "ID"], rows);
  };

  const filteredFinancialOperations = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-HN");
    const from = startDate ? new Date(`${startDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const to = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return tabOperations.filter((record) => {
      const date = recordDate(record.data);
      if (date && (date.getTime() < from || date.getTime() > to)) return false;
      if (!date && (startDate || endDate)) return false;
      if (!term) return true;
      return [record.associationName, ...Object.values(record.data)].filter((value) => typeof value === "string" || typeof value === "number").map(String).join(" ").toLocaleLowerCase("es-HN").includes(term);
    });
  }, [tabOperations, search, startDate, endDate]);

  const consolidation = useMemo(() => {
    type Group = { key: string; label: string; count: number; amount: number; debit: number; credit: number; cashIn: number; cashOut: number };
    const groups = new Map<string, Group>();
    const ensure = (key: string, label: string): Group => {
      const current = groups.get(key);
      if (current) return current;
      const created: Group = { key, label, count: 0, amount: 0, debit: 0, credit: 0, cashIn: 0, cashOut: 0 };
      groups.set(key, created);
      return created;
    };
    const passRecord = (record: SourceRecord) => {
      if (associationId !== ALL_ASSOCIATIONS && record.associationId !== associationId) return false;
      const term = search.trim().toLocaleLowerCase("es-HN");
      const date = recordDate(record.data);
      const from = startDate ? new Date(`${startDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
      const to = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
      if (date && (date.getTime() < from || date.getTime() > to)) return false;
      if (!date && (startDate || endDate)) return false;
      if (!term) return true;
      return [record.associationName, ...Object.values(record.data)].filter((value) => typeof value === "string" || typeof value === "number").map(String).join(" ").toLocaleLowerCase("es-HN").includes(term);
    };
    const addSourceGroup = (key: string, label: string, records: SourceRecord[], sourceType: string, cashReferenceType: string, amountOf: (record: SourceRecord) => number) => {
      const selected = records.filter((record) => passRecord(record) && isActive(record.data));
      if (!selected.length) return;
      const group = ensure(key, label);
      group.count += selected.length;
      group.amount += selected.reduce((sum, record) => sum + amountOf(record), 0);
      const ids = new Set(selected.map((record) => `${record.associationId}::${record.id}`));
      const entries = operationalEntries.filter((entry) => entry.sourceType === sourceType && ids.has(`${entry.associationId}::${entry.sourceId}`));
      group.debit += entries.reduce((sum, entry) => sum + entry.lines.reduce((inner, item) => inner + item.debit, 0), 0);
      group.credit += entries.reduce((sum, entry) => sum + entry.lines.reduce((inner, item) => inner + item.credit, 0), 0);
      const movements = cashRecords.filter((record) => ids.has(`${record.associationId}::${textValue(record.data.referenceId)}`) && textValue(record.data.referenceType).toUpperCase() === cashReferenceType && isActive(record.data));
      group.cashIn += movements.filter((record) => textValue(record.data.type).toUpperCase() === "INCOME").reduce((sum, record) => sum + numberValue(record.data.amount), 0);
      group.cashOut += movements.filter((record) => textValue(record.data.type).toUpperCase() === "EXPENSE").reduce((sum, record) => sum + numberValue(record.data.amount), 0);
    };
    addSourceGroup("SALES", "Ventas (módulo existente)", sales, "SALE", "SALE", (record) => numberValue(record.data.total ?? record.data.subtotal));
    addSourceGroup("PURCHASES", "Compras (módulo existente)", purchases, "PURCHASE", "PURCHASE", (record) => numberValue(record.data.total ?? record.data.subtotal));
    addSourceGroup("EXPENSES", "Gastos (módulo existente)", expenses, "EXPENSE", "EXPENSE", (record) => numberValue(record.data.amount));
    const manualEntries = operationalEntries.filter((entry) => entry.sourceType === "MANUAL_CASH" && (associationId === ALL_ASSOCIATIONS || entry.associationId === associationId) && (!startDate || (entry.date && entry.date.getTime() >= new Date(`${startDate}T00:00:00`).getTime())) && (!endDate || (entry.date && entry.date.getTime() <= new Date(`${endDate}T23:59:59.999`).getTime())) && (!search.trim() || `${entry.associationName} ${entry.description} ${entry.documentNumber}`.toLocaleLowerCase("es-HN").includes(search.trim().toLocaleLowerCase("es-HN"))));
    if (manualEntries.length) {
      const group = ensure("MANUAL_CASH", "Movimientos manuales por clasificar");
      group.count += manualEntries.length;
      group.amount += manualEntries.reduce((sum, entry) => sum + Math.max(...entry.lines.map((item) => Math.max(item.debit, item.credit))), 0);
      group.debit += manualEntries.reduce((sum, entry) => sum + entry.lines.reduce((inner, item) => inner + item.debit, 0), 0);
      group.credit += manualEntries.reduce((sum, entry) => sum + entry.lines.reduce((inner, item) => inner + item.credit, 0), 0);
      const ids = new Set(manualEntries.map((entry) => `${entry.associationId}::${entry.sourceId}`));
      for (const item of cashRecords.filter((record) => ids.has(`${record.associationId}::${record.id}`) && isActive(record.data))) {
        if (textValue(item.data.type).toUpperCase() === "INCOME") group.cashIn += numberValue(item.data.amount);
        else group.cashOut += numberValue(item.data.amount);
      }
    }
    for (const operation of filteredFinancialOperations) {
      const type = textValue(operation.data.operationType, "OTRO");
      const direction = textValue(operation.data.direction ?? operation.data.loanDirection);
      let key = type;
      let label = operationLabel(type);
      if (type === "LOAN_OPEN") { key = `LOAN_OPEN_${direction}`; label = direction === "GIVEN" ? "Préstamos otorgados" : "Préstamos recibidos"; }
      else if (type === "LOAN_PAYMENT") { key = `LOAN_PAYMENT_${direction}`; label = direction === "GIVEN" ? "Cobros de préstamos otorgados" : "Pagos de préstamos recibidos"; }
      else if (type === "TOURISM_SERVICE") { key = `TOURISM_SERVICE_${direction}`; label = direction === "INCOME" ? "Servicios turísticos - ingresos" : "Servicios turísticos - gastos"; }
      const group = ensure(key, label);
      group.count += 1;
      group.amount += numberValue(operation.data.amount);
      const journal = storedEntries.find((entry) => entry.id === operation.data.journalEntryId);
      if (journal) { group.debit += numberValue(journal.data.debitTotal); group.credit += numberValue(journal.data.creditTotal); }
      const movement = cashRecords.find((entry) => entry.id === operation.data.cashMovementId && entry.associationId === operation.associationId);
      if (movement && isActive(movement.data)) {
        const movementType = textValue(movement.data.type).toUpperCase();
        if (movementType === "INCOME") group.cashIn += numberValue(movement.data.amount);
        if (movementType === "EXPENSE") group.cashOut += numberValue(movement.data.amount);
      }
    }
    return [...groups.values()].map((group) => ({ ...group, amount: roundMoney(group.amount), debit: roundMoney(group.debit), credit: roundMoney(group.credit), cashIn: roundMoney(group.cashIn), cashOut: roundMoney(group.cashOut) })).sort((a, b) => a.label.localeCompare(b.label, "es-HN"));
  }, [filteredFinancialOperations, storedEntries, cashRecords, operationalEntries, sales, purchases, expenses, associationId, startDate, endDate, search]);

  const formInput = (label: string, key: string, props: { type?: string; required?: boolean; placeholder?: string; min?: string; step?: string; max?: string } = {}) => (
    <label style={styles.label}>{label}<input style={styles.input} type={props.type ?? "text"} value={field(key)} onChange={(event) => setField(key, event.target.value)} required={props.required} placeholder={props.placeholder} min={props.min} max={props.max} step={props.step} disabled={saving} /></label>
  );
  const formSelect = (label: string, key: string, options: { value: string; label: string }[], required = true) => (
    <label style={styles.label}>{label}<select style={styles.input} value={field(key)} onChange={(event) => setField(key, event.target.value)} required={required} disabled={saving}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
  );
  const renderOperationHistory = (types: string[], title: string) => {
    const records = filteredFinancialOperations.filter((record) => types.includes(textValue(record.data.operationType)));
    return <section style={styles.panel}>
      <div style={{ ...styles.row, justifyContent: "space-between", marginBottom: 12 }}><h2 style={{ margin: 0, fontSize: 19 }}>{title}</h2><span style={styles.muted}>{records.length} registro(s)</span></div>
      <div style={styles.tableWrap}><table style={styles.table}><thead><tr>{["Fecha", "Empresa", "Código", "Tipo", "Contraparte", "Importe", "Pago / saldo", "Estado", "Acción"].map((heading) => <th key={heading} style={styles.th}>{heading}</th>)}</tr></thead><tbody>
        {records.map((record) => {
          const remaining = getRemainingForObligation(record, tabOperations);
          const isPending = textValue(record.data.paymentStatus).toUpperCase() === "PENDING" && remaining > 0.009;
          const wasPending = textValue(record.data.paymentStatus).toUpperCase() === "PENDING";
          const statusLabel = isPending ? (remaining < numberValue(record.data.amount) ? `Parcial · ${money(remaining)} pendiente` : `Pendiente · ${money(remaining)}`) : (wasPending && remaining <= 0.009 ? "Liquidado" : textValue(record.data.paymentStatus, "PAID"));
          const counterparty = textValue(record.data.fineMemberName ?? record.data.counterparty ?? record.data.memberName ?? record.data.beneficiaryName ?? record.data.tourismClient ?? record.data.taxAuthority ?? record.data.fineAuthority, "—");
          return <tr key={`${record.associationId}-${record.id}`}><td style={styles.td}>{formatDate(recordDate(record.data))}</td><td style={styles.td}>{record.associationName}</td><td style={styles.td}><strong>{textValue(record.data.operationCode, record.id)}</strong><div style={styles.muted}>{record.id}</div></td><td style={styles.td}>{operationLabel(textValue(record.data.operationType))}</td><td style={styles.td}>{counterparty}</td><td style={{ ...styles.td, textAlign: "right", whiteSpace: "nowrap" }}>{money(numberValue(record.data.amount))}{record.data.operationType === "LOAN_PAYMENT" ? <div style={styles.muted}>Capital {money(numberValue(record.data.capitalAmount))} · interés {money(numberValue(record.data.interestAmount))}</div> : null}</td><td style={styles.td}>{statusLabel}</td><td style={styles.td}><span style={styles.badge}>{textValue(record.data.status, "ACTIVE")}</span></td><td style={styles.td}>{isPending && canManageFinance ? <button type="button" style={styles.secondary} disabled={saving} onClick={() => beginSettlement(record)}>Registrar pago</button> : "—"}</td></tr>;
        })}
        {records.length === 0 && <tr><td colSpan={9} style={{ ...styles.td, textAlign: "center", color: "#64748b" }}>No hay registros para esta categoría y período.</td></tr>}
      </tbody></table></div>
    </section>;
  };

  if (authLoading || loadingAssociations) return <MainLayout><main style={styles.page}><p style={styles.muted}>Cargando Libro Diario…</p></main></MainLayout>;
  if (!user || !user.active) return <MainLayout><main style={styles.page}><h1 style={styles.title}>Libro Diario</h1><div style={styles.error}>Necesitas una cuenta activa para continuar.</div></main></MainLayout>;
  if (!isFinanceReader) return <MainLayout><main style={styles.page}><h1 style={styles.title}>Libro Diario</h1><div style={styles.error}>Esta sección contiene información financiera sensible. Solo pueden consultarla administradores, usuarios con perfil Consulta y vendedores activos.</div></main></MainLayout>;

  return <MainLayout><main style={styles.page}>
    <header style={styles.header}>
      <div><h1 style={styles.title}>Libro Diario y operaciones financieras</h1><p style={styles.subtitle}>Módulo independiente para aportes, préstamos, impuestos, dividendos, multas y servicios turísticos. Ventas y compras permanecen en sus módulos y se referencian en el diario.</p></div>
      <div style={styles.row}><button type="button" style={styles.secondary} onClick={() => void loadData()} disabled={loadingData || saving}>Actualizar datos</button><button type="button" style={styles.primary} onClick={tab === "journal" ? exportJournal : exportOperations} disabled={loadingData || saving}>{tab === "journal" ? "Exportar libro diario" : "Exportar registros"}</button></div>
    </header>
    <div style={styles.notice}>Los procesos financieros nuevos generan una operación, un asiento Debe/Haber, una auditoría y, cuando hay movimiento real de fondos, un único movimiento de caja. Las ventas, compras y gastos existentes se muestran desde sus documentos originales: el movimiento de caja vinculado no se vuelve a contabilizar.</div>
    {error && <div role="alert" style={styles.error}>{error}</div>}
    {notice && <div role="status" style={styles.success}>{notice}</div>}
    {loadingData && <div style={styles.notice}>Actualizando información financiera…</div>}

    <section style={styles.panel}>
      <div style={styles.filters}>
        <label style={styles.label}>Empresa<select style={styles.input} value={associationId} onChange={(event) => setAssociationId(event.target.value)} disabled={!isGlobalAdmin || saving}>{isGlobalAdmin && <option value={ALL_ASSOCIATIONS}>Todas las empresas</option>}{associations.map((association) => <option key={association.id} value={association.id}>{association.name}</option>)}</select></label>
        <label style={styles.label}>Desde<input style={styles.input} type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label style={styles.label}>Hasta<input style={styles.input} type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></label>
        <label style={styles.label}>Buscar<input style={styles.input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Socio, entidad, cuenta, documento…" /></label>
      </div>
      <div style={{ ...styles.row, justifyContent: "space-between", marginTop: 12 }}><span style={styles.muted}>Empresa consultada: <strong>{selectedName || "—"}</strong></span><button type="button" style={styles.secondary} onClick={() => { setStartDate(""); setEndDate(""); setSearch(""); }}>Limpiar filtros</button></div>
    </section>

    <nav style={styles.row} aria-label="Secciones de Libro Diario">
      {TABS.map((item) => <button key={item.value} type="button" style={{ ...styles.tab, ...(tab === item.value ? styles.activeTab : {}) }} onClick={() => { setTab(item.value); setError(""); setNotice(""); setSettlementTarget(null); }}>{item.label}</button>)}
    </nav>

    {tab === "journal" && <>
      <section style={styles.grid}>
        <article style={styles.metric}><p style={styles.metricLabel}>Total Debe</p><p style={styles.metricValue}>{money(totalDebit)}</p><span style={styles.muted}>{filteredEntries.length} asientos</span></article>
        <article style={styles.metric}><p style={styles.metricLabel}>Total Haber</p><p style={styles.metricValue}>{money(totalCredit)}</p><span style={styles.muted}>Partida doble</span></article>
        <article style={styles.metric}><p style={styles.metricLabel}>Diferencia</p><p style={{ ...styles.metricValue, color: Math.abs(difference) < 0.01 ? "#047857" : "#b91c1c" }}>{money(difference)}</p><span style={styles.muted}>{Math.abs(difference) < 0.01 ? "Debe y Haber cuadran" : "Revisar balance"}</span></article>
        <article style={styles.metric}><p style={styles.metricLabel}>Por clasificar</p><p style={styles.metricValue}>{unclassifiedCount}</p><span style={styles.muted}>Movimientos manuales heredados</span></article>
      </section>
      <section style={styles.panel}><h2 style={{ marginTop: 0, fontSize: 19 }}>Asientos del período</h2><p style={styles.muted}>Ventas y compras se muestran como referencia contable, pero sus fondos siguen separados y sus movimientos de caja no se duplican. Los asientos nuevos de aportes, préstamos y demás procesos sí quedan guardados en Libro Diario.</p><div style={styles.tableWrap}><table style={styles.table}><thead><tr>{["Fecha", "Empresa", "Asiento/documento", "Descripción", "Cuenta", "Debe (L)", "Haber (L)", "Origen", "Estado"].map((heading)=><th key={heading} style={styles.th}>{heading}</th>)}</tr></thead><tbody>
        {visibleLines.map(({ entry, line: item, index })=><tr key={`${entry.id}-${index}`}><td style={styles.td}>{formatDate(entry.date)}</td><td style={styles.td}>{entry.associationName}</td><td style={styles.td}><strong>{entry.documentNumber}</strong><div style={styles.muted}>{entry.sourceId}</div></td><td style={styles.td}>{entry.description}<div style={styles.muted}>{item.description}</div></td><td style={styles.td}><strong>{item.accountCode}</strong> · {item.account}</td><td style={{...styles.td,textAlign:"right"}}>{item.debit>0?money(item.debit):"—"}</td><td style={{...styles.td,textAlign:"right"}}>{item.credit>0?money(item.credit):"—"}</td><td style={styles.td}>{entry.sourceLabel}</td><td style={styles.td}>{entry.needsClassification?"Por clasificar":entry.status}</td></tr>)}
        {visibleLines.length===0&&<tr><td colSpan={9} style={{...styles.td,textAlign:"center"}}>No hay asientos para los filtros seleccionados.</td></tr>}
      </tbody>{visibleLines.length>0&&<tfoot><tr><td style={styles.th} colSpan={5}>Totales mostrados</td><td style={styles.th}>{money(totalDebit)}</td><td style={styles.th}>{money(totalCredit)}</td><td style={styles.th} colSpan={2}>{Math.abs(difference)<0.01?"Cuadrado":"Diferencia por revisar"}</td></tr></tfoot>}</table></div><p style={styles.muted}>El catálogo de cuentas es inicial. Antes de tratarlo como libro legal definitivo, debe confirmarse el plan contable, saldos iniciales, reglas fiscales y políticas de reconocimiento.</p></section>
    </>}

    {tab === "contributions" && <>
      {canManageFinance && <section style={styles.panel}><h2 style={{marginTop:0,fontSize:19}}>Cobrar aporte de socio</h2><form onSubmit={(event)=>void submitGeneralOperation(event)} style={{display:"grid",gap:14}}><div style={styles.grid}>{formInput("Socio / aportante","memberName",{required:true,placeholder:"Nombre del socio"})}{formInput("Período del aporte","contributionPeriod",{placeholder:"Ej. octubre 2026"})}{formInput("Referencia del socio (opcional)","memberReference",{placeholder:"Código o identificador interno"})}{formInput("Importe recibido (L)","amount",{type:"number",min:"0.01",step:"0.01",required:true})}{formInput("Fecha de cobro","operationDate",{type:"date",required:true})}{formSelect("Medio recibido","paymentMethod",PAYMENT_METHODS.map((m)=>({value:m.value,label:m.label})))}</div>{formInput("Concepto del aporte","description",{required:true,placeholder:"Cuota ordinaria, extraordinaria…"})}{formInput("Notas","notes",{placeholder:"Referencia de recibo u observaciones"})}<div style={{display:"flex",justifyContent:"flex-end"}}><button type="submit" style={styles.primary} disabled={saving}>{saving?"Guardando…":"Registrar cobro de aporte"}</button></div></form></section>}
      {renderOperationHistory(["CONTRIBUTION_COLLECTION"],"Historial de aportes cobrados")}
    </>}

    {tab === "loans" && <>
      <section style={styles.panel}><div style={styles.row}>{([ ["open","Abrir préstamo"],["payment","Registrar pago de préstamo"] ] as ["open"|"payment",string][]).map(([value,label])=><button key={value} type="button" style={{...styles.tab,...(loanMode===value?styles.activeTab:{})}} onClick={()=>{setLoanMode(value);setError("");}}>{label}</button>)}</div>
      {!canManageFinance&&<div style={{...styles.notice,marginTop:12}}>Tu perfil es de solo consulta; las aperturas y los pagos los registran usuarios autorizados.</div>}
      {loanMode==="open"&&canManageFinance&&<form onSubmit={(event)=>void submitLoanOpen(event)} style={{display:"grid",gap:14,marginTop:16}}><div style={styles.notice}>La tasa se expresa anual. La cuota mensual es una estimación de amortización de cuota fija; debe contrastarse con el contrato real. Cada pago se registra por separado entre capital e intereses.</div><div style={styles.grid}>{formSelect("Tipo","loanDirection",[{value:"GIVEN",label:"Préstamo otorgado por la asociación"},{value:"RECEIVED",label:"Préstamo recibido por la asociación"}])}{formInput("Socio, entidad o contraparte","loanCounterparty",{required:true,placeholder:"Nombre / entidad financiera"})}{formInput("Capital inicial (L)","loanPrincipal",{type:"number",required:true,min:"0.01",step:"0.01"})}{formInput("Tasa de interés anual (%)","annualInterestRate",{type:"number",required:true,min:"0",max:"100",step:"0.01"})}{formInput("Plazo (meses)","termMonths",{type:"number",required:true,min:"1",max:"600",step:"1"})}{formInput("Fecha de apertura / desembolso","operationDate",{type:"date",required:true})}{formSelect("Medio del desembolso","paymentMethod",PAYMENT_METHODS.map((m)=>({value:m.value,label:m.label})) )}</div>{formInput("Contrato / observaciones","loanNotes",{placeholder:"Número de contrato, garantías o condiciones"})}<div style={styles.notice}>Cuota fija mensual estimada: <strong>{money(monthlyInstallment(Math.max(0,Number(field("loanPrincipal"))),Math.max(0,Number(field("annualInterestRate"))),Math.max(1,Number(field("termMonths")))) )}</strong></div><div style={{display:"flex",justifyContent:"flex-end"}}><button type="submit" style={styles.primary} disabled={saving}>{saving?"Guardando…":"Registrar apertura de préstamo"}</button></div></form>}
      {loanMode==="payment"&&canManageFinance&&<form onSubmit={(event)=>void submitLoanPayment(event)} style={{display:"grid",gap:14,marginTop:16}}><div style={styles.grid}><label style={styles.label}>Préstamo con saldo pendiente<select style={styles.input} value={field("loanId")} onChange={(event)=>selectLoan(event.target.value)} required disabled={saving}><option value="">Selecciona un préstamo…</option>{openLoans.map((loan)=><option key={`${loan.associationId}::${loan.id}`} value={`${loan.associationId}::${loan.id}`}>{loan.associationName} · {textValue(loan.data.operationCode,loan.id)} · {textValue(loan.data.counterparty)} · saldo {money(getLoanPrincipalRemaining(loan,tabOperations))}</option>)}</select></label><label style={styles.label}>Abono a capital (L)<input style={styles.input} type="number" min="0" step="0.01" value={field("capitalPayment")} onChange={(event)=>setField("capitalPayment",event.target.value)} required disabled={saving}/></label><label style={styles.label}>Intereses de la cuota (L)<input style={styles.input} type="number" min="0" step="0.01" value={field("interestPayment")} onChange={(event)=>setField("interestPayment",event.target.value)} required disabled={saving}/></label>{formInput("Fecha de pago","operationDate",{type:"date",required:true})}{formSelect("Medio de pago/cobro","paymentMethod",PAYMENT_METHODS.map((m)=>({value:m.value,label:m.label})))}</div>{chosenLoan&&<div style={styles.notice}>Saldo de capital antes del pago: <strong>{money(currentLoanBalance)}</strong>. Interés mensual orientativo: <strong>{money(currentLoanInterest)}</strong>. Cuota fija estimada inicial: <strong>{money(monthlyDue)}</strong>. Total a registrar con los valores actuales: <strong>{money(numberValue(field("capitalPayment"))+numberValue(field("interestPayment")))}</strong>.</div>}{formInput("Notas de la cuota","notes",{placeholder:"Número de cuota, recibo u observaciones"})}<div style={{display:"flex",justifyContent:"flex-end"}}><button type="submit" style={styles.primary} disabled={saving||!chosenLoan}>{saving?"Guardando…":"Registrar pago y desglose"}</button></div></form>}
      </section>
      <section style={styles.panel}><h2 style={{marginTop:0,fontSize:19}}>Cartera de préstamos y movimientos</h2><div style={styles.tableWrap}><table style={styles.table}><thead><tr>{["Fecha","Empresa","Tipo","Contraparte","Capital inicial / pago","Tasa","Plazo","Vencimiento","Cuota fija estimada","Capital pendiente","Detalle"].map((h)=><th key={h} style={styles.th}>{h}</th>)}</tr></thead><tbody>{filteredFinancialOperations.filter((record)=>["LOAN_OPEN","LOAN_PAYMENT"].includes(textValue(record.data.operationType))).map((record)=>{const isOpen=record.data.operationType==="LOAN_OPEN";const original=numberValue(record.data.principalAmount??record.data.amount);const balance=isOpen?getLoanPrincipalRemaining(record,tabOperations):null;return <tr key={`${record.associationId}-${record.id}`}><td style={styles.td}>{formatDate(recordDate(record.data))}</td><td style={styles.td}>{record.associationName}</td><td style={styles.td}>{isOpen?(textValue(record.data.loanDirection)==="GIVEN"?"Préstamo otorgado":"Préstamo recibido"):"Pago de cuota"}</td><td style={styles.td}>{textValue(record.data.counterparty,"—")}</td><td style={styles.td}>{money(isOpen?original:numberValue(record.data.amount))}{!isOpen&&<div style={styles.muted}>Capital {money(numberValue(record.data.capitalAmount))} · interés {money(numberValue(record.data.interestAmount))}</div>}</td><td style={styles.td}>{isOpen?`${numberValue(record.data.annualInterestRate).toFixed(2)}% anual`:"—"}</td><td style={styles.td}>{isOpen?`${textValue(record.data.termMonths)} meses`:"—"}</td><td style={styles.td}>{isOpen?formatDate(dateValue(record.data.maturityDate)):"—"}</td><td style={styles.td}>{isOpen?money(numberValue(record.data.estimatedMonthlyInstallment)):"—"}</td><td style={styles.td}>{isOpen?money(balance??original):"—"}</td><td style={styles.td}>{textValue(record.data.loanNotes??record.data.notes,"—")}</td></tr>})}{filteredFinancialOperations.filter((record)=>["LOAN_OPEN","LOAN_PAYMENT"].includes(textValue(record.data.operationType))).length===0&&<tr><td colSpan={11} style={{...styles.td,textAlign:"center"}}>No hay operaciones de préstamos en el período.</td></tr>}</tbody></table></div></section>
    </>}

    {tab === "taxes" && <>
      {canManageFinance&&<section style={styles.panel}><h2 style={{marginTop:0,fontSize:19}}>Registrar obligación o pago de impuesto</h2><form onSubmit={(event)=>void submitGeneralOperation(event)} style={{display:"grid",gap:14}}><div style={styles.grid}>{formSelect("Tipo de impuesto","taxType",[{value:"ISR",label:"ISR"},{value:"ISV",label:"ISV"},{value:"Municipal",label:"Impuesto municipal"},{value:"Permiso",label:"Permisos / tasas"},{value:"Otro",label:"Otro impuesto"}])}{formInput("Autoridad recaudadora","taxAuthority",{required:true,placeholder:"SAR, municipalidad u otra entidad"})}{formInput("Período fiscal","taxPeriod",{placeholder:"Ej. 2026-10"})}{formInput("Vencimiento","dueDate",{type:"date"})}{formInput("Importe (L)","amount",{type:"number",required:true,min:"0.01",step:"0.01"})}{formInput("Fecha de registro/pago","operationDate",{type:"date",required:true})}{formSelect("Estado","paymentStatus",[{value:"PENDING",label:"Pendiente"},{value:"PAID",label:"Pagado ahora"}])}{field("paymentStatus")==="PAID"&&formSelect("Método de pago","paymentMethod",PAYMENT_METHODS.map((m)=>({value:m.value,label:m.label})))}</div>{formInput("Descripción","description",{required:true,placeholder:"Concepto y referencia del impuesto"})}{formInput("Notas","notes",{placeholder:"Número de declaración o recibo"})}<div style={{display:"flex",justifyContent:"flex-end"}}><button type="submit" style={styles.primary} disabled={saving}>{saving?"Guardando…":"Registrar obligación fiscal"}</button></div></form></section>}
      {renderOperationHistory(["TAX_OBLIGATION","TAX_PAYMENT"],"Historial de impuestos")}
    </>}

    {tab === "dividends" && <>
      {canManageFinance&&<section style={styles.panel}><h2 style={{marginTop:0,fontSize:19}}>Declarar o distribuir dividendos</h2><form onSubmit={(event)=>void submitGeneralOperation(event)} style={{display:"grid",gap:14}}><div style={styles.grid}>{formInput("Socio / beneficiario","beneficiaryName",{required:true,placeholder:"Nombre del beneficiario"})}{formInput("Período de resultados","dividendPeriod",{placeholder:"Ejercicio / período aprobado"})}{formInput("Importe del dividendo (L)","amount",{type:"number",required:true,min:"0.01",step:"0.01"})}{formInput("Fecha de aprobación/distribución","operationDate",{type:"date",required:true})}{formSelect("Estado","paymentStatus",[{value:"PENDING",label:"Declarado, pendiente de pago"},{value:"PAID",label:"Distribución pagada ahora"}])}{field("paymentStatus")==="PAID"&&formSelect("Método de pago","paymentMethod",PAYMENT_METHODS.map((m)=>({value:m.value,label:m.label})))}</div>{formInput("Concepto","description",{required:true,placeholder:"Acuerdo o referencia de distribución"})}{formInput("Notas","notes",{placeholder:"Referencia del acta aprobatoria"})}<div style={{display:"flex",justifyContent:"flex-end"}}><button type="submit" style={styles.primary} disabled={saving}>{saving?"Guardando…":"Registrar distribución"}</button></div></form></section>}
      {renderOperationHistory(["DIVIDEND_DECLARATION","DIVIDEND_PAYMENT"],"Historial de dividendos")}
    </>}

    {tab === "fines" && <>
      {canManageFinance&&<section style={styles.panel}><h2 style={{marginTop:0,fontSize:19}}>Registrar multa a socio</h2><form onSubmit={(event)=>void submitGeneralOperation(event)} style={{display:"grid",gap:14}}><div style={styles.grid}>{formInput("Socio multado","fineMemberName",{required:true,placeholder:"Nombre del socio"})}{formInput("Número / referencia de multa","fineNumber",{placeholder:"Referencia / expediente"})}{formInput("Importe (L)","amount",{type:"number",required:true,min:"0.01",step:"0.01"})}{formInput("Fecha","operationDate",{type:"date",required:true})}{formSelect("Estado de cobro","paymentStatus",[{value:"PENDING",label:"Pendiente de cobro"},{value:"PAID",label:"Cobrada ahora"}])}{field("paymentStatus")==="PAID"&&formSelect("Método de pago","paymentMethod",PAYMENT_METHODS.map((m)=>({value:m.value,label:m.label})))}</div>{formInput("Descripción / motivo","description",{required:true,placeholder:"Motivo o concepto de multa"})}{formInput("Notas","notes",{placeholder:"Observaciones o referencia de recibo"})}<div style={{display:"flex",justifyContent:"flex-end"}}><button type="submit" style={styles.primary} disabled={saving}>{saving?"Guardando…":"Registrar multa al socio"}</button></div></form></section>}
      {renderOperationHistory(["FINE_OBLIGATION","FINE_PAYMENT"],"Historial de multas")}
    </>}

    {tab === "tourism" && <>
      {canManageFinance&&<section style={styles.panel}><h2 style={{marginTop:0,fontSize:19}}>Registrar operación de servicio turístico</h2><form onSubmit={(event)=>void submitGeneralOperation(event)} style={{display:"grid",gap:14}}><div style={styles.grid}>{formSelect("Tipo de movimiento","tourismDirection",[{value:"INCOME",label:"Ingreso por servicio turístico"},{value:"EXPENSE",label:"Gasto / proveedor turístico"}])}{formInput("Cliente / proveedor","tourismClient",{required:true,placeholder:"Nombre del cliente o proveedor"})}{formSelect("Servicio","tourismType",[{value:"Paquete turístico",label:"Paquete turístico"},{value:"Guía",label:"Guianza"},{value:"Transporte",label:"Transporte"},{value:"Hospedaje",label:"Hospedaje"},{value:"Alimentación",label:"Alimentación"},{value:"Lancha / pipante",label:"Lancha / pipante"},{value:"Otro",label:"Otro servicio"}],true)}{formInput("Referencia / reserva","tourismReference",{placeholder:"Código de reserva, grupo o contrato"})}{formInput("Importe (L)","amount",{type:"number",required:true,min:"0.01",step:"0.01"})}{formInput("Fecha","operationDate",{type:"date",required:true})}{formSelect("Estado","paymentStatus",[{value:"PENDING",label:"Pendiente de cobro/pago"},{value:"PAID",label:"Pagado/cobrado ahora"}])}{field("paymentStatus")==="PAID"&&formSelect("Método","paymentMethod",PAYMENT_METHODS.map((m)=>({value:m.value,label:m.label})))}</div>{formInput("Descripción","description",{required:true,placeholder:"Detalle del servicio o gasto turístico"})}{formInput("Notas","notes",{placeholder:"Pasajeros, fechas, guía, condiciones, recibo…"})}<div style={{display:"flex",justifyContent:"flex-end"}}><button type="submit" style={styles.primary} disabled={saving}>{saving?"Guardando…":"Registrar servicio turístico"}</button></div></form></section>}
      {renderOperationHistory(["TOURISM_SERVICE","TOURISM_SETTLEMENT"],"Historial de servicios turísticos")}
    </>}

    {settlementTarget && <section style={{...styles.panel,borderColor:"#f59e0b",background:"#fffbeb"}}><div style={{...styles.row,justifyContent:"space-between"}}><h2 style={{marginTop:0,fontSize:19}}>Registrar pago parcial o total</h2><button type="button" style={styles.secondary} onClick={()=>setSettlementTarget(null)}>Cerrar</button></div><p style={styles.muted}>{operationLabel(textValue(settlementTarget.data.operationType))} · {textValue(settlementTarget.data.operationCode,settlementTarget.id)} · Pendiente: <strong>{money(getRemainingForObligation(settlementTarget,tabOperations))}</strong></p><form onSubmit={(event)=>void submitSettlement(event)} style={{display:"grid",gap:14}}><div style={styles.grid}>{formInput("Importe del pago (L)","settlementAmount",{type:"number",required:true,min:"0.01",step:"0.01"})}{formInput("Fecha de pago","settlementDate",{type:"date",required:true})}{formSelect("Método de pago","settlementPaymentMethod",PAYMENT_METHODS.map((m)=>({value:m.value,label:m.label})))}</div>{formInput("Notas / comprobante","settlementNotes",{placeholder:"Número de recibo, transferencia o documento"})}<div style={{display:"flex",justifyContent:"flex-end"}}><button type="submit" style={styles.primary} disabled={saving}>{saving?"Guardando…":"Confirmar liquidación"}</button></div></form></section>}

    {tab === "consolidation" && <section style={styles.panel}><h2 style={{marginTop:0,fontSize:19}}>Consolidación por origen de fondos</h2><div style={styles.notice}>Cada tipo de operación permanece separado. Esta tabla agrupa por clase de evento y no netea fondos de compras, ventas, aportes, préstamos, impuestos, dividendos, multas o turismo. Los importes de obligaciones y sus liquidaciones son eventos separados y no deben sumarse como si fueran ingresos netos.</div><div style={styles.tableWrap}><table style={styles.table}><thead><tr>{["Origen / fondo","N.º de eventos","Importe de eventos (L)","Debe (L)","Haber (L)","Entradas de caja (L)","Salidas de caja (L)"].map((h)=><th key={h} style={styles.th}>{h}</th>)}</tr></thead><tbody>{consolidation.map((group)=><tr key={group.key}><td style={styles.td}><strong>{group.label}</strong><div style={styles.muted}>{group.key}</div></td><td style={styles.td}>{group.count}</td><td style={styles.td}>{money(group.amount)}</td><td style={styles.td}>{money(group.debit)}</td><td style={styles.td}>{money(group.credit)}</td><td style={styles.td}>{money(group.cashIn)}</td><td style={styles.td}>{money(group.cashOut)}</td></tr>)}{consolidation.length===0&&<tr><td colSpan={7} style={{...styles.td,textAlign:"center"}}>No hay operaciones para consolidar con los filtros actuales.</td></tr>}</tbody></table></div><p style={styles.muted}>La consolidación se genera como vista de consulta; conserva el origen, la asociación, la referencia y las cuentas de cada evento.</p></section>}

  </main></MainLayout>;
}