/**
 * Parties and delivery groups of the EN 16931 model ⇄ CII.
 *
 * Placement follows the Factur-X 1.09 EXTENDED field matrix (`fields--Factur-X_CII_D22B_EXTENDED.csv`,
 * XPath column), also for the EXT-FR-FE parties (CG-39). Shapes mirror `xmlToInvoice()`: a party
 * always carries `id`, `globalID`, `definedTradeContact` and `specifiedTaxRegistration` arrays, an
 * address a `countrySubDivisionName` array, so a document read and written back compares equal.
 * What the model has no place for (legal postal addresses, role codes of the seller and buyer,
 * faxes ...) is not mapped, and `fromCii()` reports it in `dropped`.
 */

import type { Invoice } from '../../models/en16931/invoice'
import type { CrossIndustryInvoiceType } from '../../models/facturx/crossIndustryInvoice'
import type { TermGate } from './levels'
import { Contact, Identifier, PostalAddress } from '../../models/en16931/common'
import {
  BillingParty,
  Buyer,
  BuyerAgent,
  Delivery,
  DeliveryTerms,
  Invoicee,
  Payee,
  Payer,
  Seller,
  SellerAgent,
  SellerTaxRepresentative,
} from '../../models/en16931/parties'
import * as qdt from '../../models/facturx/qualifiedTypes'
import * as ram from '../../models/facturx/reusableTypes'
import * as udt from '../../models/facturx/unqualifiedTypes'
import { isSet } from './levels'
import { ciiDateTime, ciiId, ciiText, isoFromCii, unmapped } from './values'

/** What the six roles that are neither seller nor buyer have in common (internal: each exported class declares its own properties). */
type ExtraParty = Payee | BuyerAgent | Payer | SellerAgent | Invoicee | BillingParty
interface ExtraPartyInit {
  identifiers?: Identifier[]
  name: string
  roleCode?: string
  tradingName?: string
  legalRegistrationIdentifier?: Identifier
  electronicAddress?: Identifier
  vatIdentifier?: string
  address?: PostalAddress
  contact?: Contact
}

/** The party properties of `Invoice`, as its constructor takes them. */
type PartyKeys = 'seller' | 'buyer' | 'payee' | 'sellerTaxRepresentative' | 'delivery' | 'sellerAgent' | 'buyerAgent' | 'invoicee' | 'payer' | 'billingParty' | 'deliveryTerms'
export type PartiesInit = Pick<ConstructorParameters<typeof Invoice>[0], PartyKeys>

/** `ram:SpecifiedTaxRegistration/ram:ID/@schemeID` of a VAT identifier and of a tax registration number (matrix BT-31-0, BT-32-0). */
const VAT = 'VA'
const TAX = 'FC'

/** Parties and delivery terms that need EN 16931, or EXTENDED, to be written (BASIC lacks them; the EXT-FR-FE ones are EXTENDED only). */
export const PARTY_GATES: readonly TermGate[] = [
  { id: 'BT-32', term: 'seller tax registration identifier', from: 'en16931', present: i => isSet(i.seller?.taxRegistrationIdentifier) },
  { id: 'BT-33', term: 'seller additional legal information', from: 'en16931', present: i => isSet(i.seller?.additionalLegalInformation) },
  { id: 'BG-6', term: 'seller contact', from: 'en16931', present: i => isSet(i.seller?.contact) },
  { id: 'BT-45', term: 'buyer trading name', from: 'en16931', present: i => isSet(i.buyer?.tradingName) },
  { id: 'BG-9', term: 'buyer contact', from: 'en16931', present: i => isSet(i.buyer?.contact) },
  { id: 'EXT-FR-FE-26', term: 'payee role code', from: 'extended', present: i => isSet(i.payee?.roleCode) },
  { id: 'EXT-FR-FE-27', term: 'payee VAT identifier', from: 'extended', present: i => isSet(i.payee?.vatIdentifier) },
  { id: 'EXT-FR-FE-29', term: 'payee electronic address', from: 'extended', present: i => isSet(i.payee?.electronicAddress) },
  { id: 'EXT-FR-FE-31', term: 'payee postal address', from: 'extended', present: i => isSet(i.payee?.address) },
  { id: 'EXT-FR-FE-39', term: 'payee contact', from: 'extended', present: i => isSet(i.payee?.contact) },
  { id: 'EXT-FR-FE-BG-01', term: 'buyer agent', from: 'extended', present: i => isSet(i.buyerAgent) },
  { id: 'EXT-FR-FE-BG-02', term: 'payer', from: 'extended', present: i => isSet(i.payer) },
  { id: 'EXT-FR-FE-BG-03', term: 'seller agent', from: 'extended', present: i => isSet(i.sellerAgent) },
  { id: 'EXT-FR-FE-BG-04', term: 'invoicee', from: 'extended', present: i => isSet(i.invoicee) },
  { id: 'EXT-FR-FE-BG-05', term: 'billing party', from: 'extended', present: i => isSet(i.billingParty) },
  { id: 'EXT-FR-FE-BG-14', term: 'delivery terms', from: 'extended', present: i => isSet(i.deliveryTerms) },
]

