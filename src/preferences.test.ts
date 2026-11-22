import { describe, expect, it } from 'vitest'
import {
  campusNames, colorOptions, defaultFavorites, iconOptions, imageUrl, normalizeWebUrl,
  searchServices, services, sourceUrl, validateService, verification,
} from './data'
import type { Service } from './data'
import {
  emptyTrash, getCatalog, initialPreferences, moveFavorite, parsePreferences,
  permanentlyDeleteService, pruneTrash, restoreService, STORAGE_KEY, trashService, TRASH_RETENTION_MS,
} from './preferences'
import type { Preferences, TrashEntry } from './preferences'

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1sAAAAASUVORK5CYII='
const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q=='
const webp = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'

it('发布在子目录时图片使用构建前缀，上传图片保持原样', () => {
  expect(imageUrl('/favicon.svg')).toBe(`${import.meta.env.BASE_URL}favicon.svg`)
  expect(imageUrl('/hui798-code.png')).toBe(`${import.meta.env.BASE_URL}hui798-code.png`)
  expect(imageUrl(png)).toBe(png)
})

function customService(changes: Partial<Service> = {}): Service {
  return { ...services[0], keywords: [...services[0].keywords], id: 'custom-test', name: '我的入口', custom: true, ...changes }
}

function legacyPreferences(changes: Record<string, unknown> = {}) {
  return {
    version: 1, favorites: ['pta', 'hdu', 'digital'], recent: ['hdu', 'pta'],
    recordHistory: true, campus: 'shaoxing', includeUnverified: false, ...changes,
  }
}

describe('服务目录与搜索', () => {
  it('保留 28 个唯一服务、原始来源与入口元信息，所有服务通过验证', () => {
    expect(services).toHaveLength(28)
    expect(new Set(services.map(item => item.id)).size).toBe(28)
    expect(services.filter(item => item.kind === 'web')).toHaveLength(22)
    expect(services.every(item => item.kind !== 'web' || item.url?.startsWith('https://'))).toBe(true)
    expect(services.every(item => item.kind !== 'qr' || item.qr?.startsWith('/'))).toBe(true)
    expect(sourceUrl).toBe('https://hdu-campus-hub-bkmscmdessk.qoder.zone/')
    for (const service of services) expect(validateService(service)).toEqual(service)
    expect(colorOptions.map(option => option.name)).toEqual(['green', 'blue', 'orange', 'purple', 'teal', 'rose'])
    expect(new Set(iconOptions.map(option => option.name)).size).toBe(iconOptions.length)
    expect(iconOptions.every(option => option.label && option.name)).toBe(true)
  })

  it('标题有结果时只返回标题匹配，不混入介绍匹配', () => {
    const result = searchServices(services, '学习')
    expect(result.matchedBy).toBe('title')
    expect(result.items.map(item => item.id)).toEqual(['chaoxing'])
    expect(searchServices(services, '杭电').items.every(item => item.name.includes('杭电'))).toBe(true)
  })

  it('无标题结果时匹配介绍、关键词和说明，支持跨字段多词交集', () => {
    expect(searchServices(services, '二课')).toMatchObject({ matchedBy: 'description' })
    expect(searchServices(services, '二课').items.map(item => item.id)).toEqual(['erke', 'erke-mobile'])
    expect(searchServices(services, '二课 微信').items.map(item => item.id)).toEqual(['erke-mobile'])
    expect(searchServices(services, '个人登录信息').items.map(item => item.id)).toEqual(['safety'])
    expect(searchServices(services, '直饮水 商户').items.map(item => item.id)).toEqual(['water'])
    expect(searchServices(services, '数字 校园')).toEqual({ items: [], matchedBy: 'description' })
  })

  it('大小写不敏感，空白分词按 AND 匹配，空查询保持目录顺序', () => {
    expect(searchServices(services, '  pTa  ').items.map(item => item.id)).toEqual(['pta'])
    expect(searchServices(services, '中国\tMOOC\n').items.map(item => item.id)).toEqual(['mooc'])
    expect(searchServices(services, 'AI\t费用').items.map(item => item.id)).toEqual(['pacy', 'smart'])
    expect(searchServices(services, 'zz-no-such-service')).toEqual({ items: [], matchedBy: 'description' })
    expect(searchServices(services, '<script>alert(1)</script>').items).toEqual([])
    const all = searchServices(services, ' \t\n ')
    expect(all).toEqual({ items: services, matchedBy: 'all' })
    expect(all.items).not.toBe(services)
    expect(searchServices([], '')).toEqual({ items: [], matchedBy: 'all' })
  })

  it('搜索使用传入的自建和修改目录，而不是固定内置数据', () => {
    const catalog = getCatalog({
      ...initialPreferences(),
      customServices: [customService({ name: '专属测试入口' })],
      serviceOverrides: [{ ...services[0], name: '修改后的大厅' }],
    })
    expect(searchServices(catalog, '专属测试').items.map(item => item.id)).toEqual(['custom-test'])
    expect(searchServices(catalog, '修改后的').items.map(item => item.id)).toEqual(['digital'])
    expect(searchServices(catalog, '数字杭电').items).toEqual([])
  })

  it('自建或修改的服务不沿用旧的 HTTP 核验结果', () => {
    expect(verification(services[0])).toContain('已响应并跳转登录页')
    expect(verification(services.find(item => item.id === 'cet')!)).toContain('403')
    expect(verification(services.find(item => item.id === 'pubscholar')!)).toContain('TLS')
    expect(verification(services.find(item => item.id === 'pta')!)).toContain('HTTP 200')
    expect(verification(services.find(item => item.id === 'water')!)).toContain('未在对应 App 内验证')
    expect(verification(customService())).toBe('用户添加的服务，尚未核实')
    expect(verification({ ...services[0], modified: true })).toBe('用户编辑的服务，尚未核实')
  })
})

