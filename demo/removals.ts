import { Effect, Schema } from 'effect'
import type { FormAnswers, JsonValue } from 'forml/types'

const RemovalsRequest = Schema.Struct({
  customerFirstName: Schema.NonEmptyString,
  customerSurname: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
  phone: Schema.NonEmptyString,
  currentAddressLine1: Schema.NonEmptyString,
  currentTown: Schema.NonEmptyString,
  currentPostcode: Schema.NonEmptyString,
  currentType: Schema.Literals(['apartment-flat', 'house', 'bungalow', 'storage']),
  currentBedrooms: Schema.optional(Schema.Int),
  currentStorageSize: Schema.optional(Schema.String),
  currentFloorLevel: Schema.optional(Schema.Int),
  currentLift: Schema.optional(Schema.Boolean),
  newPostcode: Schema.optional(Schema.NonEmptyString),
  newTownOnly: Schema.optional(Schema.NonEmptyString),
  movingDate: Schema.NonEmptyString,
  flexibleMovingDate: Schema.Literals([0, 1]),
  packingServiceRequired: Schema.Boolean,
  packingMaterialsRequired: Schema.Boolean,
  packingDismantlingRequired: Schema.Boolean,
})

export type RemovalsPayload = typeof RemovalsRequest.Type

function text(value: JsonValue | undefined) {
  return typeof value === 'string' ? value.trim() : undefined
}

function postcode(value: JsonValue | undefined) {
  return text(value)?.replace(/\s/g, '').toUpperCase()
}

function numberChoice(value: JsonValue | undefined) {
  const choice = text(value)
  return choice ? Number(choice) : undefined
}

export function transformRemovalsRequest(values: Readonly<FormAnswers>): RemovalsPayload {
  const movingDate = text(values.movingDate)
  const dates = Array.isArray(values.flexibleMovingDate) ? values.flexibleMovingDate : []
  const extras = Array.isArray(values.extraServices) ? values.extraServices : []

  return Schema.decodeUnknownSync(RemovalsRequest)({
    customerFirstName: text(values.firstName),
    customerSurname: text(values.lastName),
    email: text(values.email)?.toLowerCase(),
    phone: text(values.phone)?.replace(/\s/g, ''),
    currentAddressLine1: text(values.currentAddressLine1),
    currentTown: text(values.currentTown)?.toUpperCase(),
    currentPostcode: postcode(values.currentPostcode),
    currentType: values.currentType,
    currentBedrooms: numberChoice(values.currentBedrooms),
    currentStorageSize: text(values.currentStorage),
    currentFloorLevel: numberChoice(values.currentFloor),
    currentLift: values.currentLift,
    newPostcode: postcode(values.newPostcode),
    newTownOnly: text(values.newTownOnly)?.toUpperCase(),
    movingDate: movingDate ? `${movingDate}T00:00:00` : undefined,
    flexibleMovingDate: dates.includes('not_flexible') ? 0 : 1,
    packingServiceRequired: extras.includes('packing'),
    packingMaterialsRequired: extras.includes('boxes'),
    packingDismantlingRequired: extras.includes('dismantling'),
  })
}

const PostcodeLookupResponse = Schema.Struct({
  result: Schema.Struct({
    postcode: Schema.NonEmptyString,
    admin_district: Schema.NullOr(Schema.String),
  }),
})

export function lookupPostcode(value: JsonValue) {
  return Effect.gen(function* () {
    const code = postcode(value)
    if (!code || !/^(?:GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/.test(code)) return undefined

    yield* Effect.sleep('300 millis')
    const body = yield* Effect.tryPromise(async (signal): Promise<unknown> => {
      const response = await fetch(`https://api.postcodes.io/postcodes/${code}`, { signal })
      if (response.status === 404) return undefined
      if (!response.ok) throw new Error(`Postcodes.io returned HTTP ${response.status}`)
      return response.json()
    }).pipe(Effect.timeout('5 seconds'))

    if (body === undefined) return null
    const { result } = yield* Schema.decodeUnknownEffect(PostcodeLookupResponse)(body)
    return result
  })
}