// ---------------------------------------------------------------------------
// CII → model
// ---------------------------------------------------------------------------

function addressFromCii(address: ram.TradeAddressType | undefined): PostalAddress | undefined {
  if (!address)
    return undefined
  return new PostalAddress({
    addressLine1: address.lineOne?.value,
    addressLine2: address.lineTwo?.value,
    addressLine3: address.lineThree?.value,
    city: address.cityName?.value,
    postCode: address.postcodeCode?.value,
    countrySubdivision: address.countrySubDivisionName?.[0]?.value,
    // The parser stands in an empty code for a missing CountryID.
    countryCode: address.countryID?.value ?? '',
  })
}

// A mandatory address the document lacks: an empty country, which `toCii()` rejects.
function requiredAddress(address: ram.TradeAddressType | undefined): PostalAddress {
  return addressFromCii(address) ?? new PostalAddress({ countryCode: '' })
}

// Only the first contact: BG-6 / BG-9 are `0..1`; the others are reported in `dropped`.
// `department`: only the seller and buyer contacts have a department name (BT-41-0, BT-56-0); in the EXT-FR-FE contacts it is left to `dropped`.
function contactFromCii(contacts: ram.TradeContactType[] | undefined, department: boolean): Contact | undefined {
  const contact = contacts?.[0]
  if (!contact)
    return undefined
  return new Contact({
    point: contact.personName?.value,
    departmentName: department ? contact.departmentName?.value : undefined,
    telephoneNumber: contact.telephoneUniversalCommunication?.completeNumber?.value,
    emailAddress: contact.emailURIUniversalCommunication?.uriID?.value,
  })
}

function identifierFromCii(id: udt.IDType | undefined): Identifier | undefined {
  return id === undefined ? undefined : new Identifier({ value: id.value, schemeId: id.schemeID })
}

/**
 * Identifiers of a party. `split`: a private identifier is a CII `ID` without scheme and a global
 * one a `GlobalID` with its scheme (seller, buyer, payee, delivery); otherwise every identifier is
 * a `GlobalID`, with an optional scheme (EXTENDED-CTC-FR parties). Anything else is left to `dropped`.
 */
function identifiersFromCii(party: ram.TradePartyType | undefined, split: boolean): Identifier[] {
  const global = (party?.globalID ?? []).filter(g => !split || g.schemeID !== undefined).map(g => new Identifier({ value: g.value, schemeId: g.schemeID }))
  if (!split)
    return global
  return [...(party?.id ?? []).filter(i => i.schemeID === undefined).map(i => new Identifier({ value: i.value })), ...global]
}

function registrationFromCii(party: ram.TradePartyType | undefined, scheme: string): string | undefined {
  return party?.specifiedTaxRegistration?.find(t => t.id?.schemeID === scheme)?.id.value
}

interface CommonFields {
  identifiers: Identifier[]
  name: string
  tradingName?: string
  legalRegistrationIdentifier?: Identifier
  electronicAddress?: Identifier
  vatIdentifier?: string
  contact?: Contact
}

function commonFromCii(party: ram.TradePartyType | undefined, split: boolean, department: boolean): CommonFields {
  return {
    identifiers: identifiersFromCii(party, split),
    name: party?.name?.value ?? '',
    tradingName: party?.specifiedLegalOrganization?.tradingBusinessName?.value,
    legalRegistrationIdentifier: identifierFromCii(party?.specifiedLegalOrganization?.id),
    electronicAddress: identifierFromCii(party?.uriUniversalCommunication?.uriID),
    vatIdentifier: registrationFromCii(party, VAT),
    contact: contactFromCii(party?.definedTradeContact, department),
  }
}

