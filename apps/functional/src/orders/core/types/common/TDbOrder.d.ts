export type TOrderStatus = 'pending' | 'cancelled';

export type TDbOrder = {
  id: number;
  userId: number;
  status: TOrderStatus;
  totalPrice: string;
  createdAt: Date;
};
