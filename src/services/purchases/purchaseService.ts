import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth } from "../../firebase/auth";
import { db } from "../../firebase/firestore";
import type { PurchaseRequest } from "../../types/dto";
import type { Movement } from "../../types/movement";
import { ValuationService } from "../inventory/valuationService";
import { authorizationService } from "../auth/authorizationService";
import { transactionCorrectionService } from "../admin/transactionCorrectionService";
interface PreparedPurchaseItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  previousStock: number;
  newStock: number;
  averageCost: number;
  salePrice: number;
}
function roundMoney(value: number): number {
  return (
    Math.round((value + Number.EPSILON) * 100) / 100
  );
}
function roundCost(value: number): number {
  return (
    Math.round((value + Number.EPSILON) * 10000) /
    10000
  );
}
export class PurchaseService {
  private valuationService = new ValuationService();
  async createPurchase(
    request: PurchaseRequest
  ): Promise<{ id: string; code: string; total: number }> {
    this.validatePurchase(request);
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error(
        "Debes iniciar sesión para registrar una compra."
      );
    }
    const actorEmail =
      currentUser.email ?? request.createdBy.trim();
    if (!actorEmail) {
      throw new Error(
        "No se pudo identificar al usuario que registra la compra."
      );
    }
    const associationId = request.associationId.trim();
    // 1. Verificar permisos para operar en la asociación.
    await authorizationService.authorizeAssociationWrite(
      associationId,
      "purchases:create"
    );
    const purchaseRef = doc(
      collection(
        db,
        "associations",
        associationId,
        "purchases"
      )
    );
    const year = new Date().getFullYear();
    const purchaseCode =
      `COM-${year}-${purchaseRef.id
        .slice(0, 10)
        .toUpperCase()}`;
    const productRefs = request.items.map((item) =>
      doc(
        db,
        "associations",
        associationId,
        "products",
        item.productId
      )
    );
    // Un movimiento histórico por cada producto de la compra.
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
    // Las compras a crédito no generan egreso inmediato de caja.
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
      // 2. Leer todos los productos antes de realizar escrituras.
      const productSnapshots = await Promise.all(
        productRefs.map((ref) => transaction.get(ref))
      );
      const preparedItems: PreparedPurchaseItem[] = [];
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
        // 3. No permitir compras de productos desactivados.
        // Los documentos antiguos sin este campo siguen siendo válidos.
        if (product.active === false) {
          throw new Error(
            `El producto ${item.productId} está desactivado y no puede utilizarse en una compra.`
          );
        }
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
        const currentCost = Number(
          product.purchaseCostLb ?? 0
        );
        const salePrice = Number(
          product.lastSalePriceLb ?? 0
        );
        if (
          !Number.isFinite(previousStock) ||
          previousStock < 0
        ) {
          throw new Error(
            `Las existencias actuales de ${productName} no son válidas.`
          );
        }
        if (
          previousStock > 0 &&
          (
            !Number.isFinite(currentCost) ||
            currentCost < 0
          )
        ) {
          throw new Error(
            `El costo actual de ${productName} no es válido.`
          );
        }
        // 4. Calcular las nuevas existencias y el costo promedio.
        const newStock = previousStock + item.quantity;
        const averageCost =
          previousStock === 0
            ? roundCost(item.unitPrice)
            : roundCost(
                this.valuationService.calculateAverageCost(
                  previousStock,
                  currentCost,
                  item.quantity,
                  item.unitPrice
                )
              );
        if (
          !Number.isFinite(newStock) ||
          !Number.isFinite(averageCost) ||
          averageCost < 0
        ) {
          throw new Error(
            `No se pudo calcular correctamente el inventario de ${productName}.`
          );
        }
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
          averageCost,
          salePrice:
            Number.isFinite(salePrice) ? salePrice : 0,
        });
      }
      // 5. Preparar el documento de compra.
      const purchaseData = {
        code: purchaseCode,
        associationId,
        associationName,
        supplier: request.supplier?.trim() || null,
        invoiceNumber:
          request.invoiceNumber?.trim() || null,
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
          averageCostAfter: item.averageCost,
        })),
        subtotal: total,
        total,
        createdBy: actorEmail,
        createdByUid: currentUser.uid,
        createdAt: serverTimestamp(),
        transactionDate,
        status: "ACTIVE",
      };
      // 6. Registrar la compra.
      transaction.set(purchaseRef, purchaseData);
      // 7. Actualizar inventario y registrar movimientos históricos.
      for (
        let index = 0;
        index < preparedItems.length;
        index++
      ) {
        const item = preparedItems[index];
        const productRef = productRefs[index];
        const movementRef = movementRefs[index];
        // Actualizar existencias, costo promedio y referencia histórica.
        transaction.update(productRef, {
          stock: item.newStock,
          purchaseCostLb: item.averageCost,
          lastMovementId: movementRef.id,
          updatedAt: serverTimestamp(),
        });
        const movement: Omit<
          Movement,
          "createdAt" | "updatedAt"
        > = {
          id: movementRef.id,
          type: "Compra",
          date: transactionDate,
          code: purchaseCode,
          product: item.productName,
          qty: item.quantity,
          purchaseCostLb: item.unitPrice,
          salePriceLb: item.salePrice,
          associationId,
          associationName,
          userEmail: actorEmail,
          status: "active",
          // No incluir campos undefined en Firestore.
          ...(request.supplier?.trim()
            ? {
                supplierName: request.supplier.trim(),
              }
            : {}),
        };
        transaction.set(movementRef, {
          ...movement,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          productId: item.productId,
          purchaseId: purchaseRef.id,
          productCode: item.productCode,
          unit: item.unit,
          stockBefore: item.previousStock,
          stockAfter: item.newStock,
          averageCostAfter: item.averageCost,
          lineTotal: item.lineTotal,
          referenceType: "PURCHASE",
        });
      }
      // 8. Registrar el egreso si la compra fue pagada.
      if (cashRef) {
        transaction.set(cashRef, {
          associationId,
          associationName,
          type: "EXPENSE",
          amount: total,
          paymentMethod: request.paymentMethod,
          concept: `Compra ${purchaseCode}`,
          referenceType: "PURCHASE",
          referenceId: purchaseRef.id,
          createdBy: actorEmail,
          createdAt: serverTimestamp(),
          status: "ACTIVE",
          invoiceNumber:
            request.invoiceNumber?.trim() || null,
        });
      }
      // 9. Registrar auditoría dentro de la misma transacción.
      transaction.set(auditRef, {
        action: "PURCHASE_CREATED",
        actorUid: currentUser.uid,
        actorEmail: currentUser.email,
        createdBy: actorEmail,
        associationId,
        entityType: "purchase",
        entityId: purchaseRef.id,
        details: {
          purchaseCode,
          total,
          paymentMethod: request.paymentMethod,
          itemCount: preparedItems.length,
          cashMovementId: cashRef?.id ?? null,
        },
        createdAt: serverTimestamp(),
      });
      return {
        id: purchaseRef.id,
        code: purchaseCode,
        total,
      };
    });
  }
  /**
   * Corrige una compra existente exclusivamente desde el Administrador global.
   * La corrección registra una instantánea de antes/después, concilia el stock
   * con movimientos de tipo Ajuste y corrige caja sin eliminar su historial.
   */
  async correctPurchase(
    purchaseId: string,
    request: PurchaseRequest,
    reason: string
  ): Promise<{ id: string; code: string; total: number; correctionId: string }> {
    return transactionCorrectionService.correctPurchase(
      purchaseId,
      request,
      reason
    );
  }

  private validatePurchase(
    request: PurchaseRequest
  ): void {
    if (!request.associationId?.trim()) {
      throw new Error(
        "La asociación es obligatoria."
      );
    }
    if (!request.createdBy?.trim()) {
      throw new Error(
        "El usuario que registra la compra es obligatorio."
      );
    }
    if (
      !Array.isArray(request.items) ||
      request.items.length === 0
    ) {
      throw new Error(
        "La compra debe contener al menos un producto."
      );
    }
    if (request.items.length > 200) {
      throw new Error(
        "La compra supera el límite de artículos permitido."
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
          "No repitas el mismo producto en varias líneas de la compra. Consolida su cantidad."
        );
      }
      productIds.add(item.productId);
      if (
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0
      ) {
        throw new Error(
          "La cantidad de cada producto debe ser mayor que cero."
        );
      }
      if (
        !Number.isFinite(item.unitPrice) ||
        item.unitPrice <= 0
      ) {
        throw new Error(
          "El costo unitario de cada producto debe ser mayor que cero."
        );
      }
    }
  }
}

export const purchaseService = new PurchaseService();