<script setup lang="ts" generic="Request = FormAnswers, Response = never">
import type { FormError } from '../errors'
import type { FormAnswers } from '../schema'
import type { FormAction, FormState } from '../state'
import { useForm, type UseFormOptions, type UseFormSubmitResult } from '../use-form'
import type { ProgressComponent } from './component-types'

const props = defineProps<UseFormOptions<Request, Response> & { progressComponent?: ProgressComponent | null }>()
const emit = defineEmits<{
  'update:state': [state: FormState]
  action: [action: FormAction, nextState: FormState]
  submit: [result: UseFormSubmitResult<Request, Response>]
  error: [error: FormError]
}>()

const {
  configurationError,
  state,
  steps,
  currentStep,
  stepIndex,
  isLastStep,
  pending,
  stepPending,
  submitting,
  fieldValidation,
  submissionError,
  formElement,
  stepComponent,
  questionComponent,
  inputId,
  fieldError,
  answerValue,
  answer,
  back,
  advance,
} = useForm(props, {
  onUpdateState: (state) => emit('update:state', state),
  onAction: (action, next) => emit('action', action, next),
  onSubmit: (result) => emit('submit', result),
  onError: (error) => emit('error', error),
})
</script>

<template>
  <p v-if="configurationError" class="forml-error" role="alert">{{ configurationError.message }}</p>
  <form
    v-else-if="state && currentStep && stepComponent"
    ref="formElement"
    class="forml"
    novalidate
    tabindex="-1"
    :aria-busy="pending"
    @submit.prevent="advance"
  >
    <component v-if="progressComponent" :is="progressComponent" :steps="steps" :step-index="stepIndex" />
    <p v-else-if="progressComponent !== null && steps.length > 1" class="forml-progress">Step {{ stepIndex + 1 }} of {{ steps.length }}</p>
    <fieldset class="forml-step-fields" :disabled="pending">
      <component :is="stepComponent" :key="currentStep.id" :step="currentStep" :answers="state.answers">
        <div v-for="(question, index) in currentStep.questions" :key="question.id" class="forml-question">
          <component
            :is="questionComponent(question.type)"
            :question="question"
            :value="answerValue(question.id)"
            :input-id="inputId(index)"
            :error="fieldError(question.id)"
            :described-by="
              [question.description && `${inputId(index)}-description`, fieldError(question.id) && `${inputId(index)}-error`]
                .filter(Boolean)
                .join(' ') || undefined
            "
            @answer="answer(question.id, $event)"
          />
          <p v-if="question.description" :id="`${inputId(index)}-description`" class="forml-description">
            {{ question.description }}
          </p>
          <p v-if="fieldError(question.id)" :id="`${inputId(index)}-error`" class="forml-error">
            {{ fieldError(question.id) }}
          </p>
        </div>
      </component>
    </fieldset>
    <p v-if="submissionError || fieldValidation" class="forml-error" role="alert">
      {{ submissionError || fieldValidation?.message }}
    </p>
    <div class="forml-actions">
      <button v-if="stepIndex > 0" type="button" :disabled="pending" @click="back">Back</button>
      <button type="submit" :disabled="pending">
        {{ submitting ? 'Submitting…' : stepPending ? 'Working…' : isLastStep ? 'Submit' : 'Continue' }}
      </button>
    </div>
  </form>
</template>
