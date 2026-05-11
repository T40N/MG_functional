import {Request, Response, Router} from 'express';
import {ApiResponse} from '@common/utils/ApiResponse';
import {authMiddleware} from '@common/middleware/authMiddleware';
import type {OrderService} from './OrderService';

export class OrderController {
  router = Router();

  constructor(private orderService: OrderService) {
    this.router.post('/api/orders', authMiddleware, this.placeOrder);
    this.router.get('/api/orders', authMiddleware, this.getOrders);
    this.router.get('/api/orders/:id', authMiddleware, this.getOrderById);
    this.router.patch('/api/orders/:id/cancel', authMiddleware, this.cancelOrder);
  }

  private placeOrder = async (req: Request, res: Response): Promise<void> => {
    const userId = parseInt(req.userId!, 10);
    try {
      const order = await this.orderService.placeOrder(userId);
      res.status(201).json(ApiResponse.success(order, 'Order placed successfully.'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'CartEmpty') {
        res.status(422).json(ApiResponse.error('CartEmpty', 'Your cart is empty or all reservations have expired.'));
      } else if (msg === 'InsufficientStock') {
        res.status(409).json(ApiResponse.error('InsufficientStock', 'Not enough stock for one or more items.'));
      } else {
        res.status(500).json(ApiResponse.error('InternalError', msg));
      }
    }
  };

  private getOrders = async (req: Request, res: Response): Promise<void> => {
    const userId = parseInt(req.userId!, 10);
    try {
      const orders = await this.orderService.getOrders(userId);
      res.status(200).json(ApiResponse.success(orders, 'Orders fetched successfully.'));
    } catch (err) {
      res.status(500).json(ApiResponse.error('InternalError', err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  private getOrderById = async (req: Request, res: Response): Promise<void> => {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) {
      res.status(400).json(ApiResponse.error('ValidationError', 'Invalid order id.'));
      return;
    }

    const userId = parseInt(req.userId!, 10);
    try {
      const order = await this.orderService.getOrderById(userId, orderId);
      if (!order) {
        res.status(404).json(ApiResponse.error('NotFound', 'Order not found.'));
        return;
      }
      res.status(200).json(ApiResponse.success(order, 'Order fetched successfully.'));
    } catch (err) {
      res.status(500).json(ApiResponse.error('InternalError', err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  private cancelOrder = async (req: Request, res: Response): Promise<void> => {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) {
      res.status(400).json(ApiResponse.error('ValidationError', 'Invalid order id.'));
      return;
    }

    const userId = parseInt(req.userId!, 10);
    try {
      const order = await this.orderService.cancelOrder(userId, orderId);
      res.status(200).json(ApiResponse.success(order, 'Order cancelled successfully.'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'OrderNotFound') {
        res.status(404).json(ApiResponse.error('NotFound', 'Order not found.'));
      } else if (msg === 'OrderAlreadyCancelled') {
        res.status(409).json(ApiResponse.error('Conflict', 'Order is already cancelled.'));
      } else {
        res.status(500).json(ApiResponse.error('InternalError', msg));
      }
    }
  };
}
