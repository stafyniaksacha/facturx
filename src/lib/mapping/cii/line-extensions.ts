/**
 * The EXTENDED-CTC-FR groups of an invoice line ⇄ CII (`EXT-FR-FE-BG-06` ... `-BG-15`).
 *
 * Placement follows the Factur-X 1.09 EXTENDED field matrix (`fields--Factur-X_CII_D22B_EXTENDED.csv`,
 * XPath column), not the annex A CII rows that CG-39 lists as shifted (`BT-X-579` .. `BT-X-585` carry
 * the postal address fields on the wrong elements there; BT-X-562 sits under the header). Shapes
 * mirror `xmlToInvoice()` so a document read and written back compares equal.
 */

import type { InvoiceLine } from '../../models/en16931/lines'
import {
  LineActualDelivery,
  LineDeliverTo,
  LineDeliveryTerms,
  LineDespatchAdviceReference,
  LinePrecedingInvoiceReference,
  LineReceivingAdviceReference,
  LineSeller,
  LineSellerOrderReference,
} from '../../models/en16931/line-extensions'
import * as qdt from '../../models/facturx/qualifiedTypes'
import * as ram from '../../models/facturx/reusableTypes'
import * as udt from '../../models/facturx/unqualifiedTypes'
import {
  addressFromCii,
  identifierFromCii,
  identifiersFromCii,
  partyToCii,
  registrationFromCii,
  TAX,
  VAT,
} from './parties'
import { ciiDateTime, ciiFormattedDateTime, ciiId, isoFromCii } from './values'

// ---------------------------------------------------------------------------
// CII → model
// ---------------------------------------------------------------------------

function anySet(...values: unknown[]): boolean {
  return values.some(v => v !== undefined)
}

/** The preceding invoice reference of a line: CII has one (`InvoiceReferencedDocument`). */
export function precedingFromCii(doc: ram.ReferencedDocumentType | undefined): LinePrecedingInvoiceReference[] {
  if (!doc)
    return []
  return [new LinePrecedingInvoiceReference({
    reference: doc.issuerAssignedID?.value,
    lineReference: doc.lineID?.value,
    typeCode: doc.typeCode?.value,
    issueDate: isoFromCii(doc.formattedIssueDateTime),
  })]
}

export function sellerOrderFromCii(doc: ram.ReferencedDocumentType | undefined): LineSellerOrderReference | undefined {
  const orderReference = doc?.issuerAssignedID?.value
  const orderLineReference = doc?.lineID?.value
  return anySet(orderReference, orderLineReference) ? new LineSellerOrderReference({ orderReference, orderLineReference }) : undefined
}

export function despatchFromCii(doc: ram.ReferencedDocumentType | undefined): LineDespatchAdviceReference | undefined {
  const reference = doc?.issuerAssignedID?.value
  const lineReference = doc?.lineID?.value
  const issueDate = isoFromCii(doc?.formattedIssueDateTime)
  return anySet(reference, lineReference, issueDate) ? new LineDespatchAdviceReference({ reference, lineReference, issueDate }) : undefined
}

export function receivingFromCii(doc: ram.ReferencedDocumentType | undefined): LineReceivingAdviceReference | undefined {
  const reference = doc?.issuerAssignedID?.value
  const lineReference = doc?.lineID?.value
  return anySet(reference, lineReference) ? new LineReceivingAdviceReference({ reference, lineReference }) : undefined
}

export function deliverToFromCii(party: ram.TradePartyType | undefined): LineDeliverTo | undefined {
  if (!party)
    return undefined
  const identifiers = identifiersFromCii(party, false)
  const name = party.name?.value
  const address = addressFromCii(party.postalTradeAddress)
  return identifiers.length > 0 || anySet(name, address) ? new LineDeliverTo({ identifiers, name, address }) : undefined
}

export function actualDeliveryFromCii(event: ram.SupplyChainEventType | undefined): LineActualDelivery | undefined {
  // A date that is not format 102 reads as '' (the CII value is then reported in `dropped`).
  return event ? new LineActualDelivery({ actualDeliveryDate: isoFromCii(event.occurrenceDateTime) ?? '' }) : undefined
}

