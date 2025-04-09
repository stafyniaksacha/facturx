export function getMinimumXML() {
  return `
  <?xml version="1.0" encoding="UTF-8"?>
  <rsm:CrossIndustryInvoice xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <rsm:ExchangedDocumentContext>
      <ram:GuidelineSpecifiedDocumentContextParameter>
        <ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>
      </ram:GuidelineSpecifiedDocumentContextParameter>
    </rsm:ExchangedDocumentContext>
    <rsm:ExchangedDocument>
      <ram:ID>FA-2017-0010</ram:ID>
      <ram:TypeCode>380</ram:TypeCode>
      <ram:IssueDateTime>
        <udt:DateTimeString format="102">20171113</udt:DateTimeString>
      </ram:IssueDateTime>
    </rsm:ExchangedDocument>
    <rsm:SupplyChainTradeTransaction>
      <ram:ApplicableHeaderTradeAgreement>
        <ram:SellerTradeParty>
          <ram:Name>Au bon moulin</ram:Name>
          <ram:SpecifiedLegalOrganization>
            <ram:ID schemeID="0002">99999999800010</ram:ID>
          </ram:SpecifiedLegalOrganization>
          <ram:PostalTradeAddress>
            <ram:CountryID>FR</ram:CountryID>
          </ram:PostalTradeAddress>
          <ram:SpecifiedTaxRegistration>
            <ram:ID schemeID="VA">FR11999999998</ram:ID>
          </ram:SpecifiedTaxRegistration>
        </ram:SellerTradeParty>
        <ram:BuyerTradeParty>
          <ram:Name>Ma jolie boutique</ram:Name>
          <ram:SpecifiedLegalOrganization>
            <ram:ID schemeID="0002">78787878400035</ram:ID>
          </ram:SpecifiedLegalOrganization>
        </ram:BuyerTradeParty>
        <ram:BuyerOrderReferencedDocument>
          <ram:IssuerAssignedID>PO445</ram:IssuerAssignedID>
        </ram:BuyerOrderReferencedDocument>
      </ram:ApplicableHeaderTradeAgreement>
      <ram:ApplicableHeaderTradeDelivery/>
      <ram:ApplicableHeaderTradeSettlement>
        <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
        <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
          <ram:TaxBasisTotalAmount>624.90</ram:TaxBasisTotalAmount>
          <ram:TaxTotalAmount currencyID="EUR">46.25</ram:TaxTotalAmount>
          <ram:GrandTotalAmount>671.15</ram:GrandTotalAmount>
          <ram:DuePayableAmount>470.15</ram:DuePayableAmount>
        </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
      </ram:ApplicableHeaderTradeSettlement>
    </rsm:SupplyChainTradeTransaction>
  </rsm:CrossIndustryInvoice>`.trim()
}

