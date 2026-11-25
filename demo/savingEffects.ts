import { Data, Effect } from "effect"
import type { RemovalsPayload } from './removals'

type AnalyticsRequestObject = {
  guid: string
  json: string
}

type ErrorMessage = { readonly message: string }

class TrackingRequestError extends Data.TaggedError("TrackingRequestError")<{
  readonly cause: Error
}> {}

class GoogleConversionError extends Data.TaggedError("GoogleConversionError")<ErrorMessage> {}
class BingConversionError extends Data.TaggedError("BingConversionError")<ErrorMessage> {}
class SaveMatchError extends Data.TaggedError("SaveMatchError")<ErrorMessage> {}

type MatchFailure =
  | TrackingRequestError
  | GoogleConversionError
  | BingConversionError
  | SaveMatchError
  | ReceiptStorageError

export const generateTrackingRequest = (
  request: RemovalsPayload
): Effect.Effect<AnalyticsRequestObject, TrackingRequestError> =>
  Effect.try({
    try: () => ({
      guid: crypto.randomUUID(),
      json: JSON.stringify(request),
    }),
    catch: (cause) =>
      new TrackingRequestError({
        cause:
          cause instanceof Error
            ? cause
            : new Error("Failed to generate tracking request", { cause }),
      }),
  })

export const googleConversion = (
  _request: AnalyticsRequestObject
): Effect.Effect<void, GoogleConversionError> => Effect.succeed(undefined)

export const bingConversion = (
  _request: AnalyticsRequestObject
): Effect.Effect<void, BingConversionError> => Effect.succeed(undefined)

export const saveMatch = (_request: RemovalsPayload): Effect.Effect<void, SaveMatchError> =>
  Effect.succeed(undefined)

export const sendConversionValues = (trackingRequest: AnalyticsRequestObject) =>
  Effect.all(
    [googleConversion(trackingRequest), bingConversion(trackingRequest)],
    { concurrency: 2 },
  )

export type RegistrationReceipt = {
  confirmationId: string
  savedAt: string
}

export class ReceiptStorageError extends Data.TaggedError('ReceiptStorageError')<{
  readonly cause: unknown
}> {}

export const saveToLocalStorage = ({ guid }: AnalyticsRequestObject) =>
  Effect.try({
    try: (): RegistrationReceipt => {
      const receipt = {
        confirmationId: guid,
        savedAt: new Date().toISOString(),
      }

      localStorage.setItem('removals:last-request', JSON.stringify(receipt))
      return receipt
    },
    catch: (cause) => new ReceiptStorageError({ cause }),
  })

export const handleFailures = <A, R>(program: Effect.Effect<A, MatchFailure, R>) =>
  Effect.catchTags(program, {
    TrackingRequestError: ({ cause }) =>
      Effect.logWarning("Could not generate tracking request", cause.message),

    GoogleConversionError: ({ message }) =>
      Effect.logWarning("Google conversion failed", message),

    BingConversionError: ({ message }) =>
      Effect.logWarning("Bing conversion failed", message),

    SaveMatchError: ({ message }) =>
      Effect.logWarning("Could not save match", message),

    ReceiptStorageError: () =>
      Effect.logWarning("Could not save to local storage"),
  });
