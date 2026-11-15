/**
 * Header terms of the EN 16931 model ⇄ CII.
 *
 * Placement follows the Factur-X 1.09 field matrices (`fields--Factur-X_CII_D22B_<PROFILE>.csv`,
 * XPath column), also for the EXT-FR-FE fields where XP Z12-012 annex A shifts a row (CG-39). Shapes
 * mirror `xmlToInvoice()`: an array where the parser always returns one, so a document read and
 * written back compares equal.
 */

import type { Invoice } from '../../models/en16931/invoice'
import type { En16931Level } from '../../models/en16931/level'
import type { TermGate } from './levels'
import type { LinesInit } from './lines'
import type { PartiesInit } from './parties'
import type { SettlementInit } from './settlement'
import { Identifier } from '../../models/en16931/common'
import {
  AdditionalSupportingDocument,
  AttachedDocument,
  InvoiceNote,
  InvoicingPeriod,
  PrecedingInvoiceReference,
} from '../../models/en16931/invoice'
import {
  CrossIndustryInvoiceType,
  ExchangedDocumentContextType,
  ExchangedDocumentType,
  HeaderTradeAgreementType,
  HeaderTradeDeliveryType,
  HeaderTradeSettlementType,
  SupplyChainTradeTransactionType,
} from '../../models/facturx/crossIndustryInvoice'
import * as qdt from '../../models/facturx/qualifiedTypes'
import * as ram from '../../models/facturx/reusableTypes'
import * as udt from '../../models/facturx/unqualifiedTypes'
import { GUIDELINE_IDS, isSet } from './levels'
import { linesToCii } from './lines'
import { partiesToCii } from './parties'
import { settlementToCii } from './settlement'
import {
  agreed,
  BT8_FROM_CII,
  BT8_TO_CII,
  ciiCode,
  ciiDate,
  ciiDateTime,
  ciiFormattedDateTime,
  ciiId,
  ciiText,
  isBlank,
  isoFromCii,
  noteContent,
} from './values'

/**
 * `ram:AdditionalReferencedDocument/ram:TypeCode` telling its three EN 16931 uses apart (Factur-X
 * matrix usage notes of BT-122-0, BT-17-0, BT-18-0). Written in this order.
 */
const SUPPORTING_DOCUMENT = '916'
const TENDER_OR_LOT = '50'
const INVOICED_OBJECT = '130'

/**
 * Default of `ram:SpecifiedProcuringProject/ram:Name` (BT-11-0, mandatory in CII with BT-11) when the
 * invoice has no project name: Factur-X 1.09 appendix EN 16931 p.38 and spec p.125 ("Use "Project
 * reference" as default value for Name"; the same row also prints "Project Reference").
 */
const DEFAULT_PROJECT_NAME = 'Project reference'

/** Header terms Factur-X BASIC (missing from its matrix) or EN 16931 (EXT-FR-FE) cannot carry. */
export const HEADER_GATES: readonly TermGate[] = [
  { id: 'BT-7', term: 'value added tax point date', from: 'en16931', present: i => isSet(i.valueAddedTaxPointDate) },
  { id: 'BT-11', term: 'project reference', from: 'en16931', present: i => isSet(i.projectReference) },
  { id: 'BT-11-0', term: 'project name', from: 'en16931', present: i => isSet(i.projectName) },
  { id: 'BT-14', term: 'sales order reference', from: 'en16931', present: i => isSet(i.salesOrderReference) },
  { id: 'BT-15', term: 'receiving advice reference', from: 'en16931', present: i => isSet(i.receivingAdviceReference) },
  { id: 'BT-17', term: 'tender or lot reference', from: 'en16931', present: i => isSet(i.tenderOrLotReference) },
  { id: 'BT-18', term: 'invoiced object identifier', from: 'en16931', present: i => isSet(i.invoicedObjectIdentifiers) },
  { id: 'BG-24', term: 'additional supporting documents', from: 'en16931', present: i => isSet(i.additionalDocuments) },
  { id: 'EXT-FR-FE-01', term: 'contract code type', from: 'extended', present: i => isSet(i.contractCodeType) },
  { id: 'EXT-FR-FE-02', term: 'preceding invoice type code', from: 'extended', present: i => i.precedingInvoiceReferences.some(p => isSet(p.typeCode)) },
  { id: 'EXT-FR-FE-197', term: 'order date', from: 'extended', present: i => isSet(i.orderDate) },
  { id: 'EXT-FR-FE-198', term: 'despatch advice date', from: 'extended', present: i => isSet(i.despatchAdviceDate) },
  { id: 'EXT-FR-FE-199', term: 'contract date', from: 'extended', present: i => isSet(i.contractDate) },
]

