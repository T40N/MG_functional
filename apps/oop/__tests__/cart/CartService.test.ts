import {CartService} from '../../src/cart/CartService';
import type {DbCartItem} from '../../src/cart/CartTypes';

const cartItem: DbCartItem = {
  id: 1,
  userId: 1,
  productId: 1,
  quantity: 2,
  reservedAt: new Date(),
  expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  productName: 'Laptop',
  productPrice: '999.99',
};

const mockRepo = {
  getCartItems: jest.fn(),
  getAvailableStock: jest.fn(),
  upsertCartItem: jest.fn(),
  removeCartItem: jest.fn(),
  clearCart: jest.fn(),
};

describe('CartService', () => {
  let service: CartService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new CartService(mockRepo as any);
  });

  describe('getCart', () => {
    test('returns cart items for user', async () => {
      mockRepo.getCartItems.mockResolvedValue([cartItem]);
      const result = await service.getCart(1);
      expect(result).toHaveLength(1);
      expect(result[0].productName).toBe('Laptop');
    });
  });

  describe('upsertItem', () => {
    test('throws ProductNotFound when product does not exist', async () => {
      mockRepo.getAvailableStock.mockResolvedValue(null);
      await expect(service.upsertItem({userId: 1, productId: 99, quantity: 1})).rejects.toThrow('ProductNotFound');
    });

    test('throws InsufficientStock when not enough available', async () => {
      mockRepo.getAvailableStock.mockResolvedValue(1);
      await expect(service.upsertItem({userId: 1, productId: 1, quantity: 5})).rejects.toThrow('InsufficientStock');
    });

    test('returns cart item on success', async () => {
      mockRepo.getAvailableStock.mockResolvedValue(10);
      mockRepo.upsertCartItem.mockResolvedValue(cartItem);
      const result = await service.upsertItem({userId: 1, productId: 1, quantity: 2});
      expect(result.productName).toBe('Laptop');
    });

    test('allows quantity equal to available stock', async () => {
      mockRepo.getAvailableStock.mockResolvedValue(3);
      mockRepo.upsertCartItem.mockResolvedValue({...cartItem, quantity: 3});
      const result = await service.upsertItem({userId: 1, productId: 1, quantity: 3});
      expect(result.quantity).toBe(3);
    });
  });

  describe('removeItem', () => {
    test('calls repository removeCartItem', async () => {
      mockRepo.removeCartItem.mockResolvedValue(undefined);
      await service.removeItem(1, 1);
      expect(mockRepo.removeCartItem).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('clearCart', () => {
    test('calls repository clearCart', async () => {
      mockRepo.clearCart.mockResolvedValue(undefined);
      await service.clearCart(1);
      expect(mockRepo.clearCart).toHaveBeenCalledWith(1);
    });
  });
});
