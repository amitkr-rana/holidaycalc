/**
 * Country code to currency code mapping
 * Based on ISO 4217 currency codes
 */

export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  AF: "AFN", // Afghanistan - Afghan Afghani
  AL: "ALL", // Albania - Albanian Lek
  DZ: "DZD", // Algeria - Algerian Dinar
  AS: "USD", // American Samoa - US Dollar
  AD: "EUR", // Andorra - Euro
  AO: "AOA", // Angola - Angolan Kwanza
  AI: "XCD", // Anguilla - East Caribbean Dollar
  AG: "XCD", // Antigua and Barbuda - East Caribbean Dollar
  AR: "ARS", // Argentina - Argentine Peso
  AM: "AMD", // Armenia - Armenian Dram
  AW: "AWG", // Aruba - Aruban Florin
  AU: "AUD", // Australia - Australian Dollar
  AT: "EUR", // Austria - Euro
  AZ: "AZN", // Azerbaijan - Azerbaijani Manat
  BH: "BHD", // Bahrain - Bahraini Dinar
  BD: "BDT", // Bangladesh - Bangladeshi Taka
  BB: "BBD", // Barbados - Barbadian Dollar
  BY: "BYN", // Belarus - Belarusian Ruble
  BE: "EUR", // Belgium - Euro
  BZ: "BZD", // Belize - Belize Dollar
  BJ: "XOF", // Benin - CFA Franc BCEAO
  BM: "BMD", // Bermuda - Bermudian Dollar
  BT: "BTN", // Bhutan - Bhutanese Ngultrum
  BO: "BOB", // Bolivia - Bolivian Boliviano
  BA: "BAM", // Bosnia and Herzegovina - Convertible Mark
  BW: "BWP", // Botswana - Botswana Pula
  BR: "BRL", // Brazil - Brazilian Real
  VG: "USD", // British Virgin Islands - US Dollar
  BN: "BND", // Brunei - Brunei Dollar
  BG: "BGN", // Bulgaria - Bulgarian Lev
  BF: "XOF", // Burkina Faso - CFA Franc BCEAO
  BI: "BIF", // Burundi - Burundian Franc
  CV: "CVE", // Cabo Verde - Cape Verdean Escudo
  KH: "KHR", // Cambodia - Cambodian Riel
  CM: "XAF", // Cameroon - CFA Franc BEAC
  CA: "CAD", // Canada - Canadian Dollar
  KY: "KYD", // Cayman Islands - Cayman Islands Dollar
  CF: "XAF", // Central African Republic - CFA Franc BEAC
  TD: "XAF", // Chad - CFA Franc BEAC
  CL: "CLP", // Chile - Chilean Peso
  CN: "CNY", // China - Chinese Yuan
  CO: "COP", // Colombia - Colombian Peso
  KM: "KMF", // Comoros - Comorian Franc
  CG: "XAF", // Congo - CFA Franc BEAC
  CD: "CDF", // Congo Democratic Republic - Congolese Franc
  CK: "NZD", // Cook Islands - New Zealand Dollar
  CR: "CRC", // Costa Rica - Costa Rican Colón
  CI: "XOF", // Cote d'Ivoire - CFA Franc BCEAO
  HR: "EUR", // Croatia - Euro
  CU: "CUP", // Cuba - Cuban Peso
  CW: "ANG", // Curaçao - Netherlands Antillean Guilder
  CY: "EUR", // Cyprus - Euro
  CZ: "CZK", // Czechia - Czech Koruna
  DK: "DKK", // Denmark - Danish Krone
  DJ: "DJF", // Djibouti - Djiboutian Franc
  DM: "XCD", // Dominica - East Caribbean Dollar
  DO: "DOP", // Dominican Republic - Dominican Peso
  TL: "USD", // East Timor - US Dollar
  EC: "USD", // Ecuador - US Dollar
  EG: "EGP", // Egypt - Egyptian Pound
  SV: "USD", // El Salvador - US Dollar
  GQ: "XAF", // Equatorial Guinea - CFA Franc BEAC
  ER: "ERN", // Eritrea - Eritrean Nakfa
  EE: "EUR", // Estonia - Euro
  ET: "ETB", // Ethiopia - Ethiopian Birr
  FK: "FKP", // Falkland Islands - Falkland Islands Pound
  FO: "DKK", // Faroe Islands - Danish Krone
  FJ: "FJD", // Fiji - Fijian Dollar
  FI: "EUR", // Finland - Euro
  FR: "EUR", // France - Euro
  PF: "XPF", // French Polynesia - CFP Franc
  GA: "XAF", // Gabon - CFA Franc BEAC
  GM: "GMD", // Gambia - Gambian Dalasi
  GE: "GEL", // Georgia - Georgian Lari
  DE: "EUR", // Germany - Euro
  GH: "GHS", // Ghana - Ghanaian Cedi
  GI: "GIP", // Gibraltar - Gibraltar Pound
  GR: "EUR", // Greece - Euro
  GL: "DKK", // Greenland - Danish Krone
  GD: "XCD", // Grenada - East Caribbean Dollar
  GU: "USD", // Guam - US Dollar
  GT: "GTQ", // Guatemala - Guatemalan Quetzal
  GG: "GBP", // Guernsey - British Pound
  GN: "GNF", // Guinea - Guinean Franc
  GW: "XOF", // Guinea-Bissau - CFA Franc BCEAO
  GY: "GYD", // Guyana - Guyanese Dollar
  HT: "HTG", // Haiti - Haitian Gourde
  HN: "HNL", // Honduras - Honduran Lempira
  HK: "HKD", // Hong Kong - Hong Kong Dollar
  HU: "HUF", // Hungary - Hungarian Forint
  IS: "ISK", // Iceland - Icelandic Króna
  IN: "INR", // India - Indian Rupee
  ID: "IDR", // Indonesia - Indonesian Rupiah
  IR: "IRR", // Iran - Iranian Rial
  IQ: "IQD", // Iraq - Iraqi Dinar
  IE: "EUR", // Ireland - Euro
  IM: "GBP", // Isle of Man - British Pound
  IL: "ILS", // Israel - Israeli New Shekel
  IT: "EUR", // Italy - Euro
  JM: "JMD", // Jamaica - Jamaican Dollar
  JP: "JPY", // Japan - Japanese Yen
  JE: "GBP", // Jersey - British Pound
  JO: "JOD", // Jordan - Jordanian Dinar
  KZ: "KZT", // Kazakhstan - Kazakhstani Tenge
  KE: "KES", // Kenya - Kenyan Shilling
  KI: "AUD", // Kiribati - Australian Dollar
  XK: "EUR", // Kosovo - Euro
  KW: "KWD", // Kuwait - Kuwaiti Dinar
  KG: "KGS", // Kyrgyzstan - Kyrgyzstani Som
  LA: "LAK", // Laos - Lao Kip
  LV: "EUR", // Latvia - Euro
  LB: "LBP", // Lebanon - Lebanese Pound
  LS: "LSL", // Lesotho - Lesotho Loti
  LR: "LRD", // Liberia - Liberian Dollar
  LY: "LYD", // Libya - Libyan Dinar
  LI: "CHF", // Liechtenstein - Swiss Franc
  LT: "EUR", // Lithuania - Euro
  LU: "EUR", // Luxembourg - Euro
  MO: "MOP", // Macau - Macanese Pataca
  MG: "MGA", // Madagascar - Malagasy Ariary
  MW: "MWK", // Malawi - Malawian Kwacha
  MY: "MYR", // Malaysia - Malaysian Ringgit
  MV: "MVR", // Maldives - Maldivian Rufiyaa
  ML: "XOF", // Mali - CFA Franc BCEAO
  MT: "EUR", // Malta - Euro
  MH: "USD", // Marshall Islands - US Dollar
  MQ: "EUR", // Martinique - Euro
  MR: "MRU", // Mauritania - Mauritanian Ouguiya
  MU: "MUR", // Mauritius - Mauritian Rupee
  YT: "EUR", // Mayotte - Euro
  MX: "MXN", // Mexico - Mexican Peso
  FM: "USD", // Micronesia - US Dollar
  MD: "MDL", // Moldova - Moldovan Leu
  MC: "EUR", // Monaco - Euro
  MN: "MNT", // Mongolia - Mongolian Tögrög
  ME: "EUR", // Montenegro - Euro
  MS: "XCD", // Montserrat - East Caribbean Dollar
  MA: "MAD", // Morocco - Moroccan Dirham
  MZ: "MZN", // Mozambique - Mozambican Metical
  MM: "MMK", // Myanmar - Myanmar Kyat
  NA: "NAD", // Namibia - Namibian Dollar
  NR: "AUD", // Nauru - Australian Dollar
  NP: "NPR", // Nepal - Nepalese Rupee
  NL: "EUR", // Netherlands - Euro
  NC: "XPF", // New Caledonia - CFP Franc
  NZ: "NZD", // New Zealand - New Zealand Dollar
  NI: "NIO", // Nicaragua - Nicaraguan Córdoba
  NE: "XOF", // Niger - CFA Franc BCEAO
  NG: "NGN", // Nigeria - Nigerian Naira
  KP: "KPW", // North Korea - North Korean Won
  MK: "MKD", // North Macedonia - Macedonian Denar
  MP: "USD", // Northern Mariana Islands - US Dollar
  NO: "NOK", // Norway - Norwegian Krone
  OM: "OMR", // Oman - Omani Rial
  PK: "PKR", // Pakistan - Pakistani Rupee
  PW: "USD", // Palau - US Dollar
  PA: "PAB", // Panama - Panamanian Balboa
  PG: "PGK", // Papua New Guinea - Papua New Guinean Kina
  PY: "PYG", // Paraguay - Paraguayan Guaraní
  PE: "PEN", // Peru - Peruvian Sol
  PH: "PHP", // Philippines - Philippine Peso
  PL: "PLN", // Poland - Polish Złoty
  PT: "EUR", // Portugal - Euro
  PR: "USD", // Puerto Rico - US Dollar
  QA: "QAR", // Qatar - Qatari Riyal
  RE: "EUR", // Reunion - Euro
  RO: "RON", // Romania - Romanian Leu
  RU: "RUB", // Russia - Russian Ruble
  RW: "RWF", // Rwanda - Rwandan Franc
  SH: "SHP", // Saint Helena - Saint Helena Pound
  KN: "XCD", // Saint Kitts and Nevis - East Caribbean Dollar
  LC: "XCD", // Saint Lucia - East Caribbean Dollar
  MF: "EUR", // Saint Martin - Euro
  PM: "EUR", // Saint Pierre and Miquelon - Euro
  VC: "XCD", // Saint Vincent and the Grenadines - East Caribbean Dollar
  WS: "WST", // Samoa - Samoan Tālā
  SM: "EUR", // San Marino - Euro
  ST: "STN", // Sao Tome and Principe - São Tomé and Príncipe Dobra
  SA: "SAR", // Saudi Arabia - Saudi Riyal
  SN: "XOF", // Senegal - CFA Franc BCEAO
  RS: "RSD", // Serbia - Serbian Dinar
  SC: "SCR", // Seychelles - Seychellois Rupee
  SL: "SLL", // Sierra Leone - Sierra Leonean Leone
  SG: "SGD", // Singapore - Singapore Dollar
  SX: "ANG", // Sint Maarten - Netherlands Antillean Guilder
  SK: "EUR", // Slovakia - Euro
  SI: "EUR", // Slovenia - Euro
  SB: "SBD", // Solomon Islands - Solomon Islands Dollar
  SO: "SOS", // Somalia - Somali Shilling
  ZA: "ZAR", // South Africa - South African Rand
  KR: "KRW", // South Korea - South Korean Won
  SS: "SSP", // South Sudan - South Sudanese Pound
  ES: "EUR", // Spain - Euro
  LK: "LKR", // Sri Lanka - Sri Lankan Rupee
  SD: "SDG", // Sudan - Sudanese Pound
  SR: "SRD", // Suriname - Surinamese Dollar
  SE: "SEK", // Sweden - Swedish Krona
  CH: "CHF", // Switzerland - Swiss Franc
  SY: "SYP", // Syria - Syrian Pound
  TW: "TWD", // Taiwan - New Taiwan Dollar
  TJ: "TJS", // Tajikistan - Tajikistani Somoni
  TZ: "TZS", // Tanzania - Tanzanian Shilling
  TH: "THB", // Thailand - Thai Baht
  TG: "XOF", // Togo - CFA Franc BCEAO
  TO: "TOP", // Tonga - Tongan Paʻanga
  TT: "TTD", // Trinidad and Tobago - Trinidad and Tobago Dollar
  TN: "TND", // Tunisia - Tunisian Dinar
  TR: "TRY", // Turkey - Turkish Lira
  TM: "TMT", // Turkmenistan - Turkmenistani Manat
  TC: "USD", // Turks and Caicos Islands - US Dollar
  TV: "AUD", // Tuvalu - Australian Dollar
  UG: "UGX", // Uganda - Ugandan Shilling
  UA: "UAH", // Ukraine - Ukrainian Hryvnia
  AE: "AED", // United Arab Emirates - UAE Dirham
  GB: "GBP", // United Kingdom - British Pound
  US: "USD", // United States - US Dollar
  UY: "UYU", // Uruguay - Uruguayan Peso
  UZ: "UZS", // Uzbekistan - Uzbekistani Som
  VU: "VUV", // Vanuatu - Vanuatu Vatu
  VA: "EUR", // Vatican City - Euro
  VE: "VES", // Venezuela - Venezuelan Bolívar
  VN: "VND", // Vietnam - Vietnamese Đồng
  YE: "YER", // Yemen - Yemeni Rial
  ZM: "ZMW", // Zambia - Zambian Kwacha
  ZW: "ZWL", // Zimbabwe - Zimbabwean Dollar
};

