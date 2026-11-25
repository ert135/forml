import { Data } from 'effect'

export class FormSchemaError extends Data.TaggedError('FormSchemaError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class FormLoadError extends Data.TaggedError('FormLoadError')<{
  readonly message: string
  readonly cause: unknown
}> {}

export class FormValidationError extends Data.TaggedError('FormValidationError')<{
  readonly message: string
  readonly fields: Readonly<Record<string, string>>
}> {}

export class QuestionChangeError extends Data.TaggedError('QuestionChangeError')<{
  readonly message: string
  readonly questionId: string
  readonly effectName: string
  readonly cause: unknown
}> {}

export class RequestTransformError extends Data.TaggedError('RequestTransformError')<{
  readonly message: string
  readonly cause: unknown
}> {}

export class RequestSendError extends Data.TaggedError('RequestSendError')<{
  readonly message: string
  readonly cause: unknown
}> {}

export class FormRuntimeError extends Data.TaggedError('FormRuntimeError')<{
  readonly message: string
  readonly cause: unknown
}> {}

export type FormError = FormSchemaError | FormValidationError | QuestionChangeError | RequestTransformError | RequestSendError | FormRuntimeError
