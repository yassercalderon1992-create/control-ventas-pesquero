import { useEffect, useMemo, useState } from "react";
import "./App.css";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { auth, db } from "./firebase";

type Product = {
  code: string;
  name: string;
  category: string;
  unit: string;
  stock: number;
  purchaseCostLb: number;
  associationId?: string;
  associationName?: string;
  lastSalePriceLb?: number;
};

type Supplier = {
  name: string;
  community: string;
};

type Expense = {
  id?: string;
  date: string;
  concept: string;
  amount: number;
  associationId: string;
  associationName: string;
  userEmail: string;
  supplierName?: string;
  supplierCommunity?: string;
  notes?: string;
};

type CashEntry = {
  id?: string;
  date: string;
  openingBalance: number;
  income: number;
  expense: number;
  closingBalance: number;
  associationId: string;
  associationName: string;
  userEmail: string;
  supplierName?: string;
  supplierCommunity?: string;
};

type Movement = {
  id?: string;
  type: "Compra" | "Venta" | "Inventario inicial";
  date: string;
  code: string;
  product: string;
  qty: number;
  salePriceLb: number;
  purchaseCostLb: number;
  associationId: string;
  associationName: string;
  userEmail: string;
  supplierName?: string;
  supplierCommunity?: string;
};

type UserProfile = {
  email: string;
  role: "Administrador" | "Vendedor" | "Consulta";
  associationId: string;
  associationName: string;
  active?: boolean;
};

type Association = {
  id: string;
  name: string;
  municipality?: string;
  department?: string;
  active?: boolean;
};

