import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { extract } from '@stafyniaksacha/facturx'

/**
 * The official CII invoices the EN 16931 model reads: the Factur-X 1.09 corpus at BASIC, EN 16931 and EXTENDED, and
 * the XP Z12-012 v1.4 annex B Factur-X examples (hybrid PDFs and commented CII XML, EN 16931, EXTENDED and
 * EXTENDED-CTC-FR). MINIMUM and BASIC WL are not EN 16931 invoices: `fromCii()` rejects them, so their folders are
 * left out on purpose.
 */

export const CORPUS_DIR = resolve(import.meta.dirname, '../../spec/factur-x-1.09/distribution/5. FACTUR-X 1.09 - Examples/_Factur-X_1.08-Exemples_CS')
export const ANNEX_B_DIR = resolve(import.meta.dirname, '../../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures')

export type CorpusLevel = 'basic' | 'en16931' | 'extended' | 'extended-ctc-fr'
export interface CorpusDoc { name: string, level: CorpusLevel, xml: string }

async function corpusDocs(folder: string, level: CorpusLevel): Promise<CorpusDoc[]> {
  const dir = join(CORPUS_DIR, folder)
  const files = readdirSync(dir).filter(f => f.endsWith('.pdf')).sort()
  return Promise.all(files.map(async (f) => {
    const { xml } = await extract({ pdf: await readFile(join(dir, f)) })
    return { name: `corpus ${folder}/${f}`, level, xml }
  }))
}

// Level by file name: the F202500001 folder holds the EXTENDED Factur-X document under an `_EXTENDED-CTC-FR` directory.
function annexLevel(name: string): CorpusLevel {
  return name.includes('EXTENDED-CTC-FR') ? 'extended-ctc-fr' : name.includes('EXTENDED') ? 'extended' : 'en16931'
}

async function annexDocs(): Promise<CorpusDoc[]> {
  const files = readdirSync(ANNEX_B_DIR, { withFileTypes: true, recursive: true })
    .filter(e => e.isFile() && ((/_CII_Commentee\.xml$/.test(e.name)) || (e.name.endsWith('.pdf'))))
    .map(e => join(e.parentPath ?? (e as { path?: string }).path ?? '', e.name))
    .sort()
  return Promise.all(files.map(async (file) => {
    const name = file.split('/').pop()!
    const xml = name.endsWith('.pdf') ? (await extract({ pdf: await readFile(file) })).xml : await readFile(file, 'utf8')
    return { name: `annex B ${name}`, level: annexLevel(name), xml }
  }))
}

/** Every document of the two corpora, in a stable order. */
export async function loadEn16931Corpus(): Promise<CorpusDoc[]> {
  return [
    ...await corpusDocs('2.BASIC', 'basic'),
    ...await corpusDocs('3.EN16931', 'en16931'),
    ...await corpusDocs('4.EXTENDED', 'extended'),
    ...await annexDocs(),
  ]
}
