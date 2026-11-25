<script setup lang="ts">
import type { ProgressComponentProps } from '../../src'

defineProps<ProgressComponentProps>()
</script>

<template>
  <ol v-if="steps.length > 1" class="removals-progress" role="list" aria-label="Quote progress">
    <li
      v-for="(step, index) in steps"
      :key="step.id"
      :aria-current="index === stepIndex ? 'step' : undefined"
      :data-completed="index < stepIndex || undefined"
    >
      <span class="removals-progress__marker" aria-hidden="true">{{ index < stepIndex ? '✓' : index + 1 }}</span>
      <span>{{ step.title }}</span>
    </li>
  </ol>
</template>

<style scoped>
.removals-progress {
  display: flex;
  gap: 0.5rem;
  margin: 0 0 1.5rem;
  padding: 0 0 1rem;
  border-bottom: 1px solid #cad7cd;
  list-style: none;
}

.removals-progress li {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  overflow-wrap: anywhere;
  color: #4e675a;
  font-size: 0.875rem;
  text-align: center;
}

.removals-progress__marker {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  place-items: center;
  border-radius: 50%;
  background: #eff3ef;
}

.removals-progress li[aria-current='step'] {
  color: #155e47;
  font-weight: 700;
}

.removals-progress li[aria-current='step'] .removals-progress__marker {
  background: #155e47;
  color: white;
}

.removals-progress li[data-completed] .removals-progress__marker {
  background: #dce7df;
  color: #155e47;
}
</style>
