
import { doc, getDoc } from "firebase/firestore";

import { auth } from "../../firebase/auth";
import { db } from "../../firebase/firestore";
import type { UserProfile } from "../../types/user";
import {
  ROLE_PERMISSIONS,
  hasPermission,
} from "../../models/permissions";

export class StockService {
  /**
   * Verifica que exista un usuario autenticado,
   * activo y autorizado para consultar la asociación.
   */
  private async authorizeAssociationRead(
    associationId: string
  ): Promise<UserProfile> {
    const firebaseUser = auth.currentUser;

    if (!firebaseUser?.email) {
      throw new Error(
        "Debes iniciar sesión para consultar el inventario."
      );
    }

    const email = firebaseUser.email.trim().toLowerCase();
    const normalizedAssociationId = associationId.trim();

    if (!normalizedAssociationId) {
      throw new Error(
        "La asociación es obligatoria para consultar las existencias."
      );
    }

    const userRef = doc(db, "users", email);
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
      throw new Error(
        "No se encontró el perfil del usuario en el sistema."
      );
    }

    const profile = userSnapshot.data() as UserProfile;

    if (
      !profile.email ||
      profile.email.trim().toLowerCase() !== email
    ) {
      throw new Error(
        "El perfil del usuario no es válido."
      );
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
      userAssociationId === normalizedAssociationId;

    if (!isGlobalAdmin && !belongsToAssociation) {
      throw new Error(
        "No tienes autorización para consultar el inventario de esta asociación."
      );
    }

    return profile;
  }

  /**
   * Consulta las existencias actuales de un producto.
   * Es una operación de solo lectura.
   */
  async getStock(
    associationId: string,
    productId: string
  ): Promise<number> {
    if (!associationId?.trim()) {
      throw new Error(
        "La asociación es obligatoria para consultar las existencias."
      );
    }

    if (!productId?.trim()) {
      throw new Error(
        "El identificador del producto es obligatorio."
      );
    }

    const normalizedAssociationId = associationId.trim();
    const normalizedProductId = productId.trim();

    // Verificar autorización antes de consultar el producto.
    await this.authorizeAssociationRead(
      normalizedAssociationId
    );

    const productRef = doc(
      db,
      "associations",
      normalizedAssociationId,
      "products",
      normalizedProductId
    );

    const snapshot = await getDoc(productRef);

    if (!snapshot.exists()) {
      throw new Error(
        "El producto no existe en esta asociación."
      );
    }

    const product = snapshot.data();

    if (
      product.associationId &&
      product.associationId !== normalizedAssociationId
    ) {
      throw new Error(
        "El producto no pertenece a la asociación indicada."
      );
    }

    const stock = product.stock;

    if (
      typeof stock !== "number" ||
      !Number.isFinite(stock) ||
      stock < 0
    ) {
      throw new Error(
        "Las existencias del producto no contienen un valor válido."
      );
    }

    return stock;
  }
}

export const stockService = new StockService();
