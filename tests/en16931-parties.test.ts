import type { Invoice } from '@stafyniaksacha/facturx/en16931'
import type { CrossIndustryInvoiceType } from '@stafyniaksacha/facturx/models'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { EN16931, extract, fromCii, toCii, xmlToInvoice } from '@stafyniaksacha/facturx'
import { describe, expect, it } from 'vitest'

const CORPUS_DIR = resolve(import.meta.dirname, '../spec/factur-x-1.09/distribution/5. FACTUR-X 1.09 - Examples/_Factur-X_1.08-Exemples_CS')
const ANNEX_B_DIR = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures')
const TRADE = `/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction`

function pdfs(folder: string): string[] {
  const dir = join(CORPUS_DIR, folder)
  return readdirSync(dir).filter(f => f.endsWith('.pdf')).sort().map(f => join(dir, f))
}

async function ciiFromPdf(file: string): Promise<CrossIndustryInvoiceType> {
  const { xml } = await extract({ pdf: await readFile(file) })
  return xmlToInvoice(xml)
}

const annexBCii = readdirSync(ANNEX_B_DIR, { withFileTypes: true, recursive: true })
  .filter(e => e.isFile() && /_(?:EN16931_FX|EXTENDED-CTC-FR)_CII_Commentee\.xml$/.test(e.name))
  .map(e => join(e.parentPath ?? (e as { path?: string }).path ?? '', e.name))
  .sort()

// The CII parts the party and delivery mapping owns. The groups the model has no class for (buyer tax
// representative, product end user, ultimate ship to, ship from) are not compared: `dropped` carries them.
function partiesOf(cii: CrossIndustryInvoiceType): unknown {
  const t = cii.supplyChainTradeTransaction
  const a = t.applicableHeaderTradeAgreement
  const d = t.applicableHeaderTradeDelivery
  const s = t.applicableHeaderTradeSettlement
  return {
    agreement: {
      sellerTradeParty: a.sellerTradeParty,
      buyerTradeParty: a.buyerTradeParty,
      salesAgentTradeParty: a.salesAgentTradeParty,
      sellerTaxRepresentativeTradeParty: a.sellerTaxRepresentativeTradeParty,
      applicableTradeDeliveryTerms: a.applicableTradeDeliveryTerms,
      buyerAgentTradeParty: a.buyerAgentTradeParty,
    },
    delivery: {
      shipToTradeParty: d.shipToTradeParty,
      actualDeliverySupplyChainEvent: d.actualDeliverySupplyChainEvent,
    },
    settlement: {
      invoicerTradeParty: s.invoicerTradeParty,
      invoiceeTradeParty: s.invoiceeTradeParty,
      payeeTradeParty: s.payeeTradeParty,
      payerTradeParty: s.payerTradeParty,
    },
  }
}

type Party = NonNullable<CrossIndustryInvoiceType['supplyChainTradeTransaction']['applicableHeaderTradeAgreement']['sellerTradeParty']>
interface Aggregates {
  agreement: { salesAgentTradeParty?: Party, buyerAgentTradeParty?: Party }
  settlement: { invoiceeTradeParty?: Party, payerTradeParty?: Party, invoicerTradeParty?: Party, payeeTradeParty?: Party }
}

// Every `dropped` path is under a party subtree or the header ones this task does not own.
const OWNED = /\/ram:(?:SellerTradeParty|BuyerTradeParty|SalesAgentTradeParty|SellerTaxRepresentativeTradeParty|BuyerAgentTradeParty|ApplicableTradeDeliveryTerms|ShipToTradeParty|ActualDeliverySupplyChainEvent|InvoicerTradeParty|InvoiceeTradeParty|PayeeTradeParty|PayerTradeParty)\b/

const PARTIES = {
  seller: new EN16931.Seller({ name: 'S', address: new EN16931.PostalAddress({ countryCode: 'FR' }) }),
  buyer: new EN16931.Buyer({ name: 'B', address: new EN16931.PostalAddress({ countryCode: 'FR' }) }),
}

function address(prefix: string) {
  return new EN16931.PostalAddress({
    addressLine1: `${prefix} rue de l'Église & <Co>`,
    addressLine2: 'Bât. É',
    addressLine3: 'Zone « Nord »',
    city: 'Saint-Étienne',
    postCode: '42000',
    countrySubdivision: 'Loire',
    countryCode: 'FR',
  })
}

// Only the seller and buyer contacts have a department name (BT-41-0, BT-56-0).
function contact(prefix: string, departmentName?: string) {
  return new EN16931.Contact({ point: `${prefix} Zoë <Ng>`, departmentName, telephoneNumber: '+33 1 02 03 04 05', emailAddress: `${prefix}@example.invalid` })
}

type ExtraInit = ConstructorParameters<typeof EN16931.BuyerAgent>[0]

