export type TDbProduct = {
  id: number;
  name: string;
  description: string | null;
  price: string;
  stock: number;
  categoryId: number | null;
  createdAt: Date;
};
