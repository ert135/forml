import { Cause, Effect, Exit } from 'effect'
import { computed, nextTick, onScopeDispose, readonly, ref, shallowRef, useId, watch, type Component } from 'vue'

import AutocompleteQuestion from '../.storybook/demoComponents/AutocompleteQuestion.vue'
import CheckboxQuestion from '../.storybook/demoComponents/CheckboxQuestion.vue'
import ChoiceQuestion from '../.storybook/demoComponents/ChoiceQuestion.vue'
import DefaultStep from '../.storybook/demoComponents/DefaultStep.vue'
import SelectQuestion from '../.storybook/demoComponents/SelectQuestion.vue'
import TextQuestion from '../.storybook/demoComponents/TextQuestion.vue'
import type { QuestionChangeEffects } from './change-effects'
import type { QuestionComponents, StepComponents } from './components/component-types'
import { FormRuntimeError, FormSchemaError, FormStepChangeError, QuestionChangeError, type FormError, type FormValidationError } from './errors'
import { sameJson } from './json'
import { decodeForm, FormlType, type FormAnswers, type FormQuestion, type JsonValue } from './schema'
import { createFormState, FormlActionType, reduceForm, type FormAction, type FormState } from './state'
import type { FormStepChangeEffect } from './step-change-effects'
import type { FormSubmission, SubmissionResult } from './submission'
import { validationError, type QuestionValidators } from './validation'
import { questionVisibility } from './visibility'

export interface UseFormOptions<Request = FormAnswers, Response = never> {
  readonly schema: unknown
  readonly state?: FormState
  readonly stepComponents?: StepComponents
  readonly questionComponents?: QuestionComponents
  readonly questionValidators?: QuestionValidators
  readonly beforeStepChange?: FormStepChangeEffect
  readonly changeEffects?: QuestionChangeEffects
  readonly submission?: FormSubmission<Request, Response, FormValidationError>
}

export type UseFormSubmitResult<Request = FormAnswers, Response = never> =
  SubmissionResult<Request, Response> | { readonly request: FormAnswers; readonly sent: false }

export interface UseFormCallbacks<Request = FormAnswers, Response = never> {
  readonly onUpdateState?: (state: FormState) => void
  readonly onAction?: (action: FormAction, nextState: FormState) => void
  readonly onSubmit?: (result: UseFormSubmitResult<Request, Response>) => void
  readonly onError?: (error: FormError) => void
}

const builtIns: Readonly<Record<string, Component>> = {
  [FormlType.Text]: TextQuestion,
  [FormlType.Email]: TextQuestion,
  [FormlType.Textarea]: TextQuestion,
  [FormlType.Select]: SelectQuestion,
  [FormlType.Autocomplete]: AutocompleteQuestion,
  [FormlType.Multiselect]: ChoiceQuestion,
  [FormlType.Radio]: ChoiceQuestion,
  [FormlType.Checkbox]: CheckboxQuestion,
}

