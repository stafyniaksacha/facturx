import type { Invoice } from '@stafyniaksacha/facturx/en16931'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { check, fromCii, xmlToInvoice } from '@stafyniaksacha/facturx'
import { XmlDocument, XmlElement } from 'libxml2-wasm'
import { describe, expect, it } from 'vitest'
import { invoiceToUbl } from '../src/lib/converters/ubl'
import { ublToInvoice } from '../src/lib/parsers/ubl'

const FACTURES = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures')

/**
 * A model value `invoiceToUbl()` refuses, held by an annex B UBL source: its round trip is checked with the value
 * cleared, after asserting the refusal (never skipped silently).
 */
interface Unwritable {
  term: RegExp
  cg: string
  clear: (invoice: Invoice) => void
}

const CARD: Unwritable = {
  term: /BG-18/,
  cg: 'CG-61',
  clear: (i) => {
    i.paymentInstructions!.card = undefined
  },
}
// Annex B writes the EXTENDED-CTC-FR line note subject code `#BLU#` in an EN 16931 document (CG-70).
const LINE_NOTE_SUBJECT: Unwritable = {
  term: /EXT-FR-FE-183/,
  cg: 'CG-70',
  clear: (i) => {
    for (const note of i.lines.flatMap(l => l.notes))
      note.subjectCode = undefined
  },
}

interface Example {
  name: string
  level: 'en16931' | 'extended-ctc-fr'
  ubl: string
  cii: string
  /** What `ublToInvoice()` reports in `dropped` for the source, with the reason. */
  dropped: string[]
  unwritable?: Unwritable
  /**
   * Model terms of the CII twin the UBL source does not hold (`fromCii` vs `ublToInvoice`), as paths of the JSON
   * model, each explained in CONFORMANCE.md. Compared after removing CG-62 (BT-149-1 equal to BT-149, one UBL
   * `cbc:BaseQuantity`) and CG-63 (schemeless BT-29 / BT-71 the UBL twins leave out) from the CII side.
   */
  twinOnly: string[]
  /** Model terms the UBL source holds that its CII twin does not. */
  ublOnly?: string[]
  privateIds?: true
}

// CG-59: the CII twins carry contact department names UBL has no element for.
const SELLER_DEP = '.seller.contact.departmentName'
const BUYER_DEP = '.buyer.contact.departmentName'
const DEPS = [SELLER_DEP, BUYER_DEP]
// CG-71: annex B F202500001 twins disagree on two item details.
const F202500001_CONTENT = { twinOnly: ['.lines.2.item.attributes.1.name', '.lines.2.item.attributes.1.value'], ublOnly: ['.lines.1.item.classifications.0.listVersionId'] }