// The payee has no trading name in the model (Factur-X EXTENDED BT-X-243 has no EN 16931 / EXT-FR-FE id):
// `withTradingName` is false for it, and `dropped` carries the element. Contact department names are only
// read for the seller and buyer (BT-41-0, BT-56-0): the BT-X ones of the other roles are dropped too.
function extraPartyFromCii<T extends ExtraParty>(Role: new (init: ExtraPartyInit) => T, party: ram.TradePartyType | undefined, split: boolean, withTradingName: boolean): T | undefined {
  if (!party)
    return undefined
  const common = commonFromCii(party, split, false)
  return new Role({ ...common, tradingName: withTradingName ? common.tradingName : undefined, roleCode: party.roleCode?.value, address: addressFromCii(party.postalTradeAddress) })
}

/** The party groups and delivery terms of a CII invoice. */
export function partiesFromCii(cii: CrossIndustryInvoiceType): PartiesInit {
  const agreement = cii.supplyChainTradeTransaction?.applicableHeaderTradeAgreement
  const delivery = cii.supplyChainTradeTransaction?.applicableHeaderTradeDelivery
  const settlement = cii.supplyChainTradeTransaction?.applicableHeaderTradeSettlement
  const seller = agreement?.sellerTradeParty
  const buyer = agreement?.buyerTradeParty
  const taxRepresentative = agreement?.sellerTaxRepresentativeTradeParty
  const shipTo = delivery?.shipToTradeParty
  const terms = agreement?.applicableTradeDeliveryTerms
  const actualDeliveryDate = isoFromCii(delivery?.actualDeliverySupplyChainEvent?.occurrenceDateTime)
  const deliveryAddress = addressFromCii(shipTo?.postalTradeAddress)
  const deliveryName = shipTo?.name?.value
  const deliveryLocation = identifiersFromCii(shipTo, true)[0]
  const sellerCommon = commonFromCii(seller, true, true)

  return {
    seller: new Seller({
      ...sellerCommon,
      additionalLegalInformation: seller?.description?.value,
      taxRegistrationIdentifier: registrationFromCii(seller, TAX),
      address: requiredAddress(seller?.postalTradeAddress),
    }),
    buyer: new Buyer({ ...commonFromCii(buyer, true, true), address: requiredAddress(buyer?.postalTradeAddress) }),
    payee: extraPartyFromCii(Payee, settlement?.payeeTradeParty, true, false),
    sellerTaxRepresentative: taxRepresentative
      ? new SellerTaxRepresentative({
          name: taxRepresentative.name?.value ?? '',
          address: requiredAddress(taxRepresentative.postalTradeAddress),
          vatIdentifier: registrationFromCii(taxRepresentative, VAT) ?? '',
        })
      : undefined,
    delivery: deliveryName === undefined && deliveryLocation === undefined && deliveryAddress === undefined && actualDeliveryDate === undefined
      ? undefined
      : new Delivery({ name: deliveryName, locationIdentifier: deliveryLocation, address: deliveryAddress, actualDeliveryDate }),
    sellerAgent: extraPartyFromCii(SellerAgent, agreement?.salesAgentTradeParty, false, true),
    buyerAgent: extraPartyFromCii(BuyerAgent, agreement?.buyerAgentTradeParty, false, true),
    invoicee: extraPartyFromCii(Invoicee, settlement?.invoiceeTradeParty, false, true),
    payer: extraPartyFromCii(Payer, settlement?.payerTradeParty, false, true),
    billingParty: extraPartyFromCii(BillingParty, settlement?.invoicerTradeParty, false, true),
    deliveryTerms: terms
      ? new DeliveryTerms({
          deliveryTypeCode: terms.deliveryTypeCode?.value ?? '',
          locationName: terms.relevantTradeLocation?.name?.value,
        })
      : undefined,
  }
}

// ---------------------------------------------------------------------------
// model → CII
// ---------------------------------------------------------------------------

function addressToCii(address: PostalAddress | undefined): ram.TradeAddressType | undefined {
  if (!address)
    return undefined
  return new ram.TradeAddressType({
    postcodeCode: address.postCode === undefined ? undefined : new udt.CodeType({ value: address.postCode }),
    lineOne: ciiText(address.addressLine1),
    lineTwo: ciiText(address.addressLine2),
    lineThree: ciiText(address.addressLine3),
    cityName: ciiText(address.city),
    countryID: new qdt.CountryIDType({ value: address.countryCode }),
    countrySubDivisionName: address.countrySubdivision === undefined ? [] : [new udt.TextType({ value: address.countrySubdivision })],
  })
}

