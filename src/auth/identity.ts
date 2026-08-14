export interface ServiceAccountIdentity {
  mode: 'service_account';
}

export interface PerUserIdentity {
  mode: 'per_user';
  userId: string;
}

export type GlpiIdentity = ServiceAccountIdentity | PerUserIdentity;