export function getEN16931XML() {
  return `
  <?xml version="1.0" encoding="UTF-8"?>
  <rsm:CrossIndustryInvoice xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <rsm:ExchangedDocumentContext>
      <ram:GuidelineSpecifiedDocumentContextParameter>
        <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
      </ram:GuidelineSpecifiedDocumentContextParameter>
    </rsm:ExchangedDocumentContext>
    <rsm:ExchangedDocument>
      <ram:ID>FA-2017-0010</ram:ID>
      <ram:TypeCode>380</ram:TypeCode>
      <ram:IssueDateTime>
        <udt:DateTimeString format="102">20171113</udt:DateTimeString>
      </ram:IssueDateTime>
      <ram:IncludedNote>
        <ram:Content>Franco de port (commande &gt; 300 € HT)</ram:Content>
      </ram:IncludedNote>
    </rsm:ExchangedDocument>
    <rsm:SupplyChainTradeTransaction>
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>1</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          <ram:GlobalID schemeID="0160">3518370400049</ram:GlobalID>
          <ram:SellerAssignedID>NOUG250</ram:SellerAssignedID>
          <ram:Name>Nougat de l'Abbaye 250g</ram:Name>
        </ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeAgreement>
          <ram:GrossPriceProductTradePrice>
            <ram:ChargeAmount>4.55</ram:ChargeAmount>
            <ram:AppliedTradeAllowanceCharge>
              <ram:ChargeIndicator>
                <udt:Indicator>false</udt:Indicator>
              </ram:ChargeIndicator>
              <ram:ActualAmount>0.45</ram:ActualAmount>
            </ram:AppliedTradeAllowanceCharge>
          </ram:GrossPriceProductTradePrice>
          <ram:NetPriceProductTradePrice>
            <ram:ChargeAmount>4.10</ram:ChargeAmount>
          </ram:NetPriceProductTradePrice>
        </ram:SpecifiedLineTradeAgreement>
        <ram:SpecifiedLineTradeDelivery>
          <ram:BilledQuantity unitCode="C62">20.000</ram:BilledQuantity>
        </ram:SpecifiedLineTradeDelivery>
        <ram:SpecifiedLineTradeSettlement>
          <ram:ApplicableTradeTax>
            <ram:TypeCode>VAT</ram:TypeCode>
            <ram:CategoryCode>S</ram:CategoryCode>
            <ram:RateApplicablePercent>20.00</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>
          <ram:SpecifiedTradeSettlementLineMonetarySummation>
            <ram:LineTotalAmount>81.90</ram:LineTotalAmount>
          </ram:SpecifiedTradeSettlementLineMonetarySummation>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>2</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          <ram:GlobalID schemeID="0160">3518370200090</ram:GlobalID>
          <ram:SellerAssignedID>BRAIS300</ram:SellerAssignedID>
          <ram:Name>Biscuits aux raisins 300g</ram:Name>
        </ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeAgreement>
          <ram:GrossPriceProductTradePrice>
            <ram:ChargeAmount>3.20</ram:ChargeAmount>
          </ram:GrossPriceProductTradePrice>
          <ram:NetPriceProductTradePrice>
            <ram:ChargeAmount>3.20</ram:ChargeAmount>
          </ram:NetPriceProductTradePrice>
        </ram:SpecifiedLineTradeAgreement>
        <ram:SpecifiedLineTradeDelivery>
          <ram:BilledQuantity unitCode="C62">15.000</ram:BilledQuantity>
        </ram:SpecifiedLineTradeDelivery>
        <ram:SpecifiedLineTradeSettlement>
          <ram:ApplicableTradeTax>
            <ram:TypeCode>VAT</ram:TypeCode>
            <ram:CategoryCode>S</ram:CategoryCode>
            <ram:RateApplicablePercent>5.50</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>
          <ram:SpecifiedTradeSettlementLineMonetarySummation>
            <ram:LineTotalAmount>48.00</ram:LineTotalAmount>
          </ram:SpecifiedTradeSettlementLineMonetarySummation>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>3</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          <ram:SellerAssignedID>HOLANCL</ram:SellerAssignedID>
          <ram:Name>Huile d'olive à l'ancienne</ram:Name>
        </ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeAgreement>
          <ram:GrossPriceProductTradePrice>
            <ram:ChargeAmount>19.80</ram:ChargeAmount>
          </ram:GrossPriceProductTradePrice>
          <ram:NetPriceProductTradePrice>
            <ram:ChargeAmount>19.80</ram:ChargeAmount>
          </ram:NetPriceProductTradePrice>
        </ram:SpecifiedLineTradeAgreement>
        <ram:SpecifiedLineTradeDelivery>
          <ram:BilledQuantity unitCode="LTR">25.000</ram:BilledQuantity>
        </ram:SpecifiedLineTradeDelivery>
        <ram:SpecifiedLineTradeSettlement>
          <ram:ApplicableTradeTax>
            <ram:TypeCode>VAT</ram:TypeCode>
            <ram:CategoryCode>S</ram:CategoryCode>
            <ram:RateApplicablePercent>5.50</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>
          <ram:SpecifiedTradeSettlementLineMonetarySummation>
            <ram:LineTotalAmount>495.00</ram:LineTotalAmount>
          </ram:SpecifiedTradeSettlementLineMonetarySummation>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>
      <ram:ApplicableHeaderTradeAgreement>
        <ram:SellerTradeParty>
          <ram:Name>Au bon moulin</ram:Name>
          <ram:SpecifiedLegalOrganization>
            <ram:ID schemeID="0002">99999999800010</ram:ID>
          </ram:SpecifiedLegalOrganization>
          <ram:DefinedTradeContact>
            <ram:PersonName>Tony Dubois</ram:PersonName>
            <ram:TelephoneUniversalCommunication>
              <ram:CompleteNumber>+33 4 72 07 08 56</ram:CompleteNumber>
            </ram:TelephoneUniversalCommunication>
            <ram:EmailURIUniversalCommunication>
              <ram:URIID schemeID="SMTP">tony.dubois@aubonmoulin.fr</ram:URIID>
            </ram:EmailURIUniversalCommunication>
          </ram:DefinedTradeContact>
          <ram:PostalTradeAddress>
            <ram:PostcodeCode>84340</ram:PostcodeCode>
            <ram:LineOne>1242 chemin de l'olive</ram:LineOne>
            <ram:CityName>Malaucène</ram:CityName>
            <ram:CountryID>FR</ram:CountryID>
          </ram:PostalTradeAddress>
          <ram:SpecifiedTaxRegistration>
            <ram:ID schemeID="VA">FR11999999998</ram:ID>
          </ram:SpecifiedTaxRegistration>
        </ram:SellerTradeParty>
        <ram:BuyerTradeParty>
          <ram:Name>Ma jolie boutique</ram:Name>
          <ram:SpecifiedLegalOrganization>
            <ram:ID schemeID="0002">78787878400035</ram:ID>
          </ram:SpecifiedLegalOrganization>
          <ram:DefinedTradeContact>
            <ram:PersonName>Alexandre Payet</ram:PersonName>
            <ram:TelephoneUniversalCommunication>
              <ram:CompleteNumber>+33 4 72 07 08 67</ram:CompleteNumber>
            </ram:TelephoneUniversalCommunication>
            <ram:EmailURIUniversalCommunication>
              <ram:URIID schemeID="SMTP">alexandre.payet@majolieboutique.net</ram:URIID>
            </ram:EmailURIUniversalCommunication>
          </ram:DefinedTradeContact>
          <ram:PostalTradeAddress>
            <ram:PostcodeCode>69001</ram:PostcodeCode>
            <ram:LineOne>35 rue de la République</ram:LineOne>
            <ram:CityName>Lyon</ram:CityName>
            <ram:CountryID>FR</ram:CountryID>
          </ram:PostalTradeAddress>
          <ram:SpecifiedTaxRegistration>
            <ram:ID schemeID="VA">FR19787878784</ram:ID>
          </ram:SpecifiedTaxRegistration>
        </ram:BuyerTradeParty>
        <ram:BuyerOrderReferencedDocument>
          <ram:IssuerAssignedID>PO445</ram:IssuerAssignedID>
        </ram:BuyerOrderReferencedDocument>
        <ram:ContractReferencedDocument>
          <ram:IssuerAssignedID>MSPE2017</ram:IssuerAssignedID>
        </ram:ContractReferencedDocument>
      </ram:ApplicableHeaderTradeAgreement>
      <ram:ApplicableHeaderTradeDelivery>
        <ram:ShipToTradeParty>
          <ram:PostalTradeAddress>
            <ram:PostcodeCode>69001</ram:PostcodeCode>
            <ram:LineOne>35 rue de la République</ram:LineOne>
            <ram:CityName>Lyon</ram:CityName>
            <ram:CountryID>FR</ram:CountryID>
          </ram:PostalTradeAddress>
        </ram:ShipToTradeParty>
      </ram:ApplicableHeaderTradeDelivery>
      <ram:ApplicableHeaderTradeSettlement>
        <ram:PaymentReference>FA-2017-0010</ram:PaymentReference>
        <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
        <ram:SpecifiedTradeSettlementPaymentMeans>
          <ram:TypeCode>30</ram:TypeCode>
          <ram:Information>Virement sur compte Banque Fiducial</ram:Information>
          <ram:PayeePartyCreditorFinancialAccount>
            <ram:IBANID>FR2012421242124212421242124</ram:IBANID>
          </ram:PayeePartyCreditorFinancialAccount>
          <ram:PayeeSpecifiedCreditorFinancialInstitution>
            <ram:BICID>FIDCFR21XXX</ram:BICID>
          </ram:PayeeSpecifiedCreditorFinancialInstitution>
        </ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:ApplicableTradeTax>
          <ram:CalculatedAmount>16.38</ram:CalculatedAmount>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:BasisAmount>81.90</ram:BasisAmount>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:DueDateTypeCode>5</ram:DueDateTypeCode>
          <ram:RateApplicablePercent>20.00</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:ApplicableTradeTax>
          <ram:CalculatedAmount>29.87</ram:CalculatedAmount>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:BasisAmount>543.00</ram:BasisAmount>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:DueDateTypeCode>5</ram:DueDateTypeCode>
          <ram:RateApplicablePercent>5.50</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradePaymentTerms>
          <ram:Description>30% d'acompte, solde à 30 j</ram:Description>
          <ram:DueDateDateTime>
            <udt:DateTimeString format="102">20171213</udt:DateTimeString>
          </ram:DueDateDateTime>
        </ram:SpecifiedTradePaymentTerms>
        <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
          <ram:LineTotalAmount>624.90</ram:LineTotalAmount>
          <ram:TaxBasisTotalAmount>624.90</ram:TaxBasisTotalAmount>
          <ram:TaxTotalAmount currencyID="EUR">46.25</ram:TaxTotalAmount>
          <ram:GrandTotalAmount>671.15</ram:GrandTotalAmount>
          <ram:TotalPrepaidAmount>201.00</ram:TotalPrepaidAmount>
          <ram:DuePayableAmount>470.15</ram:DuePayableAmount>
        </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
      </ram:ApplicableHeaderTradeSettlement>
    </rsm:SupplyChainTradeTransaction>
  </rsm:CrossIndustryInvoice>`.trim()
}

