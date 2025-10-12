import type { HolidayType } from "@/lib/holiday-types"
import { formatHolidayTypesForApi } from "@/lib/holiday-types"

export const HOLIDAY_CACHE_PREFIX = "holiday-cache"
export const HOLIDAY_CACHE_VERSION = 4 // Incremented for new cache structure
export const CALENDARIFIC_API_KEY = (import.meta.env.VITE_CALENDARIFIC_API_KEY ?? "").trim()
export const CALENDARIFIC_ENDPOINT = "https://calendarific.com/api/v2/holidays"

export type HolidayLabelMap = Record<string, string[]>

export type HolidayDetail = {
  name: string
  description: string | null
  dateKey: string
  isoDate?: string | null
  type?: string | null
}

export type HolidayDetailMap = Record<string, HolidayDetail[]>

export type HolidayCacheData = {
  labels: HolidayLabelMap
  details: HolidayDetailMap
}

export type CalendarificDateResponse = {
  iso?: string
  datetime?: {
    year?: number
    month?: number
    day?: number
  }
}

export type CalendarificHoliday = {
  name?: string
  description?: string
  date?: CalendarificDateResponse
  type?: string[]
}

export type CalendarificResponse = {
  response?: {
    holidays?: CalendarificHoliday[]
  }
}

export const normalizeDate = (value: Date) => {
  const normalized = new Date(value)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

export const dateKey = (date?: Date | null) => {
  if (!date) return ""
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

export const buildDateKeyFromParts = (
  year: string | number,
  month: string | number,
  day: string | number
) => {
  const parsedYear = Number(year)
  const parsedMonth = Number(month)
  const parsedDay = Number(day)
  if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth) || !Number.isFinite(parsedDay)) {
    return null
  }

  return [
    parsedYear,
    String(parsedMonth).padStart(2, "0"),
    String(parsedDay).padStart(2, "0"),
  ].join("-")
}

export const parseDateKeyToDate = (key: string): Date | null => {
  const [yearStr, monthStr, dayStr] = key.split("-")
  const parsedYear = Number(yearStr)
  const parsedMonth = Number(monthStr)
  const parsedDay = Number(dayStr)
  if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth) || !Number.isFinite(parsedDay)) {
    return null
  }

  const candidate = new Date(parsedYear, parsedMonth - 1, parsedDay)
  if (Number.isNaN(candidate.getTime())) {
    return null
  }

  return normalizeDate(candidate)
}

const buildHolidayCacheKey = (
  country: string,
  year: number,
  location?: string | null,
  types?: HolidayType[]
) => {
  const locationKey = location || "all"
  const typesKey = types && types.length > 0 ? [...types].sort().join(",") : "all"
  return `${HOLIDAY_CACHE_PREFIX}:${country}:${year}:${locationKey}:${typesKey}`
}

export const readHolidayCache = (
  country: string,
  year: number,
  location?: string | null,
  types?: HolidayType[]
): HolidayCacheData | null => {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.localStorage.getItem(buildHolidayCacheKey(country, year, location, types))
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as {
      version?: number
      labels?: Record<string, unknown> | null
      details?: Record<string, unknown> | null
      data?: Record<string, unknown> | null
    }

    if (
      !parsed ||
      parsed.version !== HOLIDAY_CACHE_VERSION ||
      (parsed.labels == null && parsed.data == null)
    ) {
      return null
    }

    const labelSource = parsed.labels ?? parsed.data ?? {}
    const sanitizedLabels: HolidayLabelMap = {}
    if (labelSource && typeof labelSource === "object") {
      Object.entries(labelSource as Record<string, unknown>).forEach(([key, value]) => {
        if (typeof key !== "string" || !Array.isArray(value)) {
          return
        }
        const labels = value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
        if (labels.length > 0) {
          sanitizedLabels[key] = Array.from(new Set(labels))
        }
      })
    }

    const sanitizedDetails: HolidayDetailMap = {}
    if (parsed.details && typeof parsed.details === "object") {
      Object.entries(parsed.details as Record<string, unknown>).forEach(([key, value]) => {
        if (typeof key !== "string" || !Array.isArray(value)) {
          return
        }

        const details: HolidayDetail[] = []
        value.forEach((item) => {
          if (!item || typeof item !== "object") {
            return
          }

          const rawName = (item as { name?: unknown }).name
          const name = typeof rawName === "string" ? rawName.trim() : ""
          if (!name) {
            return
          }

          const rawDescription = (item as { description?: unknown }).description
          const description =
            typeof rawDescription === "string" && rawDescription.trim().length > 0
              ? rawDescription.trim()
              : null

          const rawIsoDate = (item as { isoDate?: unknown }).isoDate
          const isoDate =
            typeof rawIsoDate === "string" && rawIsoDate.trim().length > 0
              ? rawIsoDate.trim()
              : null

          const rawType = (item as { type?: unknown }).type
          const type =
            typeof rawType === "string" && rawType.trim().length > 0 ? rawType.trim() : null

          details.push({
            name,
            description,
            dateKey: key,
            isoDate,
            type,
          })
        })

        if (details.length > 0) {
          sanitizedDetails[key] = details
        }
      })
    }

    return {
      labels: sanitizedLabels,
      details: sanitizedDetails,
    }
  } catch (error) {
    console.error("Failed to read holiday cache", error)
    return null
  }
}

