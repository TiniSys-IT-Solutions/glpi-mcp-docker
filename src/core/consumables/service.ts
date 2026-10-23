import type { ConsumableApply, ConsumableChange, ConsumableStockSelection } from './schemas.js';

export interface ConsumableService {
  getStock(input: ConsumableStockSelection): Promise<unknown>;
  previewChange(input: ConsumableChange): Promise<unknown>;
  applyChange(input: ConsumableApply): Promise<unknown>;
}
