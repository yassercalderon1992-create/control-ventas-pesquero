import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { collection, doc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth } from "../firebase/auth";

import { db } from "../firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import type { PurchaseRequest, SaleRequest } from "../types/dto";
import { purchaseService } from "../services/purchases/purchaseService";
import { salesService } from "../services/sales/salesService";

type DataMap = Record<string, unknown>;
type EntityType = "purchase" | "sale";
type TabKey =
  | "overview"
  | "sales"
  | "purchases"
  | "inventory"
  | "finance"
  | "users"
  | "associations";

type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "CREDIT";
type AdminRole = "Administrador" | "Vendedor" | "Consulta";

interface UserEditor {
  mode: "create" | "edit";
  originalId: string | null;
  email: string;
  role: AdminRole;
  associationId: string;
  active: boolean;
  displayName: string;
  phone: string;
}

interface AdminUser {
  id: string;
  email: string;
  role: string;
  associationId: string;
  associationName: string;
  active: boolean;
  displayName: string;
  phone: string;
}

interface AdminAssociation {
  id: string;
  name: string;
  active: boolean;
  department: string;
  municipality: string;
}

interface AdminTransaction {
  id: string;
  entityType: EntityType;
  associationId: string;
  associationName: string;
  data: DataMap;
}

interface AdminProduct {
  id: string;
  associationId: string;
  associationName: string;
  data: DataMap;
}

interface AdminCashMovement {
  id: string;
  associationId: string;
  associationName: string;
  data: DataMap;
}

interface AdminExpense {
  id: string;
  associationId: string;
  associationName: string;
  data: DataMap;
}

interface EditorItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}

interface CorrectionEditor {
  transaction: AdminTransaction;
  items: EditorItem[];
  paymentMethod: PaymentMethod;
  supplier: string;
  invoiceNumber: string;
  customer: string;
  notes: string;
  reason: string;
}

const ALL_ASSOCIATIONS = "__ALL_ASSOCIATIONS__";
const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Efectivo" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "CARD", label: "Tarjeta" },
  { value: "CREDIT", label: "Crédito" },
];

const styles: Record<string, CSSProperties> = {
  page: {
    padding: 26,
    background: "#f1f5f9",
    minHeight: "100%",
    color: "#172033",
    boxSizing: "border-box",
  },
  heading: { margin: "0 0 7px", fontSize: 28, fontWeight: 750 },
  subtitle: { margin: 0, color: "#64748b", lineHeight: 1.5 },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 20,
  },
  button: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#1e293b",
    borderRadius: 7,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 650,
  },
  primaryButton: {
    border: "1px solid #1d4ed8",
    background: "#2563eb",
    color: "#fff",
    borderRadius: 7,
    padding: "10px 15px",
    cursor: "pointer",
    fontWeight: 700,
  },
  dangerButton: {
    border: "1px solid #fecaca",
    background: "#fff",
    color: "#991b1b",
    borderRadius: 7,
    padding: "7px 10px",
    cursor: "pointer",
    fontWeight: 650,
  },
  topControls: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  label: {
    display: "block",
    fontSize: 12,
    color: "#475569",
    fontWeight: 700,
    marginBottom: 6,
  },
  select: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    borderRadius: 7,
    minHeight: 40,
    padding: "8px 10px",
    color: "#172033",
    minWidth: 210,
  },
  search: {
    border: "1px solid #cbd5e1",
    borderRadius: 7,
    minHeight: 40,
    padding: "9px 12px",
    width: "100%",
    boxSizing: "border-box",
    background: "#fff",
  },
  banner: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1e40af",
    borderRadius: 8,
    padding: "13px 15px",
    fontSize: 13,
    lineHeight: 1.55,
    marginBottom: 20,
  },
  error: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    borderRadius: 8,
    padding: "13px 15px",
    marginBottom: 18,
    lineHeight: 1.5,
  },
  success: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    color: "#166534",
    borderRadius: 8,
    padding: "13px 15px",
    marginBottom: 18,
    lineHeight: 1.5,
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 14,
    marginBottom: 22,
  },
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: 18,
    minHeight: 90,
  },
  cardLabel: { color: "#64748b", fontSize: 12, marginBottom: 10 },
  cardValue: { color: "#0f172a", fontSize: 25, fontWeight: 750 },
  panel: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: 18,
    marginBottom: 20,
    minWidth: 0,
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  tabs: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  tab: {
    border: "1px solid #cbd5e1",
    borderRadius: 7,
    padding: "10px 13px",
    background: "#fff",
    color: "#334155",
    cursor: "pointer",
    fontWeight: 650,
  },
  activeTab: {
    border: "1px solid #1d4ed8",
    background: "#1d4ed8",
    color: "#fff",
  },
  tableWrap: { width: "100%", overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 790, textAlign: "left" },
  th: {
    color: "#475569",
    background: "#f8fafc",
    padding: "12px 10px",
    borderBottom: "1px solid #e2e8f0",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  td: {
    padding: "12px 10px",
    borderBottom: "1px solid #e2e8f0",
    fontSize: 13,
    verticalAlign: "middle",
  },
  badge: {
    display: "inline-block",
    padding: "5px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 750,
    whiteSpace: "nowrap",
  },
  muted: { color: "#64748b", fontSize: 12 },
  empty: { textAlign: "center", color: "#64748b", padding: 32 },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,.55)",
    zIndex: 9999,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "28px 14px",
    overflowY: "auto",
  },
  modal: {
    width: "min(920px, 100%)",
    background: "#fff",
    borderRadius: 12,
    boxShadow: "0 24px 80px rgba(15,23,42,.25)",
    padding: 22,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 14,
  },
  field: {
    border: "1px solid #cbd5e1",
    borderRadius: 7,
    width: "100%",
    minHeight: 39,
    padding: "8px 10px",
    boxSizing: "border-box",
    fontSize: 14,
  },
};

