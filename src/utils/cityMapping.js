/**
 * UAE City/Emirate Mapping
 * Mirrors the mapping from WooCommerce's order-actions.php
 */

/**
 * Map of Shopify province codes to Delifast city IDs
 * Shopify uses ISO 3166-2:AE codes for UAE emirates
 */
export const emirateCodeMap = {
  'AE-AZ': 5,   // Abu Dhabi
  'AE-AJ': 6,   // Ajman
  'AE-AL': 7,   // Al Ain
  'AE-DU': 8,   // Dubai
  'AE-FU': 9,   // Fujairah
  'AE-RK': 10,  // Ras Al Khaimah
  'AE-SH': 11,  // Sharjah
  'AE-UQ': 12,  // Umm Al Quwain
  'AE-WR': 14,  // Western Region
};

/**
 * Map of emirate names (English and Arabic) to Delifast city IDs
 */
export const emirateNameMap = {
  // Abu Dhabi
  'Abu Dhabi': 5,
  'أبوظبي': 5,
  'ابوظبي': 5,
  'Abudhabi': 5,
  
  // Ajman
  'Ajman': 6,
  'عجمان': 6,
  
  // Al Ain
  'Al Ain': 7,
  'العين': 7,
  'Alain': 7,
  
  // Dubai
  'Dubai': 8,
  'دبي': 8,
  
  // Fujairah
  'Fujairah': 9,
  'الفجيرة': 9,
  'Fujaira': 9,
  
  // Ras Al Khaimah
  'Ras Al Khaimah': 10,
  'رأس الخيمة': 10,
  'راس الخيمة': 10,
  'RAK': 10,
  'Ras al Khaimah': 10,
  
  // Sharjah
  'Sharjah': 11,
  'الشارقة': 11,
  
  // Umm Al Quwain
  'Umm Al Quwain': 12,
  'أم القيوين': 12,
  'ام القيوين': 12,
  'UAQ': 12,
  'Umm al Quwain': 12,
  
  // Western Region
  'Western Region': 14,
  'المنطقة الغربية': 14,
};

/**
 * Default city ID (used when mapping fails)
 */
export const DEFAULT_CITY_ID = 13; // "Unknown" or default

/**
 * Map a province/state value to Delifast city ID
 * @param {string} province - The province code or name from Shopify
 * @param {number} defaultCityId - Default city ID from settings
 * @returns {number} Delifast city ID
 */
export function mapProvinceToCity(province, defaultCityId = DEFAULT_CITY_ID) {
  if (!province) {
    return defaultCityId;
  }

  // 1. Try exact match with emirate codes
  if (emirateCodeMap[province]) {
    return emirateCodeMap[province];
  }

  // 2. Try exact match with emirate names
  if (emirateNameMap[province]) {
    return emirateNameMap[province];
  }

  // 3. Try case-insensitive match
  const provinceLower = province.toLowerCase().trim();
  for (const [name, cityId] of Object.entries(emirateNameMap)) {
    if (name.toLowerCase() === provinceLower) {
      return cityId;
    }
  }

  // 4. Try partial match (contains)
  for (const [name, cityId] of Object.entries(emirateNameMap)) {
    if (provinceLower.includes(name.toLowerCase()) || 
        name.toLowerCase().includes(provinceLower)) {
      return cityId;
    }
  }

  // 5. If province is a number, check if it's a valid city ID
  const provinceNum = parseInt(province);
  if (!isNaN(provinceNum) && provinceNum >= 5 && provinceNum <= 14) {
    return provinceNum;
  }

  // 6. Return default
  return defaultCityId;
}

/**
 * Get all available cities for dropdown
 */
export function getAvailableCities() {
  return [
    { id: 5, name: 'Abu Dhabi', nameAr: 'أبوظبي' },
    { id: 6, name: 'Ajman', nameAr: 'عجمان' },
    { id: 7, name: 'Al Ain', nameAr: 'العين' },
    { id: 8, name: 'Dubai', nameAr: 'دبي' },
    { id: 9, name: 'Fujairah', nameAr: 'الفجيرة' },
    { id: 10, name: 'Ras Al Khaimah', nameAr: 'رأس الخيمة' },
    { id: 11, name: 'Sharjah', nameAr: 'الشارقة' },
    { id: 12, name: 'Umm Al Quwain', nameAr: 'أم القيوين' },
    { id: 13, name: 'Unknown', nameAr: 'غير معروف' },
    { id: 14, name: 'Western Region', nameAr: 'المنطقة الغربية' },
  ];
}
