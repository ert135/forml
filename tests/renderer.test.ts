// @vitest-environment jsdom
import { Effect } from 'effect'
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, ref, shallowRef, type VNode } from 'vue'

import {
  createFormState,
  createSubmission,
  Forml,
  FormlActionType,
  FormlProgress,
  FormlType,
  FormSchemaError,
  FormStepChangeError,
  FormValidationError,
  QuestionChangeError,
  reduceForm,
  type FormAction,
  type FormConfig,
  type FormState,
  type FormStepChangeEffect,
  type QuestionChangeContext,
  type QuestionChangeEffects,
} from '../src'
import { form } from './fixtures'

const cleanup: (() => void)[] = []

afterEach(() => {
  for (const unmount of cleanup.splice(0)) unmount()
})

function mountForm(render: () => VNode | null) {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({ render })
  app.mount(root)
  cleanup.push(() => {
    app.unmount()
    root.remove()
  })
  return root
}

function input(root: HTMLElement, id: string) {
  const field = root.querySelector<HTMLInputElement>(`input[name="${id}"]`)
  if (!field) throw new Error(`Input "${id}" is missing`)
  return field
}

async function enter(root: HTMLElement, id: string, value: string) {
  const field = input(root, id)
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}

async function submit(root: HTMLElement) {
  const element = root.querySelector('form')
  if (!element) throw new Error('The form is missing')
  element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await nextTick()
}

const lookupForm = {
  steps: [
    {
      id: 'address',
      title: 'Address',
      questions: [
        { id: 'usePostcode', type: FormlType.Checkbox, label: 'Use postcode', defaultValue: true },
        {
          id: 'postcode',
          type: FormlType.Text,
          label: 'Postcode',
          defaultValue: 'AB1 2CD',
          showWhen: { usePostcode: [true] },
          effectOnChange: 'lookup',
        },
      ],
    },
  ],
} as const satisfies FormConfig

test('renders and validates a local form through progress, navigation and submission', async () => {
  const onAction = vi.fn()
  const onError = vi.fn()
  const onSubmit = vi.fn()
  const root = mountForm(() => h(Forml, { schema: form, progressComponent: FormlProgress, onAction, onError, onSubmit }))

  expect(root.querySelector('[aria-current="step"]')?.textContent).toContain('Preferences')
  await submit(root)
  expect(onError).toHaveBeenCalledWith(expect.any(FormValidationError))
  expect(input(root, 'name').getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(input(root, 'name'))
  expect(onSubmit).not.toHaveBeenCalled()

  await enter(root, 'name', 'Ada')
  expect(onAction).toHaveBeenLastCalledWith(
    { type: FormlActionType.Answer, questionId: 'name', value: 'Ada' },
    expect.objectContaining({ answers: expect.objectContaining({ name: 'Ada' }) }),
  )
  expect(input(root, 'name').hasAttribute('aria-invalid')).toBe(false)
  await submit(root)
  expect(root.querySelector('[aria-current="step"]')?.textContent).toContain('Contact')
  expect(root.querySelector('input[name="company"]')).toBeNull()

  root.querySelector<HTMLButtonElement>('button[type="button"]')!.click()
  await nextTick()
  expect(input(root, 'name').value).toBe('Ada')
  await submit(root)
  await enter(root, 'email', 'ada@example.com')
  await submit(root)
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
    sent: false,
    request: {
      name: 'Ada',
      newsletter: false,
      topics: [],
      email: 'ada@example.com',
      channel: false,
    },
  })
})

test('commits a controlled snapshot before running its change Effect and emits typed failures', async () => {
  const state = shallowRef(createFormState(lookupForm))
  const cause = new Error('Lookup unavailable')
  const onError = vi.fn()
  const lookup = vi.fn((context: QuestionChangeContext) => {
    expect(state.value.answers).toEqual(context.answers)
    return Effect.fail(cause)
  })
  const root = mountForm(() =>
    h(Forml, {
      schema: lookupForm,
      state: state.value,
      changeEffects: { lookup },
      onAction: (_action: FormAction, updated: FormState) => {
        state.value = updated
      },
      onError,
    }),
  )

  await enter(root, 'postcode', 'AB1 2CD')
  expect(lookup).not.toHaveBeenCalled()
  await enter(root, 'postcode', 'SW1A 1AA')
  await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(QuestionChangeError)))
  expect(lookup).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      question: expect.objectContaining({ id: 'postcode' }),
      previousValue: 'AB1 2CD',
      value: 'SW1A 1AA',
      answers: { usePostcode: true, postcode: 'SW1A 1AA' },
    }),
  )
  expect(onError).toHaveBeenCalledWith(expect.objectContaining({ cause, questionId: 'postcode', effectName: 'lookup' }))
  expect(input(root, 'postcode').value).toBe('SW1A 1AA')
})

