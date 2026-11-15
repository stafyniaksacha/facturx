import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { validateCdar } from '@stafyniaksacha/facturx'
import { describe, expect, it } from 'vitest'

// Was CG-20: French lifecycle status messages (CDV) in CDAR D22B are validated with the two steps of
// the FNFE-MPE release notes p.10: the "uncoupled" CDAR XSD, then BR-FR-CDV-Schematron-CDAR.
const CDAR_DIR = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Cycle de Vie - CDAR')

const examples = readdirSync(CDAR_DIR, { withFileTypes: true, recursive: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.xml'))
  // Dirent.parentPath only exists from Node 20.12; engines allows 20.11, which has `path`.
  .map(entry => join(entry.parentPath ?? (entry as { path?: string }).path ?? CDAR_DIR, entry.name))
  .sort()
  .map(file => ({ file, name: relative(CDAR_DIR, file) }))

const RECUE = join(CDAR_DIR, '_Cas Nominal/UC1_F202500003_02-CDV-202_Recue.xml')

describe('cDAR lifecycle messages (was CG-20)', () => {
  it('finds the 11 Annex B CDAR examples', () => {
    expect(examples).toHaveLength(11)
  })

  it.each(examples)('$name passes the CDAR XSD and BR-FR-CDV with no finding', async ({ file }) => {
    const result = await validateCdar({ xml: await readFile(file) })
    expect(result.errors).toEqual([])
    expect(result.schematronErrors).toEqual([])
    expect(result.schematronWarnings).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('accepts a string with a BOM', async () => {
    const xml = await readFile(RECUE, 'utf8')
    expect(xml.charCodeAt(0)).toBe(0xFEFF)
    await expect(validateCdar({ xml })).resolves.toMatchObject({ valid: true })
  })

  it('reports a fatal rule as an error, with the rule as id', async () => {
    const xml = (await readFile(RECUE, 'utf8')).replace('<ram:TypeCode>305</ram:TypeCode>  <!-- MDT-77', '<ram:TypeCode>999</ram:TypeCode>  <!-- MDT-77')
    const result = await validateCdar({ xml })
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([])
    expect(result.schematronErrors.map(e => [e.id, e.assertId])).toEqual([['BR-FR-CDV-09', 'BR-FR-CDV-09_MDT-77']])
  })

  // The standard variant flags BR-FR-CDV-CL-06 (MDT-105/115 status codes) and BR-FR-CDV-13_MDT-129-2
  // `warning`: upstream's choice, kept as shipped.
  it('reports a warning rule as a warning, and as an error with warningsAsErrors', async () => {
    const xml = (await readFile(RECUE, 'utf8')).replace('<ram:ProcessConditionCode>202<', '<ram:ProcessConditionCode>999<')
    const result = await validateCdar({ xml })
    expect(result.valid).toBe(true)
    expect(result.schematronWarnings.map(e => e.id)).toEqual(['BR-FR-CDV-CL-06'])
    const strict = await validateCdar({ xml, warningsAsErrors: true })
    expect(strict.valid).toBe(false)
    expect(strict.schematronErrors.map(e => e.assertId)).toEqual(['BR-FR-CDV-CL-06_MDT-105'])
  })

  it('reports XSD errors', async () => {
    const xml = (await readFile(RECUE, 'utf8')).replace('<ram:ProcessConditionCode>', '<ram:Bogus/><ram:ProcessConditionCode>')
    const result = await validateCdar({ xml })
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('Bogus')
  })

  it('throws for a document that is not a CDAR message', async () => {
    const invoice = await readFile(resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.xml'), 'utf8')
    await expect(validateCdar({ xml: invoice })).rejects.toThrow('Not a CDAR lifecycle message')
  })

  // CG-34: the published BR-FR-CDV Schematron cannot fail on some Annex A rules (its rule context is
  // the element itself, or a second rule with the same context never fires). Run as shipped; pinned
  // here so a fixed upstream release shows up as a failing test.
  it.each([
    ['BR-FR-CDV-04 (ExchangedDocument/IssueDateTime, MDG-4)', (xml: string) => xml.replace(/(<rsm:ExchangedDocument>[\s\S]*?)<ram:IssueDateTime>[\s\S]*?<\/ram:IssueDateTime>/, '$1')],
    ['BR-FR-CDV-10 (IssuerAssignedID, MDT-87)', (xml: string) => xml.replace(/<ram:IssuerAssignedID>[^<]*<\/ram:IssuerAssignedID>/, '')],
    ['BR-FR-CDV-13 (ReferenceReferencedDocument/IssuerTradeParty, MDT-129)', (xml: string) => xml.replace(/(<ram:ReferenceReferencedDocument>[\s\S]*?)<ram:IssuerTradeParty>[\s\S]*?<\/ram:IssuerTradeParty>/, '$1')],
  ])('accepts, as a documented gap (CG-34), a message missing what %s requires', async (_, mutate) => {
    const original = await readFile(RECUE, 'utf8')
    const xml = mutate(original)
    expect(xml).not.toBe(original)
    const result = await validateCdar({ xml })
    expect(result.valid).toBe(true)
  })

  // CG-34, the other upstream cases, each with a control showing the rule does run. Pinned as
  // shipped, so a fixed upstream release shows up as a failing test.
  describe('documented gaps (CG-34) vs Annex A', () => {
    const LITIGE = join(CDAR_DIR, '_Statut avec MOTIF/UC4_F202500006_04-CDV-207_En_litige.xml')
    const PPF = join(CDAR_DIR, '_Cas Nominal/UC1_F202500003_01-CDV-200_Deposee_POUR_PPF.xml')
    const ids = async (file: string, mutate: (xml: string) => string): Promise<{ valid: boolean, errors: (string | undefined)[] }> => {
      const original = await readFile(file, 'utf8')
      const xml = mutate(original)
      expect(xml).not.toBe(original)
      const result = await validateCdar({ xml })
      return { valid: result.valid, errors: result.schematronErrors.map(e => e.assertId) }
    }
    const b2g210 = (xml: string): string => xml
      .replaceAll('<ram:ProcessConditionCode>207</ram:ProcessConditionCode>', '<ram:ProcessConditionCode>210</ram:ProcessConditionCode>')
      .replace('<ram:SenderTradeParty>\n', '<ram:SenderTradeParty>\n               <ram:GlobalID schemeID="0238">9999</ram:GlobalID>\n')

    it('bR-FR-CDV-07: MDT-77 = 305 with an issuer MDT-38 and no DFH recipient passes', async () => {
      expect(await ids(RECUE, xml => xml.replace('<ram:IssuerTradeParty>\n               <ram:RoleCode>WK</ram:RoleCode>', '<ram:IssuerTradeParty>\n               <ram:GlobalID schemeID="0002">200000008</ram:GlobalID>\n               <ram:RoleCode>WK</ram:RoleCode>')))
        .toEqual({ valid: true, errors: [] })
    })

    it('bR-FR-CDV-09: a missing MDT-77 is rejected, but by other rules, never as BR-FR-CDV-09', async () => {
      expect(await ids(RECUE, xml => xml.replace(/<ram:TypeCode>305<\/ram:TypeCode>\s*<!-- MDT-77[^>]*-->/, '')))
        .toEqual({ valid: false, errors: ['BR-FR-CDV-07_MDT-38_yes', 'BR-FR-CDV-CL-05_MDT-88_23'] })
    })

    it('bR-FR-CDV-CL-09 (207): DEST_INC passes although Annex A does not allow it for EN LITIGE; an unknown code fails', async () => {
      expect(await ids(LITIGE, xml => xml.replace('<ram:ReasonCode>TX_TVA_ERR</ram:ReasonCode>', '<ram:ReasonCode>DEST_INC</ram:ReasonCode>')))
        .toEqual({ valid: true, errors: [] })
      expect(await ids(LITIGE, xml => xml.replace('<ram:ReasonCode>TX_TVA_ERR</ram:ReasonCode>', '<ram:ReasonCode>XXX_INC</ram:ReasonCode>')))
        .toEqual({ valid: false, errors: ['BR-FR-CDV-CL-09_MDT-113', 'BR-FR-CDV-CL-09_MDT-113_207'] })
    })

    it('bR-FR-CDV-CL-09 (210 B2G): CONTACT_ACHTR fails although Annex A allows it; AUTRE passes', async () => {
      expect(await ids(LITIGE, xml => b2g210(xml).replace('<ram:ReasonCode>TX_TVA_ERR</ram:ReasonCode>', '<ram:ReasonCode>CONTACT_ACHTR</ram:ReasonCode>')))
        .toEqual({ valid: false, errors: ['BR-FR-CDV-CL-09_MDT-113_210B2G'] })
      expect(await ids(LITIGE, xml => b2g210(xml).replace('<ram:ReasonCode>TX_TVA_ERR</ram:ReasonCode>', '<ram:ReasonCode>AUTRE</ram:ReasonCode>')))
        .toEqual({ valid: true, errors: [] })
    })

    it('bR-FR-CDV-CL-04: DFH passes for MDT-59 although the Annex A list lacks it; an unknown role fails', async () => {
      expect(await ids(RECUE, xml => xml.replace('<ram:RoleCode>SE</ram:RoleCode>  <!-- MDT-59 ', '<ram:RoleCode>DFH</ram:RoleCode>  <!-- MDT-59 ')))
        .toEqual({ valid: true, errors: [] })
      expect(await ids(RECUE, xml => xml.replace('<ram:RoleCode>SE</ram:RoleCode>  <!-- MDT-59 ', '<ram:RoleCode>XXX</ram:RoleCode>  <!-- MDT-59 ')))
        .toEqual({ valid: false, errors: ['BR-FR-CDV-CL-04_MDT-59'] })
    })

    it('bR-FR-CDV-02: a CDV for the PPF passes with MDT-3 = CDV:invoice, where Annex A requires CDV:einvoicingF2', async () => {
      expect(await ids(PPF, xml => xml.replace('<ram:ID>urn.cpro.gouv.fr:1p0:CDV:einvoicingF2</ram:ID>', '<ram:ID>urn.cpro.gouv.fr:1p0:CDV:invoice</ram:ID>')))
        .toEqual({ valid: true, errors: [] })
    })
  })
})
