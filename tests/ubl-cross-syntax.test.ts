import type { Invoice } from '@stafyniaksacha/facturx/en16931'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { en16931ToXml, fromCii, invoiceToUbl, invoiceToXml, toCii, ublToInvoice, xmlToEn16931, xmlToInvoice } from '@stafyniaksacha/facturx'
import { XmlDocument } from 'libxml2-wasm'
import { describe, expect, it } from 'vitest'
import { getBasicWLFacturXModel } from './fixtures/model-basicwl'
import { getMinimumXML, getOrderXBasicXML } from './fixtures/xml'

const CDAR_RECUE = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Cycle de Vie - CDAR/_Cas Nominal/UC1_F202500003_02-CDV-202_Recue.xml')
const FACTURES = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures')

type Level = 'en16931' | 'extended-ctc-fr'

/** A model value `invoiceToUbl()` refuses: the CII → UBL round trip asserts the refusal, then clears it. */
interface Refusal {
  term: RegExp
  cg: string
  clear: (invoice: Invoice) => void
}

const SELLER_DEPARTMENT: Refusal = {
  term: /BT-41-0/,
  cg: 'CG-59',
  clear: (i) => {
    i.seller.contact!.departmentName = undefined
  },
}
const BUYER_DEPARTMENT: Refusal = {
  term: /BT-56-0/,
  cg: 'CG-59',
  clear: (i) => {
    i.buyer.contact!.departmentName = undefined
  },
}
const GRAND_TOTAL: Refusal = {
  term: /EXT-FR-FE-184/,
  cg: 'CG-60',
  clear: (i) => {
    for (const line of i.lines)
      line.grandTotalAmount = undefined
  },
}
const CARD: Refusal = {
  term: /BG-18/,
  cg: 'CG-61',
  clear: (i) => {
    i.paymentInstructions!.card = undefined
  },
}
const DEPARTMENTS = [SELLER_DEPARTMENT, BUYER_DEPARTMENT]

interface Twin {
  name: string
  level: Level
  ubl: string
  cii: string
  /** What `invoiceToUbl()` refuses in the model read from the CII twin, in the order it throws. */
  refused: Refusal[]
  /** CG-63: the UBL twin leaves out the schemeless seller identifier (BT-29) and deliver-to location (BT-71). */
  privateIds?: true
}