type HeaderInit = Omit<ConstructorParameters<typeof Invoice>[0], keyof PartiesInit | keyof SettlementInit | keyof LinesInit>

/** The header terms of a CII invoice. */
export function headerFromCii(cii: CrossIndustryInvoiceType): HeaderInit {
  const context = cii.exchangedDocumentContext
  const document = cii.exchangedDocument
  const agreement = cii.supplyChainTradeTransaction?.applicableHeaderTradeAgreement
  const delivery = cii.supplyChainTradeTransaction?.applicableHeaderTradeDelivery
  const settlement = cii.supplyChainTradeTransaction?.applicableHeaderTradeSettlement
  const additional = agreement?.additionalReferencedDocument ?? []
  const ofType = (code: string): ram.ReferencedDocumentType[] => additional.filter(d => d.typeCode?.value === code)
  const taxes = settlement?.applicableTradeTax ?? []
  const period = settlement?.billingSpecifiedPeriod
  const startDate = isoFromCii(period?.startDateTime)
  const endDate = isoFromCii(period?.endDateTime)

  return {
    number: document?.id?.value ?? '',
    issueDate: isoFromCii(document?.issueDateTime) ?? '',
    typeCode: document?.typeCode?.value ?? '',
    currencyCode: settlement?.invoiceCurrencyCode?.value ?? '',
    vatAccountingCurrencyCode: settlement?.taxCurrencyCode?.value,
    // BT-7 and BT-8 repeat on every VAT breakdown entry that carries them (annex A: identical when
    // repeated); one value is read only when they all agree.
    valueAddedTaxPointDate: agreed(taxes.filter(t => t.taxPointDate).map(t => isoFromCii(t.taxPointDate))),
    valueAddedTaxPointDateCode: agreed(taxes.filter(t => t.dueDateTypeCode).map(t => BT8_FROM_CII.get(t.dueDateTypeCode!.value))),
    paymentDueDate: isoFromCii(settlement?.specifiedTradePaymentTerms?.[0]?.dueDateDateTime),
    buyerReference: agreement?.buyerReference?.value,
    projectReference: agreement?.specifiedProcuringProject?.id?.value,
    // The default name `toCii()` writes when BT-11-0 is absent reads back as absent, so a model built
    // without a project name round-trips unchanged; CII stays lossless, the writer re-emits the default.
    projectName: agreement?.specifiedProcuringProject?.name?.value === DEFAULT_PROJECT_NAME ? undefined : agreement?.specifiedProcuringProject?.name?.value,
    contractReference: agreement?.contractReferencedDocument?.issuerAssignedID?.value,
    contractCodeType: agreement?.contractReferencedDocument?.referenceTypeCode?.value,
    contractDate: isoFromCii(agreement?.contractReferencedDocument?.formattedIssueDateTime),
    purchaseOrderReference: agreement?.buyerOrderReferencedDocument?.issuerAssignedID?.value,
    orderDate: isoFromCii(agreement?.buyerOrderReferencedDocument?.formattedIssueDateTime),
    salesOrderReference: agreement?.sellerOrderReferencedDocument?.issuerAssignedID?.value,
    receivingAdviceReference: delivery?.receivingAdviceReferencedDocument?.issuerAssignedID?.value,
    despatchAdviceReference: delivery?.despatchAdviceReferencedDocument?.issuerAssignedID?.value,
    despatchAdviceDate: isoFromCii(delivery?.despatchAdviceReferencedDocument?.formattedIssueDateTime),
    tenderOrLotReference: ofType(TENDER_OR_LOT)[0]?.issuerAssignedID?.value,
    invoicedObjectIdentifiers: ofType(INVOICED_OBJECT).map(d => new Identifier({
      value: d.issuerAssignedID?.value ?? '',
      schemeId: d.referenceTypeCode?.value,
    })),
    buyerAccountingReference: settlement?.receivableSpecifiedTradeAccountingAccount?.[0]?.id?.value,
    businessProcessType: context?.businessProcessSpecifiedDocumentContextParameter?.id?.value,
    specificationIdentifier: context?.guidelineSpecifiedDocumentContextParameter?.id?.value,
    notes: (document?.includedNote ?? []).map(n => new InvoiceNote({
      subjectCode: n.subjectCode?.value,
      // The parser stands in an empty text for a missing Content (CG-37): not a value.
      note: n.content?.value === '' ? undefined : n.content?.value,
    })),
    precedingInvoiceReferences: (settlement?.invoiceReferencedDocument ?? []).map(r => new PrecedingInvoiceReference({
      reference: r.issuerAssignedID?.value ?? '',
      issueDate: isoFromCii(r.formattedIssueDateTime),
      typeCode: r.typeCode?.value,
    })),
    invoicingPeriod: startDate === undefined && endDate === undefined ? undefined : new InvoicingPeriod({ startDate, endDate }),
    additionalDocuments: ofType(SUPPORTING_DOCUMENT).map(d => new AdditionalSupportingDocument({
      reference: d.issuerAssignedID?.value ?? '',
      description: d.name?.[0]?.value,
      externalLocation: d.uriID?.value,
      attachedDocument: d.attachmentBinaryObject
        ? new AttachedDocument({
            content: d.attachmentBinaryObject.value,
            mimeCode: d.attachmentBinaryObject.mimeCode,
            filename: d.attachmentBinaryObject.filename,
          })
        : undefined,
    })),
  }
}

