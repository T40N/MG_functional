import type {TDbOrder} from './TDbOrder';
import type {TDbOrderItem} from './TDbOrderItem';

export type TOrderWithItems = TDbOrder & {items: TDbOrderItem[]};
