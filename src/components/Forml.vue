<script setup lang="ts" generic="Request = FormAnswers, Response = never">
import { Cause, Effect, Exit } from 'effect'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId, watch } from 'vue'
import type { Component } from 'vue'
import type { FormStepChangeEffect } from '../step-change-effects'
import type { QuestionChangeEffects } from '../change-effects'
import { FormStepChangeError, FormRuntimeError, FormSchemaError, QuestionChangeError } from '../errors'
import type { FormError, FormValidationError } from '../errors'
import { sameJson } from '../json'
import { decodeForm, FormlType } from '../schema'
import type { FormAnswers, FormQuestion, JsonValue } from '../schema'
import { createFormState, FormlActionType, reduceForm } from '../state'
import type { FormAction, FormState } from '../state'
import type { FormSubmission, SubmissionResult } from '../submission'
import { validationError } from '../validation'
import { questionVisibility } from '../visibility'
import type { ProgressComponent, QuestionComponents, StepComponents } from './component-types'
import CheckboxQuestion from '../../.storybook/demoComponents/CheckboxQuestion.vue'
import ChoiceQuestion from '../../.storybook/demoComponents/ChoiceQuestion.vue'
import DefaultStep from '../../.storybook/demoComponents/DefaultStep.vue'
import SelectQuestion from '../../.storybook/demoComponents/SelectQuestion.vue'
import TextQuestion from '../../.storybook/demoComponents/TextQuestion.vue'

const props = defineProps<{
  schema: unknown
  state?: FormState
  stepComponents?: StepComponents
  questionComponents?: QuestionComponents
  progressComponent?: ProgressComponent | null
  beforeStepChange?: FormStepChangeEffect
  changeEffects?: QuestionChangeEffects
  submission?: FormSubmission<Request, Response, FormValidationError>
}>()

const emit = defineEmits<{
  'update:state': [state: FormState]
  action: [action: FormAction, nextState: FormState]
  submit: [result: SubmissionResult<Request, Response> | { readonly request: FormAnswers; readonly sent: false }]
  error: [error: FormError]
}>()

const builtIns: Readonly<Record<string, Component>> = {
  [FormlType.Text]: TextQuestion,
  [FormlType.Email]: TextQuestion,
  [FormlType.Textarea]: TextQuestion,
  [FormlType.Select]: SelectQuestion,
  [FormlType.Multiselect]: ChoiceQuestion,
  [FormlType.Radio]: ChoiceQuestion,
  [FormlType.Checkbox]: CheckboxQuestion,
}

function registered<Value>(registry: Readonly<Record<string, Value>> | undefined, name: string) {
  return registry && Object.hasOwn(registry, name) ? registry[name] : undefined
}

function questionComponent(type: string) {
  return registered(props.questionComponents, type) ?? registered(builtIns, type)
}

const definition = computed(() => Effect.runSyncExit(decodeForm(props.schema)))
const form = computed(() => Exit.isSuccess(definition.value) ? definition.value.value : undefined)
const steps = computed(() => form.value?.steps ?? [])
const configurationError = computed(() => {
  if (Exit.isFailure(definition.value)) {
    const cause = definition.value.cause
    const failure = cause.reasons.find(Cause.isFailReason)
    return failure?.error ?? new FormSchemaError({ cause, message: 'Could not read the form definition.' })
  }

  for (const step of steps.value) {
    if (step.component && !registered(props.stepComponents, step.component)) {
      return new FormSchemaError({ message: `Register the step component "${step.component}".` })
    }
    for (const question of step.questions) {
      if (!questionComponent(question.type)) {
        return new FormSchemaError({ message: `Register a question component for "${question.type}".` })
      }
      const effectName = question.effectOnChange
      if (effectName && typeof registered(props.changeEffects, effectName) !== 'function') {
        return new FormSchemaError({ message: `Register the change effect "${effectName}" for question "${question.id}".` })
      }
    }
  }
})

watch(configurationError, (error) => {
  if (error) emit('error', error)
}, { immediate: true })

let activeSubmit: AbortController | undefined
let activeStepChange: AbortController | undefined
let revision = 0
const stepPending = ref(false)
const submitting = ref(false)
const pending = computed(() => stepPending.value || submitting.value)
const activeChanges = new Map<string, { controller: AbortController; value: JsonValue }>()

function cancelStepChange() {
  activeStepChange?.abort()
  activeStepChange = undefined
  stepPending.value = false
}

function cancelChanges() {
  for (const { controller } of activeChanges.values()) controller.abort()
  activeChanges.clear()
}

