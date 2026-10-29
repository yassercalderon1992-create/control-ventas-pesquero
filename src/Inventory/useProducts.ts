
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  collection,
  getDocs,
} from "firebase/firestore";

import type { Product } from "../types/product";
import { db } from "../firebase/firestore";
import { productService } from "../services/inventory/productService";
import { useAuth } from "../contexts/AuthContext";

export function useProducts() {
  const { user, loading: authLoading } = useAuth();

  const associationId = user?.associationId?.trim() ?? "";
  const role = user?.role;
  const userActive = user?.active;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user) {
      setProducts([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (!associationId) {
      setProducts([]);
      setLoading(false);
      setError(
        "El usuario no tiene una asociación asignada."
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let loadedProducts: Product[];

      const isGlobalAdmin =
        role === "Administrador" &&
        associationId.toLowerCase() === "todas";

      if (associationId.toLowerCase() === "todas") {
        if (!isGlobalAdmin) {
          throw new Error(
            "Solo el administrador global puede consultar el inventario de todas las asociaciones."
          );
        }

        if (userActive !== true) {
          throw new Error(
            "El usuario está inactivo y no puede consultar el inventario."
          );
        }

        // Obtener los documentos de las asociaciones.
        const associationsSnapshot = await getDocs(
          collection(db, "associations")
        );

        const activeAssociations =
          associationsSnapshot.docs.filter(
            (document) =>
              document.id.trim().toLowerCase() !== "todas" &&
              document.data().active !== false
          );

        // Consultar cada inventario por separado.
        // Se conserva cada asociación como un ámbito independiente.
        const productGroups = await Promise.all(
          activeAssociations.map(async (association) => {
            const associationData = association.data();

            const associationName = String(
              associationData.associationName ??
                associationData.name ??
                associationData.nombre ??
                association.id
            );

            const associationProducts =
              await productService.getProducts(
                association.id
              );

            return associationProducts.map(
              (product): Product => ({
                ...product,

                // El documento que contiene el producto
                // determina su asociación en esta consulta.
                associationId: association.id,

                associationName:
                  product.associationName?.trim() ||
                  associationName,
              })
            );
          })
        );

        loadedProducts = productGroups
          .flat()
          .sort(
            (a, b) =>
              a.associationName.localeCompare(
                b.associationName
              ) || a.name.localeCompare(b.name)
          );
      } else {
        // Usuario normal: consultar solamente su asociación.
        loadedProducts = await productService.getProducts(
          associationId
        );
      }

      setProducts(loadedProducts);
    } catch (err: unknown) {
      console.error(
        "Error al cargar productos:",
        err
      );

      setProducts([]);

      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los productos."
      );
    } finally {
      setLoading(false);
    }
  }, [
    associationId,
    authLoading,
    role,
    userActive,
    user,
  ]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  return {
    products,
    loading: loading || authLoading,
    error,
    reload: loadProducts,
  };
}