describe('服务校验和安全输入', () => {
  it('保留合法字段并复制关键词，丢弃未知字段', () => {
    const input = { ...customService(), extra: '<script>', style: 'background:url(javascript:alert(1))' }
    const result = validateService(input)
    expect(result).toEqual(customService())
    expect(result.keywords).not.toBe(input.keywords)
    expect(result).not.toHaveProperty('extra')
    expect(result).not.toHaveProperty('style')
    const injected = JSON.parse(JSON.stringify(input).replace('"extra":', '"__proto__":{"polluted":true},"extra":'))
    expect(Object.hasOwn(validateService(injected), '__proto__')).toBe(false)
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it.each([
    { id: '' }, { id: 'bad id' }, { id: '<script>' }, { id: '__proto__' }, { id: 'x'.repeat(101) },
    { name: '' }, { name: '  ' }, { name: '名'.repeat(61) }, { name: 3 },
    { description: '文'.repeat(601) }, { description: null },
    { note: '注'.repeat(1601) }, { note: 3 }, { client: '端'.repeat(41) }, { client: false },
    { login: {} }, { icon: 'NotAnIcon' }, { icon: 'constructor' }, { icon: '<svg onload=alert(1)>' },
    { color: 'red' }, { color: 'green;display:none' },
    { kind: 'script' }, { category: 'all' }, { campus: 'shaoxing' },
    { keywords: '课程' }, { keywords: [1] }, { keywords: [''] }, { keywords: ['  '] },
    { keywords: new Array(1) }, { keywords: Array(31).fill('词') }, { keywords: ['词'.repeat(81)] },
    { url: `https://example.com/${'x'.repeat(2049)}` }, { url: `https://example.com/${'中'.repeat(250)}` }, { custom: 'true' }, { modified: 1 },
  ])('拒绝无效服务字段：%j', changes => {
    expect(() => validateService({ ...customService(), ...changes })).toThrow(/[\u4e00-\u9fff]/)
  })

  it('拒绝非对象与缺失必填字段，接受文字长度边界与空介绍', () => {
    for (const input of [null, [], 'service', {}]) expect(() => validateService(input)).toThrow()
    for (const key of ['id', 'name', 'description', 'category', 'icon', 'color', 'keywords', 'kind', 'campus']) {
      const input: Record<string, unknown> = { ...customService() }
      delete input[key]
      expect(() => validateService(input)).toThrow()
    }
    expect(validateService(customService({
      name: '名'.repeat(60), description: '介'.repeat(600), note: '注'.repeat(1600), client: '端'.repeat(40),
    })).name).toHaveLength(60)
    expect(validateService(customService({ description: '', keywords: [] })).description).toBe('')
  })

  it('只规范化明确的 HTTP/HTTPS 网址，不推测域名', () => {
    expect(normalizeWebUrl(' HTTPS://Example.COM/path?q=a#section ')).toBe('https://example.com/path?q=a#section')
    expect(normalizeWebUrl('http://example.com')).toBe('http://example.com/')
    expect(validateService(customService({ url: 'HTTPS://Example.COM' })).url).toBe('https://example.com/')
  })

  it.each([
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>',
    png, 'file:///etc/passwd', 'ftp://example.com', '//example.com', 'example.com', '',
    'http:', 'https:/example.com', 'https:///example.com', 'https://', 'https://[bad',
    'https://example.com:99999', 'https://user:password@example.com', 'https://user@example.com',
    'https://:secret@example.com', 'https://@example.com', 'https://%75ser@example.com',
    'https://example.com/\npath', 'https://example.com\\@evil.example',
  ])('拒绝危险或无效网址：%s', url => {
    expect(() => normalizeWebUrl(url)).toThrow()
    expect(() => validateService(customService({ url }))).toThrow()
    expect(() => parsePreferences({ ...initialPreferences(), customServices: [customService({ url })] })).toThrow()
  })

  it('网页和二维码类型必须有相应入口，其他类型不保留旧入口', () => {
    expect(() => validateService(customService({ url: undefined }))).toThrow()
    expect(() => validateService(customService({ kind: 'qr', url: undefined }))).toThrow()
    const guide = validateService(customService({ kind: 'guide', qr: '/cainiao-code.jpg' }))
    expect(guide).not.toHaveProperty('url')
    expect(guide).not.toHaveProperty('qr')
    expect(validateService(customService({ qr: '/hui798-code.png' }))).not.toHaveProperty('qr')
    const qr = validateService(customService({ kind: 'qr', qr: '/hui798-code.png' }))
    expect(qr.qr).toBe('/hui798-code.png')
    expect(qr).not.toHaveProperty('url')
    expect(() => validateService(customService({ kind: 'guide', url: 'javascript:alert(1)' }))).toThrow()
    expect(() => validateService(customService({ kind: 'pending', qr: '/unknown.png' }))).toThrow()
  })

  it.each([png, jpeg, webp])('接受安全图片格式：%s', image => {
    expect(validateService(customService({ iconImage: image })).iconImage).toBe(image)
    expect(validateService(customService({ kind: 'qr', qr: image })).qr).toBe(image)
  })

  it.each([
    '', 'https://example.com/icon.png', '/icon.png', '/hui798-code.png?x=1',
    'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+',
    'data:image/svg+xml,<svg onload=alert(1)>', 'data:image/gif;base64,R0lGODlh',
    'data:image/png;base64,PHN2Zz48L3N2Zz4=', 'data:image/png;base64,%%%%',
    'data:image/png;base64,a', 'data:image/png;base64,iVBORw0KGgoA=',
    'data:image/png;base64,iVBORw0KGgp=',
    png.replace('image/png', 'image/jpeg'), 'data:image/png;base64,' + 'A'.repeat(180000),
  ])('拒绝不安全、错误格式或过大的图标和二维码：%s', image => {
    expect(() => validateService(customService({ iconImage: image }))).toThrow()
    expect(() => validateService(customService({ kind: 'qr', qr: image }))).toThrow()
  })

  it('图片字符上限为 180000，包括数据 URI 前缀', () => {
    // 合法 PNG 后补零字节，生成恰好低于上限且 base64 长度有效的边界输入。
    const image = 'data:image/png;base64,' + btoa(atob(png.split(',')[1]) + '\0'.repeat(134914))
    expect(image.length).toBe(179998)
    expect(validateService(customService({ iconImage: image })).iconImage).toBe(image)
    expect(() => validateService(customService({ iconImage: image + 'AAAA' }))).toThrow()
  })
})

describe('本地收藏备份和迁移', () => {
  it('沿用真实数据的旧存储键，默认 5 个常用，所有默认数组互不共享', () => {
    expect(STORAGE_KEY).toBe('hdu-quick-station:v1')
    expect(defaultFavorites).toEqual(['smart', 'chaoxing', 'mooc', 'dayplan', 'digital'])
    const first = initialPreferences()
    const second = initialPreferences()
    expect(first).toEqual({ version: 3, favorites: defaultFavorites, customServices: [], serviceOverrides: [], trash: [], deletedBuiltinIds: [] })
    first.favorites.push('pta')
    first.customServices.push(customService())
    first.serviceOverrides.push({ ...services[0] })
    first.trash.push({ service: customService(), deletedAt: 0, favoriteIndex: -1 })
    first.deletedBuiltinIds.push('digital')
    expect(second).toEqual(initialPreferences())
    expect(parsePreferences(JSON.parse(JSON.stringify(second)))).toEqual(second)
  })

  it.each(Object.keys(campusNames))('迁移合法 v1 %s 设置，保留收藏与顺序，移除校区与历史字段', campus => {
    const original = legacyPreferences({ campus })
    const before = JSON.stringify(original)
    const parsed = parsePreferences(original)
    expect(parsed).toEqual({
      version: 3, favorites: ['pta', 'hdu', 'digital'],
      customServices: [], serviceOverrides: [], trash: [], deletedBuiltinIds: [],
    })
    expect(parsed.favorites).not.toBe(original.favorites)
    expect(JSON.stringify(original)).toBe(before)
    expect(parsed).not.toHaveProperty('campus')
    expect(parsed).not.toHaveProperty('includeUnverified')
    expect(parsed).not.toHaveProperty('recent')
    expect(parsed).not.toHaveProperty('recordHistory')
  })

  it.each([
    { campus: undefined }, { campus: 'unknown-campus' }, { campus: '__proto__' }, { campus: 'constructor' },
    { includeUnverified: undefined }, { includeUnverified: 'yes' },
    { favorites: ['pta', 'pta'] }, { favorites: ['custom-test'] },
    { favorites: services.map(item => item.id).concat('pta') },
  ])('迁移前仍严格拒绝损坏的 v1：%j', changes => {
    expect(() => parsePreferences(legacyPreferences(changes))).toThrow()
  })

  it('旧备份里的历史记录字段一律忽略，不再因它们报错', () => {
    for (const changes of [{ recordHistory: false }, { recordHistory: 1 }, { recordHistory: 'yes' }, { recent: ['missing'] }, { recent: services.slice(0, 9).map(item => item.id) }]) {
      const parsed = parsePreferences(legacyPreferences(changes))
      expect(parsed).not.toHaveProperty('recent')
      expect(parsed).not.toHaveProperty('recordHistory')
      expect(parsed.favorites).toEqual(['pta', 'hdu', 'digital'])
    }
  })

  it('迁移无回收站字段的 v2，保留自建、修改与收藏并丢弃历史字段', () => {
    const customServices = [customService({ iconImage: png })]
    const serviceOverrides = [{ ...services[0], name: '修改后的名称', modified: true }]
    const original = {
      version: 2, recordHistory: true, favorites: ['custom-test', 'digital'], recent: ['digital'],
      customServices, serviceOverrides,
    }
    const before = JSON.stringify(original)
    expect(parsePreferences(original)).toEqual({ version: 3, favorites: ['custom-test', 'digital'], customServices, serviceOverrides, trash: [], deletedBuiltinIds: [] })
    expect(parsePreferences(original)).not.toHaveProperty('recent')
    expect(JSON.stringify(original)).toBe(before)
    for (const key of ['customServices', 'serviceOverrides', 'favorites']) {
      const invalid: Record<string, unknown> = { ...original }
      delete invalid[key]
      expect(() => parsePreferences(invalid)).toThrow()
    }
    expect(() => parsePreferences({ ...original, favorites: ['unknown'] })).toThrow()
  })

  it('v3 完整往返保留自建、编辑、图片、文字与收藏排序', () => {
    const original = {
      ...initialPreferences(),
      favorites: ['custom-image', 'digital', 'custom-test'],
      customServices: [
        customService({ description: '自定义介绍', note: '完整说明', client: '浏览器', login: '无需登录', iconImage: png, modified: true }),
        customService({ id: 'custom-image', name: '自建二维码', kind: 'qr', url: undefined, qr: webp, iconImage: jpeg }),
      ],
      serviceOverrides: [{ ...services[0], name: '新的名称', url: 'https://example.com/new', modified: true }],
    }
    const before = JSON.stringify(original)
    const restored = parsePreferences(JSON.parse(before))
    expect(restored).toEqual(original)
    expect(parsePreferences(JSON.parse(JSON.stringify(restored)))).toEqual(restored)
    expect(JSON.stringify(original)).toBe(before)
    expect(restored.customServices[0]).not.toBe(original.customServices[0])
    expect(restored.serviceOverrides[0].keywords).not.toBe(original.serviceOverrides[0].keywords)
  })

  it('按自建在前、内置原顺序合并修改，不改变输入或原始内置目录', () => {
    const before = JSON.stringify(services)
    const preferences = {
      ...initialPreferences(),
      customServices: [customService({ custom: false }), customService({ id: 'custom-second' })],
      serviceOverrides: [{ ...services[0], name: '我的数字杭电', custom: true, modified: false }],
    }
    const original = JSON.stringify(preferences)
    const catalog = getCatalog(preferences)
    expect(catalog).toHaveLength(30)
    expect(catalog.map(item => item.id)).toEqual(['custom-test', 'custom-second', ...services.map(item => item.id)])
    expect(catalog[0].custom).toBe(true)
    expect(catalog[2]).toMatchObject({ id: 'digital', name: '我的数字杭电', modified: true })
    expect(catalog[2]).not.toHaveProperty('custom')
    const parsed = parsePreferences(preferences)
    expect(parsed.customServices[0].custom).toBe(true)
    expect(parsed.serviceOverrides[0].modified).toBe(true)
    expect(verification(catalog[2])).toContain('用户编辑')
    catalog[0].keywords.push('测试')
    catalog[2].keywords.push('测试')
    catalog[3].keywords.push('测试')
    catalog[3].name = '不应影响原目录'
    expect(JSON.stringify(preferences)).toBe(original)
    expect(JSON.stringify(services)).toBe(before)
  })

  it.each([undefined, 0, 4, '2', null])('拒绝未知备份版本：%s', version => {
    expect(() => parsePreferences({ ...initialPreferences(), version })).toThrow('版本')
  })

  it('拒绝非对象或缺失 v3 设置', () => {
    for (const input of [null, [], 'text', 1]) expect(() => parsePreferences(input)).toThrow()
    for (const key of ['favorites', 'customServices', 'serviceOverrides', 'trash', 'deletedBuiltinIds']) {
      const input: Record<string, unknown> = { ...initialPreferences() }
      delete input[key]
      expect(() => parsePreferences(input)).toThrow()
    }
    expect(() => parsePreferences({ ...initialPreferences(), customServices: {} })).toThrow()
    expect(() => parsePreferences({ ...initialPreferences(), serviceOverrides: null })).toThrow()
  })

  it.each([
    { customServices: [customService({ id: 'digital' })] },
    { customServices: [customService({ id: 'not-custom' })] },
    { customServices: [customService({ id: 'custom-' })] },
    { customServices: [customService(), customService()] },
    { serviceOverrides: [customService()] },
    { serviceOverrides: [{ ...services[0], id: 'missing' }] },
    { serviceOverrides: [services[0], services[0]] },
    { customServices: [customService()], serviceOverrides: [customService()] },
    { customServices: [customService({ url: 'javascript:alert(1)' })] },
    { serviceOverrides: [{ ...services[0], icon: '<svg>' }] },
    { serviceOverrides: [{ ...services[0], url: 'https://user:password@example.com/' }] },
    { serviceOverrides: [{ ...services[0], iconImage: 'data:image/svg+xml;base64,PHN2Zz4=' }] },
  ])('拒绝自建或内置修改列表中的错误：%j', changes => {
    const input = { ...initialPreferences(), ...changes }
    expect(() => parsePreferences(input)).toThrow()
    expect(() => getCatalog(input)).toThrow()
  })

  it('允许最多 200 个自建服务，收藏可包含全部目录，拒绝超额', () => {
    const customServices = Array.from({ length: 200 }, (_, i) => customService({ id: `custom-${i}` }))
    const favorites = [...customServices.map(item => item.id), ...services.map(item => item.id)]
    const preferences = { ...initialPreferences(), customServices, favorites }
    expect(parsePreferences(preferences).favorites).toHaveLength(228)
    expect(getCatalog(preferences)).toHaveLength(228)
    expect(() => parsePreferences({ ...preferences, customServices: [...customServices, customService()] })).toThrow('200')
    expect(() => parsePreferences({ ...preferences, serviceOverrides: [...services, services[0]] })).toThrow()
  })

  it('拒绝收藏列表的重复、未知或错误类型引用', () => {
    const base = { ...initialPreferences(), customServices: [customService()] }
    for (const list of [['pta', 'pta'], ['custom-test', 'custom-test'], ['missing'], ['custom-deleted'], [1], 'pta', null, new Array(1)]) {
      expect(() => parsePreferences({ ...base, favorites: list })).toThrow()
    }
    expect(parsePreferences({ ...base, favorites: ['custom-test'] }).favorites).toEqual(['custom-test'])
    expect(() => parsePreferences({ ...initialPreferences(), favorites: ['custom-test'] })).toThrow()
  })

  it('忽略未知字段和已废弃的历史记录字段，不修改输入', () => {
    const input = {
      ...initialPreferences(), recent: ['pta'], recordHistory: false, malicious: '<script>',
      campus: '__proto__', includeUnverified: '无效的旧设置',
      customServices: [{ ...customService(), extra: '<svg>' }],
    }
    const before = JSON.stringify(input)
    const parsed = parsePreferences(input)
    expect(parsed).not.toHaveProperty('recent')
    expect(parsed).not.toHaveProperty('recordHistory')
    for (const key of ['malicious', 'campus', 'includeUnverified']) expect(parsed).not.toHaveProperty(key)
    expect(parsed.customServices[0]).not.toHaveProperty('extra')
    expect(JSON.stringify(input)).toBe(before)
  })

  it('接受空收藏，拒绝导入不会更改已有数据', () => {
    expect(parsePreferences({ ...initialPreferences(), favorites: [] }).favorites).toEqual([])
    const original = initialPreferences()
    expect(() => parsePreferences({ ...original, favorites: ['javascript:alert(1)'] })).toThrow()
    expect(original).toEqual(initialPreferences())
  })
})

describe('服务回收站与永久删除', () => {
  const now = 1_800_000_000_000
  const entry = (service = customService(), changes: Partial<TrashEntry> = {}): TrashEntry => ({
    service, deletedAt: now, favoriteIndex: -1, ...changes,
  })

  it.each(services)('内置 $id 可删除与恢复，未编辑服务不伪装成用户修改', service => {
    const original = initialPreferences()
    const before = JSON.stringify(original)
    const deleted = trashService(original, service.id, now)
    expect(deleted.trash).toEqual([entry(service, { favoriteIndex: original.favorites.indexOf(service.id) })])
    expect(deleted.deletedBuiltinIds).toEqual([service.id])
    expect(deleted.favorites).not.toContain(service.id)
    expect(deleted.serviceOverrides).toEqual([])
    expect(getCatalog(deleted).map(item => item.id)).not.toContain(service.id)
    expect(parsePreferences(deleted, now)).toEqual(deleted)
    const restored = restoreService(deleted, service.id, now)
    expect(restored).toEqual(original)
    expect(getCatalog(restored).find(item => item.id === service.id)).toEqual(service)
    expect(getCatalog(restored).find(item => item.id === service.id)).not.toHaveProperty('modified')
    expect(JSON.stringify(original)).toBe(before)
  })

  it('完整保留自建图标、二维码和修改标记，恢复自建服务到列表头', () => {
    const custom = customService({ kind: 'qr', url: undefined, qr: webp, iconImage: png, modified: true })
    const other = customService({ id: 'custom-other', iconImage: jpeg })
    const original = {
      ...initialPreferences(), customServices: [other, custom],
      favorites: ['digital', custom.id, other.id],
    }
    const before = JSON.stringify(original)
    const deleted = trashService(original, custom.id, now)
    expect(deleted.trash).toEqual([entry(custom, { favoriteIndex: 1 })])
    expect(deleted.trash[0].service).not.toBe(custom)
    expect(deleted.trash[0].service.keywords).not.toBe(custom.keywords)
    expect(deleted.customServices).toEqual([other])
    expect(deleted.customServices[0]).toBe(other)
    expect(deleted.deletedBuiltinIds).toBe(original.deletedBuiltinIds)
    expect(deleted.serviceOverrides).toBe(original.serviceOverrides)
    const restored = restoreService(deleted, custom.id, now)
    expect(restored.customServices).toEqual([custom, other])
    expect(restored.favorites).toEqual(original.favorites)
    expect(JSON.stringify(original)).toBe(before)
  })

  it('删除已编辑内置服务移除修改列表，恢复后仍用之前的图标、二维码及修改状态', () => {
    const override = { ...services[0], kind: 'qr' as const, url: undefined, qr: webp, iconImage: jpeg, name: '个人二维码', modified: false, custom: true }
    const otherOverride = { ...services[1], name: '另一个修改', modified: true }
    const original = { ...initialPreferences(), serviceOverrides: [override, otherOverride] }
    const before = JSON.stringify(original)
    const deleted = trashService(original, 'digital', now)
    expect(deleted.serviceOverrides).toEqual([otherOverride])
    expect(deleted.serviceOverrides[0]).toBe(otherOverride)
    expect(deleted.trash[0].service).toMatchObject({ name: '个人二维码', qr: webp, iconImage: jpeg, modified: true })
    expect(deleted.trash[0].service).not.toHaveProperty('custom')
    const restored = restoreService(parsePreferences(JSON.parse(JSON.stringify(deleted)), now), 'digital', now)
    expect(restored.serviceOverrides).toEqual([deleted.trash[0].service, otherOverride])
    expect(verification(getCatalog(restored).find(item => item.id === 'digital')!)).toContain('用户编辑')
    expect(restored.favorites).toEqual(original.favorites)
    expect(JSON.stringify(original)).toBe(before)
  })

  it('已有修改记录即使内容与内置一致，也保留明确的 modified 标记', () => {
    const original = { ...initialPreferences(), serviceOverrides: [{ ...services[0] }] }
    const deleted = trashService(original, 'digital', now)
    expect(deleted.trash[0].service.modified).toBe(true)
    expect(restoreService(parsePreferences(deleted, now), 'digital', now).serviceOverrides[0].modified).toBe(true)
  })

  it.each([0, 1, 3])('恢复原收藏位置 %s', index => {
    const original = { ...initialPreferences(), favorites: ['hdu', 'digital', 'pta', 'erke'] }
    const id = original.favorites[index]
    const deleted = trashService(original, id, now)
    expect(deleted.trash[0].favoriteIndex).toBe(index)
    const restored = restoreService(deleted, id, now)
    expect(restored.favorites).toEqual(original.favorites)
    expect(() => restoreService(restored, id, now)).toThrow(/[\u4e00-\u9fff]/)
  })

  it('原收藏位置超出当前长度时插入末尾；未收藏的服务恢复后仍未收藏', () => {
    const deleted = trashService(initialPreferences(), 'chaoxing', now)
    expect(restoreService({ ...deleted, favorites: ['pta'] }, 'chaoxing', now).favorites).toEqual(['pta', 'chaoxing'])
    const noFavorite = trashService(initialPreferences(), 'pta', now)
    expect(noFavorite.trash[0].favoriteIndex).toBe(-1)
    expect(restoreService(noFavorite, 'pta', now).favorites).toBe(noFavorite.favorites)
    // 防御旧调用方已经插入收藏的情况，不重复添加。
    expect(restoreService({ ...deleted, favorites: ['chaoxing'] }, 'chaoxing', now).favorites).toEqual(['chaoxing'])
  })

  it('连续删除最新在前，重复删除和未知 ID 中文报错且不修改输入', () => {
    const first = trashService(initialPreferences(), 'digital', now)
    const second = trashService(first, 'pta', now + 1)
    expect(second.trash.map(item => item.service.id)).toEqual(['pta', 'digital'])
    expect(second.trash[1]).toBe(first.trash[0])
    const before = JSON.stringify(second)
    for (const id of ['missing', 'custom-missing', 'digital', '__proto__']) {
      expect(() => trashService(second, id, now + 1)).toThrow(/[\u4e00-\u9fff]/)
    }
    expect(() => restoreService(second, 'missing', now + 1)).toThrow(/[\u4e00-\u9fff]/)
    expect(JSON.stringify(second)).toBe(before)
  })

  it.each([-1, 0, 1])('7 天到期边界偏移 %s 毫秒：到期即不可恢复', offset => {
    expect(TRASH_RETENTION_MS).toBe(604_800_000)
    const deleted = trashService(initialPreferences(), 'digital', now)
    const checkTime = now + TRASH_RETENTION_MS + offset
    const before = JSON.stringify(deleted)
    const pruned = pruneTrash(deleted, checkTime)
    if (offset < 0) {
      expect(pruned).toBe(deleted)
      expect(restoreService(deleted, 'digital', checkTime).deletedBuiltinIds).toEqual([])
    } else {
      expect(pruned.trash).toEqual([])
      expect(pruned.deletedBuiltinIds).toBe(deleted.deletedBuiltinIds)
      expect(getCatalog(pruned).some(service => service.id === 'digital')).toBe(false)
      expect(() => restoreService(deleted, 'digital', checkTime)).toThrow('保留期')
    }
    expect(JSON.stringify(deleted)).toBe(before)
  })

  it('清理到期只修改回收站数组，无变化返回原对象，恢复前清理其他到期项', () => {
    const first = trashService({ ...initialPreferences(), customServices: [customService({ iconImage: png })] }, 'digital', now)
    const second = trashService(first, 'pta', now + 1000)
    const pruned = pruneTrash(second, now + TRASH_RETENTION_MS)
    expect(pruned.trash).toEqual([second.trash[0]])
    expect(pruned.trash[0]).toBe(second.trash[0])
    for (const key of ['favorites', 'customServices', 'serviceOverrides', 'deletedBuiltinIds'] as const) {
      expect(pruned[key]).toBe(second[key])
    }
    expect(pruneTrash(pruned, now + TRASH_RETENTION_MS)).toBe(pruned)
    const restored = restoreService(second, 'pta', now + TRASH_RETENTION_MS)
    expect(restored.trash).toEqual([])
    expect(restored.deletedBuiltinIds).toEqual(['digital'])
    expect(restored.customServices).toBe(second.customServices)
    const third = trashService(second, 'hdu', now + TRASH_RETENTION_MS)
    expect(third.trash.map(item => item.service.id)).toEqual(['hdu', 'pta'])
    expect(second.trash).toHaveLength(2)
  })

  it('永久删除内置服务后刷新和备份往返仍隐藏，不影响其他回收站项', () => {
    const first = trashService(initialPreferences(), 'digital', now)
    const second = trashService(first, 'pta', now)
    const deleted = permanentlyDeleteService(second, 'digital')
    expect(deleted.trash).toEqual([second.trash[0]])
    expect(deleted.trash[0]).toBe(second.trash[0])
    expect(deleted.deletedBuiltinIds).toBe(second.deletedBuiltinIds)
    const reloaded = parsePreferences(JSON.parse(JSON.stringify(deleted)), now)
    expect(getCatalog(reloaded).map(item => item.id)).not.toContain('digital')
    expect(() => restoreService(reloaded, 'digital', now)).toThrow()
    expect(restoreService(reloaded, 'pta', now).deletedBuiltinIds).toEqual(['digital'])
    expect(permanentlyDeleteService(deleted, 'digital')).toBe(deleted)
    expect(permanentlyDeleteService(deleted, 'unknown')).toBe(deleted)
    expect(second.trash).toHaveLength(2)
  })

  it('清空与永久删除自建服务都清除快照；清空不会抹掉内置删除标记', () => {
    const customDeleted = trashService({ ...initialPreferences(), customServices: [customService()] }, 'custom-test', now)
    const permanentlyDeleted = permanentlyDeleteService(customDeleted, 'custom-test')
    expect(permanentlyDeleted.trash).toEqual([])
    expect(permanentlyDeleted.deletedBuiltinIds).toEqual([])
    expect(getCatalog(parsePreferences(permanentlyDeleted, now)).some(item => item.id === 'custom-test')).toBe(false)
    const mixed = trashService(customDeleted, 'digital', now)
    const cleared = emptyTrash(mixed)
    expect(cleared.trash).toEqual([])
    for (const key of ['favorites', 'customServices', 'serviceOverrides', 'deletedBuiltinIds'] as const) {
      expect(cleared[key]).toBe(mixed[key])
    }
    expect(getCatalog(parsePreferences(JSON.parse(JSON.stringify(cleared)), now)).some(item => item.id === 'digital')).toBe(false)
    expect(emptyTrash(cleared)).toBe(cleared)
    expect(mixed.trash).toHaveLength(2)
  })

  it('v3 备份完整往返包含大图、二维码、编辑快照、永久删除及原删除时间', () => {
    const largePng = 'data:image/png;base64,' + btoa(atob(png.split(',')[1]) + '\0'.repeat(134914))
    let preferences: Preferences = {
      ...initialPreferences(), favorites: ['custom-test', 'digital', 'pta'],
      customServices: [customService({ kind: 'qr', url: undefined, iconImage: largePng, qr: webp, modified: true }), customService({ id: 'custom-active', iconImage: jpeg })],
      serviceOverrides: [{ ...services[0], name: '我的入口', iconImage: png, modified: true }],
    }
    for (const id of ['custom-test', 'digital', 'pta']) preferences = trashService(preferences, id, now)
    preferences = permanentlyDeleteService(preferences, 'pta')
    const before = JSON.stringify(preferences)
    const restored = parsePreferences(JSON.parse(before), now + 1000)
    expect(restored).toEqual(preferences)
    expect(restored.trash[1].service.iconImage).toBe(largePng)
    expect(restored.trash[1].service.qr).toBe(webp)
    expect(restored.trash[1].service.keywords).not.toBe(preferences.trash[1].service.keywords)
    expect(restoreService(restored, 'custom-test', now + 1000).customServices[0]).toEqual(preferences.trash[1].service)
    const expired = parsePreferences(JSON.parse(before), now + TRASH_RETENTION_MS)
    expect(expired.trash).toHaveLength(2)
    expect(expired.trash.every(item => item.deletedAt === now)).toBe(true)
    expect(pruneTrash(expired, now + TRASH_RETENTION_MS).trash).toEqual([])
    expect(JSON.stringify(preferences)).toBe(before)
  })

  it('调整收藏顺序不复制自建服务、回收站或图片对象', () => {
    const original = { ...trashService({ ...initialPreferences(), customServices: [customService({ iconImage: png })] }, 'digital', now), favorites: ['pta', 'hdu'] }
    const updated = { ...original, favorites: moveFavorite(original.favorites, 1, -1) }
    expect(updated.favorites).toEqual(['hdu', 'pta'])
    expect(updated.customServices).toBe(original.customServices)
    expect(updated.trash).toBe(original.trash)
    expect(updated.trash[0].service).toBe(original.trash[0].service)
    expect(pruneTrash(updated, now)).toBe(updated)
  })

  it('接受活动和回收站合计 200 自建、最多 228 快照和 28 内置删除标记', () => {
    const customServices = Array.from({ length: 200 }, (_, i) => customService({ id: `custom-${i}` }))
    let preferences: Preferences = {
      ...initialPreferences(), customServices, favorites: [...services.map(item => item.id), ...customServices.map(item => item.id)],
    }
    for (const service of [...customServices].reverse().concat(services)) preferences = trashService(preferences, service.id, now)
    expect(preferences.trash).toHaveLength(228)
    expect(preferences.trash.find(item => item.service.id === 'custom-199')!.favoriteIndex).toBe(227)
    expect(preferences.deletedBuiltinIds).toHaveLength(28)
    expect(getCatalog(preferences)).toEqual([])
    expect(parsePreferences(preferences, now)).toEqual(preferences)
    const restored = restoreService(preferences, 'custom-199', now)
    expect(restored.customServices).toHaveLength(1)
    expect(restored.favorites).toEqual(['custom-199'])
    expect(restored.trash.filter(item => item.service.custom)).toHaveLength(199)
    expect(parsePreferences(restored, now)).toEqual(restored)
    expect(() => parsePreferences({ ...preferences, trash: [...preferences.trash, entry()] }, now)).toThrow('228')
    expect(() => parsePreferences({ ...preferences, deletedBuiltinIds: [...preferences.deletedBuiltinIds, 'digital'] }, now)).toThrow()
  })

  it('自建配额包括回收站中的自建和未清理的到期快照，永久删除或清理后释放', () => {
    const customServices = Array.from({ length: 200 }, (_, i) => customService({ id: `custom-${i}` }))
    const full = { ...initialPreferences(), customServices, trash: [entry()] }
    expect(() => parsePreferences(full, now)).toThrow('200')
    expect(() => parsePreferences(full, now + TRASH_RETENTION_MS)).toThrow('200')
    expect(parsePreferences(permanentlyDeleteService(full, 'custom-test'), now).customServices).toHaveLength(200)
    expect(parsePreferences(pruneTrash(full, now + TRASH_RETENTION_MS), now + TRASH_RETENTION_MS).customServices).toHaveLength(200)
    const partlyTrashed = { ...full, customServices: customServices.slice(1) }
    expect(parsePreferences(partlyTrashed, now).customServices).toHaveLength(199)
    expect(restoreService(partlyTrashed, 'custom-test', now).customServices).toHaveLength(200)
  })

  it('解析回收站时按 ID 正规化来源，不信任伪造标记，也不改变输入', () => {
    const original = {
      ...initialPreferences(), favorites: [], deletedBuiltinIds: ['digital', 'hduhelp', 'erke'],
      trash: [
        entry({ ...services[0], custom: true, modified: false }),
        entry({ ...services[1], name: '偷偷改过', custom: true, modified: false }),
        entry({ ...services[2], modified: true }),
        entry(customService({ custom: false, modified: true })),
      ],
    }
    const before = JSON.stringify(original)
    const parsed = parsePreferences(original, now)
    expect(parsed.trash[0].service).toEqual(services[0])
    expect(parsed.trash[1].service.modified).toBe(true)
    expect(parsed.trash[1].service).not.toHaveProperty('custom')
    expect(parsed.trash[2].service.modified).toBe(true)
    expect(parsed.trash[3].service.custom).toBe(true)
    expect(parsed.trash[3].service.modified).toBe(true)
    expect(restoreService(parsed, 'digital', now).serviceOverrides).toEqual([])
    expect(restoreService(parsed, 'hduhelp', now).serviceOverrides[0].name).toBe('偷偷改过')
    expect(JSON.stringify(original)).toBe(before)
  })

  it.each([
    { url: 'https://example.com/' }, { keywords: ['改过的关键词'] }, { description: '改过的介绍' },
    { iconImage: png }, { note: '添加说明' }, { login: undefined }, { color: 'rose' },
    { kind: 'qr', url: undefined, qr: webp },
  ])('内置快照内容变化 %j 时不能误用旧核验结果', changes => {
    const parsed = parsePreferences({
      ...initialPreferences(), favorites: [], deletedBuiltinIds: ['digital'],
      trash: [entry({ ...services[0], ...changes } as Service)],
    }, now)
    expect(parsed.trash[0].service.modified).toBe(true)
    expect(verification(restoreService(parsed, 'digital', now).serviceOverrides[0])).toContain('用户编辑')
  })

  it.each([
    { trash: undefined }, { trash: null }, { trash: {} }, { trash: [null] }, { trash: [[]] }, { trash: [1] }, { trash: [{}] },
    { trash: new Array(1) }, { deletedBuiltinIds: undefined }, { deletedBuiltinIds: null }, { deletedBuiltinIds: 'digital' },
    { deletedBuiltinIds: ['unknown'] }, { deletedBuiltinIds: ['custom-test'] }, { deletedBuiltinIds: [1] },
    { deletedBuiltinIds: ['digital', 'digital'] }, { deletedBuiltinIds: new Array(1) },
  ])('严格拒绝 v3 无效回收站和删除标记：%j', changes => {
    expect(() => parsePreferences({ ...initialPreferences(), ...changes }, now)).toThrow(/[\u4e00-\u9fff]/)
  })

  it.each([undefined, null, '1800000000000', NaN, Infinity, -Infinity, -1, now + 0.5, now + 300_001, Number.MAX_SAFE_INTEGER, 8_640_000_000_000_001])('拒绝非法或超前删除时间 %s', deletedAt => {
    expect(() => parsePreferences({ ...initialPreferences(), trash: [{ ...entry(), deletedAt }] }, now)).toThrow('时间')
  })

  it('允许时间戳 0、5 分钟时钟误差以及已过期快照，但解析不延长保留期', () => {
    for (const deletedAt of [0, now, now + 300_000]) {
      const parsed = parsePreferences({ ...initialPreferences(), trash: [entry(customService(), { deletedAt })] }, now)
      expect(parsed.trash[0].deletedAt).toBe(deletedAt)
      const expiry = deletedAt + TRASH_RETENTION_MS
      expect(pruneTrash(parsed, expiry - 1)).toBe(parsed)
      expect(pruneTrash(parsed, expiry).trash).toEqual([])
    }
    for (const invalidNow of [NaN, Infinity, -1]) {
      expect(() => parsePreferences(initialPreferences(), invalidNow)).toThrow('时间')
      expect(() => pruneTrash(initialPreferences(), invalidNow)).toThrow('时间')
      expect(() => trashService(initialPreferences(), 'digital', invalidNow)).toThrow('时间')
    }
    expect(() => pruneTrash({ ...initialPreferences(), trash: [entry(customService(), { deletedAt: Infinity })] }, now)).toThrow('时间')
  })

  it.each([undefined, null, '-1', -2, 0.5, 228, NaN, Infinity])('拒绝非法原收藏位置 %s', favoriteIndex => {
    expect(() => parsePreferences({ ...initialPreferences(), trash: [{ ...entry(), favoriteIndex }] }, now)).toThrow('收藏位置')
  })

  it.each([-1, 0, 227])('接受原收藏位置边界 %s', favoriteIndex => {
    expect(parsePreferences({ ...initialPreferences(), trash: [entry(customService(), { favoriteIndex })] }, now).trash[0].favoriteIndex).toBe(favoriteIndex)
  })

  it('拒绝重复快照、活动与回收站冲突、内置快照缺删除标记以及删除后残存修改', () => {
    const base = initialPreferences()
    const invalid = [
      { ...base, trash: [entry(), entry()] },
      { ...base, customServices: [customService()], trash: [entry()] },
      { ...base, trash: [entry(services[0])] },
      { ...base, favorites: [], deletedBuiltinIds: ['digital'], serviceOverrides: [services[0]] },
      { ...base, favorites: [], deletedBuiltinIds: ['digital'], trash: [entry(services[0]), entry(services[0])] },
    ]
    for (const input of invalid) expect(() => parsePreferences(input, now)).toThrow(/[\u4e00-\u9fff]/)
  })

  it('拒绝收藏引用已删除、永久删除或回收站中的服务', () => {
    const base = { ...initialPreferences(), favorites: [], deletedBuiltinIds: ['digital'], trash: [entry()] }
    for (const id of ['digital', 'custom-test', 'missing']) {
      expect(() => parsePreferences({ ...base, favorites: [id] }, now)).toThrow()
    }
  })

  it.each([
    { id: 'unknown' }, { id: 'custom-' }, { id: '__proto__' }, { icon: 'InvalidIcon' },
    { custom: 'true' }, { modified: 1 }, { url: 'javascript:alert(1)' },
    { iconImage: 'data:image/svg+xml;base64,PHN2Zz4=' }, { kind: 'qr', qr: '/unknown.png' },
  ])('回收站服务仍需通过 data.ts 的完整安全校验：%j', changes => {
    expect(() => parsePreferences({ ...initialPreferences(), trash: [{ ...entry(), service: { ...customService(), ...changes } }] }, now)).toThrow()
  })
})

describe('常用排序', () => {
  it('移动常用不会更改原始数组，越界或无效下标保持不变', () => {
    const current = ['pta', 'custom-test', 'erke']
    expect(moveFavorite(current, 1, -1)).toEqual(['custom-test', 'pta', 'erke'])
    expect(moveFavorite(current, 0, 1)).toEqual(['custom-test', 'pta', 'erke'])
    for (const [index, direction] of [[0, -1], [2, 1], [-1, 1], [0.5, 1], [0, NaN], [Infinity, 1]]) {
      expect(moveFavorite(current, index, direction)).toEqual(current)
    }
    expect(moveFavorite([], 0, 1)).toEqual([])
    expect(current).toEqual(['pta', 'custom-test', 'erke'])
  })
})
