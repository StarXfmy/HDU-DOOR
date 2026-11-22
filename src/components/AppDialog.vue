<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { X } from 'lucide-vue-next'

defineProps<{ title: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const previousFocus = document.activeElement as HTMLElement | null
onMounted(async () => {
  dialog.value?.showModal()
  await nextTick()
  dialog.value?.querySelector<HTMLButtonElement>('.dialog-close')?.focus()
})
onBeforeUnmount(() => {
  dialog.value?.close()
  previousFocus?.focus()
})
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="app-dialog" :class="{ wide }" aria-labelledby="dialog-heading" @cancel.prevent="emit('close')" @click="($event.target === dialog) && emit('close')">
      <div class="dialog-content">
        <header class="dialog-header"><h2 id="dialog-heading">{{ title }}</h2><button type="button" class="icon-button dialog-close" aria-label="关闭弹窗" @click="emit('close')"><X :size="20" /></button></header>
        <slot />
      </div>
    </dialog>
  </Teleport>
</template>
