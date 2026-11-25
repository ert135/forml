<script setup lang="ts">
import type { QuestionComponentEmits, QuestionComponentProps } from '../../src/components/component-types'

defineProps<QuestionComponentProps>()
const emit = defineEmits<QuestionComponentEmits<boolean>>()

function update(event: Event) {
  emit('answer', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <label class="forml-choice" :for="inputId">
    <input
      :id="inputId"
      :name="question.id"
      type="checkbox"
      :checked="value === true"
      :required="question.required"
      :aria-describedby="describedBy"
      :aria-invalid="error ? true : undefined"
      @change="update"
    />
    {{ question.label }}
  </label>
</template>