const EXAMPLES: Example[] = [
  { name: 'F202500001', level: 'en16931', ubl: 'F202500001/_EN16931/F202500001_INV_20250201_EN16931_UBL_Commentee.xml', cii: 'F202500001/_EN16931/F202500001_INV_20250201_CII_EN16931_FX_CII_Commentee.xml', dropped: [], unwritable: LINE_NOTE_SUBJECT, privateIds: true, twinOnly: [BUYER_DEP, ...F202500001_CONTENT.twinOnly], ublOnly: [...F202500001_CONTENT.ublOnly, '.lines.1.notes.0.subjectCode'] },
  { name: 'UC1', level: 'en16931', ubl: 'F202500003/_EN16931/UC1_F202500003_00-INV_20250701_EN16931_UBL_Commentee.xml', cii: 'F202500003/_EN16931/UC1_F202500003_00-INV_20250701_EN16931_FX_CII_Commentee.xml', dropped: [], twinOnly: DEPS },
  { name: 'UC4', level: 'en16931', ubl: 'Facture et Facture Rectificative/UC4_F202500006_00-INV_20250701_EN16931_UBL_Commentee.xml', cii: 'Facture et Facture Rectificative/UC4_F202500006_00-INV_20250701_EN16931_FX_CII_Commentee.xml', dropped: [], twinOnly: DEPS },
  { name: 'UC4b', level: 'en16931', ubl: 'Facture et Facture Rectificative/UC4b_F202500010_00-INVCORR_20250702_EN16931_UBL_Commentee.xml', cii: 'Facture et Facture Rectificative/UC4b_F202500010_00-INVCORR_20250702_EN16931_FX_CII_Commentee.xml', dropped: [], twinOnly: DEPS },
  { name: 'UC5', level: 'en16931', ubl: 'Facture et Avoir/UC5_F202500007_00-INV_20250702_EN16931_UBL_Commentee.xml', cii: 'Facture et Avoir/UC5_F202500007_00-INV_20250702_EN16931_FX_CII_Commentee.xml', dropped: [], twinOnly: DEPS },
  { name: 'UC5b', level: 'en16931', ubl: 'Facture et Avoir/UC5b_F202500011_00-CN_20250703_EN16931_UBL_Commentee.xml', cii: 'Facture et Avoir/UC5b_F202500011_00-CN_20250703_EN16931_FX_CII_Commentee.xml', dropped: [], twinOnly: DEPS },
  // CG-45: the source K charge lacks the exemption reason its CII twin carries.
  { name: 'F202500001', level: 'extended-ctc-fr', ubl: 'F202500001/_EXTENDED-CTC-FR/F202500001_INV_20250201_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'F202500001/_EXTENDED-CTC-FR/F202500001_INV_20250201_EXTENDED-CTC-FR_CII_Commentee.xml', dropped: [], privateIds: true, twinOnly: [BUYER_DEP, '.charges.2.vatExemptionReason', '.charges.2.vatExemptionReasonCode', ...F202500001_CONTENT.twinOnly], ublOnly: F202500001_CONTENT.ublOnly },
  { name: 'UC1', level: 'extended-ctc-fr', ubl: 'F202500003/_EXTENDED/UC1_F202500003_00-INV_20250701_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'F202500003/_EXTENDED/UC1_F202500003_00-INV_20250701_EXTENDED-CTC-FR_CII_Commentee.xml', dropped: [], twinOnly: DEPS },
  // CG-61: the card network id has no model place; CG-60: line grand totals.
  { name: 'UC10', level: 'extended-ctc-fr', ubl: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Multi-Vendeur/UC10_F202600004_MULTI-VENDEUR_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Multi-Vendeur/UC10_F202600004_MULTI-VENDEUR_EXTENDED-CTC-FR_CII_Commentee.xml', dropped: ['/Invoice/cac:PaymentMeans/cac:CardAccount/cbc:NetworkID'], unwritable: CARD, twinOnly: [...DEPS, '.paymentInstructions.card.primaryAccountNumber', '.lines.0.grandTotalAmount', '.lines.3.grandTotalAmount'] },
  { name: 'UC11', level: 'extended-ctc-fr', ubl: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Multi-Vendeur/UC11_F202600022_MULTI-VENDEUR_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Multi-Vendeur/UC11_F202600022_MULTI-VENDEUR_EXTENDED-CTC-FR_CII_Commentee.xml', dropped: [], twinOnly: [...DEPS, '.lines.0.grandTotalAmount', '.lines.4.grandTotalAmount'] },
  { name: 'UC12', level: 'extended-ctc-fr', ubl: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Sous-ligne/UC12_F202600025_SOUS-LIGNE_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Sous-ligne/UC12_F202600025_SOUS-LIGNE_EXTENDED-CTC-FR_CII_Commentee.xml', dropped: [], twinOnly: DEPS },
  { name: 'UC13', level: 'extended-ctc-fr', ubl: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Bidirectionnelle/UC13_AUTOF202600035_BIDIRECTIONNELLE_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Bidirectionnelle/UC13_AUTOF202600035_BIDIRECTIONNELLE_EXTENDED-CTC-FR_CII_Commentee.xml', dropped: [], twinOnly: [SELLER_DEP, '.lines.0.grandTotalAmount', '.lines.2.grandTotalAmount'] },
]

const source = (example: Example): Promise<string> => readFile(resolve(FACTURES, example.ubl), 'utf8')

function rootOf(xml: string): 'Invoice' | 'CreditNote' {
  const doc = XmlDocument.fromString(xml)
  try {
    return doc.root.name as 'Invoice' | 'CreditNote'
  }
  finally {
    doc.dispose()
  }
}

async function written(invoice: Invoice, level: Example['level'], root: 'Invoice' | 'CreditNote'): Promise<string> {
  const doc = await invoiceToUbl(invoice, { level, root })
  try {
    return doc.toString()
  }
  finally {
    doc.dispose()
  }
}

/** The model the round trip compares: the source's, with what `invoiceToUbl()` refuses cleared. */
async function writable(example: Example): Promise<Invoice> {
  const { invoice } = await ublToInvoice(await source(example))
  if (example.unwritable)
    example.unwritable.clear(invoice)
  return invoice
}

const ruleId = (finding: { message: string, id?: string }): string => finding.id ?? /^\[([^\]]+)\]/.exec(finding.message)?.[1] ?? finding.message

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

describe('ublToInvoice: annex B UBL examples', () => {
  it('covers the 12 annex B UBL examples', async () => {
    const { execFileSync } = await import('node:child_process')
    const found = execFileSync('find', [FACTURES, '-name', '*UBL*.xml']).toString().trim().split('\n').map(f => f.slice(FACTURES.length + 1)).sort()
    expect(EXAMPLES.map(e => e.ubl).sort()).toEqual(found)
  })

  it.each(EXAMPLES)('$name ($level): dropped lists exactly what the model cannot hold', async (example) => {
    expect((await ublToInvoice(await source(example))).dropped).toEqual(example.dropped)
  })

  it.each(EXAMPLES)('$name ($level): read → write → read gives the same model and nothing dropped', async (example) => {
    const xml = await source(example)
    const root = rootOf(xml)
    const { invoice } = await ublToInvoice(xml)
    if (example.unwritable) {
      // Listed, never skipped: the writer refuses a value the source holds; the rest round-trips.
      await expect(invoiceToUbl(invoice, { level: example.level, root })).rejects.toThrow(example.unwritable.term)
      example.unwritable.clear(invoice)
    }
    const again = await ublToInvoice(await written(invoice, example.level, root))
    expect(again.invoice).toEqual(invoice)
    expect(again.dropped).toEqual([])
  })

  it.each(EXAMPLES)('$name ($level): re-written UBL passes XSD + profile + BR-FR with the source\'s findings', async (example) => {
    const xml = await source(example)
    const rewritten = await written(await writable(example), example.level, rootOf(xml))
    const [before, after] = await Promise.all([xml, rewritten].map(x => check({ xml: x, schematron: true, frCtc: true })))
    expect(after.valid).toBe(true)
    expect(after.schematronErrors).toEqual([])
    expect(after.frCtcErrors).toEqual([])
    expect((after.schematronWarnings ?? []).map(ruleId)).toEqual((before.schematronWarnings ?? []).map(ruleId))
    expect((after.frCtcWarnings ?? []).map(ruleId)).toEqual((before.frCtcWarnings ?? []).map(ruleId))
    // P9 / CG-45: the source K charge lacks its exemption reason; the UBL read from it keeps that warning.
    if (example.name === 'F202500001' && example.level === 'extended-ctc-fr')
      expect((after.schematronWarnings ?? []).map(ruleId)).toContain('BR-FREXT-IC-08rev')
  })

  it.each(EXAMPLES)('$name ($level): the model read from UBL equals the CII twin\'s but for the registered differences', async (example) => {
    const { invoice } = await ublToInvoice(await source(example))
    const twin = fromCii(await xmlToInvoice(await readFile(resolve(FACTURES, example.cii), 'utf8'))).invoice
    for (const line of twin.lines) {
      // CG-62: one UBL `cbc:BaseQuantity`; the CII twins repeat BT-149 / BT-150 as BT-149-1 / BT-150-1.
      if (line.price && line.price.grossPriceBaseQuantity === line.price.priceBaseQuantity) {
        line.price.grossPriceBaseQuantity = undefined
        line.price.grossPriceBaseQuantityUnitCode = undefined
      }
    }
    if (example.privateIds) {
      // CG-63: the UBL twins leave out the schemeless seller and deliver-to identifiers.
      twin.seller.identifiers = twin.seller.identifiers.filter(i => i.schemeId !== undefined)
      twin.delivery!.locationIdentifier = undefined
    }
    expect(modelOnly(json(twin), json(invoice)).sort()).toEqual([...example.twinOnly].sort())
    expect(modelOnly(json(invoice), json(twin)).sort()).toEqual([...(example.ublOnly ?? []), ...(example.unwritable === CARD ? ['.paymentInstructions.card.primaryAccountNumber'] : [])].sort())
  })
})

describe('ublToInvoice: dropped', () => {
  const uc1 = EXAMPLES.find(e => e.name === 'UC1' && e.level === 'en16931')!
  const peppol = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0'

  it('reports UBL elements outside the model in dropped (Peppol BIS id, cbc:IssueTime: XSD-valid, UBL-CR-006 warning)', async () => {
    // `cbc:IssueTime` follows the root `cbc:IssueDate` (the first one) in `InvoiceType`.
    const xml = (await source(uc1))
      .replace(/<cbc:CustomizationID>[^<]*<\/cbc:CustomizationID>/, `<cbc:CustomizationID>${peppol}</cbc:CustomizationID>`)
      .replace('</cbc:IssueDate>', '</cbc:IssueDate><cbc:IssueTime>12:30:00</cbc:IssueTime>')
    expect(xml).toContain('<cbc:IssueTime>12:30:00</cbc:IssueTime>')
    const result = await check({ xml, schematron: true })
    expect(result.valid).toBe(true)
    expect((result.schematronWarnings ?? []).map(ruleId)).toContain('UBL-CR-006')
    const { invoice, dropped } = await ublToInvoice(xml)
    // BT-24 is held by the model (and written back), so only the element outside the model is reported.
    expect(invoice.specificationIdentifier).toBe(peppol)
    expect(dropped).toEqual(['/Invoice/cbc:IssueTime'])
  })

  it('reports a second cac:Delivery (CG-50) and a payment means whose BT-81 differs (CG-51), keeps a further credit transfer', async () => {
    const xml = await source(uc1)
    const delivery = /<cac:Delivery>[\s\S]*?<\/cac:Delivery>/.exec(xml)![0]
    const means = /<cac:PaymentMeans>[\s\S]*?<\/cac:PaymentMeans>/.exec(xml)![0]
    // A further credit transfer as the writer writes it: BT-81 and BT-83 repeated, BT-82 (`@name`) only once (UBL-SR-46).
    const transfer = means.replace(/<cbc:ID>[^<]*<\/cbc:ID>/, '<cbc:ID>FR7630001007941234567890185</cbc:ID>').replace(/<cbc:Name>[^<]*<\/cbc:Name>/, '').replace(/ name="[^"]*"/, '')
    const otherCode = means.replace(/(<cbc:PaymentMeansCode[^>]*>)[^<]*</, '$158<')
    const edited = xml.replace(delivery, `${delivery}${delivery}`).replace(means, `${means}${transfer}${otherCode}`)
    const { invoice, dropped } = await ublToInvoice(edited)
    expect(invoice.paymentInstructions!.creditTransfers.map(t => t.paymentAccountIdentifier)).toHaveLength(2)
    expect(invoice.paymentInstructions!.creditTransfers[1].paymentAccountIdentifier).toBe('FR7630001007941234567890185')
    const address = '/Invoice/cac:Delivery[2]/cac:DeliveryLocation/cac:Address'
    const third = '/Invoice/cac:PaymentMeans[3]'
    expect(dropped).toEqual([
      `${address}/cbc:StreetName`,
      `${address}/cbc:AdditionalStreetName`,
      `${address}/cbc:CityName`,
      `${address}/cbc:PostalZone`,
      `${address}/cac:Country/cbc:IdentificationCode`,
      '/Invoice/cac:Delivery[2]/cac:DeliveryParty/cac:PartyName/cbc:Name',
      `${third}/cbc:PaymentMeansCode/@name`,
      `${third}/cbc:PaymentMeansCode`,
      `${third}/cbc:PaymentID`,
      `${third}/cac:PayeeFinancialAccount/cbc:ID`,
      `${third}/cac:PayeeFinancialAccount/cbc:Name`,
      `${third}/cac:PayeeFinancialAccount/cac:FinancialInstitutionBranch/cbc:ID`,
    ])
  })

  it('compares numbers as decimals: trailing zeros are kept values, extra digits and non-decimals are reported', async () => {
    const xml = await source(uc1)
    expect(xml).toMatch(/<cbc:PriceAmount currencyID="EUR">\d+\.\d*0</)
    const edited = xml
      .replace(/(<cbc:PriceAmount[^>]*>)[^<]*</, (_, open) => `${open}0.30000000000000001<`)
      .replace(/(<cbc:PayableAmount[^>]*>)[^<]*</, (_, open) => `${open}1e3<`)
    const { invoice, dropped } = await ublToInvoice(edited)
    expect(invoice.totals.amountDueForPayment).toBeNaN()
    expect(dropped).toEqual(['/Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount', '/Invoice/cac:InvoiceLine[1]/cac:Price/cbc:PriceAmount'])
  })

  it('reads a zero price discount with a gross price as no discount (CG-62)', async () => {
    const { invoice } = await ublToInvoice(await source(uc1))
    const price = invoice.lines[0].price!
    expect(price.grossPrice).toBeDefined()
    expect(price.priceDiscount).toBeUndefined()
  })
})

describe('ublToInvoice: every place the writer writes', () => {
  // The annex B sources hold none of the agents, invoicee, payer, mandate, BT-90, tax representative, exchange
  // rate, BT-111, attachments, line references, line delivery, BT-177 / BT-193 or a CreditNote BT-9 / BT-11: the
  // model read from F202500001 EXTENDED-CTC-FR with all of them added, written by `invoiceToUbl()` and read back.
  async function populated(withPayee = true): Promise<Invoice> {
    const { invoice } = await ublToInvoice(await source(EXAMPLES.find(e => e.name === 'F202500001' && e.level === 'extended-ctc-fr')!))
    const address = { addressLine1: '1 rue A', addressLine2: 'B', addressLine3: 'C', city: 'PARIS', postCode: '75001', countrySubdivision: 'IDF', countryCode: 'FR' }
    const contact = { point: 'M. X', telephoneNumber: '0102030405', emailAddress: 'x@example.test' }
    const extra = (siren: string): NonNullable<Invoice['sellerAgent']> => ({ identifiers: [{ value: `${siren}00012`, schemeId: '0009' }], name: `PARTY ${siren}`, roleCode: 'AB', tradingName: `TRADE ${siren}`, legalRegistrationIdentifier: { value: siren, schemeId: '0002' }, electronicAddress: { value: siren, schemeId: '0225' }, vatIdentifier: 'FR88100000009', address, contact })
    invoice.notes.push({ subjectCode: 'AAI', note: 'Société & Fils <SARL> €' })
    invoice.orderDate = '2025-01-10'
    invoice.despatchAdviceReference ??= 'DESADV-H'
    invoice.despatchAdviceDate = '2025-01-20'
    invoice.receivingAdviceReference = 'RECADV-H'
    invoice.tenderOrLotReference = 'LOT-1'
    invoice.projectReference = 'PROJ-1'
    invoice.contractReference ??= 'CONTRACT-1'
    invoice.contractCodeType = 'CT'
    invoice.contractDate = '2024-12-01'
    invoice.precedingInvoiceReferences = [{ reference: 'F202400099', issueDate: '2024-12-31', typeCode: '380' }]
    invoice.additionalDocuments.push({ reference: 'ATT-1', description: 'DOCUMENT_ANNEXE', externalLocation: 'https://example.test/a', attachedDocument: { content: 'JVBERi0xLjQK', mimeCode: 'application/pdf', filename: 'piece.pdf' } })
    invoice.seller.taxRegistrationIdentifier = 'TAXREG-1'
    invoice.sellerAgent = extra('100000009')
    invoice.buyerAgent = extra('200000008')
    invoice.invoicee = extra('300000007')
    invoice.billingParty = extra('400000006')
    invoice.payer = extra('500000005')
    invoice.sellerTaxRepresentative = { name: 'REPRESENTANT', address, vatIdentifier: 'FR12345678901' }
    if (withPayee)
      Object.assign(invoice.payee!, { roleCode: 'PE', electronicAddress: { value: '300000007', schemeId: '0225' }, vatIdentifier: 'FR88100000009', address, contact })
    else
      invoice.payee = undefined
    const payment = invoice.paymentInstructions!
    payment.creditTransfers.push({ paymentAccountIdentifier: 'FR7630001007941234567890185', paymentAccountName: 'SECOND', paymentServiceProviderIdentifier: 'BICSECOND' })
    payment.directDebit = { mandateReferenceIdentifier: 'MANDATE-1', bankAssignedCreditorIdentifier: 'FR12ZZZ123456', debitedAccountIdentifier: 'FR7612345678901234567890123' }
    invoice.deliveryTerms = { deliveryTypeCode: 'EXW', locationName: 'PARIS' }
    invoice.vatAccountingCurrencyCode = 'USD'
    invoice.totals.invoiceTotalVatAmountInAccountingCurrency = 9.57
    invoice.vatCurrencyExchange = { sourceCurrencyCode: 'EUR', targetCurrencyCode: 'USD', exchangeRate: 1.1, exchangeRateDate: '2025-02-01' }
    const charge = invoice.charges.find(c => c.reason !== undefined)!
    charge.reasonCode = undefined
    charge.nonVatTaxCode = 'AAA'
    const line = invoice.lines[1]
    line.notes.push({ subjectCode: 'AAI' })
    line.objectIdentifiers.push({ value: 'OBJ-1', schemeId: 'AAA' })
    line.unitsInParentLine = 1
    line.unitsInParentLineUnitCode = 'C62'
    line.vatAmount = 4.2
    line.vatAmountInAccountingCurrency = 4.62
    line.purchaseOrderLineReference = '9'
    line.purchaseOrderReference = 'PO201925478'
    line.purchaseOrderDate = '2025-01-10'
    line.sellerOrderReference = { orderReference: 'SO-1', orderLineReference: '7' }
    line.despatchAdviceReference = { reference: 'DESADV-1', lineReference: '2', issueDate: '2025-01-20' }
    line.receivingAdviceReference = { reference: 'RECADV-1', lineReference: '3' }
    line.precedingInvoiceReferences = [{ reference: 'F202400099', lineReference: '1', typeCode: '380', issueDate: '2024-12-31' }]
    line.parentLineIdentifier = '1'
    line.deliverTo = { identifiers: [{ value: '30000000700012', schemeId: '0009' }], name: 'SITE', address }
    line.actualDelivery = { actualDeliveryDate: '2025-01-31' }
    line.deliveryTerms = { deliveryTypeCode: 'FCA', locationName: 'LYON' }
    line.charges[0].nonVatTaxCode = 'AAA'
    line.item.attributes.push({ name: 'POIDS', typeCode: 'AAB', valueQuantity: 1.5, valueQuantityUnitCode: 'KGM' })
    line.item.standardIdentifier = { value: '3017620422003', schemeId: '0160' }
    line.item.buyersIdentifier = 'BUYER-ITEM'
    line.item.countryOfOrigin = 'FR'
    line.price!.priceDiscount = 0.5
    line.price!.priceDiscountReason = 'PROMO'
    line.price!.priceDiscountReasonCode = '95'
    line.seller = { identifiers: [{ value: '100000009', schemeId: '0002' }, { value: 'SELLER-LOCAL' }], name: 'LE VENDEUR', tradingName: 'VENDEUR', legalRegistrationIdentifier: { value: '100000009', schemeId: '0002' }, electronicAddress: { value: '100000009', schemeId: '0225' }, vatIdentifier: 'FR88100000009', taxRegistrationIdentifier: 'TAXREG-1', address }
    return invoice
  }

  it.each([['Invoice', true], ['CreditNote', true], ['Invoice', false], ['CreditNote', false]] as const)('as %s (payee: %s): model → UBL → model is the identity, nothing dropped', async (root, withPayee) => {
    const invoice = await populated(withPayee)
    if (root === 'CreditNote')
      invoice.typeCode = '381'
    const xml = await written(invoice, 'extended-ctc-fr', root)
    expect(rootOf(xml)).toBe(root)
    const { invoice: read, dropped } = await ublToInvoice(xml)
    expect(dropped).toEqual([])
    expect(read).toEqual(invoice)
    // BT-90 sits with the payee when there is one, else with the seller (annex A).
    expect(xml.match(/schemeID="SEPA"/g)).toHaveLength(1)
  })

  it('reads BT-84-0 back as BT-84 (one UBL account id, CG-64) and BT-11 from a CreditNote type 50 document', async () => {
    const invoice = await populated()
    invoice.typeCode = '381'
    invoice.paymentInstructions!.creditTransfers[1] = { nationalAccountNumber: 'LOCAL-ACCOUNT' }
    const { invoice: read, dropped } = await ublToInvoice(await written(invoice, 'extended-ctc-fr', 'CreditNote'))
    expect(dropped).toEqual([])
    expect(read.paymentInstructions!.creditTransfers[1]).toEqual({ paymentAccountIdentifier: 'LOCAL-ACCOUNT' })
    expect(read.projectReference).toBe('PROJ-1')
  })
})

describe('ublToInvoice: paths', () => {
  it('names elements by namespace, whatever prefixes the source uses', async () => {
    const example = EXAMPLES.find(e => e.name === 'UC1' && e.level === 'en16931')!
    const xml = await source(example)
    const renamed = xml.replaceAll('xmlns:cac=', 'xmlns:a=').replaceAll('xmlns:cbc=', 'xmlns:b=').replaceAll(/<(\/?)cac:/g, '<$1a:').replaceAll(/<(\/?)cbc:/g, '<$1b:').replace('</b:IssueDate>', '</b:IssueDate><b:IssueTime>12:30:00</b:IssueTime>')
    expect(renamed).not.toContain('<cbc:')
    const { invoice, dropped } = await ublToInvoice(renamed)
    expect(invoice).toEqual((await ublToInvoice(xml)).invoice)
    expect(dropped).toEqual(['/Invoice/cbc:IssueTime'])
  })

  it('stays linear on a deep, wide element outside the model', async () => {
    const example = EXAMPLES.find(e => e.name === 'UC1' && e.level === 'en16931')!
    const depth = 200
    const leaves = Array.from({ length: 2000 }, (_, i) => `<x:b>v${i}</x:b>`).join('')
    const chain = `${'<x:a>'.repeat(depth)}${leaves}${'</x:a>'.repeat(depth)}`
    const xml = (await source(example)).replace('</Invoice>', `<x:root xmlns:x="urn:example">${chain}</x:root></Invoice>`)
    const started = performance.now()
    const { dropped } = await ublToInvoice(xml)
    expect(performance.now() - started).toBeLessThan(5000)
    expect(dropped).toHaveLength(2000)
    expect(dropped[0]).toBe(`/Invoice/x:root${'/x:a'.repeat(depth)}/x:b[1]`)
  })
})

describe('ublToInvoice: input', () => {
  const uc5b = EXAMPLES.find(e => e.name === 'UC5b')!

  it('does not dispose an XmlDocument passed by the caller', async () => {
    const doc = XmlDocument.fromString(await source(uc5b))
    try {
      const { invoice } = await ublToInvoice(doc)
      expect(invoice.typeCode).toBe('381')
      expect(doc.root.name).toBe('CreditNote')
      expect(doc.toString()).toContain('CreditNoteLine')
    }
    finally {
      doc.dispose()
    }
  })

  it('accepts a Buffer', async () => {
    const { invoice } = await ublToInvoice(await readFile(resolve(FACTURES, uc5b.ubl)))
    expect(invoice.number).toBe('F202500011')
  })

  it('rejects a non-UBL document', async () => {
    await expect(ublToInvoice(await readFile(resolve(FACTURES, uc5b.cii), 'utf8'))).rejects.toThrow(/UBL/)
  })

  it('rejects a UBL document whose BT-24 names no mapped specification, without quoting it', async () => {
    const xml = (await source(uc5b)).replace(/<cbc:CustomizationID>[^<]*</, '<cbc:CustomizationID>urn:example:secret<')
    await expect(ublToInvoice(xml)).rejects.toThrow(/CustomizationID/)
    await expect(ublToInvoice(xml)).rejects.not.toThrow(/secret/)
  })

  // Untrusted input: the reader and its lenient write-back never throw on a missing or malformed element.
  it.each(['UC10', 'UC5b', 'F202500001'])('%s: still reads with any one element removed or its text garbled', async (name) => {
    const example = EXAMPLES.find(e => e.name === name && (name !== 'F202500001' || e.level === 'extended-ctc-fr'))!
    const xml = await source(example)
    const count = (() => {
      const doc = XmlDocument.fromString(xml)
      try {
        return doc.find('/*//*').length
      }
      finally {
        doc.dispose()
      }
    })()
    for (let i = 1; i <= count; i++) {
      for (const edit of ['remove', 'garble'] as const) {
        const doc = XmlDocument.fromString(xml)
        try {
          const node = doc.get(`(/*//*)[${i}]`) as XmlElement
          const customization = node.name === 'CustomizationID' && node.parent?.name === doc.root.name
          if (edit === 'remove') {
            node.remove()
          }
          else if (!(node.firstChild instanceof XmlElement)) {
            while (node.firstChild)
              node.firstChild.remove()
            node.addText('x#')
          }
          // BT-24 decides the level: without a mapped one the reader refuses the document, by design.
          if (customization) {
            await expect(ublToInvoice(doc)).rejects.toThrow(/CustomizationID/)
            continue
          }
          const { dropped } = await ublToInvoice(doc)
          expect(Array.isArray(dropped)).toBe(true)
        }
        finally {
          doc.dispose()
        }
      }
    }
  }, 120000)
})
