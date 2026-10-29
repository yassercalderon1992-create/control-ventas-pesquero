
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
  collection,
  getDocs,
} from "firebase/firestore";

import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase/firestore";
import { productService } from "../services/inventory/productService";
import { hasPermission } from "../models/permissions";

import type { Product } from "../types/product";

interface AssociationOption {
  id: string;
  name: string;
}

interface ProductFormProps {
  onSaved?: () => void | Promise<void>;
}

export default function ProductForm({
  onSaved,
}: ProductFormProps) {
  const { user, loading: authLoading } = useAuth();

  const [associations, setAssociations] = useState<
    AssociationOption[]
  >([]);

  const [selectedAssociationId, setSelectedAssociationId] =
    useState("");

  const [loadingAssociations, setLoadingAssociations] =
    useState(false);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("lb");
  const [stockMinimo, setStockMinimo] = useState(10);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const associationId = user?.associationId?.trim() ?? "";

  const isAllAssociations =
    associationId.toLowerCase() === "todas";

  const canManageInventory =
    user?.active === true &&
    hasPermission(user.role, "inventory:manage");

  /**
   * Cargar las asociaciones disponibles para el
   * administrador global.
   */
  useEffect(() => {
    let active = true;

    async function loadAssociations() {
      if (
        authLoading ||
        !user ||
        user.active !== true ||
        !isAllAssociations ||
        !hasPermission(user.role, "inventory:manage")
      ) {
        setAssociations([]);
        setLoadingAssociations(false);
        return;
      }

      setLoadingAssociations(true);

      try {
        const snapshot = await getDocs(
          collection(db, "associations")
        );

        const options = snapshot.docs
          .filter(
            (document) =>
              document.data().active !== false
          )
          .map((document) => {
            const data = document.data();

            return {
              id: document.id,
              name: String(
                data.associationName ??
                  data.name ??
                  data.nombre ??
                  document.id
              ),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        if (active) {
          setAssociations(options);

          setSelectedAssociationId((current) => {
            if (
              current &&
              options.some((item) => item.id === current)
            ) {
              return current;
            }

            return options[0]?.id ?? "";
          });
        }
      } catch (err: unknown) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudieron consultar las asociaciones."
          );
        }
      } finally {
        if (active) {
          setLoadingAssociations(false);
        }
      }
    }

    void loadAssociations();

    return () => {
      active = false;
    };
  }, [authLoading, user, isAllAssociations]);

  /**
   * Crear el producto con stock inicial cero.
   * El catálogo se recarga una vez guardado.
   */
  async function guardarProducto(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!user) {
      setError(
        "Debes iniciar sesión antes de guardar productos."
      );
      return;
    }

    if (user.active !== true) {
      setError(
        "Tu usuario está inactivo. Contacta al administrador."
      );
      return;
    }

    if (!canManageInventory) {
      setError(
        "No tienes permiso para administrar productos."
      );
      return;
    }

    const targetAssociationId = isAllAssociations
      ? selectedAssociationId.trim()
      : associationId;

    if (!targetAssociationId) {
      setError("Debes seleccionar una asociación válida.");
      return;
    }

    if (
      isAllAssociations &&
      !associations.some(
        (association) => association.id === targetAssociationId
      )
    ) {
      setError(
        "La asociación seleccionada no está disponible. Actualiza la página e inténtalo nuevamente."
      );
      return;
    }

    const targetAssociationName = isAllAssociations
      ? associations.find(
          (item) => item.id === targetAssociationId
        )?.name ?? ""
      : user.associationName;

    if (!targetAssociationName?.trim()) {
      setError(
        "No se encontró el nombre de la asociación seleccionada."
      );
      return;
    }

    if (
      !code.trim() ||
      !name.trim() ||
      !category.trim() ||
      !unit.trim()
    ) {
      setError(
        "Completa el código, nombre, categoría y unidad del producto."
      );
      return;
    }

    if (
      !Number.isFinite(stockMinimo) ||
      stockMinimo < 0
    ) {
      setError(
        "El stock mínimo debe ser un número igual o mayor que cero."
      );
      return;
    }

    const product: Product = {
      code: code.trim(),
      name: name.trim(),
      category: category.trim(),
      unit: unit.trim(),
      stock: 0,
      stockMinimo,
      purchaseCostLb: 0,
      associationId: targetAssociationId,
      associationName: targetAssociationName.trim(),
      active: true,
    };

    setSaving(true);

    try {
      await productService.createProduct(product);

      setSuccess(
        "Producto creado correctamente con existencias iniciales en cero."
      );

      setCode("");
      setName("");
      setCategory("");
      setUnit("lb");
      setStockMinimo(10);

      // Actualizar el catálogo sin recargar toda la página.
      await onSaved?.();
    } catch (err: unknown) {
      console.error("Error al guardar el producto:", err);

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el producto."
      );
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <div className="product-form">
        <p>Comprobando sesión...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="product-form">
        <h2>Nuevo producto</h2>
        <p>
          Debes iniciar sesión para registrar productos.
        </p>
      </div>
    );
  }

  if (user.active !== true) {
    return (
      <div className="product-form">
        <h2>Administración de productos</h2>
        <p>
          Tu usuario está inactivo. Contacta al administrador.
        </p>
      </div>
    );
  }

  if (!canManageInventory) {
    return (
      <div className="product-form">
        <h2>Administración de productos</h2>
        <p>
          Tu rol no permite crear ni administrar productos.
          Contacta al administrador si necesitas acceso.
        </p>
      </div>
    );
  }

  return (
    <form
      className="product-form"
      onSubmit={guardarProducto}
    >
      <h2>Nuevo producto</h2>

      {isAllAssociations && (
        <>
          <label htmlFor="product-association">
            Asociación
          </label>

          <select
            id="product-association"
            value={selectedAssociationId}
            onChange={(event) =>
              setSelectedAssociationId(event.target.value)
            }
            disabled={loadingAssociations || saving}
            required
          >
            <option value="">
              {loadingAssociations
                ? "Cargando asociaciones..."
                : "Seleccione una asociación"}
            </option>

            {associations.map((association) => (
              <option
                key={association.id}
                value={association.id}
              >
                {association.name}
              </option>
            ))}
          </select>
        </>
      )}

      <label htmlFor="product-code">
        Código del producto
      </label>
      <input
        id="product-code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        maxLength={60}
        required
      />

      <label htmlFor="product-name">
        Nombre del producto
      </label>
      <input
        id="product-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={150}
        required
      />

      <label htmlFor="product-category">
        Categoría
      </label>
      <input
        id="product-category"
        value={category}
        onChange={(event) =>
          setCategory(event.target.value)
        }
        placeholder="Ej. Pescado"
        maxLength={100}
        required
      />

      <label htmlFor="product-unit">
        Unidad de medida
      </label>
      <input
        id="product-unit"
        value={unit}
        onChange={(event) => setUnit(event.target.value)}
        placeholder="Ej. lb, kg, unidad"
        maxLength={30}
        required
      />

      <label htmlFor="product-minimum-stock">
        Stock mínimo
      </label>
      <input
        id="product-minimum-stock"
        type="number"
        min="0"
        step="any"
        value={stockMinimo}
        onChange={(event) =>
          setStockMinimo(Number(event.target.value))
        }
        required
      />

      <p>
        El producto se creará con existencias en cero.
        Las entradas y los costos se registrarán mediante
        las operaciones de inventario correspondientes.
      </p>

      {error && (
        <p role="alert" style={{ color: "red" }}>
          {error}
        </p>
      )}

      {success && (
        <p role="status" style={{ color: "green" }}>
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={
          saving ||
          loadingAssociations ||
          (isAllAssociations &&
            (!selectedAssociationId ||
              associations.length === 0))
        }
      >
        {saving ? "Guardando..." : "Guardar producto"}
      </button>
    </form>
  );
}
