import MainLayout from "../layout/MainLayout";

import { useProducts } from "./useProducts";

export default function InventoryPage() {

  const { products, loading } = useProducts();

  return (

    <MainLayout>

      <h1>Inventario</h1>

      <br />

      {loading ? (

        <p>Cargando productos...</p>

      ) : (

        <table width="100%" cellPadding={8}>

          <thead>

            <tr>

              <th>Producto</th>
              <th>Categoría</th>
              <th>Stock</th>
              <th>Compra</th>
              <th>Venta</th>

            </tr>

          </thead>

          <tbody>

            {products.map((product) => (

              <tr key={product.id}>

                <td>{product.name}</td>

                <td>{product.category}</td>

                <td>

                  {product.stock}

                  {product.stock <= product.stockMinimo && (

                    <span style={{ color: "red", marginLeft: 10 }}>
                      ⚠ Bajo Stock
                    </span>

                  )}

                </td>

                <td>L. {product.purchasePrice}</td>

                <td>L. {product.salePrice}</td>

              </tr>

            ))}

          </tbody>

        </table>

      )}

    </MainLayout>

  );

}