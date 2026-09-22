export interface Product {

  //=========================================
  // Identificación
  //=========================================

  id: string;
  active: boolean;

  //=========================================
  // Asociación
  //=========================================

  associationId: string;
  associationName: string;

  //=========================================
  // Categoría
  //=========================================

  categoryId: string;
  categoryName: string;

  //=========================================
  // Especie
  //=========================================

  speciesId: string;
  speciesName: string;
  scientificName: string;

  //=========================================
  // Unidad
  //=========================================

  unitId: string;
  unitName: string;

  //=========================================
  // Configuración del producto
  //=========================================

  stockMinimo: number;

  purchasePrice: number;
  salePrice: number;

  barcode?: string;
  notes?: string;
  imageUrl?: string;

  //=========================================
  // Auditoría
  //=========================================

  createdBy: string;
  createdAt: Date;

  updatedBy?: string;
  updatedAt?: Date;

  deletedAt?: Date;
}