test('interrupts an old lookup when typing again, hiding its field externally, or unmounting', async () => {
  const state = shallowRef(createFormState(lookupForm))
  const mounted = ref(true)
  const onError = vi.fn()
  const aborted = vi.fn<(value: unknown) => void>()
  const changeEffects = {
    lookup: ({ value }) => Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => aborted(value)))),
  } satisfies QuestionChangeEffects
  const root = mountForm(() =>
    mounted.value
      ? h(Forml, {
          schema: lookupForm,
          state: state.value,
          changeEffects,
          onAction: (_action: FormAction, updated: FormState) => {
            state.value = updated
          },
          onError,
        })
      : null,
  )

  await enter(root, 'postcode', 'first')
  await enter(root, 'postcode', 'second')
  await vi.waitFor(() => expect(aborted.mock.calls).toEqual([['first']]))

  state.value = reduceForm(lookupForm, state.value, {
    type: FormlActionType.Answer,
    questionId: 'usePostcode',
    value: false,
  })
  await nextTick()
  expect(root.querySelector('input[name="postcode"]')).toBeNull()
  await vi.waitFor(() => expect(aborted.mock.calls).toEqual([['first'], ['second']]))

  state.value = reduceForm(lookupForm, state.value, {
    type: FormlActionType.Answer,
    questionId: 'usePostcode',
    value: true,
  })
  await nextTick()
  expect(input(root, 'postcode').value).toBe('second')
  await enter(root, 'postcode', 'third')
  mounted.value = false
  await vi.waitFor(() => expect(aborted.mock.calls).toEqual([['first'], ['second'], ['third']]))
  expect(onError).not.toHaveBeenCalled()
})

test('reports missing registrations and resets local state when replacing the schema', async () => {
  const schema = shallowRef<FormConfig>(lookupForm)
  const onError = vi.fn()
  const registry = shallowRef<QuestionChangeEffects>({})
  const aborted = vi.fn()
  const root = mountForm(() => h(Forml, { schema: schema.value, changeEffects: registry.value, onError }))

  expect(root.querySelector('[role="alert"]')?.textContent).toContain('Register the change effect "lookup"')
  expect(onError).toHaveBeenCalledWith(expect.any(FormSchemaError))

  registry.value = {
    lookup: () => Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(aborted))),
  }
  await nextTick()
  await enter(root, 'postcode', 'stale')
  schema.value = { steps: [{ ...lookupForm.steps[0], title: 'New address' }] }
  await nextTick()

  await vi.waitFor(() => expect(aborted).toHaveBeenCalledTimes(1))
  expect(root.querySelector('h2')?.textContent).toBe('New address')
  expect(input(root, 'postcode').value).toBe('AB1 2CD')
  expect(onError).toHaveBeenCalledTimes(1)
})

test('locks a pending submission and emits the request and response when it completes', async () => {
  const onSubmit = vi.fn()
  const onError = vi.fn()
  let complete: (() => void) | undefined
  const send = vi.fn(() =>
    Effect.callback<{ status: number }>((resume) => {
      complete = () => resume(Effect.succeed({ status: 201 }))
    }),
  )
  const submission = createSubmission({
    transform: (answers) => ({ fullName: answers.name }),
    send,
  })
  const root = mountForm(() => h(Forml, { schema: { steps: [form.steps[0]] }, submission, onSubmit, onError }))

  await enter(root, 'name', 'Ada')
  await submit(root)
  expect(root.querySelector('form')?.getAttribute('aria-busy')).toBe('true')
  expect(root.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
  await submit(root)
  expect(send).toHaveBeenCalledExactlyOnceWith({ fullName: 'Ada' })
  expect(onSubmit).not.toHaveBeenCalled()

  complete?.()
  await vi.waitFor(() =>
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      request: { fullName: 'Ada' },
      sent: true,
      response: { status: 201 },
    }),
  )
  expect(root.querySelector('form')?.getAttribute('aria-busy')).toBe('false')
  expect(onError).not.toHaveBeenCalled()
})

