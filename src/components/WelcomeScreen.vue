<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowRight, BookOpen, Coffee, CheckCheck } from 'lucide-vue-next'
import { imageUrl } from '../data'

const emit = defineEmits<{ enter: [] }>()
const dialog = ref<HTMLDialogElement>()
const enterButton = ref<HTMLButtonElement>()
onMounted(async () => {
  dialog.value?.showModal()
  await nextTick()
  enterButton.value?.focus()
})
onBeforeUnmount(() => dialog.value?.close())
</script>

<template>
  <dialog ref="dialog" class="welcome-dialog" aria-labelledby="welcome-heading" @cancel.prevent="emit('enter')">
    <div class="welcome-shell">
      <div class="welcome-brand"><img :src="imageUrl('/favicon.svg')" alt="" /><span>杭电快捷站</span></div>
      <div class="welcome-content">
        <div class="welcome-copy"><span class="welcome-kicker">校园日常，一站直达</span><h1 id="welcome-heading">校园里的事，<br />从<span>这里</span>开始。</h1><p>把常用入口，收在一起。</p><button ref="enterButton" class="primary-button enter-button" @click="emit('enter')">进入<ArrowRight :size="20" /></button></div>
        <div class="welcome-art" aria-hidden="true"><div class="art-orbit"></div><div class="art-orbit outer"></div><div class="art-center"><img :src="imageUrl('/favicon.svg')" alt="" /><span>少一点寻找<br /><strong>多一点出发</strong></span></div><div class="art-chip chip-study"><BookOpen :size="23" /><span>学习充个电</span></div><div class="art-chip chip-life"><Coffee :size="23" /><span>生活有着落</span></div><div class="art-chip chip-done"><CheckCheck :size="23" /><span>校园事，轻松办</span></div></div>
      </div>
    </div>
  </dialog>
</template>
