import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ComponentProps } from "react"
import type { DayClickEventHandler } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { ThemeProvider } from "@/components/theme-provider"
import { ModeToggle } from "@/components/mode-toggle"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { COUNTRIES } from "@/lib/countries"
import type { CountryCode } from "@/lib/countries"

const MS_IN_DAY = 1000 * 60 * 60 * 24
const MAX_LEAVES = 2
const YEAR_PAST_RANGE = 5
const YEAR_FUTURE_RANGE = 10
const BASE_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from(
  { length: YEAR_PAST_RANGE + YEAR_FUTURE_RANGE + 1 },
  (_, index) => BASE_YEAR - YEAR_PAST_RANGE + index
)
const SPINNER_DURATION_MS = 2800
const RESULT_LEAD_MS = 500
const CALCULATION_DELAY_MS = Math.max(0, SPINNER_DURATION_MS - RESULT_LEAD_MS)
const LEGEND_TOP_PADDING_PX = 16

const HOLIDAY_CACHE_PREFIX = "holiday-cache"
const HOLIDAY_CACHE_VERSION = 2
const CALENDARIFIC_API_KEY = "g2hJuLniy4J5YI5WTkxVw37Lynk72Wuu"
const CALENDARIFIC_ENDPOINT = "https://calendarific.com/api/v2/holidays"
const RAW_PEXELS_SEARCH_URL = (import.meta.env.VITE_PEXELS_SEARCH_URL ?? "").trim()
const PEXELS_SEARCH_ENDPOINT =
  RAW_PEXELS_SEARCH_URL || (import.meta.env.DEV ? "/pexels/v1/search" : "https://api.pexels.com/v1/search")
const PEXELS_API_KEY = (import.meta.env.VITE_PEXELS_API_KEY ?? "").trim()

const DEFAULT_COUNTRY = (
  (COUNTRIES.find((country) => country.code === "US")?.code ?? COUNTRIES[0]?.code) || "US"
) as CountryCode

type ChainCandidate = {
  dates: Date[]
  leaveDays: Date[]
  totalDays: number
}

type ChainResult = ChainCandidate & {
  start: Date
  end: Date
}

type HolidayMap = Record<string, string[]>

type CalendarificDateResponse = {
  iso?: string
  datetime?: {
    year?: number
    month?: number
    day?: number
  }
}

type CalendarificHoliday = {
  name?: string
  description?: string
  date?: CalendarificDateResponse
}

type CalendarificResponse = {
  response?: {
    holidays?: CalendarificHoliday[]
  }
}

type PexelsPhotoSrc = {
  original?: string
  large2x?: string
  large?: string
}

type PexelsPhoto = {
  id?: number
  url?: string
  src?: PexelsPhotoSrc
}

type PexelsSearchResponse = {
  photos?: PexelsPhoto[]
}