test('filters a pipeline by action type and updates the state model only after it succeeds', async () => {
  const state = shallowRef(createFormState(form))
  const order: string[] = []
  let complete: (() => void) | undefined
  const beforeStepChange = vi.fn<FormStepChangeEffect>((action, current) =>
    Effect.sync(() => {
      expect(current).toEqual(state.value)
      expect(current).not.toBe(state.value)
      order.push('before')
    }).pipe(
      Effect.tap(() =>
        Effect.callback<void>((resume) => {
          complete = () => resume(Effect.void)
        }),
      ),
      Effect.tap(() =>
        Effect.sync(() => {
          order.push('ready')
        }),
      ),
      Effect.when(Effect.succeed(action.type === FormlActionType.Next)),
    ),
  )
  const onAction = vi.fn(() => {
    order.push('action')
  })
  const root = mountForm(() =>
    h(Forml, {
      schema: form,
      state: state.value,
      beforeStepChange,
      'onUpdate:state': (next: FormState) => {
        order.push('commit')
        state.value = next
      },
      onAction,
    }),
  )

  await enter(root, 'name', 'Ada')
  await vi.waitFor(() => expect(state.value.answers.name).toBe('Ada'))
  expect(order).toEqual(['commit', 'action'])
  order.length = 0
  onAction.mockClear()

  await submit(root)
  await submit(root)
  expect(order).toEqual(['before'])
  expect(state.value.stepId).toBe('preferences')
  expect(onAction).not.toHaveBeenCalled()
  expect(root.querySelector('fieldset')?.disabled).toBe(true)
  expect(root.querySelector('button[type="submit"]')?.textContent).toBe('Working…')

  complete?.()
  await vi.waitFor(() => expect(state.value.stepId).toBe('contact'))
  expect(order).toEqual(['before', 'ready', 'commit', 'action'])
  expect(beforeStepChange.mock.calls.map(([action]) => action.type)).toEqual([FormlActionType.Next])
  expect(root.querySelector('fieldset')?.disabled).toBe(false)

  root.querySelector<HTMLButtonElement>('button[type="button"]')!.click()
  await vi.waitFor(() => expect(state.value.stepId).toBe('preferences'))
  expect(onAction).toHaveBeenLastCalledWith({ type: FormlActionType.Back }, expect.objectContaining({ stepId: 'preferences' }))
  expect(order.slice(-2)).toEqual(['commit', 'action'])
  expect(beforeStepChange.mock.calls.map(([action]) => action.type)).toEqual([FormlActionType.Next, FormlActionType.Back])
})

test('runs the pipeline for Next and Back while answers commit directly', async () => {
  const state = shallowRef(createFormState(form))
  const order: string[] = []
  const beforeStepChange = vi.fn<FormStepChangeEffect>((action, current) =>
    Effect.sync(() => {
      expect(current).toEqual(state.value)
      order.push(`before:${action.type}`)
    }),
  )
  const root = mountForm(() =>
    h(Forml, {
      schema: form,
      state: state.value,
      beforeStepChange,
      'onUpdate:state': (next: FormState) => {
        state.value = next
      },
      onAction: (action: FormAction, next: FormState) => {
        expect(state.value).toEqual(next)
        order.push(`commit:${action.type}`)
      },
    }),
  )

  await enter(root, 'name', 'Ada')
  await vi.waitFor(() => expect(state.value.answers.name).toBe('Ada'))
  await submit(root)
  await vi.waitFor(() => expect(state.value.stepId).toBe('contact'))
  root.querySelector<HTMLButtonElement>('button[type="button"]')!.click()
  await vi.waitFor(() => expect(state.value.stepId).toBe('preferences'))

  expect(order).toEqual(['commit:answer', 'before:next', 'commit:next', 'before:back', 'commit:back'])
})

