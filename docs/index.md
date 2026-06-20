---
layout: home

hero:
  name: Factur-X
  text: e-invoicing for TypeScript
  tagline: Generate, extract, parse and validate Factur-X / ZUGFeRD and Order-X e-invoices — conforming to Factur-X 1.09 / ZUGFeRD 2.5 (EN 16931).
  actions:
    - theme: brand
      text: What are Factur-X & ZUGFeRD?
      link: /guide/what-is-facturx
    - theme: alt
      text: Getting started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/stafyniaksacha/facturx

features:
  - icon: 📎
    title: Generate
    details: Embed a Factur-X / Order-X / ZUGFeRD XML into a PDF to produce a compliant PDF/A-3 invoice.
    link: /api/generate
  - icon: 📤
    title: Extract
    details: Pull the embedded XML back out of any Factur-X, Order-X or ZUGFeRD PDF.
    link: /api/extract
  - icon: 🔁
    title: Parse & build
    details: Read an XML invoice into a fully-typed Cross Industry Invoice model — and serialize it back.
    link: /api/parsing
  - icon: ✅
    title: Validate
    details: Check structure against the official 1.09 XSD, and the EN 16931 BR-* business rules via Schematron.
    link: /guide/validation
  - icon: 🗂
    title: All five profiles
    details: minimum, basicwl, basic, en16931 and extended — autodetected from the XML.
    link: /guide/profiles-and-flavors
  - icon: ⌨️
    title: CLI included
    details: A facturx command to generate, extract and check invoices straight from your terminal.
    link: /cli/
---
