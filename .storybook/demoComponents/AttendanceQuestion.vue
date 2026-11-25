<script setup lang="ts">
import type { ChoiceOption, QuestionComponentEmits, QuestionComponentProps } from 'forml/types'

defineProps<QuestionComponentProps>()
const emit = defineEmits<QuestionComponentEmits<ChoiceOption['value']>>()
</script>

<template>
  <fieldset class="forml-choices" :aria-describedby="describedBy">
    <legend class="forml-label">{{ question.label }}</legend>
    <label v-for="(option, index) in question.options" :key="index" class="forml-choice">
      <input
        :id="index === 0 ? inputId : `${inputId}-option-${index}`"
        :name="inputId"
        type="radio"
        :checked="value === option.value"
        :required="question.required"
        :aria-describedby="describedBy"
        :aria-invalid="error ? true : undefined"
        @change="emit('answer', option.value)"
      />
      {{ option.label }}
    </label>
  </fieldset>
</template>
