import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { auth } from "../../firebase/auth";
import { db } from "../../firebase/firestore";
import type { Product } from "../../types/product";
import type { UserProfile } from "../../types/user";
import {
  ROLE_PERMISSIONS,
  hasPermission,
} from "../../models/permissions";
import { authorizationService } from "../auth/authorizationService";

class ProductService {
  private collectionRef(associationId: string) {
    if (!associationId?.trim()) {
      throw new Error("La asociación es obligatoria.");
    }

    return collection(
      db,
      "associations",
      associationId.trim(),
      "products"
    );
  }

  /**
   * Comprueba que el usuario pueda consultar
   * los productos de la asociación solicitada.
   */
  private async authorizeAssociationRead(
    associationId: string
  ): Promise<UserProfile> {
    const firebaseUser = auth.currentUser;

    if (!firebaseUser?.email) {
      throw new Error(
        "Debes iniciar sesión para consultar los productos."
      );
    }

    const email = firebaseUser.email.trim().toLowerCase();
    const targetAssociationId = associationId.trim();

    if (!targetAssociationId) {
      throw new Error("La asociación es obligatoria.");
    }

    const userRef = doc(db, "users", email);
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
      throw new Error(
        "No se encontró el perfil del usuario."
      );
    }

    const profile = userSnapshot.data() as UserProfile;

    if (
      !profile.email ||
      profile.email.trim().toLowerCase() !== email
    ) {
      throw new Error("El perfil del usuario no es válido.");
    }