// The payee has no trading name in the model: its constructor takes none.
function extraParty<T extends object>(Role: new (init: ExtraInit) => T, prefix: string): T {
  return new Role({
    identifiers: [new EN16931.Identifier({ value: `${prefix}-1`, schemeId: '0088' }), new EN16931.Identifier({ value: `${prefix}-2`, schemeId: '0060' })],
    name: `${prefix} & Fils <SA>`,
    roleCode: 'BY',
    tradingName: Role === (EN16931.Payee as unknown) ? undefined : `${prefix} Trading`,
    legalRegistrationIdentifier: new EN16931.Identifier({ value: '123456789', schemeId: '0002' }),
    electronicAddress: new EN16931.Identifier({ value: `${prefix}@example.invalid`, schemeId: 'EM' }),
    vatIdentifier: 'FR12345678901',
    address: address(prefix),
    contact: contact(prefix),
  })
}

const level = (file: string) => file.includes('EXTENDED-CTC-FR') ? 'extended-ctc-fr' : 'en16931'

describe('en 16931 model: parties and delivery round trip', () => {
  it.each([...pdfs('2.BASIC'), ...pdfs('3.EN16931'), ...pdfs('4.EXTENDED')].map(f => [f.split('/').pop()!, f]))(
    'round-trips the party subtrees of corpus %s',
    async (_name, file) => {
      const cii = await ciiFromPdf(file)
      const { invoice, dropped } = fromCii(cii)
      const written = toCii(invoice, { level: file.includes('/2.BASIC/') ? 'basic' : file.includes('/4.EXTENDED/') ? 'extended' : 'en16931' })
      expect(partiesOf(written)).toEqual(partiesOf(cii))
      expect(dropped.filter(p => OWNED.test(p))).toEqual([])
    },
  )

  it.each(annexBCii.map(f => [f.split('/').pop()!, f]))('round-trips the party subtrees of annex B %s', async (_name, file) => {
    const cii = await xmlToInvoice(await readFile(file))
    const { invoice, dropped } = fromCii(cii)
    const written = toCii(invoice, { level: level(file) })
    expect(partiesOf(written)).toEqual(partiesOf(cii))
    // Nothing of the owned groups is lost without being reported.
    expect(dropped.filter(p => OWNED.test(p))).toEqual([])
  })

  it('reads the EN 16931 terms of an annex B invoice into the model', async () => {
    const file = annexBCii.find(f => f.includes('F202500001') && f.includes('EN16931'))!
    const { invoice } = fromCii(await xmlToInvoice(await readFile(file)))
    expect(invoice.seller).toBeInstanceOf(EN16931.Seller)
    expect(invoice.seller.name).not.toBe('')
    expect(invoice.seller.address.countryCode).toMatch(/^[A-Z]{2}$/)
    expect(invoice.buyer).toBeInstanceOf(EN16931.Buyer)
    expect(invoice.buyer.name).not.toBe('')
    expect(invoice.seller.legalRegistrationIdentifier?.schemeId).toBeDefined()
  })

  it('round-trips every party term with nothing dropped', () => {
    const invoice = new EN16931.Invoice({
      number: 'F-1',
      issueDate: '2025-07-01',
      typeCode: '380',
      currencyCode: 'EUR',
      seller: new EN16931.Seller({
        identifiers: [new EN16931.Identifier({ value: 'PRIV-1' }), new EN16931.Identifier({ value: 'GLOB-1', schemeId: '0088' }), new EN16931.Identifier({ value: 'GLOB-2', schemeId: '0060' })],
        name: 'Vendeur & Fils <SA> « é »',
        tradingName: 'Enseigne',
        legalRegistrationIdentifier: new EN16931.Identifier({ value: '123456789', schemeId: '0002' }),
        additionalLegalInformation: 'SARL au capital de 1 000 €',
        electronicAddress: new EN16931.Identifier({ value: 'seller@example.invalid', schemeId: 'EM' }),
        vatIdentifier: 'FR12345678901',
        taxRegistrationIdentifier: '12345678901234',
        address: address('1'),
        contact: contact('seller', 'Compta & Co'),
      }),
      buyer: new EN16931.Buyer({
        identifiers: [new EN16931.Identifier({ value: 'B-PRIV' }), new EN16931.Identifier({ value: 'B-GLOB', schemeId: '0088' })],
        name: 'Acheteur',
        tradingName: 'Acheteur Enseigne',
        legalRegistrationIdentifier: new EN16931.Identifier({ value: '987654321', schemeId: '0002' }),
        electronicAddress: new EN16931.Identifier({ value: 'buyer@example.invalid', schemeId: 'EM' }),
        vatIdentifier: 'FR98765432109',
        address: address('2'),
        contact: contact('buyer', 'Achats'),
      }),
      payee: extraParty(EN16931.Payee, 'payee'),
      sellerTaxRepresentative: new EN16931.SellerTaxRepresentative({ name: 'Représentant', address: address('3'), vatIdentifier: 'DE123456789' }),
      delivery: new EN16931.Delivery({
        name: 'Entrepôt <Nord>',
        locationIdentifier: new EN16931.Identifier({ value: 'LOC-1', schemeId: 'DL' }),
        address: address('4'),
        actualDeliveryDate: '2025-06-30',
      }),
      sellerAgent: extraParty(EN16931.SellerAgent, 'sagent'),
      buyerAgent: extraParty(EN16931.BuyerAgent, 'bagent'),
      invoicee: extraParty(EN16931.Invoicee, 'invoicee'),
      payer: extraParty(EN16931.Payer, 'payer'),
      billingParty: extraParty(EN16931.BillingParty, 'billing'),
      deliveryTerms: new EN16931.DeliveryTerms({ deliveryTypeCode: 'DAP', locationName: 'Lyon & <port>' }),
    })

    const cii = toCii(invoice, { level: 'extended-ctc-fr' })
    const back = fromCii(cii)
    expect(back.dropped).toEqual([])
    expect(back.invoice).toEqual(new EN16931.Invoice({
      ...invoice,
      specificationIdentifier: 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr',
    }))
    expect(back.invoice.payee).toBeInstanceOf(EN16931.Payee)
    expect(back.invoice.sellerAgent).toBeInstanceOf(EN16931.SellerAgent)
    expect(back.invoice.billingParty).toBeInstanceOf(EN16931.BillingParty)
  })

  it('places each party in the CII aggregate the Factur-X matrix names', () => {
    const invoice = new EN16931.Invoice({
      number: 'F-1',
      issueDate: '2025-07-01',
      typeCode: '380',
      currencyCode: 'EUR',
      seller: new EN16931.Seller({ identifiers: [new EN16931.Identifier({ value: 'P' }), new EN16931.Identifier({ value: 'G', schemeId: '0088' })], name: 'S', vatIdentifier: 'FR1', taxRegistrationIdentifier: 'T1', address: new EN16931.PostalAddress({ countryCode: 'FR' }) }),
      buyer: new EN16931.Buyer({ name: 'B', address: new EN16931.PostalAddress({ countryCode: 'FR' }) }),
      sellerAgent: new EN16931.SellerAgent({ name: 'SA', identifiers: [new EN16931.Identifier({ value: 'X', schemeId: '0088' })] }),
      billingParty: new EN16931.BillingParty({ name: 'BP' }),
      invoicee: new EN16931.Invoicee({ name: 'IV' }),
      deliveryTerms: new EN16931.DeliveryTerms({ deliveryTypeCode: 'EXW' }),
    })
    const t = toCii(invoice, { level: 'extended' }).supplyChainTradeTransaction
    const seller = t.applicableHeaderTradeAgreement.sellerTradeParty
    // A private identifier is an `ID`, a global one a `GlobalID` with its scheme.
    expect(seller.id!.map(i => i.value)).toEqual(['P'])
    expect(seller.globalID!.map(i => [i.value, i.schemeID])).toEqual([['G', '0088']])
    expect(seller.specifiedTaxRegistration!.map(r => [r.id.value, r.id.schemeID])).toEqual([['FR1', 'VA'], ['T1', 'FC']])
    // The EXTENDED-CTC-FR parties keep every identifier as a `GlobalID`.
    expect(t.applicableHeaderTradeAgreement.salesAgentTradeParty!.globalID!.map(i => i.value)).toEqual(['X'])
    expect(t.applicableHeaderTradeAgreement.salesAgentTradeParty!.id).toEqual([])
    expect(t.applicableHeaderTradeSettlement.invoicerTradeParty!.name!.value).toBe('BP')
    expect(t.applicableHeaderTradeSettlement.invoiceeTradeParty!.name!.value).toBe('IV')
    expect(t.applicableHeaderTradeAgreement.applicableTradeDeliveryTerms!.deliveryTypeCode.value).toBe('EXW')
  })
})