function communication(fields: { uriID?: udt.IDType, completeNumber?: udt.TextType }): ram.UniversalCommunicationType | undefined {
  return fields.uriID === undefined && fields.completeNumber === undefined ? undefined : new ram.UniversalCommunicationType(fields)
}

function contactToCii(contact: Contact | undefined): ram.TradeContactType[] {
  if (!contact)
    return []
  return [new ram.TradeContactType({
    personName: ciiText(contact.point),
    departmentName: ciiText(contact.departmentName),
    telephoneUniversalCommunication: communication({ completeNumber: ciiText(contact.telephoneNumber) }),
    emailURIUniversalCommunication: communication({ uriID: ciiId(contact.emailAddress) }),
  })]
}

interface PartyFields {
  identifiers?: Identifier[]
  name?: string
  roleCode?: string
  description?: string
  tradingName?: string
  legalRegistrationIdentifier?: Identifier
  electronicAddress?: Identifier
  vatIdentifier?: string
  taxRegistrationIdentifier?: string
  address?: PostalAddress
  contact?: Contact
}

function registration(value: string | undefined, scheme: string): ram.TaxRegistrationType[] {
  return value === undefined ? [] : [new ram.TaxRegistrationType({ id: new udt.IDType({ value, schemeID: scheme }) })]
}

function partyToCii(party: PartyFields, split: boolean): ram.TradePartyType {
  const identifiers = party.identifiers ?? []
  const legal = party.legalRegistrationIdentifier
  return new ram.TradePartyType({
    id: split ? identifiers.filter(i => i.schemeId === undefined).map(i => new udt.IDType({ value: i.value })) : [],
    globalID: identifiers.filter(i => !split || i.schemeId !== undefined).map(i => new udt.IDType({ value: i.value, schemeID: i.schemeId })),
    name: ciiText(party.name),
    roleCode: party.roleCode === undefined ? undefined : new qdt.PartyRoleCodeType({ value: party.roleCode }),
    description: ciiText(party.description),
    specifiedLegalOrganization: legal === undefined && party.tradingName === undefined
      ? undefined
      : new ram.LegalOrganizationType({
          id: legal === undefined ? undefined : new udt.IDType({ value: legal.value, schemeID: legal.schemeId }),
          tradingBusinessName: ciiText(party.tradingName),
        }),
    definedTradeContact: contactToCii(party.contact),
    postalTradeAddress: addressToCii(party.address),
    uriUniversalCommunication: party.electronicAddress === undefined
      ? undefined
      : new ram.UniversalCommunicationType({ uriID: new udt.IDType({ value: party.electronicAddress.value, schemeID: party.electronicAddress.schemeId }) }),
    specifiedTaxRegistration: [...registration(party.vatIdentifier, VAT), ...registration(party.taxRegistrationIdentifier, TAX)],
  })
}

/** The header aggregates the party groups fill, for the header mapping to merge. */
export interface PartiesCii {
  agreement: {
    sellerTradeParty: ram.TradePartyType
    buyerTradeParty: ram.TradePartyType
    salesAgentTradeParty?: ram.TradePartyType
    sellerTaxRepresentativeTradeParty?: ram.TradePartyType
    buyerAgentTradeParty?: ram.TradePartyType
    applicableTradeDeliveryTerms?: ram.TradeDeliveryTermsType
  }
  delivery: {
    shipToTradeParty?: ram.TradePartyType
    actualDeliverySupplyChainEvent?: ram.SupplyChainEventType
  }
  settlement: {
    invoicerTradeParty?: ram.TradePartyType
    invoiceeTradeParty?: ram.TradePartyType
    payeeTradeParty?: ram.TradePartyType
    payerTradeParty?: ram.TradePartyType
  }
}

// A group the invoice has not set: nothing is written.
function orUndefined<T, R>(value: T | undefined, map: (value: T) => R): R | undefined {
  return value === undefined ? undefined : map(value)
}

