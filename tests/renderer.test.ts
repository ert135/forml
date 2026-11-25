// @vitest-environment jsdom
import { Effect } from 'effect'
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, ref, shallowRef } from 'vue'
import type { VNode } from 'vue'
import {
  createFormState, createSubmission, Forml, FormlActionType, FormlProgress, FormlType, FormSchemaError,
  FormValidationError, QuestionChangeError, reduceForm,
} from '../src'
import type { FormAction, FormConfig, FormState, QuestionChangeContext, QuestionChangeEffects } from '../src'
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
  steps: [{
    id: 'address',
    title: 'Address',
    questions: [
      { id: 'usePostcode', type: FormlType.Checkbox, label: 'Use postcode', defaultValue: true },
      {
        id: 'postcode', type: FormlType.Text, label: 'Postcode', defaultValue: 'AB1 2CD',
        showWhen: { usePostcode: [true] }, effectOnChange: 'lookup',
      },
    ],
  }],
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
    request: { name: 'Ada', newsletter: false, topics: [], email: 'ada@example.com', channel: false },
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
  const root = mountForm(() => h(Forml, {
    schema: lookupForm,
    state: state.value,
    changeEffects: { lookup },
    onAction: (_action: FormAction, updated: FormState) => { state.value = updated },
    onError,
  }))

  await enter(root, 'postcode', 'AB1 2CD')
  expect(lookup).not.toHaveBeenCalled()
  await enter(root, 'postcode', 'SW1A 1AA')
  await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(QuestionChangeError)))
  expect(lookup).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    question: expect.objectContaining({ id: 'postcode' }),
    previousValue: 'AB1 2CD', value: 'SW1A 1AA', answers: { usePostcode: true, postcode: 'SW1A 1AA' },
  }))
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
  const root = mountForm(() => mounted.value ? h(Forml, {
    schema: lookupForm,
    state: state.value,
    changeEffects,
    onAction: (_action: FormAction, updated: FormState) => { state.value = updated },
    onError,
  }) : null)

  await enter(root, 'postcode', 'first')
  await enter(root, 'postcode', 'second')
  await vi.waitFor(() => expect(aborted.mock.calls).toEqual([['first']]))

  state.value = reduceForm(lookupForm, state.value, {
    type: FormlActionType.Answer, questionId: 'usePostcode', value: false,
  })
  await nextTick()
  expect(root.querySelector('input[name="postcode"]')).toBeNull()
  await vi.waitFor(() => expect(aborted.mock.calls).toEqual([['first'], ['second']]))

  state.value = reduceForm(lookupForm, state.value, {
    type: FormlActionType.Answer, questionId: 'usePostcode', value: true,
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

  registry.value = { lookup: () => Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(aborted))) }
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
  const send = vi.fn(() => Effect.callback<{ status: number }>((resume) => {
    complete = () => resume(Effect.succeed({ status: 201 }))
  }))
  const submission = createSubmission({ transform: (answers) => ({ fullName: answers.name }), send })
  const root = mountForm(() => h(Forml, { schema: { steps: [form.steps[0]] }, submission, onSubmit, onError }))

  await enter(root, 'name', 'Ada')
  await submit(root)
  expect(root.querySelector('form')?.getAttribute('aria-busy')).toBe('true')
  expect(root.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
  await submit(root)
  expect(send).toHaveBeenCalledExactlyOnceWith({ fullName: 'Ada' })
  expect(onSubmit).not.toHaveBeenCalled()

  complete?.()
  await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
    request: { fullName: 'Ada' }, sent: true, response: { status: 201 },
  }))
  expect(root.querySelector('form')?.getAttribute('aria-busy')).toBe('false')
  expect(onError).not.toHaveBeenCalled()
})