describe('en 16931 model: the dropped contract of the parties', () => {
  const invoice = new EN16931.Invoice({
    number: 'F-1',
    issueDate: '2025-07-01',
    typeCode: '380',
    currencyCode: 'EUR',
    seller: new EN16931.Seller({ name: 'S', vatIdentifier: 'FR1', address: new EN16931.PostalAddress({ countryCode: 'FR' }), contact: new EN16931.Contact({ point: 'P' }) }),
    buyer: new EN16931.Buyer({ name: 'B', address: new EN16931.PostalAddress({ countryCode: 'FR' }) }),
    delivery: new EN16931.Delivery({ name: 'D', actualDeliveryDate: '2025-06-30' }),
  })
  const agreement = (cii: CrossIndustryInvoiceType) => cii.supplyChainTradeTransaction.applicableHeaderTradeAgreement
  const delivery = (cii: CrossIndustryInvoiceType) => cii.supplyChainTradeTransaction.applicableHeaderTradeDelivery

  it('reports a non-102 date as dropped', () => {
    const cii = toCii(invoice, { level: 'extended' })
    // BT-72 with format 203 (YYYYMMDDHHMM): a Factur-X date the model does not convert.
    delivery(cii).actualDeliverySupplyChainEvent = { occurrenceDateTime: { dateTimeString: '202506301200', format: '203' } }
    const { invoice: read, dropped } = fromCii(cii)
    expect(read.delivery?.actualDeliveryDate).toBeUndefined()
    const event = `${TRADE}/ram:ApplicableHeaderTradeDelivery/ram:ActualDeliverySupplyChainEvent/ram:OccurrenceDateTime/udt:DateTimeString`
    expect(dropped).toEqual([event, `${event}/@format`])
  })

  it('reports a Factur-X-only party field, and only that', () => {
    const cii = toCii(invoice, { level: 'extended' })
    // BT-X-543 (seller role code), a legal postal address (BG-X-14) and a fax number have no EN 16931 / EXT-FR-FE id.
    const seller = agreement(cii).sellerTradeParty
    seller.roleCode = { value: 'SE' }
    seller.specifiedLegalOrganization = { postalTradeAddress: { countryID: { value: 'FR' }, cityName: { value: 'Lyon' } } }
    seller.definedTradeContact![0].faxUniversalCommunication = { completeNumber: { value: '+33 1' } }
    const { dropped } = fromCii(cii)
    const party = `${TRADE}/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty`
    expect(dropped).toEqual([
      `${party}/ram:RoleCode`,
      `${party}/ram:SpecifiedLegalOrganization/ram:PostalTradeAddress/ram:CountryID`,
      `${party}/ram:SpecifiedLegalOrganization/ram:PostalTradeAddress/ram:CityName`,
      `${party}/ram:DefinedTradeContact[1]/ram:FaxUniversalCommunication/ram:CompleteNumber`,
    ])
  })

  it('reports a second contact, a tax scheme other than VA / FC, and an ID with a scheme', () => {
    const cii = toCii(invoice, { level: 'extended' })
    const seller = agreement(cii).sellerTradeParty
    seller.definedTradeContact!.push({ personName: { value: 'Second' } })
    seller.specifiedTaxRegistration!.push({ id: { value: 'X-1', schemeID: 'ZZ' } })
    seller.id = [{ value: 'WITH-SCHEME', schemeID: '0088' }]
    const { invoice: read, dropped } = fromCii(cii)
    expect(read.seller.identifiers).toEqual([])
    expect(read.seller.vatIdentifier).toBe('FR1')
    const party = `${TRADE}/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty`
    expect(dropped).toEqual([
      `${party}/ram:ID[1]`,
      `${party}/ram:ID[1]/@schemeID`,
      `${party}/ram:DefinedTradeContact[2]/ram:PersonName`,
      `${party}/ram:SpecifiedTaxRegistration[2]/ram:ID`,
      `${party}/ram:SpecifiedTaxRegistration[2]/ram:ID/@schemeID`,
    ])
  })

  it('reports a payee trading name and an EXTENDED-CTC-FR contact department name, which have no term', () => {
    const cii = toCii(new EN16931.Invoice({ ...invoice, payee: new EN16931.Payee({ name: 'P' }), payer: new EN16931.Payer({ name: 'Q', contact: new EN16931.Contact({ point: 'X' }) }) }), { level: 'extended' })
    const payee = cii.supplyChainTradeTransaction.applicableHeaderTradeSettlement.payeeTradeParty!
    payee.specifiedLegalOrganization = { tradingBusinessName: { value: 'Payee trading' } }
    cii.supplyChainTradeTransaction.applicableHeaderTradeSettlement.payerTradeParty!.definedTradeContact![0].departmentName = { value: 'Dept' }
    const { invoice: read, dropped } = fromCii(cii)
    expect(read.payee).toBeInstanceOf(EN16931.Payee)
    expect((read.payee as { tradingName?: string }).tradingName).toBeUndefined()
    expect(read.payer?.contact?.departmentName).toBeUndefined()
    const settlement = `${TRADE}/ram:ApplicableHeaderTradeSettlement`
    expect(dropped).toEqual([
      `${settlement}/ram:PayeeTradeParty/ram:SpecifiedLegalOrganization/ram:TradingBusinessName`,
      `${settlement}/ram:PayerTradeParty/ram:DefinedTradeContact[1]/ram:DepartmentName`,
    ])
  })

  it('stands in empty mandatory parties for a document without them, which toCii rejects', () => {
    const cii = toCii(invoice, { level: 'en16931' })
    delete (agreement(cii) as { sellerTradeParty?: unknown }).sellerTradeParty
    delete (agreement(cii) as { buyerTradeParty?: unknown }).buyerTradeParty
    const { invoice: read, dropped } = fromCii(cii)
    expect(dropped).toEqual([])
    expect(read.seller.name).toBe('')
    expect(read.seller.address.countryCode).toBe('')
    expect(() => toCii(read, { level: 'en16931' })).toThrow(/BT-27 /)
  })

  it('keeps a delivery date alone, and none without any delivery term', () => {
    const alone = toCii(new EN16931.Invoice({ ...invoice, delivery: new EN16931.Delivery({ actualDeliveryDate: '2025-06-30' }) }), { level: 'en16931' })
    expect(delivery(alone).shipToTradeParty).toBeUndefined()
    const back = fromCii(alone)
    expect(back.dropped).toEqual([])
    expect(back.invoice.delivery?.actualDeliveryDate).toBe('2025-06-30')
    expect(fromCii(toCii(new EN16931.Invoice({ ...invoice, delivery: undefined }), { level: 'en16931' })).invoice.delivery).toBeUndefined()
  })
})