/** The party groups of an invoice as CII aggregates. Tolerates incomplete data: `toCii()` checks it. */
export function partiesToCii(invoice: Invoice): PartiesCii {
  const { seller, buyer, delivery, deliveryTerms } = invoice
  const taxRepresentative = invoice.sellerTaxRepresentative
  const deliveryParty = delivery && (delivery.name !== undefined || delivery.locationIdentifier !== undefined || delivery.address !== undefined)
    ? partyToCii({ name: delivery.name, identifiers: delivery.locationIdentifier ? [delivery.locationIdentifier] : [], address: delivery.address }, true)
    : undefined
  const additional = (party: ExtraParty | undefined, split: boolean): ram.TradePartyType | undefined => orUndefined(party, p => partyToCii(p, split))

  return {
    agreement: {
      sellerTradeParty: seller ? partyToCii({ ...seller, description: seller.additionalLegalInformation }, true) : unmapped(),
      buyerTradeParty: buyer ? partyToCii(buyer, true) : unmapped(),
      salesAgentTradeParty: additional(invoice.sellerAgent, false),
      sellerTaxRepresentativeTradeParty: orUndefined(taxRepresentative, t => partyToCii({ name: t.name, address: t.address, vatIdentifier: t.vatIdentifier }, false)),
      buyerAgentTradeParty: additional(invoice.buyerAgent, false),
      applicableTradeDeliveryTerms: orUndefined(deliveryTerms, t => new ram.TradeDeliveryTermsType({
        deliveryTypeCode: new qdt.DeliveryTermsCodeType({ value: t.deliveryTypeCode }),
        relevantTradeLocation: t.locationName === undefined ? undefined : new ram.TradeLocationType({ name: new udt.TextType({ value: t.locationName }) }),
      })),
    },
    delivery: {
      shipToTradeParty: deliveryParty,
      actualDeliverySupplyChainEvent: delivery?.actualDeliveryDate === undefined
        ? undefined
        : new ram.SupplyChainEventType({ occurrenceDateTime: ciiDateTime(delivery.actualDeliveryDate, 'BT-72')! }),
    },
    settlement: {
      invoicerTradeParty: additional(invoice.billingParty, false),
      invoiceeTradeParty: additional(invoice.invoicee, false),
      payeeTradeParty: additional(invoice.payee, true),
      payerTradeParty: additional(invoice.payer, false),
    },
  }
}

// ---------------------------------------------------------------------------
// Mandatory terms of the groups the invoice holds
// ---------------------------------------------------------------------------

type Check = [id: string, term: string, value: string | undefined]

function schemeChecks(id: string, term: string, identifiers: Identifier[]): Check[] {
  return identifiers.map(i => [id, term, i.schemeId] as Check)
}

function partyChecks(party: ExtraParty | undefined, name: [string, string], country: [string, string]): Check[] {
  if (!party)
    return []
  return [
    [name[0], name[1], party.name],
    ...(party.address ? [[country[0], country[1], party.address.countryCode] as Check] : []),
  ]
}

/**
 * Throws, naming the business term, when a mandatory term of a party or delivery group the invoice
 * holds is missing or empty. Never quotes invoice content.
 */
