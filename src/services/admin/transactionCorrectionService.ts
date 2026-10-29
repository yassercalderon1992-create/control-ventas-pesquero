import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    runTransaction,
    serverTimestamp,
    where,
    type DocumentData,
    type DocumentReference,
  } from "firebase/firestore";
  
  import { auth } from "../../firebase/auth";
  import { db } from "../../firebase/firestore";
  import type { PurchaseRequest, SaleRequest } from "../../types/dto";
  
  type CorrectionEntity = "purchase" | "sale";
  type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "CREDIT";
  type DataMap = Record<string, unknown>;
  
  interface CorrectionLine {
    productId: string;
    quantity: number;
    unitPrice: number;
   }
  
  interface ExistingLineSummary {
    productId: string;
    quantity: number;
    totalValue: number;
    averageUnitPrice: number;
    snapshot?: DataMap;
   }
  
  
  
  interface PreparedProductChange {
    productId: string;
    productCode: string;
    productName: string;
    unit: string;
    stockBefore: number;
    stockAfter: number;
    stockDelta: number;
    costBefore: number;
    costAfter: number;
    salePriceBefore: number;
    salePriceAfter: number;
    movementRef: DocumentReference<DocumentData>;
   }
  
  interface CorrectionInput {
    associationId: string;
    items: CorrectionLine[];
    paymentMethod: PaymentMethod;
    supplier?: string;
    invoiceNumber?: string;
    customer?: string;
    notes?: string;
   }
  
  const roundMoney = (value: number): number =>
    Math.round((value + Number.EPSILON) * 100) / 100;
  
  const roundCost = (value: number): number =>
    Math.round((value + Number.EPSILON) * 10000) / 10000;
  
  function asRecord(value: unknown): DataMap {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as DataMap;
    }
    return {};
   }
  
  function asString(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
   }
  
  function asNumber(value: unknown, fallback = 0): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
   }
  
  function normalizedItems(value: unknown): DataMap[] {
    return Array.isArray(value) ? value.map(asRecord) : [];
   }
  
  function summarizeExistingItems(items: DataMap[]): Map<string, ExistingLineSummary> {
    const summary = new Map<string, ExistingLineSummary>();
    for (const item of items) {
      const productId = asString(item.productId).trim();
      const quantity = asNumber(item.quantity, 0);
      const unitPrice = asNumber(item.unitPrice, 0);
      if (!productId || quantity <= 0) continue;
      const existing = summary.get(productId);
      const oldQuantity = existing?.quantity ?? 0;
      const totalValue = (existing?.totalValue ?? 0) + quantity * unitPrice;
      const nextQuantity = oldQuantity + quantity;
      summary.set(productId, {
        productId,
        quantity: nextQuantity,
        totalValue,
        averageUnitPrice: nextQuantity > 0 ? totalValue / nextQuantity : 0,
        snapshot: existing?.snapshot ?? item,
      });
    }
    return summary;
   }
  
  function normalizeCorrectionInput(input: CorrectionInput): CorrectionInput {
    return {
      ...input,
      associationId: input.associationId?.trim() ?? "",
      supplier: input.supplier?.trim() ?? "",
      invoiceNumber: input.invoiceNumber?.trim() ?? "",
      customer: input.customer?.trim() ?? "",
      notes: input.notes?.trim() ?? "",
      items: Array.isArray(input.items)
        ? input.items.map((item) => ({
            productId: item.productId?.trim() ?? "",
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
          }))
        : [],
    };
   }
  
  export class TransactionCorrectionService {
    private async assertGlobalAdmin(): Promise<{ uid: string; email: string }> {
      const currentUser = auth.currentUser;
      if (!currentUser?.email) {
        throw new Error("Debes iniciar sesión para corregir una compra o venta.");
      }
  
      const email = currentUser.email.trim().toLowerCase();
      const profileSnapshot = await getDoc(doc(db, "users", email));
      if (!profileSnapshot.exists()) {
        throw new Error("No existe un perfil para el usuario autenticado.");
      }
  
      const profile = profileSnapshot.data();
      const isGlobalAdmin =
        profile.active === true &&
        profile.role === "Administrador" &&
        asString(profile.associationId).trim().toLowerCase() === "todas";
  
      if (!isGlobalAdmin) {
        throw new Error("Solo el Administrador global puede corregir compras y ventas.");
      }
  
      return { uid: currentUser.uid, email };
    }
  
    async correctPurchase(
      purchaseId: string,
      request: PurchaseRequest,
      reason: string
    ): Promise<{ id: string; code: string; total: number; correctionId: string }> {
      return this.correctTransaction(
        "purchase",
        purchaseId,
        request as unknown as CorrectionInput,
        reason
      );
    }
  
    async correctSale(
      saleId: string,
      request: SaleRequest,
      reason: string
    ): Promise<{ id: string; code: string; total: number; correctionId: string }> {
      return this.correctTransaction(
        "sale",
        saleId,
        request as unknown as CorrectionInput,
        reason
      );
    }
  
    private async correctTransaction(
      entityType: CorrectionEntity,
      transactionId: string,
      rawRequest: CorrectionInput,
      reasonInput: string
    ): Promise<{ id: string; code: string; total: number; correctionId: string }> {
      const actor = await this.assertGlobalAdmin();
      const request = normalizeCorrectionInput(rawRequest);
      const reason = reasonInput.trim();
  
      if (!transactionId.trim()) throw new Error("El identificador de la operación es obligatorio.");
      if (!request.associationId) throw new Error("La asociación es obligatoria.");
      if (reason.length < 5) throw new Error("Indica un motivo de corrección de al menos 5 caracteres.");
      if (!Array.isArray(request.items) || request.items.length === 0) {
        throw new Error("La operación corregida debe contener al menos un producto.");
      }
      if (request.items.length > 200) throw new Error("La operación supera el límite de 200 artículos.");
      if (!["CASH", "TRANSFER", "CARD", "CREDIT"].includes(request.paymentMethod)) {
        throw new Error("El método de pago no es válido.");
      }
  
      const uniqueNewIds = new Set<string>();
      for (const item of request.items) {
        if (!item.productId) throw new Error("Todos los artículos deben tener un producto válido.");
        if (uniqueNewIds.has(item.productId)) {
          throw new Error("No repitas un producto en varias líneas; consolida la cantidad.");
        }
        uniqueNewIds.add(item.productId);
        if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
          throw new Error("La cantidad de cada producto debe ser mayor que cero.");
        }
        if (!Number.isFinite(item.unitPrice) || item.unitPrice <= 0) {
          throw new Error("El precio unitario debe ser mayor que cero.");
        }
      }
  
      const collectionName = entityType === "purchase" ? "purchases" : "sales";
      const referenceType = entityType === "purchase" ? "PURCHASE" : "SALE";
      const correctedCashType = entityType === "purchase" ? "EXPENSE" : "INCOME";
      const originalRef = doc(db, "associations", request.associationId, collectionName, transactionId);
      const initialSnapshot = await getDoc(originalRef);
      if (!initialSnapshot.exists()) throw new Error("No se encontró la operación que quieres corregir.");
      const initialData = initialSnapshot.data() as DataMap;
      if (asString(initialData.associationId) !== request.associationId) {
        throw new Error("La operación no pertenece a la asociación indicada.");
      }
      if (asString(initialData.status, "ACTIVE") !== "ACTIVE") {
        throw new Error("Solo se pueden corregir operaciones activas.");
      }
      const initialVersion = asNumber(initialData.correctionVersion, 0);
      const initialLastCorrection = asString(initialData.lastCorrectionId);
      const code = asString(initialData.code, transactionId);
  
      const originalLines = normalizedItems(initialData.items);
      const oldSummary = summarizeExistingItems(originalLines);
      const newItemsById = new Map(request.items.map((item) => [item.productId, item]));
  
      // Para corregir precio/cantidad de una compra histórica, necesitamos saber
      // si el inventario de ese producto tuvo operaciones posteriores. Si las
      // tuvo, recalcular el promedio solo con el stock actual podría distorsionar
      // la valoración de inventario; en ese caso rechazamos ese cambio de stock/costo.
      const sourcePurchaseMovementByProductId = new Map<string, string>();
      if (entityType === "purchase") {
        const purchaseMovementSnapshot = await getDocs(query(
          collection(db, "associations", request.associationId, "movements"),
          where("purchaseId", "==", transactionId)
        ));
        for (const movementDocument of purchaseMovementSnapshot.docs) {
          const movementData = movementDocument.data();
          const productId = asString(movementData.productId).trim();
          if (productId) sourcePurchaseMovementByProductId.set(productId, movementDocument.id);
        }
      }
  
      const allProductIds = Array.from(new Set([
        ...oldSummary.keys(),
        ...request.items.map((item) => item.productId),
      ]));
      // Mantener la corrección en una transacción compatible con los límites
      // de llamadas de acceso de las reglas de Firestore.
      if (allProductIds.length > 4) {
        throw new Error(
          "Por seguridad, esta primera versión solo permite corregir hasta 4 productos distintos por operación. No se ha guardado ningún cambio. No dividas manualmente la operación; para corregir una operación con más productos hay que ampliar el flujo de forma controlada."
        );
      }
  
      const productRefs = new Map(allProductIds.map((productId) => [
        productId,
        doc(db, "associations", request.associationId, "products", productId),
      ]));
      const movementRefs = new Map(allProductIds.map((productId) => [
        productId,
        doc(collection(db, "associations", request.associationId, "movements")),
      ]));
  
      const cashCollection = collection(db, "associations", request.associationId, "cashMovements");
      // Consultar por referenceId solamente evita exigir un índice compuesto.
      // Se filtra referenceType en cliente para incluir solo la caja vinculada.
      const cashQuerySnapshot = await getDocs(query(
        cashCollection,
        where("referenceId", "==", transactionId)
      ));
      const cashRefs = cashQuerySnapshot.docs
        .filter((item) => item.data().referenceType === referenceType)
        .map((item) => item.ref);
  
      const correctionRef = doc(collection(
        db,
        "associations",
        request.associationId,
        "transactionCorrections"
      ));
      const auditRef = doc(collection(db, "auditLogs"));
      const newCashRef = doc(cashCollection);
      const transactionDate = new Date().toISOString();
  
      return runTransaction(db, async (transaction) => {
        // Primero todas las lecturas; después se harán únicamente escrituras.
        const [operationSnapshot, productSnapshots, cashSnapshots] = await Promise.all([
          transaction.get(originalRef),
          Promise.all(Array.from(productRefs.values()).map((ref) => transaction.get(ref))),
          Promise.all(cashRefs.map((ref) => transaction.get(ref))),
        ]).then(([operation, products, cash]) => [operation, products, cash] as const);
  
        if (!operationSnapshot.exists()) throw new Error("La operación dejó de existir.");
        const existing = operationSnapshot.data() as DataMap;
        if (asString(existing.associationId) !== request.associationId) {
          throw new Error("La asociación de la operación cambió; vuelve a cargarla.");
        }
        if (asNumber(existing.correctionVersion, 0) !== initialVersion ||
            asString(existing.lastCorrectionId) !== initialLastCorrection) {
          throw new Error("La operación cambió mientras preparabas la corrección. Actualiza la pantalla e inténtalo de nuevo.");
        }
        if (asString(existing.status, "ACTIVE") !== "ACTIVE") {
          throw new Error("Solo se pueden corregir operaciones activas.");
        }
  
        const productsById = new Map<string, DataMap>();
        let productIndex = 0;
        for (const productId of productRefs.keys()) {
          const snapshot = productSnapshots[productIndex++];
          if (!snapshot.exists()) throw new Error(`No existe el producto ${productId} en esta asociación.`);
          const data = snapshot.data() as DataMap;
          if (data.active === false) throw new Error(`El producto ${productId} está desactivado.`);
          if (data.associationId && data.associationId !== request.associationId) {
            throw new Error(`El producto ${productId} pertenece a otra asociación.`);
          }
          productsById.set(productId, data);
        }
  
        // Bloqueo conservador para cambios de cantidad/costo de compras antiguas.
        // Solo se permite si el movimiento de esa compra sigue siendo el último
        // movimiento del producto. Las modificaciones comerciales sin impacto
        // en inventario (p. ej. proveedor/notas) siguen permitidas.
        if (entityType === "purchase") {
          for (const [productId, oldLine] of oldSummary.entries()) {
            const newLine = newItemsById.get(productId);
            const oldQuantity = oldLine.quantity;
            const newQuantity = newLine?.quantity ?? 0;
            const oldUnitPrice = oldLine.averageUnitPrice;
            const newUnitPrice = newLine?.unitPrice ?? 0;
            const quantityChanged = Math.abs(oldQuantity - newQuantity) > 0.0000001;
            const priceChanged = Math.abs(oldUnitPrice - newUnitPrice) > 0.0000001;
  
            if (!quantityChanged && !priceChanged) continue;
  
            const product = productsById.get(productId);
            const sourceMovementId = sourcePurchaseMovementByProductId.get(productId);
            if (!sourceMovementId || asString(product?.lastMovementId) !== sourceMovementId) {
              throw new Error(
                `No se puede cambiar la cantidad o el costo del producto ${asString(product?.name, productId)} en esta compra porque hay movimientos posteriores o no existe su movimiento original vinculado. Para no distorsionar el costo promedio, primero debe realizarse una reconstrucción cronológica del historial. Puedes corregir otros datos de la compra sin cambiar cantidad ni costo.`
              );
            }
          }
        }
  
        const cashBefore = cashSnapshots.map((snapshot, index) => ({
          ref: cashRefs[index],
          exists: snapshot.exists(),
          data: snapshot.exists() ? snapshot.data() as DataMap : {},
        })).filter((item) => item.exists);
        const activeCash = cashBefore.filter((item) =>
          asString(item.data.status, "ACTIVE").toUpperCase() === "ACTIVE"
        );
  
        const oldMethod = asString(existing.paymentMethod, "CASH") as PaymentMethod;
        const oldTotal = asNumber(existing.total, 0);
        const newTotal = roundMoney(request.items.reduce(
          (sum, item) => sum + item.quantity * item.unitPrice,
          0
        ));
        if (!Number.isFinite(newTotal) || newTotal <= 0) {
          throw new Error("El total corregido debe ser mayor que cero.");
        }
  
        const oldItemMap = oldSummary;
        const newItemMap = new Map(request.items.map((item) => [item.productId, item]));
        const productChanges: Record<string, DataMap> = {};
        const preparedProductChanges: PreparedProductChange[] = [];
  
        for (const productId of allProductIds) {
          const product = productsById.get(productId)!;
          const oldLine = oldItemMap.get(productId);
          const newLine = newItemMap.get(productId);
          const oldQty = oldLine?.quantity ?? 0;
          const oldUnitPrice = oldLine?.averageUnitPrice ?? 0;
          const newQty = newLine?.quantity ?? 0;
          const newUnitPrice = newLine?.unitPrice ?? 0;
          const stockBefore = asNumber(product.stock, 0);
          const costBefore = asNumber(product.purchaseCostLb, 0);
          const salePriceBefore = asNumber(product.lastSalePriceLb, 0);
          if (!Number.isFinite(stockBefore) || stockBefore < 0 ||
              !Number.isFinite(costBefore) || costBefore < 0) {
            throw new Error(`El stock o el costo actual de ${asString(product.name, productId)} no es válido.`);
          }
  
          const stockDelta = entityType === "purchase"
            ? newQty - oldQty
            : oldQty - newQty;
          const stockAfter = stockBefore + stockDelta;
          if (stockAfter < 0) {
            throw new Error(
              `La corrección dejaría existencias negativas para ${asString(product.name, productId)}. Disponibles: ${stockBefore}; ajuste: ${stockDelta}.`
            );
          }
  
          let costAfter = costBefore;
          let salePriceAfter = salePriceBefore;
          if (entityType === "purchase") {
            const priceDifference = newUnitPrice - oldUnitPrice;
            let adjustedInventoryValue = stockBefore * costBefore;
            if (stockDelta > 0) {
              adjustedInventoryValue += stockDelta * newUnitPrice;
              adjustedInventoryValue += oldQty * priceDifference;
            } else if (stockDelta < 0) {
              adjustedInventoryValue += stockDelta * costBefore;
              adjustedInventoryValue += newQty * priceDifference;
            } else {
              adjustedInventoryValue += newQty * priceDifference;
            }
            if (stockAfter > 0) costAfter = roundCost(adjustedInventoryValue / stockAfter);
            if (!Number.isFinite(costAfter) || costAfter < 0) {
              throw new Error(`No se pudo recalcular el costo promedio de ${asString(product.name, productId)}.`);
            }
          } else if (newLine) {
            salePriceAfter = newUnitPrice;
          }
  
          const needsProductUpdate = stockDelta !== 0 ||
            Math.abs(costAfter - costBefore) > 0.00001 ||
            Math.abs(salePriceAfter - salePriceBefore) > 0.00001;
          if (!needsProductUpdate) continue;
  
          const movementRef = movementRefs.get(productId)!;
          const productCode = asString(product.code, productId);
          const productName = asString(product.name, productId);
          const unit = asString(product.unit, "Unidad");
          const change: PreparedProductChange = {
            productId,
            productCode,
            productName,
            unit,
            stockBefore,
            stockAfter,
            stockDelta,
            costBefore,
            costAfter,
            salePriceBefore,
            salePriceAfter,
            movementRef,
          };
          preparedProductChanges.push(change);
          productChanges[productId] = {
            productId,
            movementId: movementRef.id,
            stockBefore,
            stockAfter,
            stockDelta,
            costBefore,
            costAfter,
            salePriceBefore,
            salePriceAfter,
          };
        }
  
        const associationName = asString(existing.associationName,
          asString(productsById.values().next().value?.associationName, request.associationId));
        const lineSnapshots: DataMap[] = request.items.map((item) => {
          const product = productsById.get(item.productId)!;
          const change = productChanges[item.productId];
          const stockBefore = change ? asNumber(change.stockBefore) : asNumber(product.stock, 0);
          const stockAfter = change ? asNumber(change.stockAfter) : stockBefore;
          const shared = {
            productId: item.productId,
            productCode: asString(product.code, item.productId),
            productName: asString(product.name, item.productId),
            unit: asString(product.unit, "Unidad"),
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: roundMoney(item.quantity * item.unitPrice),
            stockBefore,
            stockAfter,
          };
          if (entityType === "purchase") {
            return {
              ...shared,
              averageCostAfter: change ? asNumber(change.costAfter) : asNumber(product.purchaseCostLb, 0),
            };
          }
          return {
            ...shared,
            purchaseCost: change ? asNumber(change.costAfter) : asNumber(product.purchaseCostLb, 0),
          };
        });
  
        const cashChanged =
          oldTotal !== newTotal ||
          oldMethod !== request.paymentMethod ||
          ((oldMethod !== "CREDIT") !== (activeCash.length > 0)) ||
          (request.paymentMethod !== "CREDIT" && activeCash.length === 0);
  
        // Snapshot de los valores originales y los corregidos, append-only.
        const correctedSnapshot: DataMap = {
          items: lineSnapshots,
          subtotal: newTotal,
          total: newTotal,
          paymentMethod: request.paymentMethod,
          paymentStatus: request.paymentMethod === "CREDIT" ? "PENDING" : "PAID",
          notes: request.notes?.trim() || null,
          ...(entityType === "purchase" ? {
            supplier: request.supplier?.trim() || null,
            invoiceNumber: request.invoiceNumber?.trim() || null,
          } : {
            customer: request.customer?.trim() || null,
          }),
        };
  
        let currentCashMovementId: string | null =
          (activeCash[0]?.ref.id ?? "") || asString(existing.cashMovementId) || null;
        if (cashChanged) {
          for (const cash of activeCash) {
            transaction.update(cash.ref, {
              status: "CANCELLED",
              updatedAt: serverTimestamp(),
              cancelledAt: serverTimestamp(),
              cancelledBy: actor.email,
              cancelledByUid: actor.uid,
              cancelledByEmail: actor.email,
              cancellationReason: `Reconciliación por corrección ${entityType === "purchase" ? "de compra" : "de venta"} ${code}: ${reason}`,
              cancelReason: reason,
            });
          }
          currentCashMovementId = null;
          if (request.paymentMethod !== "CREDIT") {
            currentCashMovementId = newCashRef.id;
            transaction.set(newCashRef, {
              associationId: request.associationId,
              associationName,
              type: correctedCashType,
              amount: newTotal,
              paymentMethod: request.paymentMethod,
              concept: `${entityType === "purchase" ? "Compra" : "Venta"} ${code} (corrección)`,
              referenceType,
              referenceId: transactionId,
              createdBy: actor.email,
              createdByUid: actor.uid,
              actorEmail: actor.email,
              actorUid: actor.uid,
              createdAt: serverTimestamp(),
              status: "ACTIVE",
              correctionId: correctionRef.id,
              correctionReason: reason,
            });
          }
        }
        correctedSnapshot.cashMovementId = currentCashMovementId;
  
        const correctionVersion = initialVersion + 1;
        const updateData: DataMap = {
          items: lineSnapshots,
          subtotal: newTotal,
          total: newTotal,
          paymentMethod: request.paymentMethod,
          paymentStatus: request.paymentMethod === "CREDIT" ? "PENDING" : "PAID",
          notes: request.notes?.trim() || null,
          cashMovementId: currentCashMovementId,
          lastCorrectionId: correctionRef.id,
          correctionVersion,
          correctedAt: serverTimestamp(),
          correctedByUid: actor.uid,
          correctedByEmail: actor.email,
          correctionReason: reason,
          updatedAt: serverTimestamp(),
          ...(entityType === "purchase" ? {
            supplier: request.supplier?.trim() || null,
            invoiceNumber: request.invoiceNumber?.trim() || null,
          } : {
            customer: request.customer?.trim() || null,
          }),
        };
  
        const cancelledCashMovementIds = cashChanged ? activeCash.map((item) => item.ref.id) : [];
        transaction.set(correctionRef, {
          associationId: request.associationId,
          associationName,
          entityType,
          entityId: transactionId,
          entityCode: code,
          correctionVersion,
          reason,
          actorUid: actor.uid,
          actorEmail: actor.email,
          createdAt: serverTimestamp(),
          originalSnapshot: existing,
          correctedSnapshot,
          productChanges,
          cashMovementsBefore: cashBefore.map((item) => ({
            ...item.data,
            id: item.ref.id,
          })),
          cancelledCashMovementIds,
          createdCashMovementId: cashChanged && request.paymentMethod !== "CREDIT" ? newCashRef.id : null,
          status: "APPLIED",
        });
  
        // El registro comercial conserva su ID y fecha original; la versión previa
        // completa queda guardada en transactionCorrections y en auditLogs.
        transaction.update(originalRef, updateData);
  
        for (const change of preparedProductChanges) {
          transaction.update(productRefs.get(change.productId)!, {
            stock: change.stockAfter,
            purchaseCostLb: change.costAfter,
            lastSalePriceLb: change.salePriceAfter,
            lastMovementId: change.movementRef.id,
            lastCorrectionId: correctionRef.id,
            updatedAt: serverTimestamp(),
          });
  
          transaction.set(change.movementRef, {
            id: change.movementRef.id,
            type: "Ajuste",
            date: transactionDate,
            code: `COR-${code}`,
            product: change.productName,
            productId: change.productId,
            productCode: change.productCode,
            unit: change.unit,
            qty: Math.abs(change.stockDelta),
            correctionDelta: change.stockDelta,
            purchaseCostLb: change.costAfter,
            salePriceLb: change.salePriceAfter,
            associationId: request.associationId,
            associationName,
            userEmail: actor.email,
            status: "active",
            stockBefore: change.stockBefore,
            stockAfter: change.stockAfter,
            referenceType: "CORRECTION",
            correctionId: correctionRef.id,
            correctionEntityType: entityType,
            correctionEntityId: transactionId,
            correctionReason: reason,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
  
        transaction.set(auditRef, {
          action: entityType === "purchase" ? "PURCHASE_CORRECTED" : "SALE_CORRECTED",
          actorUid: actor.uid,
          actorEmail: actor.email,
          createdBy: actor.email,
          associationId: request.associationId,
          entityType,
          entityId: transactionId,
          details: {
            code,
            correctionId: correctionRef.id,
            correctionVersion,
            reason,
            totalBefore: oldTotal,
            totalAfter: newTotal,
            paymentMethodBefore: oldMethod,
            paymentMethodAfter: request.paymentMethod,
            changedProductIds: preparedProductChanges.map((item) => item.productId),
            cancelledCashMovementIds,
            createdCashMovementId: cashChanged && request.paymentMethod !== "CREDIT" ? newCashRef.id : null,
          },
          createdAt: serverTimestamp(),
        });
  
        return {
          id: transactionId,
          code,
          total: newTotal,
          correctionId: correctionRef.id,
        };
      });
    }
   }
  
  export const transactionCorrectionService = new TransactionCorrectionService();
  