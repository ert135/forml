import type { QuestionValidators } from '../src'

export const questionValidators = {
  date: ({ value, question }) => {
    if (value === '') return
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Enter a valid date.'
    const date = new Date(`${value}T00:00:00Z`)
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return 'Enter a valid date.'
    const min = question.props?.min
    if (typeof min === 'string' && value < min) return `Choose a date on or after ${min}.`
  },
  tel: ({ value, question }) => {
    if (value === '') return
    const minDigits = typeof question.props?.minDigits === 'number' ? question.props.minDigits : 7
    if (typeof value !== 'string' || !/^\+?[\d\s().-]+$/.test(value) || value.replace(/\D/g, '').length < minDigits) {
      return `Enter a phone number with at least ${minDigits} digits.`
    }
  },
} satisfies QuestionValidators
