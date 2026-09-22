import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";

import { db } from "../../firebase/firestore";
import { Product } from "../../types/product";

class ProductService {

  // =========================================
  // Referencia a la colección de productos
  // =========================================

  private collectionRef(associationId: string) {

    return collection(
      db,
      "associations",
      associationId,
      "products"
    );

  }

  // =========================================
  // Obtener productos
  // =========================================

  async getProducts(
    associationId: string
  ): Promise<Product[]> {

    const snapshot = await getDocs(
      this.collectionRef(associationId)
    );

    return snapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as Product[];

  }

  // =========================================
  // Crear producto
  // =========================================

  async createProduct(
    product: Product
  ): Promise<string> {

    const document = await addDoc(
      this.collectionRef(product.associationId),
      {
        ...product,
        id: undefined,
      }
    );

    return document.id;

  }

  // =========================================
  // Actualizar producto
  // =========================================

  async updateProduct(
    product: Product
  ): Promise<void> {

    const ref = doc(
      db,
      "associations",
      product.associationId,
      "products",
      product.id
    );

    const {
      id,
      ...productData
    } = product;

    await updateDoc(
      ref,
      productData
    );

  }

  // =========================================
  // Desactivar producto
  // =========================================

  async deleteProduct(
    associationId: string,
    productId: string
  ): Promise<void> {

    const ref = doc(
      db,
      "associations",
      associationId,
      "products",
      productId
    );

    await deleteDoc(ref);

  }

}

export const productService =
  new ProductService();