<script setup lang="ts">
import type { StepComponentProps, StepComponentSlots } from '../../src'

defineProps<StepComponentProps>()
defineSlots<StepComponentSlots>()
</script>

<template>
  <section class="forml-step">
    <h2>{{ step.title }}</h2>
    <div class="contact-fields"><slot /></div>
  </section>
</template>
