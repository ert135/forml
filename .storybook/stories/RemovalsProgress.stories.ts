import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { Effect } from 'effect'
import { decodeForm } from 'forml/schema'

import removals from '../../demo/removals.json'
import RemovalsProgress from '../demoComponents/RemovalsProgress.vue'

const { steps } = Effect.runSync(decodeForm(removals))

const meta = {
  title: 'forml/Removals progress',
  component: RemovalsProgress,
  args: { steps, stepIndex: 0 },
  argTypes: {
    stepIndex: { control: { type: 'range', min: 0, max: steps.length - 1, step: 1 } },
  },
} satisfies Meta<typeof RemovalsProgress>

export default meta

type Story = StoryObj<typeof meta>

export const Property: Story = {}
export const Details: Story = { args: { stepIndex: 1 } }
export const Contact: Story = { args: { stepIndex: 2 } }
