import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "../firebase/firestore";
import { Product } from "../types/product";

class ProductService {

  async create(product: Product) {

    const ref = collection(
      db,
      "associations",
      product.associationId,
      "products"
    );

    await addDoc(ref, {
      ...product,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async getAll(associationId: string) {

    const ref = collection(
      db,
      "associations",
      associationId,
      "products"
    );

    const q = query(ref, orderBy("name"));

    const snap = await getDocs(q);

    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  }

  async update(
    associationId: string,
    productId: string,
    data: Partial<Product>
  ) {

    const ref = doc(
      db,
      "associations",
      associationId,
      "products",
      productId
    );

    await updateDoc(ref, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  async delete(
    associationId: string,
    productId: string
  ) {

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

export const productService = new ProductService();