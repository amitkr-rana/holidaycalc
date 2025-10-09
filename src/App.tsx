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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Input } from "@/components/ui/input"
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
import {
  calculateHolidayChains,
  type HolidayChainMode,
  type HolidayChainResult,
} from "@/lib/holiday-chains"

// const MS_IN_DAY = 1000 * 60 * 60 * 24
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
  (COUNTRIES.find((country) => country.code === "IN")?.code ?? COUNTRIES[0]?.code) || "IN"
) as CountryCode

type ChainResult = {
  dates: Date[]
  leaveDays: Date[]
  totalDays: number
  start: Date
  end: Date
}

const monthKeyFromDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`

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

const LAST_COUNTRY_KEY = 'lastSelectedCountry'

function App() {
  const navigate = useNavigate()

  const [currentCountry, setCurrentCountry] = useState<CountryCode>(() => {
    const savedCountry = localStorage.getItem(LAST_COUNTRY_KEY)
    return (savedCountry && COUNTRIES.some(c => c.code === savedCountry) ? savedCountry : DEFAULT_COUNTRY) as CountryCode
  })
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

  // New state for chain algorithm mode and user input
  const [chainMode, setChainMode] = useState<HolidayChainMode>("optimal")
  const [userLeaveDays, setUserLeaveDays] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogInput, setDialogInput] = useState("")
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [allChainsByMonth, setAllChainsByMonth] = useState<Record<string, HolidayChainResult[]>>({})
  const [selectedChainIndexByMonth, setSelectedChainIndexByMonth] = useState<Record<string, number>>({})
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
      localStorage.setItem(LAST_COUNTRY_KEY, code)
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

  /*
  const normalizedManualSelection = useMemo(
    () => uniqueDates(manualSelectedDates),
    [manualSelectedDates]
  )
  */

  // const hasManualSelections = normalizedManualSelection.length > 0
  const hasHolidays = normalizedSelection.length > 0
  const isCalculateDisabled = isLoadingHolidays || isCalculating || !hasHolidays
  const shouldShowCalculateTooltip = !hasHolidays && !isLoadingHolidays && !isCalculating

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

  const handleModeChange = (mode: HolidayChainMode) => {
    if (mode === "user-total") {
      setDialogOpen(true)
      setDialogInput("")
      setDialogError(null)
    } else {
      setChainMode("optimal")
      setUserLeaveDays(null)
    }
  }

  const handleDialogCalculate = () => {
    const value = parseInt(dialogInput, 10)
    if (isNaN(value) || value < 1) {
      setDialogError("Please enter a number greater than or equal to 1")
      return
    }
    if (value > 15) {
      setDialogError("Please enter a number less than or equal to 15")
      return
    }
    setUserLeaveDays(value)
    setChainMode("user-total")
    setDialogOpen(false)
    setDialogError(null)
  }

  const handleDialogCancel = () => {
    setDialogOpen(false)
    setDialogError(null)
    setDialogInput("")
    setChainMode("optimal")
    setUserLeaveDays(null)
  }

  const handleChainSelection = (monthKey: string, chainIndex: number) => {
    setSelectedChainIndexByMonth((prev) => ({
      ...prev,
      [monthKey]: chainIndex,
    }))

    // Update chainResultsByMonth with the selected chain
    const chains = allChainsByMonth[monthKey]
    if (chains && chains[chainIndex]) {
      const selectedChain = chains[chainIndex]
      setChainResultsByMonth((prev) => ({
        ...prev,
        [monthKey]: {
          longest: {
            dates: selectedChain.dates,
            leaveDays: selectedChain.leaveDates,
            totalDays: selectedChain.length,
            start: selectedChain.start,
            end: selectedChain.end,
          },
          shortest: null,
        },
      }))
    }
  }

  const handleCalculateChain = () => {
    if (!normalizedSelection.length) {
      setChainResultsByMonth({})
      setAllChainsByMonth({})
      setSelectedChainIndexByMonth({})
      setStatusMessage("No holidays available to calculate chains. Please wait for holidays to load.")
      return
    }

    if (chainMode === "user-total" && !userLeaveDays) {
      setStatusMessage("Please set the number of leave days in User mode.")
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

    computeTimeoutRef.current = window.setTimeout(() => {
      computeTimeoutRef.current = null

      // Use the new algorithm
      const startDate = new Date(currentYear, 0, 1)
      const endDate = new Date(currentYear + 1, 3, 0) // End of April next year

      // Optimal mode uses 2 leaves by default (like user-total with 2)
      const effectiveMode: HolidayChainMode = chainMode === "optimal" ? "user-total" : "user-total"
      const effectiveLeaves = chainMode === "optimal" ? 2 : (userLeaveDays ?? 2)

      const chains = calculateHolidayChains({
        mode: effectiveMode,
        leavesBudget: effectiveLeaves,
        startDate,
        endDate,
        holidayDates: selectionSnapshot,
        maxLeavesPerMonth: MAX_LEAVES,
      })

      // Group chains by ALL months they touch (not just primary month)
      const chainsByMonth: Record<string, HolidayChainResult[]> = {}
      const selectedIndexes: Record<string, number> = {}

      chains.forEach((chain) => {
        // Add this chain to all months it touches
        chain.monthKeys.forEach((monthKey) => {
          if (!chainsByMonth[monthKey]) {
            chainsByMonth[monthKey] = []
            selectedIndexes[monthKey] = 0
          }
          // Only add if not already in this month's list (avoid duplicates)
          const isDuplicate = chainsByMonth[monthKey].some(
            (existingChain) => existingChain.id === chain.id
          )
          if (!isDuplicate) {
            chainsByMonth[monthKey].push(chain)
          }
        })
      })

      setAllChainsByMonth(chainsByMonth)
      setSelectedChainIndexByMonth(selectedIndexes)

      // Update chainResultsByMonth for backward compatibility
      const updates: Record<string, { longest: ChainResult | null; shortest: ChainResult | null }> = {}
      Object.entries(chainsByMonth).forEach(([monthKey, chains]) => {
        if (chains.length > 0) {
          const selectedIndex = selectedIndexes[monthKey] || 0
          const selectedChain = chains[selectedIndex] || chains[0]
          updates[monthKey] = {
            longest: {
              dates: selectedChain.dates,
              leaveDays: selectedChain.leaveDates,
              totalDays: selectedChain.length,
              start: selectedChain.start,
              end: selectedChain.end,
            },
            shortest: null,
          }
        }
      })

      setChainResultsByMonth(updates)

      // Only show message if no chains were found
      setStatusMessage(Object.keys(chainsByMonth).length === 0 ? "No chains found." : null)
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" data-testid="mode-dropdown">
                    {chainMode === "optimal" ? "Optimal (2 days)" : `User (${userLeaveDays ?? "?"} days)`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    data-testid="optimal-mode-item"
                    onClick={() => handleModeChange("optimal")}
                  >
                    Optimal Mode (2 days)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="user-mode-item"
                    onClick={() => handleModeChange("user-total")}
                  >
                    User Mode (Custom)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex pointer-events-auto">
                    <Button
                      variant="default"
                      onClick={handleCalculateChain}
                      disabled={isCalculateDisabled}
                      data-testid="calculate-chain-button"
                    >
                      Calculate Chain
                    </Button>
                  </span>
                </TooltipTrigger>
                {shouldShowCalculateTooltip && (
                  <TooltipContent>
                    <p>Please wait for holidays to load before calculating chains.</p>
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
                {months.map((month, index) => {
                  const monthKey = monthKeyFromDate(month)
                  return (
                    <MonthGridCell
                      key={index}
                      month={month}
                      normalizedSelection={normalizedSelection}
                      handleSelect={handleSelect}
                      onDayClick={handleHolidayDayClick}
                      getDayTooltip={getDayTooltip}
                      modifiers={modifiers}
                      calendarCaptionFormatter={calendarCaptionFormatter}
                      allChains={allChainsByMonth[monthKey] || []}
                      selectedChainIndex={selectedChainIndexByMonth[monthKey] ?? 0}
                      onChainSelect={(index) => handleChainSelection(monthKey, index)}
                      monthKey={monthKey}
                    />
                  )
                })}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} data-testid="user-mode-dialog">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Mode Configuration</DialogTitle>
            <DialogDescription>
              Enter the total number of leave days you want to use (1-15 days).
              <br />
              <span className="text-xs text-muted-foreground">Note: Optimal mode uses 2 days by default.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Input
                type="number"
                min="1"
                max="15"
                placeholder="Enter leave days"
                value={dialogInput}
                onChange={(e) => setDialogInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleDialogCalculate()
                  }
                }}
                data-testid="leave-days-input"
              />
              {dialogError && (
                <p className="text-sm text-destructive">{dialogError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleDialogCancel}
              data-testid="dialog-cancel-button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDialogCalculate}
              data-testid="dialog-calculate-button"
            >
              Set Mode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ThemeProvider>
  )
}

type MonthGridCellProps = {
  month: Date
  monthKey: string
  normalizedSelection: Date[]
  handleSelect: (dates: Date[] | undefined) => void
  onDayClick?: ComponentProps<typeof Calendar>["onDayClick"]
  getDayTooltip?: ComponentProps<typeof Calendar>["getDayTooltip"]
  modifiers: ComponentProps<typeof Calendar>["modifiers"]
  calendarCaptionFormatter: NonNullable<
    NonNullable<ComponentProps<typeof Calendar>["formatters"]>["formatCaption"]
  >
  allChains: HolidayChainResult[]
  selectedChainIndex: number
  onChainSelect: (index: number) => void
}

function MonthGridCell({
  month,
  monthKey,
  normalizedSelection,
  handleSelect,
  onDayClick,
  getDayTooltip,
  modifiers,
  calendarCaptionFormatter,
  allChains,
  selectedChainIndex,
  onChainSelect,
}: MonthGridCellProps) {
  const cellRef = useRef<HTMLDivElement | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [hoverOpen, setHoverOpen] = useState(false)

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

  const hasChains = allChains.length > 0

  return (
    <div
      ref={cellRef}
      className={`calendar-grid-cell month-cell ${isVisible ? "month-cell--visible" : "month-cell--hidden"}`}
      data-testid={`month-trigger-${monthKey}`}
    >
      <div className="month-visual">
        <div className="month-loader" aria-hidden="true" />
        <div className="month-calendar">
          {hasChains ? (
            <HoverCard open={hoverOpen} onOpenChange={setHoverOpen}>
              <HoverCardTrigger asChild>
                <div style={{ pointerEvents: 'none' }}>
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
                    style={{ pointerEvents: 'auto' }}
                  />
                </div>
              </HoverCardTrigger>
              <HoverCardContent
                className="w-80"
                data-testid={`month-hover-card-${monthKey}`}
              >
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Available Chains</h4>
                  <div className="space-y-1">
                    {allChains.map((chain, index) => {
                      const isSelected = index === selectedChainIndex
                      const isBoundary = chain.monthKeys.length > 1
                      const boundaryMonths = isBoundary
                        ? chain.monthKeys.filter((key) => key !== monthKey)
                        : []

                      return (
                        <button
                          key={index}
                          data-testid={`chain-option-${index}`}
                          onClick={() => {
                            onChainSelect(index)
                            setHoverOpen(false)
                          }}
                          className={`w-full text-left rounded px-2 py-1.5 text-sm transition-colors ${
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-accent hover:text-accent-foreground"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>
                              {formatDateRange(chain.start, chain.end)}
                            </span>
                            {isSelected && (
                              <span className="text-xs">✓</span>
                            )}
                          </div>
                          <div className="text-xs opacity-80">
                            {chain.length} day{chain.length === 1 ? "" : "s"}, {chain.leaves} leave{chain.leaves === 1 ? "" : "s"}
                            {isBoundary && (
                              <span className="ml-1">
                                {boundaryMonths.map((key) => {
                                  const [y, m] = key.split("-")
                                  const monthName = new Date(Number(y), Number(m) - 1).toLocaleDateString(undefined, { month: "short" })
                                  const direction = key < monthKey ? "←" : "→"
                                  return ` ${direction} ${monthName}`
                                }).join("")}
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  )
}

export default App


