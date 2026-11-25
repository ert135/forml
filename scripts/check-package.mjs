import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const temporaryRoot = resolve(tmpdir())
const consumer = await mkdtemp(join(temporaryRoot, 'forml-package-'))

try {
  if (!process.env.npm_execpath) throw new Error('Run this check with npm run check:package after npm run build.')
  const [packed] = JSON.parse(
    execFileSync(
      process.execPath,
      [process.env.npm_execpath, 'pack', '--dry-run', '--ignore-scripts', '--json', '--cache', join(consumer, 'npm-cache')],
      { cwd: root, encoding: 'utf8' },
    ),
  )
  const packageRoot = join(consumer, 'node_modules', 'forml')
  for (const { path } of packed.files) {
    const destination = join(packageRoot, path)
    await mkdir(dirname(destination), { recursive: true })
    await cp(join(root, path), destination)
  }

  // Use the installed peers, but only npm's packed files for forml itself.
  const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  for (const peer of Object.keys(metadata.peerDependencies)) {
    await symlink(join(root, 'node_modules', peer), join(consumer, 'node_modules', peer), 'junction')
  }
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  await writeFile(
    join(consumer, 'runtime.mjs'),
    `import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import * as forml from 'forml'
import { useAutocomplete } from 'forml/autocomplete'
import { useForm, useFormSession } from 'forml/form'
import { decodeForm, FormlType, loadForm } from 'forml/schema'
import * as types from 'forml/types'

assert.equal(useAutocomplete, forml.useAutocomplete)
assert.equal(useForm, forml.useForm)
assert.equal(useFormSession, forml.useFormSession)
assert.equal(decodeForm, forml.decodeForm)
assert.equal(loadForm, forml.loadForm)
assert.equal(FormlType, forml.FormlType)
assert.equal(typeof forml.Forml, 'object')
assert.equal(typeof forml.sameJson, 'function')
assert.deepEqual(Object.keys(types), [])
await access(fileURLToPath(import.meta.resolve('forml/style.css')))
await access(fileURLToPath(import.meta.resolve('forml/progress.css')))
`,
  )
  execFileSync(process.execPath, ['runtime.mjs'], { cwd: consumer, stdio: 'inherit' })

  await cp(join(root, '.storybook', 'demoComponents', 'AutocompleteQuestion.vue'), join(consumer, 'CustomQuestion.vue'))
  await writeFile(
    join(consumer, 'consumer.ts'),
    `import { createSubmission, defineQuestionComponents } from 'forml'
import { useAutocomplete } from 'forml/autocomplete'
import { useForm, useFormSession, type FormSession } from 'forml/form'
import { FormlType } from 'forml/schema'
import type { ChoiceOption, FormConfig, QuestionComponentEmits, QuestionComponentProps } from 'forml/types'
import CustomQuestion from './CustomQuestion.vue'

defineQuestionComponents({ custom: CustomQuestion })
const options: readonly ChoiceOption[] = [{ label: 'Zero', value: 0 }]
const props: QuestionComponentProps = {
  inputId: 'example',
  question: { id: 'choice', type: FormlType.Autocomplete, label: 'Choice', options },
}
useAutocomplete(props, (value) => { const answer: QuestionComponentEmits['answer'] = [value] })
const schema = { steps: [{ id: 'custom', title: 'Custom', questions: [{ ...props.question, type: 'custom' }] }] } satisfies FormConfig<'custom'>
const session = useFormSession(() => schema, (): { status?: string } => ({}))
const current: FormSession<{ status?: string }> = session.value
current.status = 'Ready'
current.state = { ...current.state, answers: { choice: 0 } }
// @ts-expect-error Session fields retain their inferred types.
current.status = 42
// @ts-expect-error The schema comes from the input; it cannot be replaced on the session.
current.schema = schema
const controller = useForm({ schema, questionComponents: defineQuestionComponents({ custom: CustomQuestion }), submission: createSubmission({ transform: () => ({ count: 1 }) }) }, {
  onSubmit: (result) => { const count: unknown = result.request.count },
})
controller.answer('choice', 0)
controller.next()
controller.back()
controller.submit()
// @ts-expect-error Composable state is read-only; actions produce the next state.
controller.state.value = undefined
// @ts-expect-error Pending status is managed by the composable's effect lifecycle.
controller.submitting.value = false
// @ts-expect-error Imported declarations must preserve the number answer contract.
const invalid: QuestionComponentEmits<number>['answer'] = ['not a number']
`,
  )
  await writeFile(
    join(consumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
        verbatimModuleSyntax: true,
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      },
      include: ['consumer.ts', 'CustomQuestion.vue'],
    }),
  )
  execFileSync(process.execPath, [join(root, 'node_modules', 'vue-tsc', 'bin', 'vue-tsc.js'), '--noEmit', '-p', join(consumer, 'tsconfig.json')], {
    cwd: consumer,
    stdio: 'inherit',
  })
  console.log(`Verified ${packed.id}: public imports, styles, and a copied Vue component without source aliases.`)
} finally {
  if (dirname(resolve(consumer)) !== temporaryRoot || !basename(consumer).startsWith('forml-package-')) {
    throw new Error('Refusing to remove a directory outside the package-check temporary folder.')
  }
  await rm(consumer, { recursive: true, force: true })
}