test.each([true, false])('bypasses beforeStepChange for submission (configured pipeline: %s)', async (configured) => {
  const schema = { steps: [form.steps[0]] } as const
  const state = shallowRef(createFormState(schema))
  const order: string[] = []
  const onError = vi.fn()
  const onSubmit = vi.fn()
  const beforeStepChange = vi.fn<FormStepChangeEffect>(() => Effect.fail('This hook must not run for Submit'))
  const send = vi.fn(() =>
    Effect.sync(() => {
      order.push('send')
      return 'saved'
    }),
  )
  const submission = createSubmission({
    transform: (answers) => ({ name: answers.name }),
    send,
  })
  const root = mountForm(() =>
    h(Forml, {
      schema,
      state: state.value,
      beforeStepChange,
      submission: configured ? submission : undefined,
      onSubmit,
      onError,
      'onUpdate:state': (next: FormState) => {
        state.value = next
      },
      onAction: () => {
        order.push('commit')
      },
    }),
  )

  await submit(root)
  expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(FormValidationError))
  expect(state.value.errors.name).toBeDefined()
  expect(beforeStepChange).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
  expect(onSubmit).not.toHaveBeenCalled()

  state.value = createFormState(schema, { name: 'Ada' })
  await nextTick()
  order.length = 0
  await submit(root)
  await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
    configured ? { request: { name: 'Ada' }, response: 'saved', sent: true } : { request: state.value.answers, sent: false },
  )
  expect(beforeStepChange).not.toHaveBeenCalled()
  expect(send).toHaveBeenCalledTimes(configured ? 1 : 0)
  expect(state.value.errors).toEqual({})
  expect(order).toEqual(configured ? ['commit', 'send'] : ['commit'])
})

test.each(['failure', 'throw', 'defect'] as const)('leaves state unchanged after a pipeline %s and allows a retry', async (mode) => {
  const cause = new Error('Unavailable')
  const onError = vi.fn()
  const onAction = vi.fn()
  const onUpdate = vi.fn()
  const onSubmit = vi.fn()
  let fail = true
  const beforeStepChange: FormStepChangeEffect = (action) => {
    if (!fail || action.type !== FormlActionType.Next) return Effect.void
    if (mode === 'throw') throw cause
    return mode === 'failure'
      ? Effect.fail(cause)
      : Effect.sync(() => {
          throw cause
        })
  }
  const root = mountForm(() =>
    h(Forml, {
      schema: form,
      beforeStepChange,
      onError,
      onAction,
      onSubmit,
      'onUpdate:state': onUpdate,
    }),
  )

  await enter(root, 'name', 'Ada')
  await vi.waitFor(() => expect(onAction).toHaveBeenCalledTimes(1))
  onAction.mockClear()
  onUpdate.mockClear()
  await submit(root)
  await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(FormStepChangeError)))
  expect(onError).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      action: { type: FormlActionType.Next },
      cause,
    }),
  )
  expect(onAction).not.toHaveBeenCalled()
  expect(onUpdate).not.toHaveBeenCalled()
  expect(onSubmit).not.toHaveBeenCalled()
  expect(input(root, 'name').value).toBe('Ada')
  expect(root.querySelector('form')?.getAttribute('aria-busy')).toBe('false')
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('Could not change steps')

  fail = false
  await submit(root)
  await vi.waitFor(() =>
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ type: FormlActionType.Next }, expect.objectContaining({ stepId: 'contact' })),
  )
  expect(onSubmit).not.toHaveBeenCalled()
  expect(root.querySelector('[role="alert"]')).toBeNull()
})

test.each(['schema', 'state', 'unmount'] as const)('interrupts pending action work on %s replacement', async (replacement) => {
  const schema = shallowRef<FormConfig>(form)
  const state = shallowRef(createFormState(form, { name: 'Ada' }))
  const mounted = ref(true)
  const aborted = vi.fn()
  const onAction = vi.fn()
  const onError = vi.fn()
  let wait = true
  const beforeStepChange: FormStepChangeEffect = () => (wait ? Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(aborted))) : Effect.void)
  const root = mountForm(() =>
    mounted.value
      ? h(Forml, {
          schema: schema.value,
          state: state.value,
          beforeStepChange,
          onAction,
          onError,
          'onUpdate:state': (next: FormState) => {
            state.value = next
          },
        })
      : null,
  )

  await submit(root)
  expect(root.querySelector('form')?.getAttribute('aria-busy')).toBe('true')
  if (replacement === 'schema') schema.value = { steps: [{ ...form.steps[0], title: 'New preferences' }, form.steps[1]] }
  else if (replacement === 'state') state.value = createFormState(form, { name: 'Grace' })
  else mounted.value = false
  await vi.waitFor(() => expect(aborted).toHaveBeenCalledTimes(1))
  expect(state.value.stepId).toBe('preferences')
  expect(onAction).not.toHaveBeenCalled()
  expect(onError).not.toHaveBeenCalled()

  wait = false
  mounted.value = true
  await nextTick()
  await submit(root)
  await vi.waitFor(() => expect(state.value.stepId).toBe('contact'))
})