/**
 * BT-7 and BT-8 as the CII VAT breakdown entries carry them, for the settlement mapping to place on
 * `ram:ApplicableTradeTax`. Throws on a BT-8 code outside UNTDID 2005 3 / 35 / 432.
 */
export function valueAddedTaxPointToCii(invoice: Invoice): Pick<ram.TradeTaxType, 'taxPointDate' | 'dueDateTypeCode'> {
  const code = invoice.valueAddedTaxPointDateCode
  const untdid2475 = code === undefined ? undefined : BT8_TO_CII.get(code)
  if (code !== undefined && untdid2475 === undefined)
    throw new Error('toCii: BT-8 (value added tax point date code) must be a UNTDID 2005 code 3, 35 or 432')
  return {
    taxPointDate: ciiDate(invoice.valueAddedTaxPointDate, 'BT-7'),
    dueDateTypeCode: untdid2475 === undefined ? undefined : new qdt.TimeReferenceCodeType({ value: untdid2475 }),
  }
}

function referencedDocument(fields: Partial<ram.ReferencedDocumentType>): ram.ReferencedDocumentType | undefined {
  if (Object.values(fields).every(v => v === undefined))
    return undefined
  return new ram.ReferencedDocumentType({ ...fields, name: fields.name ?? [] })
}