describe('en 16931 model: levels and mandatory terms of the parties', () => {
  const base = {
    number: 'SECRET-NUMBER',
    issueDate: '2025-07-01',
    typeCode: '380',
    currencyCode: 'EUR',
    seller: new EN16931.Seller({ name: 'Seller', address: new EN16931.PostalAddress({ countryCode: 'FR' }) }),
    buyer: new EN16931.Buyer({ name: 'Buyer', address: new EN16931.PostalAddress({ countryCode: 'FR' }) }),
  }
  const message = (invoice: Invoice, level: 'basic' | 'en16931' | 'extended' | 'extended-ctc-fr'): string => {
    try {
      toCii(invoice, { level })
    }
    catch (error) {
      return (error as Error).message
    }
    return ''
  }

  it.each([
    ['basic', 'BT-32', { seller: new EN16931.Seller({ ...base.seller, taxRegistrationIdentifier: 'SECRET-TAX' }) }],
    ['basic', 'BT-33', { seller: new EN16931.Seller({ ...base.seller, additionalLegalInformation: 'SECRET-LEGAL' }) }],
    ['basic', 'BG-6', { seller: new EN16931.Seller({ ...base.seller, contact: new EN16931.Contact({ departmentName: 'SECRET-DEPT' }) }) }],
    ['basic', 'BT-45', { buyer: new EN16931.Buyer({ ...base.buyer, tradingName: 'SECRET-TRADING' }) }],
    ['basic', 'BG-9', { buyer: new EN16931.Buyer({ ...base.buyer, contact: new EN16931.Contact({ point: 'SECRET-POINT' }) }) }],
    ['en16931', 'EXT-FR-FE-BG-03', { sellerAgent: new EN16931.SellerAgent({ name: 'SECRET-AGENT' }) }],
    ['en16931', 'EXT-FR-FE-BG-01', { buyerAgent: new EN16931.BuyerAgent({ name: 'SECRET-AGENT' }) }],
    ['en16931', 'EXT-FR-FE-BG-04', { invoicee: new EN16931.Invoicee({ name: 'SECRET-INVOICEE' }) }],
    ['en16931', 'EXT-FR-FE-BG-02', { payer: new EN16931.Payer({ name: 'SECRET-PAYER' }) }],
    ['en16931', 'EXT-FR-FE-BG-05', { billingParty: new EN16931.BillingParty({ name: 'SECRET-BILLING' }) }],
    ['en16931', 'EXT-FR-FE-BG-14', { deliveryTerms: new EN16931.DeliveryTerms({ deliveryTypeCode: 'SECRET-DAP' }) }],
    ['en16931', 'EXT-FR-FE-26', { payee: new EN16931.Payee({ name: 'Payee', roleCode: 'SECRET-ROLE' }) }],
    ['en16931', 'EXT-FR-FE-29', { payee: new EN16931.Payee({ name: 'Payee', electronicAddress: new EN16931.Identifier({ value: 'SECRET-EA', schemeId: 'EM' }) }) }],
    ['en16931', 'EXT-FR-FE-31', { payee: new EN16931.Payee({ name: 'Payee', address: new EN16931.PostalAddress({ countryCode: 'FR' }) }) }],
  ] as const)('throws, naming the term and not the value, below the level that carries it (%s, %s)', (level, id, extra) => {
    const text = message(new EN16931.Invoice({ ...base, ...extra }), level)
    expect(text).toContain(id)
    expect(text).toContain(level)
    expect(text).not.toMatch(/SECRET/)
    // The level that carries the term accepts it.
    expect(message(new EN16931.Invoice({ ...base, ...extra }), 'extended-ctc-fr')).toBe('')
  })

  it('carries the EN 16931 party terms at basic and the payee EN 16931 terms at en16931', () => {
    const payee = new EN16931.Payee({ name: 'Payee', identifiers: [new EN16931.Identifier({ value: 'P' })], legalRegistrationIdentifier: new EN16931.Identifier({ value: '1', schemeId: '0002' }) })
    expect(message(new EN16931.Invoice({ ...base, payee, sellerTaxRepresentative: new EN16931.SellerTaxRepresentative({ name: 'T', address: new EN16931.PostalAddress({ countryCode: 'DE' }), vatIdentifier: 'DE1' }), delivery: new EN16931.Delivery({ name: 'D', actualDeliveryDate: '2025-06-30' }) }), 'basic')).toBe('')
  })

  it.each([
    ['BG-4', { seller: undefined }],
    ['BG-7', { buyer: undefined }],
    ['BT-27', { seller: new EN16931.Seller({ name: '', address: new EN16931.PostalAddress({ countryCode: 'FR' }) }) }],
    ['BT-40', { seller: new EN16931.Seller({ name: 'S', address: new EN16931.PostalAddress({ countryCode: '' }) }) }],
    ['BT-44', { buyer: new EN16931.Buyer({ name: '', address: new EN16931.PostalAddress({ countryCode: 'FR' }) }) }],
    ['BT-55', { buyer: new EN16931.Buyer({ name: 'B', address: new EN16931.PostalAddress({ countryCode: '' }) }) }],
    ['BT-62', { sellerTaxRepresentative: new EN16931.SellerTaxRepresentative({ name: '', address: new EN16931.PostalAddress({ countryCode: 'DE' }), vatIdentifier: 'DE1' }) }],
    ['BT-63', { sellerTaxRepresentative: new EN16931.SellerTaxRepresentative({ name: 'T', address: new EN16931.PostalAddress({ countryCode: 'DE' }), vatIdentifier: '' }) }],
    ['BT-69', { sellerTaxRepresentative: new EN16931.SellerTaxRepresentative({ name: 'T', address: new EN16931.PostalAddress({ countryCode: '' }), vatIdentifier: 'DE1' }) }],
    ['BT-80', { delivery: new EN16931.Delivery({ address: new EN16931.PostalAddress({ countryCode: '' }) }) }],
    ['BT-59', { payee: new EN16931.Payee({ name: '' }) }],
    ['EXT-FR-FE-185', { deliveryTerms: new EN16931.DeliveryTerms({ deliveryTypeCode: '' }) }],
    ['EXT-FR-FE-66', { sellerAgent: new EN16931.SellerAgent({ name: '' }) }],
    ['EXT-FR-FE-84', { sellerAgent: new EN16931.SellerAgent({ name: 'A', address: new EN16931.PostalAddress({ countryCode: '' }) }) }],
  ] as const)('throws on a missing or empty mandatory %s', (id, extra) => {
    expect(message(new EN16931.Invoice({ ...base, ...extra } as never), 'extended-ctc-fr')).toMatch(new RegExp(`${id} `))
  })

  it('throws on a contact department name outside the seller and buyer, without quoting it', () => {
    const roles = { payee: EN16931.Payee, sellerAgent: EN16931.SellerAgent, buyerAgent: EN16931.BuyerAgent, invoicee: EN16931.Invoicee, payer: EN16931.Payer, billingParty: EN16931.BillingParty }
    for (const [property, Role] of Object.entries(roles)) {
      const text = message(new EN16931.Invoice({ ...base, [property]: new Role({ name: 'N', contact: new EN16931.Contact({ departmentName: 'SECRET-DEPT' }) }) }), 'extended-ctc-fr')
      expect(text).toMatch(/BT-41-0.*BT-56-0/)
      expect(text).not.toMatch(/SECRET/)
    }
    expect(message(new EN16931.Invoice({ ...base, seller: new EN16931.Seller({ ...base.seller, contact: new EN16931.Contact({ departmentName: 'D' }) }), buyer: new EN16931.Buyer({ ...base.buyer, contact: new EN16931.Contact({ departmentName: 'D' }) }) }), 'en16931')).toBe('')
  })

  const noScheme = new EN16931.Identifier({ value: 'SECRET-VALUE' })
  it.each([
    ['BT-34-1', { seller: new EN16931.Seller({ ...base.seller, electronicAddress: noScheme }) }],
    ['BT-49-1', { buyer: new EN16931.Buyer({ ...base.buyer, electronicAddress: noScheme }) }],
    ['EXT-FR-FE-30', { payee: new EN16931.Payee({ name: 'N', electronicAddress: noScheme }) }],
    ['EXT-FR-FE-07', { buyerAgent: new EN16931.BuyerAgent({ name: 'N', identifiers: [noScheme] }) }],
    ['EXT-FR-FE-13', { buyerAgent: new EN16931.BuyerAgent({ name: 'N', electronicAddress: noScheme }) }],
    ['EXT-FR-FE-47', { payer: new EN16931.Payer({ name: 'N', identifiers: [noScheme] }) }],
    ['EXT-FR-FE-53', { payer: new EN16931.Payer({ name: 'N', electronicAddress: noScheme }) }],
    ['EXT-FR-FE-70', { sellerAgent: new EN16931.SellerAgent({ name: 'N', identifiers: [noScheme] }) }],
    ['EXT-FR-FE-76', { sellerAgent: new EN16931.SellerAgent({ name: 'N', electronicAddress: noScheme }) }],
    ['EXT-FR-FE-92-1', { invoicee: new EN16931.Invoicee({ name: 'N', identifiers: [noScheme] }) }],
    ['EXT-FR-FE-99', { invoicee: new EN16931.Invoicee({ name: 'N', electronicAddress: noScheme }) }],
    ['EXT-FR-FE-116', { billingParty: new EN16931.BillingParty({ name: 'N', identifiers: [noScheme] }) }],
    ['EXT-FR-FE-122', { billingParty: new EN16931.BillingParty({ name: 'N', electronicAddress: noScheme }) }],
  ] as const)('throws on a missing scheme the matrix makes mandatory (%s)', (id, extra) => {
    const text = message(new EN16931.Invoice({ ...base, ...extra }), 'extended-ctc-fr')
    expect(text).toContain(id)
    expect(text).not.toMatch(/SECRET/)
  })

  it('still reads a document whose electronic address has no scheme', () => {
    const cii = toCii(new EN16931.Invoice({ ...base }), { level: 'en16931' })
    cii.supplyChainTradeTransaction.applicableHeaderTradeAgreement.sellerTradeParty.uriUniversalCommunication = { uriID: { value: 'a@example.invalid' } }
    const read = fromCii(cii)
    expect(read.dropped).toEqual([])
    expect(read.invoice.seller.electronicAddress?.value).toBe('a@example.invalid')
    expect(read.invoice.seller.electronicAddress?.schemeId).toBeUndefined()
    expect(() => toCii(read.invoice, { level: 'en16931' })).toThrow(/BT-34-1/)
  })

  it('rejects a delivery date that is not an ISO date, naming BT-72', () => {
    expect(() => toCii(new EN16931.Invoice({ ...base, delivery: new EN16931.Delivery({ actualDeliveryDate: '20250630' }) }), { level: 'en16931' })).toThrow(/BT-72/)
    expect(() => toCii(new EN16931.Invoice({ ...base, delivery: new EN16931.Delivery({ actualDeliveryDate: '2025-02-30' }) }), { level: 'en16931' })).toThrow(/BT-72/)
  })

  it('exports the party classes, each constructible empty and holding only its own properties', () => {
    const own = ['identifiers', 'name', 'roleCode', 'legalRegistrationIdentifier', 'electronicAddress', 'vatIdentifier', 'address', 'contact']
    const shapes: Record<string, string[]> = {
      Seller: ['identifiers', 'name', 'tradingName', 'legalRegistrationIdentifier', 'additionalLegalInformation', 'electronicAddress', 'vatIdentifier', 'taxRegistrationIdentifier', 'address', 'contact'],
      Buyer: ['identifiers', 'name', 'tradingName', 'legalRegistrationIdentifier', 'electronicAddress', 'vatIdentifier', 'address', 'contact'],
      Payee: own,
      SellerAgent: [...own, 'tradingName'],
      BuyerAgent: [...own, 'tradingName'],
      Invoicee: [...own, 'tradingName'],
      Payer: [...own, 'tradingName'],
      BillingParty: [...own, 'tradingName'],
      SellerTaxRepresentative: ['name', 'address', 'vatIdentifier'],
      Delivery: ['name', 'locationIdentifier', 'address', 'actualDeliveryDate'],
      DeliveryTerms: ['deliveryTypeCode', 'locationName'],
    }
    for (const [name, keys] of Object.entries(shapes)) {
      const Class = (EN16931 as unknown as Record<string, new (init: object) => object>)[name]
      expect(typeof Class).toBe('function')
      expect(Object.keys(new Class({})).sort()).toEqual([...keys].sort())
    }
    expect((EN16931 as unknown as Record<string, unknown>).AdditionalParty).toBeUndefined()
  })

  it('places every EXT-FR-FE party term at the CII path of the EXTENDED matrix', () => {
    const roles = [
      ['sellerAgent', EN16931.SellerAgent, (a: Aggregates) => a.agreement.salesAgentTradeParty],
      ['buyerAgent', EN16931.BuyerAgent, (a: Aggregates) => a.agreement.buyerAgentTradeParty],
      ['invoicee', EN16931.Invoicee, (a: Aggregates) => a.settlement.invoiceeTradeParty],
      ['payer', EN16931.Payer, (a: Aggregates) => a.settlement.payerTradeParty],
      ['billingParty', EN16931.BillingParty, (a: Aggregates) => a.settlement.invoicerTradeParty],
      ['payee', EN16931.Payee, (a: Aggregates) => a.settlement.payeeTradeParty],
    ] as const
    for (const [property, Role, pick] of roles) {
      const party = new Role({
        identifiers: [new EN16931.Identifier({ value: 'ID1', schemeId: 'S1' })],
        name: 'NAME',
        roleCode: 'ROLE',
        legalRegistrationIdentifier: new EN16931.Identifier({ value: 'LEGAL', schemeId: 'LS' }),
        electronicAddress: new EN16931.Identifier({ value: 'EA', schemeId: 'ES' }),
        vatIdentifier: 'VAT',
        address: new EN16931.PostalAddress({ addressLine1: 'L1', addressLine2: 'L2', addressLine3: 'L3', city: 'CITY', postCode: 'POST', countrySubdivision: 'SUB', countryCode: 'CC' }),
        contact: new EN16931.Contact({ point: 'PERSON', telephoneNumber: 'TEL', emailAddress: 'MAIL' }),
      })
      const cii = toCii(new EN16931.Invoice({ number: 'N', issueDate: '2025-07-01', typeCode: '380', currencyCode: 'EUR', ...PARTIES, [property]: party }), { level: 'extended-ctc-fr' })
      const t = cii.supplyChainTradeTransaction
      // Which aggregate holds the role: ApplicableHeaderTradeAgreement/{SalesAgent,BuyerAgent}TradeParty,
      // ApplicableHeaderTradeSettlement/{Invoicee,Payer,Invoicer,Payee}TradeParty (EXTENDED matrix XPath).
      const x = pick({ agreement: t.applicableHeaderTradeAgreement, settlement: t.applicableHeaderTradeSettlement })!
      expect(x.name?.value, `${property} Name`).toBe('NAME')
      expect(x.roleCode?.value, `${property} RoleCode`).toBe('ROLE')
      // The payee keeps a scheme-bearing identifier as GlobalID too (BT-60-0), like the others.
      expect(x.globalID?.[0]?.value, `${property} GlobalID`).toBe('ID1')
      expect(x.globalID?.[0]?.schemeID, `${property} GlobalID/@schemeID`).toBe('S1')
      expect(x.specifiedLegalOrganization?.id?.value, `${property} SpecifiedLegalOrganization/ID`).toBe('LEGAL')
      expect(x.specifiedLegalOrganization?.id?.schemeID, `${property} SpecifiedLegalOrganization/ID/@schemeID`).toBe('LS')
      expect(x.uriUniversalCommunication?.uriID?.value, `${property} URIUniversalCommunication/URIID`).toBe('EA')
      expect(x.uriUniversalCommunication?.uriID?.schemeID, `${property} URIID/@schemeID`).toBe('ES')
      expect(x.specifiedTaxRegistration?.[0]?.id.value, `${property} SpecifiedTaxRegistration/ID`).toBe('VAT')
      expect(x.specifiedTaxRegistration?.[0]?.id.schemeID, `${property} SpecifiedTaxRegistration/ID/@schemeID`).toBe('VA')
      const a = x.postalTradeAddress!
      expect([a.lineOne?.value, a.lineTwo?.value, a.lineThree?.value, a.cityName?.value, a.postcodeCode?.value, a.countrySubDivisionName?.[0]?.value, a.countryID.value], `${property} PostalTradeAddress`)
        .toEqual(['L1', 'L2', 'L3', 'CITY', 'POST', 'SUB', 'CC'])
      const c = x.definedTradeContact![0]
      expect([c.personName?.value, c.telephoneUniversalCommunication?.completeNumber?.value, c.emailURIUniversalCommunication?.uriID?.value], `${property} DefinedTradeContact`)
        .toEqual(['PERSON', 'TEL', 'MAIL'])
    }
    // Delivery terms: ApplicableHeaderTradeAgreement/ApplicableTradeDeliveryTerms (DeliveryTypeCode, RelevantTradeLocation/Name).
    const terms = toCii(new EN16931.Invoice({ number: 'N', issueDate: '2025-07-01', typeCode: '380', currencyCode: 'EUR', ...PARTIES, deliveryTerms: new EN16931.DeliveryTerms({ deliveryTypeCode: 'DAP', locationName: 'LOC' }) }), { level: 'extended' })
      .supplyChainTradeTransaction
      .applicableHeaderTradeAgreement
      .applicableTradeDeliveryTerms!
    expect([terms.deliveryTypeCode.value, terms.relevantTradeLocation?.name?.value]).toEqual(['DAP', 'LOC'])
  })
})
