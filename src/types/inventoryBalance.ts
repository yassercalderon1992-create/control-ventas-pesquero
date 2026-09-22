export interface InventoryBalance {

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

  scientificName: string;

  categoryId: string;
  categoryName: string;

  unitId: string;
  unitName: string;

  //=========================================
  // Existencias
  //=========================================

  stock: number;

  averageCost: number;

  inventoryValue: number;

  //=========================================
  // Auditoría
  //=========================================

  lastMovement: Date;

  updatedAt: Date;

}