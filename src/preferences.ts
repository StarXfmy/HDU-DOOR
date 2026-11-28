import { campusNames, defaultFavorites, serviceById, services, validateService } from './data'
import type { Service } from './data'

// 沿用旧键，升级数据格式不会丢掉用户已经保存的收藏与自建服务。
export const STORAGE_KEY = 'hdu-quick-station:v1'
export const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const MAX_CUSTOM_SERVICES = 200
const MAX_TRASH_ENTRIES = MAX_CUSTOM_SERVICES + services.length
const MAX_FUTURE_MS = 5 * 60 * 1000
const DAYPLAN_CLOUD_URL = 'https://114-215-174-78.nip.io/'
const LEGACY_DAYPLAN_URL = /^https:\/\/starxfmy\.github\.io\/xfmy-local\/kernel(?:\/|$)/i

function migrateDayPlanUrl(service: Service): Service {
  const isDayPlan = service.id === 'dayplan' || service.name.trim().toLowerCase() === 'day plan'
  return isDayPlan && typeof service.url === 'string' && LEGACY_DAYPLAN_URL.test(service.url) ? { ...service, url: DAYPLAN_CLOUD_URL } : service
}

export interface TrashEntry {
  service: Service
  deletedAt: number
  favoriteIndex: number
}

export interface Preferences {
  version: 3
  favorites: string[]
  customServices: Service[]
  serviceOverrides: Service[]
  trash: TrashEntry[]
  deletedBuiltinIds: string[]
}

export function initialPreferences(): Preferences {
  return {
    version: 3,
    favorites: [...defaultFavorites],
    customServices: [],
    serviceOverrides: [],
    trash: [],
    deletedBuiltinIds: [],
  }
}

function isCustomId(id: string): boolean {
  return id.startsWith('custom-') && id.length > 'custom-'.length && !serviceById.has(id)
}

function validateTimestamp(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) {
    throw new Error(`${label}必须是有效的非负整数时间戳。`)
  }
}

function validateDeletedAt(value: unknown, now: number): asserts value is number {
  validateTimestamp(value, '删除时间')
  if (value - now > MAX_FUTURE_MS) throw new Error('删除时间不能超过当前时间 5 分钟。')
}

function sameServiceContent(service: Service, builtin: Service): boolean {
  return (Object.keys({ ...builtin, ...service }) as (keyof Service)[]).every(key => {
    if (key === 'custom' || key === 'modified') return true
    if (key === 'keywords') {
      return service.keywords.length === builtin.keywords.length
        && service.keywords.every((word, index) => word === builtin.keywords[index])
    }
    return service[key] === builtin[key]
  })
}

function validateTrashService(input: unknown): Service {
  const service = validateService(input)
  const builtin = serviceById.get(service.id)
  if (!builtin) {
    if (!isCustomId(service.id)) throw new Error('回收站中的服务 ID 必须对应内置服务或以 custom- 开头的自建服务。')
    return { ...service, custom: true }
  }
  delete service.custom
  // 不相信导入文件的来源标记；内容不同就不能继续引用原来的核验结果。
  if (service.modified || !sameServiceContent(service, builtin)) service.modified = true
  else delete service.modified
  return service
}

function validateServiceLists(customInput: unknown, overridesInput: unknown) {
  if (!Array.isArray(customInput) || !Array.isArray(overridesInput)) {
    throw new Error('备份中的自建服务和服务修改必须是数组。')
  }
  if (customInput.length > MAX_CUSTOM_SERVICES) throw new Error('自建服务最多保存 200 条（包括回收站）。')
  if (overridesInput.length > services.length) throw new Error('内置服务修改数量超出上限。')
  const ids = new Set<string>()
  const customServices: Service[] = []
  for (const input of customInput) {
    const service = migrateDayPlanUrl(validateService(input))
    if (!isCustomId(service.id)) {
      throw new Error('自建服务 ID 必须以 custom- 开头，且不能与内置服务相同。')
    }
    if (ids.has(service.id)) throw new Error('备份中存在重复的服务 ID。')
    ids.add(service.id)
    customServices.push({ ...service, custom: true })
  }
  const serviceOverrides: Service[] = []
  for (const input of overridesInput) {
    const service = migrateDayPlanUrl(validateService(input))
    if (!serviceById.has(service.id)) throw new Error('服务修改必须对应现有的内置服务 ID。')
    if (ids.has(service.id)) throw new Error('备份中存在重复的服务 ID。')
    ids.add(service.id)
    // 来源由所在列表决定，不能用备份中的标记把内置服务伪装成自建服务。
    delete service.custom
    serviceOverrides.push({ ...service, modified: true })
  }
  return { customServices, serviceOverrides }
}

