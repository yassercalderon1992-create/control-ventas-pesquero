import { useEffect, useMemo, useState } from "react";

import { useCategories } from "../Configuracion/Categories/useCategories";
import { useSpecies } from "../Configuracion/Species/useSpecies";
import { useUnits } from "../Configuracion/Units/useUnits";

export default function ProductForm() {

  const { categories } = useCategories();
  const { species } = useSpecies();
  const { units } = useUnits();

  const [categoryId, setCategoryId] = useState("");
  const [speciesId, setSpeciesId] = useState("");

  const [stock, setStock] = useState(0);
  const [stockMinimo, setStockMinimo] = useState(10);

  const [purchasePrice, setPurchasePrice] = useState(0);
  const [salePrice, setSalePrice] = useState(0);

  const filteredSpecies = useMemo(() => {

    return species.filter(
      s => s.categoryId === categoryId && s.active
    );

  }, [species, categoryId]);

  const selectedSpecies = useMemo(() => {

    return species.find(
      s => s.id === speciesId
    );

  }, [speciesId, species]);

  const selectedUnit = useMemo(() => {

    if (!selectedSpecies) return null;

    return units.find(
      u => u.id === selectedSpecies.unitId
    );

  }, [selectedSpecies, units]);

  useEffect(() => {

    setSpeciesId("");

  }, [categoryId]);

  function guardarProducto(){

      console.log({

          categoryId,
          speciesId,

          stock,
          stockMinimo,

          purchasePrice,
          salePrice

      });

  }

  return (

    <div className="product-form">

      <h2>Nuevo Producto</h2>

      <label>Categoría</label>

      <select
        value={categoryId}
        onChange={(e)=>setCategoryId(e.target.value)}
      >

        <option value="">Seleccione...</option>

        {categories.map(cat=>(

            <option
              key={cat.id}
              value={cat.id}
            >

              {cat.name}

            </option>

        ))}

      </select>

      <label>Especie</label>

      <select
        value={speciesId}
        onChange={(e)=>setSpeciesId(e.target.value)}
      >

        <option value="">Seleccione...</option>

        {filteredSpecies.map(sp=>(

            <option
              key={sp.id}
              value={sp.id}
            >

              {sp.name}

            </option>

        ))}

      </select>

      <label>Unidad</label>

      <input

        value={selectedUnit?.name || ""}

        disabled

      />

      <label>Stock</label>

      <input

        type="number"

        value={stock}

        onChange={(e)=>setStock(Number(e.target.value))}

      />

      <label>Stock mínimo</label>

      <input

        type="number"

        value={stockMinimo}

        onChange={(e)=>setStockMinimo(Number(e.target.value))}

      />

      <label>Precio Compra</label>

      <input

        type="number"

        value={purchasePrice}

        onChange={(e)=>setPurchasePrice(Number(e.target.value))}

      />

      <label>Precio Venta</label>

      <input

        type="number"

        value={salePrice}

        onChange={(e)=>setSalePrice(Number(e.target.value))}

      />

      <br />

      <button onClick={guardarProducto}>

        Guardar Producto

      </button>

    </div>

  );

}