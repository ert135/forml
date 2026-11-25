<script setup lang="ts">
import type { StepComponentProps, StepComponentSlots } from 'forml/types'

defineOptions({ inheritAttrs: false })
defineProps<StepComponentProps>()
defineSlots<StepComponentSlots>()
</script>

<template>
  <div class="forml-step">
    <h2>{{ step.title }}</h2>
    <p v-if="step.description">{{ step.description }}</p>
    <slot />
  </div>
</template>
