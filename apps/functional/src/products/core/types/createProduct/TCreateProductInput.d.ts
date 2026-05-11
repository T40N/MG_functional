export type TCreateProductInput = {
  name: string;
  description?: string;
  price: number;
  stock: number;
  categoryId?: number;
};
