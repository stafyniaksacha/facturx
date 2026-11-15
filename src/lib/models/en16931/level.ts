// Kept out of the model index: the EN16931 namespace export holds classes only (a type alias in an
// `export * as` namespace breaks the bundled declarations).

/**
 * Profiles an EN 16931 invoice maps to and from in CII: Factur-X BASIC, EN 16931 and EXTENDED, and
 * the French EXTENDED-CTC-FR of XP Z12-012. MINIMUM and BASIC WL are not EN 16931 invoices.
 */
export type En16931Level = 'basic' | 'en16931' | 'extended' | 'extended-ctc-fr'
