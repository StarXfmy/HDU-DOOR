import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { services } from '../src/data'

const key = 'hdu-quick-station:v1'
const ttl = 7 * 24 * 60 * 60 * 1000
const blank = { version: 3, favorites: [], recent: [], recordHistory: true, customServices: [], serviceOverrides: [], trash: [], deletedBuiltinIds: [] }
const builtin = (id: string) => ({ ...services.find(service => service.id === id)! })
const custom = { ...builtin('hdu'), id: 'custom-recycle', name: '我的资料入口', custom: true }

async function importBackup(page: Page, data: unknown) {
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByLabel('导入个人备份文件').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) })
  await expect(page.getByRole('dialog')).toHaveAccessibleName('恢复个人备份')
  await page.getByRole('button', { name: '确认替换并恢复', exact: true }).click()
}
async function openTrash(page: Page) {
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '回收站', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveAccessibleName('回收站')
}
async function trashService(page: Page, name: string) {
  await page.getByRole('searchbox').fill(name)
  await page.locator('.search-results').getByRole('button', { name: `查看${name}详情`, exact: true }).click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveAccessibleName('移到回收站？')
  await page.getByRole('button', { name: '移到回收站', exact: true }).click()
}

async function state(page: Page) { return page.evaluate(k => JSON.parse(localStorage.getItem(k)!), key) }

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '进入', exact: true }).click()
  await expect(page.locator('.welcome-dialog')).toHaveCount(0)
})

test('删除内置服务、取消确认、恢复原收藏位置且不伪造最近记录', async ({ page }) => {
  await importBackup(page, { ...blank, favorites: ['hdu', 'digital', 'pta'], recent: ['digital'] })
  await page.locator('.favorites-grid').getByRole('button', { name: '查看数字杭电详情', exact: true }).click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveAccessibleName('数字杭电')
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: '移到回收站', exact: true }).click()
  await expect(page.locator('[data-service="digital"]')).toHaveCount(0)
  await page.getByRole('searchbox').fill('数字杭电')
  await expect(page.locator('.search-results .service-card')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('[data-service="digital"]')).toHaveCount(0)
  await openTrash(page)
  await expect(page.locator('.trash-item')).toHaveCount(1)
  await expect(page.locator('.trash-item')).toContainText('剩余 7 天')
  await page.getByRole('button', { name: '恢复数字杭电', exact: true }).click()
  await expect(page.getByRole('heading', { name: '回收站是空的' })).toBeVisible()
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  await expect(page.locator('.favorites-grid .card-copy strong')).toHaveText(['学校官网', '数字杭电', 'PTA'])
  expect((await state(page)).recent).toEqual([])
  await page.reload()
  expect((await state(page)).deletedBuiltinIds).toEqual([])
  await expect(page.locator('.all-grid [data-service="digital"]')).toBeVisible()
})

test('恢复编辑过的内置服务，保留名称网址图标与内容', async ({ page }) => {
  const modified = { ...builtin('digital'), name: '我的办事大厅', description: '自定义说明', url: 'https://www.hdu.edu.cn/', icon: 'BookOpen', color: 'purple', modified: true }
  await importBackup(page, { ...blank, serviceOverrides: [modified], favorites: ['digital'] })
  await trashService(page, '我的办事大厅')
  await openTrash(page)
  await page.getByRole('button', { name: '恢复我的办事大厅', exact: true }).click()
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  await page.locator('.favorites-grid').getByRole('button', { name: '查看我的办事大厅详情', exact: true }).click()
  await expect(page.getByRole('link', { name: '打开网址', exact: true })).toHaveAttribute('href', modified.url)
  await expect(page.getByRole('dialog')).toContainText('自定义说明')
  await expect(page.locator('.detail-summary .service-icon')).toHaveClass(/purple/)
  expect((await state(page)).serviceOverrides[0]).toMatchObject(modified)
})

