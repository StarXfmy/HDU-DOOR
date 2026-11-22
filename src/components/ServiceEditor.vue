<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Check, ImagePlus, Upload, X } from 'lucide-vue-next'
import AppDialog from './AppDialog.vue'
import ServiceIcon from './ServiceIcon.vue'
import { colorOptions, iconOptions, imageUrl, validateService } from '../data'
import type { EntryType, Service } from '../data'

const props = defineProps<{ service?: Service; limitReached?: boolean }>()
const emit = defineEmits<{ save: [service: Service]; close: [] }>()
const initial = props.service
const form = reactive({
  name: initial?.name || '', url: initial?.url || '', description: initial?.description || '',
  icon: initial?.icon || 'Globe2', color: initial?.color || 'green', iconImage: initial?.iconImage || '',
  kind: initial?.kind || 'web' as EntryType, qr: initial?.qr || '',
  note: initial?.note || '', client: initial?.client || '', login: initial?.login || '', keywords: initial?.keywords.join('、') || '',
})
const original = JSON.stringify(form)
const dirty = computed(() => JSON.stringify(form) !== original)
const error = ref('')
const uploading = ref(false)
const discard = ref(false)
const nameInput = ref<HTMLInputElement>()
const iconInput = ref<HTMLInputElement>()
const qrInput = ref<HTMLInputElement>()
let uploadToken = 0
onMounted(async () => { await nextTick(); nameInput.value?.focus() })
onBeforeUnmount(() => { uploadToken++ })
function requestClose() { if (dirty.value || uploading.value) discard.value = true; else emit('close') }
function save() {
  error.value = ''
  if (!initial && props.limitReached) { error.value = '最多保留 200 个自定义服务，含回收站中的服务；可先清理回收站。'; return }
  try {
    const service = validateService({
      ...initial,
      id: initial?.id || `custom-${crypto.randomUUID()}`,
      name: form.name.trim(), description: form.description.trim(), icon: form.icon, color: form.color,
      iconImage: form.iconImage || undefined, kind: form.kind,
      category: initial?.category || 'tools', campus: initial?.campus || 'unknown',
      keywords: form.keywords.split(/[、,，\n]/).map(word => word.trim()).filter(Boolean),
      url: form.kind === 'web' ? form.url.trim() : undefined,
      qr: form.kind === 'qr' ? form.qr : undefined,
      note: form.note.trim() || undefined, client: form.client.trim() || undefined, login: form.login.trim() || undefined,
    })
    emit('save', service)
  } catch (err) { error.value = (err as Error).message }
}
async function readImage(event: Event, target: 'iconImage' | 'qr') {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  error.value = ''
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { error.value = '请选择 PNG、JPG 或 WebP 图片，不支持 SVG。'; return }
  if (file.size > 5 * 1024 * 1024) { error.value = '图片不能超过 5 MB。'; return }
  const token = ++uploadToken
  uploading.value = true
  const source = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('图片无法读取，请换一张图片。'))
      image.src = source
    })
    const maxSize = target === 'iconImage' ? 128 : 800
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/webp', .86)
    if (dataUrl.length > 180000) throw new Error('图片内容太大，请裁剪到图标或二维码区域后重试。')
    if (token === uploadToken) form[target] = dataUrl
  } catch (err) {
    if (token === uploadToken) error.value = (err as Error).message
  } finally {
    URL.revokeObjectURL(source)
    if (token === uploadToken) uploading.value = false
  }
}
</script>

