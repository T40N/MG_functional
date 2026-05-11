import type {DbOrder, OrderWithItems} from './OrderTypes';
import type {OrderRepository} from './OrderRepository';

export class OrderService {
  constructor(
    private orderRepository: Pick<OrderRepository, 'placeOrder' | 'cancelOrder' | 'findByUser' | 'findById'>,
  ) {}

  async placeOrder(userId: number): Promise<OrderWithItems> {
    return this.orderRepository.placeOrder(userId);
  }

  async cancelOrder(userId: number, orderId: number): Promise<DbOrder> {
    return this.orderRepository.cancelOrder(userId, orderId);
  }

  async getOrders(userId: number): Promise<OrderWithItems[]> {
    return this.orderRepository.findByUser(userId);
  }

  async getOrderById(userId: number, orderId: number): Promise<OrderWithItems | null> {
    return this.orderRepository.findById(userId, orderId);
  }
}
