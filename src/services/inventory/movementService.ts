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

  type: Movement["type"];

  productId: string;

  qty: number;

  associationId: string;

  associationName: string;

  purchaseCostLb?: number;

  salePriceLb?: number;

  supplierName?: string;

  supplierCommunity?: string;

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

  /**

   * Comprueba que el usuario pueda consultar los movimientos

   * de la asociación indicada.

   *

   * Permite consultar a Administrador, Vendedor y Consulta,

   * siempre que la cuenta esté activa y corresponda a la

   * asociación autorizada.

   */

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

    if (

      profile.email?.trim().toLowerCase() !== email

    ) {

      throw new Error(

        "El correo del perfil no coincide con el usuario autenticado."

      );

    }

    if (profile.active !== true) {

      throw new Error(

        "La cuenta está inactiva."

      );

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

  /**

   * Consulta el historial de movimientos de una asociación.

   * Solo devuelve información de la asociación autorizada.

   */

  async getMovements(

    associationId: string

  ): Promise<Movement[]> {

    const normalizedAssociationId = associationId.trim();

    if (!normalizedAssociationId) {

      throw new Error(

        "La asociación es obligatoria para consultar movimientos."

      );

    }

    await this.authorizeAssociationRead(

      normalizedAssociationId

    );

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

   * Actualiza el producto, el historial y la auditoría

   * dentro de una única transacción de Firestore.

   *

   * IMPORTANTE:

   * No debe invocarse adicionalmente para una compra o venta

   * que ya haya sido procesada por PurchaseService o SalesService,

   * porque esos servicios ya modifican el stock y registran

   * sus propios movimientos históricos.

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

    const userEmail = currentUser.email;

    const associationId = input.associationId.trim();

    // 1. Validar permisos de escritura.

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

    const auditRef = doc(

      collection(db, "auditLogs")

    );

    const movementCode =

      `MOV-${new Date().getFullYear()}-${movementRef.id

        .slice(0, 10)

        .toUpperCase()}`;

    const movementDate = new Date().toISOString();

    return runTransaction(db, async (transaction) => {

      // 2. Leer el producto antes de realizar escrituras.

      const productSnapshot =

        await transaction.get(productRef);

      if (!productSnapshot.exists()) {

        throw new Error(

          "El producto indicado no existe en esta asociación."

        );

      }

      const product = productSnapshot.data();

      // 3. No aceptar movimientos de productos desactivados.

      // Los documentos antiguos sin active siguen siendo compatibles.

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

      const productName = String(

        product.name ?? ""

      ).trim();

      const unit = String(

        product.unit ?? ""

      ).trim();

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

      // 4. Validar existencias y costos actuales.

      const currentStock = Number(

        product.stock ?? 0

      );

      const currentCost = Number(

        product.purchaseCostLb ?? 0

      );

      const purchaseCost =

        input.purchaseCostLb ?? currentCost;

      const rawSalePrice =

        input.salePriceLb ??

        Number(product.lastSalePriceLb ?? 0);

      const salePrice = Number.isFinite(rawSalePrice)

        ? rawSalePrice

        : 0;

      if (

        !Number.isFinite(currentStock) ||

        currentStock < 0

      ) {

        throw new Error(

          "Las existencias actuales no son válidas."

        );

      }

      if (

        !Number.isFinite(currentCost) ||

        currentCost < 0

      ) {

        throw new Error(

          "El costo promedio actual no es válido."

        );

      }

      let newStock = currentStock;

      let newAverageCost = currentCost;

      // 5. Calcular la entrada o salida.

      if (input.type === "Compra") {

        if (

          !Number.isFinite(purchaseCost) ||

          purchaseCost <= 0

        ) {

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

        if (

          !Number.isFinite(newAverageCost) ||

          newAverageCost < 0

        ) {

          throw new Error(

            "No se pudo calcular el costo promedio."

          );

        }

      } else {

        if (

          !Number.isFinite(salePrice) ||

          salePrice <= 0

        ) {

          throw new Error(

            "El precio de venta debe ser mayor que cero."

          );

        }

        if (currentStock < input.qty) {

          throw new Error(

            `Existencias insuficientes. Disponibles: ${currentStock}; solicitadas: ${input.qty}.`

          );

        }

        newStock = currentStock - input.qty;

      }

      if (

        !Number.isFinite(newStock) ||

        newStock < 0

      ) {

        throw new Error(

          "El resultado de la operación produciría existencias no válidas."

        );

      }

      const effectiveAssociationName =

        productAssociationName ||

        input.associationName.trim();

      const unitPrice =

        input.type === "Compra"

          ? purchaseCost

          : salePrice;

      const total =

        Math.round(

          input.qty * unitPrice * 100

        ) / 100;

      if (!Number.isFinite(total)) {

        throw new Error(

          "No se pudo calcular el total del movimiento."

        );

      }

      // 6. Preparar el movimiento histórico.

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

        ...(input.type === "Compra" &&

        input.supplierName?.trim()

          ? {

              supplierName: input.supplierName.trim(),

            }

          : {}),

        ...(input.type === "Compra" &&

        input.supplierCommunity?.trim()

          ? {

              supplierCommunity:

                input.supplierCommunity.trim(),

            }

          : {}),

      };

      // 7. Actualizar las existencias del producto.

      transaction.update(productRef, {

        stock: newStock,

        purchaseCostLb: newAverageCost,

        ...(input.type === "Venta"

          ? { lastSalePriceLb: salePrice }

          : {}),

        lastMovementId: movementRef.id,

        updatedAt: serverTimestamp(),

      });

      // 8. Crear el registro histórico.

      transaction.set(movementRef, {

        ...movementData,

        productId: input.productId.trim(),

        total,

        createdAt: serverTimestamp(),

        updatedAt: serverTimestamp(),

      });

      // 9. Registrar auditoría en la misma transacción.

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

  private validateMovement(

    input: CreateMovementInput

  ): void {

    if (

      input.type !== "Compra" &&

      input.type !== "Venta"

    ) {

      throw new Error(

        "El tipo de movimiento no es válido."

      );

    }

    if (!input.associationId?.trim()) {

      throw new Error(

        "La asociación es obligatoria."

      );

    }

    if (!input.associationName?.trim()) {

      throw new Error(

        "El nombre de la asociación es obligatorio."

      );

    }

    if (!input.productId?.trim()) {

      throw new Error(

        "El producto es obligatorio."

      );

    }

    if (

      !Number.isFinite(input.qty) ||

      input.qty <= 0

    ) {

      throw new Error(

        "La cantidad debe ser mayor que cero."

      );

    }

    if (

      input.purchaseCostLb !== undefined &&

      (

        !Number.isFinite(input.purchaseCostLb) ||

        input.purchaseCostLb <= 0

      )

    ) {

      throw new Error(

        "El costo de compra debe ser mayor que cero."

      );

    }

    if (

      input.salePriceLb !== undefined &&

      (

        !Number.isFinite(input.salePriceLb) ||

        input.salePriceLb <= 0

      )

    ) {

      throw new Error(

        "El precio de venta debe ser mayor que cero."

      );

    }

  }

}

export const movementService = new MovementService();