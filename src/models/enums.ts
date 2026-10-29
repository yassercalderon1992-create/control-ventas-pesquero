
/**
 * Roles de usuario
 */
export const UserRole = {
  ADMIN: "ADMIN",
  ASSOCIATION: "ASSOCIATION",
} as const;

export type UserRole =
  (typeof UserRole)[keyof typeof UserRole];

/**
 * Tipos de movimientos de inventario
 */
export const MovementType = {
  PURCHASE: "PURCHASE",
  SALE: "SALE",
  PRODUCTION: "PRODUCTION",
  LOSS: "LOSS",
  ADJUSTMENT_IN: "ADJUSTMENT_IN",
  ADJUSTMENT_OUT: "ADJUSTMENT_OUT",
} as const;

export type MovementType =
  (typeof MovementType)[keyof typeof MovementType];

/**
 * Estados de movimientos de inventario
 */
export const MovementStatus = {
  ACTIVE: "ACTIVE",
  CANCELLED: "CANCELLED",
} as const;

export type MovementStatus =
  (typeof MovementStatus)[keyof typeof MovementStatus];

/**
 * Estados de productos
 */
export const ProductStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;

export type ProductStatus =
  (typeof ProductStatus)[keyof typeof ProductStatus];

/**
 * Estados de compras
 */
export const PurchaseStatus = {
  DRAFT: "DRAFT",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type PurchaseStatus =
  (typeof PurchaseStatus)[keyof typeof PurchaseStatus];

/**
 * Estados de ventas
 */
export const SaleStatus = {
  DRAFT: "DRAFT",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type SaleStatus =
  (typeof SaleStatus)[keyof typeof SaleStatus];

/**
 * Métodos de pago
 */
export const PaymentMethod = {
  CASH: "CASH",
  TRANSFER: "TRANSFER",
  CARD: "CARD",
  CREDIT: "CREDIT",
} as const;

export type PaymentMethod =
  (typeof PaymentMethod)[keyof typeof PaymentMethod];
