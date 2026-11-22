<script setup lang="ts">
import { Star } from 'lucide-vue-next'
import type { Service } from '../data'
import ServiceIcon from './ServiceIcon.vue'

defineProps<{ service: Service; favorite: boolean; compact?: boolean }>()
const emit = defineEmits<{ favorite: [id: string]; details: [service: Service] }>()
</script>

<template>
  <article class="service-card" :class="{ compact }" :data-service="service.id">
    <button class="card-body" :aria-label="`查看${service.name}详情`" @click="emit('details', service)">
      <span class="service-icon" :class="service.color"><ServiceIcon :name="service.icon" :image="service.iconImage" :size="24" /></span>
      <span class="card-copy"><strong>{{ service.name }}</strong><span v-if="!compact && service.description" class="card-description">{{ service.description }}</span></span>
    </button>
    <button class="icon-button favorite-button" :class="{ selected: favorite }" :aria-label="`${favorite ? '取消收藏' : '收藏'}${service.name}`" :aria-pressed="favorite" :title="favorite ? '取消收藏' : '加入常用'" @click="emit('favorite', service.id)"><Star :size="18" :fill="favorite ? 'currentColor' : 'none'" /></button>
    <slot />
  </article>
</template>
