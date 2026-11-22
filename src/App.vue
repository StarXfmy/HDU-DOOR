<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronUp, Clock3, Download, Pencil, Plus, RotateCcw, Search, Settings2, Star, Trash2, Upload, X } from 'lucide-vue-next'
import AppDialog from './components/AppDialog.vue'
import ServiceCard from './components/ServiceCard.vue'
import ServiceEditor from './components/ServiceEditor.vue'
import ServiceIcon from './components/ServiceIcon.vue'
import WelcomeScreen from './components/WelcomeScreen.vue'
import { catalogDate, imageUrl, kindNames, searchServices, sourceUrl, verification } from './data'
import type { Service } from './data'
import { addRecent, emptyTrash, getCatalog, initialPreferences, moveFavorite, parsePreferences, permanentlyDeleteService, pruneTrash, restoreService, STORAGE_KEY, trashService, TRASH_RETENTION_MS } from './preferences'
import type { Preferences } from './preferences'

const storageWarning = ref('')
const storageBlocked = ref(false)
function loadPreferences() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value ? parsePreferences(JSON.parse(value)) : initialPreferences()
  } catch {
    storageBlocked.value = true
    storageWarning.value = '原有数据无法读取，已保留原数据。请在设置中导入备份；当前改动暂不保存。'
    return initialPreferences()
  }
}
const preferences = ref(loadPreferences())
const query = ref('')
const allExpanded = ref(false)
const editingFavorites = ref(false)
const searchInput = ref<HTMLInputElement>()
const fileInput = ref<HTMLInputElement>()
const allSection = ref<HTMLElement>()
const modal = ref<'settings' | 'about' | 'service' | 'editor' | 'import' | 'clear' | 'delete' | 'trash' | 'purge' | 'empty-trash' | null>(null)
const selectedId = ref('')
const editingId = ref('')
const trashId = ref('')
const clock = ref(Date.now())
const imported = ref<Preferences>()
const importError = ref('')
const toast = ref('')
const welcomeKey = 'hdu-quick-station:welcomed'
function needsWelcome() { try { return sessionStorage.getItem(welcomeKey) !== 'yes' } catch { return true } }
const welcome = ref(needsWelcome())
let toastTimer: ReturnType<typeof setTimeout> | undefined
let cleanupTimer: ReturnType<typeof setTimeout> | undefined

watch(preferences, value => {
  if (storageBlocked.value) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    storageWarning.value = ''
  } catch { storageWarning.value = '浏览器未能保存数据，当前改动仅在本页有效，请导出备份。' }
}, { deep: true, flush: 'sync' })
const catalog = computed(() => getCatalog(preferences.value))
const byId = computed(() => new Map(catalog.value.map(service => [service.id, service])))
const favorites = computed(() => preferences.value.favorites.map(id => byId.value.get(id)!))
const recent = computed(() => preferences.value.recent.map(id => byId.value.get(id)!))
const trashedSelection = computed(() => preferences.value.trash.find(item => item.service.id === trashId.value))
const customCount = computed(() => preferences.value.customServices.length + preferences.value.trash.filter(item => item.service.custom).length)
const selected = computed(() => byId.value.get(selectedId.value))
const editing = computed(() => byId.value.get(editingId.value))
const searchResult = computed(() => searchServices(catalog.value, query.value))
const searching = computed(() => !!query.value.trim())
const visibleServices = computed(() => allExpanded.value ? catalog.value : catalog.value.slice(0, 8))

