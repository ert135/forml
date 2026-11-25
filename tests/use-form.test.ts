// @vitest-environment jsdom
import { Effect } from 'effect'
import { createFormState, createSubmission, FormlActionType, FormValidationError } from 'forml'
import { useForm } from 'forml/form'
import type { FormConfig, FormStepChangeEffect } from 'forml/types'
import { afterEach, expect, expectTypeOf, test, vi } from 'vitest'
import { createApp, nextTick, shallowReactive } from 'vue'

import { form } from './fixtures'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const unmount of cleanup.splice(0)) unmount()
})

function mountComposable<Value>(setup: () => Value) {
  const root = document.createElement('div')
  document.body.append(root)
  let value!: Value
  const app = createApp({
    setup() {
      value = setup()
      return () => null
    },
  })
  app.mount(root)
  let mounted = true
  const unmount = () => {
    if (!mounted) return
    mounted = false
    app.unmount()
    root.remove()
  }
  cleanup.push(unmount)
  return { value, unmount }
}

test('owns independent instances and produces new states without mutating frozen snapshots', async () => {
  const onAction = vi.fn()
  const {
    value: [first, second],
  } = mountComposable(() => [useForm({ schema: form }, { onAction }), useForm({ schema: form })])
  const initial = first.state.value!
  Object.freeze(initial.answers.topics)
  Object.freeze(initial.answers)
  Object.freeze(initial.errors)
  Object.freeze(initial)

  expect(first.inputId(0)).not.toBe(second.inputId(0))
  await first.answer('name', 'Ada')
  expect(first.state.value).not.toBe(initial)
  expect(first.answerValue('name')).toBe('Ada')
  expect(initial.answers.name).toBeUndefined()
  expect(second.answerValue('name')).toBeUndefined()
  await first.next()
  expect(first.currentStep.value?.id).toBe('contact')
  expect(second.currentStep.value?.id).toBe('preferences')
  await first.back()
  expect(first.currentStep.value?.id).toBe('preferences')
  expect(first.answerValue('name')).toBe('Ada')
  expect(initial.errors).toEqual({})
  expect(initial.stepId).toBe('preferences')
  expect(onAction.mock.calls.map(([action]) => action.type)).toEqual([FormlActionType.Answer, FormlActionType.Next, FormlActionType.Back])

  // Inputs can update only visible questions on the current step.
  await first.answer('email', 'outside-current-step@example.com')
  await first.answer('missing', 'ignored')
  expect(first.answerValue('email')).toBeUndefined()
  expect(onAction).toHaveBeenCalledTimes(3)
})

test('keeps explicit next separate from submit, with advance choosing the final-step action', async () => {
  const schema = { steps: [form.steps[0]] } as const
  const beforeStepChange = vi.fn(() => Effect.void)
  const onSubmit = vi.fn()
  const { value: controller } = mountComposable(() => useForm({ schema, beforeStepChange }, { onSubmit }))

  await controller.answer('name', 'Ada')
  await controller.next()
  expect(onSubmit).not.toHaveBeenCalled()
  expect(beforeStepChange).not.toHaveBeenCalled()
  await controller.submit()
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ request: controller.state.value?.answers, sent: false })
  await controller.advance()
  expect(onSubmit).toHaveBeenCalledTimes(2)
})

test('validates all steps on explicit submission and preserves the typed request and response', async () => {
  const onError = vi.fn()
  const onSubmit = vi.fn()
  const beforeStepChange = vi.fn(() => Effect.void)
  const send = vi.fn(() => Effect.succeed({ saved: true }))
  const submission = createSubmission({ transform: (answers) => ({ email: String(answers.email) }), send })
  const { value: controller } = mountComposable(() =>
    useForm(
      { schema: form, beforeStepChange, submission },
      {
        onError,
        onSubmit: (result) => {
          if (result.sent) {
            expectTypeOf(result.request).toEqualTypeOf<{ email: string }>()
            expectTypeOf(result.response).toEqualTypeOf<{ saved: boolean }>()
          }
          onSubmit(result)
        },
      },
    ),
  )

  await controller.next()
  expect(controller.fieldError('name')).toBe('Name is required.')
  expect(onError).toHaveBeenCalledWith(expect.any(FormValidationError))
  expect(beforeStepChange).not.toHaveBeenCalled()
  await controller.answer('name', 'Ada')
  await controller.submit()
  expect(controller.currentStep.value?.id).toBe('contact')
  expect(controller.fieldError('email')).toBe('Email is required.')
  expect(send).not.toHaveBeenCalled()
  expect(beforeStepChange).not.toHaveBeenCalled()
  await controller.answer('email', 'ada@example.com')
  await controller.submit()
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ request: { email: 'ada@example.com' }, response: { saved: true }, sent: true })
})

