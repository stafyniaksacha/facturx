import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import pkg from '../../package.json' assert { type: 'json' }

import type { PdfMetadata } from '../types'

import { XMLDocument } from 'libxmljs'
import {
  PDFDocument,
  AFRelationship,
  PDFHexString,
} from 'pdf-lib';

import { extractBaseInfo, getLevel, getFlavor } from './xml'
import { baseInfo2PdfMetadata } from './metadata'
import { FACTURX_CONFORMANCE_LEVEL, FACTURX_FILENAME, ORDERX_FILENAME, ZUGFERD_FILENAMES } from './constants'

import { resolvePdf, resolveXml } from './resolve'
import { setPDFA3BMetadata } from './xmp';
import { check } from './check';

export async function generate(options: {
  pdf: string | Buffer | PDFDocument
  xml: string | Buffer | XMLDocument
  check?: boolean
  flavor?: string
  level?: string
  language?: string
  meta?: PdfMetadata
}) {
  const xml =  await resolveXml(options.xml)

  const flavor = options.flavor || getFlavor(xml)
  const level = options.level || getLevel(xml)

  if (options.check === true) {
    const result = await check({
      xml,
      flavor,
      level,
    })
    if (!result.valid) {
      throw new Error(`Invalid XML format (${flavor} - ${level})`)
    }
  }

  let meta = options.meta

  if (!meta) {
    const info = await extractBaseInfo(xml)
    meta = baseInfo2PdfMetadata(info)
  }
  meta.date ||= new Date()

  let description = ''
  let filename = ''
  let conformanceLevel = ''

  switch (flavor) {
    case 'facturx':
      filename = FACTURX_FILENAME
      description = 'Factur-X XML file'
      conformanceLevel = FACTURX_CONFORMANCE_LEVEL[level as keyof typeof FACTURX_CONFORMANCE_LEVEL] || ''
      break
    case 'orderx':
      filename = ORDERX_FILENAME
      description = 'Order-X XML file'
      break
    case 'zugferd':
      filename = ZUGFERD_FILENAMES[0]
      description = 'ZUGFeRD XML file'
      break
    default:
      throw new Error(`Unknown schema flavor: "${options.flavor}"`)
  }

  const pdf = await resolvePdf(options.pdf)

  let documentId

  if (pdf.context.trailerInfo.ID) {
    throw new Error('Not implemented yet: Document ID already set')
  }
  else {
    documentId = randomBytes(16).toString('hex')
    const id = PDFHexString.of(documentId)
    pdf.context.trailerInfo.ID = pdf.context.obj([id, id]);
  }

  const encoder = new TextEncoder()
  const uint8Array = encoder.encode(xml.toString());
  
  await pdf.attach(uint8Array, filename, {
    afRelationship: AFRelationship.Data,
    mimeType: 'text/xml',
    creationDate: meta.date,
    modificationDate: meta.date,
    description,
  })

  const creator = `${pkg.name} npm lib v${pkg.version} (https://github.com/${pkg.repository})`

  if (options.language) {
    pdf.setLanguage(options.language)
  }
  pdf.setCreationDate(meta.date)
  pdf.setModificationDate(meta.date)

  pdf.setTitle(meta.title)
  pdf.setSubject(meta.subject)
  pdf.setAuthor(meta.author)
  pdf.setKeywords(meta.keywords)
  pdf.setCreator(creator)

  setPDFA3BMetadata({
    ...meta,
    documentId,
    filename,
    conformanceLevel,
    producer: creator,
    creator,
  }, pdf)

  return await pdf.save()
}