<script setup lang="ts">
import { FormlType } from 'forml/schema'
import type { QuestionComponentEmits, QuestionComponentProps } from 'forml/types'

defineProps<QuestionComponentProps>()
const emit = defineEmits<QuestionComponentEmits<string>>()

function update(event: Event) {
  emit('answer', (event.target as HTMLInputElement | HTMLTextAreaElement).value)
}
</script>

<template>
  <label class="forml-label" :for="inputId">{{ question.label }}</label>
  <textarea
    v-if="question.type === FormlType.Textarea"
    :id="inputId"
    :name="question.id"
    :placeholder="question.placeholder"
    :value="typeof value === 'string' ? value : ''"
    :required="question.required"
    :aria-describedby="describedBy"
    :aria-invalid="error ? true : undefined"
    @input="update"
  />
  <input
    v-else
    :id="inputId"
    :name="question.id"
    :type="question.type === FormlType.Email ? 'email' : 'text'"
    :placeholder="question.placeholder"
    :value="typeof value === 'string' ? value : ''"
    :required="question.required"
    :aria-describedby="describedBy"
    :aria-invalid="error ? true : undefined"
    @input="update"
  />
</template>