const localState = shallowRef<FormState>()
watch(form, (decoded) => {
  revision++
  cancelStepChange()
  activeSubmit?.abort()
  activeSubmit = undefined
  submitting.value = false
  cancelChanges()
  localState.value = decoded ? createFormState(decoded) : undefined
}, { immediate: true })

const state = computed(() => props.state ?? localState.value)
watch(() => props.state, cancelStepChange, { flush: 'sync' })
const visibility = computed(() => questionVisibility(steps.value, state.value?.answers ?? {}))
watch(visibility, (visible) => {
  for (const [id, { controller }] of activeChanges) {
    if (visible.get(id) !== false) continue
    activeChanges.delete(id)
    controller.abort()
  }
})

const stepIndex = computed(() => Math.max(0, steps.value.findIndex((step) => step.id === state.value?.stepId)))
const currentStep = computed(() => {
  const step = steps.value[stepIndex.value]
  if (!step) return undefined
  const visible = visibility.value
  const questions = step.questions.filter((question) => visible.get(question.id))
  return questions.length === step.questions.length ? step : { ...step, questions }
})
const isLastStep = computed(() => stepIndex.value === steps.value.length - 1)
const stepComponent = computed(() => currentStep.value?.component
  ? registered(props.stepComponents, currentStep.value.component)
  : DefaultStep)

const fieldValidation = computed(() => {
  if (!state.value) return undefined
  const visible = visibility.value
  const errors = Object.entries(state.value.errors).filter(([id]) => visible.get(id) !== false)
  return validationError(Object.fromEntries(errors))
})
const submissionError = ref('')
const formElement = ref<HTMLFormElement>()
const formId = useId()

function inputId(index: number) {
  return `${formId}-${stepIndex.value}-${index}`
}

function fieldError(id: string) {
  const errors = state.value?.errors
  return errors && Object.hasOwn(errors, id) ? errors[id] : undefined
}

function answer(id: string) {
  const answers = state.value?.answers
  return answers && Object.hasOwn(answers, id) ? answers[id] : undefined
}

function dispatch(action: FormAction) {
  const current = state.value
  if (!form.value || !current || configurationError.value || pending.value) return

  const next = reduceForm(form.value, current, action)
  const beforeStepChange = props.beforeStepChange
  if (!beforeStepChange
    || (action.type !== FormlActionType.Next && action.type !== FormlActionType.Back)
    || next.stepId === current.stepId) return commit(action, current, next)

  // Give the pipeline detached inputs; only commit can update the form state.
  const actionSnapshot = { ...action }
  const stateSnapshot = {
    ...current,
    answers: snapshotAnswers(current.answers),
    errors: { ...current.errors },
  }
  return runBeforeStepChange(action, current, next, Effect.suspend(() => beforeStepChange(actionSnapshot, stateSnapshot)))
}

function commit(action: FormAction, current: FormState, next: FormState) {
  submissionError.value = ''
  if (!props.state) localState.value = next
  emit('update:state', next)
  emit('action', action, next)
  if (next.stepId !== current.stepId) void nextTick(() => formElement.value?.focus())
  return next
}

async function runBeforeStepChange(action: FormAction, current: FormState, next: FormState, effect: Effect.Effect<unknown, unknown>) {
  const controller = new AbortController()
  const startedAt = revision
  activeStepChange = controller
  stepPending.value = true
  submissionError.value = ''
  try {
    const result = await Effect.runPromiseExit(effect, { signal: controller.signal })
    if (activeStepChange !== controller || controller.signal.aborted || revision !== startedAt || state.value !== current) return
    if (Exit.isFailure(result)) {
      const failure = result.cause.reasons.find(Cause.isFailReason)
      const error = new FormStepChangeError({
        action,
        cause: failure ? failure.error : Cause.squash(result.cause),
        message: 'Could not change steps. Try again.',
      })
      submissionError.value = error.message
      emit('error', error)
      return
    }
    return commit(action, current, next)
  } finally {
    if (activeStepChange === controller) {
      activeStepChange = undefined
      stepPending.value = false
    }
  }
}

function reportCause(cause: Cause.Cause<FormError>) {
  const failure = cause.reasons.find(Cause.isFailReason)
  const error = failure?.error ?? new FormRuntimeError({ cause, message: 'The form could not finish. Try again.' })
  submissionError.value = error.message
  emit('error', error)
}

function snapshotValue(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(snapshotValue)
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshotValue(item)]))
}

