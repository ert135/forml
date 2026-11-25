<script setup lang="ts">
import { Effect } from 'effect'
import { computed, shallowReactive } from 'vue'

import ContactStep from '../.storybook/demoComponents/ContactStep.vue'
import RemovalsProgress from '../.storybook/demoComponents/RemovalsProgress.vue'
import {
  createFormState,
  createSubmission,
  decodeForm,
  defineProgressComponent,
  defineQuestionComponents,
  defineStepComponents,
  Forml,
  FormlActionType,
  type FormSchema,
  type FormState,
  type FormStepChangeEffect,
  type QuestionChangeEffects,
} from '../src'
import { sameJson } from '../src/json'
import { questionValidators } from './questionValidators'
import { lookupPostcode, transformRemovalsRequest, type RemovalsPayload } from './removals'
import removals from './removals.json'
import RemovalsInput from './RemovalsInput.vue'
import { generateTrackingRequest, handleFailures, saveMatch, saveToLocalStorage, sendConversionValues } from './savingEffects'

const props = defineProps<{ schema?: FormSchema }>()
const defaultSchema = Effect.runSync(decodeForm(removals))
const stepComponents = defineStepComponents({ ContactStep })
const questionComponents = defineQuestionComponents({ date: RemovalsInput, tel: RemovalsInput })
const progressComponent = defineProgressComponent(RemovalsProgress)

interface RemovalsSession {
  readonly schema: FormSchema
  state: FormState
  postcodeStatus?: string
}

const session = computed<RemovalsSession>((previous) => {
  const schema = props.schema ?? defaultSchema
  if (previous && sameJson(previous.schema, schema)) return previous
  return shallowReactive<RemovalsSession>({
    schema,
    state: createFormState(schema),
  })
})

const beforeStepChange: FormStepChangeEffect = (action, state) =>
  action.type === FormlActionType.Next ? Effect.log('Continue from step', state.stepId) : Effect.log('Back from step', state.stepId)

const changeEffects = {
  checkCurrentPostcode: ({ value }) =>
    Effect.gen(function* () {
      const current = session.value
      current.postcodeStatus = undefined
      current.postcodeStatus = yield* lookupPostcode(value).pipe(
        Effect.match({
          onSuccess: (match) => {
            if (match === undefined) return undefined
            if (match === null) return 'Postcode not found. Check it and try again.'
            return match.admin_district ? `${match.postcode} · ${match.admin_district}` : match.postcode
          },
          onFailure: () => 'Postcode lookup is temporarily unavailable.',
        }),
      )
    }),
} satisfies QuestionChangeEffects

const send = (request: RemovalsPayload) =>
  generateTrackingRequest(request).pipe(
    Effect.tap(sendConversionValues),
    Effect.tap(Effect.log('Analytics Conversions complete')),
    Effect.tap(saveMatch(request)),
    Effect.tap(Effect.log('Saving match complete')),
    Effect.tap(saveToLocalStorage),
    handleFailures,
  )

const submission = createSubmission({ transform: transformRemovalsRequest, send })
</script>

<template>
  <main>
    <h1>Compare removal quotes</h1>
    <Forml
      :schema="session.schema"
      v-model:state="session.state"
      :step-components="stepComponents"
      :question-components="questionComponents"
      :question-validators="questionValidators"
      :progress-component="progressComponent"
      :before-step-change="beforeStepChange"
      :change-effects="changeEffects"
      :submission="submission"
    />
    <p v-if="session.state.stepId === 'moving-from'" role="status">
      {{ session.postcodeStatus }}
    </p>
  </main>
</template>
