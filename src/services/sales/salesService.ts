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
import { authorizationService } from "../auth/authorizationService";
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
   * Registra una venta y actualiza inventario, movimientos,
   * caja y auditoría dentro de una sola transacción.
   *
   * No llama a movementService: esta transacción ya crea
   * los movimientos y actualiza las existencias.
   */
  async createSale(request: SaleRequest): Promise<SaleResult> {
    // Normalizar los identificadores y datos de entrada.
    const normalizedRequest: SaleRequest = {
      ...request,
      associationId: request.associationId?.trim() ?? "",
      createdBy: request.createdBy?.trim() ?? "",
      customer: request.customer?.trim(),
      notes: request.notes?.trim(),
      items: Array.isArray(request.items)
        ? request.items.map((item) => ({
            ...item,
            productId: item.productId?.trim() ?? "",
          }))
        : request.items,
    };
    this.validateSale(normalizedRequest);
    const currentUser = auth.currentUser;
    if (!currentUser?.email) {
      throw new Error(
        "Debes iniciar sesión con una cuenta válida para registrar una venta."
      );
    }
    // La identidad se toma de Firebase Authentication,
    // no del valor enviado por el formulario.
    const actorEmail = currentUser.email.trim().toLowerCase();
    if (!actorEmail) {
      throw new Error(
        "No se pudo identificar al usuario autenticado."
      );
    }
    const associationId = normalizedRequest.associationId;
    // 1. Comprobar perfil, permisos y asociación.
    await authorizationService.authorizeAssociationWrite(
      associationId,
      "sales:create"
    );
    // 2. Preparar las referencias de la operación.
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
    const productRefs = normalizedRequest.items.map((item) =>
      doc(
        db,
        "associations",
        associationId,
        "products",
        item.productId
      )
    );
    // Se genera una referencia por línea de venta.
    const movementRefs = normalizedRequest.items.map(() =>
      doc(
        collection(
          db,
          "associations",
          associationId,
          "movements"
        )
      )
    );
    // Una venta a crédito no representa un ingreso inmediato.
    const cashRef =
      normalizedRequest.paymentMethod === "CREDIT"
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
    // 3. Procesar todos los cambios de forma atómica.
    return runTransaction(db, async (transaction) => {
      // Leer todos los productos antes de comenzar a escribir.
      const productSnapshots = await Promise.all(
        productRefs.map((ref) => transaction.get(ref))
      );
      const preparedItems: PreparedSaleItem[] = [];
      let associationName = "";
      let total = 0;
      for (
        let index = 0;
        index < normalizedRequest.items.length;
        index++
      ) {
        const item = normalizedRequest.items[index];
        const snapshot = productSnapshots[index];
        if (!snapshot.exists()) {
          throw new Error(
            `No existe el producto ${item.productId} en esta asociación.`
          );
        }
        const product = snapshot.data();
        // No vender productos desactivados.
        // Los documentos antiguos sin active siguen siendo válidos.
        if (product.active === false) {
          throw new Error(
            `El producto ${item.productId} está desactivado y no puede utilizarse en una venta.`
          );
        }
        // Verificar que el producto corresponde a la asociación.
        if (
          product.associationId &&
          product.associationId !== associationId
        ) {
          throw new Error(
            `El producto ${item.productId} pertenece a otra asociación.`
          );
        }
        const productName = String(product.name ?? "").trim();
        const productCode = String(
          product.code ?? item.productId
        ).trim();
        const unit = String(product.unit ?? "").trim();
        const currentAssociationName = String(
          product.associationName ?? ""
        ).trim();
        if (
          !productName ||
          !productCode ||
          !unit ||
          !currentAssociationName
        ) {
          throw new Error(
            `El producto ${item.productId} no tiene completos su código, nombre, unidad o asociación.`
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
        const previousStock = Number(product.stock ?? 0);
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
        // 4. Impedir que la venta deje existencias negativas.
        if (previousStock < item.quantity) {
          throw new Error(
            `Existencias insuficientes para ${productName}. ` +
            `Disponibles: ${previousStock}; solicitadas: ${item.quantity}.`
          );
        }
        const newStock = previousStock - item.quantity;
        const lineTotal = roundMoney(
          item.quantity * item.unitPrice
        );
        if (
          !Number.isFinite(newStock) ||
          newStock < 0 ||
          !Number.isFinite(lineTotal) ||
          lineTotal <= 0
        ) {
          throw new Error(
            `No se pudo calcular correctamente la venta de ${productName}.`
          );
        }
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
      if (!Number.isFinite(total) || total <= 0) {
        throw new Error(
          "El total de la venta debe ser mayor que cero."
        );
      }
      // 5. Construir el documento de la venta.
      const saleData = {
        code: saleCode,
        associationId,
        associationName,
        customer: normalizedRequest.customer || null,
        paymentMethod: normalizedRequest.paymentMethod,
        paymentStatus:
          normalizedRequest.paymentMethod === "CREDIT"
            ? "PENDING"
            : "PAID",
        notes: normalizedRequest.notes || null,
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
      // 6. Actualizar cada producto y registrar su movimiento.
      for (
        let index = 0;
        index < preparedItems.length;
        index++
      ) {
        const item = preparedItems[index];
        const productRef = productRefs[index];
        const movementRef = movementRefs[index];
        // El movimiento y la actualización del stock se confirman
        // juntos; lastMovementId apunta a este movimiento.
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
      // 7. Registrar el ingreso de caja cuando el pago
      // se haya efectuado y no sea una venta a crédito.
      if (cashRef) {
        transaction.set(cashRef, {
          associationId,
          associationName,
          type: "INCOME",
          amount: total,
          paymentMethod: normalizedRequest.paymentMethod,
          concept: `Venta ${saleCode}`,
          referenceType: "SALE",
          referenceId: saleRef.id,
          createdBy: actorEmail,
          createdByUid: currentUser.uid,
          createdAt: serverTimestamp(),
          status: "ACTIVE",
          customer: normalizedRequest.customer || null,
        });
      }
      // 8. Guardar la auditoría en la misma transacción.
      transaction.set(auditRef, {
        action: "SALE_CREATED",
        actorUid: currentUser.uid,
        actorEmail,
        createdBy: actorEmail,
        associationId,
        entityType: "sale",
        entityId: saleRef.id,
        details: {
          saleCode,
          total,
          paymentMethod: normalizedRequest.paymentMethod,
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
   * Corrige una venta existente exclusivamente desde el Administrador global.
   * La corrección conserva la instantánea original, registra el ajuste de stock
   * y concilia caja en una sola transacción de Firestore.
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
      throw new Error("La asociación es obligatoria.");
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
    const validPaymentMethods = new Set([
      "CASH",
      "TRANSFER",
      "CARD",
      "CREDIT",
    ]);
    if (!validPaymentMethods.has(request.paymentMethod)) {
      throw new Error("El método de pago no es válido.");
    }
    // Comprobar duplicados después de normalizar los IDs.
    const productIds = new Set<string>();
    for (const item of request.items) {
      const productId = item.productId?.trim();
      if (!productId) {
        throw new Error(
          "Todos los artículos deben tener un producto válido."
        );
      }
      if (productIds.has(productId)) {
        throw new Error(
          "No repitas el mismo producto en varias líneas de la venta. Consolida su cantidad."
        );
      }
      productIds.add(productId);
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