import { PurchaseRequest } from "../../types/dto";
import { InventoryService } from "../inventory/inventoryService";
import { MovementService } from "../inventory/movementService";
import { StockService } from "../inventory/stockService";
import { ValuationService } from "../inventory/valuationService";
import { CashService } from "../cash/cashService";
import { AuditService } from "../audit/auditService";

export class PurchaseService {

  private inventoryService = new InventoryService();

  private movementService = new MovementService();

  private stockService = new StockService();

  private valuationService = new ValuationService();

  private cashService = new CashService();

  private auditService = new AuditService();

  async createPurchase(request: PurchaseRequest) {

    await this.validatePurchase(request);

    const purchaseCode = await this.generatePurchaseCode();

    console.log("Compra:", purchaseCode);

    // Próximamente aquí registraremos:
    // Compra
    // Inventario
    // Caja
    // Auditoría

  }

  private async validatePurchase(request: PurchaseRequest) {

    if (!request.items.length) {

      throw new Error("La compra debe contener al menos un producto.");

    }

  }

  private async generatePurchaseCode() {

    const year = new Date().getFullYear();

    const random = Math.floor(Math.random() * 99999);

    return `COM-${year}-${random}`;

  }

}