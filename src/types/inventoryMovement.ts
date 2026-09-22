export type MovementType =
  | "PURCHASE"
  | "SALE"
  | "PRODUCTION"
  | "LOSS"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT";

export interface InventoryMovement {

  //=========================================
  // Identificación
  //=========================================

  id: string;
  type: MovementType;

  //=========================================
  // Asociación
  //=========================================

  associationId: string;
  associationName: string;

  //=========================================
  // Producto
  //=========================================

  productId: string;
  speciesId: string;
  speciesName: string;

  categoryId: string;
  categoryName: string;

  unitId: string;
  unitName: string;

  //=========================================
  // Movimiento
  //=========================================

  quantity: number;
  unitPrice: number;
  total: number;

  //=========================================
  // Observaciones
  //=========================================

  notes?: string;

  //=========================================
  // Auditoría
  //=========================================

  createdBy: string;
  createdAt: Date;

  //=========================================
  // Estado
  //=========================================

  status: "ACTIVE" | "CANCELLED";

  cancelledAt?: Date;
  cancelledBy?: string;
  cancelReason?: string;

  // Movimiento que reemplaza o anula otro
  referenceMovementId?: string;
}