test('自定义服务图标和二维码完整回收与恢复', async ({ page }) => {
  const image = `data:image/png;base64,${(await readFile('public/hui798-code.png')).toString('base64')}`
  const service = { ...custom, kind: 'qr', url: undefined, qr: image, iconImage: image, note: '保留的使用说明', client: '支付宝' }
  await importBackup(page, { ...blank, customServices: [service], favorites: [custom.id], recent: [custom.id] })
  await trashService(page, custom.name)
  let stored = await state(page)
  expect(stored.customServices).toHaveLength(0)
  expect(stored.trash[0].service.iconImage).toBe(image)
  expect(stored.trash[0].service.qr).toBe(image)
  await openTrash(page)
  await expect(page.locator('.trash-item img')).toBeVisible()
  await page.getByRole('button', { name: `恢复${custom.name}`, exact: true }).click()
  await page.reload()
  stored = await state(page)
  expect(stored.customServices[0]).toMatchObject({ iconImage: image, qr: image, note: '保留的使用说明', client: '支付宝' })
  expect(stored.favorites).toEqual([custom.id])
  expect(stored.recent).toEqual([])
})

test('永久删除内置服务需要确认，刷新后不会重新出现', async ({ page }) => {
  await trashService(page, '学校官网')
  await openTrash(page)
  await page.getByRole('button', { name: '永久删除学校官网', exact: true }).click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.locator('.trash-item')).toHaveCount(1)
  await page.getByRole('button', { name: '永久删除学校官网', exact: true }).click()
  await page.getByRole('button', { name: '永久删除', exact: true }).click()
  await expect(page.locator('.trash-item')).toHaveCount(0)
  await page.reload()
  await page.getByRole('searchbox').fill('学校官网')
  await expect(page.locator('.search-results .service-card')).toHaveCount(0)
  const stored = await state(page)
  expect(stored.deletedBuiltinIds).toContain('hdu')
  expect(stored.trash).toEqual([])
})

test('清空回收站只永久移除已删除内容，不影响活动服务', async ({ page }) => {
  const now = Date.now()
  await importBackup(page, { ...blank, favorites: ['pta'], deletedBuiltinIds: ['hdu'], trash: [
    { service: builtin('hdu'), deletedAt: now, favoriteIndex: -1 },
    { service: custom, deletedAt: now, favoriteIndex: -1 },
  ] })
  await openTrash(page)
  await page.getByRole('button', { name: '清空回收站', exact: true }).click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.locator('.trash-item')).toHaveCount(2)
  await page.getByRole('button', { name: '清空回收站', exact: true }).click()
  await page.getByRole('button', { name: '确认清空', exact: true }).click()
  await expect(page.getByRole('button', { name: '清空回收站', exact: true })).toBeDisabled()
  await page.reload()
  await expect(page.locator('.favorites-grid .card-copy strong')).toHaveText('PTA')
  const stored = await state(page)
  expect(stored.trash).toEqual([])
  expect(stored.deletedBuiltinIds).toEqual(['hdu'])
  expect(stored.favorites).toEqual(['pta'])
})

test('7天边界之前可以恢复，到期后自动清理且不会恢复内置服务', async ({ page }) => {
  const now = Date.now()
  await page.clock.setFixedTime(now)
  await importBackup(page, { ...blank, deletedBuiltinIds: ['hdu'], trash: [{ service: builtin('hdu'), deletedAt: now - ttl + 1000, favoriteIndex: -1 }] })
  await openTrash(page)
  await expect(page.locator('.trash-item')).toHaveCount(1)
  await expect(page.locator('.trash-item')).toContainText('不足 1 小时')
  await page.clock.setFixedTime(now + 1000)
  await expect(page.locator('.trash-item')).toHaveCount(0)
  const stored = await state(page)
  expect(stored.trash).toHaveLength(0)
  expect(stored.deletedBuiltinIds).toContain('hdu')
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  await page.getByRole('searchbox').fill('学校官网')
  await expect(page.locator('.search-results .service-card')).toHaveCount(0)
})

