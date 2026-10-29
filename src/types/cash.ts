export type CashMovementType =
  | "INCOME"
  | "EXPENSE";

export type CashPaymentMethod =
  | "CASH"
  | "TRANSFER"
  | "CARD"
  | "OTHER";

export type CashReferenceType =
  | "PURCHASE"
  | "SALE"
  | "EXPENSE"
  | "MANUAL"
  | "ADJUSTMENT";

export type CashMovementStatus =
  | "ACTIVE"
  | "CANCELLED";

export interface CashMovement {
  // Identificación del movimiento
  id: string;

  // Asociación propietaria
  associationId: string;
  associationName: string;

  // Tipo e importe
  type: CashMovementType;
  amount: number;
  paymentMethod: CashPaymentMethod;

  // Descripción
  concept: string;
  notes?: string;

  // Documento que origina el movimiento
  referenceType: CashReferenceType;
  referenceId?: string;

  // Auditoría
  createdBy: string;
  createdAt: Date;

  // Estado e historial de cancelación
  status: CashMovementStatus;
  cancelledAt?: Date;
  cancelledBy?: string;
  cancelReason?: string;
  referenceMovementId?: string;
}