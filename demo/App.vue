<script setup lang="ts">
import { Effect } from 'effect'
import { computed, shallowReactive } from 'vue'
import { createFormState, createSubmission, decodeForm, defineProgressComponent, defineQuestionComponents, defineStepComponents, Forml } from '../src'
import type { FormAction, FormSchema, FormState, QuestionChangeEffects } from '../src'
import { sameJson } from '../src/json'
import ContactStep from '../.storybook/demoComponents/ContactStep.vue'
import RemovalsInput from './RemovalsInput.vue'
import RemovalsProgress from '../.storybook/demoComponents/RemovalsProgress.vue'
import removals from './removals.json'
import { lookupPostcode, transformRemovalsRequest } from './removals'
import type { RemovalsPayload } from './removals'
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

console.log('session', session.value)

function dispatch(action: FormAction, next: FormState) {
  console.log('action is ', action)
  session.value.state = next
}

const changeEffects = {
  checkCurrentPostcode: ({ value }) => Effect.gen(function* () {
    const current = session.value
    current.postcodeStatus = undefined
    current.postcodeStatus = yield* lookupPostcode(value).pipe(Effect.match({
      onSuccess: (match) => {
        if (match === undefined) return undefined
        if (match === null) return 'Postcode not found. Check it and try again.'
        return match.admin_district ? `${match.postcode} · ${match.admin_district}` : match.postcode
      },
      onFailure: () => 'Postcode lookup is temporarily unavailable.',
    }))
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
      :state="session.state"
      :step-components="stepComponents"
      :question-components="questionComponents"
      :progress-component="progressComponent"
      :change-effects="changeEffects"
      :submission="submission"
      @action="dispatch"
    />
    <p v-if="session.state.stepId === 'moving-from'" role="status">
      {{ session.postcodeStatus }}
    </p>
  </main>
</template>
