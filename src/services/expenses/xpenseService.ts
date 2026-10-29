
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import type {
  DocumentData,
  DocumentReference,
} from "firebase/firestore";

import { auth } from "../../firebase/auth";
import { db } from "../../firebase/firestore";

import type {
  Expense,
  ExpensePaymentStatus,
} from "../../types/expense";

import type {
  CashPaymentMethod,
} from "../../types/cash";

import type {
  UserProfile,
} from "../../types/user";

import {
  authorizationService,
} from "../auth/authorizationService";

export type CreateExpenseInput = Omit<
  Expense,
  | "id"
  | "createdAt"
  | "status"
  | "cancelledAt"
  | "cancelledBy"
  | "cancelReason"
  | "cashMovementId"
>;

class ExpenseService {
  private expensesCollection(associationId: string) {
    return collection(
      db,
      "associations",
      associationId,
      "expenses"
    );
  }

  /**
   * Comprueba que el usuario pueda consultar los gastos
   * de la asociación indicada.
   */
  private async authorizeAssociationRead(
    associationId: string
  ): Promise<UserProfile> {
    const currentUser = auth.currentUser;

    if (!currentUser?.email) {
      throw new Error(
        "Debes iniciar sesión para consultar los gastos."
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
      throw new Error("La cuenta está inactiva.");
    }

    const validRoles: UserProfile["role"][] = [
      "Administrador",
      "Vendedor",
      "Consulta",
    ];

    if (!validRoles.includes(profile.role)) {
      throw new Error(
        "El perfil no tiene permiso para consultar gastos."
      );
    }

    const isGlobalAdmin =
      profile.role === "Administrador" &&
      profile.associationId?.trim().toLowerCase() === "todas";

    const belongsToAssociation =
      profile.associationId?.trim() === associationId;

    if (!isGlobalAdmin && !belongsToAssociation) {
      throw new Error(
        "No tienes autorización para consultar los gastos de esta asociación."
      );
    }

    return profile;
  }

  /**
   * Registra un gasto y su auditoría.
   * Los gastos pendientes no afectan la caja.
   * Los pagados generan también un egreso de caja.
   */
  async createExpense(
    input: CreateExpenseInput
  ): Promise<string> {
    this.validateExpense(input);

    const currentUser = auth.currentUser;

    if (!currentUser?.email) {
      throw new Error(
        "Debes iniciar sesión para registrar un gasto."
      );
    }

    const associationId = input.associationId.trim();
    const associationName = input.associationName.trim();
    const createdBy = currentUser.email;
    await authorizationService.authorizeAssociationWrite(
      associationId,
      "expenses:create"
    );
    const batch = writeBatch(db);

    const expenseRef = doc(
      this.expensesCollection(associationId)
    );

    let cashMovementId: string | undefined;

    const expenseData = {
      associationId,
      associationName,
      category: input.category.trim(),
      description: input.description.trim(),
      amount: input.amount,
      paymentStatus: input.paymentStatus,
      expenseDate: input.expenseDate,
      createdAt: serverTimestamp(),
      createdBy,
      createdByUid: currentUser.uid,
      status: "ACTIVE",

      ...(input.paymentMethod
        ? { paymentMethod: input.paymentMethod }
        : {}),

      ...(input.supplier?.trim()
        ? { supplier: input.supplier.trim() }
        : {}),

      ...(input.invoiceNumber?.trim()
        ? { invoiceNumber: input.invoiceNumber.trim() }
        : {}),

      ...(input.notes?.trim()
        ? { notes: input.notes.trim() }
        : {}),
    };

    if (input.paymentStatus === "PAID") {
      const cashRef = doc(
        collection(
          db,
          "associations",
          associationId,
          "cashMovements"
        )
      );

      cashMovementId = cashRef.id;

      batch.set(cashRef, {
        associationId,
        associationName,
        type: "EXPENSE",
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        concept: input.description.trim(),
        referenceType: "EXPENSE",
        referenceId: expenseRef.id,
        createdBy,
        createdByUid: currentUser.uid,
        createdAt: serverTimestamp(),
        status: "ACTIVE",

        ...(input.notes?.trim()
          ? { notes: input.notes.trim() }
          : {}),
      });
    }

    batch.set(expenseRef, {
      ...expenseData,

      ...(cashMovementId
        ? { cashMovementId }
        : {}),
    });

    const auditRef = doc(
      collection(db, "auditLogs")
    );

    batch.set(auditRef, {
      action: "EXPENSE_CREATED",
      actorUid: currentUser.uid,
      actorEmail: createdBy,
      createdBy,
      associationId,
      entityType: "expense",
      entityId: expenseRef.id,
      details: {
        amount: input.amount,
        category: input.category.trim(),
        paymentStatus: input.paymentStatus,
        cashMovementId: cashMovementId ?? null,
      },
      createdAt: serverTimestamp(),
    });

    // El gasto, el eventual movimiento de caja y su auditoría
    // se guardan juntos.
    await batch.commit();

    return expenseRef.id;
  }

  /**
   * Consulta los gastos de una asociación autorizada.
   */
  async getExpenses(
    associationId: string
  ): Promise<Expense[]> {
    const normalizedAssociationId = associationId.trim();

    if (!normalizedAssociationId) {
      throw new Error(
        "La asociación es obligatoria."
      );
    }

    await this.authorizeAssociationRead(
      normalizedAssociationId
    );

    const snapshot = await getDocs(
      this.expensesCollection(normalizedAssociationId)
    );

    return snapshot.docs
      .map((document) => {
        const data = document.data();

        return {
          ...data,
          id: document.id,
          expenseDate: this.toDate(data.expenseDate),
          createdAt: this.toDate(data.createdAt),

          ...(data.cancelledAt
            ? {
                cancelledAt: this.toDate(
                  data.cancelledAt
                ),
              }
            : {}),
        } as Expense;
      })
      .sort(
        (a, b) =>
          b.expenseDate.getTime() -
          a.expenseDate.getTime()
      );
  }

  /**
   * Cancela un gasto sin eliminar el documento.
   * Si existe un movimiento de caja relacionado,
   * ambos se actualizan junto con la auditoría
   * en una sola transacción.
   */
  async cancelExpense(
    associationId: string,
    expenseId: string,
    reason: string
  ): Promise<void> {
    const normalizedAssociationId = associationId.trim();
    const normalizedExpenseId = expenseId.trim();
    const normalizedReason = reason.trim();

    if (
      !normalizedAssociationId ||
      !normalizedExpenseId
    ) {
      throw new Error(
        "La asociación y el identificador del gasto son obligatorios."
      );
    }

    if (!normalizedReason) {
      throw new Error(
        "Debes indicar el motivo de la cancelación."
      );
    }

    const currentUser = auth.currentUser;

    if (!currentUser?.email) {
      throw new Error(
        "Debes iniciar sesión para cancelar un gasto."
      );
    }

    const actorEmail = currentUser.email;

    await authorizationService.authorizeAssociationWrite(
      normalizedAssociationId,
      "expenses:cancel"
    );

    const expenseRef = doc(
      db,
      "associations",
      normalizedAssociationId,
      "expenses",
      normalizedExpenseId
    );

    const auditRef = doc(
      collection(db, "auditLogs")
    );

    await runTransaction(db, async (transaction) => {
      // Primero se leen todos los documentos necesarios.
      const expenseSnapshot = await transaction.get(
        expenseRef
      );

      if (!expenseSnapshot.exists()) {
        throw new Error("El gasto no existe.");
      }

      const expense = expenseSnapshot.data();

      if (
        expense.associationId &&
        expense.associationId !== normalizedAssociationId
      ) {
        throw new Error(
          "El gasto no pertenece a esta asociación."
        );
      }

      if (
        expense.status === "CANCELLED" ||
        expense.status === "DELETED"
      ) {
        throw new Error(
          "El gasto ya está cancelado."
        );
      }

      // Referencia con tipo explícito para evitar que
      // Firestore y TypeScript infieran un tipo unknown.
      let cashRef: DocumentReference<DocumentData> | null =
        null;

      if (expense.cashMovementId) {
        const currentCashRef = doc(
          db,
          "associations",
          normalizedAssociationId,
          "cashMovements",
          String(expense.cashMovementId)
        );

        const currentCashSnapshot = await transaction.get(
          currentCashRef
        );

        if (!currentCashSnapshot.exists()) {
          throw new Error(
            "No se encontró el movimiento de caja asociado. No se canceló el gasto."
          );
        }

        const cashData = currentCashSnapshot.data();

        if (!cashData) {
          throw new Error(
            "No se pudieron leer los datos del movimiento de caja."
          );
        }

        if (
          cashData.associationId !== normalizedAssociationId
        ) {
          throw new Error(
            "El movimiento de caja no pertenece a esta asociación."
          );
        }

        if (cashData.status !== "ACTIVE") {
          throw new Error(
            "El movimiento de caja ya no está activo. Revisa la operación antes de cancelarla."
          );
        }

        if (
          cashData.referenceId &&
          cashData.referenceId !== normalizedExpenseId
        ) {
          throw new Error(
            "La referencia del movimiento de caja no coincide con el gasto."
          );
        }

        cashRef = currentCashRef;
      }

      // Todas las lecturas terminaron. Ahora se escriben
      // la cancelación y su auditoría atómicamente.
      transaction.update(expenseRef, {
        status: "CANCELLED",
        cancelledAt: serverTimestamp(),
        cancelledBy: actorEmail,
        cancelReason: normalizedReason,
      });

      if (cashRef) {
        transaction.update(cashRef, {
          status: "CANCELLED",
          cancelledAt: serverTimestamp(),
          cancelledBy: actorEmail,
          cancelReason: normalizedReason,
        });
      }

      transaction.set(auditRef, {
        action: "EXPENSE_CANCELLED",
        actorUid: currentUser.uid,
        actorEmail,
        createdBy: actorEmail,
        associationId: normalizedAssociationId,
        entityType: "expense",
        entityId: normalizedExpenseId,
        details: {
          reason: normalizedReason,
          cashMovementId: expense.cashMovementId ?? null,
          previousStatus: expense.status ?? null,
        },
        createdAt: serverTimestamp(),
      });
    });
  }

  private validateExpense(
    input: CreateExpenseInput
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

    if (!input.category?.trim()) {
      throw new Error(
        "La categoría del gasto es obligatoria."
      );
    }

    if (!input.description?.trim()) {
      throw new Error(
        "La descripción del gasto es obligatoria."
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

    if (
      !(input.expenseDate instanceof Date) ||
      Number.isNaN(input.expenseDate.getTime())
    ) {
      throw new Error(
        "La fecha del gasto no es válida."
      );
    }

    if (!input.createdBy?.trim()) {
      throw new Error(
        "El usuario que registra el gasto es obligatorio."
      );
    }

    const validStatuses: ExpensePaymentStatus[] = [
      "PAID",
      "PENDING",
    ];

    if (!validStatuses.includes(input.paymentStatus)) {
      throw new Error(
        "El estado de pago no es válido."
      );
    }

    if (
      input.paymentStatus === "PAID" &&
      !input.paymentMethod
    ) {
      throw new Error(
        "Debes indicar el método de pago para un gasto pagado."
      );
    }

    const validMethods: CashPaymentMethod[] = [
      "CASH",
      "TRANSFER",
      "CARD",
      "OTHER",
    ];

    if (
      input.paymentMethod &&
      !validMethods.includes(input.paymentMethod)
    ) {
      throw new Error(
        "El método de pago no es válido."
      );
    }
  }

  private toDate(value: unknown): Date {
    if (value instanceof Date) {
      return value;
    }

    if (
      value &&
      typeof value === "object" &&
      "toDate" in value &&
      typeof value.toDate === "function"
    ) {
      return value.toDate();
    }

    throw new Error(
      "Se encontró una fecha inválida en Firestore."
    );
  }
}

export const expenseService = new ExpenseService();

export { ExpenseService };
