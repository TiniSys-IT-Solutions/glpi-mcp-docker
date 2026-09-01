export interface RuleListRequest {
  start?: number;
  limit?: number;
  sort?: string;
  order?: 'ASC' | 'DESC';
}

export interface CreateImportEntitySubnetRuleRequest {
  name: string;
  cidr: string;
  targetEntityId: number;
  targetLocationId: number;
  scopeEntityId?: number;
  ranking?: number;
  description?: string;
  comment?: string;
  recursive?: boolean;
}

export function assertCanonicalIPv4CIDR(cidr: string): void {
  const parts = cidr.split('/');
  const octets = parts[0]?.split('.').map(Number) ?? [];
  const prefix = Number(parts[1]);
  if (
    parts.length !== 2 || octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255) ||
    !Number.isInteger(prefix) || prefix < 0 || prefix > 32
  ) {
    throw new Error(`Invalid IPv4 CIDR: ${cidr}`);
  }
  const address = octets.reduce((value, part) => ((value << 8) | part) >>> 0, 0);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (address & mask) >>> 0;
  const canonical = [24, 16, 8, 0].map((shift) => (network >>> shift) & 0xff).join('.');
  if (parts[0] !== canonical) {
    throw new Error(`CIDR must use its canonical network address: expected ${canonical}/${prefix}`);
  }
}
