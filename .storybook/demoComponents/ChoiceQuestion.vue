<script setup lang="ts">
import { FormlType } from '../../src/schema'
import { computed } from 'vue'
import type { ChoiceOption, JsonValue } from '../../src/schema'
import type { QuestionComponentEmits, QuestionComponentProps } from '../../src/components/component-types'

const props = defineProps<QuestionComponentProps>()
const emit = defineEmits<QuestionComponentEmits<JsonValue>>()
const multiple = computed(() => props.question.type === FormlType.Multiselect)
const selected = computed(() => Array.isArray(props.value) ? props.value : [])

function update(value: ChoiceOption['value'], event: Event) {
  if (!multiple.value) {
    emit('answer', value)
    return
  }

  const checked = (event.target as HTMLInputElement).checked
  emit('answer', checked ? [...selected.value, value] : selected.value.filter((item) => item !== value))
}
</script>

<template>
  <fieldset class="forml-choices" :aria-describedby="describedBy" :aria-invalid="error ? true : undefined">
    <legend class="forml-label">{{ question.label }}</legend>
    <label v-for="(option, index) in question.options" :key="index" class="forml-choice">
      <input
        :id="index === 0 ? inputId : `${inputId}-option-${index}`"
        :name="inputId"
        :type="multiple ? 'checkbox' : 'radio'"
        :value="String(index)"
        :checked="multiple ? selected.includes(option.value) : option.value === value"
        :required="!multiple && question.required"
        :aria-describedby="describedBy"
        :aria-invalid="error ? true : undefined"
        @change="update(option.value, $event)"
      >
      {{ option.label }}
    </label>
  </fieldset>
</template>
