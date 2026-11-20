import type { Invoice } from '@stafyniaksacha/facturx/en16931'
import type { CrossIndustryInvoiceType } from '@stafyniaksacha/facturx/models'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { check, EN16931, extract, fromCii, invoiceToXml, toCii, xmlToInvoice } from '@stafyniaksacha/facturx'
import { XmlDocument } from 'libxml2-wasm'
import { describe, expect, it } from 'vitest'

const CORPUS_DIR = resolve(import.meta.dirname, '../spec/factur-x-1.09/distribution/5. FACTUR-X 1.09 - Examples/_Factur-X_1.08-Exemples_CS')
const ANNEX_B_DIR = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures')
const LINE_PATH = /\/ram:IncludedSupplyChainTradeLineItem\[/
const NS = { ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100' }

type Level = 'basic' | 'en16931' | 'extended' | 'extended-ctc-fr'

function pdfs(folder: string): string[] {
  const dir = join(CORPUS_DIR, folder)
  return readdirSync(dir).filter(f => f.endsWith('.pdf')).sort().map(f => join(dir, f))
}

async function ciiFromPdf(file: string): Promise<CrossIndustryInvoiceType> {
  const { xml } = await extract({ pdf: await readFile(file) })
  return xmlToInvoice(xml)
}

// Every annex B Factur-X CII document: EN 16931, EXTENDED (Factur-X) and EXTENDED-CTC-FR.
const annexBCii = readdirSync(ANNEX_B_DIR, { withFileTypes: true, recursive: true })
  .filter(e => e.isFile() && /_CII_Commentee\.xml$/.test(e.name))
  .map(e => join(e.parentPath ?? (e as { path?: string }).path ?? '', e.name))
  .sort()

// By file name: the F202500001 folder holds the EXTENDED Factur-X document under an `_EXTENDED-CTC-FR` directory.
function annexLevel(file: string): Level {
  const name = file.split('/').pop()!
  return name.includes('EXTENDED-CTC-FR') ? 'extended-ctc-fr' : name.includes('EXTENDED_FX') ? 'extended' : 'en16931'
}
const corpusLevel = (file: string): Level => file.includes('/2.BASIC/') ? 'basic' : file.includes('/4.EXTENDED/') ? 'extended' : 'en16931'

const linesOf = (cii: CrossIndustryInvoiceType) => cii.supplyChainTradeTransaction.includedSupplyChainTradeLineItem!

function lineDropped(dropped: string[]): string[] {
  return dropped.filter(p => LINE_PATH.test(p))
}

describe('en 16931 model: lines round trip', () => {
  it.each([...pdfs('2.BASIC'), ...pdfs('3.EN16931'), ...pdfs('4.EXTENDED')].map(f => [f.split('/').pop()!, f]))(
    'round-trips the lines of corpus %s',
    async (_name, file) => {
      const cii = await ciiFromPdf(file)
      const { invoice, dropped } = fromCii(cii)
      expect(invoice.lines.length).toBeGreaterThan(0)
      // No official example carries Factur-X-only line content: nothing is dropped, the lines compare equal.
      expect(lineDropped(dropped)).toEqual([])
      expect(linesOf(toCii(invoice, { level: corpusLevel(file) }))).toEqual(linesOf(cii))
    },
  )

  it.each(annexBCii.map(f => [f.split('/').pop()!, f]))('round-trips the lines of annex B %s', async (_name, file) => {
    const cii = await xmlToInvoice(await readFile(file))
    const { invoice, dropped } = fromCii(cii)
    expect(invoice.lines.length).toBeGreaterThan(0)
    expect(lineDropped(dropped)).toEqual([])
    expect(linesOf(toCii(invoice, { level: annexLevel(file) }))).toEqual(linesOf(cii))
  })

  const texts = (xml: string, xpath: string): string[] => {
    const doc = XmlDocument.fromString(xml)
    try {
      return doc.find(xpath, NS).map(n => n.content)
    }
    finally {
      doc.dispose()
    }
  }
  const stripZeros = (text: string) => text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text
  const NET = '//ram:IncludedSupplyChainTradeLineItem/ram:SpecifiedLineTradeAgreement/ram:NetPriceProductTradePrice/ram:ChargeAmount'
  const QTY = '//ram:IncludedSupplyChainTradeLineItem/ram:SpecifiedLineTradeDelivery/ram:BilledQuantity'

  it.each([['UC11', 'MULTI-VENDEUR_EXTENDED-CTC-FR'], ['UC13', 'BIDIRECTIONNELLE_EXTENDED-CTC-FR']])('keeps sub-cent unit prices and long quantities exact (%s)', async (uc, tail) => {
    const file = annexBCii.find(f => f.includes(`${uc}_`) && f.includes(tail))!
    const source = (await readFile(file)).toString()
    const { invoice } = fromCii(await xmlToInvoice(source))
    const sourcePrices = texts(source, NET)
    const sourceQuantities = texts(source, QTY)
    const priced = invoice.lines.filter(l => l.price !== undefined)
    expect(priced.map(l => l.price!.netPrice)).toEqual(sourcePrices.map(Number))
    expect(sourcePrices.some(p => /\.\d{3,}/.test(stripZeros(p)))).toBe(true)

    const xml = (await invoiceToXml(toCii(invoice, { level: 'extended-ctc-fr' }))).toString()
    // The same digits as the source (trailing zeros of the source are not significant), never rounded.
    expect(texts(xml, NET)).toEqual(sourcePrices.map(stripZeros))
    expect(texts(xml, QTY)).toEqual(sourceQuantities.map(stripZeros))
    expect(invoice.lines.filter(l => l.invoicedQuantity !== undefined).map(l => l.invoicedQuantity)).toEqual(sourceQuantities.map(Number))
  })

  it('keeps sub-line parent references and statuses flat (annex B UC12)', async () => {
    const file = annexBCii.find(f => f.includes('UC12_') && f.includes('EXTENDED-CTC-FR'))!
    const cii = await xmlToInvoice(await readFile(file))
    const { invoice, dropped } = fromCii(cii)
    expect(lineDropped(dropped)).toEqual([])
    expect(invoice.lines.map(l => [l.identifier, l.parentLineIdentifier, l.statusReasonCode])).toEqual([
      ['1', undefined, 'GROUP'],
      ['2', '1', 'DETAIL'],
      ['3', '1', 'DETAIL'],
      ['4', undefined, 'INFORMATION'],
    ])
    expect(invoice.lines[0].vat).toBeUndefined()
    expect(invoice.lines[1].vat).toEqual(new EN16931.LineVat({ categoryCode: 'S', rate: 10 }))
    const written = toCii(invoice, { level: 'extended-ctc-fr' })
    expect(linesOf(written)).toEqual(linesOf(cii))
    expect(linesOf(written)[0].specifiedLineTradeSettlement.applicableTradeTax).toEqual([])
  })

  // CG-69 (closed): both extended Schematrons want price, quantity and VAT category on a DETAIL or unset-subtype line
  // only. Annex B UC12 at each extended level: the rule fires on its source with a detail price removed, `toCii()`
  // refuses that invoice, and its GROUP (no VAT already) and INFORMATION lines written without price, quantity or VAT
  // pass the level Schematron.
  it.each([
    ['extended', 'EXTENDED_FX', 'BR-FXEXT-BR-26'],
    ['extended-ctc-fr', 'EXTENDED-CTC-FR', 'BR-FREXT-BR-26'],
  ] as const)('needs BG-29 / BT-129 / BG-30 on detail lines only at %s (annex B UC12, CG-69)', async (level, tag, rule) => {
    const file = annexBCii.find(f => f.includes('UC12_') && f.includes(`_${tag}_`))!
    const source = await readFile(file, 'utf8')
    const ruleIds = async (xml: string): Promise<string[]> => {
      const result = await check({ xml, level, schematron: true })
      expect(result.errors).toEqual([])
      return (result.schematronErrors ?? []).map(e => e.id ?? e.message)
    }
    expect(await ruleIds(source)).toEqual([])
    // The second NetPriceProductTradePrice is line 2's, a DETAIL line.
    let n = 0
    const unpriced = source.replace(/<ram:NetPriceProductTradePrice>[\s\S]*?<\/ram:NetPriceProductTradePrice>/g, m => ++n === 2 ? '' : m)
    expect(await ruleIds(unpriced)).toContain(rule)

    const { invoice } = fromCii(await xmlToInvoice(source))
    invoice.lines[1].price = undefined
    expect(() => toCii(invoice, { level })).toThrow(/^toCii: BG-29 .*"DETAIL" or not set/)

    const lines = fromCii(await xmlToInvoice(source)).invoice
    for (const i of [0, 3]) {
      expect(lines.lines[i].statusReasonCode).toBe(i === 0 ? 'GROUP' : 'INFORMATION')
      Object.assign(lines.lines[i], { price: undefined, vat: undefined, invoicedQuantity: undefined, invoicedQuantityUnitCode: undefined })
    }
    const doc = await invoiceToXml(toCii(lines, { level }))
    try {
      expect(await ruleIds(doc.toString())).toEqual([])
    }
    finally {
      doc.dispose()
    }
    // A blank EXT-FR-FE-163 is written as an empty `LineStatusReasonCode`, which the context does not select either
    // (neither absent nor `DETAIL`): the shared check lets it through, and the rule agrees.
    lines.lines[3].statusReasonCode = ''
    const blank = await invoiceToXml(toCii(lines, { level }))
    try {
      expect(blank.toString()).toMatch(/<ram:LineStatusReasonCode\/>/)
      expect(await ruleIds(blank.toString())).not.toContain(rule)
    }
    finally {
      blank.dispose()
    }
  })

  it('reads the multi-vendor lines of UC10: line seller, object identifiers, VAT with exemption reason and point date code', async () => {
    const file = annexBCii.find(f => f.includes('UC10_') && f.includes('EXTENDED-CTC-FR'))!
    const { invoice } = fromCii(await xmlToInvoice(await readFile(file)))
    const [group, detail] = invoice.lines
    expect(group.statusReasonCode).toBe('GROUP')
    expect(group.price).toBeUndefined()
    expect(group.invoicedQuantity).toBeUndefined()
    expect(group.objectIdentifiers).toHaveLength(2)
    expect(group.seller).toBeInstanceOf(EN16931.LineSeller)
    expect(detail.parentLineIdentifier).toBe('1')
    expect(detail.vat).toEqual(expect.objectContaining({ categoryCode: 'S', rate: 20, vatPointDateCode: '432', exemptionReason: expect.stringMatching(/^#/) }))
    expect(invoice.lines.some(l => typeof l.vatAmount === 'number')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Every line term, built by hand
// ---------------------------------------------------------------------------

const PARTIES = {
  seller: new EN16931.Seller({ name: 'S', address: new EN16931.PostalAddress({ countryCode: 'FR' }) }),
  buyer: new EN16931.Buyer({ name: 'B', address: new EN16931.PostalAddress({ countryCode: 'FR' }) }),
}
function MINIMAL_LINE(extra: object = {}) {
  return new EN16931.InvoiceLine({
    identifier: '1',
    invoicedQuantity: 2,
    invoicedQuantityUnitCode: 'C62',
    netAmount: 100,
    price: new EN16931.PriceDetails({ netPrice: 50 }),
    vat: new EN16931.LineVat({ categoryCode: 'S', rate: 20 }),
    item: new EN16931.Item({ name: 'Item' }),
    ...extra,
  })
}
function base(lines: InstanceType<typeof EN16931.InvoiceLine>[] = [MINIMAL_LINE()]) {
  return {
    number: 'F-1',
    issueDate: '2025-07-01',
    typeCode: '380',
    currencyCode: 'EUR',
    ...PARTIES,
    lines,
    totals: new EN16931.DocumentTotals({ sumOfInvoiceLineNetAmount: 100, invoiceTotalAmountWithoutVat: 100, invoiceTotalVatAmount: 20, invoiceTotalAmountWithVat: 120, amountDueForPayment: 120 }),
    vatBreakdown: [new EN16931.VatBreakdown({ categoryTaxableAmount: 100, categoryTaxAmount: 20, categoryCode: 'S', categoryRate: 20 })],
  }
}

// Strings with `&`, `<`, `«»` and non-ASCII, and numbers that a 2-decimal round would change.
const TEXT = (id: string) => `${id} & <é> «ü»`

function FULL_LINE() {
  return new EN16931.InvoiceLine({
    identifier: TEXT('L1'),
    notes: [
      new EN16931.LineNote({ note: TEXT('note1'), subjectCode: 'AAI' }),
      new EN16931.LineNote({ note: TEXT('note2') }),
    ],
    parentLineIdentifier: 'P-1',
    statusReasonCode: 'DETAIL',
    objectIdentifiers: [new EN16931.Identifier({ value: TEXT('obj'), schemeId: 'AWV' }), new EN16931.Identifier({ value: 'obj2' })],
    purchaseOrderLineReference: TEXT('POL'),
    buyerAccountingReference: TEXT('ACC'),
    invoicedQuantity: 12.3456789,
    invoicedQuantityUnitCode: 'LTR',
    unitsInParentLine: 3.25,
    unitsInParentLineUnitCode: 'C62',
    netAmount: 123.45,
    vatAmount: 24.69,
    vatAmountInAccountingCurrency: 27.1,
    grandTotalAmount: 148.14,
    period: new EN16931.LinePeriod({ startDate: '2025-01-01', endDate: '2025-06-30' }),
    allowances: [
      new EN16931.LineAllowance({ amount: 1.5, baseAmount: 10.25, percentage: 14.634, reasonCode: '95', reason: TEXT('rem') }),
      new EN16931.LineAllowance({ amount: 2 }),
    ],
    charges: [
      new EN16931.LineCharge({ amount: 3.5, baseAmount: 7, percentage: 50, reasonCode: 'FC', reason: TEXT('chg') }),
      new EN16931.LineCharge({ amount: 4, nonVatTaxCode: 'AAJ', reason: 'tax' }),
    ],
    price: new EN16931.PriceDetails({
      netPrice: 10.123456,
      priceBaseQuantity: 1.5,
      priceBaseQuantityUnitCode: 'LTR',
      grossPrice: 10.5,
      grossPriceBaseQuantity: 2.5,
      grossPriceBaseQuantityUnitCode: 'LTR',
      priceDiscount: 0.376544,
      priceDiscountReason: TEXT('disc'),
      priceDiscountReasonCode: '95',
    }),
    vat: new EN16931.LineVat({ categoryCode: 'E', rate: 0, exemptionReason: TEXT('ex'), exemptionReasonCode: 'VATEX-EU-79-C', vatPointDateCode: '432' }),
    item: new EN16931.Item({
      name: TEXT('item'),
      description: TEXT('desc'),
      sellersIdentifier: TEXT('S-1'),
      buyersIdentifier: TEXT('B-1'),
      standardIdentifier: new EN16931.Identifier({ value: '4012345678901', schemeId: '0160' }),
      attributes: [
        new EN16931.ItemAttribute({ name: TEXT('colour'), value: TEXT('rouge'), typeCode: 'COL', valueQuantity: 12.5, valueQuantityUnitCode: 'KGM' }),
        new EN16931.ItemAttribute({ name: 'size', value: 'XL' }),
      ],
      classifications: [
        new EN16931.ItemClassification({ code: '9873242', listId: 'STI', listVersionId: '2.0' }),
        new EN16931.ItemClassification({ code: 'X', listId: 'TST' }),
      ],
      countryOfOrigin: 'FR',
    }),
    purchaseOrderReference: TEXT('PO'),
    purchaseOrderDate: '2025-05-01',
    sellerOrderReference: new EN16931.LineSellerOrderReference({ orderReference: TEXT('SO'), orderLineReference: 'SO-1' }),
    despatchAdviceReference: new EN16931.LineDespatchAdviceReference({ reference: TEXT('DA'), lineReference: 'DA-1', issueDate: '2025-05-02' }),
    receivingAdviceReference: new EN16931.LineReceivingAdviceReference({ reference: TEXT('RA'), lineReference: 'RA-1' }),
    precedingInvoiceReferences: [new EN16931.LinePrecedingInvoiceReference({ reference: TEXT('INV0'), lineReference: '7', typeCode: '380', issueDate: '2025-04-01' })],
    deliverTo: new EN16931.LineDeliverTo({
      identifiers: [new EN16931.Identifier({ value: TEXT('loc'), schemeId: '0088' }), new EN16931.Identifier({ value: 'loc2', schemeId: '0060' })],
      name: TEXT('Entrepôt'),
      address: new EN16931.PostalAddress({ addressLine1: TEXT('a1'), addressLine2: 'a2', addressLine3: 'a3', city: 'Lyon', postCode: '69001', countrySubdivision: 'ARA', countryCode: 'FR' }),
    }),
    actualDelivery: new EN16931.LineActualDelivery({ actualDeliveryDate: '2025-05-03' }),
    seller: new EN16931.LineSeller({
      identifiers: [new EN16931.Identifier({ value: TEXT('sid'), schemeId: '0088' })],
      name: TEXT('Vendeur'),
      tradingName: TEXT('Enseigne'),
      legalRegistrationIdentifier: new EN16931.Identifier({ value: '123456789', schemeId: '0002' }),
      electronicAddress: new EN16931.Identifier({ value: 'seller@example.org', schemeId: 'EM' }),
      vatIdentifier: 'FR12345678901',
      taxRegistrationIdentifier: '123 456',
      address: new EN16931.PostalAddress({ addressLine1: 's1', addressLine2: 's2', addressLine3: 's3', city: 'Paris', postCode: '75001', countrySubdivision: 'IDF', countryCode: 'FR' }),
    }),
    deliveryTerms: new EN16931.LineDeliveryTerms({ deliveryTypeCode: 'DAP', locationName: TEXT('Quai') }),
  })
}

function ciiOf(line: InstanceType<typeof EN16931.InvoiceLine>, level: Level = 'extended-ctc-fr', extra: object = {}) {
  return toCii(new EN16931.Invoice({ ...base([line]), vatAccountingCurrencyCode: 'USD', ...extra }), { level })
}

describe('en 16931 model: line terms', () => {
  it('round-trips every line term, the EXT-FR-FE ones included, with nothing dropped', () => {
    const line = FULL_LINE()
    for (const level of ['extended', 'extended-ctc-fr'] as const) {
      const cii = ciiOf(line, level)
      const back = fromCii(cii)
      expect(back.invoice.lines).toEqual([line])
      expect(back.invoice.lines[0]).toBeInstanceOf(EN16931.InvoiceLine)
      expect(back.invoice.lines[0].price).toBeInstanceOf(EN16931.PriceDetails)
      expect(back.invoice.lines[0].item.attributes[0]).toBeInstanceOf(EN16931.ItemAttribute)
      expect(lineDropped(back.dropped)).toEqual([])
      expect(linesOf(toCii(back.invoice, { level }))).toEqual(linesOf(cii))
    }
  })

  it('places each line term in the CII element the Factur-X matrix names', () => {
    const [item] = linesOf(ciiOf(FULL_LINE()))
    const doc = item.associatedDocumentLineDocument
    expect(doc.lineID.value).toBe(TEXT('L1'))
    expect(doc.parentLineID?.value).toBe('P-1')
    expect(doc.lineStatusReasonCode?.value).toBe('DETAIL')
    expect(doc.includedNote!.map(n => [n.content.value, n.subjectCode?.value])).toEqual([[TEXT('note1'), 'AAI'], [TEXT('note2'), undefined]])
    const product = item.specifiedTradeProduct
    expect(product.name.value).toBe(TEXT('item'))
    expect(product.description?.value).toBe(TEXT('desc'))
    expect(product.sellerAssignedID?.value).toBe(TEXT('S-1'))
    expect(product.buyerAssignedID?.value).toBe(TEXT('B-1'))
    expect(product.globalID).toEqual(expect.objectContaining({ value: '4012345678901', schemeID: '0160' }))
    expect(product.originTradeCountry?.id?.value).toBe('FR')
    expect(product.applicableProductCharacteristic![0]).toEqual(expect.objectContaining({
      typeCode: expect.objectContaining({ value: 'COL' }),
      description: expect.objectContaining({ value: TEXT('colour') }),
      value: expect.objectContaining({ value: TEXT('rouge') }),
      valueMeasure: expect.objectContaining({ value: 12.5, unitCode: 'KGM' }),
    }))
    expect(product.designatedProductClassification![0].classCode).toEqual(expect.objectContaining({ value: '9873242', listID: 'STI', listVersionID: '2.0' }))

    const agreement = item.specifiedLineTradeAgreement!
    expect(agreement.netPriceProductTradePrice!.chargeAmount.value).toBe(10.123456)
    expect(agreement.netPriceProductTradePrice!.basisQuantity).toEqual(expect.objectContaining({ value: 1.5, unitCode: 'LTR' }))
    const gross = agreement.grossPriceProductTradePrice!
    expect(gross.chargeAmount.value).toBe(10.5)
    expect(gross.basisQuantity).toEqual(expect.objectContaining({ value: 2.5, unitCode: 'LTR' }))
    expect(gross.appliedTradeAllowanceCharge![0]).toEqual(expect.objectContaining({
      chargeIndicator: expect.objectContaining({ indicator: false }),
      actualAmount: expect.objectContaining({ value: 0.376544 }),
      reason: expect.objectContaining({ value: TEXT('disc') }),
      reasonCode: expect.objectContaining({ value: '95' }),
    }))
    expect(agreement.buyerOrderReferencedDocument).toEqual(expect.objectContaining({
      issuerAssignedID: expect.objectContaining({ value: TEXT('PO') }),
      lineID: expect.objectContaining({ value: TEXT('POL') }),
      formattedIssueDateTime: expect.objectContaining({ dateTimeString: '20250501', format: '102' }),
    }))
    expect(agreement.sellerOrderReferencedDocument).toEqual(expect.objectContaining({
      issuerAssignedID: expect.objectContaining({ value: TEXT('SO') }),
      lineID: expect.objectContaining({ value: 'SO-1' }),
    }))
    expect(agreement.applicableTradeDeliveryTerms).toEqual(expect.objectContaining({
      deliveryTypeCode: expect.objectContaining({ value: 'DAP' }),
      relevantTradeLocation: expect.objectContaining({ name: expect.objectContaining({ value: TEXT('Quai') }) }),
    }))
    const seller = agreement.itemSellerTradeParty!
    expect(seller.globalID![0]).toEqual(expect.objectContaining({ value: TEXT('sid'), schemeID: '0088' }))
    expect(seller.name?.value).toBe(TEXT('Vendeur'))
    expect(seller.specifiedLegalOrganization).toEqual(expect.objectContaining({
      id: expect.objectContaining({ value: '123456789', schemeID: '0002' }),
      tradingBusinessName: expect.objectContaining({ value: TEXT('Enseigne') }),
    }))
    expect(seller.uriUniversalCommunication?.uriID).toEqual(expect.objectContaining({ value: 'seller@example.org', schemeID: 'EM' }))
    expect(seller.specifiedTaxRegistration!.map(t => [t.id.value, t.id.schemeID])).toEqual([['FR12345678901', 'VA'], ['123 456', 'FC']])
    expect(seller.postalTradeAddress).toEqual(expect.objectContaining({
      lineOne: expect.objectContaining({ value: 's1' }),
      lineTwo: expect.objectContaining({ value: 's2' }),
      lineThree: expect.objectContaining({ value: 's3' }),
      cityName: expect.objectContaining({ value: 'Paris' }),
      postcodeCode: expect.objectContaining({ value: '75001' }),
      countrySubDivisionName: [expect.objectContaining({ value: 'IDF' })],
      countryID: expect.objectContaining({ value: 'FR' }),
    }))

    const delivery = item.specifiedLineTradeDelivery!
    expect(delivery.billedQuantity).toEqual(expect.objectContaining({ value: 12.3456789, unitCode: 'LTR' }))
    expect(delivery.perPackageUnitQuantity).toEqual(expect.objectContaining({ value: 3.25, unitCode: 'C62' }))
    expect(delivery.shipToTradeParty!.globalID!.map(g => [g.value, g.schemeID])).toEqual([[TEXT('loc'), '0088'], ['loc2', '0060']])
    expect(delivery.shipToTradeParty!.name?.value).toBe(TEXT('Entrepôt'))
    expect(delivery.shipToTradeParty!.postalTradeAddress!.cityName?.value).toBe('Lyon')
    expect(delivery.actualDeliverySupplyChainEvent!.occurrenceDateTime).toEqual(expect.objectContaining({ dateTimeString: '20250503', format: '102' }))
    expect(delivery.despatchAdviceReferencedDocument).toEqual(expect.objectContaining({
      issuerAssignedID: expect.objectContaining({ value: TEXT('DA') }),
      lineID: expect.objectContaining({ value: 'DA-1' }),
      formattedIssueDateTime: expect.objectContaining({ dateTimeString: '20250502' }),
    }))
    expect(delivery.receivingAdviceReferencedDocument).toEqual(expect.objectContaining({
      issuerAssignedID: expect.objectContaining({ value: TEXT('RA') }),
      lineID: expect.objectContaining({ value: 'RA-1' }),
    }))

    const settlement = item.specifiedLineTradeSettlement
    expect(settlement.applicableTradeTax[0]).toEqual(expect.objectContaining({
      typeCode: expect.objectContaining({ value: 'VAT' }),
      categoryCode: expect.objectContaining({ value: 'E' }),
      rateApplicablePercent: expect.objectContaining({ value: 0 }),
      exemptionReason: expect.objectContaining({ value: TEXT('ex') }),
      exemptionReasonCode: expect.objectContaining({ value: 'VATEX-EU-79-C' }),
      // BT-8 style: UNTDID 2005 432 in the model, UNTDID 2475 72 in CII.
      dueDateTypeCode: expect.objectContaining({ value: '72' }),
    }))
    expect(settlement.billingSpecifiedPeriod).toEqual(expect.objectContaining({
      startDateTime: expect.objectContaining({ dateTimeString: '20250101', format: '102' }),
      endDateTime: expect.objectContaining({ dateTimeString: '20250630', format: '102' }),
    }))
    expect(settlement.specifiedTradeAllowanceCharge!.map(a => [a.chargeIndicator.indicator, a.actualAmount.value, a.reasonCode?.value, a.reasonCode?.listID])).toEqual([
      [false, 1.5, '95', undefined],
      [false, 2, undefined, undefined],
      [true, 3.5, 'FC', undefined],
      [true, 4, 'AAJ', '5153'],
    ])
    expect(settlement.specifiedTradeAllowanceCharge![0]).toEqual(expect.objectContaining({
      basisAmount: expect.objectContaining({ value: 10.25 }),
      calculationPercent: expect.objectContaining({ value: 14.634 }),
      reason: expect.objectContaining({ value: TEXT('rem') }),
    }))
    const sum = settlement.specifiedTradeSettlementLineMonetarySummation!
    expect(sum.lineTotalAmount!.value).toBe(123.45)
    expect(sum.taxTotalAmount).toEqual(expect.objectContaining({ value: 24.69, currencyID: 'EUR' }))
    expect(sum.taxTotalAmountInAccountingCurrency).toEqual(expect.objectContaining({ value: 27.1, currencyID: 'USD' }))
    expect(sum.grandTotalAmount!.value).toBe(148.14)
    expect(settlement.invoiceReferencedDocument).toEqual(expect.objectContaining({
      issuerAssignedID: expect.objectContaining({ value: TEXT('INV0') }),
      lineID: expect.objectContaining({ value: '7' }),
      typeCode: expect.objectContaining({ value: '380' }),
      formattedIssueDateTime: expect.objectContaining({ dateTimeString: '20250401', format: '102' }),
    }))
    expect(settlement.additionalReferencedDocument!.map(d => [d.typeCode?.value, d.issuerAssignedID?.value, d.referenceTypeCode?.value])).toEqual([['130', TEXT('obj'), 'AWV'], ['130', 'obj2', undefined]])
    expect(settlement.receivableSpecifiedTradeAccountingAccount![0].id.value).toBe(TEXT('ACC'))
  })

  it('writes the XML at the element positions of the EXTENDED sequence', async () => {
    const xml = (await invoiceToXml(ciiOf(FULL_LINE()))).toString()
    const doc = XmlDocument.fromString(xml)
    try {
      const at = (xpath: string) => doc.find(`//ram:IncludedSupplyChainTradeLineItem${xpath}`, NS).map(n => n.content)
      expect(at('/ram:SpecifiedLineTradeAgreement/ram:NetPriceProductTradePrice/ram:ChargeAmount')).toEqual(['10.123456'])
      expect(at('/ram:SpecifiedLineTradeDelivery/ram:BilledQuantity')).toEqual(['12.3456789'])
      expect(at('/ram:SpecifiedLineTradeSettlement/ram:SpecifiedTradeSettlementLineMonetarySummation/ram:LineTotalAmount')).toEqual(['123.45'])
      expect(at('/ram:SpecifiedLineTradeSettlement/ram:SpecifiedTradeSettlementLineMonetarySummation/ram:TaxTotalAmount')).toEqual(['24.69', '27.10'])
      expect(at('/ram:SpecifiedLineTradeAgreement/ram:GrossPriceProductTradePrice/ram:AppliedTradeAllowanceCharge/ram:ActualAmount')).toEqual(['0.376544'])
    }
    finally {
      doc.dispose()
    }
  })

  // The XSD of the level accepts what `toCii()` writes for every line term the level carries.
  async function xsdErrors(line: InstanceType<typeof EN16931.InvoiceLine>, level: Level): Promise<string[]> {
    const xml = (await invoiceToXml(ciiOf(line, level))).toString()
    return (await check({ xml, level })).errors
  }
  const EN_LINE = () => new EN16931.InvoiceLine({
    ...FULL_LINE(),
    notes: [new EN16931.LineNote({ note: 'n' })],
    parentLineIdentifier: undefined,
    statusReasonCode: undefined,
    objectIdentifiers: [new EN16931.Identifier({ value: 'obj', schemeId: 'AWV' })],
    unitsInParentLine: undefined,
    unitsInParentLineUnitCode: undefined,
    vatAmount: undefined,
    vatAmountInAccountingCurrency: undefined,
    grandTotalAmount: undefined,
    charges: [new EN16931.LineCharge({ amount: 3.5, baseAmount: 7, percentage: 50, reasonCode: 'FC', reason: 'c' })],
    price: new EN16931.PriceDetails({ netPrice: 10.123456, priceBaseQuantity: 1.5, priceBaseQuantityUnitCode: 'LTR', grossPrice: 10.5, grossPriceBaseQuantity: 2.5, grossPriceBaseQuantityUnitCode: 'LTR', priceDiscount: 0.376544 }),
    vat: new EN16931.LineVat({ categoryCode: 'E', rate: 0 }),
    item: new EN16931.Item({
      ...FULL_LINE().item,
      attributes: [new EN16931.ItemAttribute({ name: 'colour', value: 'rouge' })],
    }),
    purchaseOrderReference: undefined,
    purchaseOrderDate: undefined,
    sellerOrderReference: undefined,
    despatchAdviceReference: undefined,
    receivingAdviceReference: undefined,
    precedingInvoiceReferences: [],
    deliverTo: undefined,
    actualDelivery: undefined,
    seller: undefined,
    deliveryTerms: undefined,
  })

  it.each(['extended', 'extended-ctc-fr'] as const)('writes XML that the %s XSD accepts, every line term included', async (level) => {
    expect(await xsdErrors(FULL_LINE(), level)).toEqual([])
    // The three VAT block shapes of 1.09.2.fixFR04: no block, a block without codes, a coded block. Only a line that is
    // not a detail line may go without the category (CG-69): an INFORMATION line here.
    for (const vat of [undefined, new EN16931.LineVat({ rate: 5 }), new EN16931.LineVat({}), new EN16931.LineVat({ categoryCode: 'S', rate: 5 })])
      expect(await xsdErrors(MINIMAL_LINE({ vat, statusReasonCode: 'INFORMATION' }), level)).toEqual([])
    // A group line: no price, quantity or VAT block.
    expect(await xsdErrors(MINIMAL_LINE({ price: undefined, vat: undefined, invoicedQuantity: undefined, invoicedQuantityUnitCode: undefined, statusReasonCode: 'GROUP' }), level)).toEqual([])
  })

  it.each(['en16931', 'basic'] as const)('writes XML that the %s XSD accepts, every line term the level carries', async (level) => {
    const line = level === 'basic'
      ? MINIMAL_LINE({
          notes: [new EN16931.LineNote({ note: 'n' })],
          period: new EN16931.LinePeriod({ startDate: '2025-01-01', endDate: '2025-02-01' }),
          allowances: [new EN16931.LineAllowance({ amount: 1, reasonCode: '95', reason: 'r' })],
          charges: [new EN16931.LineCharge({ amount: 1, reasonCode: 'FC', reason: 'r' })],
          price: new EN16931.PriceDetails({ netPrice: 1.123456, priceBaseQuantity: 1, priceBaseQuantityUnitCode: 'C62', grossPrice: 2, grossPriceBaseQuantity: 1, grossPriceBaseQuantityUnitCode: 'C62', priceDiscount: 0.876544 }),
          item: new EN16931.Item({ name: 'N', standardIdentifier: new EN16931.Identifier({ value: '4012345678901', schemeId: '0160' }) }),
        })
      : EN_LINE()
    expect(await xsdErrors(line, level)).toEqual([])
  })

  it('keeps several notes and object identifiers only where the XSD of the level allows them', async () => {
    const line = MINIMAL_LINE({
      notes: [new EN16931.LineNote({ note: 'a' }), new EN16931.LineNote({ note: 'b' })],
      objectIdentifiers: [new EN16931.Identifier({ value: 'o1', schemeId: 'AWV' }), new EN16931.Identifier({ value: 'o2', schemeId: 'AWV' })],
    })
    expect(await xsdErrors(line, 'extended')).toEqual([])
    expect(await xsdErrors(line, 'extended-ctc-fr')).toEqual([])
  })

  it('does not throw in fromCii on a line delivery date that is not format 102: the date is dropped', async () => {
    const file = annexBCii.find(f => f.includes('UC12_') && f.includes('EXTENDED-CTC-FR'))!
    const source = (await readFile(file)).toString()
    const xml = source.replace('<ram:SpecifiedLineTradeDelivery>', '<ram:SpecifiedLineTradeDelivery><ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="203">202501011200</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>')
    expect(xml).not.toBe(source)
    const { invoice, dropped } = fromCii(await xmlToInvoice(xml))
    expect(dropped.some(p => p.includes('IncludedSupplyChainTradeLineItem[1]') && p.includes('ActualDeliverySupplyChainEvent'))).toBe(true)
    expect(invoice.lines[0].actualDelivery?.actualDeliveryDate).toBe('')
    expect(() => toCii(invoice, { level: 'extended-ctc-fr' })).toThrow(/EXT-FR-FE-158/)
  })

  it.each(['basic', 'en16931'] as const)('has the %s XSD reject a second note written into the CII, which justifies the toCii throw', async (level) => {
    const cii = ciiOf(MINIMAL_LINE({ notes: [new EN16931.LineNote({ note: 'a' })] }), level)
    const doc = linesOf(cii)[0].associatedDocumentLineDocument
    doc.includedNote = [...doc.includedNote!, ...doc.includedNote!]
    const xml = (await invoiceToXml(cii)).toString()
    expect((await check({ xml, level })).errors.length).toBeGreaterThan(0)
  })

  it('has the en16931 XSD reject a second line object identifier written into the CII', async () => {
    const cii = ciiOf(MINIMAL_LINE({ objectIdentifiers: [new EN16931.Identifier({ value: 'a' })] }), 'en16931')
    const settlement = linesOf(cii)[0].specifiedLineTradeSettlement
    settlement.additionalReferencedDocument = [...settlement.additionalReferencedDocument!, ...settlement.additionalReferencedDocument!]
    const xml = (await invoiceToXml(cii)).toString()
    expect((await check({ xml, level: 'en16931' })).errors.length).toBeGreaterThan(0)
  })

  it('throws on a line period without a date (BR-CO-20) in toCii, naming the term', () => {
    const text = (() => {
      try {
        toCii(new EN16931.Invoice(base([MINIMAL_LINE({ period: new EN16931.LinePeriod({}) })])), { level: 'en16931' })
      }
      catch (error) {
        return (error as Error).message
      }
      return ''
    })()
    expect(text).toMatch(/BG-26.*BR-CO-20/)
  })

  // On an INFORMATION line: a detail line needs BG-30 with BT-151 at the extended levels (CG-69).
  it('writes a line without VAT block, with an empty block, and with a block without codes, apart', () => {
    const info = { statusReasonCode: 'INFORMATION' }
    const none = linesOf(ciiOf(MINIMAL_LINE({ vat: undefined, ...info })))[0]
    expect(none.specifiedLineTradeSettlement.applicableTradeTax).toEqual([])
    const noCodes = linesOf(ciiOf(MINIMAL_LINE({ vat: new EN16931.LineVat({ rate: 5 }), ...info })))[0].specifiedLineTradeSettlement.applicableTradeTax
    expect(noCodes).toHaveLength(1)
    expect(noCodes[0].typeCode).toBeUndefined()
    expect(noCodes[0].categoryCode).toBeUndefined()
    expect(noCodes[0].rateApplicablePercent?.value).toBe(5)
    const empty = linesOf(ciiOf(MINIMAL_LINE({ vat: new EN16931.LineVat({}), ...info })))[0].specifiedLineTradeSettlement.applicableTradeTax
    expect(empty).toHaveLength(1)
    // And each reads back as what it was.
    for (const vat of [undefined, new EN16931.LineVat({ rate: 5 }), new EN16931.LineVat({}), new EN16931.LineVat({ categoryCode: 'S', rate: 5 })]) {
      const line = MINIMAL_LINE({ vat, ...info })
      expect(fromCii(ciiOf(line)).invoice.lines[0].vat).toEqual(vat)
    }
  })

  it('reports the Factur-X-only line fields, which have no EN 16931 / EXT-FR-FE id', () => {
    const cii = ciiOf(MINIMAL_LINE())
    const line = linesOf(cii)[0]
    line.associatedDocumentLineDocument.lineStatusCode = { value: 'SECRET' } as never
    line.specifiedTradeProduct.brandName = { value: 'SECRET' } as never
    line.specifiedLineTradeDelivery!.chargeFreeQuantity = { value: 3 } as never
    line.specifiedLineTradeAgreement!.quotationReferencedDocument = { issuerAssignedID: { value: 'SECRET' } } as never
    const { dropped } = fromCii(cii)
    expect(lineDropped(dropped).sort()).toEqual([
      '/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:IncludedSupplyChainTradeLineItem[1]/ram:AssociatedDocumentLineDocument/ram:LineStatusCode',
      '/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:IncludedSupplyChainTradeLineItem[1]/ram:SpecifiedLineTradeAgreement/ram:QuotationReferencedDocument/ram:IssuerAssignedID',
      '/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:IncludedSupplyChainTradeLineItem[1]/ram:SpecifiedLineTradeDelivery/ram:ChargeFreeQuantity',
      '/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:IncludedSupplyChainTradeLineItem[1]/ram:SpecifiedTradeProduct/ram:BrandName',
    ].sort())
    expect(dropped.join('\n')).not.toContain('SECRET')
  })

  it('reads a second VAT block of a line, which the model cannot hold, into dropped', () => {
    const cii = ciiOf(MINIMAL_LINE())
    const tax = linesOf(cii)[0].specifiedLineTradeSettlement.applicableTradeTax
    tax.push(tax[0])
    const { dropped } = fromCii(cii)
    expect(lineDropped(dropped).some(p => p.includes('ApplicableTradeTax[2]'))).toBe(true)
  })

  it('stands in empty mandatory line terms for a document without them, which toCii rejects', () => {
    const cii = ciiOf(MINIMAL_LINE())
    const item = linesOf(cii)[0]
    item.specifiedLineTradeSettlement.specifiedTradeSettlementLineMonetarySummation = undefined
    item.specifiedLineTradeAgreement = undefined
    item.specifiedLineTradeDelivery = undefined
    const { invoice } = fromCii(cii)
    expect(invoice.lines[0].netAmount).toBeNaN()
    expect(invoice.lines[0].price).toBeUndefined()
    expect(invoice.lines[0].invoicedQuantity).toBeUndefined()
    expect(() => toCii(invoice, { level: 'en16931' })).toThrow(/BT-131/)
  })

  it('exposes the lines from the model, and holds them in a plain array', () => {
    const invoice = new EN16931.Invoice(base([MINIMAL_LINE(), MINIMAL_LINE({ identifier: '2' })]))
    expect(invoice.lines.map(l => l.identifier)).toEqual(['1', '2'])
    expect(linesOf(toCii(invoice, { level: 'en16931' })).map(l => l.associatedDocumentLineDocument.lineID.value)).toEqual(['1', '2'])
  })
})

// ---------------------------------------------------------------------------
// Level gates and mandatory terms
// ---------------------------------------------------------------------------

describe('en 16931 model: line level gates and mandatory terms', () => {
  function message(invoice: Invoice, level: Level): string {
    try {
      toCii(invoice, { level })
    }
    catch (error) {
      return (error as Error).message
    }
    return ''
  }
  const withLine = (extra: object) => new EN16931.Invoice(base([MINIMAL_LINE(extra)]))
  const withItem = (extra: object) => withLine({ item: new EN16931.Item({ name: 'Item', ...extra }) })
  const withPrice = (extra: object) => withLine({ price: new EN16931.PriceDetails({ netPrice: 50, ...extra }) })
  const S = 'SECRET-VALUE'

  it.each([
    ['BT-128', { objectIdentifiers: [new EN16931.Identifier({ value: S })] }],
    ['BT-132', { purchaseOrderLineReference: S }],
    ['BT-133', { buyerAccountingReference: S }],
    ['BT-137', { allowances: [new EN16931.LineAllowance({ amount: 1, baseAmount: 5, reason: S })] }],
    ['BT-138', { allowances: [new EN16931.LineAllowance({ amount: 1, percentage: 5, reason: S })] }],
    ['BT-142', { charges: [new EN16931.LineCharge({ amount: 1, baseAmount: 5, reason: S })] }],
    ['BT-143', { charges: [new EN16931.LineCharge({ amount: 1, percentage: 5, reason: S })] }],
    ['BT-154', { item: new EN16931.Item({ name: 'N', description: S }) }],
    ['BT-155', { item: new EN16931.Item({ name: 'N', sellersIdentifier: S }) }],
    ['BT-156', { item: new EN16931.Item({ name: 'N', buyersIdentifier: S }) }],
    ['BG-32', { item: new EN16931.Item({ name: 'N', attributes: [new EN16931.ItemAttribute({ name: S, value: 'v' })] }) }],
    ['BT-158', { item: new EN16931.Item({ name: 'N', classifications: [new EN16931.ItemClassification({ code: S, listId: 'STI' })] }) }],
    ['BT-159', { item: new EN16931.Item({ name: 'N', countryOfOrigin: 'FR' }) }],
  ])('throws, naming %s and not the value, at basic', (id, extra) => {
    const text = message(withLine(extra), 'basic')
    expect(text).toContain(id)
    expect(text).toContain('basic')
    expect(text).not.toMatch(/SECRET/)
    expect(message(withLine(extra), 'en16931')).toBe('')
  })

  it.each([
    ['BT-193', { charges: [new EN16931.LineCharge({ amount: 1, nonVatTaxCode: S })] }],
    ['EXT-FR-FE-162', { parentLineIdentifier: S }],
    ['EXT-FR-FE-163', { statusReasonCode: S }],
    ['EXT-FR-FE-183', { notes: [new EN16931.LineNote({ note: 'n', subjectCode: S })] }],
    ['EXT-FR-FE-135', { purchaseOrderReference: S }],
    ['EXT-FR-FE-200', { purchaseOrderDate: '2025-01-01' }],
    ['EXT-FR-FE-191', { unitsInParentLine: 2, unitsInParentLineUnitCode: 'C62' }],
    ['EXT-FR-FE-181', { vatAmount: 1 }],
    ['EXT-FR-FE-182', { vatAmountInAccountingCurrency: 1 }],
    ['EXT-FR-FE-184', { grandTotalAmount: 1 }],
    ['EXT-FR-FE-BG-06', { precedingInvoiceReferences: [new EN16931.LinePrecedingInvoiceReference({ reference: S })] }],
    ['EXT-FR-FE-BG-07', { despatchAdviceReference: new EN16931.LineDespatchAdviceReference({ reference: S }) }],
    ['EXT-FR-FE-BG-08', { receivingAdviceReference: new EN16931.LineReceivingAdviceReference({ reference: S }) }],
    ['EXT-FR-FE-BG-09', { sellerOrderReference: new EN16931.LineSellerOrderReference({ orderReference: S }) }],
    ['EXT-FR-FE-BG-10', { deliverTo: new EN16931.LineDeliverTo({ name: S }) }],
    ['EXT-FR-FE-BG-11', { actualDelivery: new EN16931.LineActualDelivery({ actualDeliveryDate: '2025-01-01' }) }],
    ['EXT-FR-FE-BG-12', { seller: new EN16931.LineSeller({ name: S }) }],
    ['EXT-FR-FE-BG-15', { deliveryTerms: new EN16931.LineDeliveryTerms({ deliveryTypeCode: S }) }],
    ['EXT-FR-FE-178', { vat: new EN16931.LineVat({ categoryCode: 'E', exemptionReason: S }) }],
    ['EXT-FR-FE-179', { vat: new EN16931.LineVat({ categoryCode: 'E', exemptionReasonCode: S }) }],
    ['EXT-FR-FE-180', { vat: new EN16931.LineVat({ categoryCode: 'S', vatPointDateCode: '432' }) }],
    ['EXT-FR-FE-195', { price: new EN16931.PriceDetails({ netPrice: 1, grossPrice: 2, priceDiscount: 1, priceDiscountReason: S }) }],
    ['EXT-FR-FE-196', { price: new EN16931.PriceDetails({ netPrice: 1, grossPrice: 2, priceDiscount: 1, priceDiscountReasonCode: S }) }],
  ])('throws, naming %s and not the value, below the extended levels', (id, extra) => {
    const invoice = new EN16931.Invoice({ ...base([MINIMAL_LINE(extra)]), vatAccountingCurrencyCode: 'USD' })
    for (const level of ['basic', 'en16931'] as const) {
      const text = message(invoice, level)
      expect(text, level).toContain(id)
      expect(text, level).toContain(level)
      expect(text, level).not.toMatch(/SECRET/)
    }
    expect(message(invoice, 'extended')).toBe('')
    expect(message(invoice, 'extended-ctc-fr')).toBe('')
  })

  // BG-32 itself is not in BASIC: only the en16931 level reaches the EXT-FR-FE fields of an attribute.
  it.each([
    ['EXT-FR-FE-159', { item: new EN16931.Item({ name: 'N', attributes: [new EN16931.ItemAttribute({ name: 'a', value: 'v', typeCode: S })] }) }],
    ['EXT-FR-FE-160', { item: new EN16931.Item({ name: 'N', attributes: [new EN16931.ItemAttribute({ name: 'a', value: 'v', valueQuantity: 1, valueQuantityUnitCode: 'C62' })] }) }],
  ])('throws, naming %s and not the value, at en16931', (id, extra) => {
    const text = message(withLine(extra), 'en16931')
    expect(text).toContain(id)
    expect(text).not.toMatch(/SECRET/)
    expect(message(withLine(extra), 'extended')).toBe('')
  })

  it('carries the other line terms at basic', () => {
    const line = MINIMAL_LINE({
      notes: [new EN16931.LineNote({ note: 'n' })],
      period: new EN16931.LinePeriod({ startDate: '2025-01-01' }),
      allowances: [new EN16931.LineAllowance({ amount: 1, reasonCode: '95', reason: 'r' })],
      charges: [new EN16931.LineCharge({ amount: 1, reasonCode: 'FC', reason: 'r' })],
      price: new EN16931.PriceDetails({ netPrice: 1, priceBaseQuantity: 1, priceBaseQuantityUnitCode: 'C62', grossPrice: 2, grossPriceBaseQuantity: 1, grossPriceBaseQuantityUnitCode: 'C62', priceDiscount: 1 }),
      item: new EN16931.Item({ name: 'N', standardIdentifier: new EN16931.Identifier({ value: '1', schemeId: '0160' }) }),
    })
    expect(message(new EN16931.Invoice(base([line])), 'basic')).toBe('')
  })

  it.each([
    ['BG-25', { lines: [] }],
    ['BT-126', { lines: [MINIMAL_LINE({ identifier: '' })] }],
    ['BT-131', { lines: [MINIMAL_LINE({ netAmount: Number.NaN })] }],
    ['BT-129', { lines: [MINIMAL_LINE({ invoicedQuantity: undefined, invoicedQuantityUnitCode: undefined })] }],
    ['BT-129', { lines: [MINIMAL_LINE({ invoicedQuantity: Number.NaN })] }],
    ['BT-130', { lines: [MINIMAL_LINE({ invoicedQuantityUnitCode: undefined })] }],
    ['BG-29', { lines: [MINIMAL_LINE({ price: undefined })] }],
    ['BT-146', { lines: [MINIMAL_LINE({ price: new EN16931.PriceDetails({ netPrice: Number.NaN }) })] }],
    ['BG-30', { lines: [MINIMAL_LINE({ vat: undefined })] }],
    ['BT-151', { lines: [MINIMAL_LINE({ vat: new EN16931.LineVat({ rate: 20 }) })] }],
    ['BT-153', { lines: [MINIMAL_LINE({ item: new EN16931.Item({ name: '' }) })] }],
    ['BT-157-1', { lines: [MINIMAL_LINE({ item: new EN16931.Item({ name: 'N', standardIdentifier: new EN16931.Identifier({ value: '1' }) }) })] }],
    ['BT-160', { lines: [MINIMAL_LINE({ item: new EN16931.Item({ name: 'N', attributes: [new EN16931.ItemAttribute({ name: '', value: 'v' })] }) })] }],
    ['BT-161', { lines: [MINIMAL_LINE({ item: new EN16931.Item({ name: 'N', attributes: [new EN16931.ItemAttribute({ name: 'a' })] }) })] }],
    ['BT-158', { lines: [MINIMAL_LINE({ item: new EN16931.Item({ name: 'N', classifications: [new EN16931.ItemClassification({ code: '', listId: 'STI' })] }) })] }],
    ['BT-158-1', { lines: [MINIMAL_LINE({ item: new EN16931.Item({ name: 'N', classifications: [new EN16931.ItemClassification({ code: '1', listId: '' })] }) })] }],
    ['BT-136', { lines: [MINIMAL_LINE({ allowances: [new EN16931.LineAllowance({ amount: Number.NaN })] })] }],
    ['BT-141', { lines: [MINIMAL_LINE({ charges: [new EN16931.LineCharge({ amount: Number.NaN })] })] }],
  ] as const)('throws on a missing or empty mandatory %s at en16931', (id, extra) => {
    expect(message(new EN16931.Invoice({ ...base(), ...extra } as never), 'en16931')).toMatch(new RegExp(`${id}[ )]`))
  })

  it('makes BG-29, BG-30, BT-129, BT-151 and BT-161 optional at the extended levels (information and sub-lines)', () => {
    const line = MINIMAL_LINE({
      statusReasonCode: 'GROUP',
      price: undefined,
      vat: undefined,
      invoicedQuantity: undefined,
      invoicedQuantityUnitCode: undefined,
      item: new EN16931.Item({ name: 'N', attributes: [new EN16931.ItemAttribute({ name: 'a', valueQuantity: 2, valueQuantityUnitCode: 'C62', typeCode: 'T' })] }),
    })
    const invoice = new EN16931.Invoice(base([line, MINIMAL_LINE({ identifier: '2', statusReasonCode: 'INFORMATION', vat: new EN16931.LineVat({ rate: 10 }) })]))
    for (const level of ['extended', 'extended-ctc-fr'] as const)
      expect(message(invoice, level)).toBe('')
  })

  // CG-69 (closed): the line context `AssociatedDocumentLineDocument[not(ram:LineStatusReasonCode) or
  // ram:LineStatusReasonCode = 'DETAIL']` of both extended Schematrons (BR-FXEXT-BR-22 / -BR-26 / -CO-04 in
  // FACTUR-X_EXTENDED.xslt, BR-FREXT-BR-22 / -BR-26 / -CO-04 in EXTENDED-CTC-FR-CII.xslt).
  it.each([
    ['BG-29', { price: undefined }, 'BR-FXEXT-BR-26', 'BR-FREXT-BR-26'],
    ['BT-129', { invoicedQuantity: undefined, invoicedQuantityUnitCode: undefined }, 'BR-FXEXT-BR-22', 'BR-FREXT-BR-22'],
    ['BG-30', { vat: undefined }, 'BR-FXEXT-CO-04', 'BR-FREXT-CO-04'],
    ['BT-151', { vat: new EN16931.LineVat({ rate: 20 }) }, 'BR-FXEXT-CO-04', 'BR-FREXT-CO-04'],
  ] as const)('throws on a DETAIL or unset-subtype line without %s at the extended levels (CG-69)', (id, extra, fx, fr) => {
    for (const statusReasonCode of [undefined, 'DETAIL']) {
      const invoice = withLine({ ...extra, statusReasonCode })
      const on = 'is mandatory on a line whose EXT-FR-FE-163 \\(line status reason code\\) is "DETAIL" or not set'
      expect(message(invoice, 'extended')).toMatch(new RegExp(`^toCii: ${id} \\(.*\\) ${on} \\(${fx}\\)$`))
      expect(message(invoice, 'extended-ctc-fr')).toMatch(new RegExp(`^toCii: ${id} \\(.*\\) ${on} \\(${fr}\\)$`))
    }
    for (const statusReasonCode of ['GROUP', 'INFORMATION']) {
      expect(message(withLine({ ...extra, statusReasonCode }), 'extended')).toBe('')
      expect(message(withLine({ ...extra, statusReasonCode }), 'extended-ctc-fr')).toBe('')
    }
  })

  it.each([
    ['BT-148', withPrice({ grossPrice: undefined, priceDiscount: 1 })],
    ['EXT-FR-FE-191-1', withLine({ unitsInParentLine: 3 })],
    ['EXT-FR-FE-191', withLine({ unitsInParentLineUnitCode: 'C62' })],
    ['EXT-FR-FE-161', withItem({ attributes: [new EN16931.ItemAttribute({ name: 'a', valueQuantity: 2 })] })],
    ['EXT-FR-FE-160', withItem({ attributes: [new EN16931.ItemAttribute({ name: 'a', value: 'v', valueQuantityUnitCode: 'C62' })] })],
    ['EXT-FR-FE-148', withLine({ deliverTo: new EN16931.LineDeliverTo({ identifiers: [new EN16931.Identifier({ value: 'x' })] }) })],
    ['EXT-FR-FE-166-1', withLine({ seller: new EN16931.LineSeller({ identifiers: [new EN16931.Identifier({ value: 'x' })] }) })],
    ['EXT-FR-FE-170-1', withLine({ seller: new EN16931.LineSeller({ electronicAddress: new EN16931.Identifier({ value: 'x' }) }) })],
    ['EXT-FR-FE-157', withLine({ deliverTo: new EN16931.LineDeliverTo({ address: new EN16931.PostalAddress({ countryCode: '' }) }) })],
    ['EXT-FR-FE-177', withLine({ seller: new EN16931.LineSeller({ address: new EN16931.PostalAddress({ countryCode: '' }) }) })],
    ['EXT-FR-FE-193', withLine({ deliveryTerms: new EN16931.LineDeliveryTerms({ deliveryTypeCode: '' }) })],
    ['EXT-FR-FE-158', withLine({ actualDelivery: new EN16931.LineActualDelivery({ actualDeliveryDate: '' }) })],
  ])('throws on %s without what CII needs beside it', (id, invoice) => {
    const text = message(invoice, 'extended-ctc-fr')
    expect(text).toMatch(new RegExp(`${id}[ )]`))
  })

  it('throws on several notes or object identifiers of a line below the extended levels, naming BT-127 / BT-128', () => {
    const notes = withLine({ notes: [new EN16931.LineNote({ note: 'a' }), new EN16931.LineNote({ note: 'SECRET-B' })] })
    const objects = withLine({ objectIdentifiers: [new EN16931.Identifier({ value: 'a' }), new EN16931.Identifier({ value: 'SECRET-B' })] })
    for (const level of ['basic', 'en16931'] as const) {
      expect(message(notes, level)).toMatch(/BT-127.*once/)
      expect(message(notes, level)).not.toMatch(/SECRET/)
    }
    expect(message(objects, 'basic')).toMatch(/BT-128.*not carried at level "basic"/)
    expect(message(objects, 'en16931')).toMatch(/BT-128.*once/)
    expect(message(objects, 'en16931')).not.toMatch(/SECRET/)
    for (const level of ['extended', 'extended-ctc-fr'] as const) {
      expect(message(notes, level)).toBe('')
      expect(message(objects, level)).toBe('')
    }
  })

  it('throws on a second preceding invoice reference of a line, which CII cannot hold', () => {
    const line = MINIMAL_LINE({ precedingInvoiceReferences: [new EN16931.LinePrecedingInvoiceReference({ reference: 'A' }), new EN16931.LinePrecedingInvoiceReference({ reference: 'SECRET-B' })] })
    const text = message(new EN16931.Invoice(base([line])), 'extended-ctc-fr')
    expect(text).toMatch(/EXT-FR-FE-BG-06/)
    expect(text).not.toMatch(/SECRET/)
  })

  it('throws on a line VAT amount in accounting currency without BT-6, naming EXT-FR-FE-182', () => {
    const invoice = new EN16931.Invoice(base([MINIMAL_LINE({ vatAmountInAccountingCurrency: 3 })]))
    expect(message(invoice, 'extended')).toMatch(/EXT-FR-FE-182.*BT-6/)
  })

  it('throws on a charge holding both BT-145 and BT-193, and on a point date code outside UNTDID 2005', () => {
    const both = MINIMAL_LINE({ charges: [new EN16931.LineCharge({ amount: 1, reasonCode: 'FC', nonVatTaxCode: 'AAJ' })] })
    expect(message(new EN16931.Invoice(base([both])), 'extended')).toMatch(/BT-145.*BT-193/)
    const code = MINIMAL_LINE({ vat: new EN16931.LineVat({ categoryCode: 'S', vatPointDateCode: '72' }) })
    expect(message(new EN16931.Invoice(base([code])), 'extended')).toMatch(/EXT-FR-FE-180/)
  })

  it('throws on a note subject code without its note at extended (BR-FXEXT-02), accepts it at extended-ctc-fr, throws on a non-ISO date and a non-finite optional number, naming the term', () => {
    expect(message(withLine({ notes: [new EN16931.LineNote({ subjectCode: 'AAI' })] }), 'extended')).toMatch(/EXT-FR-FE-183.*BT-127.*BR-FXEXT-02/)
    expect(message(withLine({ notes: [new EN16931.LineNote({ subjectCode: 'AAI' })] }), 'extended-ctc-fr')).toBe('')
    expect(message(withLine({ period: new EN16931.LinePeriod({ startDate: '20250101' }) }), 'en16931')).toMatch(/BT-134/)
    expect(message(withLine({ period: new EN16931.LinePeriod({ endDate: '2025-02-30' }) }), 'en16931')).toMatch(/BT-135/)
    expect(message(withLine({ actualDelivery: new EN16931.LineActualDelivery({ actualDeliveryDate: '2025-13-01' }) }), 'extended')).toMatch(/EXT-FR-FE-158/)
    expect(message(withPrice({ priceBaseQuantity: Number.POSITIVE_INFINITY }), 'en16931')).toMatch(/BT-149/)
    expect(message(withLine({ vat: new EN16931.LineVat({ categoryCode: 'S', rate: Number.NaN }) }), 'en16931')).toMatch(/BT-152/)
    expect(message(withLine({ allowances: [new EN16931.LineAllowance({ amount: 1, percentage: Number.NaN })] }), 'en16931')).toMatch(/BT-138/)
  })

  it('names BG-25 for a plain-object invoice without lines, not a TypeError', () => {
    expect(message({ ...new EN16931.Invoice(base()), lines: undefined } as never, 'en16931')).toMatch(/BG-25/)
  })

  it('exports the line classes, each constructible empty and holding only its own properties', () => {
    const shapes: Record<string, string[]> = {
      InvoiceLine: ['identifier', 'notes', 'parentLineIdentifier', 'statusReasonCode', 'objectIdentifiers', 'purchaseOrderLineReference', 'buyerAccountingReference', 'invoicedQuantity', 'invoicedQuantityUnitCode', 'unitsInParentLine', 'unitsInParentLineUnitCode', 'netAmount', 'vatAmount', 'vatAmountInAccountingCurrency', 'grandTotalAmount', 'period', 'allowances', 'charges', 'price', 'vat', 'item', 'purchaseOrderReference', 'purchaseOrderDate', 'sellerOrderReference', 'despatchAdviceReference', 'receivingAdviceReference', 'precedingInvoiceReferences', 'deliverTo', 'actualDelivery', 'seller', 'deliveryTerms'],
      LineNote: ['note', 'subjectCode'],
      LinePeriod: ['startDate', 'endDate'],
      LineAllowance: ['amount', 'baseAmount', 'percentage', 'reasonCode', 'reason'],
      LineCharge: ['amount', 'baseAmount', 'percentage', 'reasonCode', 'nonVatTaxCode', 'reason'],
      PriceDetails: ['netPrice', 'priceBaseQuantity', 'priceBaseQuantityUnitCode', 'grossPrice', 'grossPriceBaseQuantity', 'grossPriceBaseQuantityUnitCode', 'priceDiscount', 'priceDiscountReason', 'priceDiscountReasonCode'],
      LineVat: ['categoryCode', 'rate', 'exemptionReason', 'exemptionReasonCode', 'vatPointDateCode'],
      Item: ['name', 'description', 'sellersIdentifier', 'buyersIdentifier', 'standardIdentifier', 'attributes', 'classifications', 'countryOfOrigin'],
      ItemAttribute: ['name', 'value', 'typeCode', 'valueQuantity', 'valueQuantityUnitCode'],
      ItemClassification: ['code', 'listId', 'listVersionId'],
      LineSellerOrderReference: ['orderReference', 'orderLineReference'],
      LineDespatchAdviceReference: ['reference', 'lineReference', 'issueDate'],
      LineReceivingAdviceReference: ['reference', 'lineReference'],
      LinePrecedingInvoiceReference: ['reference', 'lineReference', 'typeCode', 'issueDate'],
      LineDeliverTo: ['identifiers', 'name', 'address'],
      LineActualDelivery: ['actualDeliveryDate'],
      LineSeller: ['identifiers', 'name', 'tradingName', 'legalRegistrationIdentifier', 'electronicAddress', 'vatIdentifier', 'taxRegistrationIdentifier', 'address'],
      LineDeliveryTerms: ['deliveryTypeCode', 'locationName'],
    }
    for (const [name, properties] of Object.entries(shapes)) {
      const Class = (EN16931 as unknown as Record<string, new (init: object) => object>)[name]
      expect(Class, name).toBeTypeOf('function')
      expect(Object.keys(new Class({})).sort(), name).toEqual([...properties].sort())
    }
  })

  it('hardens the BT-8 style point date code lookup against prototype keys', () => {
    for (const code of ['constructor', '__proto__', 'toString'])
      expect(message(withLine({ vat: new EN16931.LineVat({ categoryCode: 'S', vatPointDateCode: code }) }), 'extended')).toMatch(/EXT-FR-FE-180/)
  })
})