    if (profile.active !== true) {
      throw new Error(
        "Tu usuario está inactivo. Contacta al administrador."
      );
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        ROLE_PERMISSIONS,
        profile.role
      ) ||
      !hasPermission(profile.role, "inventory:view")
    ) {
      throw new Error(
        "No tienes permiso para consultar el inventario."
      );
    }

    const userAssociationId = (
      profile.associationId ?? ""
    ).trim();

    const isGlobalAdmin =
      profile.role === "Administrador" &&
      userAssociationId.toLowerCase() === "todas";

    const belongsToAssociation =
      userAssociationId === targetAssociationId;

    if (!isGlobalAdmin && !belongsToAssociation) {
      throw new Error(
        "No tienes autorización para consultar los productos de esta asociación."
      );
    }

    return profile;
  }

  /**
   * Obtener los productos activos de una asociación.
   * Los documentos antiguos sin active se consideran activos.
   */
  async getProducts(
    associationId: string
  ): Promise<Product[]> {
    await this.authorizeAssociationRead(associationId);

    const snapshot = await getDocs(
      this.collectionRef(associationId)
    );

    return snapshot.docs
      .map((document) => {
        const data = document.data();

        return {
          ...data,
          id: document.id,
          active: data.active !== false,
        } as Product;
      })
      .filter((product) => product.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Obtener todos los productos de una asociación,
   * incluidos los que han sido desactivados.
   */
  async getAll(
    associationId: string
  ): Promise<Product[]> {
    await this.authorizeAssociationRead(associationId);

    const snapshot = await getDocs(
      this.collectionRef(associationId)
    );

    return snapshot.docs
      .map((document) => {
        const data = document.data();

        return {
          ...data,
          id: document.id,
          active: data.active !== false,
        } as Product;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Crear un producto.
   *
   * Las existencias iniciales deben ser cero.
   * El stock debe registrarse mediante un proceso de
   * apertura de inventario con su movimiento correspondiente.
   */
  async createProduct(
    product: Product
  ): Promise<string> {
    this.validateProduct(product);

    if (product.stock !== 0) {
      throw new Error(
        "No puedes crear un producto con existencias iniciales. " +
        "Registra el producto con stock cero. " +
        "Las existencias iniciales deben ingresarse mediante " +
        "un movimiento de apertura de inventario."
      );
    }

    await authorizationService.authorizeAssociationWrite(
      product.associationId,
      "inventory:manage"
    );

    const {
      id: _id,
      stock: _stock,
      lastMovementId: _lastMovementId,
      lastSalePriceLb: _lastSalePriceLb,
      ...productData
    } = product;

    const document = await addDoc(
      this.collectionRef(product.associationId),
      {
        ...productData,
        stock: 0,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    );

    return document.id;
  }

  /**
   * Alias para mantener compatibilidad con llamadas existentes.
   */
  async create(product: Product): Promise<string> {
    return this.createProduct(product);
  }

  /**
   * Actualizar los datos descriptivos del producto.
   *
   * No permite actualizar stock, costo promedio,
   * último precio de venta ni lastMovementId.
   */
  async updateProduct(
    product: Product
  ): Promise<void> {
    if (!product.id?.trim()) {
      throw new Error(
        "No se puede actualizar un producto sin identificador."
      );
    }

    this.validateProductDetails(product);

    await authorizationService.authorizeAssociationWrite(
      product.associationId,
      "inventory:manage"
    );

    const productRef = doc(
      db,
      "associations",
      product.associationId.trim(),
      "products",
      product.id.trim()
    );

    const updateData: Record<string, unknown> = {
      code: product.code.trim(),
      name: product.name.trim(),
      category: product.category.trim(),
      unit: product.unit.trim(),
      updatedAt: serverTimestamp(),
    };

    if (product.stockMinimo !== undefined) {
      this.validateMinimumStock(product.stockMinimo);
      updateData.stockMinimo = product.stockMinimo;
    }

    await updateDoc(productRef, updateData);
  }

  /**
   * Alias compatible con versiones anteriores.
   *
   * Solo actualiza campos descriptivos permitidos.
   */
  async update(
    associationId: string,
    productId: string,
    data: Partial<Product>
  ): Promise<void> {
    if (!associationId?.trim() || !productId?.trim()) {
      throw new Error(
        "La asociación y el producto son obligatorios."
      );
    }

    if (
      data.associationId &&
      data.associationId.trim() !== associationId.trim()
    ) {
      throw new Error(
        "No se puede cambiar la asociación del producto."
      );
    }

    await authorizationService.authorizeAssociationWrite(
      associationId,
      "inventory:manage"
    );

    const updateData: Record<string, unknown> = {};

    if (data.code !== undefined) {
      updateData.code = this.requireText(
        data.code,
        "El código del producto es obligatorio."
      );
    }

    if (data.name !== undefined) {
      updateData.name = this.requireText(
        data.name,
        "El nombre del producto es obligatorio."
      );
    }

    if (data.category !== undefined) {
      updateData.category = this.requireText(
        data.category,
        "La categoría es obligatoria."
      );
    }

    if (data.unit !== undefined) {
      updateData.unit = this.requireText(
        data.unit,
        "La unidad de medida es obligatoria."
      );
    }

    if (data.stockMinimo !== undefined) {
      this.validateMinimumStock(data.stockMinimo);
      updateData.stockMinimo = data.stockMinimo;
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error(
        "No hay campos descriptivos válidos para actualizar."
      );
    }

    const productRef = doc(
      db,
      "associations",
      associationId.trim(),
      "products",
      productId.trim()
    );

    await updateDoc(productRef, {
      ...updateData,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Desactivar un producto sin borrar su documento.
   * El historial de movimientos permanece en Firestore.
   */
  async deleteProduct(
    associationId: string,
    productId: string
  ): Promise<void> {
    if (!associationId?.trim() || !productId?.trim()) {
      throw new Error(
        "La asociación y el identificador del producto son obligatorios."
      );
    }

    await authorizationService.authorizeAssociationWrite(
      associationId,
      "inventory:manage"
    );

    const productRef = doc(
      db,
      "associations",
      associationId.trim(),
      "products",
      productId.trim()
    );

    await updateDoc(productRef, {
      active: false,
      deactivatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Alias histórico. No elimina físicamente el documento.
   */
  async delete(
    associationId: string,
    productId: string
  ): Promise<void> {
    await this.deleteProduct(
      associationId,
      productId
    );
  }

  private validateProduct(product: Product): void {
    this.validateProductDetails(product);

    if (
      !Number.isFinite(product.stock) ||
      product.stock < 0
    ) {
      throw new Error(
        "Las existencias deben ser un número igual o mayor que cero."
      );
    }

    if (
      !Number.isFinite(product.purchaseCostLb) ||
      product.purchaseCostLb < 0
    ) {
      throw new Error(
        "El costo de compra debe ser igual o mayor que cero."
      );
    }

    if (
      product.lastSalePriceLb !== undefined &&
      (
        !Number.isFinite(product.lastSalePriceLb) ||
        product.lastSalePriceLb < 0
      )
    ) {
      throw new Error(
        "El último precio de venta no es válido."
      );
    }

    if (product.stockMinimo !== undefined) {
      this.validateMinimumStock(product.stockMinimo);
    }
  }

  private validateProductDetails(
    product: Pick<
      Product,
      "associationId" | "code" | "name" | "category" | "unit"
    >
  ): void {
    if (!product.associationId?.trim()) {
      throw new Error("La asociación es obligatoria.");
    }

    this.requireText(
      product.code,
      "El código del producto es obligatorio."
    );

    this.requireText(
      product.name,
      "El nombre del producto es obligatorio."
    );

    this.requireText(
      product.category,
      "La categoría es obligatoria."
    );

    this.requireText(
      product.unit,
      "La unidad de medida es obligatoria."
    );
  }

  private requireText(
    value: string,
    message: string
  ): string {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(message);
    }

    return value.trim();
  }

  private validateMinimumStock(value: number): void {
    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new Error(
        "El stock mínimo debe ser un número igual o mayor que cero."
      );
    }
  }
}

export const productService = new ProductService();

export { ProductService };