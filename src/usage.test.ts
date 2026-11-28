import { describe, expect, it } from 'vitest'

import { readUsage, recordUsage, sortByUsage } from './usage'

function memoryStorage(initial = '') {
  let value = initial
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next },
  }
}

describe('常用使用频率', () => {
  it('打开次数降序，次数相同按最近使用时间', () => {
    const usage = {
      a: { count: 2, lastUsedAt: 100 },
      b: { count: 3, lastUsedAt: 200 },
      c: { count: 3, lastUsedAt: 300 },
      d: { count: 1, lastUsedAt: 400 },
    }
    expect(sortByUsage(['a', 'b', 'c', 'd'], usage)).toEqual(['c', 'b', 'a', 'd'])
  })

  it('没有使用记录时保留原顺序', () => {
    expect(sortByUsage(['a', 'b', 'c'], {})).toEqual(['a', 'b', 'c'])
  })

  it('每次打开累加并写回本地存储', () => {
    const storage = memoryStorage()
    const first = recordUsage(storage, 'dayplan', 1000)
    const second = recordUsage(storage, 'dayplan', 2000)
    expect(second.dayplan).toEqual({ count: 2, lastUsedAt: 2000 })
    expect(readUsage(storage)).toEqual(second)
    expect(first.dayplan.count).toBe(1)
  })

  it('损坏的使用记录不会导致页面报错', () => {
    expect(readUsage(memoryStorage('not-json'))).toEqual({})
  })
})
