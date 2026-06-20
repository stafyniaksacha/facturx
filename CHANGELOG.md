# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [0.5.0](https://github.com/stafyniaksacha/facturx/compare/v0.4.0...v0.5.0) (2026-06-20)


### Features

* **cli:** add `check --schematron` + document 1.09 features in README ([#11](https://github.com/stafyniaksacha/facturx/issues/11)) ([f117d39](https://github.com/stafyniaksacha/facturx/commit/f117d39736c2b587410d9c6d4ae0a266d3c3e3fc))
* **facturx:** add Schematron (business-rule) validation ([#10](https://github.com/stafyniaksacha/facturx/issues/10)) ([6bcd2a3](https://github.com/stafyniaksacha/facturx/commit/6bcd2a3e75039867c221038bb826b2583d59017f))
* **facturx:** full EXTENDED 1.09 parity for models, converter and parser ([#9](https://github.com/stafyniaksacha/facturx/issues/9)) ([87199cf](https://github.com/stafyniaksacha/facturx/commit/87199cfe62219db1c39b48b3b7b35281264a4b56))
* **facturx:** refresh XSDs to 1.09 (ZUGFeRD 2.5) + fix converter data-loss bugs ([#8](https://github.com/stafyniaksacha/facturx/issues/8)) ([0e72973](https://github.com/stafyniaksacha/facturx/commit/0e7297329ceeca14c6f6b033305ba3fce26bfa9e))

## [0.4.0](https://github.com/stafyniaksacha/facturx/compare/v0.3.0...v0.4.0) (2025-07-23)


### Features

* add xmlToInvoice method to convert xml into CrossIndustryInvoiceType object ([5f2b3ef](https://github.com/stafyniaksacha/facturx/commit/5f2b3efeba35182010e1f44fc1f79f6754fa1ea0))


### Bug Fixes

* **models:** make lineTotalAmount and applicableTradeTax optionnal as they are not required in minimal spec ([5346821](https://github.com/stafyniaksacha/facturx/commit/5346821189d02f4ed42b2ccd93ce4f298a1c17dc))
* rename basic-wl level to basicwl ([2d9c6a3](https://github.com/stafyniaksacha/facturx/commit/2d9c6a363775e30b3ac91d42ff74b29ad8c41bed)), closes [#4](https://github.com/stafyniaksacha/facturx/issues/4)
* update build config to copy xsd files + update tests to use module instead of source ([6144d91](https://github.com/stafyniaksacha/facturx/commit/6144d9133743d815b8d58876d132f63abe5eb32c)), closes [#5](https://github.com/stafyniaksacha/facturx/issues/5)

## [0.3.0](https://github.com/stafyniaksacha/facturx/compare/v0.2.0...v0.3.0) (2025-04-10)


### Features

* add facturx models ([9cd8b03](https://github.com/stafyniaksacha/facturx/commit/9cd8b039a9eecc7b348591c9dbaddc001529afaf))
* add validation errors check + generate xmp metadata + valid PDF-A/3 generator example ([bb4f606](https://github.com/stafyniaksacha/facturx/commit/bb4f6067bc800476d634690cd8003ba3de693ba5))
* esm only module + update unbuild and vitest ([cce1b48](https://github.com/stafyniaksacha/facturx/commit/cce1b484437436a802be8d0b3cce542ca34d46a7))


### Bug Fixes

* set node minimum engine ([1bf2fdf](https://github.com/stafyniaksacha/facturx/commit/1bf2fdfc409dcfb1b03a0f2563a71a079afedf82))
