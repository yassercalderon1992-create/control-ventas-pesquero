export class ValuationService {

    calculateAverageCost(
  
      currentStock: number,
  
      currentCost: number,
  
      purchaseQty: number,
  
      purchaseCost: number
  
    ) {
  
      const totalInventory = currentStock * currentCost;
  
      const totalPurchase = purchaseQty * purchaseCost;
  
      return (
  
        (totalInventory + totalPurchase) /
  
        (currentStock + purchaseQty)
  
      );
  
    }
  
  }