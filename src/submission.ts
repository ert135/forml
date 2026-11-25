import { Effect } from 'effect'
import { RequestSendError, RequestTransformError } from './errors'
import type { FormValidationError } from './errors'
import type { AnswersFromSchema, FormAnswers, FormSchema } from './schema'
import { validateAnswers } from './validation'
import { questionVisibility } from './visibility'

export type SubmissionResult<Request, Response = never> =
  | { readonly request: Request; readonly sent: false }
  | { readonly request: Request; readonly sent: true; readonly response: Response }

type DeferredRequest = Effect.Effect<unknown, unknown, unknown> | PromiseLike<unknown>
type SynchronousRequest<Request> = Request & Exclude<Request, DeferredRequest>

export interface SubmissionOptions<Request, Response = never> {
  schema?: never
  transform: (answers: Readonly<FormAnswers>) => SynchronousRequest<Request>
  send?: (request: Request) => Effect.Effect<Response, unknown>
}

export interface SchemaSubmissionOptions<Definition extends FormSchema, Request, Response = never> {
  schema: Definition
  transform: (answers: AnswersFromSchema<Definition>) => SynchronousRequest<Request>
  send?: (request: Request) => Effect.Effect<Response, unknown>
}

export type FormSubmission<Request, Response = never, ValidationFailure = never> = (
  answers: Readonly<FormAnswers>,
) => Effect.Effect<SubmissionResult<Request, Response>, RequestTransformError | RequestSendError | ValidationFailure>

function transformRequest<Request>(makeRequest: () => Request): Effect.Effect<Request, RequestTransformError> {
  return Effect.try({
    try: () => {
      const request = makeRequest()
      const canBeThenable = request !== null && (typeof request === 'object' || typeof request === 'function')
      if (Effect.isEffect(request) || (canBeThenable && typeof Reflect.get(request, 'then') === 'function')) {
        throw new TypeError('The transform callback must return a synchronous request value.')
      }
      return request
    },
    catch: (cause) => new RequestTransformError({
      cause,
      message: 'Could not turn the answers into an API request.',
    }),
  })
}

function answersForSchema(schema: FormSchema, answers: Readonly<FormAnswers>): FormAnswers {
  const selected: FormAnswers = Object.create(null)
  const visibility = questionVisibility(schema.steps, answers)
  for (const step of schema.steps) {
    for (const { id } of step.questions) {
      if (visibility.get(id) && Object.hasOwn(answers, id)) selected[id] = answers[id]
    }
  }
  return selected
}

function hasSchema<Definition extends FormSchema, Request, Response>(
  options: SubmissionOptions<Request, Response> | SchemaSubmissionOptions<Definition, Request, Response>,
): options is SchemaSubmissionOptions<Definition, Request, Response> {
  return options.schema !== undefined
}

export function createSubmission<const Definition extends FormSchema, Request, Response = never>(
  options: SchemaSubmissionOptions<Definition, Request, Response>,
): FormSubmission<Request, Response, FormValidationError>
export function createSubmission<Request, Response = never>(
  options: SubmissionOptions<Request, Response>,
): FormSubmission<Request, Response>
export function createSubmission<const Definition extends FormSchema, Request, Response = never>(
  options: SubmissionOptions<Request, Response> | SchemaSubmissionOptions<Definition, Request, Response>,
): FormSubmission<Request, Response, FormValidationError> {
  const { send } = options

  function prepareRequest(answers: Readonly<FormAnswers>) {
    if (!hasSchema(options)) return transformRequest(() => options.transform(answers))

    const { schema, transform } = options
    const selected = answersForSchema(schema, answers)
    return validateAnswers(schema.steps, selected).pipe(
      Effect.flatMap(() => transformRequest(() => transform(selected as AnswersFromSchema<Definition>))),
    )
  }

  return (answers) => Effect.gen(function* () {
    const request = yield* prepareRequest(answers)

    if (!send) return { request, sent: false } as const

    const sendError = (cause: unknown) => new RequestSendError({
      cause,
      message: 'Could not submit the request. Try again.',
    })
    const response = yield* Effect.try({ try: () => send(request), catch: sendError }).pipe(
      Effect.flatMap((effect) => Effect.mapError(effect, sendError)),
    )
    return { request, sent: true, response } as const
  })
}
