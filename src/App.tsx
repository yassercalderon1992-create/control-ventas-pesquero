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
};

type UserProfile = {
  email: string;
  role: "Administrador" | "Vendedor" | "Consulta";
  associationId: string;
  associationName: string;
};

const ASSOCIATIONS = [
  { id: "elporvenir", name: "El Porvenir" },
  { id: "pescadores", name: "Asociación Los Pescadores" },
];

const USER_PROFILES: Record<string, UserProfile> = {
  "admin@pesca.com": {
    email: "admin@pesca.com",
    role: "Administrador",
    associationId: "todas",
    associationName: "Todas las asociaciones",
  },
  "elporvenir@pesca.com": {
    email: "elporvenir@pesca.com",
    role: "Vendedor",
    associationId: "elporvenir",
    associationName: "El Porvenir",
  },
  "pescadores@pesca.com": {
    email: "pescadores@pesca.com",
    role: "Vendedor",
    associationId: "pescadores",
    associationName: "Asociación Los Pescadores",
  },
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

function getAssociationName(id: string) {
  return ASSOCIATIONS.find((a) => a.id === id)?.name || id;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [selectedAssociationId, setSelectedAssociationId] = useState("pescadores");
  const [association, setAssociation] = useState("Asociación Los Pescadores");

  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);

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
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");

  const isAdmin = currentUser?.role === "Administrador";
  const selected = products.find((p) => p.code === code);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user?.email) {
        setCurrentUser(null);
        setLoadingUser(false);
        return;
      }

      const profile =
        USER_PROFILES[user.email] || {
          email: user.email,
          role: "Vendedor",
          associationId: "pescadores",
          associationName: "Asociación Los Pescadores",
        };

      setCurrentUser(profile);

      if (profile.role === "Administrador") {
        setSelectedAssociationId("todas");
        setAssociation("Todas las asociaciones");
      } else {
        setSelectedAssociationId(profile.associationId);
        setAssociation(profile.associationName);
      }

      setLoadingUser(false);
    });

    return () => unsubscribe();
  }, []);

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
            setDoc(doc(db, "associations", selectedAssociationId, "products", p.code), p)
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
      },
      { merge: true }
    );

    clearForm();
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
            <b>Usuario disponible:</b>
            <p>pescadores@pesca.com</p>
          </div>
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
                {ASSOCIATIONS.map((a) => (
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

        <section className="panel movementsPanel" id="reportes">
          <div className="panelHeader">
            <h2>Reportes por fecha</h2>
            <button onClick={exportReportCSV}>Exportar Excel / CSV</button>
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