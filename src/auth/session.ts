import { GlpiIdentity } from './identity.js';

export interface AuthSession {
  identity: GlpiIdentity;
  accessToken?: string;
  expiresAt?: Date;
}
