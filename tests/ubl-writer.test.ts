import type { Invoice } from '@stafyniaksacha/facturx/en16931'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { check, fromCii, invoiceToXml, toCii, xmlToInvoice } from '@stafyniaksacha/facturx'
import { XmlDocument } from 'libxml2-wasm'
import { describe, expect, it } from 'vitest'
import { invoiceToUbl, UBL_CREDIT_NOTE_TYPE_CODES } from '../src/lib/converters/ubl'

const FACTURES = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures')
const NS = {
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
}

/**
 * The model terms the UBL writer refuses because UBL has no place for them, and the annex B UBL twin
 * leaves out too (CONFORMANCE.md): stripped from the model read from the CII twin before writing UBL.
 * The table is checked against what each twin holds, so it cannot go stale.
 */
type NoPlace = 'BT-41-0' | 'BT-56-0' | 'EXT-FR-FE-184' | 'BG-18'

const NO_PLACE: Record<NoPlace, { present: (i: Invoice) => boolean, strip: (i: Invoice) => void }> = {
  'BT-41-0': { present: i => i.seller.contact?.departmentName !== undefined, strip: (i) => { i.seller.contact!.departmentName = undefined } },
  'BT-56-0': { present: i => i.buyer.contact?.departmentName !== undefined, strip: (i) => { i.buyer.contact!.departmentName = undefined } },
  'EXT-FR-FE-184': { present: i => i.lines.some(l => l.grandTotalAmount !== undefined), strip: i => i.lines.forEach((l) => { l.grandTotalAmount = undefined }) },
  'BG-18': { present: i => i.paymentInstructions?.card !== undefined, strip: (i) => { i.paymentInstructions!.card = undefined } },
}

interface Twin {
  name: string
  level: 'en16931' | 'extended-ctc-fr'
  ubl: string
  cii: string
  /** Terms with no UBL place the CII twin holds (CG-59 department names, CG-60 line grand total, CG-61 card). */
  noPlace: NoPlace[]
  /**
   * The CII twin holds a schemeless seller identifier (BT-29) and deliver-to location identifier (BT-71). UBL
   * writes them, but the UBL BR-FR-CO-10 wants a `@schemeID` on every one (the CII BR-FR-CO-10 checks only
   * `ram:GlobalID`), and the annex B UBL twin leaves them out (CG-63).
   */
  privateIds?: true
}

