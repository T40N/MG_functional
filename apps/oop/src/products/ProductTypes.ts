export type DbProduct = {
  id: number;
  name: string;
  description: string | null;
  price: string;
  stock: number;
  categoryId: number | null;
  createdAt: Date;
};

export type ProductToSave = {
  name: string;
  description?: string;
  price: number;
  stock: number;
  categoryId?: number;
};

export type ProductFilter = {
  categoryId?: number;
  search?: string;
  page?: number;
  limit?: number;
};
