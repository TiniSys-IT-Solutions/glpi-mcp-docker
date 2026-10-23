import type { ConsumableService } from '../../core/consumables/service.js';
import type { ConsumableApply, ConsumableChange, ConsumableStockSelection } from '../../core/consumables/schemas.js';
import { HighLevelNotSupportedError } from './client.js';

export class HighLevelConsumableService implements ConsumableService {
  async getStock(_input: ConsumableStockSelection): Promise<unknown> { throw new HighLevelNotSupportedError('consumables.stock: use Legacy or explicit Hybrid routing'); }
  async previewChange(_input: ConsumableChange): Promise<unknown> { throw new HighLevelNotSupportedError('consumables.preview_change: native stock lifecycle not validated for High-Level'); }
  async applyChange(_input: ConsumableApply): Promise<unknown> { throw new HighLevelNotSupportedError('consumables.apply_change: native stock lifecycle not validated for High-Level'); }
}
