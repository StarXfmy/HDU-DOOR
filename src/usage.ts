export const USAGE_KEY = 'hdu-quick-station:usage:v1'

export interface UsageEntry {
  count: number
  lastUsedAt: number
}

export type UsageMap = Record<string, UsageEntry>

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function readUsage(storage: StorageLike): UsageMap {
  try {
    const data = JSON.parse(storage.getItem(USAGE_KEY) || '{}') as unknown
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    const usage: UsageMap = {}
    for (const [id, value] of Object.entries(data)) {
      if (!value || typeof value !== 'object') continue
      const entry = value as Partial<UsageEntry>
      if (Number.isSafeInteger(entry.count) && Number(entry.count) > 0 && Number.isFinite(entry.lastUsedAt)) {
        usage[id] = { count: Number(entry.count), lastUsedAt: Number(entry.lastUsedAt) }
      }
    }
    return usage
  } catch {
    return {}
  }
}

export function recordUsage(storage: StorageLike, id: string, now = Date.now()): UsageMap {
  const usage = readUsage(storage)
  const previous = usage[id]
  usage[id] = {
    count: Math.min(Number.MAX_SAFE_INTEGER, (previous?.count || 0) + 1),
    lastUsedAt: now,
  }
  try { storage.setItem(USAGE_KEY, JSON.stringify(usage)) } catch {}
  return usage
}

export function sortByUsage(ids: string[], usage: UsageMap): string[] {
  return ids.map((id, index) => ({ id, index })).sort((a, b) => {
    const left = usage[a.id]
    const right = usage[b.id]
    return (right?.count || 0) - (left?.count || 0)
      || (right?.lastUsedAt || 0) - (left?.lastUsedAt || 0)
      || a.index - b.index
  }).map(item => item.id)
}
