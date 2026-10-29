
export interface Movement {
    id?: string;
  
    type: "Compra" | "Venta" | "Ajuste";
  
    date: string;
    code: string;
    product: string;
    qty: number;
  
    purchaseCostLb: number;
    salePriceLb: number;
  
    supplierName?: string;
    supplierCommunity?: string;
  
    associationId: string;
    associationName: string;
    userEmail: string;
  
    // Datos de trazabilidad para los ajustes de inventario.
    reason?: string;
    stockBefore?: number;
    stockAfter?: number;
    stockDelta?: number;
    adjustmentDirection?: "Entrada" | "Salida";
  
    status?: "active" | "deleted";
  
    createdAt?: any;
    updatedAt?: any;
  }
  