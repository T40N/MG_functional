import {Request, Response, Router} from 'express';
import {ApiResponse} from '@common/utils/ApiResponse';
import {authMiddleware} from '@common/middleware/authMiddleware';
import {addToCartSchema, updateCartItemSchema} from './validators/cartValidators';
import type {CartService} from './CartService';

export class CartController {
  router = Router();

  constructor(private cartService: CartService) {
    this.router.get('/api/cart', authMiddleware, this.getCart);
    this.router.post('/api/cart/items', authMiddleware, this.addItem);
    this.router.put('/api/cart/items/:productId', authMiddleware, this.updateItem);
    this.router.delete('/api/cart/items/:productId', authMiddleware, this.removeItem);
    this.router.delete('/api/cart', authMiddleware, this.clearCart);
  }

  private getCart = async (req: Request, res: Response): Promise<void> => {
    const userId = parseInt(req.userId!, 10);
    try {
      const items = await this.cartService.getCart(userId);
      res.status(200).json(ApiResponse.success(items, 'Cart fetched successfully'));
    } catch (err) {
      res.status(500).json(ApiResponse.error('InternalError', err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  private addItem = async (req: Request, res: Response): Promise<void> => {
    const parsed = addToCartSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(ApiResponse.error('ValidationError', 'Request body is not valid.', parsed.error.errors));
      return;
    }

    const userId = parseInt(req.userId!, 10);
    try {
      const item = await this.cartService.upsertItem({userId, ...parsed.data});
      res.status(201).json(ApiResponse.success(item, 'Item added to cart. Stock reserved for 15 minutes.'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'ProductNotFound') {
        res.status(404).json(ApiResponse.error('NotFound', 'Product not found.'));
      } else if (msg === 'InsufficientStock') {
        res.status(409).json(ApiResponse.error('InsufficientStock', 'Not enough stock available.'));
      } else {
        res.status(500).json(ApiResponse.error('InternalError', msg));
      }
    }
  };

  private updateItem = async (req: Request, res: Response): Promise<void> => {
    const productId = parseInt(req.params.productId, 10);
    if (isNaN(productId)) {
      res.status(400).json(ApiResponse.error('ValidationError', 'Invalid productId.'));
      return;
    }

    const parsed = updateCartItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(ApiResponse.error('ValidationError', 'Request body is not valid.', parsed.error.errors));
      return;
    }

    const userId = parseInt(req.userId!, 10);
    try {
      const item = await this.cartService.upsertItem({userId, productId, quantity: parsed.data.quantity});
      res.status(200).json(ApiResponse.success(item, 'Cart item updated. Reservation extended for 15 minutes.'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'ProductNotFound') {
        res.status(404).json(ApiResponse.error('NotFound', 'Product not found.'));
      } else if (msg === 'InsufficientStock') {
        res.status(409).json(ApiResponse.error('InsufficientStock', 'Not enough stock available.'));
      } else {
        res.status(500).json(ApiResponse.error('InternalError', msg));
      }
    }
  };

  private removeItem = async (req: Request, res: Response): Promise<void> => {
    const productId = parseInt(req.params.productId, 10);
    if (isNaN(productId)) {
      res.status(400).json(ApiResponse.error('ValidationError', 'Invalid productId.'));
      return;
    }

    const userId = parseInt(req.userId!, 10);
    try {
      await this.cartService.removeItem(userId, productId);
      res.status(200).json(ApiResponse.success(null, 'Item removed from cart.'));
    } catch (err) {
      res.status(500).json(ApiResponse.error('InternalError', err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  private clearCart = async (req: Request, res: Response): Promise<void> => {
    const userId = parseInt(req.userId!, 10);
    try {
      await this.cartService.clearCart(userId);
      res.status(200).json(ApiResponse.success(null, 'Cart cleared.'));
    } catch (err) {
      res.status(500).json(ApiResponse.error('InternalError', err instanceof Error ? err.message : 'Unknown error'));
    }
  };
}