<template>
  <AppDialog :title="initial ? '编辑服务' : '添加服务'" wide @close="requestClose">
    <form class="service-form" novalidate @submit.prevent="save">
      <div class="editor-preview"><span class="service-icon" :class="form.color"><ServiceIcon :name="form.icon" :image="form.iconImage" :size="28" /></span><strong>{{ form.name || '新的服务' }}</strong></div>
      <p v-if="!initial && limitReached" class="warning-banner">最多保留 200 个自定义服务（含回收站），可先到设置中清理回收站。</p>
      <label class="form-field">服务名称<span class="required">必填</span><input ref="nameInput" v-model="form.name" maxlength="60" required placeholder="例如：我的课程资料" autocomplete="off" /></label>
      <div class="form-field"><label for="service-kind">入口类型</label><select id="service-kind" v-model="form.kind"><option value="web">网页</option><option value="qr">二维码</option><option value="guide">文字指引</option><option value="pending">待补充入口</option></select></div>
      <label v-if="form.kind === 'web'" class="form-field">网址<span class="required">必填</span><input v-model="form.url" type="url" inputmode="url" maxlength="2048" required placeholder="https://…" autocapitalize="off" spellcheck="false" autocomplete="off" /></label>
      <div v-if="form.kind === 'qr'" class="form-field"><span>入口图片<span class="required">必填</span></span><div class="qr-edit"><img v-if="form.qr" :src="imageUrl(form.qr)" alt="入口图片预览" /><button type="button" class="secondary-button" :disabled="uploading" @click="qrInput?.click()"><Upload :size="17" />{{ form.qr ? '更换入口图片' : '上传二维码' }}</button></div><input ref="qrInput" type="file" class="visually-hidden" tabindex="-1" accept="image/png,image/jpeg,image/webp" aria-label="上传入口图片文件" @change="readImage($event, 'qr')" /></div>
      <label class="form-field">内容介绍<textarea v-model="form.description" maxlength="600" rows="3" placeholder="这个服务可以做什么？"></textarea></label>
      <fieldset class="icon-field"><legend>图标</legend><div class="icon-options"><button v-for="icon in iconOptions" :key="icon.name" type="button" :aria-label="`选择${icon.label}图标`" :aria-pressed="!form.iconImage && form.icon === icon.name" :title="icon.label" :class="{ chosen: !form.iconImage && form.icon === icon.name }" @click="form.icon = icon.name; form.iconImage = ''"><ServiceIcon :name="icon.name" :size="21" /></button></div><div class="icon-upload-row"><button type="button" class="text-button" :disabled="uploading" @click="iconInput?.click()"><ImagePlus :size="17" />上传自己的图标</button><button v-if="form.iconImage" type="button" class="text-button" @click="form.iconImage = ''"><X :size="14" />移除图片</button><span>PNG / JPG / WebP</span></div><input ref="iconInput" type="file" class="visually-hidden" tabindex="-1" accept="image/png,image/jpeg,image/webp" aria-label="上传图标文件" @change="readImage($event, 'iconImage')" /></fieldset>
      <fieldset class="color-field"><legend>图标底色</legend><div class="color-options"><button v-for="color in colorOptions" :key="color.name" type="button" :class="[color.name, { chosen: form.color === color.name }]" :aria-label="`选择${color.label}底色`" :aria-pressed="form.color === color.name" @click="form.color = color.name"><Check v-if="form.color === color.name" :size="19" /></button></div></fieldset>
      <details class="editor-more"><summary>更多信息</summary><label class="form-field">使用说明<textarea v-model="form.note" maxlength="1600" rows="3" placeholder="登录要求、操作步骤或注意事项"></textarea></label><label class="form-field">使用环境<input v-model="form.client" maxlength="40" placeholder="例如：微信、支付宝、校园网" /></label><label class="form-field">登录要求<textarea v-model="form.login" maxlength="1600" rows="2" placeholder="例如：需要学校统一认证，仅填写说明，不填写账号密码"></textarea></label><label class="form-field">搜索别名<input v-model="form.keywords" maxlength="600" placeholder="用顿号分隔，例如：二课、活动报名" /></label></details>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div v-if="discard" class="discard-box" role="alert"><p>有未保存的修改，要放弃吗？</p><div><button type="button" class="secondary-button" @click="discard = false">继续编辑</button><button type="button" class="danger-button" @click="emit('close')">放弃修改</button></div></div>
      <div v-else class="dialog-actions editor-actions"><button type="button" class="secondary-button" @click="requestClose">取消</button><button class="primary-button" type="submit" :disabled="uploading || (!initial && limitReached)">{{ uploading ? '图片处理中…' : !initial && limitReached ? '已达 200 个上限' : '保存服务' }}<Check :size="17" /></button></div>
    </form>
  </AppDialog>
</template>
