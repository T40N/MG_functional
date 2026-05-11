import type {CartItemInput, DbCartItem} from './CartTypes';
import type {CartRepository} from './CartRepository';

export class CartService {
  constructor(
    private cartRepository: Pick<CartRepository, 'getCartItems' | 'getAvailableStock' | 'upsertCartItem' | 'removeCartItem' | 'clearCart'>,
  ) {}

  async getCart(userId: number): Promise<DbCartItem[]> {
    return this.cartRepository.getCartItems(userId);
  }

  async upsertItem(input: CartItemInput): Promise<DbCartItem> {
    const available = await this.cartRepository.getAvailableStock(input.productId, input.userId);
    if (available === null) throw new Error('ProductNotFound');
    if (available < input.quantity) throw new Error('InsufficientStock');
    return this.cartRepository.upsertCartItem(input);
  }

  async removeItem(userId: number, productId: number): Promise<void> {
    return this.cartRepository.removeCartItem(userId, productId);
  }

  async clearCart(userId: number): Promise<void> {
    return this.cartRepository.clearCart(userId);
  }
}
