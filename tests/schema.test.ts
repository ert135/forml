import { Effect } from 'effect'
import { expect, test } from 'vitest'
import { decodeForm, FormlType, FormLoadError, FormSchemaError, loadForm } from '../src'
import { form } from './fixtures'

test('decodes a JSON definition with cross-step visibility rules and typed choices', () => {
  const json: unknown = JSON.parse(JSON.stringify(form))

  expect(Effect.runSync(decodeForm(json))).toEqual(form)
})

test.each([
  { input: { steps: [] }, message: /steps/ },
  { input: { steps: [form.steps[0], form.steps[0]] }, message: /Duplicate step ID/ },
  {
    input: { steps: [form.steps[0], { ...form.steps[1], questions: [form.steps[0].questions[0]] }] },
    message: /Duplicate question ID/,
  },
  {
    input: { steps: [{ ...form.steps[0], questions: [{ id: 'choice', type: FormlType.Radio, label: 'Choice' }] }] },
    message: /needs at least one option/,
  },
  {
    input: { steps: [{ ...form.steps[0], questions: [{ ...form.steps[0].questions[2], options: [
      { label: 'First', value: 'work' }, { label: 'Second', value: 'work' },
    ] }] }] },
    message: /has duplicate option values/,
  },
  {
    input: { steps: [{ ...form.steps[1], questions: [form.steps[1].questions[2]] }] },
    message: /unknown question "newsletter"/,
  },
  {
    input: { steps: [{ ...form.steps[0], questions: [
      { ...form.steps[0].questions[0], showWhen: { newsletter: [true] } },
      { ...form.steps[0].questions[1], showWhen: { name: ['Ada'] } },
    ] }] },
    message: /circular showWhen rule/,
  },
])('rejects invalid definitions matching $message', ({ input, message }) => {
  const error = Effect.runSync(Effect.flip(decodeForm(input)))

  expect(error).toBeInstanceOf(FormSchemaError)
  expect(error.message).toMatch(message)
})

test('loads and decodes a definition supplied by an asynchronous Effect', async () => {
  const source = Effect.promise(async () => JSON.parse(JSON.stringify(form)) as unknown)

  await expect(Effect.runPromise(loadForm(source))).resolves.toEqual(form)
})

test('distinguishes a failed source from invalid JSON data', () => {
  const cause = new Error('Configuration endpoint unavailable')
  const loadError = Effect.runSync(Effect.flip(loadForm(Effect.fail(cause))))
  const schemaError = Effect.runSync(Effect.flip(loadForm(Effect.succeed({ steps: [] }))))

  expect(loadError).toBeInstanceOf(FormLoadError)
  expect(loadError.cause).toBe(cause)
  expect(schemaError).toBeInstanceOf(FormSchemaError)
})
