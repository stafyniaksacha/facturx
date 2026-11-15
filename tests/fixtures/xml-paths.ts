import { XmlDocument, XmlElement } from 'libxml2-wasm'

const PREFIXES: Record<string, string> = {
  'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100': 'rsm',
  'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100': 'ram',
  'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100': 'udt',
  'urn:un:unece:uncefact:data:standard:QualifiedDataType:100': 'qdt',
}

function qualifiedName(name: string, namespaceUri: string): string {
  if (!namespaceUri)
    return name
  return `${PREFIXES[namespaceUri] ?? `{${namespaceUri}}`}:${name}`
}

/**
 * Every element and attribute of `xml` as a path from the root (`/rsm:CrossIndustryInvoice/…/@schemeID`),
 * one entry per occurrence, sorted. Prefixes are derived from the namespace, so two documents that bind
 * other prefixes to the same namespaces give the same paths.
 *
 * Comparing the paths of two documents both ways finds an element or attribute that one of them lacks,
 * whatever its value: the check a model-to-model round trip cannot make when both sides go through the
 * parser.
 */
export function xmlPaths(xml: string): string[] {
  const doc = XmlDocument.fromString(xml)
  try {
    const paths: string[] = []
    const walk = (element: XmlElement, parent: string): void => {
      const path = `${parent}/${qualifiedName(element.name, element.namespaceUri)}`
      paths.push(path)
      for (const attribute of element.attrs)
        paths.push(`${path}/@${qualifiedName(attribute.name, attribute.namespaceUri)}`)
      for (let child = element.firstChild; child; child = child.next) {
        if (child instanceof XmlElement)
          walk(child, path)
      }
    }
    walk(doc.root, '')
    return paths.sort()
  }
  finally {
    doc.dispose()
  }
}