const initialProducts: Product[] = [
  { code: "001", name: "Yalatel", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "002", name: "Calale", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "003", name: "Pargo rojo", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "004", name: "Culila", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "005", name: "Camarón jumbo limpio", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "006", name: "Camarón mixto grande limpio", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "007", name: "Camarón seco", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "008", name: "Langosta entera", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "009", name: "Cola de langosta", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "010", name: "Caracol", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "011", name: "Filete de pescado", category: "Filete", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "012", name: "Macarela", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "013", name: "Robalo", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "014", name: "Corvina", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "015", name: "Mero", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "016", name: "Guapote", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "017", name: "Tilapia", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "018", name: "Sardina", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "019", name: "Lisa", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "020", name: "Jurel", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "021", name: "Bonito", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "022", name: "Atún", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "023", name: "Barracuda", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "024", name: "Wawanka", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "025", name: "Jaiba", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "026", name: "Cangrejo", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "027", name: "Pulpo", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "028", name: "Calamar", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "029", name: "Mixto de mariscos", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "030", name: "Pescado seco salado", category: "Congelado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "031", name: "Mojarra", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "032", name: "Mojarra roja", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "033", name: "Mojarra negra", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "034", name: "Bagre", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "035", name: "Bacalao", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "036", name: "Dorado", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "037", name: "Pez vela", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "038", name: "Marlín", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "039", name: "Pez espada", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "040", name: "Cazón", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "041", name: "Chillo", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "042", name: "Sábalo", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "043", name: "Burrito", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "044", name: "Guabina", category: "Pescado", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "045", name: "Vieira", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "046", name: "Ostión", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "047", name: "Almeja", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "048", name: "Concha negra", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "049", name: "Pepino de mar", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
  { code: "050", name: "Medusa", category: "Marisco", unit: "Libra", stock: 0, purchaseCostLb: 0 },
];

function money(value: number) {
  return `L ${Number(value || 0).toLocaleString("es-HN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function todayDate() {
  return new Date().toISOString().split("T")[0];
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}


function BarChart({
  title,
  data,
  valueLabel = money,
}: {
  title: string;
  data: { label: string; value: number }[];
  valueLabel?: (value: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="chartCard">
      <h3>{title}</h3>
      {data.length === 0 ? (
        <p className="empty">Sin datos para mostrar.</p>
      ) : (
        <div className="barChart">
          {data.slice(0, 10).map((item) => (
            <div className="barItem" key={item.label}>
              <div className="barLabel">{item.label}</div>
              <div className="barTrack">
                <div className="barFill" style={{ width: `${Math.max((item.value / max) * 100, 4)}%` }} />
              </div>
              <div className="barValue">{valueLabel(item.value)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [associations, setAssociations] = useState<Association[]>([]);

  const [selectedAssociationId, setSelectedAssociationId] = useState("todas");
  const [association, setAssociation] = useState("Todas las asociaciones");

  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashEntries, setCashEntries] = useState<CashEntry[]>([]);

  const [loginUser, setLoginUser] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [mode, setMode] = useState<"Compra" | "Venta">("Venta");
  const [movementDate, setMovementDate] = useState(todayDate());
  const [reportStartDate, setReportStartDate] = useState(todayDate());
  const [reportEndDate, setReportEndDate] = useState(todayDate());

  const [code, setCode] = useState("");
  const [qty, setQty] = useState("");
  const [salePriceLb, setSalePriceLb] = useState("");
  const [purchaseCostLb, setPurchaseCostLb] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierCommunity, setSupplierCommunity] = useState("");
  const [expenseConcept, setExpenseConcept] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [cashOpening, setCashOpening] = useState("");
  const [cashIncome, setCashIncome] = useState("");
  const [cashExpense, setCashExpense] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");

  const isAdmin = currentUser?.role === "Administrador";
  const selected = products.find((p) => p.code === code);

  function getAssociationName(id: string) {
    return associations.find((a) => a.id === id)?.name || id;
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user?.email) {
        setCurrentUser(null);
        setLoadingUser(false);
        return;
      }

      try {
        const userProfileSnap = await getDoc(doc(db, "users", user.email));

        if (!userProfileSnap.exists()) {
          setLoginError("Este usuario no tiene perfil configurado en Firestore.");
          await signOut(auth);
          setCurrentUser(null);
          setLoadingUser(false);
          return;
        }

        const profile = userProfileSnap.data() as UserProfile;

        if (profile.active === false) {
          setLoginError("Este usuario está inactivo. Contacte al administrador.");
          await signOut(auth);
          setCurrentUser(null);
          setLoadingUser(false);
          return;
        }

        setCurrentUser(profile);

        if (profile.role === "Administrador") {
          setSelectedAssociationId("todas");
          setAssociation("Todas las asociaciones");
        } else {
          setSelectedAssociationId(profile.associationId);
          setAssociation(profile.associationName);
        }
      } catch (error) {
        console.error(error);
        setLoginError("No se pudo cargar el perfil del usuario desde Firestore.");
        await signOut(auth);
        setCurrentUser(null);
      } finally {
        setLoadingUser(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setAssociations([]);
      return;
    }

    const ref = collection(db, "associations");

    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Association, "id">),
      }));

      setAssociations(data.filter((a) => a.active !== false).sort((a, b) => a.name.localeCompare(b.name)));
    });

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    if (selectedAssociationId === "todas") {
      setProducts([]);
      return;
    }

    const ref = collection(db, "associations", selectedAssociationId, "products");

    async function seedProducts() {
      const snap = await getDocs(ref);

      if (snap.empty) {
        await Promise.all(
          initialProducts.map((p) =>
            setDoc(doc(db, "associations", selectedAssociationId, "products", p.code), { ...p, associationId: selectedAssociationId, associationName: getAssociationName(selectedAssociationId) })
          )
        );
      }
    }

    seedProducts();

    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const data = snapshot.docs.map((d) => d.data() as Product);
      setProducts(data.sort((a, b) => a.code.localeCompare(b.code)));
    });

    return () => unsubscribe();
  }, [currentUser, selectedAssociationId]);

  useEffect(() => {
    if (!currentUser) return;

    if (isAdmin && selectedAssociationId === "todas") {
      const ref = collectionGroup(db, "movements");

      const unsubscribe = onSnapshot(ref, (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Movement),
        }));

        setMovements(data.sort((a, b) => b.date.localeCompare(a.date)));
      });

      return () => unsubscribe();
    }

    const ref = collection(db, "associations", selectedAssociationId, "movements");

    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Movement),
      }));

      setMovements(data.sort((a, b) => b.date.localeCompare(a.date)));
    });

    return () => unsubscribe();
  }, [currentUser, selectedAssociationId, isAdmin]);

  useEffect(() => {
    if (!currentUser || !isAdmin) {
      setAllProducts([]);
      return;
    }

    const ref = collectionGroup(db, "products");

    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const data = snapshot.docs.map((d) => {
        const product = d.data() as Product;
        const associationId = product.associationId || d.ref.parent.parent?.id || "";
        return {
          ...product,
          associationId,
          associationName: product.associationName || getAssociationName(associationId),
        };
      });

      setAllProducts(data.sort((a, b) => `${a.associationName}-${a.code}`.localeCompare(`${b.associationName}-${b.code}`)));
    });

    return () => unsubscribe();
  }, [currentUser, isAdmin]);

  useEffect(() => {
    if (!currentUser) return;

    if (isAdmin && selectedAssociationId === "todas") {
      const expensesRef = collectionGroup(db, "expenses");
      const cashRef = collectionGroup(db, "cashbox");

      const unsubExpenses = onSnapshot(expensesRef, (snapshot) => {
        setExpenses(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Expense) })).sort((a, b) => b.date.localeCompare(a.date)));
      });

      const unsubCash = onSnapshot(cashRef, (snapshot) => {
        setCashEntries(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as CashEntry) })).sort((a, b) => b.date.localeCompare(a.date)));
      });

      return () => {
        unsubExpenses();
        unsubCash();
      };
    }

    const expensesRef = collection(db, "associations", selectedAssociationId, "expenses");
    const cashRef = collection(db, "associations", selectedAssociationId, "cashbox");

    const unsubExpenses = onSnapshot(expensesRef, (snapshot) => {
      setExpenses(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Expense) })).sort((a, b) => b.date.localeCompare(a.date)));
    });

    const unsubCash = onSnapshot(cashRef, (snapshot) => {
      setCashEntries(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as CashEntry) })).sort((a, b) => b.date.localeCompare(a.date)));
    });

    return () => {
      unsubExpenses();
      unsubCash();
    };
  }, [currentUser, selectedAssociationId, isAdmin]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const text = `${p.code} ${p.name}`.toLowerCase();
      return text.includes(search.toLowerCase()) && (category === "Todas" || p.category === category);
    });
  }, [products, search, category]);

  const reportMovements = useMemo(() => {
    return movements.filter((m) => m.date >= reportStartDate && m.date <= reportEndDate);
  }, [movements, reportStartDate, reportEndDate]);

  const totalSales = movements
    .filter((m) => m.type === "Venta")
    .reduce((s, m) => s + m.qty * m.salePriceLb, 0);

  const totalPurchases = movements
    .filter((m) => m.type === "Compra")
    .reduce((s, m) => s + m.qty * m.purchaseCostLb, 0);

  const soldLb = movements
    .filter((m) => m.type === "Venta")
    .reduce((s, m) => s + m.qty, 0);

  const profit = movements
    .filter((m) => m.type === "Venta")
    .reduce((s, m) => s + m.qty * (m.salePriceLb - m.purchaseCostLb), 0);

  const inventoryValue = products.reduce((s, p) => s + p.stock * p.purchaseCostLb, 0);

  const reportSales = reportMovements
    .filter((m) => m.type === "Venta")
    .reduce((s, m) => s + m.qty * m.salePriceLb, 0);

  const reportPurchases = reportMovements
    .filter((m) => m.type === "Compra")
    .reduce((s, m) => s + m.qty * m.purchaseCostLb, 0);

  const reportSoldLb = reportMovements
    .filter((m) => m.type === "Venta")
    .reduce((s, m) => s + m.qty, 0);

  const reportProfit = reportMovements
    .filter((m) => m.type === "Venta")
    .reduce((s, m) => s + m.qty * (m.salePriceLb - m.purchaseCostLb), 0);

  const reportExpenses = expenses
    .filter((e) => e.date >= reportStartDate && e.date <= reportEndDate)
    .reduce((s, e) => s + e.amount, 0);

  const netProfitAfterExpenses = reportProfit - reportExpenses;

  const adminSummary = useMemo(() => {
    const byAssociation = new Map<string, { sales: number; purchases: number; profit: number; soldLb: number; inventory: number }>();
    const byProduct = new Map<string, { sales: number; profit: number; soldLb: number }>();
    const visibleProducts = selectedAssociationId === "todas"
      ? allProducts
      : allProducts.filter((p) => p.associationId === selectedAssociationId);

    movements.forEach((m) => {
      const key = m.associationName || getAssociationName(m.associationId);
      const current = byAssociation.get(key) || { sales: 0, purchases: 0, profit: 0, soldLb: 0, inventory: 0 };

      if (m.type === "Venta") {
        current.sales += m.qty * m.salePriceLb;
        current.profit += m.qty * (m.salePriceLb - m.purchaseCostLb);
        current.soldLb += m.qty;

        const prod = byProduct.get(m.product) || { sales: 0, profit: 0, soldLb: 0 };
        prod.sales += m.qty * m.salePriceLb;
        prod.profit += m.qty * (m.salePriceLb - m.purchaseCostLb);
        prod.soldLb += m.qty;
        byProduct.set(m.product, prod);
      }

      if (m.type === "Compra") current.purchases += m.qty * m.purchaseCostLb;
      byAssociation.set(key, current);
    });

    visibleProducts.forEach((p) => {
      const key = p.associationName || getAssociationName(p.associationId || "");
      const current = byAssociation.get(key) || { sales: 0, purchases: 0, profit: 0, soldLb: 0, inventory: 0 };
      current.inventory += p.stock * p.purchaseCostLb;
      byAssociation.set(key, current);
    });

    return {
      salesByAssociation: Array.from(byAssociation.entries()).map(([label, value]) => ({ label, value: value.sales })).sort((a, b) => b.value - a.value),
      profitByAssociation: Array.from(byAssociation.entries()).map(([label, value]) => ({ label, value: value.profit })).sort((a, b) => b.value - a.value),
      inventoryByAssociation: Array.from(byAssociation.entries()).map(([label, value]) => ({ label, value: value.inventory })).sort((a, b) => b.value - a.value),
      soldLbByProduct: Array.from(byProduct.entries()).map(([label, value]) => ({ label, value: value.soldLb })).sort((a, b) => b.value - a.value),
    };
  }, [movements, allProducts, selectedAssociationId, associations]);

  const productPerformance = useMemo(() => {
    const map = new Map<string, { product: string; qty: number; profit: number }>();

    movements
      .filter((m) => m.type === "Venta")
      .forEach((m) => {
        const current = map.get(m.code) || { product: m.product, qty: 0, profit: 0 };
        current.qty += m.qty;
        current.profit += m.qty * (m.salePriceLb - m.purchaseCostLb);
        map.set(m.code, current);
      });

    const data = Array.from(map.values());

    return {
      mostSold: [...data].sort((a, b) => b.qty - a.qty)[0],
      mostProfitable: [...data].sort((a, b) => b.profit - a.profit)[0],
    };
  }, [movements]);

  async function login() {
    try {
      setLoginError("");
      await signInWithEmailAndPassword(auth, loginUser, loginPassword);
      setLoginUser("");
      setLoginPassword("");
    } catch {
      setLoginError("Correo o contraseña incorrectos.");
    }
  }

  async function logout() {
    await signOut(auth);
    setCurrentUser(null);
    setProducts([]);
    setMovements([]);
  }

  function clearForm() {
    setCode("");
    setQty("");
    setSalePriceLb("");
    setPurchaseCostLb("");
    setSupplierName("");
    setSupplierCommunity("");
    setMovementDate(todayDate());
  }

  async function saveMovement() {
    if (selectedAssociationId === "todas") return alert("Seleccione una asociación específica.");
    if (!selected) return alert("Seleccione un producto válido.");

    const nQty = Number(qty);
    const nSalePriceLb = Number(salePriceLb);
    const nPurchaseCostLb = Number(purchaseCostLb || selected.purchaseCostLb);

    if (nQty <= 0) return alert("Ingrese una cantidad válida.");
    if (!movementDate) return alert("Seleccione una fecha.");
    if (mode === "Venta" && nSalePriceLb <= 0) return alert("Ingrese el precio de venta por libra.");
    if (mode === "Compra" && nPurchaseCostLb <= 0) return alert("Ingrese el costo de compra por libra.");
    if (mode === "Venta" && nQty > selected.stock) return alert("No hay stock suficiente.");

    const associationName = getAssociationName(selectedAssociationId);
    const newStock = mode === "Compra" ? selected.stock + nQty : selected.stock - nQty;

    const movement: Movement = {
      type: mode,
      date: movementDate,
      code: selected.code,
      product: selected.name,
      qty: nQty,
      salePriceLb: mode === "Venta" ? nSalePriceLb : 0,
      purchaseCostLb: nPurchaseCostLb,
      associationId: selectedAssociationId,
      associationName,
      userEmail: currentUser?.email || "",
      supplierName: mode === "Compra" ? supplierName : "",
      supplierCommunity: mode === "Compra" ? supplierCommunity : "",
    };

    await addDoc(collection(db, "associations", selectedAssociationId, "movements"), {
      ...movement,
      createdAt: serverTimestamp(),
    });

    await setDoc(
      doc(db, "associations", selectedAssociationId, "products", selected.code),
      {
        ...selected,
        stock: newStock,
        purchaseCostLb: mode === "Compra" ? nPurchaseCostLb : selected.purchaseCostLb,
        lastSalePriceLb: mode === "Venta" ? nSalePriceLb : selected.lastSalePriceLb || 0,
        associationId: selectedAssociationId,
        associationName,
      },
      { merge: true }
    );

    clearForm();
  }


  async function saveExpense() {
    if (selectedAssociationId === "todas") return alert("Seleccione una asociación específica.");
    if (!expenseConcept) return alert("Ingrese el concepto del gasto.");

    const amount = Number(expenseAmount);
    if (amount <= 0) return alert("Ingrese un monto válido.");

    const associationName = getAssociationName(selectedAssociationId);

    await addDoc(collection(db, "associations", selectedAssociationId, "expenses"), {
      date: movementDate,
      concept: expenseConcept,
      amount,
      associationId: selectedAssociationId,
      associationName,
      userEmail: currentUser?.email || "",
      createdAt: serverTimestamp(),
    });

    setExpenseConcept("");
    setExpenseAmount("");
  }

  async function saveCashEntry() {
    if (selectedAssociationId === "todas") return alert("Seleccione una asociación específica.");

    const openingBalance = Number(cashOpening || 0);
    const income = Number(cashIncome || 0);
    const expense = Number(cashExpense || 0);
    const closingBalance = openingBalance + income - expense;
    const associationName = getAssociationName(selectedAssociationId);

    await addDoc(collection(db, "associations", selectedAssociationId, "cashbox"), {
      date: movementDate,
      openingBalance,
      income,
      expense,
      closingBalance,
      associationId: selectedAssociationId,
      associationName,
      userEmail: currentUser?.email || "",
      createdAt: serverTimestamp(),
    });

    setCashOpening("");
    setCashIncome("");
    setCashExpense("");
  }

  async function updateProduct(productCode: string, field: "stock" | "purchaseCostLb", value: string) {
    if (selectedAssociationId === "todas") return;

    const product = products.find((p) => p.code === productCode);
    if (!product) return;

    await setDoc(
      doc(db, "associations", selectedAssociationId, "products", productCode),
      {
        ...product,
        [field]: Number(value || 0),
      },
      { merge: true }
    );
  }

  async function addProduct() {
    if (selectedAssociationId === "todas") return alert("Seleccione una asociación específica.");

    const name = prompt("Nombre del nuevo producto:");
    if (!name) return;

    const productCategory = prompt("Categoría: Pescado, Marisco, Filete o Congelado") || "Pescado";
    const newCode = String(products.length + 1).padStart(3, "0");

    const product: Product = {
      code: newCode,
      name,
      category: productCategory,
      unit: "Libra",
      stock: 0,
      purchaseCostLb: 0,
    };

    await setDoc(doc(db, "associations", selectedAssociationId, "products", newCode), product);
  }

  function setReportToday() {
    setReportStartDate(todayDate());
    setReportEndDate(todayDate());
  }

  function setReportWeek() {
    setReportStartDate(addDays(-7));
    setReportEndDate(todayDate());
  }

  function setReportMonth() {
    const date = new Date();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split("T")[0];
    setReportStartDate(firstDay);
    setReportEndDate(todayDate());
  }

  function exportReportCSV() {
    const headers = [
      "Asociacion",
      "Usuario",
      "Tipo",
      "Fecha",
      "Codigo",
      "Articulo",
      "Libras",
      "Precio venta por libra",
      "Costo compra por libra",
      "Total",
      "Utilidad",
    ];

    const rows = reportMovements.map((m) => {
      const total = m.type === "Venta" ? m.qty * m.salePriceLb : m.qty * m.purchaseCostLb;
      const utility = m.type === "Venta" ? m.qty * (m.salePriceLb - m.purchaseCostLb) : 0;

      return [
        m.associationName || association,
        m.userEmail || "",
        m.type,
        m.date,
        m.code,
        m.product,
        m.qty,
        m.salePriceLb,
        m.purchaseCostLb,
        total,
        utility,
      ];
    });

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `reporte_${association}_${reportStartDate}_a_${reportEndDate}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }



  function exportReportExcel() {
    const headers = ["Asociación", "Usuario", "Tipo", "Fecha", "Código", "Artículo", "Libras", "Precio venta/lb", "Costo compra/lb", "Total", "Utilidad"];
    const rows = reportMovements.map((m) => {
      const total = m.type === "Venta" ? m.qty * m.salePriceLb : m.qty * m.purchaseCostLb;
      const utility = m.type === "Venta" ? m.qty * (m.salePriceLb - m.purchaseCostLb) : 0;
      return [m.associationName || association, m.userEmail || "", m.type, m.date, m.code, m.product, m.qty, m.salePriceLb, m.purchaseCostLb, total, utility];
    });

    const table = `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
      .map((row) => `<tr>${row.map((cell) => `<td>${String(cell).replace(/</g, "&lt;")}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;

    const blob = new Blob([`﻿<html><body>${table}</body></html>`], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte_${association}_${reportStartDate}_a_${reportEndDate}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loadingUser) {
    return (
      <main className="loginPage">
        <section className="loginCard">
          <h1>Cargando...</h1>
        </section>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="loginPage">
        <section className="loginCard">
          <div className="loginLogo">🐟</div>
          <h1>Control de ventas</h1>
          <p>Sistema pesquero comunitario</p>

          <label>Correo</label>
          <input
            value={loginUser}
            onChange={(e) => setLoginUser(e.target.value)}
            placeholder="pescadores@pesca.com"
          />

          <label>Contraseña</label>
          <input
            type="password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            placeholder="Contraseña"
          />

          {loginError && <div className="loginError">{loginError}</div>}

          <button className="saveBtn" onClick={login}>
            Ingresar
          </button>

          <div className="loginHelp">
            <b>Usuarios configurados en Firestore:</b>
            <p>admin@pesca.com / usuarios por empresa</p>
          </div>
        </section>
      </main>
    );
  }

  if (isAdmin) {
    const visibleAdminProducts = selectedAssociationId === "todas"
      ? allProducts
      : allProducts.filter((p) => p.associationId === selectedAssociationId);

    const visibleAssociationsCount = selectedAssociationId === "todas" ? associations.length : 1;
    const inventoryGlobalValue = visibleAdminProducts.reduce((sum, p) => sum + p.stock * p.purchaseCostLb, 0);
    const avgProfitMargin = totalSales > 0 ? (profit / totalSales) * 100 : 0;

    return (
      <main className="appShell executiveShell">
        <aside className="sidebar executiveSidebar">
          <div className="brand">
            <div className="logo">📊</div>
            <div>
              <h2>Centro de Inteligencia</h2>
              <p>{association}</p>
            </div>
          </div>

          <nav>
            <a className="active" href="#executive">Dashboard Ejecutivo</a>
            <a href="#companies">Empresas</a>
            <a href="#charts">Gráficas</a>
            <a href="#inventoryExecutive">Inventario general</a>
            <a href="#reportsExecutive">Reportes</a>
          </nav>

          <div className="daySummary">
            <h3>Usuario</h3>
            <p>Cuenta <b>{currentUser.email}</b></p>
            <p>Rol <b>{currentUser.role}</b></p>
            <button className="logoutBtn" onClick={logout}>Cerrar sesión</button>
          </div>

          <div className="daySummary">
            <h3>Lectura ejecutiva</h3>
            <p>Empresas <b>{visibleAssociationsCount}</b></p>
            <p>Ventas <b>{money(totalSales)}</b></p>
            <p>Utilidad <b>{money(profit)}</b></p>
          </div>
        </aside>

        <section className="content executiveContent" id="executive">
          <header className="topBar executiveTopBar">
            <div>
              <h1>Dashboard Ejecutivo</h1>
              <p>Vista consolidada para análisis, seguimiento y toma de decisiones.</p>
            </div>

            <div className="associationBox">
              <label>Filtrar empresa</label>
              <select
                value={selectedAssociationId}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedAssociationId(value);
                  setAssociation(value === "todas" ? "Todas las asociaciones" : getAssociationName(value));
                }}
              >
                <option value="todas">Todas las asociaciones</option>
                {associations.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </header>

          <section className="metricGrid executiveMetricGrid">
            <div className="metric"><span>🏢</span><div><small>Empresas activas</small><strong>{visibleAssociationsCount}</strong></div></div>
            <div className="metric"><span>🛒</span><div><small>Ventas</small><strong>{money(totalSales)}</strong></div></div>
            <div className="metric"><span>🧾</span><div><small>Compras</small><strong>{money(totalPurchases)}</strong></div></div>
            <div className="metric"><span>💰</span><div><small>Utilidad bruta</small><strong>{money(profit)}</strong></div></div>
            <div className="metric"><span>📦</span><div><small>Inventario valorizado</small><strong>{money(inventoryGlobalValue)}</strong></div></div>
            <div className="metric"><span>⚖️</span><div><small>Libras vendidas</small><strong>{soldLb.toLocaleString("es-HN")} lb</strong></div></div>
          </section>

          <section className="insightGrid executiveInsightGrid">
            <div className="insightCard">
              <span>🏆</span>
              <div>
                <small>Producto más vendido</small>
                <strong>{productPerformance.mostSold?.product || "Sin ventas"}</strong>
                <p>{productPerformance.mostSold?.qty || 0} lb vendidas</p>
              </div>
            </div>

            <div className="insightCard">
              <span>📈</span>
              <div>
                <small>Margen de utilidad global</small>
                <strong>{avgProfitMargin.toFixed(1)}%</strong>
                <p>Utilidad bruta sobre ventas registradas</p>
              </div>
            </div>
          </section>

          <section className="panel" id="companies">
            <div className="panelHeader">
              <div>
                <h2>Empresas registradas</h2>
                <p>Listado dinámico desde Firestore.</p>
              </div>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Municipio</th>
                    <th>Departamento</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {associations.length === 0 ? (
                    <tr><td colSpan={4} className="empty">No hay empresas registradas.</td></tr>
                  ) : (
                    associations.map((a) => (
                      <tr key={a.id}>
                        <td>{a.name}</td>
                        <td>{a.municipality || "-"}</td>
                        <td>{a.department || "-"}</td>
                        <td><span className="ok">Activa</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="chartGrid" id="charts">
            <BarChart title="Ventas por empresa" data={adminSummary.salesByAssociation} />
            <BarChart title="Utilidad por empresa" data={adminSummary.profitByAssociation} />
            <BarChart title="Inventario valorizado por empresa" data={adminSummary.inventoryByAssociation} />
            <BarChart title="Libras vendidas por producto" data={adminSummary.soldLbByProduct} valueLabel={(v) => `${v.toLocaleString("es-HN")} lb`} />
          </section>

          <section className="panel" id="inventoryExecutive">
            <div className="panelHeader">
              <div>
                <h2>Inventario, precios y stock por empresa</h2>
                <p>Consolidado de productos cargados en todas las empresas.</p>
              </div>
              <button onClick={exportReportExcel}>Exportar reporte</button>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th>Stock</th>
                    <th>Costo compra/lb</th>
                    <th>Último precio venta/lb</th>
                    <th>Valor inventario</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAdminProducts.length === 0 ? (
                    <tr><td colSpan={8} className="empty">No hay productos para mostrar.</td></tr>
                  ) : (
                    visibleAdminProducts.map((p) => (
                      <tr key={`${p.associationId}-${p.code}`}>
                        <td>{p.associationName || getAssociationName(p.associationId || "")}</td>
                        <td>{p.code}</td>
                        <td>{p.name}</td>
                        <td>{p.category}</td>
                        <td>{p.stock} lb</td>
                        <td>{money(p.purchaseCostLb)}</td>
                        <td>{money(p.lastSalePriceLb || 0)}</td>
                        <td>{money(p.stock * p.purchaseCostLb)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel movementsPanel" id="reportsExecutive">
            <div className="panelHeader">
              <div>
                <h2>Reportes ejecutivos por fecha</h2>
                <p>Filtra el período para revisar ventas, compras y utilidad.</p>
              </div>
              <div className="reportActions">
                <button onClick={exportReportCSV}>Exportar CSV</button>
                <button onClick={exportReportExcel}>Exportar Excel</button>
              </div>
            </div>

            <div className="reportFilters">
              <div>
                <label>Fecha inicio</label>
                <input type="date" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} />
              </div>

              <div>
                <label>Fecha fin</label>
                <input type="date" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} />
              </div>

              <div className="reportActions">
                <button onClick={setReportToday}>Hoy</button>
                <button onClick={setReportWeek}>Últimos 7 días</button>
                <button onClick={setReportMonth}>Este mes</button>
              </div>
            </div>

            <section className="metricGrid reportMetricGrid">
              <div className="metric"><span>🛒</span><div><small>Ventas período</small><strong>{money(reportSales)}</strong></div></div>
              <div className="metric"><span>🧾</span><div><small>Compras período</small><strong>{money(reportPurchases)}</strong></div></div>
              <div className="metric"><span>⚖️</span><div><small>Libras vendidas</small><strong>{reportSoldLb.toLocaleString("es-HN")} lb</strong></div></div>
              <div className="metric"><span>📊</span><div><small>Utilidad período</small><strong>{money(reportProfit)}</strong></div></div>
              <div className="metric"><span>⛽</span><div><small>Gastos período</small><strong>{money(reportExpenses)}</strong></div></div>
              <div className="metric"><span>✅</span><div><small>Utilidad neta</small><strong>{money(netProfitAfterExpenses)}</strong></div></div>
            </section>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Asociación</th>
                    <th>Tipo</th>
                    <th>Fecha</th>
                    <th>Artículo</th>
                    <th>Libras</th>
                    <th>Total</th>
                    <th>Utilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {reportMovements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty">No hay movimientos en el período seleccionado.</td>
                    </tr>
                  ) : (
                    reportMovements.map((m) => (
                      <tr key={m.id}>
                        <td>{m.associationName}</td>
                        <td>{m.type}</td>
                        <td>{m.date}</td>
                        <td>{m.product}</td>
                        <td>{m.qty} lb</td>
                        <td>{m.type === "Venta" ? money(m.qty * m.salePriceLb) : money(m.qty * m.purchaseCostLb)}</td>
                        <td>{m.type === "Venta" ? money(m.qty * (m.salePriceLb - m.purchaseCostLb)) : "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">🐟</div>
          <div>
            <h2>Control de ventas</h2>
            <p>{association}</p>
          </div>
        </div>

        <nav>
          <a className="active" href="#dashboard">Dashboard</a>
          <a href="#movimiento">Ventas / Compras</a>
          <a href="#inventario">Inventario</a>
          <a href="#reportes">Reportes</a>
          {isAdmin && <a href="#admin">Panel administrador</a>}
          <a href="#asociacion">Asociación</a>
        </nav>

        <div className="daySummary">
          <h3>Usuario</h3>
          <p>Cuenta <b>{currentUser.email}</b></p>
          <p>Rol <b>{currentUser.role}</b></p>
          <button className="logoutBtn" onClick={logout}>Cerrar sesión</button>
        </div>

        <div className="daySummary">
          <h3>Resumen general</h3>
          <p>Ventas <b>{money(totalSales)}</b></p>
          <p>Compras <b>{money(totalPurchases)}</b></p>
          <p>Libras vendidas <b>{soldLb.toLocaleString("es-HN")} lb</b></p>
          <p>Utilidad <b className={profit < 0 ? "negative" : ""}>{money(profit)}</b></p>
          <p>Inventario <b>{money(inventoryValue)}</b></p>
        </div>
      </aside>

      <section className="content" id="dashboard">
        <header className="topBar" id="asociacion">
          <div>
            <h1>Control de ventas</h1>
            <p>Compras, ventas, inventario, caja diaria y reportes.</p>
          </div>

          <div className="associationBox">
            <label>{isAdmin ? "Vista administrador" : "Asociación actual"}</label>

            {isAdmin ? (
              <select
                value={selectedAssociationId}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedAssociationId(value);
                  setAssociation(value === "todas" ? "Todas las asociaciones" : getAssociationName(value));
                }}
              >
                <option value="todas">Todas las asociaciones</option>
                {associations.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            ) : (
              <input value={association} disabled />
            )}
          </div>
        </header>

        <section className="metricGrid">
          <div className="metric"><span>🛒</span><div><small>Ventas</small><strong>{money(totalSales)}</strong></div></div>
          <div className="metric"><span>🧾</span><div><small>Compras</small><strong>{money(totalPurchases)}</strong></div></div>
          <div className="metric"><span>⚖️</span><div><small>Libras vendidas</small><strong>{soldLb.toLocaleString("es-HN")} lb</strong></div></div>
          <div className="metric"><span>📊</span><div><small>Utilidad</small><strong>{money(profit)}</strong></div></div>
          <div className="metric"><span>📦</span><div><small>Inventario</small><strong>{money(inventoryValue)}</strong></div></div>
        </section>

        <section className="insightGrid">
          <div className="insightCard">
            <span>🏆</span>
            <div>
              <small>Producto más vendido</small>
              <strong>{productPerformance.mostSold?.product || "Sin ventas"}</strong>
              <p>{productPerformance.mostSold?.qty || 0} lb vendidas</p>
            </div>
          </div>

          <div className="insightCard">
            <span>💰</span>
            <div>
              <small>Mayor margen de utilidad</small>
              <strong>{productPerformance.mostProfitable?.product || "Sin ventas"}</strong>
              <p>{money(productPerformance.mostProfitable?.profit || 0)}</p>
            </div>
          </div>
        </section>

        <section className="mainGrid">
          <div id="movimiento">
            <div className="panel movementPanel">
              <h2>Nuevo movimiento</h2>

              <div className="tabs">
                <button className={mode === "Venta" ? "active" : ""} onClick={() => setMode("Venta")}>Venta</button>
                <button className={mode === "Compra" ? "active" : ""} onClick={() => setMode("Compra")}>Compra</button>
              </div>

              <div className="movementFormGrid">
                <div>
                  <label>Fecha</label>
                  <input type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} />
                </div>

                <div>
                  <label>Artículo</label>
                  <select value={code} onChange={(e) => setCode(e.target.value)}>
                    <option value="">Seleccione producto</option>
                    {products.map((p) => (
                      <option key={p.code} value={p.code}>{p.code} - {p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Cantidad en libras</label>
                  <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
                </div>

                <div>
                  <label>{mode === "Venta" ? "Precio por libra" : "Costo compra por libra"}</label>
                  <input
                    type="number"
                    value={mode === "Venta" ? salePriceLb : purchaseCostLb}
                    onChange={(e) =>
                      mode === "Venta" ? setSalePriceLb(e.target.value) : setPurchaseCostLb(e.target.value)
                    }
                  />
                </div>

                {mode === "Compra" && (
                  <>
                    <div>
                      <label>Pescador / proveedor</label>
                      <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Nombre del proveedor" />
                    </div>

                    <div>
                      <label>Comunidad</label>
                      <input value={supplierCommunity} onChange={(e) => setSupplierCommunity(e.target.value)} placeholder="Comunidad de origen" />
                    </div>
                  </>
                )}
              </div>

              <div className="productBox">
                <small>Producto detectado</small>
                <h3>{selected?.name || "Seleccione un producto"}</h3>
                <p>Stock disponible: {selected?.stock || 0} lb</p>
                <p>Costo compra: {money(selected?.purchaseCostLb || 0)} / lb</p>
              </div>

              <div className="resultGrid">
                <div>
                  <small>Total</small>
                  <strong>{money(Number(qty || 0) * (mode === "Venta" ? Number(salePriceLb || 0) : Number(purchaseCostLb || 0)))}</strong>
                </div>
                <div>
                  <small>Utilidad estimada</small>
                  <strong>{mode === "Venta" ? money(Number(qty || 0) * (Number(salePriceLb || 0) - Number(selected?.purchaseCostLb || 0))) : money(0)}</strong>
                </div>
              </div>

              <button className="saveBtn" onClick={saveMovement}>Guardar movimiento</button>
            </div>

            <div className="panel smallPanel">
              <h3>Inventario y productos</h3>
              <p>Registre nuevos productos cuando sea necesario.</p>
              <div className="miniActions oneButton">
                <button onClick={addProduct}>+ Nuevo producto</button>
              </div>
            </div>

            <div className="panel smallPanel">
              <h3>Gastos operativos</h3>
              <p>Registre hielo, combustible, transporte, alimentación u otros costos.</p>
              <input value={expenseConcept} onChange={(e) => setExpenseConcept(e.target.value)} placeholder="Concepto del gasto" />
              <input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} placeholder="Monto en Lempiras" />
              <div className="miniActions oneButton">
                <button onClick={saveExpense}>Guardar gasto</button>
              </div>
            </div>

            <div className="panel smallPanel">
              <h3>Caja diaria</h3>
              <p>Control simple de apertura, ingresos, egresos y cierre.</p>
              <input type="number" value={cashOpening} onChange={(e) => setCashOpening(e.target.value)} placeholder="Saldo inicial" />
              <input type="number" value={cashIncome} onChange={(e) => setCashIncome(e.target.value)} placeholder="Ingresos" />
              <input type="number" value={cashExpense} onChange={(e) => setCashExpense(e.target.value)} placeholder="Egresos" />
              <div className="miniActions oneButton">
                <button onClick={saveCashEntry}>Guardar caja</button>
              </div>
            </div>
          </div>

          <div className="panel inventoryPanel" id="inventario">
            <div className="panelHeader">
              <h2>Inventario actual</h2>
              <button onClick={exportReportCSV}>Exportar</button>
            </div>

            {selectedAssociationId === "todas" ? (
              <p className="empty">Seleccione una asociación específica para ver inventario.</p>
            ) : (
              <>
                <div className="filters">
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto o código..." />
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option>Todas</option>
                    <option>Pescado</option>
                    <option>Marisco</option>
                    <option>Filete</option>
                    <option>Congelado</option>
                  </select>
                </div>

                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Artículo</th>
                        <th>Categoría</th>
                        <th>Unidad</th>
                        <th>Stock disponible</th>
                        <th>Costo compra / lb</th>
                        <th>Valor inventario</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p) => (
                        <tr key={p.code}>
                          <td>{p.code}</td>
                          <td>{p.name}</td>
                          <td><span className={`badge ${p.category}`}>{p.category}</span></td>
                          <td>{p.unit}</td>
                          <td>
                            <input className="tableInput" type="number" value={p.stock} onChange={(e) => updateProduct(p.code, "stock", e.target.value)} />
                          </td>
                          <td>
                            <input className="tableInput" type="number" value={p.purchaseCostLb} onChange={(e) => updateProduct(p.code, "purchaseCostLb", e.target.value)} />
                          </td>
                          <td>{money(p.stock * p.purchaseCostLb)}</td>
                          <td>
                            <span className={p.stock === 0 ? "emptyStock" : p.stock < 5 ? "low" : "ok"}>
                              {p.stock === 0 ? "Inexistente" : p.stock < 5 ? "Bajo" : "Disponible"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>


        {isAdmin && (
          <section className="panel adminPanel" id="admin">
            <div className="panelHeader">
              <div>
                <h2>Panel administrador</h2>
                <p>Vista consolidada de todas las empresas/asociaciones que usan el sistema.</p>
              </div>
              <button onClick={exportReportExcel}>Exportar consolidado</button>
            </div>

            <section className="metricGrid reportMetricGrid">
              <div className="metric"><span>🏢</span><div><small>Empresas</small><strong>{new Set(allProducts.map((p) => p.associationId)).size}</strong></div></div>
              <div className="metric"><span>📦</span><div><small>Productos cargados</small><strong>{allProducts.length}</strong></div></div>
              <div className="metric"><span>🛒</span><div><small>Ventas globales</small><strong>{money(totalSales)}</strong></div></div>
              <div className="metric"><span>💰</span><div><small>Utilidad global</small><strong>{money(profit)}</strong></div></div>
            </section>

            <section className="adminGrid">
              <BarChart title="Ventas por empresa" data={adminSummary.salesByAssociation} />
              <BarChart title="Utilidad por empresa" data={adminSummary.profitByAssociation} />
              <BarChart title="Inventario valorizado por empresa" data={adminSummary.inventoryByAssociation} />
              <BarChart title="Libras vendidas por producto" data={adminSummary.soldLbByProduct} valueLabel={(v) => `${v.toLocaleString("es-HN")} lb`} />
            </section>

            <h3>Productos, precios y stock por empresa</h3>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th>Stock</th>
                    <th>Costo compra/lb</th>
                    <th>Último precio venta/lb</th>
                    <th>Valor inventario</th>
                  </tr>
                </thead>
                <tbody>
                  {allProducts.map((p) => (
                    <tr key={`${p.associationId}-${p.code}`}>
                      <td>{p.associationName}</td>
                      <td>{p.code}</td>
                      <td>{p.name}</td>
                      <td>{p.category}</td>
                      <td>{p.stock} lb</td>
                      <td>{money(p.purchaseCostLb)}</td>
                      <td>{money(p.lastSalePriceLb || 0)}</td>
                      <td>{money(p.stock * p.purchaseCostLb)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="panel movementsPanel" id="reportes">
          <div className="panelHeader">
            <h2>Reportes por fecha</h2>
            <div className="reportActions">
              <button onClick={exportReportCSV}>Exportar CSV</button>
              <button onClick={exportReportExcel}>Exportar Excel</button>
            </div>
          </div>

          <div className="reportFilters">
            <div>
              <label>Fecha inicio</label>
              <input type="date" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} />
            </div>

            <div>
              <label>Fecha fin</label>
              <input type="date" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} />
            </div>

            <div className="reportActions">
              <button onClick={setReportToday}>Hoy</button>
              <button onClick={setReportWeek}>Últimos 7 días</button>
              <button onClick={setReportMonth}>Este mes</button>
            </div>
          </div>

          <section className="metricGrid reportMetricGrid">
            <div className="metric"><span>🛒</span><div><small>Ventas período</small><strong>{money(reportSales)}</strong></div></div>
            <div className="metric"><span>🧾</span><div><small>Compras período</small><strong>{money(reportPurchases)}</strong></div></div>
            <div className="metric"><span>⚖️</span><div><small>Libras vendidas</small><strong>{reportSoldLb.toLocaleString("es-HN")} lb</strong></div></div>
            <div className="metric"><span>📊</span><div><small>Utilidad período</small><strong>{money(reportProfit)}</strong></div></div>
            <div className="metric"><span>⛽</span><div><small>Gastos período</small><strong>{money(reportExpenses)}</strong></div></div>
            <div className="metric"><span>✅</span><div><small>Utilidad neta</small><strong>{money(netProfitAfterExpenses)}</strong></div></div>
          </section>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Asociación</th>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th>Artículo</th>
                  <th>Libras</th>
                  <th>Total</th>
                  <th>Utilidad</th>
                </tr>
              </thead>
              <tbody>
                {reportMovements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty">No hay movimientos en el período seleccionado.</td>
                  </tr>
                ) : (
                  reportMovements.map((m) => (
                    <tr key={m.id}>
                      <td>{m.associationName}</td>
                      <td>{m.type}</td>
                      <td>{m.date}</td>
                      <td>{m.product}</td>
                      <td>{m.qty} lb</td>
                      <td>{m.type === "Venta" ? money(m.qty * m.salePriceLb) : money(m.qty * m.purchaseCostLb)}</td>
                      <td>{m.type === "Venta" ? money(m.qty * (m.salePriceLb - m.purchaseCostLb)) : "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}