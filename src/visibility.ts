import type { FormAnswers, FormQuestion, FormStep } from './schema'

export function showWhenError(questions: ReadonlyMap<string, FormQuestion>): string | undefined {
  const checking = new Set<string>()
  const checked = new Set<string>()

  function visit(question: FormQuestion): string | undefined {
    if (checked.has(question.id)) return
    if (checking.has(question.id)) return `Question "${question.id}" has a circular showWhen rule.`

    checking.add(question.id)
    for (const id of Object.keys(question.showWhen ?? {})) {
      const source = questions.get(id)
      if (!source) return `Question "${question.id}" refers to unknown question "${id}" in showWhen.`
      const error = visit(source)
      if (error) return error
    }
    checking.delete(question.id)
    checked.add(question.id)
  }

  for (const question of questions.values()) {
    const error = visit(question)
    if (error) return error
  }
}

export function questionVisibility(steps: readonly FormStep[], answers: Readonly<FormAnswers>): ReadonlyMap<string, boolean> {
  const questions = new Map<string, FormQuestion>()
  for (const step of steps) {
    for (const question of step.questions) questions.set(question.id, question)
  }

  const visibility = new Map<string, boolean>()
  function isVisible(question: FormQuestion): boolean {
    const known = visibility.get(question.id)
    if (known !== undefined) return known

    // A false entry prevents recursion if an unchecked definition contains a cycle.
    visibility.set(question.id, false)
    const visible = Object.entries(question.showWhen ?? {}).every(([id, matches]) => {
      const source = questions.get(id)
      if (!source || !Object.hasOwn(answers, id) || !isVisible(source)) return false
      const value = answers[id]
      return matches.some((match) => (Array.isArray(value) ? value.includes(match) : value === match))
    })
    visibility.set(question.id, visible)
    return visible
  }

  for (const question of questions.values()) isVisible(question)
  return visibility
}
