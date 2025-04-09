import { Buffer } from 'node:buffer'
import pkg from '../package.json' assert { type: 'json' }

import { XMLDocument } from 'libxmljs'
import {
  PDFDocument,
  AFRelationship,
} from 'pdf-lib';

import { extractAttachments } from './utils/pdf'
import { getXsd, getLevel, getFlavor, extractBaseInfo, baseInfo2PdfMetadata } from './utils/schema'
import { FACTURX_FILENAME, ORDERX_FILENAME, PdfMetadata, ZUGFERD_FILENAMES } from './constants'
import { resolvePdf, resolveXml } from './utils/resolve'
import { modelToXml } from './utils/converter'
import { FacturX } from './models/facturx'

export { modelToXml, FacturX }

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

  options.flavor ||= getFlavor(xml)
  options.level ||= getLevel(xml)

  if (options.check === true && !await check({
    xml,
    flavor: options.flavor,
    level: options.level,
  })) {
    throw new Error(`Invalid XML format (${options.flavor} - ${options.level})`)
  }

  let meta = options.meta

  if (!meta) {
    const info = await extractBaseInfo(xml)
    meta = baseInfo2PdfMetadata(info)
  }

  let description = ''
  let filename = ''

  switch (options.flavor) {
    case 'facturx':
      filename = FACTURX_FILENAME
      description = 'Factur-X XML file'
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

  const now = new Date()
  const pdf = await resolvePdf(options.pdf)
  
  await pdf.attach(xml.toString(), filename, {
    afRelationship: AFRelationship.Data,
    mimeType: 'application/xml',
    creationDate: now,
    modificationDate: now,
    description,
  })

  if (options.language) {
    pdf.setLanguage(options.language)
  }
  pdf.setCreationDate(now)
  pdf.setModificationDate(now)

  pdf.setTitle(meta.title)
  pdf.setSubject(meta.subject)
  pdf.setAuthor(meta.author)
  pdf.setKeywords(meta.keywords)
  pdf.setCreator(`${pkg.name} npm lib v${pkg.version} (https://github.com/${pkg.repository})`)

  return await pdf.save()
}

export async function extract(options: {
  pdf: string | Buffer | PDFDocument
  check?: boolean
  level?: string
  flavor?: string
}) {
  let file = null

  const pdf = await resolvePdf(options.pdf)
  
  const attachments = extractAttachments(pdf)

  if (attachments?.length) {
    for (const attachment of attachments) {
      if (attachment.name === FACTURX_FILENAME) {
        if (!options.flavor || options.flavor === 'facturx') {
          options.flavor = 'facturx'
        }
        else {
          throw new Error(`Invalid flavor, expected ${options.flavor} but found facturx`)
        }
        file = attachment
        break
      }
      if (attachment.name === ORDERX_FILENAME) {
        if (!options.flavor || options.flavor === 'orderx') {
          options.flavor = 'orderx'
        }
        else {
          throw new Error(`Invalid flavor, expected ${options.flavor} but found orderx`)
        }

        file = attachment
        break
      }
      if (ZUGFERD_FILENAMES.includes(attachment.name)) {
        if (!options.flavor || options.flavor === 'zugferd') {
          options.flavor = 'zugferd'
        }
        else {
          throw new Error(`Invalid flavor, expected ${options.flavor} but found zugferd`)
        }
        file = attachment
        break
      }
    }
  }

  if (!file) {
    throw new Error('No attachment found')
  }

  const xml = await resolveXml(Buffer.from(file.data))

  if (options.check === true && !await check({
    xml,
    flavor: options.flavor,
    level: options.level,
  })) {
    throw new Error('Invalid XML')
  }

  return [file.name, xml.toString()] as const
}

export async function check(options: {
  xml: string | Buffer | XMLDocument,
  flavor?: string,
  level?: string,
}): Promise<boolean> {
  const xml = await resolveXml(options.xml)

  options.flavor ||= getFlavor(xml)
  options.level ||= getLevel(xml)

  const xsd = await getXsd(options.flavor, options.level)
  return xml.validate(xsd) as boolean
}
