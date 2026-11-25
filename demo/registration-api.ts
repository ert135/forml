import { Data, Effect, Schema } from 'effect'

export const RegistrationRequest = Schema.Struct({
  attendee: Schema.Struct({ name: Schema.NonEmptyString, email: Schema.NonEmptyString }),
  trackId: Schema.String,
  interestIds: Schema.Array(Schema.String),
  attendance: Schema.Literals(['remote', 'onsite']),
})

export type RegistrationPayload = typeof RegistrationRequest.Type

export enum MockScenario {
  Success = 'success',
  RetryAvailability = 'retry-availability',
  SoldOut = 'sold-out',
  AnalyticsUnavailable = 'analytics-unavailable',
}

export interface MockApiCall {
  readonly endpoint: string
  readonly attempt: number
  readonly status: 'started' | number
}

export interface RegistrationAnalyticsEvent {
  readonly name: 'workshop_registration_completed'
  readonly registrationId: string
  readonly trackId: string
  readonly attendance: RegistrationPayload['attendance']
}

export interface RegistrationResponse {
  readonly status: 201
  readonly body: {
    readonly registrationId: string
    readonly track: string
    readonly attendance: RegistrationPayload['attendance']
    readonly confirmation: 'queued'
    readonly analytics:
      | { readonly status: 'recorded'; readonly event: RegistrationAnalyticsEvent }
      | { readonly status: 'failed'; readonly event: RegistrationAnalyticsEvent; readonly message: string }
  }
}

export class MockHttpError extends Data.TaggedError('MockHttpError')<{
  readonly status: number
  readonly message: string
}> {}

export class WorkshopSoldOut extends Data.TaggedError('WorkshopSoldOut')<{
  readonly message: string
}> {}

const trackNames = new Map([
  ['vue', 'Vue fundamentals'],
  ['effect', 'Working with Effect'],
])

export function createMockRegistrationApi(scenario: MockScenario, report: (call: MockApiCall) => void) {
  function call<Result, Failure extends MockHttpError>(
    endpoint: string,
    delay: number,
    respond: (attempt: number) => Effect.Effect<Result, Failure>,
    successStatus = 200,
  ) {
    let attempts = 0
    return Effect.suspend(() => {
      const attempt = ++attempts
      const record = (status: MockApiCall['status']) => Effect.sync(() => report({ endpoint, attempt, status }))

      return Effect.gen(function* () {
        yield* record('started')
        yield* Effect.sleep(delay)
        return yield* respond(attempt)
      }).pipe(
        Effect.tap(() => record(successStatus)),
        Effect.tapError((error) => record(error.status)),
      )
    })
  }

  return {
    getTrack: (trackId: string) => call(`GET /tracks/${encodeURIComponent(trackId)}`, 140, () =>
      Effect.succeed({ name: trackNames.get(trackId) ?? trackId }),
    ),
    getAvailability: (trackId: string) => call(`GET /tracks/${encodeURIComponent(trackId)}/availability`, 260, (attempt) =>
      scenario === MockScenario.RetryAvailability && attempt === 1
        ? Effect.fail(new MockHttpError({ status: 503, message: 'The availability service is temporarily unavailable.' }))
        : Effect.succeed({ seats: scenario === MockScenario.SoldOut ? 0 : 6 }),
    ),
    createRegistration: (request: RegistrationPayload) => call('POST /registrations', 180, () =>
      Effect.succeed({ id: `demo-${request.trackId}-001` }), 201,
    ),
    queueConfirmation: (registrationId: string) => call(`POST /registrations/${encodeURIComponent(registrationId)}/confirmation`, 160, () =>
      Effect.succeed('queued' as const), 202,
    ),
    recordAnalytics: (event: RegistrationAnalyticsEvent) => call('POST /mock/google-analytics/collect', 130, () =>
      scenario === MockScenario.AnalyticsUnavailable
        ? Effect.fail(new MockHttpError({ status: 503, message: 'The mock analytics service is temporarily unavailable.' }))
        : Effect.succeed(event), 204,
    ),
  }
}
