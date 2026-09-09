/** Permission names stored on a CRM Role (populated docs or string keys). */
export function crmPermissionNamesFromRole(role: any): string[] {
  const populated = Array.isArray(role?.permissions)
    ? role.permissions
        .map((p: any) =>
          typeof p === 'string' ? p : p?.name || p?.key || '',
        )
        .filter(Boolean)
    : [];
  const crm = Array.isArray(role?.crmPermissions) ? role.crmPermissions : [];
  return Array.from(
    new Set(
      [...populated, ...crm]
        .map((p) => String(p || '').trim())
        .filter(Boolean),
    ),
  );
}

/** Shape expected by CRM Roles settings + grant-role dropdowns. */
export function serializeCrmRole(role: any) {
  const obj =
    typeof role?.toObject === 'function' ? role.toObject() : { ...role };
  const names = crmPermissionNamesFromRole(obj);
  return {
    ...obj,
    permissions: names,
    crmPermissions: names,
  };
}

export function collectRolePermissionNames(dto: any): string[] {
  const fromCrm = Array.isArray(dto?.crmPermissions) ? dto.crmPermissions : [];
  const fromPerms = Array.isArray(dto?.permissions) ? dto.permissions : [];
  return Array.from(
    new Set(
      [...fromCrm, ...fromPerms]
        .map((p) => {
          if (typeof p === 'string') return p.trim();
          if (p && typeof p === 'object') {
            return String((p as { name?: string; key?: string }).name || (p as { key?: string }).key || '').trim();
          }
          return '';
        })
        .filter(Boolean),
    ),
  );
}
