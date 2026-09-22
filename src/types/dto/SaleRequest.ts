import { SaleItem } from "./SaleItem";

export interface SaleRequest {

  associationId: string;

  customer?: string;

  paymentMethod: "CASH" | "TRANSFER" | "CARD" | "CREDIT";

  notes?: string;

  items: SaleItem[];

  createdBy: string;

}