function notify(message: string) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 2800)
}
function enter() {
  try { sessionStorage.setItem(welcomeKey, 'yes') } catch {}
  welcome.value = false
}
function toggleFavorite(id: string) {
  const index = preferences.value.favorites.indexOf(id)
  if (index < 0) {
    preferences.value.favorites.push(id)
    notify('已加入常用')
  } else {
    preferences.value.favorites.splice(index, 1)
    notify('已取消收藏')
  }
}
function record(service: Service) {
  if (preferences.value.recordHistory) preferences.value.recent = addRecent(preferences.value.recent, service.id)
}
function showDetails(service: Service) {
  selectedId.value = service.id
  modal.value = 'service'
  if (service.kind === 'qr' || service.kind === 'guide') record(service)
}
function openEditor(service?: Service) {
  editingId.value = service?.id || ''
  modal.value = 'editor'
}
function closeEditor() { modal.value = editingId.value ? 'service' : null }
function saveService(service: Service) {
  const next = JSON.parse(JSON.stringify(preferences.value)) as Preferences
  const list = service.id.startsWith('custom-') ? next.customServices : next.serviceOverrides
  const index = list.findIndex(item => item.id === service.id)
  if (index === -1) list.unshift(service)
  else list[index] = service
  const isNew = !editingId.value
  preferences.value = next
  selectedId.value = service.id
  modal.value = 'service'
  if (isNew) {
    query.value = ''
    allExpanded.value = true
    nextTick(() => allSection.value?.querySelector<HTMLElement>(`[data-service="${service.id}"]`)?.scrollIntoView({ block: 'start' }))
  }
  notify(storageWarning.value ? '已更新页面，请导出备份保存' : isNew ? '服务已添加' : '修改已保存')
}
function deleteService() {
  preferences.value = trashService(preferences.value, selectedId.value)
  modal.value = null
  notify(storageWarning.value ? '已从页面移除，请导出备份保存' : '已移到回收站，7 天内可恢复')
}
function syncTrash() {
  clock.value = Date.now()
  const next = pruneTrash(preferences.value, clock.value)
  if (next !== preferences.value) preferences.value = next
  if (modal.value === 'purge' && !trashedSelection.value) modal.value = 'trash'
  if (modal.value === 'empty-trash' && !next.trash.length) modal.value = 'trash'
  clearTimeout(cleanupTimer)
  if (next.trash.length) {
    const deadline = Math.min(...next.trash.map(item => item.deletedAt + TRASH_RETENTION_MS))
    cleanupTimer = setTimeout(syncTrash, Math.min(60000, Math.max(1, deadline - clock.value)))
  }
}
function openTrash() {
  syncTrash()
  modal.value = 'trash'
}
function restoreFromTrash(id: string) {
  try {
    preferences.value = restoreService(preferences.value, id)
    query.value = ''
    allExpanded.value = true
    notify(storageWarning.value ? '已恢复到页面，请导出备份保存' : '服务已恢复')
    nextTick(() => {
      allSection.value?.querySelector<HTMLElement>(`[data-service="${id}"]`)?.scrollIntoView({ block: 'start' })
      document.querySelector<HTMLButtonElement>('.trash-list button, .trash-toolbar button')?.focus()
    })
  } catch (error) {
    syncTrash()
    notify((error as Error).message)
  }
}
function purgeSelected() {
  if (trashedSelection.value) preferences.value = permanentlyDeleteService(preferences.value, trashId.value)
  modal.value = 'trash'
  notify(storageWarning.value ? '当前改动未保存，请导出备份' : '已永久删除')
}
function purgeAll() {
  preferences.value = emptyTrash(preferences.value)
  modal.value = 'trash'
  notify(storageWarning.value ? '当前改动未保存，请导出备份' : '回收站已清空')
}
function remainingTime(deletedAt: number) {
  const remaining = deletedAt + TRASH_RETENTION_MS - clock.value
  if (remaining <= 0) return '即将清理'
  if (remaining < 60 * 60 * 1000) return '不足 1 小时'
  if (remaining < 24 * 60 * 60 * 1000) return `剩余 ${Math.ceil(remaining / (60 * 60 * 1000))} 小时`
  return `剩余 ${Math.ceil(remaining / (24 * 60 * 60 * 1000))} 天`
}
function expiryLabel(deletedAt: number) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(deletedAt + TRASH_RETENTION_MS)
}
function onVisibilityChange() { if (document.visibilityState === 'visible') syncTrash() }
watch(() => preferences.value.trash, syncTrash)
function toggleAll() {
  allExpanded.value = !allExpanded.value
  if (!allExpanded.value) nextTick(() => allSection.value?.scrollIntoView({ block: 'start' }))
}
function exportBackup() {
  syncTrash()
  const blob = new Blob([JSON.stringify(preferences.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `杭电快捷站-个人备份-${new Date().toLocaleDateString('sv-SE')}.json`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  notify('已下载个人备份')
}
async function importBackup(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importError.value = ''
  try {
    if (file.size > 100 * 1024 * 1024) throw new Error('文件超过 100 MB，请选择本站导出的备份。')
    imported.value = pruneTrash(parsePreferences(JSON.parse(await file.text())))
    modal.value = 'import'
  } catch (error) {
    importError.value = error instanceof SyntaxError ? '文件不是有效的 JSON，原数据没有改变。' : `${(error as Error).message} 原数据没有改变。`
    modal.value = 'settings'
  } finally { input.value = '' }
}
function confirmImport() {
  storageBlocked.value = false
  preferences.value = pruneTrash(imported.value!)
  imported.value = undefined
  modal.value = null
  query.value = ''
  notify('服务、收藏与设置已恢复')
}
function clearHistory(disable = false) {
  preferences.value = { ...preferences.value, recent: [], recordHistory: disable ? false : preferences.value.recordHistory }
  modal.value = 'settings'
}
function changeHistory() {
  if (preferences.value.recordHistory && recent.value.length) { modal.value = 'clear'; return }
  preferences.value.recordHistory = !preferences.value.recordHistory
}
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable && !modal.value && !welcome.value) {
    event.preventDefault()
    searchInput.value?.focus()
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('focus', syncTrash)
  document.addEventListener('visibilitychange', onVisibilityChange)
  syncTrash()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('focus', syncTrash)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  clearTimeout(toastTimer)
  clearTimeout(cleanupTimer)
})
</script>

<template>
  <Transition name="welcome"><WelcomeScreen v-if="welcome" @enter="enter" /></Transition>
  <a class="skip-link" href="#directory">跳到服务列表</a>
  <header class="topbar"><div class="topbar-inner"><a class="brand" href="#" aria-label="杭电快捷站首页" @click.prevent="query = ''; allExpanded = false; searchInput?.focus();"><img :src="imageUrl('/favicon.svg')" alt="" /><strong>杭电快捷站</strong></a><div class="header-actions"><button class="primary-button add-service" @click="openEditor()"><Plus :size="19" />添加服务</button><button class="icon-button settings-button" aria-label="设置" title="设置" @click="modal = 'settings'"><Settings2 :size="21" /></button></div></div></header>
  <main class="main-content">
    <p v-if="storageWarning" class="warning-banner" role="alert">{{ storageWarning }}</p>
    <section class="search-section" aria-label="搜索服务"><div class="search-box"><Search :size="22" /><input ref="searchInput" v-model="query" type="search" autocomplete="off" placeholder="搜索服务名称或介绍" aria-label="搜索校园服务" /><button v-if="query" class="icon-button" aria-label="清空搜索" @click="query = ''; searchInput?.focus()"><X :size="19" /></button><kbd v-else>/</kbd></div></section>

    <section v-if="searching" class="search-results" aria-labelledby="search-heading"><header class="section-header"><h1 id="search-heading">搜索结果<span class="count">{{ searchResult.items.length }}</span></h1><span v-if="searchResult.items.length && searchResult.matchedBy === 'description'" class="search-fallback">按内容介绍匹配</span></header><div v-if="searchResult.items.length" class="services-grid"><ServiceCard v-for="service in searchResult.items" :key="service.id" :service="service" :favorite="preferences.favorites.includes(service.id)" @favorite="toggleFavorite" @details="showDetails" /></div><div v-else class="empty-state"><Search :size="31" /><h2>没有找到相关服务</h2><button class="secondary-button" @click="query = ''; searchInput?.focus()">清空搜索</button></div></section>
    <template v-else>
      <section class="favorites-section" aria-labelledby="favorites-heading"><header class="section-header"><h2 id="favorites-heading"><Star :size="19" />我的常用<span class="count">{{ favorites.length }}</span></h2><button v-if="favorites.length" class="text-button" @click="editingFavorites = !editingFavorites"><Check v-if="editingFavorites" :size="16" /><Pencil v-else :size="15" />{{ editingFavorites ? '完成' : '整理' }}</button></header><div v-if="favorites.length" class="services-grid favorites-grid"><ServiceCard v-for="(service, index) in favorites" :key="service.id" :service="service" :favorite="true" compact @favorite="toggleFavorite" @details="showDetails"><div v-if="editingFavorites" class="favorite-controls"><button :aria-label="`前移${service.name}`" :disabled="index === 0" :title="index === 0 ? '已经是第一个' : '前移'" @click="preferences.favorites = moveFavorite(preferences.favorites, index, -1)"><ArrowLeft :size="17" /></button><button :aria-label="`后移${service.name}`" :disabled="index === favorites.length - 1" :title="index === favorites.length - 1 ? '已经是最后一个' : '后移'" @click="preferences.favorites = moveFavorite(preferences.favorites, index, 1)"><ArrowRight :size="17" /></button><button :aria-label="`移除常用${service.name}`" @click="toggleFavorite(service.id)"><X :size="17" /></button></div></ServiceCard></div><p v-else class="quiet-empty">点击卡片上的星标，加入常用。</p></section>
      <section v-if="preferences.recordHistory" class="recent-section" aria-labelledby="recent-heading"><header class="section-header"><h2 id="recent-heading"><Clock3 :size="19" />最近使用</h2></header><div v-if="recent.length" class="services-grid recent-grid"><ServiceCard v-for="service in recent" :key="service.id" :service="service" compact :favorite="preferences.favorites.includes(service.id)" @favorite="toggleFavorite" @details="showDetails" /></div><p v-else class="quiet-empty">使用过的服务会出现在这里。</p></section>
      <section id="directory" ref="allSection" class="directory" aria-labelledby="directory-heading"><header class="section-header"><h2 id="directory-heading">全部服务<span class="count">{{ catalog.length }}</span></h2><button v-if="catalog.length > 8" class="text-button expand-button" :aria-expanded="allExpanded" aria-controls="all-services" @click="toggleAll">{{ allExpanded ? '收起' : '展开全部' }}<ChevronUp v-if="allExpanded" :size="17" /><ChevronDown v-else :size="17" /></button></header><p v-if="!catalog.length" class="quiet-empty">没有可用服务，可添加新服务，或到“设置 → 回收站”恢复。</p><div id="all-services" class="services-grid all-grid"><ServiceCard v-for="service in visibleServices" :key="service.id" :service="service" :favorite="preferences.favorites.includes(service.id)" @favorite="toggleFavorite" @details="showDetails" /></div></section>
    </template>
    <footer class="page-footer"><span>杭电快捷站</span><button @click="modal = 'about'">关于本站</button></footer>
  </main>
  <div v-if="toast" class="toast" role="status"><Check :size="17" />{{ toast }}</div>
  <input ref="fileInput" class="visually-hidden" tabindex="-1" type="file" accept=".json,application/json" aria-label="导入个人备份文件" @change="importBackup" />

  <ServiceEditor v-if="modal === 'editor'" :service="editing" :limit-reached="customCount >= 200" @save="saveService" @close="closeEditor" />

  <AppDialog v-if="modal === 'service' && selected" :title="selected.name" @close="modal = null"><div class="detail-summary"><span class="service-icon" :class="selected.color"><ServiceIcon :name="selected.icon" :image="selected.iconImage" :size="28" /></span><div><p v-if="selected.description">{{ selected.description }}</p><span class="detail-kind">{{ kindNames[selected.kind] }}<template v-if="selected.client"> · {{ selected.client }}</template></span></div></div><p v-if="selected.note" class="service-note">{{ selected.note }}</p><p v-if="selected.login" class="service-note">{{ selected.login }}</p><div v-if="selected.kind === 'qr' && selected.qr" class="qr-section"><img :src="imageUrl(selected.qr)" :alt="`${selected.name}入口图片`" /><a class="secondary-button" :href="imageUrl(selected.qr)" :download="`${selected.id}-code.${selected.qr.startsWith('data:image/webp') ? 'webp' : selected.qr.includes('jpeg') || selected.qr.endsWith('.jpg') ? 'jpg' : 'png'}`"><Download :size="16" />保存图片</a></div><div v-if="selected.url" class="detail-url">{{ selected.url }}</div><details class="service-provenance"><summary>来源与使用条件</summary><p v-if="selected.custom || selected.modified">你{{ selected.custom ? '添加' : '修改' }}的服务，网址与使用条件未经本站核实。</p><template v-else><p>{{ selected.campus === 'unknown' ? '校区适用范围待核实，请以目标平台说明为准。' : '具体服务范围与登录要求以目标平台为准。' }}</p><p>{{ verification(selected) }}。检查日期 {{ catalogDate }}。</p><a :href="sourceUrl" target="_blank" rel="noopener noreferrer">查看初始目录来源<ArrowUpRight :size="13" /></a></template></details><div class="detail-tools"><button class="text-button" @click="openEditor(selected)"><Pencil :size="16" />编辑服务</button><button class="text-button" @click="toggleFavorite(selected.id)"><Star :size="16" :fill="preferences.favorites.includes(selected.id) ? 'currentColor' : 'none'" />{{ preferences.favorites.includes(selected.id) ? '取消收藏' : '加入常用' }}</button><button class="text-button danger-text" @click="modal = 'delete'"><Trash2 :size="16" />删除</button></div><a v-if="selected.kind === 'web' && selected.url" class="primary-button full-width open-website" :href="selected.url" target="_blank" rel="noopener noreferrer" @click="record(selected); modal = null">打开网址<ArrowUpRight :size="18" /></a><button v-else class="primary-button full-width" @click="modal = null">知道了</button></AppDialog>

  <AppDialog v-if="modal === 'delete' && selected" title="移到回收站？" @close="modal = 'service'"><p class="dialog-intro">“{{ selected.name }}”会从服务、常用和最近使用中移除，在回收站保留 7 天。恢复时会保留服务内容和原收藏位置。</p><div class="dialog-actions"><button class="secondary-button" @click="modal = 'service'">取消</button><button class="danger-button" @click="deleteService">移到回收站</button></div></AppDialog>

  <AppDialog v-if="modal === 'trash'" title="回收站" wide @close="modal = null">
    <div class="trash-toolbar"><button class="text-button" @click="modal = 'settings'"><ArrowLeft :size="16" />设置</button><button class="text-button danger-text" :disabled="!preferences.trash.length" :title="preferences.trash.length ? '确认后永久删除所有回收站内容' : '回收站为空'" @click="modal = 'empty-trash'"><Trash2 :size="16" />清空回收站</button></div>
    <p class="trash-notice">保留 7 天，到期自动清理；网页关闭期间，到期内容在下次打开时清理。</p>
    <div v-if="preferences.trash.length" class="trash-list"><article v-for="entry in preferences.trash" :key="entry.service.id" class="trash-item" :data-trash-id="entry.service.id"><div class="trash-summary"><span class="service-icon" :class="entry.service.color"><ServiceIcon :name="entry.service.icon" :image="entry.service.iconImage" :size="23" /></span><div class="trash-copy"><h3>{{ entry.service.name }}</h3><p>{{ remainingTime(entry.deletedAt) }}<span> · {{ expiryLabel(entry.deletedAt) }} 到期</span></p></div></div><div class="trash-actions"><button class="secondary-button" :aria-label="`恢复${entry.service.name}`" @click="restoreFromTrash(entry.service.id)"><RotateCcw :size="16" />恢复</button><button class="icon-button danger-text" :aria-label="`永久删除${entry.service.name}`" title="永久删除" @click="trashId = entry.service.id; modal = 'purge'"><Trash2 :size="18" /></button></div></article></div>
    <div v-else class="trash-empty"><Trash2 :size="34" /><h3>回收站是空的</h3></div>
  </AppDialog>

  <AppDialog v-if="modal === 'purge' && trashedSelection" title="永久删除？" @close="modal = 'trash'"><p class="dialog-intro">“{{ trashedSelection.service.name }}”将从回收站永久移除，无法再从回收站恢复。</p><div class="dialog-actions"><button class="secondary-button" @click="modal = 'trash'">取消</button><button class="danger-button" @click="purgeSelected">永久删除</button></div></AppDialog>

  <AppDialog v-if="modal === 'empty-trash'" title="清空回收站？" @close="modal = 'trash'"><p class="dialog-intro">将永久删除回收站中的 {{ preferences.trash.length }} 个服务，无法再从回收站恢复。当前正常使用的服务不受影响。</p><div class="dialog-actions"><button class="secondary-button" @click="modal = 'trash'">取消</button><button class="danger-button" @click="purgeAll">确认清空</button></div></AppDialog>

  <AppDialog v-if="modal === 'settings'" title="设置" @close="modal = null"><div class="setting-row"><div><strong>记录最近使用</strong><p>最多保留 8 条</p></div><button class="switch" :class="{ on: preferences.recordHistory }" role="switch" :aria-checked="preferences.recordHistory" aria-label="记录最近使用" @click="changeHistory"><span></span></button></div><div class="setting-row"><div><strong>清除最近记录</strong><p>{{ recent.length ? `${recent.length} 条记录` : '暂无记录' }}</p></div><button class="icon-button" :disabled="!recent.length" :title="recent.length ? '清除记录' : '没有可清除的记录'" aria-label="清除最近使用" @click="modal = 'clear'"><Trash2 :size="19" /></button></div><button class="setting-link recycle-link" aria-label="回收站" @click="openTrash"><span><Trash2 :size="18" />回收站</span><span>{{ preferences.trash.length }}<ArrowRight :size="16" /></span></button><div class="settings-section"><h3>数据备份</h3><p>服务、收藏和回收站只保存在当前浏览器，换设备可导入备份。</p><div class="backup-buttons"><button class="secondary-button" @click="exportBackup"><Download :size="17" />导出备份</button><button class="secondary-button" @click="fileInput?.click()"><Upload :size="17" />导入备份</button></div><p v-if="importError" class="form-error" role="alert">{{ importError }}</p></div><button class="setting-link" @click="modal = null; welcome = true">重看欢迎页<ArrowRight :size="17" /></button></AppDialog>

  <AppDialog v-if="modal === 'clear'" title="清除最近使用？" @close="modal = 'settings'"><p class="dialog-intro">清除 {{ recent.length }} 条记录，不影响服务与收藏。</p><div class="dialog-actions"><button class="secondary-button" @click="modal = 'settings'">取消</button><button class="secondary-button" @click="clearHistory(true)">清除并关闭记录</button><button class="primary-button" @click="clearHistory()">仅清除记录</button></div></AppDialog>

  <AppDialog v-if="modal === 'import' && imported" title="恢复个人备份" @close="modal = 'settings'"><p class="dialog-intro">包含 {{ imported.customServices.length }} 个自定义服务、{{ imported.serviceOverrides.length }} 个已编辑服务、{{ imported.favorites.length }} 个收藏、{{ imported.recent.length }} 条最近记录与 {{ imported.trash.length }} 条回收站记录。</p><p class="warning-banner">将替换当前服务、删除状态、收藏及设置；已过期的回收站内容不会恢复。建议先备份当前数据。</p><div class="dialog-actions"><button class="secondary-button" @click="exportBackup">先备份当前数据</button><button class="secondary-button" @click="modal = 'settings'">取消</button><button class="primary-button" @click="confirmImport">确认替换并恢复</button></div></AppDialog>

  <AppDialog v-if="modal === 'about'" title="关于杭电快捷站" @close="modal = null"><p class="dialog-intro">独立校园导航工具，非杭州电子科技大学官方网站。本站不接收校园账号或密码。</p><div class="about-block"><h3>服务与数据</h3><p>可以添加或修改任何服务，变更只影响当前浏览器。首次目录来自<a :href="sourceUrl" target="_blank" rel="noopener noreferrer">杭电校园服务参考站</a>，整理于 {{ catalogDate }}。部分校区条件与小程序入口未验证，请以学校或服务商通知为准。</p></div><div class="about-block"><h3>跨设备使用</h3><p>界面适配电脑、平板和手机浏览器。不同设备的数据不会自动同步，请从设置导出并导入备份；清理浏览器数据也会清除本地服务与收藏。</p></div></AppDialog>
</template>
