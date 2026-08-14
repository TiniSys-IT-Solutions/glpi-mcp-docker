export interface PermissionContext {
  canRead: boolean;
  canWrite: boolean;
}

export function serviceAccountPermissions(): PermissionContext {
  return {
    canRead: true,
    canWrite: true,
  };
}