/** The CII skeleton with the header terms, the party groups, the settlement groups and the lines in place. */
export function headerToCii(invoice: Invoice, level: En16931Level): CrossIndustryInvoiceType {
  // Validated here even though the VAT breakdown entries that carry them come from the settlement
  // mapping, so a bad value fails at the first toCii() call.
  valueAddedTaxPointToCii(invoice)
  const parties = partiesToCii(invoice)
  const settlement = settlementToCii(invoice, valueAddedTaxPointToCii)

  const additionalReferencedDocument: ram.ReferencedDocumentType[] = [
    ...invoice.additionalDocuments.map(d => new ram.ReferencedDocumentType({
      issuerAssignedID: ciiId(d.reference),
      uriID: ciiId(d.externalLocation),
      typeCode: new qdt.DocumentCodeType({ value: SUPPORTING_DOCUMENT }),
      name: d.description === undefined ? [] : [new udt.TextType({ value: d.description })],
      attachmentBinaryObject: d.attachedDocument
        ? new udt.BinaryObjectType({ value: d.attachedDocument.content, mimeCode: d.attachedDocument.mimeCode, filename: d.attachedDocument.filename })
        : undefined,
    })),
    ...(invoice.tenderOrLotReference === undefined
      ? []
      : [new ram.ReferencedDocumentType({
          issuerAssignedID: ciiId(invoice.tenderOrLotReference),
          typeCode: new qdt.DocumentCodeType({ value: TENDER_OR_LOT }),
          name: [],
        })]),
    ...invoice.invoicedObjectIdentifiers.map(o => new ram.ReferencedDocumentType({
      issuerAssignedID: ciiId(o.value),
      typeCode: new qdt.DocumentCodeType({ value: INVOICED_OBJECT }),
      name: [],
      referenceTypeCode: o.schemeId === undefined ? undefined : new qdt.ReferenceCodeType({ value: o.schemeId }),
    })),
  ]

  return new CrossIndustryInvoiceType({
    exchangedDocumentContext: new ExchangedDocumentContextType({
      businessProcessSpecifiedDocumentContextParameter: invoice.businessProcessType === undefined
        ? undefined
        : new ram.DocumentContextParameterType({ id: new udt.IDType({ value: invoice.businessProcessType }) }),
      guidelineSpecifiedDocumentContextParameter: new ram.DocumentContextParameterType({
        id: new udt.IDType({ value: invoice.specificationIdentifier ?? GUIDELINE_IDS[level] }),
      }),
    }),
    exchangedDocument: new ExchangedDocumentType({
      id: new udt.IDType({ value: invoice.number }),
      typeCode: new qdt.DocumentCodeType({ value: invoice.typeCode }),
      issueDateTime: ciiDateTime(invoice.issueDate === '' ? undefined : invoice.issueDate, 'BT-2')!,
      languageID: [],
      includedNote: invoice.notes.map(n => new ram.NoteType({
        // A note without text (allowed at the extended levels, refused below by `toCii()`) has no Content.
        content: noteContent(n.note),
        subjectCode: ciiCode(n.subjectCode),
      })),
    }),
    supplyChainTradeTransaction: new SupplyChainTradeTransactionType({
      includedSupplyChainTradeLineItem: linesToCii(invoice),
      applicableHeaderTradeAgreement: new HeaderTradeAgreementType({
        buyerReference: ciiText(invoice.buyerReference),
        ...parties.agreement,
        sellerOrderReferencedDocument: referencedDocument({ issuerAssignedID: ciiId(invoice.salesOrderReference) }),
        buyerOrderReferencedDocument: referencedDocument({
          issuerAssignedID: ciiId(invoice.purchaseOrderReference),
          formattedIssueDateTime: ciiFormattedDateTime(invoice.orderDate, 'EXT-FR-FE-197'),
        }),
        contractReferencedDocument: referencedDocument({
          issuerAssignedID: ciiId(invoice.contractReference),
          referenceTypeCode: invoice.contractCodeType === undefined ? undefined : new qdt.ReferenceCodeType({ value: invoice.contractCodeType }),
          formattedIssueDateTime: ciiFormattedDateTime(invoice.contractDate, 'EXT-FR-FE-199'),
        }),
        additionalReferencedDocument,
        specifiedProcuringProject: invoice.projectReference === undefined
          ? undefined
          : new ram.ProcuringProjectType({ id: new udt.IDType({ value: invoice.projectReference }), name: new udt.TextType({ value: invoice.projectName ?? DEFAULT_PROJECT_NAME }) }),
        ultimateCustomerOrderReferencedDocument: [],
      }),
      applicableHeaderTradeDelivery: new HeaderTradeDeliveryType({
        ...parties.delivery,
        despatchAdviceReferencedDocument: referencedDocument({
          issuerAssignedID: ciiId(invoice.despatchAdviceReference),
          formattedIssueDateTime: ciiFormattedDateTime(invoice.despatchAdviceDate, 'EXT-FR-FE-198'),
        }),
        receivingAdviceReferencedDocument: referencedDocument({ issuerAssignedID: ciiId(invoice.receivingAdviceReference) }),
      }),
      applicableHeaderTradeSettlement: new HeaderTradeSettlementType({
        ...parties.settlement,
        taxCurrencyCode: invoice.vatAccountingCurrencyCode === undefined ? undefined : new qdt.CurrencyCodeType({ value: invoice.vatAccountingCurrencyCode }),
        invoiceCurrencyCode: new qdt.CurrencyCodeType({ value: invoice.currencyCode }),
        billingSpecifiedPeriod: invoice.invoicingPeriod
          ? new ram.SpecifiedPeriodType({
              startDateTime: ciiDateTime(invoice.invoicingPeriod.startDate, 'BT-73'),
              endDateTime: ciiDateTime(invoice.invoicingPeriod.endDate, 'BT-74'),
            })
          : undefined,
        ...settlement,
        invoiceReferencedDocument: invoice.precedingInvoiceReferences.map(p => new ram.ReferencedDocumentType({
          issuerAssignedID: ciiId(p.reference),
          typeCode: p.typeCode === undefined ? undefined : new qdt.DocumentCodeType({ value: p.typeCode }),
          name: [],
          formattedIssueDateTime: ciiFormattedDateTime(p.issueDate, 'BT-26'),
        })),
        receivableSpecifiedTradeAccountingAccount: invoice.buyerAccountingReference === undefined
          ? []
          : [new ram.TradeAccountingAccountType({ id: new udt.IDType({ value: invoice.buyerAccountingReference }) })],
      }),
    }),
  })
}

