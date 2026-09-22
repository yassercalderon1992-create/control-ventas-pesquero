import { PurchaseItem } from "./PurchaseItem";

export interface PurchaseRequest {

  associationId: string;

  supplier?: string;

  invoiceNumber?: string;

  paymentMethod: "CASH" | "TRANSFER" | "CARD" | "CREDIT";

  notes?: string;

  items: PurchaseItem[];

  createdBy: string;

}