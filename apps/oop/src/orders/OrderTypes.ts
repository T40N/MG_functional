export type OrderStatus = 'pending' | 'cancelled';

export type DbOrder = {
  id: number;
  userId: number;
  status: OrderStatus;
  totalPrice: string;
  createdAt: Date;
};

export type DbOrderItem = {
  id: number;
  orderId: number;
  productId: number | null;
  quantity: number;
  priceAtPurchase: string;
  productName: string;
};

export type OrderWithItems = DbOrder & {items: DbOrderItem[]};
