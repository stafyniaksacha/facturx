import type { PDFDocument } from 'pdf-lib'
import type { XmpMetadata } from '../types'
import { PDFName } from 'pdf-lib'

export function setPDFA3BMetadata(
  { date, documentId, title, subject, author, producer, creator, filename, conformanceLevel }: XmpMetadata,
  pdf: PDFDocument,
): void {
  const metadataXML = `
  <?xpacket begin="" id="${documentId}"?>
    <x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
        <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
          <pdfaid:part>3</pdfaid:part>
          <pdfaid:conformance>B</pdfaid:conformance>
        </rdf:Description>

        <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:creator>
            <rdf:Seq>
              <rdf:li>${author}</rdf:li>
            </rdf:Seq>
          </dc:creator>
          <dc:title>
             <rdf:Alt>
                <rdf:li xml:lang="x-default">${title}</rdf:li>
             </rdf:Alt>
          </dc:title>
          <dc:description>
            <rdf:Alt>
              <rdf:li xml:lang="x-default">${subject}</rdf:li>
            </rdf:Alt>
          </dc:description>
        </rdf:Description>

        <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
          <pdf:Producer>${producer}</pdf:Producer>
        </rdf:Description>

        <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
          <xmp:CreatorTool>${creator}</xmp:CreatorTool>
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
          <fx:DocumentFileName>${filename}</fx:DocumentFileName>
          <fx:Version>1.0</fx:Version>
          <fx:ConformanceLevel>${conformanceLevel}</fx:ConformanceLevel>
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

// remove millisecond from date
function formatDateMetadata({ date }: { date: Date }): string {
  return `${date.toISOString().split('.')[0]}Z`
}