const TWINS: Twin[] = [
  { name: 'F202500001', level: 'en16931', ubl: 'F202500001/_EN16931/F202500001_INV_20250201_EN16931_UBL_Commentee.xml', cii: 'F202500001/_EN16931/F202500001_INV_20250201_CII_EN16931_FX_CII_Commentee.xml', refused: [BUYER_DEPARTMENT], privateIds: true },
  { name: 'UC1', level: 'en16931', ubl: 'F202500003/_EN16931/UC1_F202500003_00-INV_20250701_EN16931_UBL_Commentee.xml', cii: 'F202500003/_EN16931/UC1_F202500003_00-INV_20250701_EN16931_FX_CII_Commentee.xml', refused: DEPARTMENTS },
  { name: 'UC4', level: 'en16931', ubl: 'Facture et Facture Rectificative/UC4_F202500006_00-INV_20250701_EN16931_UBL_Commentee.xml', cii: 'Facture et Facture Rectificative/UC4_F202500006_00-INV_20250701_EN16931_FX_CII_Commentee.xml', refused: DEPARTMENTS },
  { name: 'UC4b', level: 'en16931', ubl: 'Facture et Facture Rectificative/UC4b_F202500010_00-INVCORR_20250702_EN16931_UBL_Commentee.xml', cii: 'Facture et Facture Rectificative/UC4b_F202500010_00-INVCORR_20250702_EN16931_FX_CII_Commentee.xml', refused: DEPARTMENTS },
  { name: 'UC5', level: 'en16931', ubl: 'Facture et Avoir/UC5_F202500007_00-INV_20250702_EN16931_UBL_Commentee.xml', cii: 'Facture et Avoir/UC5_F202500007_00-INV_20250702_EN16931_FX_CII_Commentee.xml', refused: DEPARTMENTS },
  { name: 'UC5b', level: 'en16931', ubl: 'Facture et Avoir/UC5b_F202500011_00-CN_20250703_EN16931_UBL_Commentee.xml', cii: 'Facture et Avoir/UC5b_F202500011_00-CN_20250703_EN16931_FX_CII_Commentee.xml', refused: DEPARTMENTS },
  { name: 'F202500001', level: 'extended-ctc-fr', ubl: 'F202500001/_EXTENDED-CTC-FR/F202500001_INV_20250201_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'F202500001/_EXTENDED-CTC-FR/F202500001_INV_20250201_EXTENDED-CTC-FR_CII_Commentee.xml', refused: [BUYER_DEPARTMENT], privateIds: true },
  { name: 'UC1', level: 'extended-ctc-fr', ubl: 'F202500003/_EXTENDED/UC1_F202500003_00-INV_20250701_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'F202500003/_EXTENDED/UC1_F202500003_00-INV_20250701_EXTENDED-CTC-FR_CII_Commentee.xml', refused: DEPARTMENTS },
  { name: 'UC10', level: 'extended-ctc-fr', ubl: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Multi-Vendeur/UC10_F202600004_MULTI-VENDEUR_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Multi-Vendeur/UC10_F202600004_MULTI-VENDEUR_EXTENDED-CTC-FR_CII_Commentee.xml', refused: [...DEPARTMENTS, GRAND_TOTAL, CARD] },
  { name: 'UC11', level: 'extended-ctc-fr', ubl: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Multi-Vendeur/UC11_F202600022_MULTI-VENDEUR_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Multi-Vendeur/UC11_F202600022_MULTI-VENDEUR_EXTENDED-CTC-FR_CII_Commentee.xml', refused: [...DEPARTMENTS, GRAND_TOTAL] },
  { name: 'UC12', level: 'extended-ctc-fr', ubl: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Sous-ligne/UC12_F202600025_SOUS-LIGNE_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Sous-ligne/UC12_F202600025_SOUS-LIGNE_EXTENDED-CTC-FR_CII_Commentee.xml', refused: DEPARTMENTS },
  { name: 'UC13', level: 'extended-ctc-fr', ubl: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Bidirectionnelle/UC13_AUTOF202600035_BIDIRECTIONNELLE_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Bidirectionnelle/UC13_AUTOF202600035_BIDIRECTIONNELLE_EXTENDED-CTC-FR_CII_Commentee.xml', refused: [SELLER_DEPARTMENT, GRAND_TOTAL] },
]

/**
 * A genuine difference between the UBL and the CII publication of one annex B invoice: `path` (a path of the JSON
 * model) holds a value on `side` that the other side lacks or holds differently. Each row is a `CONFORMANCE.md`
 * entry. The comparison expects exactly these paths, both ways, so a row that no longer differs fails too.
 */
interface KnownDifference {
  case: `${string} ${Level}`
  side: 'cii' | 'ubl'
  path: string
  cg: string
  reason: string
}

const SELLER_DEP = '.seller.contact.departmentName'
const BUYER_DEP = '.buyer.contact.departmentName'
function department(c: KnownDifference['case'], path: string): KnownDifference {
  return { case: c, side: 'cii', path, cg: 'CG-59', reason: 'contact department name (BT-41-0 / BT-56-0): no UBL element; the UBL twin leaves it out' }
}
function departments(c: KnownDifference['case']): KnownDifference[] {
  return [department(c, SELLER_DEP), department(c, BUYER_DEP)]
}
function grandTotal(c: KnownDifference['case'], line: number): KnownDifference {
  return { case: c, side: 'cii', path: `.lines.${line}.grandTotalAmount`, cg: 'CG-60', reason: 'line grand total (EXT-FR-FE-184): no UBL element; the UBL twin leaves it out' }
}
// CG-71: the F202500001 twins differ in two item details at both levels.
function f202500001(level: Level): KnownDifference[] {
  return [
    { case: `F202500001 ${level}`, side: 'cii', path: '.lines.2.item.attributes.1.name', cg: 'CG-71', reason: 'the UBL twin lacks the second item attribute of line 3' },
    { case: `F202500001 ${level}`, side: 'cii', path: '.lines.2.item.attributes.1.value', cg: 'CG-71', reason: 'the UBL twin lacks the second item attribute of line 3' },
    { case: `F202500001 ${level}`, side: 'ubl', path: '.lines.1.item.classifications.0.listVersionId', cg: 'CG-71', reason: 'the UBL twin adds listVersionID to the item classification of line 2' },
  ]
}

const KNOWN_DIFFERENCES: KnownDifference[] = [
  department('F202500001 en16931', BUYER_DEP),
  { case: 'F202500001 en16931', side: 'cii', path: '.lines.1.notes.0.note', cg: 'CG-70', reason: 'the UBL line note starts with #BLU#, read verbatim as BT-127 at en16931; the CII note is the text alone' },
  { case: 'F202500001 en16931', side: 'ubl', path: '.lines.1.notes.0.note', cg: 'CG-70', reason: 'the UBL line note starts with #BLU#, read verbatim as BT-127 at en16931; the CII note is the text alone' },
  ...f202500001('en16931'),
  ...['UC1', 'UC4', 'UC4b', 'UC5', 'UC5b'].flatMap(n => departments(`${n} en16931`)),
  department('F202500001 extended-ctc-fr', BUYER_DEP),
  { case: 'F202500001 extended-ctc-fr', side: 'cii', path: '.charges.2.vatExemptionReason', cg: 'CG-45', reason: 'the UBL K charge lacks the exemption reason its CII twin carries' },
  { case: 'F202500001 extended-ctc-fr', side: 'cii', path: '.charges.2.vatExemptionReasonCode', cg: 'CG-45', reason: 'the UBL K charge lacks the exemption reason code its CII twin carries' },
  ...f202500001('extended-ctc-fr'),
  ...departments('UC1 extended-ctc-fr'),
  ...departments('UC10 extended-ctc-fr'),
  { case: 'UC10 extended-ctc-fr', side: 'cii', path: '.paymentInstructions.card.primaryAccountNumber', cg: 'CG-61', reason: 'the UBL twin writes another card primary account number (and invents a network id)' },
  { case: 'UC10 extended-ctc-fr', side: 'ubl', path: '.paymentInstructions.card.primaryAccountNumber', cg: 'CG-61', reason: 'the UBL twin writes another card primary account number (and invents a network id)' },
  grandTotal('UC10 extended-ctc-fr', 0),
  grandTotal('UC10 extended-ctc-fr', 3),
  ...departments('UC11 extended-ctc-fr'),
  grandTotal('UC11 extended-ctc-fr', 0),
  grandTotal('UC11 extended-ctc-fr', 4),
  ...departments('UC12 extended-ctc-fr'),
  department('UC13 extended-ctc-fr', SELLER_DEP),
  grandTotal('UC13 extended-ctc-fr', 0),
  grandTotal('UC13 extended-ctc-fr', 2),
]

const caseOf = (twin: Twin): KnownDifference['case'] => `${twin.name} ${twin.level}`

/**
 * Normalisations of the CII side that are not differences of content (each a `CONFORMANCE.md` entry):
 * - CG-62: UBL has one `cbc:BaseQuantity`; a CII BT-149-1 / BT-150-1 equal to BT-149 / BT-150 reads back as absent.
 */
function normaliseBaseQuantities(invoice: Invoice): void {
  for (const line of invoice.lines) {
    if (line.price && line.price.grossPriceBaseQuantity === line.price.priceBaseQuantity) {
      line.price.grossPriceBaseQuantity = undefined
      line.price.grossPriceBaseQuantityUnitCode = undefined
    }
  }
}

/** Paths of a JSON model where `a` holds a value `b` does not (undefined and empty arrays are no value). */
function modelOnly(a: unknown, b: unknown, path = '', out: string[] = []): string[] {
  if (a === undefined || a === null || (Array.isArray(a) && a.length === 0))
    return out
  if (typeof a === 'object') {
    for (const [key, value] of Object.entries(a as object))
      modelOnly(value, typeof b === 'object' && b !== null ? (b as Record<string, unknown>)[key] : undefined, `${path}.${key}`, out)
    return out
  }
  if (a !== b)
    out.push(path)
  return out
}

const json = (invoice: Invoice): unknown => JSON.parse(JSON.stringify(invoice))
const readTwin = (file: string): Promise<string> => readFile(resolve(FACTURES, file), 'utf8')

describe('cross-syntax: annex B UBL and CII publications of the same invoice', () => {
  it('covers every annex B UBL example, each with its CII twin', () => {
    const found = execFileSync('find', [FACTURES, '-name', '*UBL*.xml']).toString().trim().split('\n').map(f => f.slice(FACTURES.length + 1)).sort()
    expect(TWINS.map(t => t.ubl).sort()).toEqual(found)
  })

  it('lists every known difference under a twin and a CONFORMANCE.md entry', async () => {
    const register = await readFile(resolve(import.meta.dirname, '../CONFORMANCE.md'), 'utf8')
    const cases = new Set(TWINS.map(caseOf))
    for (const row of KNOWN_DIFFERENCES) {
      expect(cases).toContain(row.case)
      expect(register).toContain(`### ${row.cg} `)
    }
  })

  it.each(TWINS)('$name ($level): the UBL and CII publications give the same model but for KNOWN_DIFFERENCES', async (twin) => {
    const ubl = (await ublToInvoice(await readTwin(twin.ubl))).invoice
    const cii = fromCii(await xmlToInvoice(await readTwin(twin.cii))).invoice
    normaliseBaseQuantities(cii)
    if (twin.privateIds) {
      // CG-63: BR-FR-CO-10 (UBL) wants a scheme on these identifiers; the UBL twins leave the schemeless ones out.
      const before = cii.seller.identifiers.length
      cii.seller.identifiers = cii.seller.identifiers.filter(i => i.schemeId !== undefined)
      expect(cii.seller.identifiers.length).toBeLessThan(before)
      expect(cii.delivery?.locationIdentifier?.schemeId).toBeUndefined()
      expect(cii.delivery?.locationIdentifier?.value).toBeTruthy()
      cii.delivery!.locationIdentifier = undefined
    }
    const known = KNOWN_DIFFERENCES.filter(d => d.case === caseOf(twin))
    expect(modelOnly(json(cii), json(ubl)).sort()).toEqual(known.filter(d => d.side === 'cii').map(d => d.path).sort())
    expect(modelOnly(json(ubl), json(cii)).sort()).toEqual(known.filter(d => d.side === 'ubl').map(d => d.path).sort())
  })
})

describe('cross-syntax: CII → model → UBL → model', () => {
  it.each(TWINS)('$name ($level): converts the CII twin to UBL and back to the same invoice', async (twin) => {
    const read = await xmlToEn16931(await readTwin(twin.cii))
    expect(read.syntax).toBe('cii')
    expect(read.dropped).toEqual([])
    const { invoice } = read
    // Listed, never skipped: each value UBL cannot carry is refused, naming the term, before it is cleared.
    for (const refusal of twin.refused) {
      await expect(en16931ToXml(invoice, { syntax: 'ubl', level: twin.level })).rejects.toThrow(refusal.term)
      refusal.clear(invoice)
    }
    const doc = await en16931ToXml(invoice, { syntax: 'ubl', level: twin.level })
    let xml: string
    try {
      xml = doc.toString()
    }
    finally {
      doc.dispose()
    }
    const again = await xmlToEn16931(xml)
    expect(again.syntax).toBe('ubl')
    expect(again.dropped).toEqual([])
    normaliseBaseQuantities(invoice) // CG-62
    expect(again.invoice).toEqual(invoice)
  })

  it('refuses a Factur-X EXTENDED BT-24 in UBL: the caller clears it to get the UBL level id', async () => {
    const { invoice } = await xmlToEn16931(await readTwin('F202500003/_EXTENDED/UC1_F202500003_00-INV_20250701_EXTENDED_FX_CII_Commentee.xml'))
    DEPARTMENTS.forEach(r => r.clear(invoice))
    await expect(en16931ToXml(invoice, { syntax: 'ubl', level: 'extended-ctc-fr' })).rejects.toThrow(/BT-24/)
    invoice.specificationIdentifier = undefined
    const doc = await en16931ToXml(invoice, { syntax: 'ubl', level: 'extended-ctc-fr' })
    try {
      expect(doc.toString()).toContain('<cbc:CustomizationID>urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr</cbc:CustomizationID>')
    }
    finally {
      doc.dispose()
    }
  })
})

describe('en16931ToXml', () => {
  const uc1 = TWINS.find(t => t.name === 'UC1' && t.level === 'en16931')!

  it('writes CII exactly as invoiceToXml(toCii())', async () => {
    const { invoice } = await xmlToEn16931(await readTwin(uc1.cii))
    const a = await en16931ToXml(invoice, { syntax: 'cii', level: 'en16931' })
    const b = await invoiceToXml(toCii(invoice, { level: 'en16931' }))
    try {
      expect(a.toString()).toBe(b.toString())
    }
    finally {
      a.dispose()
      b.dispose()
    }
  })

  it.each(['basic', 'extended'] as const)('refuses UBL at level %s, naming the UBL levels', async (level) => {
    const { invoice } = await xmlToEn16931(await readTwin(uc1.ubl))
    // The options type refuses it at compile time; the runtime check covers JavaScript callers.
    await expect(en16931ToXml(invoice, { syntax: 'ubl', level: level as 'en16931' })).rejects.toThrow(/"en16931", "extended-ctc-fr"/)
  })

  it('passes root through to invoiceToUbl (UBL only)', async () => {
    const { invoice } = await xmlToEn16931(await readTwin(uc1.ubl))
    for (const root of ['Invoice', 'CreditNote'] as const) {
      // `81` is in the invoice and the credit note lists of BR-CL-01, so both roots accept it.
      invoice.typeCode = '81'
      const [a, b] = [await en16931ToXml(invoice, { syntax: 'ubl', level: 'en16931', root }), await invoiceToUbl(invoice, { level: 'en16931', root })]
      try {
        expect(a.root.name).toBe(root)
        expect(a.toString()).toBe(b.toString())
      }
      finally {
        a.dispose()
        b.dispose()
      }
    }
  })

  it('refuses an unknown syntax', async () => {
    const { invoice } = await xmlToEn16931(await readTwin(uc1.ubl))
    await expect(en16931ToXml(invoice, { syntax: 'pdf' as 'cii', level: 'en16931' })).rejects.toThrow(/syntax/)
  })
})

describe('xmlToEn16931', () => {
  const uc1 = TWINS.find(t => t.name === 'UC1' && t.level === 'en16931')!

  it('reads CII as fromCii(xmlToInvoice()) and UBL as ublToInvoice(), from a string or a Buffer', async () => {
    const ciiXml = await readTwin(uc1.cii)
    const ublXml = await readTwin(uc1.ubl)
    const cii = await xmlToEn16931(Buffer.from(ciiXml))
    expect(cii).toEqual({ ...fromCii(await xmlToInvoice(ciiXml)), syntax: 'cii' })
    const ubl = await xmlToEn16931(ublXml)
    expect(ubl).toEqual({ ...await ublToInvoice(ublXml), syntax: 'ubl' })
  })

  it.each(['cii', 'ubl'] as const)('never disposes an XmlDocument the caller passes (%s), also when it throws', async (syntax) => {
    const doc = XmlDocument.fromString(await readTwin(syntax === 'cii' ? uc1.cii : uc1.ubl))
    try {
      const { invoice } = await xmlToEn16931(doc)
      expect(invoice.number).toBeTruthy()
      expect(doc.root.name).toMatch(/CrossIndustryInvoice|Invoice/)
    }
    finally {
      doc.dispose()
    }
    const order = XmlDocument.fromString(getOrderXBasicXML())
    try {
      await expect(xmlToEn16931(order)).rejects.toThrow(/orderx/)
      expect(order.root.name).toBe('SCRDMCCBDACIOMessageStructure')
    }
    finally {
      order.dispose()
    }
  })

  it('rejects Order-X, naming only the flavor', async () => {
    await expect(xmlToEn16931(getOrderXBasicXML())).rejects.toThrow(/"orderx" document is not an invoice the EN 16931 model reads/)
  })

  it('rejects ZUGFeRD 1.0 and unrecognised roots', async () => {
    await expect(xmlToEn16931('<rsm:CrossIndustryDocument xmlns:rsm="urn:ferd:CrossIndustryDocument:invoice:1p0"/>')).rejects.toThrow(/"zugferd" document/)
    await expect(xmlToEn16931('<Other/>')).rejects.toThrow(/not recognized/)
  })

  it('keeps the fromCii() refusal of MINIMUM (not an EN 16931 invoice)', async () => {
    await expect(xmlToEn16931(getMinimumXML())).rejects.toThrow(/fromCii: a "minimum" document is not an EN 16931 invoice/)
  })

  it('keeps the fromCii() refusal of BASIC WL (not an EN 16931 invoice)', async () => {
    const doc = await invoiceToXml(getBasicWLFacturXModel())
    let xml: string
    try {
      xml = doc.toString()
    }
    finally {
      doc.dispose()
    }
    await expect(xmlToEn16931(xml)).rejects.toThrow(/fromCii: a "basicwl" document is not an EN 16931 invoice/)
  })

  it('rejects a CDAR lifecycle message (not an invoice)', async () => {
    await expect(xmlToEn16931(await readFile(CDAR_RECUE))).rejects.toThrow(/not recognized/)
  })

  it('refuses a UBL DOCTYPE', async () => {
    const xml = (await readTwin(uc1.ubl)).replace(/^<\?xml[^>]*\?>\s*/, '').replace('<Invoice ', '<!DOCTYPE Invoice>\n<Invoice ')
    await expect(xmlToEn16931(xml)).rejects.toThrow(/DOCTYPE/)
  })

  it('refuses a CII DOCTYPE whose internal entity hides BT-10, which xmlToInvoice alone misses (CG-73)', async () => {
    const ram = 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100'
    const xml = (await readTwin(uc1.cii))
      .replace(/<ram:BuyerReference>[^<]*<\/ram:BuyerReference>/, '&br;')
      .replace('<rsm:CrossIndustryInvoice ', `<!DOCTYPE rsm:CrossIndustryInvoice [<!ENTITY br "<ram:BuyerReference xmlns:ram='${ram}'>BR-X</ram:BuyerReference>">]>\n<rsm:CrossIndustryInvoice `)
    // xmlToInvoice() / fromCii() stay unchanged (CG-73, open): BT-10 is silently missing there.
    expect(fromCii(await xmlToInvoice(xml)).invoice.buyerReference).toBeUndefined()
    await expect(xmlToEn16931(xml)).rejects.toThrow(/^xmlToEn16931: the document has a DOCTYPE/)
    const doc = XmlDocument.fromString(xml)
    try {
      await expect(xmlToEn16931(doc)).rejects.toThrow(/DOCTYPE/)
      expect(doc.root.name).toBe('CrossIndustryInvoice')
    }
    finally {
      doc.dispose()
    }
  })

  it('accepts comments around the root, refuses a processing instruction before it (fail-closed DOCTYPE check)', async () => {
    const ubl = await readTwin(uc1.ubl)
    expect((await xmlToEn16931(`${ubl.replace('<Invoice ', '<!-- before -->\n<Invoice ')}\n<!-- after --><?after pi?>`)).syntax).toBe('ubl')
    const pi = ubl.replace('<Invoice ', '<?xml-stylesheet href="x.xsl"?>\n<Invoice ')
    await expect(xmlToEn16931(pi)).rejects.toThrow(/DOCTYPE/)
    await expect(ublToInvoice(pi)).rejects.toThrow(/DOCTYPE/)
  })
})

describe('bT-24 to level differs between CII and UBL (CG-75, pinned, open)', () => {
  const uc1 = TWINS.find(t => t.name === 'UC1' && t.level === 'en16931')!
  const conformant = 'urn:cen.eu:en16931:2017#conformant#urn.example.org_ext'
  const peppol = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0'
  const cii = async (id: string): Promise<string> => (await readTwin(uc1.cii)).replace(/(<ram:GuidelineSpecifiedDocumentContextParameter>\s*<ram:ID>)[^<]*</, `$1${id}<`)
  const ubl = async (id: string): Promise<string> => (await readTwin(uc1.ubl)).replace(/<cbc:CustomizationID>[^<]*</, `<cbc:CustomizationID>${id}<`)

  it('cII reads the last `:` segments: a #conformant# extension id reads as en16931, a Peppol #compliant# id is refused', async () => {
    const { invoice } = fromCii(await xmlToInvoice(await cii(conformant)))
    expect(invoice.specificationIdentifier).toBe(conformant)
    await expect(xmlToInvoice(await cii(peppol)).then(fromCii)).rejects.toThrow(/BT-24/)
  })

  it('uBL reads the exact id: a #compliant# CIUS reads as en16931, a #conformant# extension is refused', async () => {
    expect((await ublToInvoice(await ubl(peppol))).invoice.specificationIdentifier).toBe(peppol)
    await expect(ublToInvoice(await ubl(conformant))).rejects.toThrow(/BT-24/)
  })

  it('both writers refuse the foreign BT-24, so nothing is written under it', async () => {
    const { invoice } = fromCii(await xmlToInvoice(await cii(conformant)))
    expect(() => toCii(invoice, { level: 'en16931' })).toThrow(/BT-24/)
    DEPARTMENTS.forEach(r => r.clear(invoice))
    await expect(invoiceToUbl(invoice, { level: 'en16931' })).rejects.toThrow(/BT-24/)
  })
})
