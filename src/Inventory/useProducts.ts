import { useEffect, useState } from "react";

import { Product } from "../types/product";
import { productService } from "../services/inventory/productService";
import { useAuth } from "../contexts/AuthContext";

export function useProducts() {

  const { user } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadProducts() {

    if (!user) return;

    setLoading(true);

    try {

      const data = await productService.getProducts(
        user.associationId
      );

      setProducts(data);

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  }

  useEffect(() => {

    loadProducts();

  }, [user]);

  return {

    products,

    loading,

    reload: loadProducts

  };

}