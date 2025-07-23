# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

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