export function lineSellerFromCii(party: ram.TradePartyType | undefined): LineSeller | undefined {
  if (!party)
    return undefined
  const identifiers = identifiersFromCii(party, false)
  const name = party.name?.value
  const tradingName = party.specifiedLegalOrganization?.tradingBusinessName?.value
  const legalRegistrationIdentifier = identifierFromCii(party.specifiedLegalOrganization?.id)
  const electronicAddress = identifierFromCii(party.uriUniversalCommunication?.uriID)
  const vatIdentifier = registrationFromCii(party, VAT)
  const taxRegistrationIdentifier = registrationFromCii(party, TAX)
  const address = addressFromCii(party.postalTradeAddress)
  if (identifiers.length === 0 && !anySet(name, tradingName, legalRegistrationIdentifier, electronicAddress, vatIdentifier, taxRegistrationIdentifier, address))
    return undefined
  return new LineSeller({ identifiers, name, tradingName, legalRegistrationIdentifier, electronicAddress, vatIdentifier, taxRegistrationIdentifier, address })
}

export function deliveryTermsFromCii(terms: ram.TradeDeliveryTermsType | undefined): LineDeliveryTerms | undefined {
  return terms
    ? new LineDeliveryTerms({ deliveryTypeCode: terms.deliveryTypeCode?.value ?? '', locationName: terms.relevantTradeLocation?.name?.value })
    : undefined
}

// ---------------------------------------------------------------------------
// Model → CII
// ---------------------------------------------------------------------------

// The parser always gives `name: []` for a referenced document; an unset group writes nothing.
function referencedDocument(fields: Partial<ram.ReferencedDocumentType>): ram.ReferencedDocumentType | undefined {
  if (Object.values(fields).every(v => v === undefined))
    return undefined
  return new ram.ReferencedDocumentType({ ...fields, name: [] })
}

export function precedingToCii(references: LinePrecedingInvoiceReference[]): ram.ReferencedDocumentType | undefined {
  const [reference] = references
  return reference && (referencedDocument({
    issuerAssignedID: ciiId(reference.reference),
    lineID: ciiId(reference.lineReference),
    typeCode: reference.typeCode === undefined ? undefined : new qdt.DocumentCodeType({ value: reference.typeCode }),
    formattedIssueDateTime: ciiFormattedDateTime(reference.issueDate, 'EXT-FR-FE-138'),
  }) ?? new ram.ReferencedDocumentType({ name: [] }))
}

export function sellerOrderToCii(order: LineSellerOrderReference | undefined): ram.ReferencedDocumentType | undefined {
  return order && (referencedDocument({ issuerAssignedID: ciiId(order.orderReference), lineID: ciiId(order.orderLineReference) }) ?? new ram.ReferencedDocumentType({ name: [] }))
}

export function buyerOrderToCii(line: InvoiceLine): ram.ReferencedDocumentType | undefined {
  return referencedDocument({
    issuerAssignedID: ciiId(line.purchaseOrderReference),
    lineID: ciiId(line.purchaseOrderLineReference),
    formattedIssueDateTime: ciiFormattedDateTime(line.purchaseOrderDate, 'EXT-FR-FE-200'),
  })
}

export function despatchToCii(advice: LineDespatchAdviceReference | undefined): ram.ReferencedDocumentType | undefined {
  return advice && (referencedDocument({
    issuerAssignedID: ciiId(advice.reference),
    lineID: ciiId(advice.lineReference),
    formattedIssueDateTime: ciiFormattedDateTime(advice.issueDate, 'EXT-FR-FE-201'),
  }) ?? new ram.ReferencedDocumentType({ name: [] }))
}

export function receivingToCii(advice: LineReceivingAdviceReference | undefined): ram.ReferencedDocumentType | undefined {
  return advice && (referencedDocument({ issuerAssignedID: ciiId(advice.reference), lineID: ciiId(advice.lineReference) }) ?? new ram.ReferencedDocumentType({ name: [] }))
}

export function deliverToToCii(deliverTo: LineDeliverTo | undefined): ram.TradePartyType | undefined {
  return deliverTo && partyToCii({ identifiers: deliverTo.identifiers, name: deliverTo.name, address: deliverTo.address }, false)
}

export function actualDeliveryToCii(delivery: LineActualDelivery | undefined): ram.SupplyChainEventType | undefined {
  return delivery && new ram.SupplyChainEventType({ occurrenceDateTime: ciiDateTime(delivery.actualDeliveryDate, 'EXT-FR-FE-158')! })
}

export function lineSellerToCii(seller: LineSeller | undefined): ram.TradePartyType | undefined {
  return seller && partyToCii(seller, false)
}

export function deliveryTermsToCii(terms: LineDeliveryTerms | undefined): ram.TradeDeliveryTermsType | undefined {
  return terms && new ram.TradeDeliveryTermsType({
    deliveryTypeCode: new qdt.DeliveryTermsCodeType({ value: terms.deliveryTypeCode }),
    relevantTradeLocation: terms.locationName === undefined ? undefined : new ram.TradeLocationType({ name: new udt.TextType({ value: terms.locationName }) }),
  })
}
