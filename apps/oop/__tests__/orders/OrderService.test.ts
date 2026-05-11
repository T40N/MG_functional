import {OrderService} from '../../src/orders/OrderService';
import type {DbOrder, OrderWithItems} from '../../src/orders/OrderTypes';

const orderItem = {
  id: 1,
  orderId: 1,
  productId: 1,
  quantity: 2,
  priceAtPurchase: '999.99',
  productName: 'Laptop',
};

const order: DbOrder = {
  id: 1,
  userId: 1,
  status: 'pending',
  totalPrice: '1999.98',
  createdAt: new Date(),
};

const orderWithItems: OrderWithItems = {...order, items: [orderItem]};

const mockRepo = {
  placeOrder: jest.fn(),
  cancelOrder: jest.fn(),
  findByUser: jest.fn(),
  findById: jest.fn(),
};

describe('OrderService', () => {
  let service: OrderService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new OrderService(mockRepo as any);
  });

  describe('placeOrder', () => {
    test('returns order with items on success', async () => {
      mockRepo.placeOrder.mockResolvedValue(orderWithItems);
      const result = await service.placeOrder(1);
      expect(result.items).toHaveLength(1);
      expect(result.totalPrice).toBe('1999.98');
    });

    test('propagates CartEmpty error', async () => {
      mockRepo.placeOrder.mockRejectedValue(new Error('CartEmpty'));
      await expect(service.placeOrder(1)).rejects.toThrow('CartEmpty');
    });

    test('propagates InsufficientStock error', async () => {
      mockRepo.placeOrder.mockRejectedValue(new Error('InsufficientStock'));
      await expect(service.placeOrder(1)).rejects.toThrow('InsufficientStock');
    });
  });

  describe('cancelOrder', () => {
    test('returns cancelled order on success', async () => {
      const cancelled = {...order, status: 'cancelled' as const};
      mockRepo.cancelOrder.mockResolvedValue(cancelled);
      const result = await service.cancelOrder(1, 1);
      expect(result.status).toBe('cancelled');
    });

    test('propagates OrderNotFound error', async () => {
      mockRepo.cancelOrder.mockRejectedValue(new Error('OrderNotFound'));
      await expect(service.cancelOrder(1, 99)).rejects.toThrow('OrderNotFound');
    });

    test('propagates OrderAlreadyCancelled error', async () => {
      mockRepo.cancelOrder.mockRejectedValue(new Error('OrderAlreadyCancelled'));
      await expect(service.cancelOrder(1, 1)).rejects.toThrow('OrderAlreadyCancelled');
    });
  });

  describe('getOrders', () => {
    test('returns list of orders', async () => {
      mockRepo.findByUser.mockResolvedValue([orderWithItems]);
      const result = await service.getOrders(1);
      expect(result).toHaveLength(1);
      expect(result[0].items).toHaveLength(1);
    });

    test('returns empty list when no orders', async () => {
      mockRepo.findByUser.mockResolvedValue([]);
      const result = await service.getOrders(1);
      expect(result).toHaveLength(0);
    });
  });

  describe('getOrderById', () => {
    test('returns order when found', async () => {
      mockRepo.findById.mockResolvedValue(orderWithItems);
      const result = await service.getOrderById(1, 1);
      expect(result?.id).toBe(1);
    });

    test('returns null when not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      const result = await service.getOrderById(1, 99);
      expect(result).toBeNull();
    });
  });
});
