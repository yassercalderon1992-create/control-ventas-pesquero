
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { auth } from "../../firebase/auth";
import { db } from "../../firebase/firestore";
import type { Movement } from "../../types/movement";
import type { UserProfile } from "../../types/user";
import { ValuationService } from "./valuationService";
import { authorizationService } from "../auth/authorizationService";

export interface CreateMovementInput {
  type: "Compra" | "Venta";
  productId: string;
  qty: number;
  associationId: string;
  associationName: string;
  purchaseCostLb?: number;
  salePriceLb?: number;
  supplierName?: string;
  supplierCommunity?: string;
}

export interface AdjustStockInput {
  productId: string;
  qty: number;
  direction: "Entrada" | "Salida";
  reason: string;
  associationId: string;
  associationName: string;
}

export class MovementService {
  private valuationService = new ValuationService();

  private movementsCollection(associationId: string) {
    return collection(
      db,
      "associations",
      associationId,
      "movements"
    );
  }

  private async authorizeAssociationRead(
    associationId: string
  ): Promise<void> {
    const currentUser = auth.currentUser;

    if (!currentUser?.email) {
      throw new Error(
        "Debes iniciar sesión para consultar los movimientos."
      );
    }

    const email = currentUser.email.trim().toLowerCase();
    const userRef = doc(db, "users", email);
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
      throw new Error(
        "No se encontró el perfil del usuario autenticado."
      );
    }

    const profile = userSnapshot.data() as UserProfile;

    if (profile.email?.trim().toLowerCase() !== email) {
      throw new Error(
        "El correo del perfil no coincide con el usuario autenticado."
      );
    }

    if (profile.active !== true) {
      throw new Error("La cuenta está inactiva.");
    }

    const validRoles: UserProfile["role"][] = [
      "Administrador",
      "Vendedor",
      "Consulta",
    ];

    if (!validRoles.includes(profile.role)) {
      throw new Error(
        "El perfil no tiene permiso para consultar movimientos."
      );
    }

    const isGlobalAdmin =
      profile.role === "Administrador" &&
      profile.associationId?.trim().toLowerCase() === "todas";

    const belongsToAssociation =
      profile.associationId?.trim() === associationId;

