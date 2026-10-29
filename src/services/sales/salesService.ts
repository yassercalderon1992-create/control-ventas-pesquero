import {

  collection,

  doc,

  runTransaction,

  serverTimestamp,

} from "firebase/firestore";

import { auth } from "../../firebase/auth";

import { db } from "../../firebase/firestore";

import type { SaleRequest } from "../../types/dto";

import type { Movement } from "../../types/movement";
import { transactionCorrectionService } from "../admin/transactionCorrectionService";

interface PreparedSaleItem {

  productId: string;

  productCode: string;

  productName: string;

  unit: string;

  quantity: number;

  unitPrice: number;

  lineTotal: number;

  previousStock: number;

  newStock: number;

  purchaseCost: number;

}

interface SaleResult {

  id: string;

  code: string;

  total: number;

}

function roundMoney(value: number): number {

  return Math.round((value + Number.EPSILON) * 100) / 100;

}

export class SalesService {

  /**

   * Registra una venta, actualiza existencias y conserva

   * el historial de movimientos.

   *

   * Todos los cambios relacionados se confirman juntos.

   */

  async createSale(

    request: SaleRequest

  ): Promise<SaleResult> {

    this.validateSale(request);

    const currentUser = auth.currentUser;

    if (!currentUser) {

      throw new Error(

        "Debes iniciar sesión para registrar una venta."

      );

    }

    const actorEmail =

      currentUser.email ?? request.createdBy.trim();

    if (!actorEmail) {

      throw new Error(

        "No se pudo identificar al usuario que registra la venta."

      );

    }

    const associationId = request.associationId.trim();

    const saleRef = doc(

      collection(

        db,

        "associations",

        associationId,

        "sales"

      )

    );

    const year = new Date().getFullYear();

    const saleCode =

      `VEN-${year}-${saleRef.id.slice(0, 10).toUpperCase()}`;

    const productRefs = request.items.map((item) =>

      doc(

        db,

        "associations",

        associationId,

        "products",

        item.productId

      )

    );

    const movementRefs = request.items.map(() =>

      doc(

        collection(

          db,

          "associations",

          associationId,

          "movements"

        )

      )

    );

    // Las ventas a crédito no generan ingresos de caja

    // hasta registrar su cobro.

    const cashRef =

      request.paymentMethod === "CREDIT"

        ? null

        : doc(

            collection(

              db,

              "associations",

              associationId,

              "cashMovements"

            )

          );

    const auditRef = doc(collection(db, "auditLogs"));

    const transactionDate = new Date().toISOString();

    return runTransaction(db, async (transaction) => {

      // Primero leemos todos los productos.

      const productSnapshots = await Promise.all(

        productRefs.map((ref) => transaction.get(ref))

      );

      const preparedItems: PreparedSaleItem[] = [];

      let associationName = "";

      let total = 0;

      for (

        let index = 0;

        index < request.items.length;

        index++

      ) {

        const item = request.items[index];

        const snapshot = productSnapshots[index];

        if (!snapshot.exists()) {

          throw new Error(

            `No existe el producto ${item.productId} en esta asociación.`

          );

        }

        const product = snapshot.data();

        if (

          product.associationId &&

          product.associationId !== associationId

        ) {

          throw new Error(

            `El producto ${item.productId} pertenece a otra asociación.`

          );

        }

        const productName = String(

          product.name ?? ""

        ).trim();

        const productCode = String(

          product.code ?? item.productId

        );

        const unit = String(

          product.unit ?? ""

        ).trim();

        const currentAssociationName = String(

          product.associationName ?? ""

        ).trim();

        if (

          !productName ||

          !unit ||

          !currentAssociationName

        ) {

          throw new Error(

            `El producto ${item.productId} no tiene completos su nombre, unidad o asociación.`

          );

        }

        if (!associationName) {

          associationName = currentAssociationName;

        } else if (

          associationName !== currentAssociationName

        ) {

          throw new Error(

            "Los productos no coinciden con el nombre de la asociación."

          );

        }

        const previousStock = Number(

          product.stock ?? 0

        );

        const purchaseCost = Number(

          product.purchaseCostLb ?? 0

        );

        if (

          !Number.isFinite(previousStock) ||

          previousStock < 0

        ) {

          throw new Error(

            `Las existencias de ${productName} no son válidas.`

          );

        }

        if (

          !Number.isFinite(purchaseCost) ||

          purchaseCost < 0

        ) {

          throw new Error(

            `El costo de compra de ${productName} no es válido.`

          );

        }

        if (previousStock < item.quantity) {

          throw new Error(

            `Existencias insuficientes para ${productName}. Disponibles: ${previousStock}; solicitadas: ${item.quantity}.`

          );

        }

        const newStock =

          previousStock - item.quantity;

        const lineTotal = roundMoney(

          item.quantity * item.unitPrice

        );

        total = roundMoney(total + lineTotal);

        preparedItems.push({

          productId: item.productId,

          productCode,

          productName,

          unit,

          quantity: item.quantity,

          unitPrice: item.unitPrice,

          lineTotal,

          previousStock,

          newStock,

          purchaseCost,

        });

      }

      const saleData = {

        code: saleCode,

        associationId,

        associationName,

        customer: request.customer?.trim() || null,

        paymentMethod: request.paymentMethod,

        paymentStatus:

          request.paymentMethod === "CREDIT"

            ? "PENDING"

            : "PAID",

        notes: request.notes?.trim() || null,

        items: preparedItems.map((item) => ({

          productId: item.productId,

          productCode: item.productCode,

          productName: item.productName,

          unit: item.unit,

          quantity: item.quantity,

          unitPrice: item.unitPrice,

          lineTotal: item.lineTotal,

          stockBefore: item.previousStock,

          stockAfter: item.newStock,

          purchaseCost: item.purchaseCost,

        })),

        subtotal: total,

        total,

        createdBy: actorEmail,

        createdByUid: currentUser.uid,

        createdAt: serverTimestamp(),

        transactionDate,

        status: "ACTIVE",

      };

      transaction.set(saleRef, saleData);

      // Actualizamos productos y registramos un movimiento

      // histórico por cada artículo de la venta.

      for (

        let index = 0;

        index < preparedItems.length;

        index++

      ) {

        const item = preparedItems[index];

        const productRef = productRefs[index];

        const movementRef = movementRefs[index];

        transaction.update(productRef, {
          stock: item.newStock,
          lastSalePriceLb: item.unitPrice,
          lastMovementId: movementRef.id,
          updatedAt: serverTimestamp(),
        });

        const movement: Omit<

          Movement,

          "createdAt" | "updatedAt"

        > = {

          id: movementRef.id,

          type: "Venta",

          date: transactionDate,

          code: saleCode,

          product: item.productName,

          qty: item.quantity,

          purchaseCostLb: item.purchaseCost,

          salePriceLb: item.unitPrice,

          associationId,

          associationName,

          userEmail: actorEmail,

          status: "active",

        };

        transaction.set(movementRef, {

          ...movement,

          createdAt: serverTimestamp(),

          updatedAt: serverTimestamp(),

          productId: item.productId,
          saleId: saleRef.id,
          productCode: item.productCode,
          unit: item.unit,
          stockBefore: item.previousStock,
          stockAfter: item.newStock,
          lineTotal: item.lineTotal,
          referenceType: "SALE",

        });

      }

      // Solo las ventas pagadas generan ingreso inmediato.

      if (cashRef) {

        transaction.set(cashRef, {

          associationId,

          associationName,

          type: "INCOME",

          amount: total,

          paymentMethod: request.paymentMethod,

          concept: `Venta ${saleCode}`,

          referenceType: "SALE",

          referenceId: saleRef.id,

          createdBy: actorEmail,
          createdByUid: currentUser.uid,
          createdAt: serverTimestamp(),

          status: "ACTIVE",

          customer: request.customer?.trim() || null,

        });

      }

      transaction.set(auditRef, {

        action: "SALE_CREATED",

        actorUid: currentUser.uid,

        actorEmail: currentUser.email,

        createdBy: actorEmail,

        associationId,

        entityType: "sale",

        entityId: saleRef.id,

        details: {

          saleCode,

          total,

          paymentMethod: request.paymentMethod,

          itemCount: preparedItems.length,

          cashMovementId: cashRef?.id ?? null,

        },

        createdAt: serverTimestamp(),

      });

      return {

        id: saleRef.id,

        code: saleCode,

        total,

      };

    });

  }


