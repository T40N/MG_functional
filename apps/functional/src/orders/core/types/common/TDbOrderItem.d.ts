export type TDbOrderItem = {
  id: number;
  orderId: number;
  productId: number | null;
  quantity: number;
  priceAtPurchase: string;
  productName: string;
};
