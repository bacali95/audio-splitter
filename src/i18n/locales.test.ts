import { describe, expect, it } from 'vitest'
import { LANGUAGES } from './languages'
import en from './locales/en.json'

type Tree = { [k: string]: string | Tree }
const files = import.meta.glob<Tree>('./locales/*.json', { eager: true, import: 'default' })

function flatten(tree: Tree, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[key] = v
    else flatten(v, key, out)
  }
  return out
}

const PLURAL = /^(.*)_(zero|one|two|few|many|other)$/
const EN = flatten(en as Tree)

/** Plural groups in en: base key -> { suffix -> value }. Non-plural keys are returned as-is. */
function split(flat: Record<string, string>) {
  const plain: Record<string, string> = {}
  const plurals: Record<string, Record<string, string>> = {}
  for (const [key, value] of Object.entries(flat)) {
    const m = PLURAL.exec(key)
    if (m) (plurals[m[1]] ??= {})[m[2]] = value
    else plain[key] = value
  }
  return { plain, plurals }
}

const vars = (s: string) => new Set([...s.matchAll(/\{\{\s*([^},\s]+)[^}]*\}\}/g)].map((m) => m[1]))
const tags = (s: string) => new Set([...s.matchAll(/<\/?\s*([A-Za-z][\w-]*)\s*\/?>/g)].map((m) => m[1]))
const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x))

const enParts = split(EN)

function locale(code: string): Tree {
  const tree = files[`./locales/${code}.json`]
  if (!tree) throw new Error(`Missing locale file ${code}.json`)
  return tree
}
const isUntranslated = (code: string) => JSON.stringify(locale(code)) === JSON.stringify(en)

describe('locale files', () => {
  it('there is a file for every supported language and nothing else', () => {
    const found = Object.keys(files).map((f) => /\.\/locales\/(.+)\.json$/.exec(f)![1]).sort()
    expect(found).toEqual(LANGUAGES.map((l) => l.code).sort())
  })

  it('en has one/other for every plural', () => {
    for (const [base, forms] of Object.entries(enParts.plurals)) {
      expect(Object.keys(forms).sort(), base).toEqual(['one', 'other'])
    }
  })

  for (const { code } of LANGUAGES.filter((l) => l.code !== 'en')) {
    describe(code, () => {
      const flat = flatten(locale(code))
      const parts = split(flat)
      const required = new Intl.PluralRules(code).resolvedOptions().pluralCategories

      it('has every plain key and no unknown ones', () => {
        expect(Object.keys(parts.plain).sort()).toEqual(Object.keys(enParts.plain).sort())
      })

      it('has every plural group (with `other`) and no unknown ones', () => {
        expect(Object.keys(parts.plurals).sort()).toEqual(Object.keys(enParts.plurals).sort())
        for (const [base, forms] of Object.entries(parts.plurals)) expect(forms.other, `${base}_other`).toBeTruthy()
      })

      // A file that is still an untouched copy of en gets a pass here: translators add the extra forms when they translate.
      it.skipIf(isUntranslated(code))(`has the plural forms ${code} needs (${required.join(', ')})`, () => {
        for (const [base, forms] of Object.entries(parts.plurals)) {
          for (const cat of required) expect(forms[cat], `${base}_${cat}`).toBeTruthy()
        }
      })

      it('has no empty values', () => {
        expect(Object.entries(flat).filter(([, v]) => v.trim() === '')).toEqual([])
      })

      it('keeps every {{variable}} and <tag> of the English source', () => {
        const problems: string[] = []
        for (const [key, src] of Object.entries(enParts.plain)) {
          const v = parts.plain[key]
          if (v === undefined) continue
          for (const name of vars(src)) if (!vars(v).has(name)) problems.push(`${key}: missing {{${name}}}`)
          if (!same(tags(src), tags(v))) problems.push(`${key}: tags differ`)
        }
        for (const [base, enForms] of Object.entries(enParts.plurals)) {
          for (const [cat, v] of Object.entries(parts.plurals[base] ?? {})) {
            const src = enForms[cat] ?? enForms.other
            // The singular/dual/zero forms of some languages drop the number ("one file"), so `count` is optional there.
            const optional = new Set(['zero', 'one', 'two'].includes(cat) ? ['count'] : [])
            for (const name of vars(src)) if (!optional.has(name) && !vars(v).has(name)) problems.push(`${base}_${cat}: missing {{${name}}}`)
            if (!same(tags(src), tags(v))) problems.push(`${base}_${cat}: tags differ`)
          }
        }
        expect(problems).toEqual([])
      })
    })
  }
})

describe('translation report (informational, never fails)', () => {
  it('lists untranslated keys per locale', () => {
    const lines: string[] = []
    for (const { code } of LANGUAGES.filter((l) => l.code !== 'en')) {
      const flat = flatten(locale(code))
      const untranslated = Object.keys(EN).filter((k) => flat[k] === undefined || flat[k] === EN[k])
      lines.push(`${code.padEnd(6)} ${String(Object.keys(EN).length - untranslated.length).padStart(4)}/${Object.keys(EN).length} translated`)
      if (process.env.I18N_REPORT) lines.push(...untranslated.map((k) => `    - ${k}`))
    }
    console.info(`\ni18n report (set I18N_REPORT=1 for the key lists)\n${lines.join('\n')}`)
    expect(true).toBe(true)
  })
})
