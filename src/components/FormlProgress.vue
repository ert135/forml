<script setup lang="ts">
import type { ProgressComponentProps } from './component-types'

defineProps<ProgressComponentProps>()
</script>

<template>
  <div v-if="steps.length > 1" class="forml-step-progress">
    <p class="forml-step-progress__position" role="status">
      Step {{ stepIndex + 1 }} of {{ steps.length }}
    </p>
    <ol class="forml-step-progress__steps" aria-label="Form steps" role="list">
      <li
        v-for="(step, index) in steps"
        :key="step.id"
        :aria-current="index === stepIndex ? 'step' : undefined"
        :data-state="index < stepIndex ? 'previous' : index === stepIndex ? 'current' : 'upcoming'"
      >
        {{ step.title }}
      </li>
    </ol>
  </div>
</template>

<style scoped>
.forml-step-progress {
  margin-block-end: 1.5rem;
}

.forml-step-progress__position {
  margin: 0 0 0.65rem;
  font-size: 0.875rem;
}

.forml-step-progress__steps {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(6rem, 1fr);
  gap: 0.5rem;
  overflow-x: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}

.forml-step-progress__steps li {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--forml-progress-muted-text, #495c55);
  font-size: 0.875rem;
}

.forml-step-progress__steps li::before {
  content: '';
  height: 0.35rem;
  flex: none;
  border-radius: 0.2rem;
  background: var(--forml-progress-track, #dce7df);
}

.forml-step-progress__steps li[data-state='previous']::before {
  background: var(--forml-progress-previous, #7bb39c);
}

.forml-step-progress__steps li[aria-current='step'] {
  color: var(--forml-progress-active, #155e47);
  font-weight: 700;
}

.forml-step-progress__steps li[aria-current='step']::before {
  background: var(--forml-progress-active, #155e47);
}
</style>
