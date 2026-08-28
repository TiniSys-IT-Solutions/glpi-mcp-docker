export interface IPNetworkListRequest {
  range?: string;
  start?: number;
  limit?: number;
  sort?: string | number;
  order?: 'ASC' | 'DESC';
  expand_dropdowns?: boolean;
}

export interface IPNetworkWriteRequest {
  name?: string;
  cidr?: string;
  gateway?: string;
  entity_id?: number;
  is_recursive?: boolean;
  addressable?: boolean;
  comment?: string;
}

export interface IPNetworkCreateRequest extends IPNetworkWriteRequest {
  name: string;
  cidr: string;
}

export interface IPNetworkUpdateRequest extends IPNetworkWriteRequest {}
