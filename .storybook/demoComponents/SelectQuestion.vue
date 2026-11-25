<script setup lang="ts">
import { computed } from 'vue'

import type { QuestionComponentEmits, QuestionComponentProps } from '../../src/components/component-types'
import type { ChoiceOption } from '../../src/schema'

const props = defineProps<QuestionComponentProps>()
const emit = defineEmits<QuestionComponentEmits<ChoiceOption['value'] | null>>()
const selected = computed(() => props.question.options?.findIndex((option) => option.value === props.value) ?? -1)

function update(event: Event) {
  const select = event.target as HTMLSelectElement
  emit('answer', props.question.options?.[select.selectedIndex - 1]?.value ?? null)
}
</script>

<template>
  <label class="forml-label" :for="inputId">{{ question.label }}</label>
  <select
    :id="inputId"
    :name="question.id"
    :value="selected < 0 ? '' : String(selected)"
    :required="question.required"
    :aria-describedby="describedBy"
    :aria-invalid="error ? true : undefined"
    @change="update"
  >
    <option value="">{{ question.placeholder ?? 'Select an option' }}</option>
    <option v-for="(option, index) in question.options" :key="index" :value="String(index)">
      {{ option.label }}
    </option>
  </select>
</template>