    if (!isGlobalAdmin && !belongsToAssociation) {
      throw new Error(
        "No tienes autorización para consultar movimientos de esta asociación."
      );
    }
  }

  async getMovements(
    associationId: string
  ): Promise<Movement[]> {
    const normalizedAssociationId = associationId.trim();

    if (!normalizedAssociationId) {
      throw new Error(
        "La asociación es obligatoria para consultar movimientos."
      );
    }

    await this.authorizeAssociationRead(normalizedAssociationId);

    const snapshot = await getDocs(
      this.movementsCollection(normalizedAssociationId)
    );

    return snapshot.docs
      .map((document) => ({
        ...document.data(),
        id: document.id,
      }) as Movement)
      .sort((a, b) => {
        const dateA = Date.parse(a.date ?? "");
        const dateB = Date.parse(b.date ?? "");

        return (
          (Number.isFinite(dateB) ? dateB : 0) -
          (Number.isFinite(dateA) ? dateA : 0)
        );
      });
  }

  /**
   * Registra un movimiento manual de compra o venta.
   *
   * No debe llamarse para una compra o venta ya procesada
   * por PurchaseService o SalesService.
   */
  async createMovement(
    input: CreateMovementInput
  ): Promise<string> {
    this.validateMovement(input);

    const currentUser = auth.currentUser;

    if (!currentUser?.email) {
      throw new Error(
        "Debes iniciar sesión para registrar un movimiento."
      );
    }

    const userEmail = currentUser.email.trim().toLowerCase();
    const associationId = input.associationId.trim();

    await authorizationService.authorizeAssociationWrite(
      associationId,
      "movements:register"
    );

    const productRef = doc(
      db,
      "associations",
      associationId,
      "products",
      input.productId.trim()
    );

    const movementRef = doc(
      this.movementsCollection(associationId)
    );

    const auditRef = doc(collection(db, "auditLogs"));

    const movementCode =
      `MOV-${new Date().getFullYear()}-${movementRef.id
        .slice(0, 10)
        .toUpperCase()}`;

    const movementDate = new Date().toISOString();

    return runTransaction(db, async (transaction) => {
      const productSnapshot = await transaction.get(productRef);

      if (!productSnapshot.exists()) {
        throw new Error(
          "El producto indicado no existe en esta asociación."
        );
      }

      const product = productSnapshot.data();

      if (product.active === false) {
        throw new Error(
          "El producto está desactivado y no puede recibir movimientos."
        );
      }

      if (
        product.associationId &&
        product.associationId !== associationId
      ) {
        throw new Error(
          "El producto pertenece a otra asociación."
        );
      }

      const productName = String(product.name ?? "").trim();
      const unit = String(product.unit ?? "").trim();
      const productAssociationName = String(
        product.associationName ?? ""
      ).trim();

      if (!productName || !unit) {
        throw new Error(
          "El producto no tiene un nombre o unidad válidos."
        );
      }

      if (
        productAssociationName &&
        productAssociationName !== input.associationName.trim()
      ) {
        throw new Error(
          "El nombre de la asociación no coincide con el producto."
        );
      }

      const currentStock = Number(product.stock ?? 0);
      const currentCost = Number(product.purchaseCostLb ?? 0);

      const purchaseCost =
        input.purchaseCostLb ?? currentCost;

      const rawSalePrice =
        input.salePriceLb ??
        Number(product.lastSalePriceLb ?? 0);

      const salePrice = Number.isFinite(rawSalePrice)
        ? rawSalePrice
        : 0;

      if (!Number.isFinite(currentStock) || currentStock < 0) {
        throw new Error(
          "Las existencias actuales no son válidas."
        );
      }

      if (!Number.isFinite(currentCost) || currentCost < 0) {
        throw new Error(
          "El costo promedio actual no es válido."
        );
      }

      let newStock = currentStock;
      let newAverageCost = currentCost;

      if (input.type === "Compra") {
        if (!Number.isFinite(purchaseCost) || purchaseCost <= 0) {
          throw new Error(
            "El costo de compra debe ser mayor que cero."
          );
        }

        newStock = currentStock + input.qty;

        newAverageCost =
          currentStock === 0
            ? purchaseCost
            : this.valuationService.calculateAverageCost(
                currentStock,
                currentCost,
                input.qty,
                purchaseCost
              );
      } else {
        if (!Number.isFinite(salePrice) || salePrice <= 0) {
          throw new Error(
            "El precio de venta debe ser mayor que cero."
          );
        }

        if (currentStock < input.qty) {
          throw new Error(
            "No hay existencias suficientes para registrar la salida."
          );
        }

        newStock = currentStock - input.qty;
      }

      if (!Number.isFinite(newStock) || newStock < 0) {
        throw new Error(
          "El movimiento produciría existencias no válidas."
        );
      }

      const effectiveAssociationName =
        productAssociationName || input.associationName.trim();

      const unitPrice =
        input.type === "Compra" ? purchaseCost : salePrice;

      const total = input.qty * unitPrice;

      const movementData: Movement = {
        id: movementRef.id,
        type: input.type,
        date: movementDate,
        code: movementCode,
        product: productName,
        qty: input.qty,
        purchaseCostLb: purchaseCost,
        salePriceLb: salePrice,
        associationId,
        associationName: effectiveAssociationName,
        userEmail,
        status: "active",
        ...(input.type === "Compra" && input.supplierName
          ? { supplierName: input.supplierName.trim() }
          : {}),
        ...(input.type === "Compra" && input.supplierCommunity
          ? { supplierCommunity: input.supplierCommunity.trim() }
          : {}),
      };

      transaction.update(productRef, {
        stock: newStock,
        purchaseCostLb: newAverageCost,
        ...(input.type === "Venta"
          ? { lastSalePriceLb: salePrice }
          : {}),
        lastMovementId: movementRef.id,
        updatedAt: serverTimestamp(),
      });

      transaction.set(movementRef, {
        ...movementData,
        productId: input.productId.trim(),
        total,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      transaction.set(auditRef, {
        action:
          input.type === "Compra"
            ? "INVENTORY_PURCHASE_MOVEMENT_CREATED"
            : "INVENTORY_SALE_MOVEMENT_CREATED",
        actorUid: currentUser.uid,
        actorEmail: userEmail,
        createdBy: userEmail,
        associationId,
        entityType: "movement",
        entityId: movementRef.id,
        details: {
          productId: input.productId.trim(),
          productName,
          type: input.type,
          quantity: input.qty,
          stockBefore: currentStock,
          stockAfter: newStock,
          unitPrice,
          total,
        },
        createdAt: serverTimestamp(),
      });

      return movementRef.id;
    });
  }

  /**
   * Registra un ajuste manual de inventario por Entrada o Salida.
   * Conserva el movimiento histórico y registra auditoría.
   */
  async adjustStock(
    input: AdjustStockInput
  ): Promise<string> {
    this.validateAdjustment(input);

    const currentUser = auth.currentUser;

    if (!currentUser?.email) {
      throw new Error(
        "Debes iniciar sesión para ajustar el inventario."
      );
    }

    const userEmail = currentUser.email.trim().toLowerCase();
    const associationId = input.associationId.trim();
    const productId = input.productId.trim();
    const reason = input.reason.trim();

    // Se requieren ambos permisos para gestionar el inventario
    // y registrar el movimiento que deja constancia del ajuste.
    await authorizationService.authorizeAssociationWrite(
      associationId,
      "inventory:manage"
    );

    await authorizationService.authorizeAssociationWrite(
      associationId,
      "movements:register"
    );

    const productRef = doc(
      db,
      "associations",
      associationId,
      "products",
      productId
    );

    const movementRef = doc(
      this.movementsCollection(associationId)
    );

    const auditRef = doc(collection(db, "auditLogs"));

    const movementCode =
      `MOV-${new Date().getFullYear()}-${movementRef.id
        .slice(0, 10)
        .toUpperCase()}`;

    const movementDate = new Date().toISOString();

    return runTransaction(db, async (transaction) => {
      const productSnapshot = await transaction.get(productRef);

      if (!productSnapshot.exists()) {
        throw new Error(
          "El producto indicado no existe en esta asociación."
        );
      }

      const product = productSnapshot.data();

      if (product.active === false) {
        throw new Error(
          "No se puede ajustar un producto desactivado."
        );
      }

      if (
        product.associationId &&
        product.associationId !== associationId
      ) {
        throw new Error(
          "El producto pertenece a otra asociación."
        );
      }

      const productName = String(product.name ?? "").trim();
      const unit = String(product.unit ?? "").trim();
      const productAssociationName = String(
        product.associationName ?? ""
      ).trim();

      if (!productName || !unit) {
        throw new Error(
          "El producto no tiene un nombre o unidad válidos."
        );
      }

      if (
        productAssociationName &&
        productAssociationName !== input.associationName.trim()
      ) {
        throw new Error(
          "El nombre de la asociación no coincide con el producto."
        );
      }

      const currentStock = Number(product.stock ?? 0);
      const currentCost = Number(product.purchaseCostLb ?? 0);
      const salePrice = Number(product.lastSalePriceLb ?? 0);

      if (!Number.isFinite(currentStock) || currentStock < 0) {
        throw new Error(
          "Las existencias actuales no son válidas."
        );
      }

      if (!Number.isFinite(currentCost) || currentCost < 0) {
        throw new Error(
          "El costo promedio actual no es válido."
        );
      }

      const stockDelta =
        input.direction === "Entrada" ? input.qty : -input.qty;

      const newStock = currentStock + stockDelta;

      if (input.direction === "Salida" && input.qty > currentStock) {
        throw new Error(
          "La salida no puede superar las existencias disponibles."
        );
      }

      if (!Number.isFinite(newStock) || newStock < 0) {
        throw new Error(
          "El ajuste produciría existencias no válidas."
        );
      }

      const effectiveAssociationName =
        productAssociationName || input.associationName.trim();

      const movementData: Movement = {
        id: movementRef.id,
        type: "Ajuste",
        date: movementDate,
        code: movementCode,
        product: productName,
        qty: input.qty,
        purchaseCostLb: currentCost,
        salePriceLb: Number.isFinite(salePrice) ? salePrice : 0,
        associationId,
        associationName: effectiveAssociationName,
        userEmail,
        reason,
        stockBefore: currentStock,
        stockAfter: newStock,
        stockDelta,
        adjustmentDirection: input.direction,
        status: "active",
      };

      transaction.update(productRef, {
        stock: newStock,
        lastMovementId: movementRef.id,
        updatedAt: serverTimestamp(),
      });

      transaction.set(movementRef, {
        ...movementData,
        productId,
        referenceType: "MANUAL_ADJUSTMENT",
        total: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      transaction.set(auditRef, {
        action: "INVENTORY_MANUAL_ADJUSTMENT_CREATED",
        actorUid: currentUser.uid,
        actorEmail: userEmail,
        createdBy: userEmail,
        associationId,
        entityType: "movement",
        entityId: movementRef.id,
        details: {
          productId,
          productName,
          type: "Ajuste",
          direction: input.direction,
          quantity: input.qty,
          reason,
          stockBefore: currentStock,
          stockAfter: newStock,
          stockDelta,
        },
        createdAt: serverTimestamp(),
      });

      return movementRef.id;
    });
  }

  private validateMovement(
    input: CreateMovementInput
  ): void {
    if (input.type !== "Compra" && input.type !== "Venta") {
      throw new Error(
        "Este método solo admite movimientos de compra o venta."
      );
    }

    if (!input.associationId.trim()) {
      throw new Error("La asociación es obligatoria.");
    }

    if (!input.associationName.trim()) {
      throw new Error(
        "El nombre de la asociación es obligatorio."
      );
    }

    if (!input.productId.trim()) {
      throw new Error("El producto es obligatorio.");
    }

    if (!Number.isFinite(input.qty) || input.qty <= 0) {
      throw new Error(
        "La cantidad debe ser un número mayor que cero."
      );
    }

    if (
      input.purchaseCostLb !== undefined &&
      (!Number.isFinite(input.purchaseCostLb) ||
        input.purchaseCostLb <= 0)
    ) {
      throw new Error(
        "El costo de compra debe ser mayor que cero."
      );
    }

    if (
      input.salePriceLb !== undefined &&
      (!Number.isFinite(input.salePriceLb) ||
        input.salePriceLb <= 0)
    ) {
      throw new Error(
        "El precio de venta debe ser mayor que cero."
      );
    }
  }

  private validateAdjustment(
    input: AdjustStockInput
  ): void {
    if (!input.associationId.trim()) {
      throw new Error("La asociación es obligatoria.");
    }

    if (!input.associationName.trim()) {
      throw new Error(
        "El nombre de la asociación es obligatorio."
      );
    }

    if (!input.productId.trim()) {
      throw new Error("El producto es obligatorio.");
    }

    if (!Number.isFinite(input.qty) || input.qty <= 0) {
      throw new Error(
        "La cantidad del ajuste debe ser mayor que cero."
      );
    }

    if (
      input.direction !== "Entrada" &&
      input.direction !== "Salida"
    ) {
      throw new Error(
        "El ajuste debe ser de tipo Entrada o Salida."
      );
    }

    if (!input.reason.trim()) {
      throw new Error(
        "Debes indicar el motivo del ajuste de inventario."
      );
    }
  }
}

export const movementService = new MovementService();