/**
 * Throws, naming the business term and rule, when a mandatory term of a header group the invoice holds
 * is missing or empty: BT-25 in each BG-3 (BR-55), BT-122 in each BG-24 (BR-52), BT-125-1 and BT-125-2
 * with a BT-125, BT-17 and BT-18 when set
 * (BR-52 also reads the empty `ram:IssuerAssignedID` of their type-code 50 / 130 documents), BT-73 or
 * BT-74 in a BG-14 (BR-CO-19), BT-22 in each BG-1 at `basic` and `en16931`. Never quotes invoice content; `buildCii` stays
 * tolerant, so `fromCii()` can still read such a document.
 */
export function assertHeaderComplete(invoice: Invoice, level: En16931Level): void {
  const empty = isBlank
  for (const reference of invoice.precedingInvoiceReferences ?? []) {
    if (empty(reference.reference))
      throw new Error('toCii: BT-25 (preceding invoice reference) is mandatory and empty in each BG-3 (BR-55)')
  }
  for (const document of invoice.additionalDocuments ?? []) {
    if (empty(document.reference))
      throw new Error('toCii: BT-122 (supporting document reference) is mandatory and empty in each BG-24 (BR-52)')
    // CII makes `@mimeCode` and `@filename` mandatory on `ram:AttachmentBinaryObject` (matrix BT-125-1, BT-125-2).
    if (document.attachedDocument && empty(document.attachedDocument.mimeCode))
      throw new Error('toCii: BT-125-1 (attached document MIME code) is mandatory and empty when BT-125 (attached document) is set')
    if (document.attachedDocument && empty(document.attachedDocument.filename))
      throw new Error('toCii: BT-125-2 (attached document filename) is mandatory and empty when BT-125 (attached document) is set')
  }
  if (invoice.tenderOrLotReference !== undefined && empty(invoice.tenderOrLotReference))
    throw new Error('toCii: BT-17 (tender or lot reference) is set but empty (BR-52)')
  for (const object of invoice.invoicedObjectIdentifiers ?? []) {
    if (empty(object.value))
      throw new Error('toCii: BT-18 (invoiced object identifier) is set but empty (BR-52)')
  }
  if (invoice.invoicingPeriod && empty(invoice.invoicingPeriod.startDate) && empty(invoice.invoicingPeriod.endDate))
    throw new Error('toCii: BG-14 (invoicing period) needs BT-73 (start date) or BT-74 (end date) (BR-CO-19)')
  // BT-22 is 1..1 in BG-1 in EN 16931 and the BASIC / EN 16931 matrices, 0..1 at EXTENDED-CTC-FR (annex A)
  // and in the EXTENDED XSD (`NoteType/Content` `minOccurs="0"`).
  if (level === 'basic' || level === 'en16931') {
    for (const note of invoice.notes ?? []) {
      if (empty(note.note))
        throw new Error(`toCii: BT-22 (invoice note) is mandatory and empty in each BG-1 at level "${level}"; a note without text needs level "extended" or "extended-ctc-fr"`)
    }
  }
  // A note with neither text nor subject code carries nothing: it would write an empty `ram:IncludedNote`.
  // At `extended` that avoids PEPPOL-EN16931-R008 (empty element); at `extended-ctc-fr`, whose Schematron has
  // no such rule, it is a deliberate choice, stricter than the level's Schematron.
  if (level === 'extended' || level === 'extended-ctc-fr') {
    for (const note of invoice.notes ?? []) {
      if (empty(note.note) && empty(note.subjectCode))
        throw new Error('toCii: BG-1 (invoice note) needs BT-22 (invoice note) or BT-21 (invoice note subject code)')
    }
  }
  // Factur-X EXTENDED: a subject code needs the text or the coded text BT-X-5 (BR-FXEXT-01), which the model
  // does not hold. The EXTENDED-CTC-FR Schematron has no such rule.
  if (level === 'extended') {
    for (const note of invoice.notes ?? []) {
      if (empty(note.note) && !empty(note.subjectCode))
        throw new Error('toCii: BT-21 (invoice note subject code) needs BT-22 (invoice note) at level "extended" (BR-FXEXT-01); a subject code alone needs level "extended-ctc-fr"')
    }
  }
}
