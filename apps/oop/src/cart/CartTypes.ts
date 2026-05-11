export type DbCartItem = {
  id: number;
  userId: number;
  productId: number;
  quantity: number;
  reservedAt: Date;
  expiresAt: Date;
  productName: string;
  productPrice: string;
};

export type CartItemInput = {
  userId: number;
  productId: number;
  quantity: number;
};
