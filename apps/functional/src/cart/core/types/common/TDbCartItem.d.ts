export type TDbCartItem = {
  id: number;
  userId: number;
  productId: number;
  quantity: number;
  reservedAt: Date;
  expiresAt: Date;
  productName: string;
  productPrice: string;
};
