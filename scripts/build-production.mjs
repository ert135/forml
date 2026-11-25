import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'vite'
import webpack from 'webpack'

const root = fileURLToPath(new URL('../', import.meta.url))
const compiled = await mkdtemp(join(tmpdir(), 'forml-build-'))

try {
  await build({
    root,
    mode: 'library',
    build: { outDir: compiled, emptyOutDir: true, minify: false, cssMinify: false },
  })

  const stats = await new Promise((resolve, reject) => {
    webpack(
      {
        context: root,
        mode: 'production',
        entry: { forml: [join(compiled, 'forml.css'), join(compiled, 'forml.js')] },
        experiments: { css: true },
        output: {
          path: join(root, 'dist'),
          filename: 'forml.js',
          cssFilename: 'forml.css',
          library: { type: 'modern-module' },
          clean: true,
        },
        externalsType: 'module',
        externals: { vue: 'vue', effect: 'effect' },
        optimization: { minimize: true },
      },
      (error, result) => {
        if (error) reject(error)
        else if (result.hasErrors()) reject(new Error(result.toString('errors-warnings')))
        else resolve(result)
      },
    )
  })

  console.log(
    stats.toString({
      preset: 'errors-warnings',
      assets: true,
      version: true,
      timings: true,
      colors: process.stdout.isTTY,
    }),
  )

  // Public subpaths share one bundle so classes and Vue components keep their identity.
  const subpaths = {
    types: 'export {}\n',
    schema: "export { decodeForm, FormlType, loadForm } from './forml.js'\n",
    autocomplete: "export { useAutocomplete } from './forml.js'\n",
    form: "export { useForm, useFormSession } from './forml.js'\n",
  }
  await Promise.all(Object.entries(subpaths).map(([name, source]) => writeFile(join(root, 'dist', `${name}.js`), source)))
} finally {
  await rm(compiled, { recursive: true, force: true })
}