/**
 * Currency code to symbol mapping
 * Based on ISO 4217 currency codes
 */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  AFN: "؋", // Afghan Afghani
  ALL: "L", // Albanian Lek
  DZD: "د.ج", // Algerian Dinar
  USD: "$", // US Dollar
  EUR: "€", // Euro
  AOA: "Kz", // Angolan Kwanza
  XCD: "$", // East Caribbean Dollar
  ARS: "$", // Argentine Peso
  AMD: "֏", // Armenian Dram
  AWG: "ƒ", // Aruban Florin
  AUD: "A$", // Australian Dollar
  AZN: "₼", // Azerbaijani Manat
  BHD: ".د.ب", // Bahraini Dinar
  BDT: "৳", // Bangladeshi Taka
  BBD: "$", // Barbadian Dollar
  BYN: "Br", // Belarusian Ruble
  BZD: "BZ$", // Belize Dollar
  XOF: "Fr", // CFA Franc BCEAO
  BMD: "$", // Bermudian Dollar
  BTN: "Nu.", // Bhutanese Ngultrum
  BOB: "Bs.", // Bolivian Boliviano
  BAM: "KM", // Convertible Mark
  BWP: "P", // Botswana Pula
  BRL: "R$", // Brazilian Real
  BND: "$", // Brunei Dollar
  BGN: "лв", // Bulgarian Lev
  BIF: "Fr", // Burundian Franc
  CVE: "$", // Cape Verdean Escudo
  KHR: "៛", // Cambodian Riel
  XAF: "Fr", // CFA Franc BEAC
  CAD: "C$", // Canadian Dollar
  KYD: "$", // Cayman Islands Dollar
  CLP: "$", // Chilean Peso
  CNY: "¥", // Chinese Yuan
  COP: "$", // Colombian Peso
  KMF: "Fr", // Comorian Franc
  CDF: "Fr", // Congolese Franc
  NZD: "NZ$", // New Zealand Dollar
  CRC: "₡", // Costa Rican Colón
  CUP: "$", // Cuban Peso
  ANG: "ƒ", // Netherlands Antillean Guilder
  CZK: "Kč", // Czech Koruna
  DKK: "kr", // Danish Krone
  DJF: "Fr", // Djiboutian Franc
  DOP: "$", // Dominican Peso
  EGP: "£", // Egyptian Pound
  ERN: "Nfk", // Eritrean Nakfa
  ETB: "Br", // Ethiopian Birr
  FKP: "£", // Falkland Islands Pound
  FJD: "$", // Fijian Dollar
  XPF: "Fr", // CFP Franc
  GMD: "D", // Gambian Dalasi
  GEL: "₾", // Georgian Lari
  GHS: "₵", // Ghanaian Cedi
  GIP: "£", // Gibraltar Pound
  GTQ: "Q", // Guatemalan Quetzal
  GBP: "£", // British Pound
  GNF: "Fr", // Guinean Franc
  GYD: "$", // Guyanese Dollar
  HTG: "G", // Haitian Gourde
  HNL: "L", // Honduran Lempira
  HKD: "HK$", // Hong Kong Dollar
  HUF: "Ft", // Hungarian Forint
  ISK: "kr", // Icelandic Króna
  INR: "₹", // Indian Rupee
  IDR: "Rp", // Indonesian Rupiah
  IRR: "﷼", // Iranian Rial
  IQD: "ع.د", // Iraqi Dinar
  ILS: "₪", // Israeli New Shekel
  JMD: "J$", // Jamaican Dollar
  JPY: "¥", // Japanese Yen
  JOD: "د.ا", // Jordanian Dinar
  KZT: "₸", // Kazakhstani Tenge
  KES: "Sh", // Kenyan Shilling
  KWD: "د.ك", // Kuwaiti Dinar
  KGS: "с", // Kyrgyzstani Som
  LAK: "₭", // Lao Kip
  LBP: "ل.ل", // Lebanese Pound
  LSL: "L", // Lesotho Loti
  LRD: "$", // Liberian Dollar
  LYD: "ل.د", // Libyan Dinar
  CHF: "Fr", // Swiss Franc
  MOP: "P", // Macanese Pataca
  MGA: "Ar", // Malagasy Ariary
  MWK: "MK", // Malawian Kwacha
  MYR: "RM", // Malaysian Ringgit
  MVR: "ރ.", // Maldivian Rufiyaa
  MRU: "UM", // Mauritanian Ouguiya
  MUR: "₨", // Mauritian Rupee
  MXN: "$", // Mexican Peso
  MDL: "L", // Moldovan Leu
  MNT: "₮", // Mongolian Tögrög
  MAD: "د.م.", // Moroccan Dirham
  MZN: "MT", // Mozambican Metical
  MMK: "K", // Myanmar Kyat
  NAD: "$", // Namibian Dollar
  NPR: "₨", // Nepalese Rupee
  NIO: "C$", // Nicaraguan Córdoba
  NGN: "₦", // Nigerian Naira
  KPW: "₩", // North Korean Won
  MKD: "ден", // Macedonian Denar
  NOK: "kr", // Norwegian Krone
  OMR: "ر.ع.", // Omani Rial
  PKR: "₨", // Pakistani Rupee
  PAB: "B/.", // Panamanian Balboa
  PGK: "K", // Papua New Guinean Kina
  PYG: "₲", // Paraguayan Guaraní
  PEN: "S/", // Peruvian Sol
  PHP: "₱", // Philippine Peso
  PLN: "zł", // Polish Złoty
  QAR: "ر.ق", // Qatari Riyal
  RON: "lei", // Romanian Leu
  RUB: "₽", // Russian Ruble
  RWF: "Fr", // Rwandan Franc
  SHP: "£", // Saint Helena Pound
  WST: "T", // Samoan Tālā
  STN: "Db", // São Tomé and Príncipe Dobra
  SAR: "ر.س", // Saudi Riyal
  RSD: "дин", // Serbian Dinar
  SCR: "₨", // Seychellois Rupee
  SLL: "Le", // Sierra Leonean Leone
  SGD: "S$", // Singapore Dollar
  SBD: "$", // Solomon Islands Dollar
  SOS: "Sh", // Somali Shilling
  ZAR: "R", // South African Rand
  KRW: "₩", // South Korean Won
  SSP: "£", // South Sudanese Pound
  LKR: "Rs", // Sri Lankan Rupee
  SDG: "ج.س.", // Sudanese Pound
  SRD: "$", // Surinamese Dollar
  SEK: "kr", // Swedish Krona
  SYP: "£", // Syrian Pound
  TWD: "NT$", // New Taiwan Dollar
  TJS: "ЅМ", // Tajikistani Somoni
  TZS: "Sh", // Tanzanian Shilling
  THB: "฿", // Thai Baht
  TOP: "T$", // Tongan Paʻanga
  TTD: "$", // Trinidad and Tobago Dollar
  TND: "د.ت", // Tunisian Dinar
  TRY: "₺", // Turkish Lira
  TMT: "m", // Turkmenistani Manat
  UGX: "Sh", // Ugandan Shilling
  UAH: "₴", // Ukrainian Hryvnia
  AED: "د.إ", // UAE Dirham
  UYU: "$", // Uruguayan Peso
  UZS: "so'm", // Uzbekistani Som
  VUV: "Vt", // Vanuatu Vatu
  VES: "Bs.", // Venezuelan Bolívar
  VND: "₫", // Vietnamese Đồng
  YER: "﷼", // Yemeni Rial
  ZMW: "ZK", // Zambian Kwacha
  ZWL: "$", // Zimbabwean Dollar
};

/**
 * Get currency code for a given country code
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns ISO 4217 currency code or USD as fallback
 */
export function getCurrencyForCountry(countryCode: string): string {
  return COUNTRY_TO_CURRENCY[countryCode.toUpperCase()] || "USD";
}

/**
 * Get currency symbol for a given currency code
 * @param currencyCode - ISO 4217 currency code
 * @returns Currency symbol or the currency code as fallback
 */
export function getCurrencySymbol(currencyCode: string): string {
  return CURRENCY_SYMBOLS[currencyCode.toUpperCase()] || currencyCode;
}
