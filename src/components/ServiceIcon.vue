<script setup lang="ts">
import {
  ArrowUpRight, BadgeCheck, BookOpen, Bot, BriefcaseBusiness, Building2,
  CalendarDays, CloudSun, Code2, Coffee, Droplets, Flag, FlaskConical, Footprints,
  Globe2, GraduationCap, Landmark, Languages, Lightbulb, Mountain, Package,
  PanelsTopLeft, PenLine, SearchCheck, Shapes, ShieldCheck, ShowerHead,
  Smartphone, Sparkles, Sprout, Store, Wrench,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import { imageUrl } from '../data'

defineProps<{ name: string; size?: number; image?: string }>()
const icons: Record<string, Component> = {
  BadgeCheck, BookOpen, Bot, BriefcaseBusiness, Building2, CalendarDays,
  CloudSun, Code2, Coffee, Droplets, Flag, FlaskConical, Footprints, Globe2,
  GraduationCap, Landmark, Languages, Lightbulb, Mountain, Package,
  PanelsTopLeft, PenLine, SearchCheck, Shapes, ShieldCheck, ShowerHead,
  Smartphone, Sparkles, Sprout, Store, Wrench,
}
</script>

<template>
  <img v-if="image" :src="imageUrl(image)" class="uploaded-icon" alt="" />
  <component v-else :is="icons[name] || ArrowUpRight" :size="size || 22" :stroke-width="1.7" aria-hidden="true" />
</template>
