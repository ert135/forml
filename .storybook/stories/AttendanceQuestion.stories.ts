import type { Meta, StoryObj } from '@storybook/vue3-vite'

import { FormlType } from '../../src'
import AttendanceQuestion from '../demoComponents/AttendanceQuestion.vue'

const meta = {
  title: 'forml/Attendance question',
  component: AttendanceQuestion,
  args: {
    inputId: 'attendance-example',
    question: {
      id: 'online',
      type: FormlType.Radio,
      label: 'How will you attend?',
      options: [
        { label: 'In person', value: false },
        { label: 'Online', value: true },
      ],
    },
  },
} satisfies Meta<typeof AttendanceQuestion>

export default meta

export const InPerson: StoryObj<typeof meta> = { args: { value: false } }