const normalizeDate = (value: Date) => {
  const normalized = new Date(value)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

const dateKey = (date?: Date | null) => {
  if (!date) return ""
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

const getDayOfWeek = (date: Date) => {
  const day = date.getDay()
  return day === 0 ? 6 : day - 1
}

const isWeekend = (date: Date) => {
  const dow = getDayOfWeek(date)
  return dow === 5 || dow === 6
}

const uniqueDates = (dates: Date[]) => {
  const map = new Map<string, Date>()
  dates.forEach((date) => {
    const normalized = normalizeDate(date)
    const key = dateKey(normalized)
    if (!map.has(key)) {
      map.set(key, normalized)
    }
  })
  return Array.from(map.values()).sort((a, b) => a.getTime() - b.getTime())
}

const differenceInDays = (start: Date, end: Date) => {
  const startTime = normalizeDate(start).getTime()
  const endTime = normalizeDate(end).getTime()
  return Math.round((endTime - startTime) / MS_IN_DAY)
}

const buildHolidayCacheKey = (country: string, year: number) =>
  `${HOLIDAY_CACHE_PREFIX}:${country}:${year}`

const buildDateKeyFromParts = (
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

const parseDateKeyToDate = (key: string): Date | null => {
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

const readHolidayCache = (country: string, year: number): HolidayMap | null => {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.localStorage.getItem(buildHolidayCacheKey(country, year))
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as {
      version?: number
      data?: Record<string, unknown> | null
    }

    if (
      !parsed ||
      parsed.version !== HOLIDAY_CACHE_VERSION ||
      typeof parsed.data !== "object" ||
      parsed.data === null
    ) {
      return null
    }

    const sanitized: HolidayMap = {}
    Object.entries(parsed.data as Record<string, unknown>).forEach(([key, value]) => {
      if (!Array.isArray(value)) {
        return
      }

      const labels = value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)

      if (labels.length > 0) {
        sanitized[key] = Array.from(new Set(labels))
      }
    })

    return sanitized
  } catch (error) {
    console.error("Failed to read holiday cache", error)
    return null
  }
}

const writeHolidayCache = (country: string, year: number, data: HolidayMap) => {
  if (typeof window === "undefined") {
    return
  }

  try {
    const payload = JSON.stringify({
      version: HOLIDAY_CACHE_VERSION,
      storedAt: Date.now(),
      data,
    })
    window.localStorage.setItem(buildHolidayCacheKey(country, year), payload)
  } catch (error) {
    console.error("Failed to write holiday cache", error)
  }
}

const addHolidayToMap = (target: HolidayMap, key: string, label: string) => {
  const trimmed = label.trim()
  if (!trimmed) {
    return
  }

  const existing = target[key]
  if (existing) {
    if (!existing.includes(trimmed)) {
      existing.push(trimmed)
    }
  } else {
    target[key] = [trimmed]
  }
}

const groupHolidays = (dates: Date[]) => {
  if (!dates.length) return [] as Date[][]
  const sorted = uniqueDates(dates)
  const groups: Date[][] = []
  let currentGroup: Date[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const current = sorted[i]
    const diff = differenceInDays(prev, current)

    let workingDaysBetween = 0
    const tempDate = new Date(prev)
    for (let j = 1; j < diff; j++) {
      tempDate.setDate(tempDate.getDate() + 1)
      if (!isWeekend(tempDate)) {
        workingDaysBetween += 1
      }
    }

    if (workingDaysBetween <= MAX_LEAVES) {
      currentGroup.push(current)
    } else {
      groups.push(currentGroup)
      currentGroup = [current]
    }
  }

  groups.push(currentGroup)
  return groups
}

const buildBestChain = ({
  holidayGroup,
  leavesUsedByMonth,
  holidaysSet,
  currentYear,
}: {
  holidayGroup: Date[]
  leavesUsedByMonth: Record<string, number>
  holidaysSet: Set<string>
  currentYear: number
}) => {
  if (!holidayGroup.length) return null as ChainResult | null

  const today = normalizeDate(new Date())

  const allOffDays = new Set<string>()
  for (let year = currentYear; year <= currentYear + 1; year++) {
    for (let month = 0; month < 12; month++) {
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      for (let day = 1; day <= daysInMonth; day++) {
        const date = normalizeDate(new Date(year, month, day))
        if (isWeekend(date) || holidaysSet.has(dateKey(date))) {
          allOffDays.add(dateKey(date))
        }
      }
    }
  }

  const sortedGroup = uniqueDates(holidayGroup)
  const internalLeaves: Date[] = []

  const firstDayInGroup = new Date(sortedGroup[0])
  const lastDayInGroup = new Date(sortedGroup[sortedGroup.length - 1])

  for (let cursor = new Date(firstDayInGroup); cursor <= lastDayInGroup; cursor.setDate(cursor.getDate() + 1)) {
    const normalizedCursor = normalizeDate(cursor)
    if (
      normalizedCursor.getTime() >= today.getTime() &&
      !isWeekend(normalizedCursor) &&
      !holidaysSet.has(dateKey(normalizedCursor))
    ) {
      internalLeaves.push(new Date(normalizedCursor))
    }
  }

  if (internalLeaves.length > MAX_LEAVES) return null

  const remainingLeaves = MAX_LEAVES - internalLeaves.length

  const createOption = (leavesBefore: number, leavesAfter: number): ChainCandidate => {
    const externalLeaves: Date[] = []

    let beforeDate = new Date(firstDayInGroup)
    let beforeSafety = 0
    while (externalLeaves.length < leavesBefore) {
      beforeSafety += 1
      if (beforeSafety > 400) break
      beforeDate.setDate(beforeDate.getDate() - 1)
      if (beforeDate.getTime() < today.getTime()) break

      const beforeKey = dateKey(beforeDate)
      if (allOffDays.has(beforeKey)) {
        continue
      }

      const monthKey = `${beforeDate.getFullYear()}-${beforeDate.getMonth()}`
      const leavesInTargetMonth =
        (leavesUsedByMonth[monthKey] ?? 0) +
        internalLeaves.filter((leaf) => leaf.getMonth() === beforeDate.getMonth()).length +
        externalLeaves.filter((leaf) => leaf.getMonth() === beforeDate.getMonth()).length

      if (leavesInTargetMonth >= MAX_LEAVES) {
        break
      }

      externalLeaves.unshift(normalizeDate(beforeDate))
    }

    let afterDate = new Date(lastDayInGroup)
    let afterSafety = 0
    let afterCount = 0
    while (afterCount < leavesAfter) {
      afterSafety += 1
      if (afterSafety > 400) break
      afterDate.setDate(afterDate.getDate() + 1)

      const afterKey = dateKey(afterDate)
      if (allOffDays.has(afterKey)) {
        continue
      }

      const monthKey = `${afterDate.getFullYear()}-${afterDate.getMonth()}`
      const leavesInTargetMonth =
        (leavesUsedByMonth[monthKey] ?? 0) +
        internalLeaves.filter((leaf) => leaf.getMonth() === afterDate.getMonth()).length +
        externalLeaves.filter((leaf) => leaf.getMonth() === afterDate.getMonth()).length

      if (leavesInTargetMonth >= MAX_LEAVES) {
        break
      }

      externalLeaves.push(normalizeDate(afterDate))
      afterCount += 1
    }

    const allKeyPoints = [...sortedGroup, ...internalLeaves, ...externalLeaves].sort(
      (a, b) => a.getTime() - b.getTime()
    )

    if (!allKeyPoints.length) {
      return { dates: [], leaveDays: [], totalDays: 0 }
    }

    const chainStart = new Date(allKeyPoints[0])
    const chainEnd = new Date(allKeyPoints[allKeyPoints.length - 1])

    const expandStart = new Date(chainStart)
    while (true) {
      expandStart.setDate(expandStart.getDate() - 1)
      if (allOffDays.has(dateKey(expandStart))) {
        chainStart.setDate(chainStart.getDate() - 1)
      } else {
        break
      }
    }

    const expandEnd = new Date(chainEnd)
    while (true) {
      expandEnd.setDate(expandEnd.getDate() + 1)
      if (allOffDays.has(dateKey(expandEnd))) {
        chainEnd.setDate(chainEnd.getDate() + 1)
      } else {
        break
      }
    }

    const finalChain: Date[] = []
    for (let current = new Date(chainStart); current <= chainEnd; current.setDate(current.getDate() + 1)) {
      finalChain.push(normalizeDate(current))
    }

    const finalLeaves = finalChain.filter((date) => !allOffDays.has(dateKey(date)))

    return {
      dates: finalChain,
      leaveDays: finalLeaves,
      totalDays: finalChain.length,
    }
  }

  const optionLeft = createOption(remainingLeaves, 0)
  const optionRight = createOption(0, remainingLeaves)
  const optionBookend = remainingLeaves >= 2 ? createOption(1, 1) : { dates: [], leaveDays: [], totalDays: 0 }

  let bestOption: ChainCandidate = optionLeft
  if (optionRight.totalDays >= bestOption.totalDays) {
    bestOption = optionRight
  }
  if (optionBookend.totalDays > bestOption.totalDays) {
    bestOption = optionBookend
  } else if (
    optionBookend.totalDays === bestOption.totalDays &&
    (bestOption === optionRight || bestOption === optionLeft)
  ) {
    bestOption = optionBookend
  }

  if (!bestOption.dates.length) return null

  return {
    ...bestOption,
    start: bestOption.dates[0],
    end: bestOption.dates[bestOption.dates.length - 1],
  }
}

const computeChains = (
  dates: Date[],
  currentYear: number
): { longest: ChainResult | null; shortest: ChainResult | null } => {
  const normalized = uniqueDates(dates)
  if (!normalized.length) return { longest: null, shortest: null }

  const holidaysSet = new Set(normalized.map(dateKey))
  const holidayGroups = groupHolidays(normalized)
  const chains: ChainResult[] = []
  const leavesUsedByMonth: Record<string, number> = {}

  for (const group of holidayGroups) {
    const chain = buildBestChain({
      holidayGroup: group,
      leavesUsedByMonth,
      holidaysSet,
      currentYear,
    })

    if (chain) {
      chains.push(chain)
      chain.leaveDays.forEach((leave) => {
        const monthKey = `${leave.getFullYear()}-${leave.getMonth()}`
        leavesUsedByMonth[monthKey] = (leavesUsedByMonth[monthKey] ?? 0) + 1
      })
    }
  }

  if (!chains.length) return { longest: null, shortest: null }

  chains.sort((a, b) => b.totalDays - a.totalDays)
  const longest = chains[0]
  const shortest = chains.length > 1 ? chains[chains.length - 1] : longest

  return { longest, shortest }
}

const formatDateRange = (start: Date, end: Date) => {
  const sameYear = start.getFullYear() === end.getFullYear()
  const startOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }
  const endOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  }
  const startLabel = start.toLocaleDateString(undefined, startOptions)
  const endLabel = end.toLocaleDateString(undefined, endOptions)
  return `${startLabel} - ${endLabel}`
}

