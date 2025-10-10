/**
 * Holiday types supported by the Calendarific API
 */

export type HolidayType = "national" | "local" | "religious" | "observance"

export type HolidayTypeOption = {
  value: HolidayType
  label: string
  description: string
}

/**
 * Available holiday types with user-friendly labels and descriptions
 */
export const HOLIDAY_TYPES: HolidayTypeOption[] = [
  {
    value: "national",
    label: "National",
    description: "Public, federal, and bank holidays",
  },
  {
    value: "local",
    label: "Local",
    description: "Regional and state holidays",
  },
  {
    value: "religious",
    label: "Religious",
    description: "Religious observances and celebrations",
  },
  {
    value: "observance",
    label: "Observance",
    description: "Cultural observances and seasons",
  },
]

/**
 * Get holiday type label from value
 * @param type - Holiday type value
 * @returns User-friendly label
 */
export const getHolidayTypeLabel = (type: HolidayType): string => {
  const option = HOLIDAY_TYPES.find((t) => t.value === type)
  return option?.label || type
}

/**
 * Get holiday type description from value
 * @param type - Holiday type value
 * @returns Description text
 */
export const getHolidayTypeDescription = (type: HolidayType): string => {
  const option = HOLIDAY_TYPES.find((t) => t.value === type)
  return option?.description || ""
}

/**
 * Format holiday types array as comma-separated string for API
 * @param types - Array of holiday types
 * @returns Comma-separated string or all types if empty
 */
export const formatHolidayTypesForApi = (types: HolidayType[]): string => {
  if (types.length === 0 || types.length === HOLIDAY_TYPES.length) {
    // Empty or all types selected = return all types
    return HOLIDAY_TYPES.map((t) => t.value).join(",")
  }
  return types.join(",")
}

/**
 * Get display text for selected types
 * @param types - Array of selected holiday types
 * @returns Display text (e.g., "All Types", "National, Local", "3 types")
 */
export const getSelectedTypesDisplay = (types: HolidayType[]): string => {
  if (types.length === 0 || types.length === HOLIDAY_TYPES.length) {
    return "All Types"
  }
  if (types.length === 1) {
    return getHolidayTypeLabel(types[0])
  }
  if (types.length <= 2) {
    return types.map(getHolidayTypeLabel).join(", ")
  }
  return `${types.length} types`
}
