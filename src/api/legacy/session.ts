import { SessionService } from '../../core/session/service.js';
import { GlpiClient } from './glpi-client.js';

export class LegacySessionService implements SessionService {
  constructor(private readonly client: GlpiClient) {}

  async getInfo(): Promise<unknown> {
    const [profile, profiles, entities] = await Promise.all([
      this.client.getActiveProfile(),
      this.client.getMyProfiles(),
      this.client.getMyEntities(),
    ]);
    return { active_profile: profile, available_profiles: profiles, entities };
  }
}
