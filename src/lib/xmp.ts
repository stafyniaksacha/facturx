import type { PDFDocument } from 'pdf-lib'
import type { XmpMetadata } from '../types'
import { PDFName } from 'pdf-lib'

// Fixed packet id defined by the XMP specification, as used in the spec's
// reference packet `distribution/2. FACTUR-X_extension_schema_exemple.xmp.txt`. It is not a
// document identifier.
const XMP_PACKET_ID = 'W5M0MpCehiHzreSzNTczkc9d'

export function setPDFA3BMetadata(
  { date, title, subject, author, producer, creator, filename, conformanceLevel }: XmpMetadata,
  pdf: PDFDocument,
): void {
  const metadataXML = `
  <?xpacket begin="" id="${XMP_PACKET_ID}"?>
    <x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
        <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
          <pdfaid:part>3</pdfaid:part>
          <pdfaid:conformance>B</pdfaid:conformance>
        </rdf:Description>

        <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:creator>
            <rdf:Seq>
              <rdf:li>${xmlEscape(author)}</rdf:li>
            </rdf:Seq>
          </dc:creator>
          <dc:title>
             <rdf:Alt>
                <rdf:li xml:lang="x-default">${xmlEscape(title)}</rdf:li>
             </rdf:Alt>
          </dc:title>
          <dc:description>
            <rdf:Alt>
              <rdf:li xml:lang="x-default">${xmlEscape(subject)}</rdf:li>
            </rdf:Alt>
          </dc:description>
        </rdf:Description>

        <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
          <pdf:Producer>${xmlEscape(producer)}</pdf:Producer>
        </rdf:Description>

        <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
          <xmp:CreatorTool>${xmlEscape(creator)}</xmp:CreatorTool>
          <xmp:CreateDate>${formatDateMetadata({ date })}</xmp:CreateDate>
          <xmp:ModifyDate>${formatDateMetadata({ date })}</xmp:ModifyDate>
          <xmp:MetadataDate>${formatDateMetadata({ date })}</xmp:MetadataDate>
        </rdf:Description>

        <rdf:Description xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#" rdf:about="">
          <pdfaExtension:schemas>
            <rdf:Bag>
              <rdf:li rdf:parseType="Resource">
                <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
                <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
                <pdfaSchema:prefix>fx</pdfaSchema:prefix>
                <pdfaSchema:property>
                  <rdf:Seq>
                    <rdf:li rdf:parseType="Resource">
                      <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                      <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                      <pdfaProperty:category>external</pdfaProperty:category>
                      <pdfaProperty:description>name of the embedded XML invoice file</pdfaProperty:description>
                    </rdf:li>
                    <rdf:li rdf:parseType="Resource">
                      <pdfaProperty:name>DocumentType</pdfaProperty:name>
                      <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                      <pdfaProperty:category>external</pdfaProperty:category>
                      <pdfaProperty:description>INVOICE</pdfaProperty:description>
                    </rdf:li>
                    <rdf:li rdf:parseType="Resource">
                      <pdfaProperty:name>Version</pdfaProperty:name>
                      <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                      <pdfaProperty:category>external</pdfaProperty:category>
                      <pdfaProperty:description>The actual version of the Factur-X XML schema</pdfaProperty:description>
                    </rdf:li>
                    <rdf:li rdf:parseType="Resource">
                      <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                      <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                      <pdfaProperty:category>external</pdfaProperty:category>
                      <pdfaProperty:description>The conformance level of the embedded Factur-X data</pdfaProperty:description>
                    </rdf:li>
                  </rdf:Seq>
                </pdfaSchema:property>
              </rdf:li>
            </rdf:Bag>
          </pdfaExtension:schemas>
        </rdf:Description>
        <rdf:Description xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#" rdf:about="">
          <fx:DocumentType>INVOICE</fx:DocumentType>
          <fx:DocumentFileName>${xmlEscape(filename)}</fx:DocumentFileName>
          <fx:Version>1.0</fx:Version>
          <fx:ConformanceLevel>${xmlEscape(conformanceLevel)}</fx:ConformanceLevel>
        </rdf:Description>
      </rdf:RDF>
    </x:xmpmeta>
  <?xpacket end="w"?>
  `.trim()

  const metadataStream = pdf.context.stream(metadataXML, {
    Type: 'Metadata',
    Subtype: 'XML',
    Length: metadataXML.length,
  })
  const metadataStreamRef = pdf.context.register(metadataStream)
  pdf.catalog.set(PDFName.of('Metadata'), metadataStreamRef)
}

// Characters XML 1.0 forbids (§2.2 Char): C0 controls other than tab/LF/CR, lone surrogates,
// U+FFFE/U+FFFF. They cannot be escaped, only dropped.
// eslint-disable-next-line no-control-regex
const XML_INVALID_CHARS = /[\u0000-\u0008\v\f\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/**
 * Escapes a value for XML text or attribute content (CG-03): invoice fields such as the seller
 * name reach the XMP packet, so `&` or `<` would make it malformed (BR-HYBRID-03) and markup in
 * them could inject XMP properties such as a second `fx:ConformanceLevel`.
 */
export function xmlEscape(value: string | undefined | null): string {
  return String(value ?? '')
    .replace(XML_INVALID_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// remove millisecond from date
function formatDateMetadata({ date }: { date: Date }): string {
  return `${date.toISOString().split('.')[0]}Z`
}