export function getOrderXBasicXML() {
  return `
  <?xml version="1.0" encoding="UTF-8"?>
  <!--Sample file Order-x.xml - BASIC Profile, created by Cyrille Sautereau, Admarel-->
  <rsm:SCRDMCCBDACIOMessageStructure xmlns:rsm="urn:un:unece:uncefact:data:SCRDMCCBDACIOMessageStructure:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:128" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:128" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:128" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <rsm:ExchangedDocumentContext>
            <ram:TestIndicator>
                <udt:Indicator>false</udt:Indicator>
            </ram:TestIndicator>
            <ram:BusinessProcessSpecifiedDocumentContextParameter>
                <ram:ID>A1</ram:ID>
            </ram:BusinessProcessSpecifiedDocumentContextParameter>
            <ram:GuidelineSpecifiedDocumentContextParameter>
                <ram:ID>urn:order-x.eu:1p0:basic</ram:ID>
            </ram:GuidelineSpecifiedDocumentContextParameter>
      </rsm:ExchangedDocumentContext>
      <rsm:ExchangedDocument>
            <ram:ID>1861728</ram:ID>
            <ram:TypeCode>220</ram:TypeCode>
            <ram:IssueDateTime>
                <udt:DateTimeString format="102">20200109</udt:DateTimeString>
            </ram:IssueDateTime>
            <ram:CopyIndicator>
                <udt:Indicator>false</udt:Indicator>
            </ram:CopyIndicator>
            <ram:PurposeCode>9</ram:PurposeCode>
            <ram:RequestedResponseTypeCode>AC</ram:RequestedResponseTypeCode>
      </rsm:ExchangedDocument>
      <rsm:SupplyChainTradeTransaction>
            <ram:IncludedSupplyChainTradeLineItem>
                <ram:AssociatedDocumentLineDocument>
                      <ram:LineID>1</ram:LineID>
                      <ram:IncludedNote>
                          <ram:Content>certifiés  PEFC mini 90% PEFC/10-34-97 </ram:Content>
                          <ram:SubjectCode>PRD</ram:SubjectCode>
                      </ram:IncludedNote>
                </ram:AssociatedDocumentLineDocument>
                <ram:SpecifiedTradeProduct>
                      <ram:GlobalID schemeID="0160">3607765426686</ram:GlobalID>
                      <ram:SellerAssignedID>542668</ram:SellerAssignedID>
                      <ram:BuyerAssignedID>198765</ram:BuyerAssignedID>
                      <ram:Name>HPL 0.8 mm  3070x1320</ram:Name>
                </ram:SpecifiedTradeProduct>
                <ram:SpecifiedLineTradeAgreement>
                      <ram:NetPriceProductTradePrice>
                          <ram:ChargeAmount>18.74</ram:ChargeAmount>
                          <ram:BasisQuantity unitCode="MTK">1</ram:BasisQuantity>
                      </ram:NetPriceProductTradePrice>
                </ram:SpecifiedLineTradeAgreement>
                <ram:SpecifiedLineTradeDelivery>
                      <ram:PartialDeliveryAllowedIndicator>
                          <udt:Indicator>false</udt:Indicator>
                      </ram:PartialDeliveryAllowedIndicator>
                      <ram:RequestedQuantity unitCode="MTK">4.052</ram:RequestedQuantity>
                </ram:SpecifiedLineTradeDelivery>
                <ram:SpecifiedLineTradeSettlement>
                      <ram:SpecifiedTradeSettlementLineMonetarySummation>
                          <ram:LineTotalAmount>75.93</ram:LineTotalAmount>
                      </ram:SpecifiedTradeSettlementLineMonetarySummation>
                </ram:SpecifiedLineTradeSettlement>
            </ram:IncludedSupplyChainTradeLineItem>
            <ram:IncludedSupplyChainTradeLineItem>
                <ram:AssociatedDocumentLineDocument>
                      <ram:LineID>2</ram:LineID>
                </ram:AssociatedDocumentLineDocument>
                <ram:SpecifiedTradeProduct>
                      <ram:GlobalID schemeID="0160">4024125000178</ram:GlobalID>
                      <ram:SellerAssignedID>73796000</ram:SellerAssignedID>
                      <ram:BuyerAssignedID>186954</ram:BuyerAssignedID>
                      <ram:Name>wedi Kit d'étanchéité Fundo</ram:Name>
                </ram:SpecifiedTradeProduct>
                <ram:SpecifiedLineTradeAgreement>
                      <ram:NetPriceProductTradePrice>
                          <ram:ChargeAmount>89.03</ram:ChargeAmount>
                          <ram:BasisQuantity unitCode="C62">1</ram:BasisQuantity>
                      </ram:NetPriceProductTradePrice>
                </ram:SpecifiedLineTradeAgreement>
                <ram:SpecifiedLineTradeDelivery>
                      <ram:PartialDeliveryAllowedIndicator>
                          <udt:Indicator>true</udt:Indicator>
                      </ram:PartialDeliveryAllowedIndicator>
                      <ram:RequestedQuantity unitCode="C62">5</ram:RequestedQuantity>
                </ram:SpecifiedLineTradeDelivery>
                <ram:SpecifiedLineTradeSettlement>
                      <ram:SpecifiedTradeSettlementLineMonetarySummation>
                          <ram:LineTotalAmount>445.15</ram:LineTotalAmount>
                      </ram:SpecifiedTradeSettlementLineMonetarySummation>
                </ram:SpecifiedLineTradeSettlement>
            </ram:IncludedSupplyChainTradeLineItem>
            <ram:IncludedSupplyChainTradeLineItem>
                <ram:AssociatedDocumentLineDocument>
                      <ram:LineID>3</ram:LineID>
                </ram:AssociatedDocumentLineDocument>
                <ram:SpecifiedTradeProduct>
                      <ram:GlobalID schemeID="0160">3546335717048</ram:GlobalID>
                      <ram:SellerAssignedID>571704</ram:SellerAssignedID>
                      <ram:BuyerAssignedID>125965</ram:BuyerAssignedID>
                      <ram:Name>RSS SCD CHROME 0500W</ram:Name>
                </ram:SpecifiedTradeProduct>
                <ram:SpecifiedLineTradeAgreement>
                      <ram:NetPriceProductTradePrice>
                          <ram:ChargeAmount>208.02</ram:ChargeAmount>
                          <ram:BasisQuantity unitCode="C62">1</ram:BasisQuantity>
                      </ram:NetPriceProductTradePrice>
                </ram:SpecifiedLineTradeAgreement>
                <ram:SpecifiedLineTradeDelivery>
                      <ram:PartialDeliveryAllowedIndicator>
                          <udt:Indicator>true</udt:Indicator>
                      </ram:PartialDeliveryAllowedIndicator>
                      <ram:RequestedQuantity unitCode="C62">5</ram:RequestedQuantity>
                </ram:SpecifiedLineTradeDelivery>
                <ram:SpecifiedLineTradeSettlement>
                      <ram:SpecifiedTradeSettlementLineMonetarySummation>
                          <ram:LineTotalAmount>1040.1</ram:LineTotalAmount>
                      </ram:SpecifiedTradeSettlementLineMonetarySummation>
                </ram:SpecifiedLineTradeSettlement>
            </ram:IncludedSupplyChainTradeLineItem>
            <ram:ApplicableHeaderTradeAgreement>
                <ram:SellerTradeParty>
                      <ram:GlobalID schemeID="0088">3020816001302</ram:GlobalID>
                      <ram:Name>DMBP NANTES DISPANO ROUX - 1535</ram:Name>
                      <ram:SpecifiedLegalOrganization>
                          <ram:ID schemeID="0002">50810215900334</ram:ID>
                      </ram:SpecifiedLegalOrganization>
                      <ram:PostalTradeAddress>
                          <ram:PostcodeCode>44100</ram:PostcodeCode>
                          <ram:LineOne>12 RUE DE LA FONTAINE SALEE</ram:LineOne>
                          <ram:CityName>NANTES</ram:CityName>
                          <ram:CountryID>FR</ram:CountryID>
                      </ram:PostalTradeAddress>
                      <ram:SpecifiedTaxRegistration>
                          <ram:ID schemeID="VA">FR86508102159</ram:ID>
                      </ram:SpecifiedTaxRegistration>
                </ram:SellerTradeParty>
                <ram:BuyerTradeParty>
                      <ram:GlobalID schemeID="0088">3306949923804</ram:GlobalID>
                      <ram:Name>AMBERIEU EN BUGEY CEDEO</ram:Name>
                      <ram:SpecifiedLegalOrganization>
                          <ram:ID schemeID="0002">57214188502180</ram:ID>
                      </ram:SpecifiedLegalOrganization>
                      <ram:DefinedTradeContact>
                          <ram:PersonName>ALAIN DUPOND</ram:PersonName>
                          <ram:TelephoneUniversalCommunication>
                                <ram:CompleteNumber>06 78 56 23 00</ram:CompleteNumber>
                          </ram:TelephoneUniversalCommunication>
                          <ram:EmailURIUniversalCommunication>
                                <ram:URIID>alain.dupond@saint-gobain.com</ram:URIID>
                          </ram:EmailURIUniversalCommunication>
                      </ram:DefinedTradeContact>
                      <ram:PostalTradeAddress>
                          <ram:PostcodeCode>01500</ram:PostcodeCode>
                          <ram:LineOne>Avenue Leon Blum</ram:LineOne>
                          <ram:CityName>Amberieu en bugey</ram:CityName>
                          <ram:CountryID>FR</ram:CountryID>
                      </ram:PostalTradeAddress>
                      <ram:URIUniversalCommunication>
                          <ram:URIID schemeID="EM">alain.dupond@saint-gobain.com</ram:URIID>
                      </ram:URIUniversalCommunication>
                      <ram:SpecifiedTaxRegistration>
                          <ram:ID schemeID="VA">FR94572141885</ram:ID>
                      </ram:SpecifiedTaxRegistration>
                </ram:BuyerTradeParty>
                <ram:ApplicableTradeDeliveryTerms>
                      <ram:FunctionCode>4</ram:FunctionCode>
                </ram:ApplicableTradeDeliveryTerms>
            </ram:ApplicableHeaderTradeAgreement>
            <ram:ApplicableHeaderTradeDelivery>
                <ram:ShipFromTradeParty>
                      <ram:GlobalID schemeID="0088">3020816001302</ram:GlobalID>
                      <ram:Name>DMBP NANTES DISPANO ROUX - 1535</ram:Name>
                      <ram:PostalTradeAddress>
                          <ram:PostcodeCode>44100</ram:PostcodeCode>
                          <ram:LineOne>12 RUE DE LA FONTAINE SALEE</ram:LineOne>
                          <ram:CityName>NANTES</ram:CityName>
                          <ram:CountryID>FR</ram:CountryID>
                      </ram:PostalTradeAddress>
                </ram:ShipFromTradeParty>
                <ram:RequestedDespatchSupplyChainEvent>
                      <ram:OccurrenceDateTime>
                          <udt:DateTimeString format="203">202001150900</udt:DateTimeString>
                      </ram:OccurrenceDateTime>
                </ram:RequestedDespatchSupplyChainEvent>
            </ram:ApplicableHeaderTradeDelivery>
            <ram:ApplicableHeaderTradeSettlement>
                <ram:OrderCurrencyCode>EUR</ram:OrderCurrencyCode>
                <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
                      <ram:LineTotalAmount>1561.18</ram:LineTotalAmount>
                      <ram:TaxBasisTotalAmount>1561.18</ram:TaxBasisTotalAmount>
                </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
            </ram:ApplicableHeaderTradeSettlement>
      </rsm:SupplyChainTradeTransaction>
  </rsm:SCRDMCCBDACIOMessageStructure>`.trim()
}
