import { Effect } from 'effect'
import { expect, expectTypeOf, test, vi } from 'vitest'

import { createSubmission, FormValidationError, RequestSendError, RequestTransformError, type FormAnswers, type FormSubmission } from '../src'
import { form } from './fixtures'

test('validates and projects visible answers before producing a typed request', () => {
  const receivedAnswers = vi.fn<(answers: Readonly<FormAnswers>) => void>()
  const submission = createSubmission({
    schema: form,
    transform: (answers) => {
      expectTypeOf(answers.email).toEqualTypeOf<string>()
      expectTypeOf(answers.channel).toEqualTypeOf<false | 0>()
      expectTypeOf(answers.company).toEqualTypeOf<string | null | undefined>()
      receivedAnswers(answers)
      return { contact_email: answers.email.trim().toLowerCase(), channel: answers.channel }
    },
  })
  const result = Effect.runSync(
    submission({
      name: 'Ada',
      email: ' ADA@example.com ',
      channel: 0,
      newsletter: false,
      topics: ['work'],
      company: 'Example Ltd',
      reference: 'old reference',
      unrelated: 'other data',
    }),
  )

  expect(receivedAnswers).toHaveBeenCalledExactlyOnceWith({
    name: 'Ada',
    email: ' ADA@example.com ',
    channel: 0,
    newsletter: false,
    topics: ['work'],
  })
  expect(result).toEqual({ sent: false, request: { contact_email: 'ada@example.com', channel: 0 } })
})

test('does not call transform or send when validation fails', () => {
  const transform = vi.fn(() => ({ contact: 'unused' }))
  const send = vi.fn(() => Effect.succeed({ status: 201 }))
  const submission = createSubmission({ schema: form, transform, send })

  const error = Effect.runSync(Effect.flip(submission({ name: 'Ada', channel: false })))

  expect(error).toBeInstanceOf(FormValidationError)
  expect(error).toMatchObject({ fields: { email: 'Email is required.' } })
  expect(transform).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
})

test('runs a lazy send Effect with the transformed request', async () => {
  const transform = vi.fn(({ email }: FormAnswers) => ({ contact: email }))
  const send = vi.fn((request: { contact: unknown }) =>
    Effect.promise(async () => ({
      status: 201,
      saved: request.contact,
    })),
  )
  const submission = createSubmission({ transform, send })
  const effect = submission({ email: 'ada@example.com' })

  expect(transform).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
  await expect(Effect.runPromise(effect)).resolves.toEqual({
    sent: true,
    request: { contact: 'ada@example.com' },
    response: { status: 201, saved: 'ada@example.com' },
  })
  expect(send).toHaveBeenCalledExactlyOnceWith({ contact: 'ada@example.com' })
})

test('wraps a thrown transform error and skips send', () => {
  const cause = new Error('Could not build a request')
  const send = vi.fn(() => Effect.void)
  const submission = createSubmission({
    transform: () => {
      throw cause
    },
    send,
  })

  const error = Effect.runSync(Effect.flip(submission({})))

  expect(error).toBeInstanceOf(RequestTransformError)
  expect(error.cause).toBe(cause)
  expect(send).not.toHaveBeenCalled()
})

test('rejects deferred transforms at the type and runtime boundaries', () => {
  const withPromise = createSubmission({
    // @ts-expect-error Transforms must produce a synchronous request value.
    transform: () => Promise.resolve({ contact: 'ada@example.com' }),
  })
  const withEffect = createSubmission({
    // @ts-expect-error Effects belong in send.
    transform: () => Effect.succeed({ contact: 'ada@example.com' }),
  })

  const deferred: FormSubmission<unknown, never, FormValidationError>[] = [withPromise, withEffect]
  for (const submission of deferred) {
    const error = Effect.runSync(Effect.flip(submission({})))
    expect(error).toBeInstanceOf(RequestTransformError)
    expect(error.cause).toBeInstanceOf(TypeError)
  }
})

test('wraps both synchronous and Effect send failures with the original cause', () => {
  const cause = new Error('Service unavailable')
  const rejected = () => Effect.fail(cause)
  const thrown = () => {
    throw cause
  }

  for (const send of [rejected, thrown]) {
    const submission = createSubmission({ transform: () => ({ contact: 'ada@example.com' }), send })
    const error = Effect.runSync(Effect.flip(submission({})))

    expect(error).toBeInstanceOf(RequestSendError)
    expect(error.cause).toBe(cause)
  }
})