test('isolates the current state from mutations to pipeline inputs', async () => {
  const state = shallowRef(createFormState(form, { name: 'Ada', topics: ['work'] }))
  const beforeStepChange: FormStepChangeEffect = (_action, current) =>
    Effect.sync(() => {
      Object.assign(current.answers, { name: 'Changed' })
      const topics = current.answers.topics as string[]
      topics.push('hobbies')
      Object.assign(current.errors, { name: 'Changed' })
    })
  const root = mountForm(() =>
    h(Forml, {
      schema: form,
      state: state.value,
      beforeStepChange,
      'onUpdate:state': (next: FormState) => {
        state.value = next
      },
    }),
  )

  await submit(root)
  await vi.waitFor(() => expect(state.value.stepId).toBe('contact'))
  expect(state.value.answers).toMatchObject({ name: 'Ada', topics: ['work'] })
  expect(state.value.errors).toEqual({})
})

test('commits answers and runs change effects without invoking the navigation pipeline', async () => {
  const state = shallowRef(createFormState(lookupForm))
  const order: string[] = []
  const lookup = vi.fn((context: QuestionChangeContext) =>
    Effect.sync(() => {
      order.push('lookup')
      expect(state.value.answers).toEqual(context.answers)
    }),
  )
  const beforeStepChange = vi.fn<FormStepChangeEffect>(() => Effect.fail('Navigation only'))
  const root = mountForm(() =>
    h(Forml, {
      schema: lookupForm,
      state: state.value,
      beforeStepChange,
      changeEffects: { lookup },
      'onUpdate:state': (next: FormState) => {
        order.push('commit')
        state.value = next
      },
    }),
  )

  await enter(root, 'postcode', 'SW1A 1AA')
  await vi.waitFor(() => expect(order).toEqual(['commit', 'lookup']))
  expect(beforeStepChange).not.toHaveBeenCalled()
  expect(state.value.answers.postcode).toBe('SW1A 1AA')
})

test('validates Continue before running the navigation pipeline', async () => {
  const onError = vi.fn()
  const onAction = vi.fn()
  const beforeStepChange = vi.fn<FormStepChangeEffect>(() => Effect.void)
  const root = mountForm(() =>
    h(Forml, {
      schema: form,
      beforeStepChange,
      onError,
      onAction,
    }),
  )

  await submit(root)
  expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(FormValidationError))
  expect(beforeStepChange).not.toHaveBeenCalled()
  expect(input(root, 'name').getAttribute('aria-invalid')).toBe('true')
  expect(onAction).toHaveBeenLastCalledWith({ type: FormlActionType.Next }, expect.objectContaining({ stepId: 'preferences' }))

  await enter(root, 'name', 'Ada')
  expect(beforeStepChange).not.toHaveBeenCalled()
  await submit(root)
  await vi.waitFor(() => expect(onAction).toHaveBeenLastCalledWith({ type: FormlActionType.Next }, expect.objectContaining({ stepId: 'contact' })))
  expect(beforeStepChange).toHaveBeenCalledExactlyOnceWith(
    { type: FormlActionType.Next },
    expect.objectContaining({
      stepId: 'preferences',
      answers: expect.objectContaining({ name: 'Ada' }),
    }),
  )
})

test('bypasses the navigation pipeline when Submit returns to an invalid step', async () => {
  const state = shallowRef({
    ...createFormState(form, { email: 'ada@example.com' }),
    stepId: 'contact',
  })
  const beforeStepChange = vi.fn<FormStepChangeEffect>(() => Effect.fail('Navigation only'))
  const onError = vi.fn()
  const send = vi.fn(() => Effect.void)
  const submission = createSubmission({ transform: (answers) => answers, send })
  const root = mountForm(() =>
    h(Forml, {
      schema: form,
      state: state.value,
      beforeStepChange,
      submission,
      onError,
      'onUpdate:state': (next: FormState) => {
        state.value = next
      },
    }),
  )

  await submit(root)
  expect(state.value.stepId).toBe('preferences')
  expect(beforeStepChange).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(FormValidationError))
  expect(input(root, 'name').getAttribute('aria-invalid')).toBe('true')
})