function recordData(value: unknown): DataMap {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as DataMap;
  }
  return {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function list(value: unknown): DataMap[] {
  return Array.isArray(value) ? value.map(recordData) : [];
}

function normalize(value: string): string {
  return value.toLocaleLowerCase("es-HN").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function money(value: unknown): string {
  return `L ${num(value).toLocaleString("es-HN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function timestampNumber(value: unknown): number {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object" && "toDate" in value) {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return date instanceof Date ? date.getTime() : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

function dateLabel(record: DataMap): string {
  const primary = record.transactionDate ?? record.expenseDate ?? record.date ?? record.createdAt;
  const millis = timestampNumber(primary);
  return millis ? new Date(millis).toLocaleString("es-HN") : "—";
}

function isActive(data: DataMap): boolean {
  const status = str(data.status, "ACTIVE").toUpperCase();
  return !["CANCELLED", "CANCELED", "DELETED", "INACTIVE"].includes(status);
}

function statusBadge(active: boolean): CSSProperties {
  return {
    ...styles.badge,
    color: active ? "#166534" : "#991b1b",
    background: active ? "#dcfce7" : "#fee2e2",
  };
}

function paymentLabel(value: unknown): string {
  const labels: Record<string, string> = {
    CASH: "Efectivo",
    TRANSFER: "Transferencia",
    CARD: "Tarjeta",
    CREDIT: "Crédito",
  };
  const key = str(value, "CASH").toUpperCase();
  return labels[key] ?? key;
}

function transactionSearchText(record: AdminTransaction): string {
  const data = record.data;
  const itemNames = list(data.items)
    .map((item) => `${str(item.productName)} ${str(item.productCode)}`)
    .join(" ");
  return normalize([
    str(record.data.code, record.id),
    record.associationName,
    record.associationId,
    str(data.supplier),
    str(data.invoiceNumber),
    str(data.customer),
    str(data.createdBy),
    str(data.status),
    itemNames,
  ].join(" "));
}

function normalPaymentMethod(value: unknown): PaymentMethod {
  const method = str(value, "CASH").toUpperCase();
  if (method === "TRANSFER" || method === "CARD" || method === "CREDIT") return method;
  return "CASH";
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<TabKey>("overview");
  const [associationFilter, setAssociationFilter] = useState(ALL_ASSOCIATIONS);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [associations, setAssociations] = useState<AdminAssociation[]>([]);
  const [purchases, setPurchases] = useState<AdminTransaction[]>([]);
  const [sales, setSales] = useState<AdminTransaction[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [cashMovements, setCashMovements] = useState<AdminCashMovement[]>([]);
  const [expenses, setExpenses] = useState<AdminExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState<CorrectionEditor | null>(null);
  const [userEditor, setUserEditor] = useState<UserEditor | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  const isGlobalAdmin =
    user?.active === true &&
    user?.role === "Administrador" &&
    str(user?.associationId).trim().toLowerCase() === "todas";

  const loadData = useCallback(async () => {
    if (!isGlobalAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [userSnapshot, associationSnapshot] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "associations")),
      ]);

      const loadedUsers: AdminUser[] = userSnapshot.docs.map((document) => {
        const data = document.data();
        const associationId = str(data.associationId);
        return {
          id: document.id,
          email: str(data.email, document.id),
          role: str(data.role, "Sin rol"),
          associationId,
          associationName: str(data.associationName, associationId),
          active: data.active === true,
          displayName: str(data.displayName),
          phone: str(data.phone),
        };
      });

      const loadedAssociations: AdminAssociation[] = associationSnapshot.docs.map((document) => {
        const data = document.data();
        return {
          id: document.id,
          name: str(data.name, document.id),
          active: data.active !== false,
          department: str(data.department),
          municipality: str(data.municipality),
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      const loadedCompanyData = await Promise.all(loadedAssociations.map(async (association) => {
        const [purchaseSnapshot, saleSnapshot, productSnapshot, cashSnapshot, expenseSnapshot] = await Promise.all([
          getDocs(collection(db, "associations", association.id, "purchases")),
          getDocs(collection(db, "associations", association.id, "sales")),
          getDocs(collection(db, "associations", association.id, "products")),
          getDocs(collection(db, "associations", association.id, "cashMovements")),
          getDocs(collection(db, "associations", association.id, "expenses")),
        ]);

        return {
          purchases: purchaseSnapshot.docs.map((document): AdminTransaction => ({
            id: document.id,
            entityType: "purchase",
            associationId: association.id,
            associationName: association.name,
            data: document.data(),
          })),
          sales: saleSnapshot.docs.map((document): AdminTransaction => ({
            id: document.id,
            entityType: "sale",
            associationId: association.id,
            associationName: association.name,
            data: document.data(),
          })),
          products: productSnapshot.docs.map((document): AdminProduct => ({
            id: document.id,
            associationId: association.id,
            associationName: association.name,
            data: document.data(),
          })),
          cashMovements: cashSnapshot.docs.map((document): AdminCashMovement => ({
            id: document.id,
            associationId: association.id,
            associationName: association.name,
            data: document.data(),
          })),
          expenses: expenseSnapshot.docs.map((document): AdminExpense => ({
            id: document.id,
            associationId: association.id,
            associationName: association.name,
            data: document.data(),
          })),
        };
      }));

      setUsers(loadedUsers.sort((a, b) => a.email.localeCompare(b.email)));
      setAssociations(loadedAssociations);
      setPurchases(loadedCompanyData.flatMap((item) => item.purchases).sort((a, b) => timestampNumber(b.data.transactionDate ?? b.data.createdAt) - timestampNumber(a.data.transactionDate ?? a.data.createdAt)));
      setSales(loadedCompanyData.flatMap((item) => item.sales).sort((a, b) => timestampNumber(b.data.transactionDate ?? b.data.createdAt) - timestampNumber(a.data.transactionDate ?? a.data.createdAt)));
      setProducts(loadedCompanyData.flatMap((item) => item.products).sort((a, b) => str(a.data.name).localeCompare(str(b.data.name))));
      setCashMovements(loadedCompanyData.flatMap((item) => item.cashMovements).sort((a, b) => timestampNumber(b.data.createdAt) - timestampNumber(a.data.createdAt)));
      setExpenses(loadedCompanyData.flatMap((item) => item.expenses).sort((a, b) => timestampNumber(b.data.expenseDate ?? b.data.createdAt) - timestampNumber(a.data.expenseDate ?? a.data.createdAt)));
    } catch (err: unknown) {
      console.error("Error al cargar el panel de administración:", err);
      setError(err instanceof Error ? err.message : "No se pudieron cargar los datos de las empresas.");
    } finally {
      setLoading(false);
    }
  }, [isGlobalAdmin]);

  useEffect(() => {
    if (!authLoading) void loadData();
  }, [authLoading, loadData]);

  const selectedAssociations = useMemo(() => {
    if (associationFilter === ALL_ASSOCIATIONS) return associations;
    return associations.filter((item) => item.id === associationFilter);
  }, [associationFilter, associations]);
  const visibleAssociationIds = useMemo(
    () => new Set(selectedAssociations.map((item) => item.id)),
    [selectedAssociations]
  );
  const filteredPurchases = useMemo(() => purchases.filter((item) => visibleAssociationIds.has(item.associationId) && transactionSearchText(item).includes(normalize(search))), [purchases, visibleAssociationIds, search]);
  const filteredSales = useMemo(() => sales.filter((item) => visibleAssociationIds.has(item.associationId) && transactionSearchText(item).includes(normalize(search))), [sales, visibleAssociationIds, search]);
  const filteredProducts = useMemo(() => products.filter((item) => visibleAssociationIds.has(item.associationId) && normalize([str(item.data.code, item.id), str(item.data.name), str(item.data.category), item.associationName].join(" ")).includes(normalize(search))), [products, visibleAssociationIds, search]);
  const filteredCash = useMemo(() => cashMovements.filter((item) => visibleAssociationIds.has(item.associationId) && normalize([item.associationName, str(item.data.concept), str(item.data.createdBy), str(item.data.type), str(item.data.paymentMethod)].join(" ")).includes(normalize(search))), [cashMovements, visibleAssociationIds, search]);
  const filteredExpenses = useMemo(() => expenses.filter((item) => visibleAssociationIds.has(item.associationId) && normalize([item.associationName, str(item.data.description), str(item.data.category), str(item.data.createdBy)].join(" ")).includes(normalize(search))), [expenses, visibleAssociationIds, search]);
  const filteredUsers = useMemo(() => users.filter((item) => normalize([item.email, item.displayName, item.role, item.associationName, item.associationId].join(" ")).includes(normalize(search))), [users, search]);
  const filteredAssociations = useMemo(() => associations.filter((item) => normalize([item.id, item.name, item.department, item.municipality].join(" ")).includes(normalize(search))), [associations, search]);

  const activePurchases = purchases.filter((item) => visibleAssociationIds.has(item.associationId) && isActive(item.data));
  const activeSales = sales.filter((item) => visibleAssociationIds.has(item.associationId) && isActive(item.data));
  const activeCash = cashMovements.filter((item) => visibleAssociationIds.has(item.associationId) && isActive(item.data));
  const activeExpenses = expenses.filter((item) => visibleAssociationIds.has(item.associationId) && isActive(item.data));
  const activeProducts = products.filter((item) => visibleAssociationIds.has(item.associationId) && item.data.active !== false);
  const purchaseTotal = activePurchases.reduce((sum, item) => sum + num(item.data.total), 0);
  const salesTotal = activeSales.reduce((sum, item) => sum + num(item.data.total), 0);
  const expensesTotal = activeExpenses.reduce((sum, item) => sum + num(item.data.amount), 0);
  const cashIncome = activeCash.filter((item) => str(item.data.type).toUpperCase() === "INCOME").reduce((sum, item) => sum + num(item.data.amount), 0);
  const cashExpenses = activeCash.filter((item) => str(item.data.type).toUpperCase() === "EXPENSE").reduce((sum, item) => sum + num(item.data.amount), 0);
  const stockValue = activeProducts.reduce((sum, item) => sum + num(item.data.stock) * num(item.data.purchaseCostLb), 0);

  const companySummaries = useMemo(() => associations.map((association) => {
    const companyPurchases = purchases.filter((item) => item.associationId === association.id && isActive(item.data)).reduce((sum, item) => sum + num(item.data.total), 0);
    const companySales = sales.filter((item) => item.associationId === association.id && isActive(item.data)).reduce((sum, item) => sum + num(item.data.total), 0);
    const companyExpenses = expenses.filter((item) => item.associationId === association.id && isActive(item.data)).reduce((sum, item) => sum + num(item.data.amount), 0);
    const companyCash = cashMovements.filter((item) => item.associationId === association.id && isActive(item.data)).reduce((sum, item) => sum + (str(item.data.type).toUpperCase() === "INCOME" ? num(item.data.amount) : -num(item.data.amount)), 0);
    const companyStock = products.filter((item) => item.associationId === association.id && item.data.active !== false).reduce((sum, item) => sum + num(item.data.stock) * num(item.data.purchaseCostLb), 0);
    return { association, purchases: companyPurchases, sales: companySales, expenses: companyExpenses, cash: companyCash, stock: companyStock };
  }), [associations, purchases, sales, expenses, cashMovements, products]);

  function openCorrection(transaction: AdminTransaction) {
    const items: EditorItem[] = list(transaction.data.items).map((item) => {
      const product = products.find((candidate) => candidate.associationId === transaction.associationId && candidate.id === str(item.productId));
      return {
        productId: str(item.productId),
        productCode: str(item.productCode, str(product?.data.code, str(item.productId))),
        productName: str(item.productName, str(product?.data.name, str(item.productId))),
        unit: str(item.unit, str(product?.data.unit, "Unidad")),
        quantity: num(item.quantity, 1),
        unitPrice: num(item.unitPrice, 0),
      };
    });

    setEditor({
      transaction,
      items,
      paymentMethod: normalPaymentMethod(transaction.data.paymentMethod),
      supplier: str(transaction.data.supplier),
      invoiceNumber: str(transaction.data.invoiceNumber),
      customer: str(transaction.data.customer),
      notes: str(transaction.data.notes),
      reason: "",
    });
    setError(null);
    setNotice(null);
  }

  function updateEditor<K extends keyof CorrectionEditor>(key: K, value: CorrectionEditor[K]) {
    setEditor((current) => current ? { ...current, [key]: value } : current);
  }

  function updateEditorItem(index: number, key: "quantity" | "unitPrice", value: number) {
    setEditor((current) => {
      if (!current) return current;
      const items = current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item);
      return { ...current, items };
    });
  }

  function addProductToCorrection(productId: string) {
    if (!editor || !productId) return;
    const product = products.find((item) => item.associationId === editor.transaction.associationId && item.id === productId);
    if (!product) return;
    if (editor.items.some((item) => item.productId === productId)) {
      setError("Ese producto ya está en la operación. Modifica la cantidad en su línea existente.");
      return;
    }
    const defaultPrice = editor.transaction.entityType === "purchase"
      ? num(product.data.purchaseCostLb)
      : num(product.data.lastSalePriceLb);
    setEditor((current) => current ? {
      ...current,
      items: [...current.items, {
        productId,
        productCode: str(product.data.code, product.id),
        productName: str(product.data.name, product.id),
        unit: str(product.data.unit, "Unidad"),
        quantity: 1,
        unitPrice: defaultPrice,
      }],
    } : current);
  }

  function isProtectedAdminProfile(profile: AdminUser): boolean {
    return profile.email.trim().toLowerCase() === user?.email?.trim().toLowerCase()
      || (profile.role === "Administrador" && profile.associationId.trim().toLowerCase() === "todas");
  }

  function openCreateUserProfile() {
    const firstAssociation = associations.find((association) => association.active);
    setUserEditor({
      mode: "create",
      originalId: null,
      email: "",
      role: "Vendedor",
      associationId: firstAssociation?.id ?? "",
      active: true,
      displayName: "",
      phone: "",
    });
    setError(null);
    setNotice(null);
  }

  function openEditUserProfile(profile: AdminUser) {
    if (isProtectedAdminProfile(profile)) {
      setError("Esta cuenta de administrador global está protegida para evitar bloquear el acceso administrativo.");
      return;
    }
    setUserEditor({
      mode: "edit",
      originalId: profile.id,
      email: profile.email,
      role: profile.role === "Administrador" || profile.role === "Consulta" ? profile.role : "Vendedor",
      associationId: profile.associationId,
      active: profile.active,
      displayName: profile.displayName,
      phone: profile.phone,
    });
    setError(null);
    setNotice(null);
  }

  function updateUserEditor<K extends keyof UserEditor>(key: K, value: UserEditor[K]) {
    setUserEditor((current) => current ? { ...current, [key]: value } : current);
  }

  async function saveUserProfile() {
    if (!userEditor || savingUser) return;
    const actor = auth.currentUser;
    if (!user?.email || !actor?.uid || !actor.email) {
      setError("No se pudo identificar al administrador autenticado.");
      return;
    }

    const email = userEditor.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Escribe un correo electrónico válido.");
      return;
    }
    if (!userEditor.associationId.trim()) {
      setError("Selecciona la empresa a la que pertenecerá el usuario.");
      return;
    }
    if (userEditor.associationId.trim().toLowerCase() === "todas") {
      setError("No se pueden crear ni asignar administradores globales desde esta pantalla. Asigna al usuario a una empresa concreta.");
      return;
    }
    const assignedAssociation = associations.find(
      (association) => association.id === userEditor.associationId && association.active,
    );
    if (!assignedAssociation) {
      setError("La empresa seleccionada no existe o está inactiva.");
      return;
    }
    if (userEditor.mode === "create" && users.some((profile) => profile.id.toLowerCase() === email)) {
      setError("Ya existe un perfil de Firestore para ese correo.");
      return;
    }
    if (userEditor.mode === "edit") {
      const original = users.find((profile) => profile.id === userEditor.originalId);
      if (!original) {
        setError("No se encontró el perfil que intentas editar. Actualiza los datos e inténtalo de nuevo.");
        return;
      }
      if (isProtectedAdminProfile(original)) {
        setError("Esta cuenta está protegida y no se puede modificar desde esta pantalla.");
        return;
      }
    }

    const associationName = assignedAssociation.name;

    const confirmed = window.confirm(
      userEditor.mode === "create"
        ? `¿Crear el perfil de ${email} como ${userEditor.role} para ${associationName}?\n\nImportante: esta acción crea el perfil de Firestore; la cuenta de acceso debe existir previamente en Firebase Authentication.`
        : `¿Guardar los cambios del perfil ${email}?\n\nRol: ${userEditor.role}\nEmpresa: ${associationName}\nEstado: ${userEditor.active ? "Activo" : "Inactivo"}.`
    );
    if (!confirmed) return;

    setSavingUser(true);
    setError(null);
    setNotice(null);
    try {
      const batch = writeBatch(db);
      const profileRef = doc(db, "users", userEditor.mode === "create" ? email : String(userEditor.originalId));
      const profileFields = {
        email,
        role: userEditor.role,
        associationId: userEditor.associationId,
        associationName,
        active: userEditor.active,
        displayName: userEditor.displayName.trim(),
        phone: userEditor.phone.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: actor.email.trim().toLowerCase(),
        updatedByUid: actor.uid,
      };

      if (userEditor.mode === "create") {
        batch.set(profileRef, {
          ...profileFields,
          createdAt: serverTimestamp(),
          createdBy: actor.email.trim().toLowerCase(),
          createdByUid: actor.uid,
        });
      } else {
        // El correo/document ID permanece inmutable. Solo se actualizan campos del perfil.
        batch.update(profileRef, {
          role: profileFields.role,
          associationId: profileFields.associationId,
          associationName: profileFields.associationName,
          active: profileFields.active,
          displayName: profileFields.displayName,
          phone: profileFields.phone,
          updatedAt: profileFields.updatedAt,
          updatedBy: profileFields.updatedBy,
          updatedByUid: profileFields.updatedByUid,
        });
      }

      const auditRef = doc(collection(db, "auditLogs"));
      const previous = userEditor.mode === "edit"
        ? users.find((profile) => profile.id === userEditor.originalId)
        : undefined;
      batch.set(auditRef, {
        action: userEditor.mode === "create" ? "USER_PROFILE_CREATED" : "USER_PROFILE_UPDATED",
        actorUid: actor.uid,
        actorEmail: actor.email.trim().toLowerCase(),
        createdBy: actor.email.trim().toLowerCase(),
        associationId: "todas",
        entityType: "user",
        entityId: email,
        details: {
          email,
          before: previous ? {
            role: previous.role,
            associationId: previous.associationId,
            associationName: previous.associationName,
            active: previous.active,
          } : null,
          after: {
            role: userEditor.role,
            associationId: userEditor.associationId,
            associationName,
            active: userEditor.active,
          },
        },
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      setUserEditor(null);
      setNotice(userEditor.mode === "create"
        ? `Se creó el perfil de ${email}. Confirma que la cuenta exista en Firebase Authentication antes de entregarle acceso.`
        : `Se actualizó el perfil de ${email}. El historial de auditoría conserva el cambio.`);
      await loadData();
    } catch (saveError: unknown) {
      console.error("No se pudo guardar el perfil de usuario:", saveError);
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el perfil.");
    } finally {
      setSavingUser(false);
    }
  }

  async function saveCorrection() {
    if (!editor || saving) return;
    const reason = editor.reason.trim();
    if (reason.length < 5) {
      setError("Escribe un motivo de corrección de al menos 5 caracteres.");
      return;
    }
    if (editor.items.length === 0) {
      setError("La operación corregida debe contener al menos un producto.");
      return;
    }
    if (editor.items.some((item) => !item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice <= 0)) {
      setError("Cada producto debe tener una cantidad y un precio unitario mayores que cero.");
      return;
    }

    const requestBase = {
      associationId: editor.transaction.associationId,
      associationName: editor.transaction.associationName,
      createdBy: user?.email ?? "",
      paymentMethod: editor.paymentMethod,
      notes: editor.notes.trim(),
      items: editor.items.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      })),
    };

    const transactionCode = str(editor.transaction.data.code, editor.transaction.id);
    const confirmed = window.confirm(
      `¿Confirmas corregir ${editor.transaction.entityType === "purchase" ? "la compra" : "la venta"} ${transactionCode} de ${editor.transaction.associationName}?\n\nMotivo: ${reason}\n\nSe conservará la versión anterior y se registrarán ajustes de inventario/caja cuando correspondan.`
    );
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (editor.transaction.entityType === "purchase") {
        const request = {
          ...requestBase,
          supplier: editor.supplier.trim(),
          invoiceNumber: editor.invoiceNumber.trim(),
        } as unknown as PurchaseRequest;
        await purchaseService.correctPurchase(editor.transaction.id, request, reason);
      } else {
        const request = {
          ...requestBase,
          customer: editor.customer.trim(),
        } as unknown as SaleRequest;
        await salesService.correctSale(editor.transaction.id, request, reason);
      }

      const code = str(editor.transaction.data.code, editor.transaction.id);
      setEditor(null);
      setNotice(`La operación ${code} fue corregida. Se guardó la versión anterior, el motivo, los ajustes de inventario y la conciliación de caja en los registros de auditoría.`);
      await loadData();
    } catch (err: unknown) {
      console.error("No se pudo corregir la operación:", err);
      setError(err instanceof Error ? err.message : "No se pudo guardar la corrección.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return <main style={styles.page}>Cargando sesión...</main>;
  }

  if (!isGlobalAdmin) {
    return (
      <main style={styles.page}>
        <section style={styles.panel}>
          <h1 style={styles.heading}>Acceso restringido</h1>
          <p style={styles.subtitle}>El panel consolidado y la corrección de transacciones están reservados al Administrador global.</p>
        </section>
      </main>
    );
  }

  const tabOptions: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Resumen global" },
    { key: "sales", label: `Ventas (${filteredSales.length})` },
    { key: "purchases", label: `Compras (${filteredPurchases.length})` },
    { key: "inventory", label: `Inventario (${filteredProducts.length})` },
    { key: "finance", label: "Caja y gastos" },
    { key: "users", label: `Usuarios (${users.length})` },
    { key: "associations", label: `Asociaciones (${associations.length})` },
  ];

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.heading}>Administración global</h1>
          <p style={styles.subtitle}>Consulta las operaciones de todas las empresas y corrige compras o ventas con trazabilidad.</p>
        </div>
        <button type="button" style={styles.primaryButton} onClick={() => void loadData()} disabled={loading || saving}>
          {loading ? "Actualizando…" : "Actualizar datos"}
        </button>
      </header>

      <div style={styles.banner}>
        <strong>Acceso de Administrador global.</strong> Puedes consultar ventas, compras, existencias, caja y gastos por empresa o en conjunto. Las correcciones conservan la versión anterior, exigen un motivo y generan movimientos de ajuste y registros de auditoría; nunca se eliminan movimientos históricos.
      </div>

      {error && <div style={styles.error}><strong>Atención:</strong> {error}</div>}
      {notice && <div style={styles.success}>{notice}</div>}

      <div style={styles.topControls}>
        <div>
          <label style={styles.label} htmlFor="admin-association-filter">Empresa</label>
          <select
            id="admin-association-filter"
            style={styles.select}
            value={associationFilter}
            onChange={(event) => {
              setAssociationFilter(event.target.value);
              setSearch("");
            }}
          >
            <option value={ALL_ASSOCIATIONS}>Todas las empresas</option>
            {associations.map((association) => (
              <option key={association.id} value={association.id}>{association.name} · {association.id}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label style={styles.label} htmlFor="admin-search">Buscar en el módulo actual</label>
          <input id="admin-search" style={styles.search} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Código, producto, cliente, proveedor, correo…" />
        </div>
      </div>

      <section style={styles.cards}>
        <div style={styles.card}><div style={styles.cardLabel}>Ventas activas</div><div style={styles.cardValue}>{activeSales.length}</div><div style={styles.muted}>{money(salesTotal)} en ventas registradas</div></div>
        <div style={styles.card}><div style={styles.cardLabel}>Compras activas</div><div style={styles.cardValue}>{activePurchases.length}</div><div style={styles.muted}>{money(purchaseTotal)} en compras registradas</div></div>
        <div style={styles.card}><div style={styles.cardLabel}>Valor estimado del inventario</div><div style={styles.cardValue}>{money(stockValue)}</div><div style={styles.muted}>{activeProducts.length} productos activos</div></div>
        <div style={styles.card}><div style={styles.cardLabel}>Saldo neto de caja</div><div style={styles.cardValue}>{money(cashIncome - cashExpenses)}</div><div style={styles.muted}>Ingresos {money(cashIncome)} · egresos {money(cashExpenses)}</div></div>
        <div style={styles.card}><div style={styles.cardLabel}>Gastos registrados</div><div style={styles.cardValue}>{activeExpenses.length}</div><div style={styles.muted}>{money(expensesTotal)} en gastos activos</div></div>
      </section>

      <section style={styles.panel}>
        <div style={styles.tabs}>
          {tabOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              style={{ ...styles.tab, ...(tab === option.key ? styles.activeTab : {}) }}
              onClick={() => setTab(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={styles.empty}>Consultando datos de las empresas en Firestore…</div>
        ) : tab === "overview" ? (
          <>
            <div style={styles.panelHeader}>
              <div><h2 style={{ margin: 0, fontSize: 19 }}>Resumen por empresa</h2><p style={{ ...styles.subtitle, marginTop: 5 }}>Totales según los documentos actuales de cada asociación.</p></div>
            </div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead><tr><th style={styles.th}>Empresa</th><th style={styles.th}>Ventas</th><th style={styles.th}>Compras</th><th style={styles.th}>Gastos</th><th style={styles.th}>Caja neta</th><th style={styles.th}>Inventario estimado</th><th style={styles.th}>Estado</th></tr></thead>
                <tbody>
                  {companySummaries.filter((row) => associationFilter === ALL_ASSOCIATIONS || row.association.id === associationFilter).map((row) => (
                    <tr key={row.association.id}>
                      <td style={styles.td}><strong>{row.association.name}</strong><div style={styles.muted}>ID: {row.association.id}</div></td>
                      <td style={styles.td}>{money(row.sales)}</td><td style={styles.td}>{money(row.purchases)}</td><td style={styles.td}>{money(row.expenses)}</td><td style={styles.td}>{money(row.cash)}</td><td style={styles.td}>{money(row.stock)}</td><td style={styles.td}><span style={statusBadge(row.association.active)}>{row.association.active ? "Activa" : "Inactiva"}</span></td>
                    </tr>
                  ))}
                  {companySummaries.length === 0 && <tr><td style={styles.td} colSpan={7}><div style={styles.empty}>No hay asociaciones registradas.</div></td></tr>}
                </tbody>
              </table>
            </div>
            <p style={{ ...styles.muted, marginTop: 14 }}>Nota: los importes reflejan ventas, compras, gastos y movimientos de caja activos. Si una operación se corrige, sus nuevos valores se muestran aquí y la versión anterior queda en el historial de correcciones.</p>
          </>
        ) : tab === "sales" ? (
          <TransactionTable
            title="Ventas"
            records={filteredSales}
            onCorrect={openCorrection}
          />
        ) : tab === "purchases" ? (
          <TransactionTable
            title="Compras"
            records={filteredPurchases}
            onCorrect={openCorrection}
          />
        ) : tab === "inventory" ? (
          <>
            <div style={styles.panelHeader}><h2 style={{ margin: 0, fontSize: 19 }}>Inventario por empresa</h2><span style={styles.muted}>{filteredProducts.length} productos en la selección</span></div>
            <div style={styles.tableWrap}><table style={styles.table}>
              <thead><tr><th style={styles.th}>Empresa</th><th style={styles.th}>Código</th><th style={styles.th}>Producto</th><th style={styles.th}>Categoría</th><th style={styles.th}>Existencias</th><th style={styles.th}>Unidad</th><th style={styles.th}>Costo unitario</th><th style={styles.th}>Valor estimado</th><th style={styles.th}>Estado</th></tr></thead>
              <tbody>{filteredProducts.map((item) => {
                const stock = num(item.data.stock);
                const minimum = num(item.data.stockMinimo, 0);
                const active = item.data.active !== false;
                return <tr key={`${item.associationId}:${item.id}`}>
                  <td style={styles.td}>{item.associationName}</td><td style={styles.td}>{str(item.data.code, item.id)}</td><td style={styles.td}><strong>{str(item.data.name, "Sin nombre")}</strong></td><td style={styles.td}>{str(item.data.category, "—")}</td><td style={styles.td}>{stock.toLocaleString("es-HN")}</td><td style={styles.td}>{str(item.data.unit, "—")}</td><td style={styles.td}>{money(item.data.purchaseCostLb)}</td><td style={styles.td}>{money(stock * num(item.data.purchaseCostLb))}</td><td style={styles.td}><span style={statusBadge(active)}>{!active ? "Inactivo" : stock <= minimum ? "Stock bajo" : "Activo"}</span></td>
                </tr>;
              })}{filteredProducts.length === 0 && <tr><td style={styles.td} colSpan={9}><div style={styles.empty}>No se encontraron productos.</div></td></tr>}</tbody>
            </table></div>
          </>
        ) : tab === "finance" ? (
          <>
            <h2 style={{ margin: "0 0 14px", fontSize: 19 }}>Movimientos de caja</h2>
            <div style={styles.tableWrap}><table style={styles.table}>
              <thead><tr><th style={styles.th}>Fecha</th><th style={styles.th}>Empresa</th><th style={styles.th}>Tipo</th><th style={styles.th}>Concepto</th><th style={styles.th}>Método</th><th style={styles.th}>Referencia</th><th style={styles.th}>Monto</th><th style={styles.th}>Estado</th></tr></thead>
              <tbody>{filteredCash.map((item) => <tr key={`${item.associationId}:${item.id}`}><td style={styles.td}>{dateLabel(item.data)}</td><td style={styles.td}>{item.associationName}</td><td style={styles.td}>{str(item.data.type)}</td><td style={styles.td}>{str(item.data.concept, "—")}</td><td style={styles.td}>{paymentLabel(item.data.paymentMethod)}</td><td style={styles.td}>{str(item.data.referenceType, "—")} {str(item.data.referenceId)}</td><td style={styles.td}>{money(item.data.amount)}</td><td style={styles.td}><span style={statusBadge(isActive(item.data))}>{isActive(item.data) ? "Activo" : "Cancelado"}</span></td></tr>)}{filteredCash.length === 0 && <tr><td style={styles.td} colSpan={8}><div style={styles.empty}>No hay movimientos de caja para los filtros actuales.</div></td></tr>}</tbody>
            </table></div>
            <h2 style={{ margin: "26px 0 14px", fontSize: 19 }}>Gastos</h2>
            <div style={styles.tableWrap}><table style={styles.table}>
              <thead><tr><th style={styles.th}>Fecha</th><th style={styles.th}>Empresa</th><th style={styles.th}>Categoría</th><th style={styles.th}>Descripción</th><th style={styles.th}>Estado de pago</th><th style={styles.th}>Monto</th><th style={styles.th}>Estado</th></tr></thead>
              <tbody>{filteredExpenses.map((item) => <tr key={`${item.associationId}:${item.id}`}><td style={styles.td}>{dateLabel(item.data)}</td><td style={styles.td}>{item.associationName}</td><td style={styles.td}>{str(item.data.category, "—")}</td><td style={styles.td}>{str(item.data.description, "—")}</td><td style={styles.td}>{str(item.data.paymentStatus, "—")}</td><td style={styles.td}>{money(item.data.amount)}</td><td style={styles.td}><span style={statusBadge(isActive(item.data))}>{isActive(item.data) ? "Activo" : "Cancelado"}</span></td></tr>)}{filteredExpenses.length === 0 && <tr><td style={styles.td} colSpan={7}><div style={styles.empty}>No hay gastos para los filtros actuales.</div></td></tr>}</tbody>
            </table></div>
          </>
        ) : tab === "users" ? (
          <>
            <div style={styles.panelHeader}>
              <div><h2 style={{ margin: 0, fontSize: 19 }}>Usuarios y permisos asignados</h2><p style={{ ...styles.subtitle, marginTop: 5 }}>Asigna roles, empresas y estado. Los cambios quedan registrados en auditoría; los perfiles de administrador global están protegidos.</p></div>
              <button type="button" style={styles.primaryButton} onClick={openCreateUserProfile}>＋ Vincular cuenta existente</button>
            </div>
            <div style={styles.banner}>Esta pantalla crea el perfil en Firestore para una cuenta ya registrada en Firebase Authentication; no crea contraseñas ni cambia credenciales. Para crear el acceso de correo/contraseña, registra primero la cuenta en Authentication.</div>
            <div style={styles.tableWrap}><table style={styles.table}>
              <thead><tr><th style={styles.th}>Usuario</th><th style={styles.th}>Correo</th><th style={styles.th}>Rol</th><th style={styles.th}>Empresa</th><th style={styles.th}>Estado</th><th style={styles.th}>Acción</th></tr></thead>
              <tbody>{filteredUsers.map((item) => <tr key={item.id}><td style={styles.td}><strong>{item.displayName || item.email}</strong>{isProtectedAdminProfile(item) && <div style={styles.muted}>Cuenta protegida</div>}</td><td style={styles.td}>{item.email}</td><td style={styles.td}>{item.role}</td><td style={styles.td}>{item.associationName}<div style={styles.muted}>ID: {item.associationId}</div></td><td style={styles.td}><span style={statusBadge(item.active)}>{item.active ? "Activo" : "Inactivo"}</span></td><td style={styles.td}><button type="button" style={styles.button} disabled={isProtectedAdminProfile(item)} onClick={() => openEditUserProfile(item)}>Editar perfil</button></td></tr>)}{filteredUsers.length === 0 && <tr><td style={styles.td} colSpan={6}><div style={styles.empty}>No se encontraron usuarios.</div></td></tr>}</tbody>
            </table></div>
          </>
        ) : (
          <>
            <div style={styles.panelHeader}><h2 style={{ margin: 0, fontSize: 19 }}>Asociaciones registradas</h2><span style={styles.muted}>Los identificadores se muestran exactamente como están guardados en Firestore.</span></div>
            <div style={styles.tableWrap}><table style={styles.table}>
              <thead><tr><th style={styles.th}>Nombre</th><th style={styles.th}>ID en Firestore</th><th style={styles.th}>Departamento</th><th style={styles.th}>Municipio</th><th style={styles.th}>Ventas</th><th style={styles.th}>Compras</th><th style={styles.th}>Estado</th></tr></thead>
              <tbody>{filteredAssociations.map((item) => { const summary = companySummaries.find((row) => row.association.id === item.id); return <tr key={item.id}><td style={styles.td}><strong>{item.name}</strong></td><td style={styles.td}>{item.id}</td><td style={styles.td}>{item.department || "—"}</td><td style={styles.td}>{item.municipality || "—"}</td><td style={styles.td}>{money(summary?.sales)}</td><td style={styles.td}>{money(summary?.purchases)}</td><td style={styles.td}><span style={statusBadge(item.active)}>{item.active ? "Activa" : "Inactiva"}</span></td></tr>; })}{filteredAssociations.length === 0 && <tr><td style={styles.td} colSpan={7}><div style={styles.empty}>No hay asociaciones.</div></td></tr>}</tbody>
            </table></div>
          </>
        )}
      </section>

      {editor && (
        <div style={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditor(null); }}>
          <section style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="correction-title">
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, marginBottom: 18 }}>
              <div>
                <h2 id="correction-title" style={{ margin: "0 0 7px", fontSize: 22 }}>Corregir {editor.transaction.entityType === "purchase" ? "compra" : "venta"}</h2>
                <div style={styles.muted}>{str(editor.transaction.data.code, editor.transaction.id)} · {editor.transaction.associationName} · ID: {editor.transaction.id}</div>
              </div>
              <button type="button" style={styles.button} onClick={() => setEditor(null)} disabled={saving}>Cerrar</button>
            </header>

            <div style={styles.banner}><strong>Corrección auditada.</strong> El sistema guardará una instantánea anterior, el motivo, el usuario y los nuevos valores. Las existencias se ajustarán en la misma transacción; los movimientos previos no se borrarán.</div>

            <div style={styles.formGrid}>
              {editor.transaction.entityType === "purchase" ? <>
                <div><label style={styles.label}>Proveedor</label><input style={styles.field} value={editor.supplier} onChange={(event) => updateEditor("supplier", event.target.value)} /></div>
                <div><label style={styles.label}>Número de factura</label><input style={styles.field} value={editor.invoiceNumber} onChange={(event) => updateEditor("invoiceNumber", event.target.value)} /></div>
              </> : <div><label style={styles.label}>Cliente</label><input style={styles.field} value={editor.customer} onChange={(event) => updateEditor("customer", event.target.value)} /></div>}
              <div><label style={styles.label}>Método de pago</label><select style={{ ...styles.field, background: "#fff" }} value={editor.paymentMethod} onChange={(event) => updateEditor("paymentMethod", normalPaymentMethod(event.target.value))}>{PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={styles.label}>Notas</label><textarea style={{ ...styles.field, minHeight: 74, resize: "vertical" }} value={editor.notes} onChange={(event) => updateEditor("notes", event.target.value)} /></div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "22px 0 10px" }}>
              <h3 style={{ margin: 0, fontSize: 17 }}>Productos de la operación</h3>
              <select style={styles.select} value="" onChange={(event) => addProductToCorrection(event.target.value)}>
                <option value="">Agregar producto de esta empresa…</option>
                {products.filter((item) => item.associationId === editor.transaction.associationId && item.data.active !== false && !editor.items.some((line) => line.productId === item.id)).map((item) => <option key={item.id} value={item.id}>{str(item.data.code, item.id)} · {str(item.data.name, item.id)}</option>)}
              </select>
            </div>
            <div style={styles.tableWrap}><table style={{ ...styles.table, minWidth: 650 }}>
              <thead><tr><th style={styles.th}>Producto</th><th style={styles.th}>Cantidad</th><th style={styles.th}>Precio unitario</th><th style={styles.th}>Subtotal</th><th style={styles.th}>Acción</th></tr></thead>
              <tbody>{editor.items.map((item, index) => <tr key={`${item.productId}:${index}`}><td style={styles.td}><strong>{item.productName}</strong><div style={styles.muted}>{item.productCode} · {item.unit}</div></td><td style={styles.td}><input aria-label={`Cantidad para ${item.productName}`} type="number" min="0.0001" step="any" style={{ ...styles.field, width: 105 }} value={item.quantity} onChange={(event) => updateEditorItem(index, "quantity", Number(event.target.value))} /></td><td style={styles.td}><input aria-label={`Precio para ${item.productName}`} type="number" min="0.01" step="0.01" style={{ ...styles.field, width: 130 }} value={item.unitPrice} onChange={(event) => updateEditorItem(index, "unitPrice", Number(event.target.value))} /></td><td style={styles.td}>{money(item.quantity * item.unitPrice)}</td><td style={styles.td}><button type="button" style={styles.dangerButton} disabled={editor.items.length <= 1 || saving} onClick={() => setEditor((current) => current ? { ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) } : current)}>Quitar</button></td></tr>)}{editor.items.length === 0 && <tr><td colSpan={5} style={styles.td}><div style={styles.empty}>Agrega al menos un producto.</div></td></tr>}</tbody>
            </table></div>
            <div style={{ display: "flex", justifyContent: "flex-end", margin: "12px 0 20px", fontSize: 18, fontWeight: 750 }}>Total corregido: {money(editor.items.reduce((sum, item) => sum + num(item.quantity) * num(item.unitPrice), 0))}</div>

            <div style={{ marginBottom: 18 }}><label style={styles.label}>Motivo obligatorio de la corrección</label><textarea style={{ ...styles.field, minHeight: 88, resize: "vertical" }} value={editor.reason} onChange={(event) => updateEditor("reason", event.target.value)} placeholder="Ejemplo: se digitó una cantidad incorrecta en la factura…" /></div>
            <footer style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button type="button" style={styles.button} onClick={() => setEditor(null)} disabled={saving}>Cancelar</button>
              <button type="button" style={styles.primaryButton} onClick={() => void saveCorrection()} disabled={saving || editor.items.length === 0}>{saving ? "Aplicando corrección…" : "Guardar corrección auditada"}</button>
            </footer>
          </section>
        </div>
      )}
      {userEditor && (
        <div style={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingUser) setUserEditor(null); }}>
          <section style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="user-profile-title">
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, marginBottom: 18 }}>
              <div>
                <h2 id="user-profile-title" style={{ margin: "0 0 7px", fontSize: 22 }}>{userEditor.mode === "create" ? "Vincular cuenta existente" : "Editar perfil de usuario"}</h2>
                <p style={{ ...styles.subtitle, marginTop: 5 }}>El perfil define empresa, rol y acceso al ERP. Los cambios se auditan y no eliminan operaciones anteriores.</p>
              </div>
              <button type="button" style={styles.button} onClick={() => setUserEditor(null)} disabled={savingUser}>Cerrar</button>
            </header>
            <div style={styles.banner}><strong>Importante:</strong> {userEditor.mode === "create" ? "Primero debe existir una cuenta con este correo en Firebase Authentication. Aquí solo se crea su perfil del ERP." : "Desactivar el perfil bloquea el acceso a los datos del ERP mediante las reglas de Firestore; no elimina la cuenta ni sus registros históricos."}</div>
            <div style={styles.formGrid}>
              <div>
                <label style={styles.label} htmlFor="user-profile-email">Correo electrónico</label>
                <input id="user-profile-email" style={styles.field} type="email" value={userEditor.email} disabled={userEditor.mode === "edit" || savingUser} onChange={(event) => updateUserEditor("email", event.target.value)} placeholder="usuario@empresa.com" />
              </div>
              <div>
                <label style={styles.label} htmlFor="user-profile-name">Nombre para mostrar</label>
                <input id="user-profile-name" style={styles.field} value={userEditor.displayName} disabled={savingUser} onChange={(event) => updateUserEditor("displayName", event.target.value)} placeholder="Nombre del usuario" />
              </div>
              <div>
                <label style={styles.label} htmlFor="user-profile-phone">Teléfono</label>
                <input id="user-profile-phone" style={styles.field} value={userEditor.phone} disabled={savingUser} onChange={(event) => updateUserEditor("phone", event.target.value)} placeholder="Teléfono (opcional)" />
              </div>
              <div>
                <label style={styles.label} htmlFor="user-profile-role">Rol</label>
                <select id="user-profile-role" style={{ ...styles.field, background: "#fff" }} value={userEditor.role} disabled={savingUser} onChange={(event) => {
                  const role = event.target.value as AdminRole;
                  setUserEditor((current) => {
                    if (!current) return current;
                    const next = { ...current, role };
                    if (role !== "Administrador" && next.associationId === "todas") {
                      next.associationId = associations.find((association) => association.active)?.id ?? "";
                    }
                    return next;
                  });
                }}>
                  <option value="Administrador">Administrador</option>
                  <option value="Vendedor">Vendedor</option>
                  <option value="Consulta">Consulta</option>
                </select>
              </div>
              <div>
                <label style={styles.label} htmlFor="user-profile-association">Empresa asignada</label>
                <select id="user-profile-association" style={{ ...styles.field, background: "#fff" }} value={userEditor.associationId} disabled={savingUser} onChange={(event) => updateUserEditor("associationId", event.target.value)}>
                  {associations.filter((association) => association.active).map((association) => <option key={association.id} value={association.id}>{association.name} · {association.id}</option>)}
                </select>
              </div>
              <div>
                <label style={styles.label} htmlFor="user-profile-active">Estado del perfil</label>
                <select id="user-profile-active" style={{ ...styles.field, background: "#fff" }} value={userEditor.active ? "active" : "inactive"} disabled={savingUser} onChange={(event) => updateUserEditor("active", event.target.value === "active")}>
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>
            </div>
            <footer style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
              <button type="button" style={styles.button} onClick={() => setUserEditor(null)} disabled={savingUser}>Cancelar</button>
              <button type="button" style={styles.primaryButton} onClick={() => void saveUserProfile()} disabled={savingUser}>{savingUser ? "Guardando…" : userEditor.mode === "create" ? "Crear perfil" : "Guardar cambios"}</button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}

function TransactionTable({
  title,
  records,
  onCorrect,
}: {
  title: string;
  records: AdminTransaction[];
  onCorrect: (record: AdminTransaction) => void;
}) {
  return (
    <>
      <div style={styles.panelHeader}>
        <div><h2 style={{ margin: 0, fontSize: 19 }}>{title} de todas las empresas</h2><p style={{ ...styles.subtitle, marginTop: 5 }}>Las correcciones están disponibles solo para el Administrador global.</p></div>
        <span style={styles.muted}>{records.length} registros en la selección</span>
      </div>
      <div style={styles.tableWrap}><table style={styles.table}>
        <thead><tr><th style={styles.th}>Fecha</th><th style={styles.th}>Empresa</th><th style={styles.th}>Código</th><th style={styles.th}>{title === "Compras" ? "Proveedor" : "Cliente"}</th><th style={styles.th}>Productos</th><th style={styles.th}>Total actual</th><th style={styles.th}>Pago</th><th style={styles.th}>Estado</th><th style={styles.th}>Acción</th></tr></thead>
        <tbody>{records.map((record) => {
          const items = list(record.data.items);
          const itemSummary = items.map((item) => `${str(item.productName, str(item.productCode, str(item.productId)))} × ${num(item.quantity)}`).join(", ");
          const counterparty = record.entityType === "purchase" ? str(record.data.supplier, "—") : str(record.data.customer, "—");
          const active = isActive(record.data);
          return <tr key={`${record.associationId}:${record.id}`}>
            <td style={styles.td}>{dateLabel(record.data)}</td><td style={styles.td}>{record.associationName}</td><td style={styles.td}><strong>{str(record.data.code, record.id)}</strong><div style={styles.muted}>ID: {record.id}</div></td><td style={styles.td}>{counterparty}</td><td style={{ ...styles.td, minWidth: 170, maxWidth: 270 }}>{itemSummary || "—"}</td><td style={styles.td}><strong>{money(record.data.total)}</strong></td><td style={styles.td}>{paymentLabel(record.data.paymentMethod)}</td><td style={styles.td}><span style={statusBadge(active)}>{active ? "Activa" : "Cancelada"}</span></td><td style={styles.td}><button type="button" style={styles.primaryButton} disabled={!active} onClick={() => onCorrect(record)}>Corregir</button></td>
          </tr>;
        })}{records.length === 0 && <tr><td style={styles.td} colSpan={9}><div style={styles.empty}>No hay {title.toLocaleLowerCase("es-HN")} para los filtros seleccionados.</div></td></tr>}</tbody>
      </table></div>
      <p style={{ ...styles.muted, margin: "14px 0 0" }}>Al corregir, el mismo identificador de la operación se conserva. La versión anterior queda guardada en transactionCorrections y auditLogs; los movimientos y los registros de caja anteriores no se eliminan.</p>
    </>
  );
}
