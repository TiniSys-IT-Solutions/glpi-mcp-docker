import { SessionService } from '../../core/session/service.js';
import { HighLevelClient } from './client.js';

export class HighLevelSessionService implements SessionService {
  constructor(private readonly client: HighLevelClient) {}

  getInfo(): Promise<unknown> {
    return this.client.getSession();
  }
}
