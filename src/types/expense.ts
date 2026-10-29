
import type { CashPaymentMethod } from "./cash";

export type ExpenseStatus = "ACTIVE" | "CANCELLED";

export type ExpensePaymentStatus = "PAID" | "PENDING";

export interface Expense {
  // Identificación
  id: string;

  // Asociación propietaria
  associationId: string;
  associationName: string;

  // Información del gasto
  category: string;
  description: string;
  amount: number;

  // Pago
  paymentStatus: ExpensePaymentStatus;
  paymentMethod?: CashPaymentMethod;

  // Documentación de respaldo
  supplier?: string;
  invoiceNumber?: string;
  notes?: string;

  // Fechas
  expenseDate: Date;
  createdAt: Date;

  // Auditoría
  createdBy: string;

  // Estado e historial de cancelación
  status: ExpenseStatus;
  cancelledAt?: Date;
  cancelledBy?: string;
  cancelReason?: string;

  // Referencia al movimiento de caja relacionado
  cashMovementId?: string;
}