export function assertPartiesComplete(invoice: Invoice): void {
  const { seller, buyer, sellerTaxRepresentative: taxRepresentative, delivery, deliveryTerms } = invoice
  if (!seller)
    throw new Error('toCii: BG-4 (seller) is mandatory')
  if (!buyer)
    throw new Error('toCii: BG-7 (buyer) is mandatory')
  const checks: Check[] = [
    ['BT-27', 'seller name', seller.name],
    ['BG-5', 'seller postal address', seller.address ? 'set' : undefined],
    ['BT-40', 'seller country code', seller.address?.countryCode],
    ['BT-44', 'buyer name', buyer.name],
    ['BG-8', 'buyer postal address', buyer.address ? 'set' : undefined],
    ['BT-55', 'buyer country code', buyer.address?.countryCode],
    ...(taxRepresentative
      ? [
          ['BT-62', 'seller tax representative name', taxRepresentative.name],
          ['BG-12', 'seller tax representative postal address', taxRepresentative.address ? 'set' : undefined],
          ['BT-69', 'seller tax representative country code', taxRepresentative.address?.countryCode],
          ['BT-63', 'seller tax representative VAT identifier', taxRepresentative.vatIdentifier],
        ] as Check[]
      : []),
    ...(delivery?.address ? [['BT-80', 'deliver to country code', delivery.address.countryCode] as Check] : []),
    ...partyChecks(invoice.payee, ['BT-59', 'payee name'], ['EXT-FR-FE-38', 'payee country code']),
    ...partyChecks(invoice.buyerAgent, ['EXT-FR-FE-03', 'buyer agent name'], ['EXT-FR-FE-21', 'buyer agent country code']),
    ...partyChecks(invoice.payer, ['EXT-FR-FE-43', 'payer name'], ['EXT-FR-FE-61', 'payer country code']),
    ...partyChecks(invoice.sellerAgent, ['EXT-FR-FE-66', 'seller agent name'], ['EXT-FR-FE-84', 'seller agent country code']),
    ...partyChecks(invoice.invoicee, ['EXT-FR-FE-89', 'invoicee name'], ['EXT-FR-FE-107', 'invoicee country code']),
    ...partyChecks(invoice.billingParty, ['EXT-FR-FE-112', 'billing party name'], ['EXT-FR-FE-130', 'billing party country code']),
    ...(deliveryTerms ? [['EXT-FR-FE-185', 'delivery type code', deliveryTerms.deliveryTypeCode] as Check] : []),
  ]
  for (const [id, term, value] of checks) {
    if (value === undefined || value === '')
      throw new Error(`toCii: ${id} (${term}) is mandatory and empty`)
  }
  // The department name of a contact is a term of the seller and buyer only (BT-41-0, BT-56-0): the other
  // roles have no EN 16931 / EXT-FR-FE term for it (Factur-X EXTENDED BT-X-245 ... are outside the model).
  for (const party of [invoice.payee, invoice.sellerAgent, invoice.buyerAgent, invoice.invoicee, invoice.payer, invoice.billingParty]) {
    if (party?.contact?.departmentName !== undefined)
      throw new Error('toCii: a contact department name is only a term of the seller (BT-41-0) and buyer (BT-56-0) contacts')
  }
  // Schemes the CII matrix makes 1..1 (the model leaves them optional so a document can be read as it is).
  const schemes: Check[] = [
    ...schemeChecks('BT-34-1', 'seller electronic address scheme', seller.electronicAddress ? [seller.electronicAddress] : []),
    ...schemeChecks('BT-49-1', 'buyer electronic address scheme', buyer.electronicAddress ? [buyer.electronicAddress] : []),
    ...schemeChecks('EXT-FR-FE-30', 'payee electronic address scheme', invoice.payee?.electronicAddress ? [invoice.payee.electronicAddress] : []),
    ...schemeChecks('EXT-FR-FE-07', 'buyer agent identifier scheme', invoice.buyerAgent?.identifiers ?? []),
    ...schemeChecks('EXT-FR-FE-13', 'buyer agent electronic address scheme', invoice.buyerAgent?.electronicAddress ? [invoice.buyerAgent.electronicAddress] : []),
    ...schemeChecks('EXT-FR-FE-47', 'payer identifier scheme', invoice.payer?.identifiers ?? []),
    ...schemeChecks('EXT-FR-FE-53', 'payer electronic address scheme', invoice.payer?.electronicAddress ? [invoice.payer.electronicAddress] : []),
    ...schemeChecks('EXT-FR-FE-70', 'seller agent identifier scheme', invoice.sellerAgent?.identifiers ?? []),
    ...schemeChecks('EXT-FR-FE-76', 'seller agent electronic address scheme', invoice.sellerAgent?.electronicAddress ? [invoice.sellerAgent.electronicAddress] : []),
    ...schemeChecks('EXT-FR-FE-92-1', 'invoicee identifier scheme', invoice.invoicee?.identifiers ?? []),
    ...schemeChecks('EXT-FR-FE-99', 'invoicee electronic address scheme', invoice.invoicee?.electronicAddress ? [invoice.invoicee.electronicAddress] : []),
    ...schemeChecks('EXT-FR-FE-116', 'billing party identifier scheme', invoice.billingParty?.identifiers ?? []),
    ...schemeChecks('EXT-FR-FE-122', 'billing party electronic address scheme', invoice.billingParty?.electronicAddress ? [invoice.billingParty.electronicAddress] : []),
  ]
  for (const [id, term, value] of schemes) {
    if (value === undefined || value === '')
      throw new Error(`toCii: ${id} (${term}) is mandatory and empty`)
  }
}