export const writeHolidayCache = (
  country: string,
  year: number,
  data: HolidayCacheData,
  location?: string | null,
  types?: HolidayType[]
) => {
  if (typeof window === "undefined") {
    return
  }

  try {
    const payload = JSON.stringify({
      version: HOLIDAY_CACHE_VERSION,
      storedAt: Date.now(),
      labels: data.labels,
      details: data.details,
    })
    window.localStorage.setItem(buildHolidayCacheKey(country, year, location, types), payload)
  } catch (error) {
    console.error("Failed to write holiday cache", error)
  }
}

const sanitizeHolidayName = (value: unknown) =>
  typeof value === "string" ? value.trim() : ""

const sanitizeDescription = (value: unknown) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const sanitizeType = (value: unknown) => {
  if (Array.isArray(value)) {
    const first = value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .find((entry) => entry.length > 0)
    return first ?? null
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  return null
}

export const fetchHolidayData = async (
  country: string,
  year: number,
  signal?: AbortSignal,
  location?: string | null,
  types?: HolidayType[]
): Promise<HolidayCacheData> => {
  const labelMap: HolidayLabelMap = {}
  const detailMap: HolidayDetailMap = {}

  const url = new URL(CALENDARIFIC_ENDPOINT)
  url.searchParams.set("api_key", CALENDARIFIC_API_KEY)
  url.searchParams.set("country", country)
  url.searchParams.set("year", String(year))

  // Add location parameter if provided
  if (location) {
    url.searchParams.set("location", location)
  }

  // Add types parameter (defaults to all types if not specified)
  const typesParam = formatHolidayTypesForApi(types || [])
  url.searchParams.set("type", typesParam)

  const response = await fetch(url.toString(), { signal })
  if (!response.ok) {
    throw new Error(`Holiday request failed with status ${response.status}`)
  }

  const payload = (await response.json()) as CalendarificResponse
  const holidays = payload?.response?.holidays ?? []

  holidays.forEach((holiday) => {
    if (!holiday || typeof holiday !== "object") {
      return
    }

    let key: string | null = null

    const iso = typeof holiday.date?.iso === "string" ? holiday.date.iso.split("T")[0] : null
    if (iso) {
      const isoParts = iso.split("-")
      if (isoParts.length === 3) {
        const [yearPart, monthPart, dayPart] = isoParts
        key = buildDateKeyFromParts(yearPart, monthPart, dayPart)
      }
    }

    if (!key && holiday.date?.datetime) {
      const { year: y, month: m, day: d } = holiday.date.datetime
      if (typeof y === "number" && typeof m === "number" && typeof d === "number") {
        key = buildDateKeyFromParts(y, m, d)
      }
    }

    if (!key) {
      return
    }

    const name = sanitizeHolidayName(holiday.name)
    if (!name) {
      return
    }

    if (!labelMap[key]) {
      labelMap[key] = []
    }
    if (!labelMap[key].includes(name)) {
      labelMap[key].push(name)
    }

    const description = sanitizeDescription(holiday.description)
    const isoDate =
      typeof holiday.date?.iso === "string" && holiday.date.iso.trim().length > 0
        ? holiday.date.iso.split("T")[0] ?? holiday.date.iso.trim()
        : null
    const type = sanitizeType(holiday.type)

    if (!detailMap[key]) {
      detailMap[key] = []
    }

    const exists = detailMap[key].some((entry) => entry.name === name)
    if (!exists) {
      detailMap[key].push({
        name,
        description,
        dateKey: key,
        isoDate,
        type,
      })
    }
  })

  return {
    labels: labelMap,
    details: detailMap,
  }
}