test('重新打开网页会清理过期快照，旧备份不重置保留期限', async ({ page }) => {
  const now = Date.now()
  const expired = { ...blank, deletedBuiltinIds: ['hdu'], trash: [{ service: builtin('hdu'), deletedAt: now - ttl, favoriteIndex: -1 }] }
  await page.clock.setFixedTime(now)
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key, data: expired })
  await page.reload()
  await expect.poll(async () => (await state(page)).trash.length).toBe(0)
  await openTrash(page)
  await expect(page.getByRole('heading', { name: '回收站是空的' })).toBeVisible()
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  await importBackup(page, expired)
  expect((await state(page)).trash).toEqual([])
  expect((await state(page)).deletedBuiltinIds).toEqual(['hdu'])
})

test('回收站和永久删除状态随备份导出导入，删除时间不改变', async ({ page }) => {
  const deletedAt = Date.now() - 3 * 24 * 60 * 60 * 1000
  const original = { ...blank, favorites: ['pta'], deletedBuiltinIds: ['hdu', 'digital'], trash: [{ service: builtin('digital'), deletedAt, favoriteIndex: 0 }] }
  await importBackup(page, original)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出备份', exact: true }).click()
  const download = await pending
  const saved = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(saved.trash[0].deletedAt).toBe(deletedAt)
  expect(saved.deletedBuiltinIds).toEqual(['hdu', 'digital'])
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  await importBackup(page, blank)
  await importBackup(page, saved)
  await openTrash(page)
  await expect(page.locator('.trash-item')).toHaveCount(1)
  await page.getByRole('button', { name: '恢复数字杭电', exact: true }).click()
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  expect((await state(page)).favorites).toEqual(['digital', 'pta'])
  expect((await state(page)).deletedBuiltinIds).toEqual(['hdu'])
})

test('确认永久删除期间条目到期，弹窗自动回到回收站', async ({ page }) => {
  const now = Date.now()
  await page.clock.setFixedTime(now)
  await importBackup(page, { ...blank, deletedBuiltinIds: ['hdu'], trash: [{ service: builtin('hdu'), deletedAt: now - ttl + 1000, favoriteIndex: -1 }] })
  await openTrash(page)
  await page.getByRole('button', { name: '永久删除学校官网', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveAccessibleName('永久删除？')
  await page.clock.setFixedTime(now + 1000)
  await expect(page.getByRole('dialog')).toHaveAccessibleName('回收站')
  await expect(page.locator('.trash-item')).toHaveCount(0)
})

test('全部服务被删除时显示空状态，添加和回收站仍可使用', async ({ page }) => {
  await importBackup(page, { ...blank, deletedBuiltinIds: services.map(service => service.id) })
  await expect(page.locator('.all-grid .service-card')).toHaveCount(0)
  await expect(page.getByText('没有可用服务，可添加新服务，或到“设置 → 回收站”恢复。')).toBeVisible()
  await page.getByRole('button', { name: '添加服务', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveAccessibleName('添加服务')
})

for (const width of [1440, 390, 320]) {
  test(`回收站 ${width}px 布局与操作`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 })
    await importBackup(page, { ...blank, deletedBuiltinIds: ['hdu'], trash: [
      { service: builtin('hdu'), deletedAt: Date.now(), favoriteIndex: -1 },
      { service: { ...custom, name: '一个名称较长的自定义服务'.repeat(4) }, deletedAt: Date.now(), favoriteIndex: -1 },
    ] })
    await openTrash(page)
    const dialog = page.getByRole('dialog')
    expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true)
    await page.screenshot({ path: `.checks/${testInfo.project.name}-trash-${width}.png`, animations: 'disabled' })
    await page.getByRole('button', { name: '恢复学校官网', exact: true }).click()
    await expect(page.locator('.trash-item')).toHaveCount(1)
    expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true)
  })
}
