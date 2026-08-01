import { getRolePermissionPreset, STAFF_PERMISSION_GROUPS, STAFF_PERMISSIONS } from '@/lib/staff-permissions'

describe('staff permission catalog', () => {
  it('contains exactly 100 unique permissions arranged into ten groups', () => {
    expect(STAFF_PERMISSION_GROUPS).toHaveLength(10)
    expect(STAFF_PERMISSION_GROUPS.every(group => group.permissions.length === 10)).toBe(true)
    expect(STAFF_PERMISSIONS).toHaveLength(100)
    expect(new Set(STAFF_PERMISSIONS).size).toBe(100)
  })

  it.each(['EDITOR', 'MODERATOR', 'RESOLVER', 'SUPPORT', 'FINANCE'])('%s preset only contains catalog permissions', (role) => {
    const catalog = new Set(STAFF_PERMISSIONS)
    expect(getRolePermissionPreset(role).every(permission => catalog.has(permission))).toBe(true)
  })
})
