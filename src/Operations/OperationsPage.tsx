import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import {
  collection,
  getDocs,
} from "firebase/firestore";

import MainLayout from "../layout/MainLayout";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase/firestore";
import type { Product } from "../types/product";
import type { PurchaseRequest, SaleRequest } from "../types/dto";
import { purchaseService } from "../services/purchases/purchaseService";
import { salesService } from "../services/sales/salesService";

type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "CREDIT";
type SectionTab = "sales" | "purchases";
type TransactionRecord = Record<string, unknown> & { id: string };

interface AssociationOption {
  id: string;
  name: string;
}

interface DraftLine {
  productId: string;
  quantity: number;
  unitPrice: number;
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Efectivo" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "CARD", label: "Tarjeta" },
  { value: "CREDIT", label: "Crédito" },
];

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: 20, color: "#172033" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 },
  title: { margin: 0, fontSize: 28, fontWeight: 750 },
  subtitle: { margin: "7px 0 0", color: "#64748b", lineHeight: 1.5 },
  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20, minWidth: 0 },
  selectorRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 },
  label: { display: "grid", gap: 7, fontSize: 13, color: "#475569", fontWeight: 650 },
  input: { width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 7, padding: "11px 12px", color: "#0f172a", background: "#fff", fontSize: 14, fontWeight: 400 },
  tabs: { display: "flex", gap: 8, flexWrap: "wrap" },
  tab: { border: "1px solid #cbd5e1", background: "#fff", color: "#334155", borderRadius: 7, padding: "10px 15px", cursor: "pointer", fontWeight: 700 },
  activeTab: { borderColor: "#1d4ed8", background: "#1d4ed8", color: "#fff" },
  primary: { border: 0, borderRadius: 7, background: "#2563eb", color: "#fff", padding: "11px 16px", fontWeight: 700, cursor: "pointer" },
  secondary: { border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", color: "#334155", padding: "9px 12px", fontWeight: 650, cursor: "pointer" },
  danger: { border: "1px solid #fecaca", borderRadius: 7, background: "#fff", color: "#b91c1c", padding: "8px 10px", fontWeight: 650, cursor: "pointer" },
  tableWrap: { overflowX: "auto", width: "100%" },
  table: { width: "100%", minWidth: 760, borderCollapse: "collapse", textAlign: "left" },
  th: { padding: "12px 10px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569", fontSize: 12, whiteSpace: "nowrap" },
  td: { padding: "13px 10px", borderBottom: "1px solid #e2e8f0", fontSize: 13, verticalAlign: "middle" },
  badge: { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "#dcfce7", color: "#166534", fontSize: 11, fontWeight: 700 },
  error: { padding: 13, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 8, lineHeight: 1.5 },
  notice: { padding: 13, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af", borderRadius: 8, lineHeight: 1.5 },
  muted: { color: "#64748b", fontSize: 13 },
  lineGrid: { display: "grid", gridTemplateColumns: "minmax(220px, 2fr) repeat(2, minmax(115px, 1fr)) auto", gap: 10, alignItems: "end" },
  total: { fontSize: 24, fontWeight: 800, color: "#0f172a" },
};

function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numericValue(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function money(value: number): string {
  return new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: "HNL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function getRecordDate(record: TransactionRecord): number {
  const transactionDate = record.transactionDate;
  if (typeof transactionDate === "string") {
    const parsed = Date.parse(transactionDate);
    if (Number.isFinite(parsed)) return parsed;
  }
  const createdAt = record.createdAt;
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt === "string") {
    const parsed = Date.parse(createdAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (createdAt && typeof createdAt === "object" && "toMillis" in createdAt) {
    const toMillis = (createdAt as { toMillis?: () => number }).toMillis;
    if (typeof toMillis === "function") {
      const parsed = toMillis();
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function displayDate(record: TransactionRecord): string {
  const millis = getRecordDate(record);
  return millis ? new Date(millis).toLocaleString("es-HN") : "—";
}

function displayStatus(record: TransactionRecord): string {
  const status = textValue(record.status, "ACTIVE").toUpperCase();
  if (status === "CANCELLED" || status === "CANCELED") return "Cancelada";
  if (status === "INACTIVE") return "Inactiva";
  return "Activa";
}

function isCanceled(record: TransactionRecord): boolean {
  const status = textValue(record.status, "ACTIVE").toUpperCase();
  return status === "CANCELLED" || status === "CANCELED" || status === "INACTIVE";
}

function newLine(): DraftLine {
  return { productId: "", quantity: 1, unitPrice: 0 };
}

export default function OperationsPage() {
  const { user, loading: authLoading } = useAuth();
  const isGlobalAdmin = user?.role === "Administrador" && user.active === true && user.associationId.trim().toLowerCase() === "todas";
  const canRegister = Boolean(user && user.active && (user.role === "Administrador" || user.role === "Vendedor"));

  const [activeTab, setActiveTab] = useState<SectionTab>("sales");
  const [associations, setAssociations] = useState<AssociationOption[]>([]);
  const [associationId, setAssociationId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<TransactionRecord[]>([]);
  const [purchases, setPurchases] = useState<TransactionRecord[]>([]);
  const [items, setItems] = useState<DraftLine[]>([newLine()]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [customer, setCustomer] = useState("");
  const [supplier, setSupplier] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [loadingAssociations, setLoadingAssociations] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
              name: textValue(document.data().name, document.id),
            }))
            .sort((a, b) => a.name.localeCompare(b.name, "es-HN"));
        } else {
          options = user.associationId && user.associationId !== "todas"
            ? [{ id: user.associationId, name: user.associationName || user.associationId }]
            : [];
        }

        if (mounted) {
          setAssociations(options);
          setAssociationId((current) =>
            options.some((option) => option.id === current)
              ? current
              : (options[0]?.id ?? "")
          );
        }
      } catch (loadError: unknown) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las empresas.");
        }
      } finally {
        if (mounted) setLoadingAssociations(false);
      }
    }

    void loadAssociations();
    return () => { mounted = false; };
  }, [authLoading, user, isGlobalAdmin]);

  const loadCompanyData = useCallback(async () => {
    if (!associationId || !user?.active) {
      setProducts([]);
      setSales([]);
      setPurchases([]);
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    setError("");
    try {
      const base = ["associations", associationId] as const;
      const [productSnapshot, saleSnapshot, purchaseSnapshot] = await Promise.all([
        getDocs(collection(db, ...base, "products")),
        getDocs(collection(db, ...base, "sales")),
        getDocs(collection(db, ...base, "purchases")),
      ]);

      const loadedProducts = productSnapshot.docs.map((document) => ({
        ...(document.data() as Omit<Product, "id">),
        id: document.id,
      } as Product)).filter((product) => product.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name, "es-HN"));

      const loadedSales = saleSnapshot.docs.map((document) => ({
        ...document.data(), id: document.id,
      } as TransactionRecord)).sort((a, b) => getRecordDate(b) - getRecordDate(a));

      const loadedPurchases = purchaseSnapshot.docs.map((document) => ({
        ...document.data(), id: document.id,
      } as TransactionRecord)).sort((a, b) => getRecordDate(b) - getRecordDate(a));

      setProducts(loadedProducts);
      setSales(loadedSales);
      setPurchases(loadedPurchases);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los datos de la empresa.");
    } finally {
      setLoadingData(false);
    }
  }, [associationId, user?.active]);

  useEffect(() => {
    void loadCompanyData();
  }, [loadCompanyData]);

  const total = useMemo(() => items.reduce((sum, item) => sum + Math.max(0, numericValue(item.quantity)) * Math.max(0, numericValue(item.unitPrice)), 0), [items]);
  const records = activeTab === "sales" ? sales : purchases;
  const filteredRecords = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-HN");
    if (!term) return records;
    return records.filter((record) => {
      const text = [
        record.id,
        record.code,
        record.customer,
        record.supplier,
        record.invoiceNumber,
        record.createdBy,
        record.status,
      ].map((value) => typeof value === "string" ? value : "").join(" ").toLocaleLowerCase("es-HN");
      return text.includes(term);
    });
  }, [records, search]);

  function changeLine(index: number, changes: Partial<DraftLine>) {
    setItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...changes } : line));
  }

  function changeProduct(index: number, productId: string) {
    const duplicate = items.some((line, lineIndex) => lineIndex !== index && line.productId === productId && productId !== "");
    if (duplicate) {
      setError("El producto ya está en otra línea. Cambia la cantidad en la línea existente.");
      return;
    }
    const product = products.find((candidate) => candidate.id === productId);
    const defaultPrice = activeTab === "purchases"
      ? numericValue(product?.purchaseCostLb)
      : numericValue(product?.lastSalePriceLb);
    changeLine(index, { productId, unitPrice: defaultPrice });
    setError("");
  }

  function resetForm() {
    setItems([newLine()]);
    setPaymentMethod("CASH");
    setCustomer("");
    setSupplier("");
    setInvoiceNumber("");
    setNotes("");
  }

  async function submitOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.email || !user.active) {
      setError("No hay una sesión activa válida.");
      return;
    }
    if (!canRegister) {
      setError("Tu rol tiene permiso de consulta, pero no puede registrar operaciones.");
      return;
    }
    if (!associationId) {
      setError("Selecciona una empresa antes de registrar la operación.");
      return;
    }
    const validItems = items.filter((item) => item.productId);
    if (!validItems.length) {
      setError("Agrega al menos un producto.");
      return;
    }
    if (validItems.length !== items.length) {
      setError("Selecciona un producto en cada línea o elimina las líneas vacías.");
      return;
    }
    if (new Set(validItems.map((item) => item.productId)).size !== validItems.length) {
      setError("No repitas el mismo producto en varias líneas.");
      return;
    }
    if (validItems.some((item) => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) <= 0)) {
      setError("Las cantidades y los precios unitarios deben ser mayores que cero.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (activeTab === "purchases") {
        const request: PurchaseRequest = {
          associationId,
          supplier: supplier.trim() || undefined,
          invoiceNumber: invoiceNumber.trim() || undefined,
          paymentMethod,
          notes: notes.trim() || undefined,
          createdBy: user.email,
          items: validItems.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
          })),
        };
        const result = await purchaseService.createPurchase(request);
        setNotice(`Compra ${result.code} registrada por ${money(result.total)}.`);
      } else {
        const request: SaleRequest = {
          associationId,
          customer: customer.trim() || undefined,
          paymentMethod,
          notes: notes.trim() || undefined,
          createdBy: user.email,
          items: validItems.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
          })),
        };
        const result = await salesService.createSale(request);
        setNotice(`Venta ${result.code} registrada por ${money(result.total)}.`);
      }
      resetForm();
      await loadCompanyData();
    } catch (saveError: unknown) {
      console.error("No se pudo registrar la operación:", saveError);
      setError(saveError instanceof Error ? saveError.message : "No se pudo registrar la operación.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return <MainLayout><p>Cargando sesión...</p></MainLayout>;
  }

  if (!user || !user.active) {
    return <MainLayout><h1>Acceso restringido</h1><p>Inicia sesión con un perfil activo para continuar.</p></MainLayout>;
  }

  return (
    <MainLayout>
      <div style={styles.page}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Ventas y compras</h1>
            <p style={styles.subtitle}>Registra operaciones y consulta el historial de la empresa seleccionada.</p>
          </div>
          <button type="button" style={styles.secondary} onClick={() => void loadCompanyData()} disabled={loadingData}>
            {loadingData ? "Actualizando..." : "Actualizar datos"}
          </button>
        </header>

        <section style={styles.panel}>
          <div style={styles.selectorRow}>
            <label style={styles.label}>
              Empresa
              {isGlobalAdmin ? (
                <select style={styles.input} value={associationId} onChange={(event) => setAssociationId(event.target.value)} disabled={loadingAssociations || associations.length === 0}>
                  {associations.map((association) => <option key={association.id} value={association.id}>{association.name}</option>)}
                </select>
              ) : (
                <input style={styles.input} value={user.associationName || user.associationId} readOnly />
              )}
            </label>
            <div style={{ ...styles.notice, display: "flex", alignItems: "center", margin: 0 }}>
              {canRegister
                ? "Las compras y ventas actualizan automáticamente el stock, los movimientos y caja cuando el pago no es a crédito. No registres un segundo movimiento manual para la misma operación."
                : "Tu perfil puede consultar el historial, pero no registrar operaciones."}
            </div>
          </div>
        </section>

        {error && <div role="alert" style={styles.error}>{error}</div>}
        {notice && <div role="status" style={styles.notice}>{notice}</div>}

        <div style={styles.tabs}>
          <button type="button" style={{ ...styles.tab, ...(activeTab === "sales" ? styles.activeTab : {}) }} onClick={() => { setActiveTab("sales"); setItems([newLine()]); setSearch(""); setError(""); setNotice(""); }}>
            Registrar / consultar ventas ({sales.length})
          </button>
          <button type="button" style={{ ...styles.tab, ...(activeTab === "purchases" ? styles.activeTab : {}) }} onClick={() => { setActiveTab("purchases"); setItems([newLine()]); setSearch(""); setError(""); setNotice(""); }}>
            Registrar / consultar compras ({purchases.length})
          </button>
        </div>

        <section style={styles.panel}>
          <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>{activeTab === "sales" ? "Nueva venta" : "Nueva compra"}</h2>
          <p style={{ ...styles.muted, marginTop: 0, marginBottom: 18 }}>
            {activeTab === "sales" ? "El sistema no permitirá vender cantidades superiores al stock disponible." : "El sistema actualizará las existencias y el costo promedio de compra."}
          </p>

          {!canRegister && <div style={styles.notice}>Modo de consulta: tu rol no permite guardar ventas ni compras.</div>}

          <form onSubmit={(event) => void submitOperation(event)} style={{ display: "grid", gap: 18 }}>
            <div style={styles.selectorRow}>
              {activeTab === "sales" ? (
                <label style={styles.label}>Cliente (opcional)<input style={styles.input} value={customer} onChange={(event) => setCustomer(event.target.value)} maxLength={120} disabled={!canRegister || saving} placeholder="Nombre del cliente" /></label>
              ) : (
                <>
                  <label style={styles.label}>Proveedor (opcional)<input style={styles.input} value={supplier} onChange={(event) => setSupplier(event.target.value)} maxLength={120} disabled={!canRegister || saving} placeholder="Nombre del proveedor" /></label>
                  <label style={styles.label}>Número de factura (opcional)<input style={styles.input} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} maxLength={80} disabled={!canRegister || saving} placeholder="Factura o documento" /></label>
                </>
              )}
              <label style={styles.label}>Método de pago<select style={styles.input} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} disabled={!canRegister || saving}>{PAYMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label style={styles.label}>Notas (opcional)<input style={styles.input} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} disabled={!canRegister || saving} placeholder="Observaciones" /></label>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {items.map((item, index) => {
                const product = products.find((candidate) => candidate.id === item.productId);
                return (
                  <div key={`line-${index}`} style={styles.lineGrid}>
                    <label style={styles.label}>Producto
                      <select style={styles.input} value={item.productId} onChange={(event) => changeProduct(index, event.target.value)} disabled={!canRegister || saving || loadingData}>
                        <option value="">Seleccionar producto...</option>
                        {products.map((candidate) => {
                          const alreadyChosen = items.some((line, lineIndex) => lineIndex !== index && line.productId === candidate.id);
                          return <option key={candidate.id} value={candidate.id} disabled={alreadyChosen}>{candidate.code} — {candidate.name} (stock: {numericValue(candidate.stock)})</option>;
                        })}
                      </select>
                      {product && <small style={styles.muted}>Unidad: {product.unit || "—"} · Stock: {numericValue(product.stock)}</small>}
                    </label>
                    <label style={styles.label}>Cantidad<input style={styles.input} type="number" min="0.01" step="any" value={item.quantity} onChange={(event) => changeLine(index, { quantity: Number(event.target.value) })} disabled={!canRegister || saving} /></label>
                    <label style={styles.label}>{activeTab === "sales" ? "Precio unitario (L)" : "Costo unitario (L)"}<input style={styles.input} type="number" min="0.01" step="any" value={item.unitPrice} onChange={(event) => changeLine(index, { unitPrice: Number(event.target.value) })} disabled={!canRegister || saving} /></label>
                    <button type="button" style={styles.danger} onClick={() => setItems((current) => current.length <= 1 ? [newLine()] : current.filter((_, lineIndex) => lineIndex !== index))} disabled={!canRegister || saving || items.length === 1}>Quitar</button>
                  </div>
                );
              })}
              <div>
                <button type="button" style={styles.secondary} onClick={() => setItems((current) => [...current, newLine()])} disabled={!canRegister || saving || items.length >= 50}>+ Agregar producto</button>
                <span style={{ ...styles.muted, marginLeft: 12 }}>Máximo 50 líneas por operación.</span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
              <div><div style={styles.muted}>Total calculado</div><div style={styles.total}>{money(total)}</div></div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" style={styles.secondary} onClick={resetForm} disabled={!canRegister || saving}>Limpiar</button>
                <button type="submit" style={{ ...styles.primary, opacity: !canRegister || saving || loadingData || !associationId ? 0.55 : 1 }} disabled={!canRegister || saving || loadingData || !associationId}>
                  {saving ? "Guardando operación..." : activeTab === "sales" ? "Registrar venta" : "Registrar compra"}
                </button>
              </div>
            </div>
          </form>
        </section>

        <section style={styles.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: "0 0 5px", fontSize: 20 }}>Historial de {activeTab === "sales" ? "ventas" : "compras"}</h2>
              <p style={{ ...styles.muted, margin: 0 }}>Empresa: {(associations.find((association) => association.id === associationId)?.name ?? associationId) || "—"}</p>
            </div>
            <input style={{ ...styles.input, maxWidth: 320 }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar código, cliente/proveedor..." aria-label="Buscar operaciones" />
          </div>

          {loadingAssociations || loadingData ? <p style={styles.muted}>Cargando operaciones...</p> : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead><tr><th style={styles.th}>Fecha</th><th style={styles.th}>Código</th><th style={styles.th}>{activeTab === "sales" ? "Cliente" : "Proveedor"}</th><th style={styles.th}>Artículos</th><th style={styles.th}>Pago</th><th style={styles.th}>Total</th><th style={styles.th}>Estado</th></tr></thead>
                <tbody>
                  {filteredRecords.map((record) => {
                    const lineItems = Array.isArray(record.items) ? record.items : [];
                    return <tr key={record.id}>
                      <td style={styles.td}>{displayDate(record)}</td>
                      <td style={styles.td}><strong>{textValue(record.code, record.id)}</strong></td>
                      <td style={styles.td}>{activeTab === "sales" ? textValue(record.customer, "—") : textValue(record.supplier, "—")}</td>
                      <td style={styles.td}>{lineItems.length}</td>
                      <td style={styles.td}>{PAYMENT_OPTIONS.find((option) => option.value === record.paymentMethod)?.label ?? textValue(record.paymentMethod, "—")}</td>
                      <td style={styles.td}>{money(numericValue(record.total))}</td>
                      <td style={styles.td}>{isCanceled(record) ? <span style={{ ...styles.badge, background: "#fee2e2", color: "#991b1b" }}>{displayStatus(record)}</span> : <span style={styles.badge}>{displayStatus(record)}</span>}</td>
                    </tr>;
                  })}
                  {filteredRecords.length === 0 && <tr><td style={styles.td} colSpan={7}><div style={{ textAlign: "center", padding: 24, color: "#64748b" }}>{search ? "No se encontraron operaciones con esa búsqueda." : `Todavía no hay ${activeTab === "sales" ? "ventas" : "compras"} registradas en esta empresa.`}</div></td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </MainLayout>
  );
}