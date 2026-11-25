<script setup lang="ts">
import type { QuestionComponentEmits, QuestionComponentProps } from '../src'

defineProps<QuestionComponentProps>()
const emit = defineEmits<QuestionComponentEmits<string>>()

function update(event: Event) {
  emit('answer', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <label class="forml-label" :for="inputId">{{ question.label }}</label>
  <input
    :id="inputId"
    :name="question.id"
    :type="question.type === 'date' ? 'date' : 'tel'"
    :autocomplete="question.type === 'tel' ? 'tel' : undefined"
    :value="typeof value === 'string' ? value : ''"
    :required="question.required"
    :aria-describedby="describedBy"
    :aria-invalid="error ? true : undefined"
    @input="update"
  />
</template>
