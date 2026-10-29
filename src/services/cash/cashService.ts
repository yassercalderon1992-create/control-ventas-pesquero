import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { auth } from "../../firebase/auth";
import { db } from "../../firebase/firestore";

import type {
  CashMovement,
  CashMovementType,
} from "../../types/cash";

import { authorizationService } from "../auth/authorizationService";

type CashMovementInput = Omit<
  CashMovement,
  | "id"
  | "type"
  | "createdAt"
  | "status"
  | "cancelledAt"
  | "cancelledBy"
  | "cancelReason"
>;

class CashService {
  /**
   * Registra un ingreso y su auditoría en una operación atómica.
   */
  async registerIncome(
    input: CashMovementInput
  ): Promise<string> {
    return this.registerMovement("INCOME", input);
  }

  /**
   * Registra un egreso y su auditoría en una operación atómica.
   */
  async registerExpense(
    input: CashMovementInput
  ): Promise<string> {
    return this.registerMovement("EXPENSE", input);
  }

  private async registerMovement(
    type: CashMovementType,
    input: CashMovementInput
  ): Promise<string> {
    this.validateMovement(input);

    // 1. Exigir una sesión autenticada.
    const currentUser = auth.currentUser;

    if (!currentUser?.email) {
      throw new Error(
        "Debes iniciar sesión para registrar un movimiento de caja."
      );
    }

    const actorEmail = currentUser.email;
    const associationId = input.associationId.trim();
    const associationName = input.associationName.trim();
    const concept = input.concept.trim();

    // 2. Verificar el estado, rol y asociación del usuario.
    // El perfil se consulta en Firestore mediante el servicio
    // central de autorización.
    await authorizationService.authorizeAssociationWrite(
      associationId,
      "cash:register"
    );

    // 3. Preparar referencias de Firestore.
    const cashCollection = collection(
      db,
      "associations",
      associationId,
      "cashMovements"
    );

    const cashRef = doc(cashCollection);
    const auditRef = doc(collection(db, "auditLogs"));

    const batch = writeBatch(db);

    // 4. Preparar el movimiento financiero.
    const movementData = {
      associationId,
      associationName,
      type,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      concept,

      ...(input.notes?.trim()
        ? { notes: input.notes.trim() }
        : {}),

      referenceType: input.referenceType,

      ...(input.referenceId?.trim()
        ? { referenceId: input.referenceId.trim() }
        : {}),

      createdBy: actorEmail,
      createdByUid: currentUser.uid,
      createdAt: serverTimestamp(),
      status: "ACTIVE",

      ...(input.referenceMovementId
        ? {
            referenceMovementId:
              input.referenceMovementId,
          }
        : {}),
    };

    batch.set(cashRef, movementData);

    // 5. Registrar la auditoría con la misma identidad.
    batch.set(auditRef, {
      action:
        type === "INCOME"
          ? "CASH_INCOME_REGISTERED"
          : "CASH_EXPENSE_REGISTERED",

      actorUid: currentUser.uid,
      actorEmail,
      createdBy: actorEmail,
      associationId,

      entityType: "cashMovement",
      entityId: cashRef.id,

      details: {
        type,
        amount: input.amount,
        concept,
        paymentMethod: input.paymentMethod,
        referenceType: input.referenceType,
        referenceId: input.referenceId?.trim() || null,
        referenceMovementId:
          input.referenceMovementId ?? null,
      },

      createdAt: serverTimestamp(),
    });

    // 6. Guardar el movimiento y su auditoría juntos.
    // Si falla una escritura, el lote completo no se aplica.
    await batch.commit();

    return cashRef.id;
  }

  private validateMovement(
    input: CashMovementInput
  ): void {
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

    if (
      !Number.isFinite(input.amount) ||
      input.amount <= 0
    ) {
      throw new Error(
        "El importe debe ser un número mayor que cero."
      );
    }

    if (!input.concept?.trim()) {
      throw new Error(
        "La descripción del movimiento es obligatoria."
      );
    }

    if (!input.createdBy?.trim()) {
      throw new Error(
        "El usuario que registra el movimiento es obligatorio."
      );
    }

    if (!input.paymentMethod) {
      throw new Error(
        "El método de pago es obligatorio."
      );
    }

    if (!input.referenceType) {
      throw new Error(
        "El tipo de referencia es obligatorio."
      );
    }
  }
}

export const cashService = new CashService();

export { CashService };