
import { movementService } from "./movementService";

import type {
  CreateMovementInput,
} from "./movementService";

type StockMovementInput = Omit<
  CreateMovementInput,
  "type"
>;

export class InventoryService {
  /**
   * Registra una entrada de inventario.
   *
   * El movimiento, la actualización del producto y
   * la auditoría se realizan mediante movementService.
   */
  async increaseStock(
    input: StockMovementInput
  ): Promise<string> {
    return movementService.createMovement({
      ...input,
      type: "Compra",
    });
  }

  /**
   * Registra una salida de inventario.
   *
   * Valida las existencias disponibles antes de
   * efectuar la salida.
   */
  async decreaseStock(
    input: StockMovementInput
  ): Promise<string> {
    return movementService.createMovement({
      ...input,
      type: "Venta",
    });
  }
}

export const inventoryService = new InventoryService();