test('supports controlled state and isolates navigation effects from the current answers', async () => {
  const options = shallowReactive({ schema: form, state: createFormState(form, { name: 'Ada', topics: ['work'] }) })
  const previous = options.state
  Object.freeze(previous.answers.topics)
  Object.freeze(previous.answers)
  Object.freeze(previous.errors)
  Object.freeze(previous)
  const beforeStepChange: FormStepChangeEffect = (_action, state) =>
    Effect.sync(() => {
      Object.assign(state.answers, { name: 'Changed' })
      const topics = state.answers.topics as string[]
      topics.push('hobbies')
      Object.assign(state.errors, { name: 'Changed' })
    })
  const { value: controller } = mountComposable(() =>
    useForm(
      {
        get schema() {
          return options.schema
        },
        get state() {
          return options.state
        },
        beforeStepChange,
      },
      {
        onUpdateState: (state) => {
          options.state = state
        },
      },
    ),
  )

  await controller.next()
  expect(controller.state.value).toBe(options.state)
  expect(options.state.stepId).toBe('contact')
  expect(options.state.answers).toMatchObject({ name: 'Ada', topics: ['work'] })
  expect(options.state.errors).toEqual({})
  expect(previous.stepId).toBe('preferences')
  expect(previous.errors).toEqual({})
})

test.each(['next', 'submit', 'answer'] as const)('cancels pending %s work on disposal and ignores subsequent actions', async (action) => {
  const schema = {
    steps: [
      { id: 'first', title: 'First', questions: [{ id: 'name', type: 'text', label: 'Name', defaultValue: 'Ada', effectOnChange: 'lookup' }] },
      { id: 'last', title: 'Last', questions: [] },
    ],
  } as const
  const started = vi.fn()
  const aborted = vi.fn()
  const pending = () =>
    Effect.sync(started).pipe(
      Effect.andThen(Effect.never),
      Effect.onInterrupt(() => Effect.sync(aborted)),
    )
  const onAction = vi.fn()
  const onSubmit = vi.fn()
  const onError = vi.fn()
  const { value: controller, unmount } = mountComposable(() =>
    useForm(
      {
        schema,
        beforeStepChange: pending,
        changeEffects: { lookup: pending },
        submission: createSubmission({ transform: (answers) => answers, send: pending }),
      },
      { onAction, onSubmit, onError },
    ),
  )

  const operation = action === 'answer' ? controller.answer('name', 'Grace') : controller[action]()
  await vi.waitFor(() => expect(started).toHaveBeenCalledOnce())
  const lastState = controller.state.value
  const lastActions = onAction.mock.calls.length
  unmount()
  await operation
  expect(aborted).toHaveBeenCalledOnce()
  await controller.answer('name', 'After disposal')
  await controller.next()
  await controller.back()
  await controller.submit()
  expect(controller.state.value).toBe(lastState)
  expect(onAction).toHaveBeenCalledTimes(lastActions)
  expect(onError).not.toHaveBeenCalled()
  expect(onSubmit).not.toHaveBeenCalled()
  expect(controller.pending.value).toBe(false)
})

test('observes a reactive schema replacement and cancels obsolete effects', async () => {
  const initialSchema = {
    steps: [{ id: 'first', title: 'First', questions: [{ id: 'name', type: 'text', label: 'Name', defaultValue: 'Ada', effectOnChange: 'lookup' }] }],
  } as const
  const options = shallowReactive<{ schema: FormConfig<'text'> }>({ schema: initialSchema })
  const aborted = vi.fn()
  const started = vi.fn()
  const { value: controller } = mountComposable(() =>
    useForm({
      get schema() {
        return options.schema
      },
      changeEffects: {
        lookup: () =>
          Effect.sync(started).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Effect.sync(aborted)),
          ),
      },
    }),
  )
  const operation = controller.answer('name', 'Grace')
  await vi.waitFor(() => expect(started).toHaveBeenCalledOnce())
  options.schema = { steps: [{ ...initialSchema.steps[0], title: 'Replacement' }] }
  await nextTick()
  await operation
  expect(aborted).toHaveBeenCalledOnce()
  expect(controller.currentStep.value?.title).toBe('Replacement')
  expect(controller.answerValue('name')).toBe('Ada')
})