function registered<Value>(registry: Readonly<Record<string, Value>> | undefined, name: string) {
  return registry && Object.hasOwn(registry, name) ? registry[name] : undefined
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

/** Call in Vue setup with reactive options. State transitions stay in reduceForm; effects run here. */
export function useForm<Request = FormAnswers, Response = never>(
  options: UseFormOptions<Request, Response>,
  callbacks: UseFormCallbacks<Request, Response> = {},
) {
  function questionComponent(type: string) {
    return registered(options.questionComponents, type) ?? registered(builtIns, type)
  }

  const definition = computed(() => Effect.runSyncExit(decodeForm(options.schema)))
  const form = computed(() => (Exit.isSuccess(definition.value) ? definition.value.value : undefined))
  const steps = computed(() => form.value?.steps ?? [])
  const configurationError = computed(() => {
    if (Exit.isFailure(definition.value)) {
      const cause = definition.value.cause
      const failure = cause.reasons.find(Cause.isFailReason)
      return failure?.error ?? new FormSchemaError({ cause, message: 'Could not read the form definition.' })
    }

    for (const step of steps.value) {
      if (step.component && !registered(options.stepComponents, step.component)) {
        return new FormSchemaError({ message: `Register the step component "${step.component}".` })
      }
      for (const question of step.questions) {
        if (!questionComponent(question.type)) {
          return new FormSchemaError({
            message: `Register a question component for "${question.type}".`,
          })
        }
        const effectName = question.effectOnChange
        if (effectName && typeof registered(options.changeEffects, effectName) !== 'function') {
          return new FormSchemaError({
            message: `Register the change effect "${effectName}" for question "${question.id}".`,
          })
        }
      }
    }
  })

  watch(
    configurationError,
    (error) => {
      if (error) callbacks.onError?.(error)
    },
    { immediate: true },
  )

  let disposed = false
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
  watch(
    form,
    (decoded) => {
      revision++
      cancelStepChange()
      activeSubmit?.abort()
      activeSubmit = undefined
      submitting.value = false
      cancelChanges()
      localState.value = decoded ? createFormState(decoded) : undefined
    },
    { immediate: true },
  )

  const state = computed(() => options.state ?? localState.value)
  watch(() => options.state, cancelStepChange, { flush: 'sync' })
  const visibility = computed(() => questionVisibility(steps.value, state.value?.answers ?? {}))
  watch(visibility, (visible) => {
    for (const [id, { controller }] of activeChanges) {
      if (visible.get(id) !== false) continue
      activeChanges.delete(id)
      controller.abort()
    }
  })

  const stepIndex = computed(() =>
    Math.max(
      0,
      steps.value.findIndex((step) => step.id === state.value?.stepId),
    ),
  )
  const currentStep = computed(() => {
    const step = steps.value[stepIndex.value]
    if (!step) return undefined
    const visible = visibility.value
    const questions = step.questions.filter((question) => visible.get(question.id))
    return questions.length === step.questions.length ? step : { ...step, questions }
  })
  const isLastStep = computed(() => stepIndex.value === steps.value.length - 1)
  const stepComponent = computed(() => (currentStep.value?.component ? registered(options.stepComponents, currentStep.value.component) : DefaultStep))

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

  function answerValue(id: string) {
    const answers = state.value?.answers
    return answers && Object.hasOwn(answers, id) ? answers[id] : undefined
  }

  function dispatch(action: FormAction) {
    const current = state.value
    if (disposed || !form.value || !current || configurationError.value || pending.value) return

    const next = reduceForm(form.value, current, action, options.questionValidators)
    const beforeStepChange = options.beforeStepChange
    if (!beforeStepChange || (action.type !== FormlActionType.Next && action.type !== FormlActionType.Back) || next.stepId === current.stepId)
      return commit(action, current, next)

    // Give the pipeline detached inputs; only commit can update the form state.
    const actionSnapshot = { ...action }
    const stateSnapshot = {
      ...current,
      answers: snapshotAnswers(current.answers),
      errors: { ...current.errors },
    }
    return runBeforeStepChange(
      action,
      current,
      next,
      Effect.suspend(() => beforeStepChange(actionSnapshot, stateSnapshot)),
    )
  }

  function commit(action: FormAction, current: FormState, next: FormState) {
    submissionError.value = ''
    if (!options.state) localState.value = next
    callbacks.onUpdateState?.(next)
    callbacks.onAction?.(action, next)
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
        callbacks.onError?.(error)
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
    callbacks.onError?.(error)
  }

  async function changeAnswer(question: FormQuestion, value: JsonValue) {
    if (!currentStep.value?.questions.includes(question)) return

    const { id, effectOnChange } = question
    const active = activeChanges.get(id)
    const previousValue = active ? active.value : answerValue(id)
    const startedAt = revision
    const dispatched = dispatch({ type: FormlActionType.Answer, questionId: id, value })
    const next = dispatched instanceof Promise ? await dispatched : dispatched
    if (!next || revision !== startedAt || !effectOnChange || sameJson(previousValue, value)) return

    const run = registered(options.changeEffects, effectOnChange)
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

    const result = await Effect.runPromiseExit(
      Effect.suspend(() => run(context)),
      { signal: controller.signal },
    )
    if (activeChanges.get(id)?.controller !== controller) return
    activeChanges.delete(id)
    if (controller.signal.aborted || Exit.isSuccess(result) || visibility.value.get(id) === false) return

    const failure = result.cause.reasons.find(Cause.isFailReason)
    callbacks.onError?.(
      new QuestionChangeError({
        questionId: id,
        effectName: effectOnChange,
        cause: failure ? failure.error : Cause.squash(result.cause),
        message: `The change effect for "${question.label}" failed.`,
      }),
    )
  }

  async function navigate(action: FormlActionType.Next | FormlActionType.Submit) {
    if (disposed || !currentStep.value || configurationError.value || pending.value) return
    const shouldSubmit = action === FormlActionType.Submit
    const startedAt = revision
    const dispatched = dispatch({
      type: action,
    })
    const next = dispatched instanceof Promise ? await dispatched : dispatched
    if (!next || revision !== startedAt) return

    const error = validationError(next.errors)
    if (error) {
      callbacks.onError?.(error)
      void nextTick(() =>
        formElement.value
          ?.querySelector<HTMLElement>(
            'input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"], button[aria-invalid="true"]',
          )
          ?.focus(),
      )
      return
    }
    if (!shouldSubmit) return

    const answerSnapshot = snapshotAnswers(next.answers, questionVisibility(steps.value, next.answers))
    if (!options.submission) {
      callbacks.onSubmit?.({ request: answerSnapshot, sent: false })
      return
    }

    const controller = new AbortController()
    const submission = options.submission
    activeSubmit = controller
    submitting.value = true
    try {
      const result = await Effect.runPromiseExit(
        Effect.suspend(() => submission(answerSnapshot)),
        { signal: controller.signal },
      )
      if (controller.signal.aborted) return
      if (Exit.isSuccess(result)) callbacks.onSubmit?.(result.value)
      else reportCause(result.cause)
    } finally {
      if (activeSubmit === controller) {
        activeSubmit = undefined
        submitting.value = false
      }
    }
  }

  onScopeDispose(() => {
    disposed = true
    revision++
    cancelStepChange()
    activeSubmit?.abort()
    cancelChanges()
  })

  function answer(id: string, value: JsonValue) {
    const question = currentStep.value?.questions.find((question) => question.id === id)
    if (question) return changeAnswer(question, value)
  }

  function next() {
    return navigate(FormlActionType.Next)
  }

  function back() {
    return dispatch({ type: FormlActionType.Back })
  }

  function submit() {
    return navigate(FormlActionType.Submit)
  }

  function advance() {
    return isLastStep.value ? submit() : next()
  }

  return {
    schema: form,
    state,
    steps,
    currentStep,
    stepIndex,
    isLastStep,
    pending,
    stepPending: readonly(stepPending),
    submitting: readonly(submitting),
    configurationError,
    fieldValidation,
    submissionError: readonly(submissionError),
    formElement,
    stepComponent,
    questionComponent,
    inputId,
    fieldError,
    answerValue,
    answer,
    next,
    back,
    submit,
    advance,
  }
}