function snapshotAnswers(answers: Readonly<FormAnswers>, visibility?: ReadonlyMap<string, boolean>): FormAnswers {
  const entries: [string, JsonValue][] = []
  for (const [id, value] of Object.entries(answers)) {
    if (value !== undefined && visibility?.get(id) !== false) entries.push([id, snapshotValue(value)])
  }
  return Object.fromEntries(entries)
}

async function changeAnswer(question: FormQuestion, value: JsonValue) {
  if (!currentStep.value?.questions.includes(question)) return

  const { id, effectOnChange } = question
  const active = activeChanges.get(id)
  const previousValue = active ? active.value : answer(id)
  const startedAt = revision
  const dispatched = dispatch({ type: FormlActionType.Answer, questionId: id, value })
  const next = dispatched instanceof Promise ? await dispatched : dispatched
  if (!next || revision !== startedAt || !effectOnChange || sameJson(previousValue, value)) return

  const run = registered(props.changeEffects, effectOnChange)
  if (!run) return

  active?.controller.abort()
  const controller = new AbortController()
  const answers = snapshotAnswers(next.answers)
  const context = {
    question,
    value: snapshotValue(value),
    previousValue: previousValue === undefined ? undefined : snapshotValue(previousValue),
    answers,
  }
  activeChanges.set(id, { controller, value: context.value })

  const result = await Effect.runPromiseExit(Effect.suspend(() => run(context)), { signal: controller.signal })
  if (activeChanges.get(id)?.controller !== controller) return
  activeChanges.delete(id)
  if (controller.signal.aborted || Exit.isSuccess(result) || visibility.value.get(id) === false) return

  const failure = result.cause.reasons.find(Cause.isFailReason)
  emit('error', new QuestionChangeError({
    questionId: id,
    effectName: effectOnChange,
    cause: failure ? failure.error : Cause.squash(result.cause),
    message: `The change effect for "${question.label}" failed.`,
  }))
}

async function advance() {
  if (!currentStep.value || configurationError.value || pending.value) return
  const shouldSubmit = isLastStep.value
  const startedAt = revision
  const dispatched = dispatch({ type: shouldSubmit ? FormlActionType.Submit : FormlActionType.Next })
  const next = dispatched instanceof Promise ? await dispatched : dispatched
  if (!next || revision !== startedAt) return

  const error = validationError(next.errors)
  if (error) {
    emit('error', error)
    void nextTick(() => formElement.value?.querySelector<HTMLElement>(
      'input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"], button[aria-invalid="true"]',
    )?.focus())
    return
  }
  if (!shouldSubmit) return

  const answerSnapshot = snapshotAnswers(next.answers, questionVisibility(steps.value, next.answers))
  if (!props.submission) {
    emit('submit', { request: answerSnapshot, sent: false })
    return
  }

  const controller = new AbortController()
  const submission = props.submission
  activeSubmit = controller
  submitting.value = true
  try {
    const result = await Effect.runPromiseExit(Effect.suspend(() => submission(answerSnapshot)), { signal: controller.signal })
    if (controller.signal.aborted) return
    if (Exit.isSuccess(result)) emit('submit', result.value)
    else reportCause(result.cause)
  } finally {
    if (activeSubmit === controller) {
      activeSubmit = undefined
      submitting.value = false
    }
  }
}

onBeforeUnmount(() => {
  revision++
  cancelStepChange()
  activeSubmit?.abort()
  cancelChanges()
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
    <component
      v-if="progressComponent"
      :is="progressComponent"
      :steps="steps"
      :step-index="stepIndex"
    />
    <p v-else-if="progressComponent !== null && steps.length > 1" class="forml-progress">
      Step {{ stepIndex + 1 }} of {{ steps.length }}
    </p>
    <fieldset class="forml-step-fields" :disabled="pending">
      <component
        :is="stepComponent"
        :key="currentStep.id"
        :step="currentStep"
        :answers="state.answers"
      >
        <div v-for="(question, index) in currentStep.questions" :key="question.id" class="forml-question">
          <component
            :is="questionComponent(question.type)"
            :question="question"
            :value="answer(question.id)"
            :input-id="inputId(index)"
            :error="fieldError(question.id)"
            :described-by="[
              question.description && `${inputId(index)}-description`,
              fieldError(question.id) && `${inputId(index)}-error`,
            ].filter(Boolean).join(' ') || undefined"
            @answer="changeAnswer(question, $event)"
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
      <button v-if="stepIndex > 0" type="button" :disabled="pending" @click="dispatch({ type: FormlActionType.Back })">Back</button>
      <button type="submit" :disabled="pending">{{ submitting ? 'Submitting…' : stepPending ? 'Working…' : isLastStep ? 'Submit' : 'Continue' }}</button>
    </div>
  </form>
</template>