export function getCatalog(p: Preferences): Service[] {
  const { customServices, serviceOverrides } = validateServiceLists(p.customServices, p.serviceOverrides)
  const deleted = new Set(p.deletedBuiltinIds)
  const overrides = new Map(serviceOverrides.map(service => [service.id, service]))
  return [
    ...customServices,
    ...services.filter(service => !deleted.has(service.id))
      .map(service => overrides.get(service.id) ?? { ...service, keywords: [...service.keywords] }),
  ]
}

function validateReferences(input: unknown, available: Set<string>, label: string, maximum: number): string[] {
  if (!Array.isArray(input) || input.length > maximum) throw new Error(`备份中的${label}格式不正确或数量超出上限。`)
  const list: string[] = []
  const seen = new Set<string>()
  for (const id of input) {
    if (typeof id !== 'string' || !available.has(id) || seen.has(id)) {
      throw new Error(`备份中的${label}包含无效、重复或已经不存在的服务。`)
    }
    seen.add(id)
    list.push(id)
  }
  return list
}

function validateTrash(input: unknown, available: Set<string>, deleted: Set<string>, customCount: number, now: number): TrashEntry[] {
  if (!Array.isArray(input) || input.length > MAX_TRASH_ENTRIES) {
    throw new Error(`回收站必须是数组，且最多保存 ${MAX_TRASH_ENTRIES} 条。`)
  }
  const seen = new Set<string>()
  const trash: TrashEntry[] = []
  for (const entry of input) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('回收站记录格式不正确。')
    validateDeletedAt(entry.deletedAt, now)
    if (!Number.isInteger(entry.favoriteIndex) || entry.favoriteIndex < -1 || entry.favoriteIndex >= MAX_TRASH_ENTRIES) {
      throw new Error(`回收站的原收藏位置必须为 -1 或 0 至 ${MAX_TRASH_ENTRIES - 1} 的整数。`)
    }
    const service = validateTrashService(entry.service)
    if (seen.has(service.id)) throw new Error('回收站中存在重复的服务 ID。')
    if (serviceById.has(service.id) && !deleted.has(service.id)) throw new Error('回收站中的内置服务缺少删除标记。')
    if (available.has(service.id)) throw new Error('服务不能同时存在于活动目录和回收站。')
    seen.add(service.id)
    if (isCustomId(service.id)) customCount += 1
    trash.push({ service, deletedAt: entry.deletedAt, favoriteIndex: entry.favoriteIndex })
  }
  if (customCount > MAX_CUSTOM_SERVICES) throw new Error('自建服务最多保存 200 条（包括回收站）。')
  return trash
}

export function parsePreferences(input: unknown, now = Date.now()): Preferences {
  validateTimestamp(now, '当前时间')
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('文件内容不是有效的收藏备份。')
  const data = input as Record<string, unknown>
  if (data.version !== 1 && data.version !== 2 && data.version !== 3) throw new Error('备份版本不受支持，请选择本网站导出的 JSON 文件。')

  let lists: Pick<Preferences, 'customServices' | 'serviceOverrides'>
  if (data.version === 1) {
    // 旧版先按旧规则严格检查，再迁移；不把损坏的旧设置默认为有效值。
    if (typeof data.includeUnverified !== 'boolean' || typeof data.campus !== 'string' || !Object.hasOwn(campusNames, data.campus)) {
      throw new Error('旧版备份中的校区设置不完整或格式不正确。')
    }
    lists = { customServices: [], serviceOverrides: [] }
  } else {
    lists = validateServiceLists(data.customServices, data.serviceOverrides)
  }
  const deletedBuiltinIds = data.version === 3
    ? validateReferences(data.deletedBuiltinIds, new Set(serviceById.keys()), '已删除内置服务', services.length)
    : []
  const deleted = new Set(deletedBuiltinIds)
  if (lists.serviceOverrides.some(service => deleted.has(service.id))) {
    throw new Error('已删除的内置服务不能仍在服务修改列表中。')
  }
  const available = new Set([
    ...services.filter(service => !deleted.has(service.id)).map(service => service.id),
    ...lists.customServices.map(service => service.id),
  ])
  const trash = data.version === 3
    ? validateTrash(data.trash, available, deleted, lists.customServices.length, now)
    : []
  const favorites = validateReferences(data.favorites, available, '收藏', available.size)
  return {
    version: 3,
    favorites,
    ...lists,
    trash,
    deletedBuiltinIds,
  }
}

