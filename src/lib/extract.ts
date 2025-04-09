import type { PDFDocument } from 'pdf-lib'

import { Buffer } from 'node:buffer'

import { check } from './check'
import { FACTURX_FILENAME, ORDERX_FILENAME, ZUGFERD_FILENAMES } from './constants'
import { extractAttachments } from './pdf'
import { resolvePdf, resolveXml } from './resolve'

interface ExtractResult {
  filename: string
  xml: string
  flavor?: string
  level?: string
}

export async function extract(options: {
  pdf: string | Buffer | PDFDocument
  check?: boolean
  level?: string
  flavor?: string
}): Promise<ExtractResult> {
  let file = null

  const pdf = await resolvePdf(options.pdf)

  let flavor = options.flavor
  const level = options.level
  const attachments = extractAttachments(pdf)

  if (attachments?.length) {
    for (const attachment of attachments) {
      if (attachment.name === FACTURX_FILENAME) {
        if (!options.flavor || options.flavor === 'facturx') {
          flavor = 'facturx'
        }
        else {
          throw new Error(`Invalid flavor, expected ${options.flavor} but found facturx`)
        }
        file = attachment
        break
      }
      if (attachment.name === ORDERX_FILENAME) {
        if (!options.flavor || options.flavor === 'orderx') {
          flavor = 'orderx'
        }
        else {
          throw new Error(`Invalid flavor, expected ${options.flavor} but found orderx`)
        }

        file = attachment
        break
      }
      if (ZUGFERD_FILENAMES.includes(attachment.name)) {
        if (!options.flavor || options.flavor === 'zugferd') {
          flavor = 'zugferd'
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

  if (options.check === true) {
    const result = await check({
      xml,
      flavor,
      level,
    })
    if (!result.valid) {
      throw new Error('Invalid XML')
    }
  }

  return {
    filename: file.name,
    xml: xml.toString(),
    flavor,
    level,
  }
}
