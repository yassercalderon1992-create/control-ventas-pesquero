export interface Movement{

    id?:string

    type:"Compra"|"Venta"

    date:string

    code:string

    product:string

    qty:number

    purchaseCostLb:number

    salePriceLb:number

    supplierName?:string

    supplierCommunity?:string

    associationId:string

    associationName:string

    userEmail:string

    status?:"active"|"deleted"

    createdAt?:any

    updatedAt?:any

}