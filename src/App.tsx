import React, { useMemo, useState } from "react";
import "./App.css";

type Product = {
  code: string;
  name: string;
  category: string;
  unit: string;
  stock: number;
  purchaseCostLb: number;
};

type Movement = {
  type: "Compra" | "Venta" | "Inventario inicial";
  date: string;
  code: string;
  product: string;
  qty: number;
  salePriceLb: number;
  purchaseCostLb: number;
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

export default function App() {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [mode, setMode] = useState<"Compra" | "Venta">("Venta");

  const [association, setAssociation] = useState("El Porvenir");
  const [code, setCode] = useState("");
  const [qty, setQty] = useState("");
  const [salePriceLb, setSalePriceLb] = useState("");
  const [purchaseCostLb, setPurchaseCostLb] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");

  const selected = products.find((p) => p.code === code.trim());

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const text = `${p.code} ${p.name}`.toLowerCase();
      return text.includes(search.toLowerCase()) && (category === "Todas" || p.category === category);
    });
  }, [products, search, category]);

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

  function clearForm() {
    setCode("");
    setQty("");
    setSalePriceLb("");
    setPurchaseCostLb("");
  }

  function saveMovement() {
    if (!selected) return alert("Ingrese un código válido.");

    const nQty = Number(qty);
    const nSalePriceLb = Number(salePriceLb);
    const nPurchaseCostLb = Number(purchaseCostLb || selected.purchaseCostLb);

    if (nQty <= 0) return alert("Ingrese una cantidad válida.");
    if (mode === "Venta" && nSalePriceLb <= 0) return alert("Ingrese el precio de venta por libra.");
    if (mode === "Compra" && nPurchaseCostLb <= 0) return alert("Ingrese el costo de compra por libra.");
    if (mode === "Venta" && nQty > selected.stock) return alert("No hay stock suficiente.");

    const movement: Movement = {
      type: mode,
      date: new Date().toISOString().slice(0, 10),
      code: selected.code,
      product: selected.name,
      qty: nQty,
      salePriceLb: mode === "Venta" ? nSalePriceLb : 0,
      purchaseCostLb: nPurchaseCostLb,
    };

    setMovements([movement, ...movements]);

    setProducts(
      products.map((p) => {
        if (p.code !== selected.code) return p;

        return {
          ...p,
          stock: mode === "Compra" ? p.stock + nQty : p.stock - nQty,
          purchaseCostLb: mode === "Compra" && nPurchaseCostLb > 0 ? nPurchaseCostLb : p.purchaseCostLb,
        };
      })
    );

    clearForm();
  }

  function updateProduct(code: string, field: "stock" | "purchaseCostLb", value: string) {
    setProducts(products.map((p) => (p.code === code ? { ...p, [field]: Number(value || 0) } : p)));
  }

  function addInitialInventory() {
    const productCode = prompt("Ingrese el código del producto:");
    if (!productCode) return;

    const product = products.find((p) => p.code === productCode.trim());
    if (!product) return alert("Código no encontrado.");

    const stockValue = Number(prompt("Ingrese la cantidad en libras:") || 0);
    const costValue = Number(prompt("Ingrese el costo de compra por libra:") || 0);

    if (stockValue <= 0) return alert("Cantidad no válida.");

    setProducts(
      products.map((p) =>
        p.code === product.code
          ? { ...p, stock: p.stock + stockValue, purchaseCostLb: costValue || p.purchaseCostLb }
          : p
      )
    );

    setMovements([
      {
        type: "Inventario inicial",
        date: new Date().toISOString().slice(0, 10),
        code: product.code,
        product: product.name,
        qty: stockValue,
        salePriceLb: 0,
        purchaseCostLb: costValue || product.purchaseCostLb,
      },
      ...movements,
    ]);
  }

  function addProduct() {
    const name = prompt("Nombre del nuevo producto:");
    if (!name) return;

    const productCategory = prompt("Categoría: Pescado, Marisco, Filete o Congelado") || "Pescado";
    const code = String(products.length + 1).padStart(3, "0");

    setProducts([
      ...products,
      {
        code,
        name,
        category: productCategory,
        unit: "Libra",
        stock: 0,
        purchaseCostLb: 0,
      },
    ]);
  }

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">🐟</div>
          <div>
            <h2>Control de ventas</h2>
            <p>Sistema contable e inventario</p>
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
          <h3>Resumen del día</h3>
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
            <label>Asociación actual</label>
            <input
              value={association}
              onChange={(e) => setAssociation(e.target.value)}
              placeholder="Escriba el nombre de la asociación"
            />
          </div>
        </header>

        <section className="metricGrid">
          <div className="metric"><span>🛒</span><div><small>Ventas</small><strong>{money(totalSales)}</strong></div></div>
          <div className="metric"><span>🧾</span><div><small>Compras</small><strong>{money(totalPurchases)}</strong></div></div>
          <div className="metric"><span>⚖️</span><div><small>Libras vendidas</small><strong>{soldLb.toLocaleString("es-HN")} lb</strong></div></div>
          <div className="metric"><span>📊</span><div><small>Utilidad</small><strong className={profit < 0 ? "negative" : ""}>{money(profit)}</strong></div></div>
          <div className="metric"><span>📦</span><div><small>Inventario</small><strong>{money(inventoryValue)}</strong></div></div>
        </section>

        <section className="mainGrid">
          <div id="movimiento">
            <div className="panel movementPanel">
              <h2>Nuevo movimiento</h2>

              <div className="tabs">
                <button className={mode === "Venta" ? "active" : ""} onClick={() => setMode("Venta")}>Venta</button>
                <button className={mode === "Compra" ? "active" : ""} onClick={() => setMode("Compra")}>Compra</button>
              </div>

              <label>Código del artículo</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej. 010" />

              <div className="productBox">
                <small>Producto detectado</small>
                <h3>{selected ? selected.name : "Ingrese código válido"}</h3>
                <p>Categoría: {selected?.category || "-"} | Unidad: {selected?.unit || "-"}</p>
                <p>Stock disponible: {selected?.stock || 0} lb</p>
                <p>Costo de compra: {money(selected?.purchaseCostLb || 0)} / lb</p>
              </div>

              <div className="fieldGrid twoColumns">
                <div>
                  <label>Cantidad en libras</label>
                  <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
                </div>

                {mode === "Venta" ? (
                  <div>
                    <label>Precio por libra</label>
                    <input type="number" value={salePriceLb} onChange={(e) => setSalePriceLb(e.target.value)} placeholder="0.00" />
                  </div>
                ) : (
                  <div>
                    <label>Costo de compra por libra</label>
                    <input type="number" value={purchaseCostLb} onChange={(e) => setPurchaseCostLb(e.target.value)} placeholder="0.00" />
                  </div>
                )}
              </div>

              <div className="resultGrid">
                <div>
                  <small>Total ingreso / compra</small>
                  <strong>
                    {money(
                      Number(qty || 0) *
                        (mode === "Venta" ? Number(salePriceLb || 0) : Number(purchaseCostLb || 0))
                    )}
                  </strong>
                </div>
                <div>
                  <small>Utilidad estimada</small>
                  <strong>
                    {mode === "Venta"
                      ? money(Number(qty || 0) * (Number(salePriceLb || 0) - Number(selected?.purchaseCostLb || 0)))
                      : money(0)}
                  </strong>
                </div>
              </div>

              <button className="saveBtn" onClick={saveMovement}>Guardar movimiento</button>
            </div>

            <div className="panel smallPanel">
              <h3>Inventario y productos</h3>
              <p>Agregue stock inicial o registre nuevos productos.</p>
              <div className="miniActions">
                <button onClick={addInitialInventory}>+ Agregar inventario</button>
                <button onClick={addProduct}>+ Nuevo producto</button>
              </div>
            </div>
          </div>

          <div className="panel inventoryPanel" id="inventario">
            <div className="panelHeader">
              <h2>Inventario actual</h2>
              <button>Exportar</button>
            </div>

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
                        <input
                          className="tableInput"
                          type="number"
                          value={p.stock}
                          onChange={(e) => updateProduct(p.code, "stock", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="tableInput"
                          type="number"
                          value={p.purchaseCostLb}
                          onChange={(e) => updateProduct(p.code, "purchaseCostLb", e.target.value)}
                        />
                      </td>
                      <td>{money(p.stock * p.purchaseCostLb)}</td>
                      <td>
                        <span className={p.stock <= 2 ? "low" : "ok"}>
                          {p.stock <= 2 ? "Bajo" : "Disponible"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="panel movementsPanel" id="reportes">
          <h2>Últimos movimientos</h2>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th>Artículo</th>
                  <th>Libras</th>
                  <th>Precio venta / lb</th>
                  <th>Costo compra / lb</th>
                  <th>Total</th>
                  <th>Utilidad</th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty">Aún no hay movimientos registrados.</td>
                  </tr>
                ) : (
                  movements.map((m, i) => (
                    <tr key={i}>
                      <td>{m.type}</td>
                      <td>{m.date}</td>
                      <td>{m.product}</td>
                      <td>{m.qty.toLocaleString("es-HN")} lb</td>
                      <td>{m.type === "Venta" ? `${money(m.salePriceLb)} / lb` : "-"}</td>
                      <td>{money(m.purchaseCostLb)} / lb</td>
                      <td>
                        {m.type === "Venta"
                          ? money(m.qty * m.salePriceLb)
                          : money(m.qty * m.purchaseCostLb)}
                      </td>
                      <td>
                        {m.type === "Venta"
                          ? money(m.qty * (m.salePriceLb - m.purchaseCostLb))
                          : "-"}
                      </td>
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