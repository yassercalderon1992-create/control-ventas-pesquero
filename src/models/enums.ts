//=========================================
// Roles
//=========================================

export enum UserRole {

    ADMIN = "ADMIN",
  
    ASSOCIATION = "ASSOCIATION",
  
  }
  
  //=========================================
  // Movimientos de Inventario
  //=========================================
  
  export enum MovementType {
  
    PURCHASE = "PURCHASE",
  
    SALE = "SALE",
  
    PRODUCTION = "PRODUCTION",
  
    LOSS = "LOSS",
  
    ADJUSTMENT_IN = "ADJUSTMENT_IN",
  
    ADJUSTMENT_OUT = "ADJUSTMENT_OUT",
  
  }
  
  //=========================================
  // Estado del movimiento
  //=========================================
  
  export enum MovementStatus {
  
    ACTIVE = "ACTIVE",
  
    CANCELLED = "CANCELLED",
  
  }
  
  //=========================================
  // Estado del producto
  //=========================================
  
  export enum ProductStatus {
  
    ACTIVE = "ACTIVE",
  
    INACTIVE = "INACTIVE",
  
  }
  
  //=========================================
  // Estado de compras
  //=========================================
  
  export enum PurchaseStatus {
  
    DRAFT = "DRAFT",
  
    COMPLETED = "COMPLETED",
  
    CANCELLED = "CANCELLED",
  
  }
  
  //=========================================
  // Estado de ventas
  //=========================================
  
  export enum SaleStatus {
  
    DRAFT = "DRAFT",
  
    COMPLETED = "COMPLETED",
  
    CANCELLED = "CANCELLED",
  
  }
  
  //=========================================
  // Métodos de pago
  //=========================================
  
  export enum PaymentMethod {
  
    CASH = "CASH",
  
    TRANSFER = "TRANSFER",
  
    CARD = "CARD",
  
    CREDIT = "CREDIT",
  
  }