  /**
   * Corrige una venta existente exclusivamente mediante el servicio
   * central de correcciones, que conserva la auditoría y el historial.
   */
  async correctSale(
    saleId: string,
    request: SaleRequest,
    reason: string
  ): Promise<{ id: string; code: string; total: number; correctionId: string }> {
    return transactionCorrectionService.correctSale(
      saleId,
      request,
      reason
    );
  }

  private validateSale(request: SaleRequest): void {

    if (!request.associationId?.trim()) {

      throw new Error(

        "La asociación es obligatoria."

      );

    }

    if (!request.createdBy?.trim()) {

      throw new Error(

        "El usuario que registra la venta es obligatorio."

      );

    }

    if (

      !Array.isArray(request.items) ||

      request.items.length === 0

    ) {

      throw new Error(

        "La venta debe contener al menos un producto."

      );

    }

    if (request.items.length > 200) {

      throw new Error(

        "La venta supera el límite de artículos permitido."

      );

    }

    const validPaymentMethods = [

      "CASH",

      "TRANSFER",

      "CARD",

      "CREDIT",

    ];

    if (

      !validPaymentMethods.includes(

        request.paymentMethod

      )

    ) {

      throw new Error(

        "El método de pago no es válido."

      );

    }

    const productIds = new Set<string>();

    for (const item of request.items) {

      if (!item.productId?.trim()) {

        throw new Error(

          "Todos los artículos deben tener un producto válido."

        );

      }

      if (productIds.has(item.productId)) {

        throw new Error(

          "No repitas el mismo producto en varias líneas de la venta. Consolida su cantidad."

        );

      }

      productIds.add(item.productId);

      if (

        !Number.isFinite(item.quantity) ||

        item.quantity <= 0

      ) {

        throw new Error(

          "La cantidad vendida debe ser mayor que cero."

        );

      }

      if (

        !Number.isFinite(item.unitPrice) ||

        item.unitPrice <= 0

      ) {

        throw new Error(

          "El precio unitario debe ser mayor que cero."

        );

      }

    }

  }

}

export const salesService = new SalesService();