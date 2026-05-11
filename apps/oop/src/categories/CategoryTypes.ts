export type DbCategory = {
  id: number;
  name: string;
  description: string | null;
  createdAt: Date;
};

export type CategoryToSave = {
  name: string;
  description?: string;
};
