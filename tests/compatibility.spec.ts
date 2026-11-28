import { expect, test } from '@playwright/test'

const key = 'hdu-quick-station:v1'
const oldData = { version: 1, favorites: ['pta', 'erke'], recent: ['hdu'], recordHistory: true, campus: 'shaoxing', includeUnverified: false }

test('启动时自动读取原有收藏，第一次编辑后安全升级并丢弃旧历史字段', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key, data: oldData })
  await page.reload()
  await page.getByRole('button', { name: '进入', exact: true }).click()
  await expect(page.locator('.welcome-dialog')).toHaveCount(0)
  await expect(page.locator('.favorites-grid .card-copy strong')).toHaveText(['PTA', '青春杭电'])
  await expect(page.getByRole('heading', { name: '最近使用', exact: true })).toHaveCount(0)
  await page.locator('.favorites-grid').getByRole('button', { name: '查看PTA详情', exact: true }).click()
  await page.getByRole('button', { name: '编辑服务', exact: true }).click()
  await page.getByLabel('服务名称', { exact: false }).fill('我的 PTA')
  await page.getByRole('button', { name: '保存服务', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveAccessibleName('我的 PTA')
  const stored = await page.evaluate(k => JSON.parse(localStorage.getItem(k)!), key)
  expect(stored.version).toBe(3)
  expect(stored.favorites).toEqual(oldData.favorites)
  expect(stored).not.toHaveProperty('recent')
  expect(stored).not.toHaveProperty('recordHistory')
  expect(stored.serviceOverrides[0].name).toBe('我的 PTA')
})

test('损坏的历史数据不被默认值覆盖，正常添加仍可导出', async ({ context, page }) => {
  await context.addInitScript(() => {
    localStorage.setItem('hdu-quick-station:v1', '{broken')
  })
  await page.goto('/')
  await page.getByRole('button', { name: '进入', exact: true }).click()
  await expect(page.locator('.welcome-dialog')).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('已保留原数据')
  await page.getByRole('button', { name: '添加服务', exact: true }).click()
  await page.getByLabel('服务名称', { exact: false }).fill('临时服务')
  await page.getByLabel('网址', { exact: false }).fill('https://www.hdu.edu.cn/')
  await page.getByRole('button', { name: '保存服务', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveAccessibleName('临时服务')
  expect(await page.evaluate(k => localStorage.getItem(k), key)).toBe('{broken')
  await expect(page.getByRole('status')).toContainText('请导出备份')
})

test('浏览器拒绝存储时不阻断服务编辑，明确提示未保存', async ({ context, page }) => {
  await context.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'QuotaExceededError') }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '进入', exact: true }).click()
  await expect(page.locator('.welcome-dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '添加服务', exact: true }).click()
  await page.getByLabel('服务名称', { exact: false }).fill('暂存服务')
  await page.getByLabel('网址', { exact: false }).fill('https://www.hdu.edu.cn/')
  await page.getByRole('button', { name: '保存服务', exact: true }).click()
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('仅在本页有效')
  await expect(page.locator('.all-grid .service-card')).toHaveCount(29)
})

test('触摸输入、横竖屏切换和缩短视口下保存服务', async ({ browser, browserName }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: browserName !== 'firefox',
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:5173')
  await page.getByRole('button', { name: '进入', exact: true }).tap()
  await expect(page.locator('.welcome-dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '添加服务', exact: true }).tap()
  await page.getByLabel('服务名称', { exact: false }).fill('触摸测试入口')
  await page.getByLabel('网址', { exact: false }).fill('https://www.hdu.edu.cn/')
  await page.setViewportSize({ width: 390, height: 450 })
  await page.getByRole('button', { name: '保存服务', exact: true }).tap()
  await expect(page.getByRole('dialog')).toHaveAccessibleName('触摸测试入口')
  await page.setViewportSize({ width: 844, height: 390 })
  expect(await page.getByRole('dialog').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true)
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).tap()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await context.close()
})

test('手机添加到桌面所需的清单与图标都能取到，且路径不写死子目录', async ({ page, request }) => {
  await page.goto('/')
  const root = new URL('.', page.url())
  const html = await (await request.get(page.url())).text()
  const links = [...html.matchAll(/rel="(?:manifest|apple-touch-icon|alternate icon|icon)"[^>]*href="([^"]+)"/g)].map(match => match[1])
  expect(links).toHaveLength(4)
  const manifest = await (await request.get(new URL('manifest.webmanifest', root).href)).json()
  expect(manifest.display).toBe('standalone')
  expect(manifest.start_url).toBe('./')
  expect(manifest.scope).toBe('./')
  expect(manifest.short_name).toBe('杭电快捷站')
  expect(manifest.icons.map(icon => icon.sizes).sort()).toEqual(['192x192', '512x512'])
  for (const icon of manifest.icons) {
    expect(icon.src.startsWith('/')).toBe(false)
    const response = await request.get(new URL(icon.src, root).href)
    expect(response.status()).toBe(200)
    expect((await response.body()).length).toBeGreaterThan(1000)
  }
  for (const href of links.filter(item => item.endsWith('.png') || item.endsWith('.webmanifest'))) {
    expect((await request.get(new URL(href, root).href)).status()).toBe(200)
  }
})