function App() {
  const [currentCountry, setCurrentCountry] = useState<CountryCode>(DEFAULT_COUNTRY)
  const [selectedDates, setSelectedDates] = useState<Date[]>([])
  const [manualSelectedDates, setManualSelectedDates] = useState<Date[]>([])
  const [chainResults, setChainResults] = useState<{
    longest: ChainResult | null
    shortest: ChainResult | null
  }>({ longest: null, shortest: null })
  const [holidayDescriptions, setHolidayDescriptions] = useState<HolidayMap>({})
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [currentYear, setCurrentYear] = useState<number>(BASE_YEAR)
  const [isCalculating, setIsCalculating] = useState(false)
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null)
  const autoHolidayKeysRef = useRef<Set<string>>(new Set())
  const manualSelectionRef = useRef<Date[]>([])
  const holidayFetchControllerRef = useRef<AbortController | null>(null)
  const holidayFetchCancelledRef = useRef(false)
  const pexelsPhotoCacheRef = useRef<Map<string, string>>(new Map())
  const pexelsPhotoRequestsRef = useRef<Set<string>>(new Set())
  const computeTimeoutRef = useRef<number | null>(null)
  const hideTimeoutRef = useRef<number | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState(0)

  const months = useMemo(() => {
    const currentYearMonths = Array.from({ length: 12 }, (_, index) => new Date(currentYear, index, 1))
    const nextYearMonths = Array.from({ length: 4 }, (_, index) => new Date(currentYear + 1, index, 1))
    return [...currentYearMonths, ...nextYearMonths]
  }, [currentYear])
  const legendTopOffset = headerHeight + LEGEND_TOP_PADDING_PX

  const calendarCaptionFormatter = useCallback(
    (date: Date) =>
      date.toLocaleDateString(undefined, {
        month: "long",
        ...(date.getFullYear() !== currentYear ? { year: "numeric" } : {}),
      }),
    [currentYear]
  )

  const yearOptions = useMemo(() => {
    if (YEAR_OPTIONS.includes(currentYear)) {
      return YEAR_OPTIONS
    }
    return [...YEAR_OPTIONS, currentYear].sort((a, b) => a - b)
  }, [currentYear])

  const selectedCountry = useMemo(
    () => COUNTRIES.find((country) => country.code === currentCountry),
    [currentCountry]
  )

  useEffect(() => {
    manualSelectionRef.current = manualSelectedDates
  }, [manualSelectedDates])

  const fetchHolidayPhoto = useCallback(
    async (key: string, labels: string[]) => {
      if (typeof window === "undefined") {
        return
      }

      const cachedUrl = pexelsPhotoCacheRef.current.get(key)
      const openInNewTab = (url: string | null) => {
        if (!url) return
        window.open(url, "_blank", "noopener,noreferrer")
      }

      if (cachedUrl) {
        openInNewTab(cachedUrl)
        return
      }

      if (pexelsPhotoRequestsRef.current.has(key)) {
        return
      }

      const queryLabel = labels[0]?.trim()
      const normalizedCountryName = selectedCountry?.name?.trim()
      const countryQuery = normalizedCountryName
        ? `${normalizedCountryName} ${currentCountry}`.trim()
        : currentCountry
      const queryParts = [queryLabel, countryQuery, "holiday"].filter(
        (part): part is string => Boolean(part && part.length)
      )
      const searchQuery = queryParts.join(" ")
      if (!searchQuery) {
        return
      }

      const fallbackSearchUrl = `https://www.pexels.com/search/${encodeURIComponent(searchQuery)}/`
      const openFallback = () => {
        pexelsPhotoCacheRef.current.set(key, fallbackSearchUrl)
        openInNewTab(fallbackSearchUrl)
      }

      if (!PEXELS_API_KEY) {
        console.warn(
          "Pexels API key missing. Set VITE_PEXELS_API_KEY in your environment to enable holiday photos."
        )
        openFallback()
        return
      }

      let resolvedEndpoint = PEXELS_SEARCH_ENDPOINT
      if (!/^https?:\/\//i.test(resolvedEndpoint)) {
        const prefix = resolvedEndpoint.startsWith("/") ? "" : "/"
        resolvedEndpoint = `${window.location.origin}${prefix}${resolvedEndpoint}`
      }

      let searchUrl: URL
      try {
        searchUrl = new URL(resolvedEndpoint)
      } catch (error) {
        console.error("Invalid Pexels search endpoint provided:", error)
        openFallback()
        return
      }

      searchUrl.searchParams.set("query", searchQuery)
      searchUrl.searchParams.set("per_page", "1")
      searchUrl.searchParams.set("orientation", "landscape")

      pexelsPhotoRequestsRef.current.add(key)

      try {
        const response = await fetch(searchUrl.toString(), {
          headers: {
            Authorization: PEXELS_API_KEY,
          },
        })

        if (!response.ok) {
          console.warn(`Pexels request failed with status ${response.status}`)
          openFallback()
          return
        }

        const payload = (await response.json()) as PexelsSearchResponse
        const photo = payload?.photos?.[0]
        const src = photo?.src
        const photoUrl =
          (typeof src?.original === "string" && src.original) ||
          (typeof src?.large2x === "string" && src.large2x) ||
          (typeof src?.large === "string" && src.large) ||
          null

        if (!photoUrl) {
          console.warn(`No image result returned by Pexels for query "${searchQuery}".`)
          openFallback()
          return
        }

        pexelsPhotoCacheRef.current.set(key, photoUrl)
        openInNewTab(photoUrl)
      } catch (error) {
        console.error("Failed to fetch holiday photo from Pexels", error)
        openFallback()
      } finally {
        pexelsPhotoRequestsRef.current.delete(key)
      }
    },
    [selectedCountry]
  )

  const handleHolidayDayClick = useCallback<DayClickEventHandler>(
    (day) => {
      const key = dateKey(day)
      const labels = holidayDescriptions[key]
      if (!labels || labels.length === 0) {
        return
      }

      void fetchHolidayPhoto(key, labels)
    },
    [fetchHolidayPhoto, holidayDescriptions]
  )

  const cancelHolidayFetch = useCallback(
    ({ silent }: { silent?: boolean } = {}) => {
      if (holidayFetchControllerRef.current) {
        holidayFetchCancelledRef.current = true
        holidayFetchControllerRef.current.abort()
        holidayFetchControllerRef.current = null
      }
      setIsLoadingHolidays(false)
      setLoadingMessage(null)
      if (!silent) {
        setStatusMessage("Holiday loading cancelled.")
      }
    },
    []
  )

  const applyHolidayData = useCallback(
    (map: HolidayMap) => {
      setHolidayDescriptions(map)
      const entries = Object.keys(map)
      const nextKeys = new Set(entries)
      const holidayDates = entries
        .map(parseDateKeyToDate)
        .filter((date): date is Date => Boolean(date))
        .filter((date) => date.getFullYear() === currentYear)
      const manualSelection = manualSelectionRef.current
      const combined = uniqueDates([...manualSelection, ...holidayDates])
      setSelectedDates(combined)
      autoHolidayKeysRef.current = nextKeys
    },
    [currentYear]
  )

  const resetSelections = useCallback(() => {
    autoHolidayKeysRef.current = new Set()
    manualSelectionRef.current = []
    setManualSelectedDates([])
    setSelectedDates([])
    setChainResults({ longest: null, shortest: null })
    setHolidayDescriptions({})
    setStatusMessage(null)
  }, [])

  const handleYearChange = (year: number) => {
    if (!Number.isFinite(year) || year === currentYear) {
      return
    }
    cancelHolidayFetch({ silent: true })
    resetSelections()
    setCurrentYear(year)
  }

  const handleCountryChange = useCallback(
    (code: CountryCode) => {
      if (code === currentCountry) {
        return
      }
      cancelHolidayFetch({ silent: true })
      resetSelections()
      setCurrentCountry(code)
    },
    [cancelHolidayFetch, currentCountry, resetSelections]
  )

  const handleSelect = (value: Date[] | undefined) => {
    if (!value) {
      resetSelections()
      return
    }

    const normalized = uniqueDates(value)
    const autoKeys = autoHolidayKeysRef.current
    const manual = uniqueDates(
      normalized.filter((date) => {
        if (autoKeys.has(dateKey(date))) {
          return false
        }
        return date.getFullYear() === currentYear
      })
    )

    manualSelectionRef.current = manual
    setManualSelectedDates(manual)

    const autoDates = Array.from(autoKeys)
      .map(parseDateKeyToDate)
      .filter((date): date is Date => Boolean(date))
      .filter((date) => date.getFullYear() === currentYear)

    const combined = uniqueDates([...manual, ...autoDates])
    setSelectedDates(combined)
    setChainResults({ longest: null, shortest: null })
    setStatusMessage(null)
  }

  const normalizedSelection = useMemo(() => uniqueDates(selectedDates), [selectedDates])

  const normalizedManualSelection = useMemo(
    () => uniqueDates(manualSelectedDates),
    [manualSelectedDates]
  )

  const hasManualSelections = normalizedManualSelection.length > 0
  const isCalculateDisabled = isLoadingHolidays || isCalculating || !hasManualSelections
  const shouldShowCalculateTooltip = !hasManualSelections && !isLoadingHolidays && !isCalculating

  const modifiers = useMemo(() => {
    const longestDates = chainResults.longest ? uniqueDates(chainResults.longest.dates) : []
    const longestLeaves = chainResults.longest ? uniqueDates(chainResults.longest.leaveDays) : []
    const highlightShortest =
      chainResults.longest &&
      chainResults.shortest &&
      chainResults.shortest.start.getTime() !== chainResults.longest.start.getTime()
    const shortestDates = highlightShortest && chainResults.shortest ? uniqueDates(chainResults.shortest.dates) : []
    const shortestLeaves =
      highlightShortest && chainResults.shortest ? uniqueDates(chainResults.shortest.leaveDays) : []

    return {
      holiday: normalizedSelection,
      weekend: (date: Date) => {
        const day = date.getDay()
        return day === 0 || day === 6
      },
      longestChain: longestDates,
      longestLeave: longestLeaves,
      shortestChain: shortestDates,
      shortestLeave: shortestLeaves,
    }
  }, [chainResults, normalizedSelection])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    cancelHolidayFetch({ silent: true })

    const cachedHolidays = readHolidayCache(currentCountry, currentYear)
    if (cachedHolidays) {
      applyHolidayData(cachedHolidays)
      const count = Object.keys(cachedHolidays).length
      setStatusMessage(
        count
          ? `Loaded ${count} cached holiday${count === 1 ? "" : "s"} for ${
              selectedCountry?.name ?? currentCountry
            } ${currentYear}.`
          : `No holidays found for ${selectedCountry?.name ?? currentCountry} ${currentYear}.`
      )
      return
    }

    const controller = new AbortController()
    holidayFetchControllerRef.current = controller
    holidayFetchCancelledRef.current = false
    setIsLoadingHolidays(true)
    setLoadingMessage(
      `Fetching holidays for ${selectedCountry?.name ?? currentCountry} ${currentYear}...`
    )

    const fetchHolidays = async () => {
      try {
        const holidayMap: HolidayMap = {}

        const url = new URL(CALENDARIFIC_ENDPOINT)
        url.searchParams.set("api_key", CALENDARIFIC_API_KEY)
        url.searchParams.set("country", currentCountry)
        url.searchParams.set("year", String(currentYear))
        url.searchParams.set("type", "national")

        const response = await fetch(url.toString(), { signal: controller.signal })
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
            const { year, month, day } = holiday.date.datetime
            if (
              typeof year === "number" &&
              typeof month === "number" &&
              typeof day === "number"
            ) {
              key = buildDateKeyFromParts(year, month, day)
            }
          }

          if (!key) {
            return
          }

          const nameValue = holiday.name
          if (typeof nameValue === "string") {
            addHolidayToMap(holidayMap, key, nameValue)
          }
        })

        if (holidayFetchCancelledRef.current) {
          return
        }

        applyHolidayData(holidayMap)
        writeHolidayCache(currentCountry, currentYear, holidayMap)

        const count = Object.keys(holidayMap).length
        setStatusMessage(
          count
            ? `Loaded ${count} holiday${count === 1 ? "" : "s"} for ${
                selectedCountry?.name ?? currentCountry
              } ${currentYear}.`
            : `No holidays found for ${selectedCountry?.name ?? currentCountry} ${currentYear}.`
        )
      } catch (error) {
        if ((error as Error)?.name === "AbortError" || holidayFetchCancelledRef.current) {
          return
        }

        console.error("Failed to fetch holidays", error)
        setStatusMessage(
          `Unable to fetch holidays for ${selectedCountry?.name ?? currentCountry} ${currentYear}.`
        )
      } finally {
        holidayFetchControllerRef.current = null
        holidayFetchCancelledRef.current = false
        setIsLoadingHolidays(false)
        setLoadingMessage(null)
      }
    }

    fetchHolidays()

    return () => {
      cancelHolidayFetch({ silent: true })
    }
  }, [
    applyHolidayData,
    cancelHolidayFetch,
    currentCountry,
    currentYear,
    selectedCountry,
  ])

  const getDayTooltip = useCallback((date: Date) => {
    const labels = holidayDescriptions[dateKey(date)]
    return labels && labels.length ? labels : null
  }, [holidayDescriptions])

  const handleCalculateChain = () => {
    if (!hasManualSelections) {
      setChainResults({ longest: null, shortest: null })
      setStatusMessage(
        "Please select at least one holiday other than public holidays to calculate chain."
      )
      return
    }

    if (!normalizedSelection.length) {
      setChainResults({ longest: null, shortest: null })
      setStatusMessage("Select at least one holiday date to calculate a chain.")
      return
    }

    if (isCalculating) return

    if (computeTimeoutRef.current) {
      clearTimeout(computeTimeoutRef.current)
      computeTimeoutRef.current = null
    }
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }

    setIsCalculating(true)
    setChainResults({ longest: null, shortest: null })
    setStatusMessage(null)

    const selectionSnapshot = normalizedSelection.map((date) => new Date(date))
    const yearSnapshot = currentYear

    computeTimeoutRef.current = window.setTimeout(() => {
      computeTimeoutRef.current = null
      const { longest, shortest } = computeChains(selectionSnapshot, yearSnapshot)

      if (!longest) {
        setChainResults({ longest: null, shortest: null })
        setStatusMessage("No viable chain found for the selected dates.")
        return
      }

      setChainResults({ longest, shortest })
      const leaveCount = longest.leaveDays.length
      setStatusMessage(
        `Longest chain: ${formatDateRange(longest.start, longest.end)} | ${longest.totalDays} day${
          longest.totalDays === 1 ? "" : "s"
        } (${leaveCount} leave day${leaveCount === 1 ? "" : "s"})`
      )
    }, CALCULATION_DELAY_MS)

    hideTimeoutRef.current = window.setTimeout(() => {
      hideTimeoutRef.current = null
      setIsCalculating(false)
    }, SPINNER_DURATION_MS)
  }

  useEffect(() => {
    return () => {
      if (computeTimeoutRef.current) {
        clearTimeout(computeTimeoutRef.current)
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [])

  useLayoutEffect(() => {
    if (!headerRef.current) {
      return
    }

    const updateHeaderHeight = () => {
      if (!headerRef.current) {
        return
      }
      const nextHeight = headerRef.current.getBoundingClientRect().height
      setHeaderHeight((previous) => (Math.abs(previous - nextHeight) > 0.5 ? nextHeight : previous))
    }

    updateHeaderHeight()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeaderHeight)
      return () => {
        window.removeEventListener("resize", updateHeaderHeight)
      }
    }

    const observer = new ResizeObserver(() => {
      updateHeaderHeight()
    })

    observer.observe(headerRef.current)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <div className="min-h-screen flex flex-col">
        <div ref={headerRef} className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 transition-colors p-4">
          <div className="container mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <h1 className="text-2xl font-bold">Holiday Calendar</h1>
            </div>
            <div className="flex items-center gap-4">
              <Select
                value={currentCountry}
                onValueChange={(value) => handleCountryChange(value as CountryCode)}
              >
                <SelectTrigger id="country-select" className="w-52">
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(currentYear)}
                onValueChange={(value) => {
                  const parsedYear = Number(value)
                  if (!Number.isNaN(parsedYear)) {
                    handleYearChange(parsedYear)
                  }
                }}
              >
                <SelectTrigger id="year-select" className="w-32">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent align="center">
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex pointer-events-auto">
                    <Button
                      variant="default"
                      onClick={handleCalculateChain}
                      disabled={isCalculateDisabled}
                    >
                      Calculate Chain
                    </Button>
                  </span>
                </TooltipTrigger>
                {shouldShowCalculateTooltip && (
                  <TooltipContent>
                    <p>Please select at least one holiday other than public holidays to calculate chain.</p>
                  </TooltipContent>
                )}
              </Tooltip>
              <ModeToggle />
            </div>
          </div>
          {statusMessage && (
            <div className="container mx-auto">
              <p className="mt-3 text-sm text-muted-foreground">{statusMessage}</p>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="container mx-auto px-4 pt-4 pb-2">
            <div
              className="legend-grid legend-grid--sticky"
              style={{ top: `${legendTopOffset}px` }}
            >
              <div className="legend-grid-cell">
                <div className="legend-item">
                  <span className="legend-cube legend-cube-holiday" aria-hidden="true" />
                  <span className="legend-label">Public / selected holiday</span>
                </div>
              </div>
              <div className="legend-grid-cell">
                <div className="legend-item">
                  <span className="legend-cube legend-cube-leave" aria-hidden="true" />
                  <span className="legend-label">Suggested leave</span>
                </div>
              </div>
              <div className="legend-grid-cell">
                <div className="legend-item">
                  <span className="legend-cube legend-cube-weekend" aria-hidden="true" />
                  <span className="legend-label">Weekend</span>
                </div>
              </div>
              <div className="legend-grid-cell legend-grid-cell--hint">
                <span className="legend-hint">Click "Calculate Chain" to view legends &#8593;</span>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto scrollbar-hidden">
            <div className="container mx-auto px-4 pb-4">
              <div className="calendar-grid">
                {months.map((month, index) => (
                  <MonthGridCell
                    key={index}
                    month={month}
                    normalizedSelection={normalizedSelection}
                    handleSelect={handleSelect}
                    onDayClick={handleHolidayDayClick}
                    getDayTooltip={getDayTooltip}
                    modifiers={modifiers}
                    calendarCaptionFormatter={calendarCaptionFormatter}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {(isCalculating || isLoadingHolidays) && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center text-foreground">
            <Spinner size={40} />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">
                {isLoadingHolidays ? "Loading holidays" : "Processing your request"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isLoadingHolidays
                  ? loadingMessage ??
                    `Fetching holidays for ${selectedCountry?.name ?? currentCountry} ${currentYear}...`
                  : "Calculating the optimal holiday chain. Please wait a moment."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (isLoadingHolidays) {
                  cancelHolidayFetch()
                  return
                }
                if (computeTimeoutRef.current) {
                  clearTimeout(computeTimeoutRef.current)
                  computeTimeoutRef.current = null
                }
                if (hideTimeoutRef.current) {
                  clearTimeout(hideTimeoutRef.current)
                  hideTimeoutRef.current = null
                }
                setIsCalculating(false)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </ThemeProvider>
  )
}
type MonthGridCellProps = {
  month: Date
  normalizedSelection: Date[]
  handleSelect: (dates: Date[] | undefined) => void
  onDayClick?: ComponentProps<typeof Calendar>["onDayClick"]
  getDayTooltip?: ComponentProps<typeof Calendar>["getDayTooltip"]
  modifiers: ComponentProps<typeof Calendar>["modifiers"]
  calendarCaptionFormatter: NonNullable<NonNullable<ComponentProps<typeof Calendar>["formatters"]>["formatCaption"]>
}

function MonthGridCell({
  month,
  normalizedSelection,
  handleSelect,
  onDayClick,
  getDayTooltip,
  modifiers,
  calendarCaptionFormatter,
}: MonthGridCellProps) {
  const cellRef = useRef<HTMLDivElement | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const node = cellRef.current
    if (!node) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true)
            observer.disconnect()
          }
        })
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px 25% 0px",
      }
    )

    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <div
      ref={cellRef}
      className={`calendar-grid-cell month-cell ${isVisible ? "month-cell--visible" : "month-cell--hidden"}`}
    >
      <div className="month-visual">
        <div className="month-loader" aria-hidden="true" />
        <div className="month-calendar">
          <Calendar
            mode="multiple"
            selected={normalizedSelection}
            onSelect={handleSelect}
            onDayClick={onDayClick}
            getDayTooltip={getDayTooltip}
            month={month}
            className="w-full"
            modifiers={modifiers}
            formatters={{
              formatCaption: calendarCaptionFormatter,
            }}
            disabled={(date) =>
              date.getMonth() !== month.getMonth() ||
              date.getFullYear() !== month.getFullYear()
            }
            showOutsideDays={false}
          />
        </div>
      </div>
    </div>
  )
}

export default App







