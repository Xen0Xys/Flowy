<template>
  <div :class="cn('p-4', props.class)">
    <div :class="cn('rounded-lg bg-card p-6 shadow-lg text-card-foreground', innerClass)">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{ class?: HTMLAttributes['class']; innerClass?: string }>(), {
  class: undefined,
  innerClass: undefined,
})
</script>
