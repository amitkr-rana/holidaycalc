import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ComponentProps } from "react"
import type { DayClickEventHandler } from "react-day-picker"
import { useNavigate } from "react-router-dom"

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
import type { HolidayCacheData, HolidayLabelMap } from "@/lib/holiday-service"
import {
  HOLIDAY_CACHE_VERSION,
  dateKey,
  fetchHolidayData,
  getCountryName,
  normalizeDate,
  parseDateKeyToDate,
  readHolidayCache,
  writeHolidayCache,
} from "@/lib/holiday-service"

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

const monthKeyFromDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`

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
  const chainDates = uniqueDates(holidayGroup)
  if (!chainDates.length) return null

  let leaveDays: Date[] = []
  let start = chainDates[0]
  let end = chainDates[chainDates.length - 1]
  const today = normalizeDate(new Date())

  const cursor = new Date(start)
  while (cursor <= end) {
    if (!isWeekend(cursor)) {
      const key = dateKey(cursor)
      if (!holidaysSet.has(key)) {
        leaveDays.push(new Date(cursor))
      }
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  const holidayMonthKeys = new Set(chainDates.map(monthKeyFromDate))
  const originalStartMonthKey = monthKeyFromDate(start)
  const originalEndMonthKey = monthKeyFromDate(end)

  const extendDirection = (direction: "forward" | "backward") => {
    const step = direction === "forward" ? 1 : -1
    const base = direction === "forward" ? end : start
    const boundaryKey = direction === "forward" ? originalEndMonthKey : originalStartMonthKey
    const pointer = new Date(base)
    const candidateDates: Date[] = []
    const candidateLeaves: Date[] = []
    let extraLeavesUsed = 0
    let encounteredWeekend = false

    while (true) {
      pointer.setDate(pointer.getDate() + step)
      const pointerMonthKey = monthKeyFromDate(pointer)

      if (pointerMonthKey !== boundaryKey && !holidayMonthKeys.has(pointerMonthKey)) {
        break
      }

      const key = dateKey(pointer)
      const isHoliday = holidaysSet.has(key)
      const weekend = isWeekend(pointer)

      if (direction === "forward" && encounteredWeekend && !weekend && !isHoliday) {
        break
      }

      if (direction === "backward" && encounteredWeekend && !weekend && !isHoliday && extraLeavesUsed >= MAX_LEAVES) {
        break
      }

      if (weekend) {
        encounteredWeekend = true
        candidateDates.push(new Date(pointer))
        continue
      }

      if (isHoliday) {
        candidateDates.push(new Date(pointer))
        continue
      }

      if (extraLeavesUsed + 1 > MAX_LEAVES) {
        break
      }

      extraLeavesUsed += 1
      const leaveDate = new Date(pointer)
      candidateLeaves.push(leaveDate)
      candidateDates.push(leaveDate)
    }

    if (!encounteredWeekend) {
      return { dates: [] as Date[], leaves: [] as Date[] }
    }

    const filteredLeaves = candidateLeaves.filter((date) => date.getTime() >= today.getTime())
    const keptLeafKeys = new Set(filteredLeaves.map((date) => dateKey(date)))
    const originalLeafKeys = new Set(candidateLeaves.map((date) => dateKey(date)))
    const filteredDates = candidateDates.filter((date) => {
      const key = dateKey(date)
      if (!originalLeafKeys.has(key)) {
        return true
      }
      return keptLeafKeys.has(key)
    })

    const sortedDates = direction === "forward" ? filteredDates : filteredDates.reverse()
    const sortedLeaves = direction === "forward" ? filteredLeaves : filteredLeaves.reverse()

    return { dates: sortedDates, leaves: sortedLeaves }
  }

  const backwardExtension = extendDirection("backward")
  const forwardExtension = extendDirection("forward")

  const combinedDates = uniqueDates([
    ...backwardExtension.dates,
    ...chainDates,
    ...forwardExtension.dates,
  ])
  leaveDays = uniqueDates([
    ...backwardExtension.leaves,
    ...leaveDays.filter((date) => date.getTime() >= today.getTime()),
    ...forwardExtension.leaves,
  ])

  if (combinedDates.length) {
    start = combinedDates[0]
    end = combinedDates[combinedDates.length - 1]
  }

  const spanDates: Date[] = []
  const spanCursor = new Date(start)
  while (spanCursor <= end) {
    spanDates.push(new Date(spanCursor))
    spanCursor.setDate(spanCursor.getDate() + 1)
  }

  const totalDays = differenceInDays(start, end) + 1

  const leaveMonthKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}`
  for (const leaveDay of leaveDays) {
    const leaveYear = leaveDay.getFullYear()
    if (leaveYear !== currentYear && leaveYear !== currentYear + 1) {
      return null
    }
    const monthKey = leaveMonthKey(leaveDay)
    const leavesUsed = leavesUsedByMonth[monthKey] ?? 0
    if (leavesUsed >= MAX_LEAVES) {
      return null
    }
  }

  return {
    dates: spanDates,
    leaveDays,
    totalDays,
    start,
    end,
  } satisfies ChainResult
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
  const navigate = useNavigate()

  const [currentCountry, setCurrentCountry] = useState<CountryCode>(DEFAULT_COUNTRY)
  const [selectedDates, setSelectedDates] = useState<Date[]>([])
  const [manualSelectedDates, setManualSelectedDates] = useState<Date[]>([])
  const [chainResultsByMonth, setChainResultsByMonth] = useState<Record<
    string,
    { longest: ChainResult | null; shortest: ChainResult | null }
  >>({})
  const [holidayDescriptions, setHolidayDescriptions] = useState<HolidayLabelMap>({})
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [currentYear, setCurrentYear] = useState<number>(BASE_YEAR)
  const [isCalculating, setIsCalculating] = useState(false)
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null)
  const autoHolidayKeysRef = useRef<Set<string>>(new Set())
  const manualSelectionRef = useRef<Date[]>([])
  const holidayFetchControllerRef = useRef<AbortController | null>(null)
  const holidayFetchCancelledRef = useRef(false)
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

  useEffect(() => {
    manualSelectionRef.current = manualSelectedDates
  }, [manualSelectedDates])

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
    (data: HolidayCacheData) => {
      setHolidayDescriptions(data.labels)
      const entries = Object.keys(data.labels)
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
    setChainResultsByMonth({})
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
    setStatusMessage(null)

    const manualMonthKeys = new Set(manual.map(monthKeyFromDate))
    setChainResultsByMonth((prev) => {
      const next: Record<string, { longest: ChainResult | null; shortest: ChainResult | null }> = {}
      Object.entries(prev).forEach(([key, value]) => {
        if (manualMonthKeys.has(key)) {
          next[key] = value
        }
      })
      return next
    })
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
    const longestDatesMap = new Map<string, Date>()
    const longestLeavesMap = new Map<string, Date>()
    const shortestDatesMap = new Map<string, Date>()
    const shortestLeavesMap = new Map<string, Date>()

    Object.values(chainResultsByMonth).forEach(({ longest, shortest }) => {
      if (!longest) return
      longest.dates.forEach((date) => {
        const key = dateKey(date)
        if (!longestDatesMap.has(key)) {
          longestDatesMap.set(key, new Date(date))
        }
      })
      longest.leaveDays.forEach((date) => {
        const key = dateKey(date)
        if (!longestLeavesMap.has(key)) {
          longestLeavesMap.set(key, new Date(date))
        }
      })

      if (shortest && shortest.start.getTime() !== longest.start.getTime()) {
        shortest.dates.forEach((date) => {
          const key = dateKey(date)
          if (!shortestDatesMap.has(key)) {
            shortestDatesMap.set(key, new Date(date))
          }
        })
        shortest.leaveDays.forEach((date) => {
          const key = dateKey(date)
          if (!shortestLeavesMap.has(key)) {
            shortestLeavesMap.set(key, new Date(date))
          }
        })
      }
    })

    return {
      holiday: normalizedSelection,
      weekend: (date: Date) => {
        const day = date.getDay()
        return day === 0 || day === 6
      },
      longestChain: uniqueDates(Array.from(longestDatesMap.values())),
      longestLeave: uniqueDates(Array.from(longestLeavesMap.values())),
      shortestChain: uniqueDates(Array.from(shortestDatesMap.values())),
      shortestLeave: uniqueDates(Array.from(shortestLeavesMap.values())),
    }
  }, [chainResultsByMonth, normalizedSelection])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    cancelHolidayFetch({ silent: true })

    const cachedHolidayData = readHolidayCache(currentCountry, currentYear)
    if (cachedHolidayData) {
      applyHolidayData(cachedHolidayData)
      const count = Object.keys(cachedHolidayData.labels).length
      setStatusMessage(
        count
          ? `Loaded ${count} cached holiday${count === 1 ? "" : "s"} for ${
              getCountryName(currentCountry)
            } ${currentYear}.`
          : `No holidays found for ${getCountryName(currentCountry)} ${currentYear}.`
      )
      return
    }

    const controller = new AbortController()
    holidayFetchControllerRef.current = controller
    holidayFetchCancelledRef.current = false
    setIsLoadingHolidays(true)
    setLoadingMessage(`Fetching holidays for ${getCountryName(currentCountry)} ${currentYear}...`)

    const load = async () => {
      try {
        const data = await fetchHolidayData(currentCountry, currentYear, controller.signal)
        if (holidayFetchCancelledRef.current) {
          return
        }

        applyHolidayData(data)
        writeHolidayCache(currentCountry, currentYear, data)

        const count = Object.keys(data.labels).length
        setStatusMessage(
          count
            ? `Loaded ${count} holiday${count === 1 ? "" : "s"} for ${getCountryName(currentCountry)} ${currentYear}.`
            : `No holidays found for ${getCountryName(currentCountry)} ${currentYear}.`
        )
      } catch (error) {
        if ((error as Error)?.name === "AbortError" || holidayFetchCancelledRef.current) {
          return
        }

        console.error("Failed to fetch holidays", error)
        setStatusMessage(
          `Unable to fetch holidays for ${getCountryName(currentCountry)} ${currentYear}.`
        )
      } finally {
        holidayFetchControllerRef.current = null
        holidayFetchCancelledRef.current = false
        setIsLoadingHolidays(false)
        setLoadingMessage(null)
      }
    }

    load()

    return () => {
      cancelHolidayFetch({ silent: true })
    }
  }, [applyHolidayData, cancelHolidayFetch, currentCountry, currentYear])

  const getDayTooltip = useCallback((date: Date) => {
    const labels = holidayDescriptions[dateKey(date)]
    return labels && labels.length ? labels : null
  }, [holidayDescriptions])

  const handleHolidayDayClick = useCallback<DayClickEventHandler>(
    (day) => {
      const key = dateKey(day)
      const labels = holidayDescriptions[key]
      if (!labels || labels.length === 0) {
        return
      }

      const year = day.getFullYear()
      const month = String(day.getMonth() + 1).padStart(2, "0")
      const dayOfMonth = String(day.getDate()).padStart(2, "0")

      navigate(`/holiday/${currentCountry}/${year}/${month}/${dayOfMonth}`, {
        state: {
          dateKey: key,
          labels,
          countryName: getCountryName(currentCountry),
          cacheVersion: HOLIDAY_CACHE_VERSION,
        },
      })
    },
    [currentCountry, holidayDescriptions, navigate]
  )

  const handleCalculateChain = () => {
    if (!hasManualSelections) {
      setChainResultsByMonth({})
      setStatusMessage("Please select at least one holiday other than public holidays to calculate a chain.")
      return
    }

    if (!normalizedSelection.length) {
      setChainResultsByMonth({})
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
    setStatusMessage(null)

    const selectionSnapshot = normalizedSelection.map((date) => new Date(date))
    const manualSnapshot = normalizedManualSelection.map((date) => new Date(date))
    const manualMonthKeys = new Set(manualSnapshot.map(monthKeyFromDate))
    const manualGroups = new Map<string, Date[]>()
    manualSnapshot.forEach((date) => {
      const key = monthKeyFromDate(date)
      const bucket = manualGroups.get(key) ?? []
      bucket.push(new Date(date))
      manualGroups.set(key, bucket)
    })

    if (!manualGroups.size) {
      setChainResultsByMonth({})
      setStatusMessage("No manual holiday selections available to calculate a chain.")
      setIsCalculating(false)
      return
    }

    computeTimeoutRef.current = window.setTimeout(() => {
      computeTimeoutRef.current = null

      const updates: Record<string, { longest: ChainResult | null; shortest: ChainResult | null }> = {}
      const messages: string[] = []

      manualGroups.forEach((_, key) => {
        const [yearStr, monthStr] = key.split("-")
        const targetYear = Number(yearStr)
        const targetMonth = Number(monthStr) - 1
        const targetMonthKey = monthKeyFromDate(new Date(targetYear, targetMonth, 1))
        const windowStart = new Date(targetYear, targetMonth - 1, 1)
        const windowEnd = new Date(targetYear, targetMonth + 2, 0)
        const windowStartTime = windowStart.getTime()
        const windowEndTime = windowEnd.getTime()

        const windowDates = selectionSnapshot.filter((date) => {
          const time = date.getTime()
          if (time < windowStartTime || time > windowEndTime) {
            return false
          }
          const keyMonth = monthKeyFromDate(date)
          return keyMonth === targetMonthKey || manualMonthKeys.has(keyMonth)
        })

        const { longest, shortest } = computeChains(windowDates, targetYear)
        const monthLabel = new Date(targetYear, targetMonth, 1).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })

        if (longest) {
          updates[key] = { longest, shortest }
          const leaveCount = longest.leaveDays.length
          messages.push(
            `${monthLabel}: ${formatDateRange(longest.start, longest.end)} ? ${longest.totalDays} day${
              longest.totalDays === 1 ? "" : "s"
            } (${leaveCount} leave day${leaveCount === 1 ? "" : "s"})`
          )
        } else {
          updates[key] = { longest: null, shortest: null }
          messages.push(`${monthLabel}: No viable chain found.`)
        }
      })

      setChainResultsByMonth(() => {
        const next: Record<string, { longest: ChainResult | null; shortest: ChainResult | null }> = {}
        manualGroups.forEach((_, key) => {
          const result = updates[key]
          if (result?.longest) {
            next[key] = result
          }
        })
        return next
      })

      setStatusMessage(messages.join(" | "))
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
      cancelHolidayFetch({ silent: true })
    }
  }, [cancelHolidayFetch])

  useLayoutEffect(() => {
    const updateHeaderHeight = () => {
      const node = headerRef.current
      if (!node) return
      setHeaderHeight(node.getBoundingClientRect().height)
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

    if (headerRef.current) {
      observer.observe(headerRef.current)
    }

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <div className="min-h-screen flex flex-col">
        <div
          ref={headerRef}
          className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 transition-colors p-4"
        >
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
                    `Fetching holidays for ${getCountryName(currentCountry)} ${currentYear}...`
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
  calendarCaptionFormatter: NonNullable<
    NonNullable<ComponentProps<typeof Calendar>["formatters"]>["formatCaption"]
  >
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
      setIsVisible(true)
      return
    }

    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      setIsVisible(true)
      return
    }

    let timeout: number | null = window.setTimeout(() => {
      setIsVisible(true)
      timeout = null
    }, 1200)

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
      if (timeout !== null) {
        window.clearTimeout(timeout)
      }
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
              date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()
            }
            showOutsideDays={false}
          />
        </div>
      </div>
    </div>
  )
}

export default App