export function pruneTrash(p: Preferences, now = Date.now()): Preferences {
  validateTimestamp(now, '当前时间')
  const trash = p.trash.filter(entry => {
    validateDeletedAt(entry.deletedAt, now)
    return now - entry.deletedAt < TRASH_RETENTION_MS
  })
  return trash.length === p.trash.length ? p : { ...p, trash }
}

function withoutReference(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter(item => item !== id) : list
}

function withoutService(list: Service[], id: string): Service[] {
  return list.some(service => service.id === id) ? list.filter(service => service.id !== id) : list
}

export function trashService(p: Preferences, id: string, now = Date.now()): Preferences {
  const current = pruneTrash(p, now)
  const custom = current.customServices.find(service => service.id === id)
  const override = current.serviceOverrides.find(service => service.id === id)
  const active = custom ?? (current.deletedBuiltinIds.includes(id) ? undefined : override ?? serviceById.get(id))
  if (!active) throw new Error('找不到该活动服务，可能已经删除。')
  // 只复制目标服务；图片是不可变字符串，不重新复制整个设置或其他服务。
  const service = validateTrashService(override && !custom ? { ...active, modified: true } : active)
  return {
    ...current,
    customServices: withoutService(current.customServices, id),
    serviceOverrides: withoutService(current.serviceOverrides, id),
    favorites: withoutReference(current.favorites, id),
    deletedBuiltinIds: serviceById.has(id) ? [...current.deletedBuiltinIds, id] : current.deletedBuiltinIds,
    trash: [{ service, deletedAt: now, favoriteIndex: current.favorites.indexOf(id) }, ...current.trash],
  }
}

export function restoreService(p: Preferences, id: string, now = Date.now()): Preferences {
  const current = pruneTrash(p, now)
  const entry = current.trash.find(item => item.service.id === id)
  if (!entry) {
    if (p.trash.some(item => item.service.id === id)) throw new Error('该服务已超过 7 天保留期，无法恢复。')
    throw new Error('回收站中找不到该服务，无法恢复。')
  }
  const service = validateTrashService(entry.service)
  const builtin = serviceById.has(id)
  let favorites = current.favorites
  if (entry.favoriteIndex >= 0 && !favorites.includes(id)) {
    favorites = [...favorites]
    favorites.splice(Math.min(entry.favoriteIndex, favorites.length), 0, id)
  }
  return {
    ...current,
    favorites,
    customServices: builtin ? current.customServices : [service, ...current.customServices],
    serviceOverrides: builtin && service.modified ? [service, ...current.serviceOverrides] : current.serviceOverrides,
    deletedBuiltinIds: builtin ? withoutReference(current.deletedBuiltinIds, id) : current.deletedBuiltinIds,
    trash: current.trash.filter(item => item.service.id !== id),
  }
}

export function permanentlyDeleteService(p: Preferences, id: string): Preferences {
  if (!p.trash.some(entry => entry.service.id === id)) return p
  // 永久删除只清掉快照，保留内置服务删除标记，刷新或导入备份后也不会复活。
  return { ...p, trash: p.trash.filter(entry => entry.service.id !== id) }
}

export function emptyTrash(p: Preferences): Preferences {
  return p.trash.length ? { ...p, trash: [] } : p
}

export function moveFavorite(current: string[], index: number, direction: number) {
  const next = [...current]
  const destination = index + direction
  if (!Number.isInteger(index) || !Number.isInteger(direction) || index < 0 || index >= next.length || destination < 0 || destination >= next.length) return next
  ;[next[index], next[destination]] = [next[destination], next[index]]
  return next
}
