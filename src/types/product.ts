
export interface Product {
  // Identificación
  id?: string;
  code: string;

  // Información del producto
  name: string;
  category: string;
  unit: string;

  // Existencias y costos
  stock: number;
  stockMinimo?: number;
  purchaseCostLb: number;
  lastSalePriceLb?: number;

  // Asociación propietaria
  associationId: string;
  associationName: string;

  // Estado del producto
  active?: boolean;

  // Trazabilidad del inventario
  lastMovementId?: string;
}
