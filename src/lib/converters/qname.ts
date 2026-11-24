/**
 * `addElement()` arguments for a prefixed element name: `parent.addElement(...qname('ram:X'))`.
 *
 * libxml2-wasm's `addElement(name, prefix?)` takes a namespace **prefix** as its second argument and resolves it
 * against the declarations in scope (AGENTS.md). Given `'ram:X'` alone it creates an element literally named `ram:X`
 * in the default namespace in scope (none in CII, the root's in UBL): the serialised text is right, but the node
 * carries the wrong namespace in memory, so namespace-bound XPath on the writers' documents found nothing (was CG-74).
 * Split here, the element gets the namespace of its prefix and serialises to the same text, so `invoiceToXml()` does
 * not re-parse what it built (CII declares no default namespace, so its unprefixed attributes are in none, as they
 * should be). `invoiceToUbl()` still re-parses, for its attributes (see `buildUbl()`). The names are the writers' own
 * constants, never invoice content.
 */
export function qname(name: string): [localName: string, prefix: string] {
  const colon = name.indexOf(':')
  if (colon <= 0 || colon === name.length - 1)
    throw new Error(`qname: "${name}" is not a prefixed element name`)
  return [name.slice(colon + 1), name.slice(0, colon)]
}