const DEPARTMENTS: NoPlace[] = ['BT-41-0', 'BT-56-0']
const TWINS: Twin[] = [
  { name: 'F202500001', level: 'en16931', ubl: 'F202500001/_EN16931/F202500001_INV_20250201_EN16931_UBL_Commentee.xml', cii: 'F202500001/_EN16931/F202500001_INV_20250201_CII_EN16931_FX_CII_Commentee.xml', noPlace: ['BT-56-0'], privateIds: true },
  { name: 'UC1', level: 'en16931', ubl: 'F202500003/_EN16931/UC1_F202500003_00-INV_20250701_EN16931_UBL_Commentee.xml', cii: 'F202500003/_EN16931/UC1_F202500003_00-INV_20250701_EN16931_FX_CII_Commentee.xml', noPlace: DEPARTMENTS },
  { name: 'UC4', level: 'en16931', ubl: 'Facture et Facture Rectificative/UC4_F202500006_00-INV_20250701_EN16931_UBL_Commentee.xml', cii: 'Facture et Facture Rectificative/UC4_F202500006_00-INV_20250701_EN16931_FX_CII_Commentee.xml', noPlace: DEPARTMENTS },
  { name: 'UC4b', level: 'en16931', ubl: 'Facture et Facture Rectificative/UC4b_F202500010_00-INVCORR_20250702_EN16931_UBL_Commentee.xml', cii: 'Facture et Facture Rectificative/UC4b_F202500010_00-INVCORR_20250702_EN16931_FX_CII_Commentee.xml', noPlace: DEPARTMENTS },
  { name: 'UC5', level: 'en16931', ubl: 'Facture et Avoir/UC5_F202500007_00-INV_20250702_EN16931_UBL_Commentee.xml', cii: 'Facture et Avoir/UC5_F202500007_00-INV_20250702_EN16931_FX_CII_Commentee.xml', noPlace: DEPARTMENTS },
  { name: 'UC5b', level: 'en16931', ubl: 'Facture et Avoir/UC5b_F202500011_00-CN_20250703_EN16931_UBL_Commentee.xml', cii: 'Facture et Avoir/UC5b_F202500011_00-CN_20250703_EN16931_FX_CII_Commentee.xml', noPlace: DEPARTMENTS },
  // CG-45: the annex B UBL source raises BR-FREXT-IC-08rev because its K charge lacks the exemption reason; the
  // CII twin carries it (EXT-FR-FE-189 / -190), so the UBL written from it raises no warning.
  { name: 'F202500001', level: 'extended-ctc-fr', ubl: 'F202500001/_EXTENDED-CTC-FR/F202500001_INV_20250201_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'F202500001/_EXTENDED-CTC-FR/F202500001_INV_20250201_EXTENDED-CTC-FR_CII_Commentee.xml', noPlace: ['BT-56-0'], privateIds: true },
  { name: 'UC1', level: 'extended-ctc-fr', ubl: 'F202500003/_EXTENDED/UC1_F202500003_00-INV_20250701_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'F202500003/_EXTENDED/UC1_F202500003_00-INV_20250701_EXTENDED-CTC-FR_CII_Commentee.xml', noPlace: DEPARTMENTS },
  { name: 'UC10', level: 'extended-ctc-fr', ubl: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Multi-Vendeur/UC10_F202600004_MULTI-VENDEUR_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Multi-Vendeur/UC10_F202600004_MULTI-VENDEUR_EXTENDED-CTC-FR_CII_Commentee.xml', noPlace: [...DEPARTMENTS, 'EXT-FR-FE-184', 'BG-18'] },
  { name: 'UC11', level: 'extended-ctc-fr', ubl: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Multi-Vendeur/UC11_F202600022_MULTI-VENDEUR_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Multi-Vendeur/UC11_F202600022_MULTI-VENDEUR_EXTENDED-CTC-FR_CII_Commentee.xml', noPlace: [...DEPARTMENTS, 'EXT-FR-FE-184'] },
  { name: 'UC12', level: 'extended-ctc-fr', ubl: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Sous-ligne/UC12_F202600025_SOUS-LIGNE_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Sous-ligne/UC12_F202600025_SOUS-LIGNE_EXTENDED-CTC-FR_CII_Commentee.xml', noPlace: DEPARTMENTS },
  { name: 'UC13', level: 'extended-ctc-fr', ubl: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Bidirectionnelle/UC13_AUTOF202600035_BIDIRECTIONNELLE_EXTENDED-CTC-FR_UBL_Commentee.xml', cii: 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Bidirectionnelle/UC13_AUTOF202600035_BIDIRECTIONNELLE_EXTENDED-CTC-FR_CII_Commentee.xml', noPlace: ['BT-41-0', 'EXT-FR-FE-184'] },
]

async function fromTwin(twin: Twin): Promise<Invoice> {
  const { invoice } = fromCii(await xmlToInvoice(await readFile(resolve(FACTURES, twin.cii), 'utf8')))
  return invoice
}

/** A deep copy (the writer reads data only, so the class prototypes do not matter) without `terms`. */
function without(invoice: Invoice, terms: NoPlace[], privateIds = false): Invoice {
  const copy = structuredClone(invoice)
  for (const term of terms)
    NO_PLACE[term].strip(copy)
  if (privateIds) {
    copy.seller.identifiers = copy.seller.identifiers.filter(i => i.schemeId !== undefined)
    if (copy.delivery?.locationIdentifier?.schemeId === undefined)
      copy.delivery!.locationIdentifier = undefined
  }
  return copy
}

const twinInvoice = async (twin: Twin): Promise<Invoice> => without(await fromTwin(twin), twin.noPlace, twin.privateIds)

async function written(invoice: Invoice, options: Parameters<typeof invoiceToUbl>[1]): Promise<string> {
  const doc = await invoiceToUbl(invoice, options)
  try {
    return doc.toString()
  }
  finally {
    doc.dispose()
  }
}

function texts(xml: string, xpath: string): string[] {
  const doc = XmlDocument.fromString(xml)
  try {
    return doc.find(xpath, NS).map(n => n.content)
  }
  finally {
    doc.dispose()
  }
}

function rootName(xml: string): string {
  const doc = XmlDocument.fromString(xml)
  try {
    return doc.root.name
  }
  finally {
    doc.dispose()
  }
}

const ruleId = (finding: { message: string }): string => /^\[([^\]]+)\]/.exec(finding.message)?.[1] ?? finding.message

// Every digit of a decimal, without the trailing zeros annex B pads to 4 decimals (the model holds numbers).
const canonical = (decimal: string): string => decimal.includes('.') ? decimal.replace(/0+$/, '').replace(/\.$/, '') : decimal

describe('invoiceToUbl: annex B twins', () => {
  it.each(TWINS)('$name ($level): the no-place table matches what the CII twin holds', async (twin) => {
    const invoice = await fromTwin(twin)
    const present = (Object.keys(NO_PLACE) as NoPlace[]).filter(term => NO_PLACE[term].present(invoice))
    expect(present.sort()).toEqual([...twin.noPlace].sort())
    // Each of them alone makes the writer throw, naming it.
    for (const term of twin.noPlace)
      await expect(invoiceToUbl(without(invoice, twin.noPlace.filter(t => t !== term)), { level: twin.level })).rejects.toThrow(term)
  })

  it.each(TWINS)('$name ($level): written UBL passes XSD + profile + BR-FR at its level', async (twin) => {
    const xml = await written(await twinInvoice(twin), { level: twin.level })
    const result = await check({ xml, schematron: true, frCtc: true })
    expect(result.errors).toEqual([])
    expect(result.schematronErrors).toEqual([])
    expect(result.frCtcErrors).toEqual([])
    expect((result.schematronWarnings ?? []).map(ruleId)).toEqual([])
    expect(result.frCtcWarnings).toEqual([])
    expect(result.valid).toBe(true)
    expect(result.flavor).toBe('ubl')
    expect(result.level).toBe(twin.level)
  })

  it('the annex B UBL twins leave out the CII department names (CG-59)', async () => {
    for (const twin of TWINS) {
      const invoice = await fromTwin(twin)
      const source = await readFile(resolve(FACTURES, twin.ubl), 'utf8')
      for (const department of [invoice.seller.contact?.departmentName, invoice.buyer.contact?.departmentName]) {
        if (department !== undefined)
          expect(source.includes(department), twin.name).toBe(false)
      }
    }
  })

  it.each(TWINS.filter(t => t.privateIds))('$name ($level): schemeless BT-29 / BT-71 fail only the UBL BR-FR-CO-10, and the UBL twin has none (CG-63)', async (twin) => {
    const invoice = without(await fromTwin(twin), twin.noPlace)
    const result = await check({ xml: await written(invoice, { level: twin.level }), schematron: true, frCtc: true })
    expect(result.errors).toEqual([])
    expect(result.schematronErrors).toEqual([])
    expect((result.frCtcErrors ?? []).map(e => e.assertId).sort()).toEqual(['BR-FR-CO-10_BT-29-1', 'BR-FR-CO-10_BT-71-1'])
    const source = await readFile(resolve(FACTURES, twin.ubl), 'utf8')
    expect(texts(source, '/*/cac:AccountingSupplierParty/cac:Party/cac:PartyIdentification/cbc:ID[not(@schemeID)]')).toEqual([])
    expect(texts(source, '/*/cac:Delivery/cac:DeliveryLocation/cbc:ID')).toEqual([])
    // The CII twin passes its own BR-FR with them.
    expect((await check({ xml: await readFile(resolve(FACTURES, twin.cii)), frCtc: true })).frCtcErrors).toEqual([])
  })

  it('the UC10 annex B UBL card disagrees with the CII card (CG-61)', async () => {
    const twin = TWINS.find(t => t.name === 'UC10')!
    const invoice = await fromTwin(twin)
    const source = await readFile(resolve(FACTURES, twin.ubl), 'utf8')
    expect(texts(source, '//cac:CardAccount/cbc:PrimaryAccountNumberID')).not.toEqual([invoice.paymentInstructions!.card!.primaryAccountNumber])
    expect(texts(source, '//cac:CardAccount/cbc:NetworkID')).toHaveLength(1)
  })
})

describe('invoiceToUbl: every EXTENDED-CTC-FR place', () => {
  // The annex B twins hold none of the agents, invoicee, payer, billing party, delivery terms, line delivery,
  // line seller, tax exchange rate, BT-32, attachments, BT-177 / BT-193 or the reference dates: F202500001 with
  // all of them added (amounts unchanged), as an Invoice and as a CreditNote.
  async function populated(): Promise<Invoice> {
    const twin = TWINS.find(t => t.name === 'F202500001' && t.level === 'extended-ctc-fr')!
    const invoice = await twinInvoice(twin)
    const address = { addressLine1: '1 rue A', addressLine2: 'B', addressLine3: 'C', city: 'PARIS', postCode: '75001', countrySubdivision: 'IDF', countryCode: 'FR' }
    const contact = { point: 'M. X', telephoneNumber: '0102030405', emailAddress: 'x@example.test' }
    const extra = (siren: string) => ({ identifiers: [{ value: `${siren}00012`, schemeId: '0009' }], name: `PARTY ${siren}`, roleCode: 'AB', tradingName: `TRADE ${siren}`, legalRegistrationIdentifier: { value: siren, schemeId: '0002' }, electronicAddress: { value: siren, schemeId: '0225' }, vatIdentifier: 'FR88100000009', address, contact })
    invoice.notes.push({ subjectCode: 'AAI' })
    invoice.orderDate = '2025-01-10'
    invoice.despatchAdviceDate = '2025-01-20'
    invoice.contractCodeType = 'CT'
    invoice.contractDate = '2024-12-01'
    invoice.precedingInvoiceReferences = [{ reference: 'F202400099', issueDate: '2024-12-31', typeCode: '380' }]
    invoice.additionalDocuments.push({ reference: 'ATT-1', description: 'DOCUMENT_ANNEXE', attachedDocument: { content: 'JVBERi0xLjQK', mimeCode: 'application/pdf', filename: 'piece.pdf' } })
    invoice.seller.taxRegistrationIdentifier = 'TAXREG-1'
    invoice.sellerAgent = extra('100000009')
    invoice.buyerAgent = extra('200000008')
    invoice.invoicee = extra('300000007')
    invoice.billingParty = extra('400000006')
    invoice.payer = extra('500000005')
    Object.assign(invoice.payee!, { roleCode: 'PE', electronicAddress: { value: '300000007', schemeId: '0225' }, vatIdentifier: 'FR88100000009', address, contact })
    invoice.deliveryTerms = { deliveryTypeCode: 'EXW', locationName: 'PARIS' }
    invoice.vatAccountingCurrencyCode = 'USD'
    invoice.totals.invoiceTotalVatAmountInAccountingCurrency = 9.57
    invoice.vatCurrencyExchange = { sourceCurrencyCode: 'EUR', targetCurrencyCode: 'USD', exchangeRate: 1.1, exchangeRateDate: '2025-02-01' }
    const line = invoice.lines[1]
    line.notes.push({ subjectCode: 'AAI' })
    line.unitsInParentLine = 1
    line.unitsInParentLineUnitCode = 'C62'
    line.vatAmount = 4.2
    line.vatAmountInAccountingCurrency = 4.62
    line.purchaseOrderReference = 'PO201925478'
    line.purchaseOrderDate = '2025-01-10'
    line.sellerOrderReference = { orderReference: 'SO-1', orderLineReference: '7' }
    line.despatchAdviceReference = { reference: 'DESADV-1', lineReference: '2', issueDate: '2025-01-20' }
    line.receivingAdviceReference = { reference: 'RECADV-1', lineReference: '3' }
    line.precedingInvoiceReferences = [{ reference: 'F202400099', lineReference: '1', typeCode: '380', issueDate: '2024-12-31' }]
    line.deliverTo = { identifiers: [{ value: '30000000700012', schemeId: '0009' }], name: 'SITE', address }
    line.actualDelivery = { actualDeliveryDate: '2025-01-31' }
    line.deliveryTerms = { deliveryTypeCode: 'FCA', locationName: 'LYON' }
    line.charges[0].nonVatTaxCode = 'AAA'
    line.item.attributes.push({ name: 'POIDS', typeCode: 'AAB', valueQuantity: 1.5, valueQuantityUnitCode: 'KGM' })
    line.price!.priceDiscountReason = 'PROMO'
    line.price!.priceDiscountReasonCode = '95'
    // EXT-FR-FE-166-1 is optional in UBL: one identifier without scheme.
    line.seller = { identifiers: [{ value: '100000009', schemeId: '0002' }, { value: 'SELLER-LOCAL' }], name: 'LE VENDEUR', tradingName: 'VENDEUR', legalRegistrationIdentifier: { value: '100000009', schemeId: '0002' }, electronicAddress: { value: '100000009', schemeId: '0225' }, vatIdentifier: 'FR88100000009', taxRegistrationIdentifier: 'TAXREG-1', address }
    return invoice
  }

  it.each(['Invoice', 'CreditNote'] as const)('as %s: XSD + profile + BR-FR valid', async (root) => {
    const invoice = await populated()
    if (root === 'CreditNote')
      invoice.typeCode = '381'
    const xml = await written(invoice, { level: 'extended-ctc-fr' })
    expect(rootName(xml)).toBe(root)
    const result = await check({ xml, schematron: true, frCtc: true })
    expect(result.errors).toEqual([])
    expect(result.schematronErrors).toEqual([])
    expect(result.frCtcErrors).toEqual([])
    expect(result.valid).toBe(true)
    const party = '/*/cac:AccountingSupplierParty/cac:Party'
    expect(texts(xml, `${party}/cac:PartyTaxScheme[cac:TaxScheme/cbc:ID="LOC"]/cbc:CompanyID`)).toEqual(['TAXREG-1'])
    expect(texts(xml, `${party}/cac:AgentParty/cac:PartyLegalEntity/cbc:RegistrationName`)).toEqual(['PARTY 100000009'])
    expect(texts(xml, `${party}/cac:ServiceProviderParty/cac:Party/cbc:IndustryClassificationCode`)).toEqual(['AB'])
    expect(texts(xml, '/*/cac:AccountingCustomerParty/cac:Party/cac:ServiceProviderParty/cac:Party/cac:PartyName/cbc:Name')).toEqual(['TRADE 300000007'])
    expect(texts(xml, '/*/cac:PaymentMeans/cac:PaymentMandate/cac:PayerParty/cbc:EndpointID')).toEqual(['500000005'])
    expect(texts(xml, '/*/cac:DeliveryTerms/cac:DeliveryLocation/cbc:Name')).toEqual(['PARIS'])
    expect(texts(xml, '/*/cac:TaxExchangeRate/cbc:CalculationRate')).toEqual(['1.1'])
    expect(texts(xml, '/*/cac:TaxTotal/cbc:TaxAmount[@currencyID="USD"]')).toEqual(['9.57'])
    expect(texts(xml, '/*/cac:AdditionalDocumentReference/cac:Attachment/cbc:EmbeddedDocumentBinaryObject/@filename')).toEqual(['piece.pdf'])
    const line = `/*/cac:${root}Line[2]`
    expect(texts(xml, `${line}/cac:Delivery/cbc:ActualDeliveryDate`)).toEqual(['2025-01-31'])
    expect(texts(xml, `${line}/cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID`)).toEqual(['F202400099'])
    expect(texts(xml, `${line}/cac:AllowanceCharge/cbc:AllowanceChargeReasonCode[@listID="5153"]`)).toEqual(['AAA'])
    expect(texts(xml, `${line}/cac:OrderLineReference/cac:OrderReference/cbc:SalesOrderID`)).toEqual(['SO-1'])
    expect(texts(xml, `${line}/cac:TaxTotal/cbc:TaxAmount`)).toEqual(['4.20', '4.62'])
    expect(texts(xml, `${line}/cac:DeliveryTerms/cbc:ID`)).toEqual(['FCA'])
    expect(texts(xml, `${line}/cac:Item/cbc:PackQuantity`)).toEqual(['1'])
    expect(texts(xml, `${line}/cac:Item/cac:ManufacturerParty/cac:PartyIdentification/cbc:ID`)).toEqual(['100000009', 'SELLER-LOCAL'])
    expect(texts(xml, `${line}/cac:Item/cac:ManufacturerParty/cac:PartyTaxScheme/cac:TaxScheme/cbc:ID`)).toEqual(['VAT', 'LOC'])
  })

  it('refuses the same invoice at en16931, naming the first EXTENDED-CTC-FR term', async () => {
    const invoice = await populated()
    invoice.specificationIdentifier = undefined
    // A note without text and an attribute without value need EXTENDED-CTC-FR too: drop them to reach the term gates.
    invoice.notes = invoice.notes.filter(n => n.note !== undefined)
    invoice.lines.forEach((l) => {
      l.notes = l.notes.filter(n => n.note !== undefined)
      l.item.attributes = l.item.attributes.filter(a => a.value !== undefined)
    })
    await expect(invoiceToUbl(invoice, { level: 'en16931' })).rejects.toThrow(/is not carried at level "en16931"; it needs level "extended-ctc-fr"/)
  })
})

describe('invoiceToUbl: root and type code', () => {
  it('writes a credit note as CreditNote with CreditNoteTypeCode', async () => {
    const twin = TWINS.find(t => t.name === 'UC5b')!
    const xml = await written((await twinInvoice(twin)), { level: 'en16931' })
    const doc = XmlDocument.fromString(xml)
    try {
      expect(doc.root.name).toBe('CreditNote')
      expect(doc.root.namespaceUri).toBe('urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2')
      expect(doc.find('/*/cbc:CreditNoteTypeCode', NS).map(n => n.content)).toEqual(['381'])
      expect(doc.find('/*/cbc:InvoiceTypeCode', NS)).toHaveLength(0)
      expect(doc.find('/*/cac:CreditNoteLine', NS).length).toBeGreaterThan(0)
      expect(doc.find('/*/cac:CreditNoteLine/cbc:CreditedQuantity', NS).length).toBeGreaterThan(0)
      // UBL-SR-45: the credit note's BT-9 is in its (first) payment means.
      expect(doc.find('/*/cac:PaymentMeans/cbc:PaymentDueDate', NS).map(n => n.content)).toEqual(['2025-08-02'])
    }
    finally {
      doc.dispose()
    }
  })

  it('writes type code 381 built from scratch as CreditNote', async () => {
    const xml = await written(minimal({ typeCode: '381' }), { level: 'en16931' })
    expect(texts(xml, '/*/cbc:CreditNoteTypeCode')).toEqual(['381'])
    expect(rootName(xml)).toBe('CreditNote')
    const result = await check({ xml })
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('uses the BR-CL-01 credit note list of both UBL Schematrons', () => {
    expect([...UBL_CREDIT_NOTE_TYPE_CODES].sort()).toEqual(['261', '262', '296', '308', '381', '396', '420', '458', '502', '503', '532', '81', '83'])
  })

  it('writes a 380 as Invoice, and lets options.root override', async () => {
    expect(rootName(await written(minimal({}), { level: 'en16931' }))).toBe('Invoice')
    // 81 is in both BR-CL-01 lists: either root.
    expect(rootName(await written(minimal({ typeCode: '81' }), { level: 'en16931' }))).toBe('CreditNote')
    expect(rootName(await written(minimal({ typeCode: '81' }), { level: 'en16931', root: 'Invoice' }))).toBe('Invoice')
    expect(rootName(await written(minimal({ typeCode: '381' }), { level: 'en16931', root: 'CreditNote' }))).toBe('CreditNote')
  })

  it('refuses an options.root whose BR-CL-01 list lacks BT-3', async () => {
    await expect(invoiceToUbl(minimal({}), { level: 'en16931', root: 'CreditNote' })).rejects.toThrow(/^invoiceToUbl: BT-3 \(invoice type code\) is not a CreditNote type code of BR-CL-01/)
    await expect(invoiceToUbl(minimal({ typeCode: '381' }), { level: 'en16931', root: 'Invoice' })).rejects.toThrow(/^invoiceToUbl: BT-3 \(invoice type code\) is not a Invoice type code of BR-CL-01/)
  })

  it('writes BT-11 of a CreditNote as an additional document of type 50 (UBL-SR-43)', async () => {
    const xml = await written(minimal({ typeCode: '381', projectReference: 'PRJ-1' }), { level: 'en16931' })
    expect(texts(xml, '/*/cac:AdditionalDocumentReference[cbc:DocumentTypeCode="50"]/cbc:ID')).toEqual(['PRJ-1'])
    expect(texts(xml, '/*/cac:ProjectReference/cbc:ID')).toEqual([])
    expect((await check({ xml, schematron: true })).schematronErrors).toEqual([])
  })
})

describe('invoiceToUbl: values', () => {
  it('keeps sub-cent unit prices and long quantities exact', async () => {
    for (const name of ['UC11', 'UC13']) {
      const twin = TWINS.find(t => t.name === name)!
      const source = await readFile(resolve(FACTURES, twin.ubl), 'utf8')
      const xml = await written(await twinInvoice(twin), { level: twin.level })
      for (const xpath of ['//cbc:PriceAmount', '//cbc:InvoicedQuantity', '//cac:Price/cac:AllowanceCharge/cbc:BaseAmount']) {
        const expected = texts(source, xpath).map(canonical)
        if (!xpath.includes('AllowanceCharge'))
          expect(expected.length, `${name} ${xpath}`).toBeGreaterThan(0)
        expect(texts(xml, xpath), `${name} ${xpath}`).toEqual(expected)
      }
    }
    expect(texts(await written(minimal({ netPrice: 0.0000001, quantity: 1234567.123456 }), { level: 'en16931' }), '//cbc:PriceAmount | //cbc:InvoicedQuantity')).toEqual(['1234567.123456', '0.0000001'])
  })

  it('escapes XML-special and non-ASCII text', async () => {
    const name = 'Société & Fils <SARL> €'
    const meansText = 'Virement "SEPA" & <instant>'
    const invoice = minimal({})
    invoice.seller.name = name
    invoice.paymentInstructions = { paymentMeansTypeCode: '30', paymentMeansText: meansText, creditTransfers: [{ paymentAccountIdentifier: 'FR7630006000011234567890189' }] }
    const xml = await written(invoice, { level: 'en16931' })
    expect(texts(xml, '/*/cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName')).toEqual([name])
    const doc = XmlDocument.fromString(xml)
    try {
      expect(doc.get('/*/cac:PaymentMeans/cbc:PaymentMeansCode/@name', NS)?.content).toBe(meansText)
    }
    finally {
      doc.dispose()
    }
    expect((await check({ xml })).valid).toBe(true)
  })

  it('writes BT-84-0 in the account cbc:ID when BT-84 is absent, and refuses both (CG-64)', async () => {
    const invoice = minimal({})
    invoice.paymentInstructions = { paymentMeansTypeCode: '30', creditTransfers: [{ nationalAccountNumber: 'NAT-123' }] }
    expect(texts(await written(invoice, { level: 'en16931' }), '//cac:PayeeFinancialAccount/cbc:ID')).toEqual(['NAT-123'])
    invoice.paymentInstructions.creditTransfers[0].paymentAccountIdentifier = 'FR7630006000011234567890189'
    await expect(invoiceToUbl(invoice, { level: 'en16931' })).rejects.toThrow('BT-84-0')
  })

  it('writes one cac:PaymentMeans per credit transfer, BT-82 and the mandate in the first only (UBL-SR-46/-55)', async () => {
    const invoice = minimal({})
    invoice.paymentInstructions = {
      paymentMeansTypeCode: '30',
      paymentMeansText: 'Virement',
      remittanceInformation: 'REF-1',
      creditTransfers: [{ paymentAccountIdentifier: 'FR7630006000011234567890189' }, { paymentAccountIdentifier: 'FR7630006000011234567890190' }],
      directDebit: { mandateReferenceIdentifier: 'MANDATE-1' },
    }
    const xml = await written(invoice, { level: 'en16931' })
    expect(texts(xml, '/*/cac:PaymentMeans/cbc:PaymentMeansCode')).toEqual(['30', '30'])
    expect(texts(xml, '/*/cac:PaymentMeans/cbc:PaymentID')).toEqual(['REF-1', 'REF-1'])
    expect(texts(xml, '/*/cac:PaymentMeans/cbc:PaymentMeansCode/@name')).toEqual(['Virement'])
    expect(texts(xml, '/*/cac:PaymentMeans/cac:PaymentMandate/cbc:ID')).toEqual(['MANDATE-1'])
    expect((await check({ xml, schematron: true })).schematronErrors).toEqual([])
  })
})

describe('invoiceToUbl: refusals', () => {
  it('throws on an EXT-FR-FE value at en16931', async () => {
    const twin = TWINS.find(t => t.name === 'UC1' && t.level === 'en16931')!
    const invoice = await twinInvoice(twin)
    invoice.specificationIdentifier = undefined
    invoice.contractReference = 'CT-1'
    invoice.contractDate = '2025-01-01'
    await expect(invoiceToUbl(invoice, { level: 'en16931' })).rejects.toThrow(/^invoiceToUbl: EXT-FR-FE-199 \(contract date\) is not carried at level "en16931"/)
    // The same value is written at extended-ctc-fr (into the contract reference).
    expect(texts(await written(invoice, { level: 'extended-ctc-fr' }), '/*/cac:ContractDocumentReference/cbc:IssueDate')).toEqual(['2025-01-01'])
  })

  it('throws, naming the term, on what UBL cannot carry', async () => {
    const cases: [string, (i: Invoice) => void, string | RegExp][] = [
      ['project name', i => Object.assign(i, { projectReference: 'P', projectName: 'Name' }), 'BT-11-0'],
      ['gross base quantity', i => Object.assign(i.lines[0].price!, { grossPrice: 12, grossPriceBaseQuantity: 2 }), 'BT-149-1'],
      ['missing BT-110', (i) => { i.totals.invoiceTotalVatAmount = undefined }, 'BT-110'],
      ['BT-14 alone', (i) => { i.salesOrderReference = 'SO' }, 'BT-14'],
      ['two buyer identifiers', (i) => { i.buyer.identifiers = [{ value: 'A' }, { value: 'B', schemeId: '0088' }] }, 'UBL-SR-16'],
      ['SEPA seller identifier', (i) => { i.seller.identifiers = [{ value: 'X', schemeId: 'SEPA' }] }, 'BT-29'],
      ['Amount decimals', (i) => { i.lines[0].netAmount = 10.005 }, /BT-131 .* more than 2 decimals/],
      ['bad date', (i) => { i.issueDate = '2025-02-30' }, 'BT-2'],
      ['wrong BT-24', (i) => { i.specificationIdentifier = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0' }, 'BT-24'],
      ['empty seller name', (i) => { i.seller.name = ' ' }, /^invoiceToUbl: BT-27 \(seller name\) is mandatory and empty$/],
      ['shared reason code', i => Object.assign(i.lines[0], { charges: [{ amount: 1, reasonCode: 'ABK', nonVatTaxCode: 'AAA' }] }), /^invoiceToUbl: BT-145 .*`cbc:AllowanceChargeReasonCode`/],
      ['not an array', i => Object.assign(i, { allowances: 5 }), /^invoiceToUbl: BG-20 \(document level allowances\) must be an array$/],
      ['card', (i) => { i.paymentInstructions = { paymentMeansTypeCode: '48', creditTransfers: [], card: { primaryAccountNumber: '1234' } } }, 'BT-87-1'],
    ]
    for (const [label, mutate, error] of cases) {
      const invoice = minimal({})
      mutate(invoice)
      await expect(invoiceToUbl(invoice, { level: 'en16931' }), label).rejects.toThrow(error)
    }
  })

  it('refuses BG-18 (card): UBL needs BT-87-1, which the model lacks (CG-61)', async () => {
    const invoice = minimal({})
    invoice.paymentInstructions = { paymentMeansTypeCode: '48', creditTransfers: [], card: { primaryAccountNumber: '1234' } }
    await expect(invoiceToUbl(invoice, { level: 'en16931' })).rejects.toThrow(/^invoiceToUbl: BG-18 .* BT-87-1/)
  })

  it('refuses a second EXT-FR-FE-146 on a line (CG-60)', async () => {
    const invoice = minimal({})
    invoice.lines[0].deliverTo = { identifiers: [{ value: 'A', schemeId: '0088' }, { value: 'B', schemeId: '0088' }] }
    await expect(invoiceToUbl(invoice, { level: 'extended-ctc-fr' })).rejects.toThrow(/^invoiceToUbl: EXT-FR-FE-146 /)
  })

  const NESTING: [string, (i: Invoice) => void][] = [
    ['BT-14', i => Object.assign(i, { salesOrderReference: 'SO' })],
    ['EXT-FR-FE-197', i => Object.assign(i, { orderDate: '2025-01-01' })],
    ['EXT-FR-FE-198', i => Object.assign(i, { despatchAdviceDate: '2025-01-01' })],
    ['EXT-FR-FE-01', i => Object.assign(i, { contractCodeType: 'CT' })],
    ['EXT-FR-FE-199', i => Object.assign(i, { contractDate: '2025-01-01' })],
    ['EXT-FR-FE-135', i => Object.assign(i.lines[0], { purchaseOrderReference: 'PO' })],
    ['EXT-FR-FE-145', i => Object.assign(i.lines[0], { sellerOrderReference: { orderLineReference: '1' } })],
    ['EXT-FR-FE-144', i => Object.assign(i.lines[0], { purchaseOrderLineReference: '1', sellerOrderReference: { orderReference: 'SO' } })],
    ['EXT-FR-FE-200', i => Object.assign(i.lines[0], { purchaseOrderLineReference: '1', purchaseOrderDate: '2025-01-01' })],
    ['EXT-FR-FE-BG-07', i => Object.assign(i.lines[0], { despatchAdviceReference: { reference: 'D' } })],
    ['EXT-FR-FE-201', i => Object.assign(i.lines[0], { despatchAdviceReference: { lineReference: '1', issueDate: '2025-01-01' } })],
    ['EXT-FR-FE-BG-08', i => Object.assign(i.lines[0], { receivingAdviceReference: { reference: 'R' } })],
  ]
  it.each(NESTING)('refuses %s without the identifier of the UBL element it sits in (CG-65)', async (id, mutate) => {
    const invoice = minimal({})
    mutate(invoice)
    await expect(invoiceToUbl(invoice, { level: 'extended-ctc-fr' })).rejects.toThrow(new RegExp(`^invoiceToUbl: ${id} \\(.*\\) needs `))
  })

  it('refuses EXT-FR-FE-180 without a line period: BR-CO-20 (CG-68)', async () => {
    const invoice = minimal({})
    invoice.lines[0].vat!.vatPointDateCode = '3'
    await expect(invoiceToUbl(invoice, { level: 'extended-ctc-fr' })).rejects.toThrow(/^invoiceToUbl: EXT-FR-FE-180 .*\(BR-CO-20\)$/)
    invoice.lines[0].period = { startDate: '2025-01-01' }
    expect(texts(await written(invoice, { level: 'extended-ctc-fr' }), '//cac:InvoiceLine/cac:InvoicePeriod/cbc:DescriptionCode')).toEqual(['3'])
  })

  it.each([
    ['BG-29', (i: Invoice) => { i.lines[0].price = undefined }, 'BR-26'],
    ['BT-129', (i: Invoice) => Object.assign(i.lines[0], { invoicedQuantity: undefined, invoicedQuantityUnitCode: undefined }), 'BR-FREXT-22'],
    ['BG-30', (i: Invoice) => { i.lines[0].vat = undefined }, 'UBL-SR-50'],
  ] as const)('refuses a DETAIL or unset-subtype line without %s at extended-ctc-fr (CG-69)', async (id, mutate, rule) => {
    const invoice = minimal({})
    mutate(invoice)
    await expect(invoiceToUbl(invoice, { level: 'extended-ctc-fr' })).rejects.toThrow(new RegExp(`^invoiceToUbl: ${id} .*\\(${rule}\\)$`))
    invoice.lines[0].statusReasonCode = 'DETAIL'
    await expect(invoiceToUbl(invoice, { level: 'extended-ctc-fr' })).rejects.toThrow(id)
    invoice.lines[0].statusReasonCode = 'INFORMATION'
    expect(rootName(await written(invoice, { level: 'extended-ctc-fr' }))).toBe('Invoice')
  })

  it('cG-69 open item: toCii() at extended-ctc-fr writes a line without BG-29 that its BR-26 refuses', async () => {
    const twin = TWINS.find(t => t.name === 'UC1' && t.level === 'extended-ctc-fr')!
    const invoice = await fromTwin(twin)
    invoice.lines[0].price = undefined
    const doc = await invoiceToXml(toCii(invoice, { level: 'extended-ctc-fr' }))
    try {
      const result = await check({ xml: doc.toString(), schematron: true })
      expect((result.schematronErrors ?? []).map(e => e.id ?? ruleId(e))).toContain('BR-FREXT-BR-26')
    }
    finally {
      doc.dispose()
    }
  })

  it.each([
    ['BT-22', (i: Invoice) => { i.notes = [{ note: '#AAI#text' }] }],
    ['BT-21', (i: Invoice) => { i.notes = [{ subjectCode: 'A#B', note: 'text' }] }],
    ['BT-21', (i: Invoice) => { i.notes = [{ subjectCode: '', note: 'text' }] }],
    ['BT-127', (i: Invoice) => { i.lines[0].notes = [{ note: '#AAI#' }] }],
    ['EXT-FR-FE-183', (i: Invoice) => { i.lines[0].notes = [{ subjectCode: '#', note: 'text' }] }],
  ] as const)('refuses a note that UBL would read back differently (%s)', async (id, mutate) => {
    const invoice = minimal({})
    mutate(invoice)
    await expect(invoiceToUbl(invoice, { level: 'extended-ctc-fr' })).rejects.toThrow(new RegExp(`^invoiceToUbl: ${id} `))
  })

  it('writes notes that read back as written', async () => {
    const invoice = minimal({})
    invoice.notes = [{ subjectCode: 'AAI', note: '#a#b' }, { note: '#no closing' }, { note: 'plain' }]
    expect(texts(await written(invoice, { level: 'en16931' }), '/*/cbc:Note')).toEqual(['#AAI##a#b', '#no closing', 'plain'])
  })

  it('names "extended-ctc-fr", never "extended", in a reprefixed level hint', async () => {
    const invoice = minimal({})
    invoice.lines[0].notes = [{ note: 'a' }, { note: 'b' }]
    expect(() => toCii(invoice, { level: 'en16931' })).toThrow('several need level "extended" or "extended-ctc-fr"')
    await expect(invoiceToUbl(invoice, { level: 'en16931' })).rejects.toThrow(/^invoiceToUbl: BT-127 \(invoice line note\) is carried once at level "en16931"; several need level "extended-ctc-fr"$/)
  })

  it('refuses two payee identifiers at en16931, a schemeless one included (UBL-SR-20)', async () => {
    const invoice = minimal({})
    invoice.payee = { identifiers: [{ value: 'LOCAL' }, { value: '300000007', schemeId: '0002' }], name: 'PAYEE' }
    await expect(invoiceToUbl(invoice, { level: 'en16931' })).rejects.toThrow(/^invoiceToUbl: BT-60 .*UBL-SR-20/)
  })

  it('writes BT-147 without BT-148 (no cbc:BaseAmount), refuses a schemeless EXT-FR-FE-148 (BR-FR-CO-10)', async () => {
    const invoice = minimal({})
    invoice.lines[0].price!.priceDiscount = 5
    invoice.lines[0].price!.netPrice = 95
    const xml = await written(invoice, { level: 'en16931' })
    expect(texts(xml, '//cac:Price/cac:AllowanceCharge/cbc:Amount')).toEqual(['5'])
    expect(texts(xml, '//cac:Price/cac:AllowanceCharge/cbc:BaseAmount')).toEqual([])
    const result = await check({ xml, schematron: true })
    expect(result.errors).toEqual([])
    expect(result.schematronErrors).toEqual([])
    // toCii() keeps refusing it: CII holds the discount inside the gross price.
    expect(() => toCii(invoice, { level: 'en16931' })).toThrow(/^toCii: BT-148/)
    const deliver = minimal({})
    deliver.lines[0].deliverTo = { identifiers: [{ value: 'SITE' }] }
    await expect(invoiceToUbl(deliver, { level: 'extended-ctc-fr' })).rejects.toThrow(/^invoiceToUbl: EXT-FR-FE-148 /)
  })

  it('throws on BT-9 of a credit note without payment means, and on an unknown level', async () => {
    await expect(invoiceToUbl(minimal({ typeCode: '381', paymentDueDate: '2025-03-01' }), { level: 'en16931' })).rejects.toThrow('BT-9')
    await expect(invoiceToUbl(minimal({}), { level: 'extended' as 'en16931' })).rejects.toThrow('options.level')
  })

  it('leaves toCii() messages unchanged (the shared checks are reprefixed for UBL only)', async () => {
    const invoice = minimal({})
    invoice.notes = [{ subjectCode: 'AAI' }]
    expect(() => toCii(invoice, { level: 'en16931' })).toThrow(/^toCii: BT-22 \(invoice note\) is mandatory/)
    await expect(invoiceToUbl(invoice, { level: 'en16931' })).rejects.toThrow(/^invoiceToUbl: BT-22 \(invoice note\) is mandatory/)
  })
})

/** A small EN 16931 invoice, built from plain objects, that the UBL XSD accepts. */
function minimal({ typeCode = '380', projectReference, paymentDueDate, netPrice = 100, quantity = 1 }: { typeCode?: string, projectReference?: string, paymentDueDate?: string, netPrice?: number, quantity?: number }): Invoice {
  const net = Math.round(netPrice * quantity * 100) / 100
  const vat = Math.round(net * 20) / 100
  return {
    number: 'INV-1',
    issueDate: '2025-02-01',
    typeCode,
    currencyCode: 'EUR',
    projectReference,
    paymentDueDate,
    invoicedObjectIdentifiers: [],
    notes: [],
    precedingInvoiceReferences: [],
    additionalDocuments: [],
    seller: { identifiers: [], name: 'Seller', address: { countryCode: 'FR' }, vatIdentifier: 'FR88100000009' },
    buyer: { identifiers: [], name: 'Buyer', address: { countryCode: 'FR' } },
    allowances: [],
    charges: [],
    lines: [{
      identifier: '1',
      notes: [],
      objectIdentifiers: [],
      invoicedQuantity: quantity,
      invoicedQuantityUnitCode: 'C62',
      netAmount: net,
      allowances: [],
      charges: [],
      precedingInvoiceReferences: [],
      price: { netPrice },
      vat: { categoryCode: 'S', rate: 20 },
      item: { name: 'Item', attributes: [], classifications: [] },
    }],
    totals: { sumOfInvoiceLineNetAmount: net, invoiceTotalAmountWithoutVat: net, invoiceTotalVatAmount: vat, invoiceTotalAmountWithVat: net + vat, amountDueForPayment: net + vat },
    vatBreakdown: [{ categoryTaxableAmount: net, categoryTaxAmount: vat, categoryCode: 'S', categoryRate: 20 }],
  } as Invoice
}
