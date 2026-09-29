/**
 * Runs `pkg-utils check --strict` in a way that works with Yarn Classic (1.x).
 *
 * WHY: `pkg-utils check` runs publint, and publint lists the files a package
 * would publish by packing it with the project's package manager, detected
 * from the lockfile. Yarn 1 cannot do that: it ignores `--dry-run`, writes a
 * real tarball into the project, and prints no file list. publint then sees an
 * empty package and reports every file as "not published".
 *
 * WHAT THIS DOES: copies what the check needs into a temporary staging folder
 * WITHOUT `yarn.lock`, links `node_modules`, and runs the same check there, so
 * publint packs with npm (which ships with Node). The project itself is not
 * modified, and you keep using yarn for everything else.
 *
 *   node scripts/check-package.mjs
 */
import {spawnSync} from 'node:child_process'
import {cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

/** Everything the check reads: manifest, config, sources, build output. */
const entries = [
  'package.json',
  'package.config.ts',
  'tsconfig.json',
  'tsconfig.dist.json',
  'tsconfig.settings.json',
  'README.md',
  'LICENSE',
  'src',
  ...(pkg.files ?? []),
]

if (!existsSync(join(root, 'node_modules'))) {
  process.stderr.write('check-package: node_modules not found — run `yarn install` first.\n')
  process.exit(1)
}

const stage = mkdtempSync(join(tmpdir(), 'pkg-check-'))
let status = 1

try {
  for (const entry of new Set(entries)) {
    const from = join(root, entry)
    if (existsSync(from)) cpSync(from, join(stage, entry), {recursive: true})
  }

  // Junctions need no admin rights on Windows; the type is ignored elsewhere.
  symlinkSync(join(root, 'node_modules'), join(stage, 'node_modules'), 'junction')

  const bin = join(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'pkg-utils.cmd' : 'pkg-utils',
  )
  const result = spawnSync(bin, ['check', '--strict'], {
    cwd: stage,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      // Make sure nothing points publint back at yarn.
      npm_config_user_agent: `npm node/${process.version}`,
    },
  })

  if (result.error) throw result.error
  status = result.status ?? 1
} catch (error) {
  process.stderr.write(`check-package: ${error instanceof Error ? error.message : String(error)}\n`)
  status = 1
} finally {
  rmSync(stage, {recursive: true, force: true})
}

process.exit(status)
