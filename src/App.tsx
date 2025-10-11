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
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Search, Sparkles, User, Trash2, XCircle, Eraser } from "lucide-react"
import { COUNTRIES, getStatesForCountry, hasStates, getCountryName, getLocationName } from "@/lib/countries"
import type { CountryCode } from "@/lib/countries"
import type { HolidayType } from "@/lib/holiday-types"
import { HOLIDAY_TYPES, getSelectedTypesDisplay } from "@/lib/holiday-types"
import type { HolidayCacheData, HolidayLabelMap } from "@/lib/holiday-service"
import {
  HOLIDAY_CACHE_VERSION,
  dateKey,
  fetchHolidayData,
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
const LAST_LOCATION_KEY_PREFIX = 'lastLocation' // Per-country location preference
const LAST_TYPES_KEY = 'lastSelectedTypes'
const LAST_SELECTION_MODE_KEY = 'lastSelectionMode'
const CHAIN_STATE_KEY = 'chainState'

function App() {
  const navigate = useNavigate()

  const [currentCountry, setCurrentCountry] = useState<CountryCode>(() => {
    const savedCountry = localStorage.getItem(LAST_COUNTRY_KEY)
    return (savedCountry && COUNTRIES.some(c => c.code === savedCountry) ? savedCountry : DEFAULT_COUNTRY) as CountryCode
  })

  // Location/State selection (null = all locations)
  const [selectedLocation, setSelectedLocation] = useState<string | null>(() => {
    try {
      const savedLocation = localStorage.getItem(`${LAST_LOCATION_KEY_PREFIX}:${DEFAULT_COUNTRY}`)
      return savedLocation || null
    } catch {
      return null
    }
  })

  // Holiday types selection (default = national)
  const [selectedTypes, setSelectedTypes] = useState<HolidayType[]>(() => {
    try {
      const saved = localStorage.getItem(LAST_TYPES_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          return parsed.filter((t): t is HolidayType =>
            typeof t === 'string' && ['national', 'local', 'religious', 'observance'].includes(t)
          )
        }
      }
    } catch {
      // Ignore parse errors
    }
    return ['national']
  })

  // Temporary types selection for the dropdown (only applied when clicking Apply)
  const [tempTypes, setTempTypes] = useState<HolidayType[]>(selectedTypes)
  const [typesDropdownOpen, setTypesDropdownOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
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

  // Selection mode: "auto" or "user"
  const [selectionMode, setSelectionMode] = useState<"auto" | "user">(() => {
    try {
      const saved = localStorage.getItem(LAST_SELECTION_MODE_KEY)
      return (saved === "user" || saved === "auto") ? saved : "auto"
    } catch {
      return "auto"
    }
  })
  const [modeHoverOpen, setModeHoverOpen] = useState(false)
  const [clearHoverOpen, setClearHoverOpen] = useState(false)
  const [forceHolidayReload, setForceHolidayReload] = useState(0)
  const [showCtrlClickHint, setShowCtrlClickHint] = useState(false)

  const autoHolidayKeysRef = useRef<Set<string>>(new Set())
  const manualSelectionRef = useRef<Date[]>([])
  const holidayFetchControllerRef = useRef<AbortController | null>(null)
  const holidayFetchCancelledRef = useRef(false)
  const computeTimeoutRef = useRef<number | null>(null)
  const hideTimeoutRef = useRef<number | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  const isInitialMount = useRef(true)
  const ctrlClickHintTimeoutRef = useRef<number | null>(null)

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

  const resetSelections = useCallback((clearPublicHolidays = false) => {
    manualSelectionRef.current = []
    setManualSelectedDates([])
    setSelectedDates([])
    setChainResultsByMonth({})
    setStatusMessage(null)
    setAllChainsByMonth({})
    setSelectedChainIndexByMonth({})

    // Optionally clear public holidays (for "Clear Everything")
    if (clearPublicHolidays) {
      autoHolidayKeysRef.current = new Set()
      setHolidayDescriptions({})
    }

    // Location and types are preserved across resets
    // Clear saved chain state
    try {
      localStorage.removeItem(CHAIN_STATE_KEY)
    } catch (e) {
      console.error('Failed to clear chain state', e)
    }
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

      // Load location preference for this country, or reset if country has no states
      if (hasStates(code)) {
        try {
          const savedLocation = localStorage.getItem(`${LAST_LOCATION_KEY_PREFIX}:${code}`)
          setSelectedLocation(savedLocation || null)
        } catch {
          setSelectedLocation(null)
        }
      } else {
        setSelectedLocation(null)
      }
      // Types selection persists across country changes
    },
    [cancelHolidayFetch, currentCountry, resetSelections]
  )

  // Handler for location change
  const handleLocationChange = useCallback(
    (locationCode: string | null) => {
      setSelectedLocation(locationCode)
      try {
        if (locationCode) {
          localStorage.setItem(`${LAST_LOCATION_KEY_PREFIX}:${currentCountry}`, locationCode)
        } else {
          localStorage.removeItem(`${LAST_LOCATION_KEY_PREFIX}:${currentCountry}`)
        }
      } catch (e) {
        console.error('Failed to save location preference', e)
      }
      // Reset holiday data when location changes
      resetSelections()
    },
    [currentCountry, resetSelections]
  )

  // Handler for types change
  const handleTypesChange = useCallback(
    (types: HolidayType[]) => {
      setSelectedTypes(types)
      try {
        localStorage.setItem(LAST_TYPES_KEY, JSON.stringify(types))
      } catch (e) {
        console.error('Failed to save types preference', e)
      }
      // Reset holiday data when types change
      resetSelections()
    },
    [resetSelections]
  )

  // Handler for types dropdown open/close
  const handleTypesDropdownOpenChange = useCallback((open: boolean) => {
    setTypesDropdownOpen(open)
    if (open) {
      // Sync temp types with selected types when opening
      setTempTypes(selectedTypes)
    }
  }, [selectedTypes])

  // Handler for Apply button in types dropdown
  const handleTypesApply = useCallback(() => {
    handleTypesChange(tempTypes)
    setTypesDropdownOpen(false)
  }, [tempTypes, handleTypesChange])

  // Handler for Clear button in types dropdown
  const handleTypesClear = useCallback(() => {
    setTempTypes([])
  }, [])

  // Search handler - navigate to holiday detail page
  const handleSearchSelect = useCallback((dateKey: string, holidayName: string) => {
    const [year, month, day] = dateKey.split('-')
    navigate(`/holiday/${currentCountry}/${year}/${month}/${day}`, {
      state: {
        dateKey,
        labels: holidayDescriptions[dateKey] || [holidayName],
        countryName: getCountryName(currentCountry),
        cacheVersion: HOLIDAY_CACHE_VERSION,
      },
    })
    setSearchOpen(false)
  }, [currentCountry, holidayDescriptions, navigate])

  // Keyboard shortcut for search (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const lastClickedDateRef = useRef<Date | null>(null)
  const ctrlPressedRef = useRef(false)

  // Track Ctrl/Cmd key state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        ctrlPressedRef.current = true
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        ctrlPressedRef.current = false
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  const handleSelect = (value: Date[] | undefined) => {
    // In auto mode, prevent manual selection/deselection
    if (selectionMode === "auto") {
      return
    }

    if (!value) {
      resetSelections()
      lastClickedDateRef.current = null
      return
    }

    let normalized = uniqueDates(value)
    const autoKeys = autoHolidayKeysRef.current

    // Find which date was just clicked (new date not in previous manual selection)
    const previousManualKeys = new Set(manualSelectionRef.current.map(dateKey))
    const manualCandidates = normalized.filter(date => !autoKeys.has(dateKey(date)))
    const newlyClicked = manualCandidates.find(d => !previousManualKeys.has(dateKey(d)))

    // Check if Ctrl/Cmd key was pressed and we have a previous selection AND a newly clicked date
    const isCtrlClick = ctrlPressedRef.current
    if (isCtrlClick && lastClickedDateRef.current && newlyClicked) {
      // Fill in all dates between lastClickedDate and newlyClicked
      const start = lastClickedDateRef.current
      const end = newlyClicked
      const [earlierDate, laterDate] = start.getTime() < end.getTime() ? [start, end] : [end, start]

      const rangeDates: Date[] = []
      const currentDate = new Date(earlierDate)
      while (currentDate <= laterDate) {
        rangeDates.push(new Date(currentDate))
        currentDate.setDate(currentDate.getDate() + 1)
      }

      // Combine existing selection with the range
      normalized = uniqueDates([...normalized, ...rangeDates])
    }

    // Update last clicked date if there was a newly clicked date
    if (newlyClicked) {
      lastClickedDateRef.current = newlyClicked
    }
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

    // Show ctrl+click hint when user makes first manual selection in user mode
    if (manual.length > 0 && selectionMode === "user") {
      setShowCtrlClickHint(true)

      // Clear any existing timeout
      if (ctrlClickHintTimeoutRef.current) {
        clearTimeout(ctrlClickHintTimeoutRef.current)
      }

      // Auto-hide after 5 seconds
      ctrlClickHintTimeoutRef.current = window.setTimeout(() => {
        setShowCtrlClickHint(false)
        ctrlClickHintTimeoutRef.current = null
      }, 5000)
    }

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
  const hasManualHolidays = manualSelectedDates.length > 0
  const hasChains = Object.keys(chainResultsByMonth).length > 0

  // In user mode, enable Calculate only if user has manually selected at least one holiday
  const isCalculateDisabled = selectionMode === "user"
    ? (isLoadingHolidays || isCalculating || !hasManualHolidays)
    : (isLoadingHolidays || isCalculating || !hasHolidays)

  const shouldShowCalculateTooltip = selectionMode === "user"
    ? (!hasManualHolidays && !isLoadingHolidays && !isCalculating)
    : (!hasHolidays && !isLoadingHolidays && !isCalculating)

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

    const cachedHolidayData = readHolidayCache(currentCountry, currentYear, selectedLocation, selectedTypes)
    if (cachedHolidayData) {
      applyHolidayData(cachedHolidayData)
      const count = Object.keys(cachedHolidayData.labels).length
      const locationName = selectedLocation ? getLocationName(selectedLocation) : null
      const typesDesc = selectedTypes.length > 0 && selectedTypes.length < HOLIDAY_TYPES.length
        ? ` (${getSelectedTypesDisplay(selectedTypes)})`
        : ''
      setStatusMessage(
        count
          ? `Loaded ${count} holiday${count === 1 ? "" : "s"} for ${
              getCountryName(currentCountry)
            }${locationName ? ` (${locationName})` : ''} ${currentYear}${typesDesc}.`
          : `No holidays found for ${getCountryName(currentCountry)}${
              locationName ? ` (${locationName})` : ''
            } ${currentYear}${typesDesc}.`
      )
      return
    }

    const controller = new AbortController()
    holidayFetchControllerRef.current = controller
    holidayFetchCancelledRef.current = false
    setIsLoadingHolidays(true)
    const locationName = selectedLocation ? getLocationName(selectedLocation) : null
    setLoadingMessage(
      `Fetching holidays for ${getCountryName(currentCountry)}${
        locationName ? ` (${locationName})` : ''
      } ${currentYear}...`
    )

    const load = async () => {
      try {
        const data = await fetchHolidayData(currentCountry, currentYear, controller.signal, selectedLocation, selectedTypes)
        if (holidayFetchCancelledRef.current) {
          return
        }

        applyHolidayData(data)
        writeHolidayCache(currentCountry, currentYear, data, selectedLocation, selectedTypes)

        const count = Object.keys(data.labels).length
        const locationName = selectedLocation ? getLocationName(selectedLocation) : null
        const typesDesc = selectedTypes.length > 0 && selectedTypes.length < HOLIDAY_TYPES.length
          ? ` (${getSelectedTypesDisplay(selectedTypes)})`
          : ''
        setStatusMessage(
          count
            ? `Loaded ${count} holiday${count === 1 ? "" : "s"} for ${getCountryName(currentCountry)}${
                locationName ? ` (${locationName})` : ''
              } ${currentYear}${typesDesc}.`
            : `No holidays found for ${getCountryName(currentCountry)}${
                locationName ? ` (${locationName})` : ''
              } ${currentYear}${typesDesc}.`
        )
      } catch (error) {
        if ((error as Error)?.name === "AbortError" || holidayFetchCancelledRef.current) {
          return
        }

        console.error("Failed to fetch holidays", error)
        const locationName = selectedLocation ? getLocationName(selectedLocation) : null
        setStatusMessage(
          `Unable to fetch holidays for ${getCountryName(currentCountry)}${
            locationName ? ` (${locationName})` : ''
          } ${currentYear}.`
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
  }, [applyHolidayData, cancelHolidayFetch, currentCountry, currentYear, selectedLocation, selectedTypes, forceHolidayReload])

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

  const handleSelectionModeChange = (mode: "auto" | "user") => {
    setSelectionMode(mode)
    setModeHoverOpen(false)

    // Save selection mode to localStorage
    try {
      localStorage.setItem(LAST_SELECTION_MODE_KEY, mode)
    } catch (e) {
      console.error('Failed to save selection mode', e)
    }

    // Clear manual selections when switching modes, but keep API holidays
    manualSelectionRef.current = []
    setManualSelectedDates([])

    const autoDates = Array.from(autoHolidayKeysRef.current)
      .map(parseDateKeyToDate)
      .filter((date): date is Date => Boolean(date))
      .filter((date) => date.getFullYear() === currentYear)

    setSelectedDates(autoDates)
    setChainResultsByMonth({})
    setAllChainsByMonth({})
    setSelectedChainIndexByMonth({})

    // If switching to auto mode, trigger calculate chain (same as clicking Calculate Chain button)
    if (mode === "auto") {
      // Check if holidays need to be loaded first
      if (autoHolidayKeysRef.current.size === 0) {
        // Force holiday reload by incrementing the reload counter
        setForceHolidayReload(prev => prev + 1)
        setStatusMessage("Loading public holidays...")
      } else if (autoDates.length > 0) {
        // Only trigger calculation if we have holidays loaded
        setTimeout(() => {
          handleCalculateChain("auto")
        }, 100) // Increase timeout to ensure state has updated
      } else {
        // No holidays for current year, but we have some in the ref
        setStatusMessage("No holidays available for current year. Please wait for holidays to load.")
      }
    }
  }

  const handleClearAll = () => {
    resetSelections(true) // Pass true to clear public holidays as well
    setClearHoverOpen(false)
    // Switch to user mode after clearing everything
    setSelectionMode("user")
  }

  const handleClearSelection = () => {
    // Clear only the calculated chains, keep user selections
    setChainResultsByMonth({})
    setAllChainsByMonth({})
    setSelectedChainIndexByMonth({})
    setClearHoverOpen(false)

    // Clear saved chain state
    try {
      localStorage.removeItem(CHAIN_STATE_KEY)
    } catch (e) {
      console.error('Failed to clear chain state', e)
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
    const chains = allChainsByMonth[monthKey]
    if (!chains || !chains[chainIndex]) return

    const selectedChain = chains[chainIndex]

    // Update dropdown selection for all months containing this chain
    const nextSelectedIndexes = { ...selectedChainIndexByMonth }
    selectedChain.monthKeys.forEach((key) => {
      const monthChains = allChainsByMonth[key]
      if (monthChains) {
        const idx = monthChains.findIndex(c => c.id === selectedChain.id)
        if (idx >= 0) {
          nextSelectedIndexes[key] = idx
        }
      }
    })
    setSelectedChainIndexByMonth(nextSelectedIndexes)

    // Update chainResultsByMonth with the selected chain for ALL its months
    const nextChainResults = { ...chainResultsByMonth }
    selectedChain.monthKeys.forEach((key) => {
      nextChainResults[key] = {
        longest: {
          dates: selectedChain.dates,
          leaveDays: selectedChain.leaveDates,
          totalDays: selectedChain.length,
          start: selectedChain.start,
          end: selectedChain.end,
        },
        shortest: null,
      }
    })
    setChainResultsByMonth(nextChainResults)

    // Save updated state to localStorage
    try {
      const chainState = {
        allChainsByMonth,
        selectedChainIndexByMonth: nextSelectedIndexes,
        chainResultsByMonth: nextChainResults,
        chainMode,
        userLeaveDays,
        country: currentCountry,
        year: currentYear,
      }
      localStorage.setItem(CHAIN_STATE_KEY, JSON.stringify(chainState))
    } catch (e) {
      console.error('Failed to save chain state', e)
    }
  }

  const handleCalculateChain = (modeOverride?: "auto" | "user") => {
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

    const selectionModeOverride = modeOverride ?? selectionMode

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

    // Determine which dates to use for calculation based on mode and context:
    // - Auto mode: Always use all public holidays
    // - User mode:
    //   - If public holidays cleared (Clear Everything clicked): Use only manual selections
    //   - If public holidays still loaded: Use both public holidays AND manual selections
    const datesForCalculation = selectionModeOverride === "user"
      ? autoHolidayKeysRef.current.size === 0
        ? manualSelectedDates.map((date) => new Date(date)) // Only manual selections if PH cleared
        : uniqueDates([
            ...manualSelectedDates,
            ...Array.from(autoHolidayKeysRef.current)
              .map(parseDateKeyToDate)
              .filter((date): date is Date => Boolean(date))
          ]).map((date) => new Date(date)) // Combine manual and public holidays
      : normalizedSelection.map((date) => new Date(date)) // Auto mode: all public holidays

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
        holidayDates: datesForCalculation,
        maxLeavesPerMonth: effectiveLeaves,
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

      // Update chainResultsByMonth - show all first chains (overlaps allowed)
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

      // Save chain state to localStorage
      try {
        const chainState = {
          allChainsByMonth: chainsByMonth,
          selectedChainIndexByMonth: selectedIndexes,
          chainResultsByMonth: updates,
          chainMode,
          userLeaveDays,
          selectionMode: selectionModeOverride,
          country: currentCountry,
          year: currentYear,
        }
        localStorage.setItem(CHAIN_STATE_KEY, JSON.stringify(chainState))
      } catch (e) {
        console.error('Failed to save chain state', e)
      }

      // Only show message if no chains were found
      setStatusMessage(Object.keys(chainsByMonth).length === 0 ? "No chains found." : null)
    }, CALCULATION_DELAY_MS)

    hideTimeoutRef.current = window.setTimeout(() => {
      hideTimeoutRef.current = null
      setIsCalculating(false)
    }, SPINNER_DURATION_MS)
  }

  // Restore chain state on initial mount only
  useEffect(() => {
    // Only restore on initial mount, not when country/year changes
    if (!isInitialMount.current) {
      return
    }

    isInitialMount.current = false

    try {
      const savedState = localStorage.getItem(CHAIN_STATE_KEY)
      if (savedState) {
        const parsed = JSON.parse(savedState)
        // Only restore if it matches current country/year/selectionMode
        if (parsed.country === currentCountry && parsed.year === currentYear && parsed.selectionMode === selectionMode) {
          // Convert date strings back to Date objects
          if (parsed.allChainsByMonth) {
            const restoredAllChains: Record<string, HolidayChainResult[]> = {}
            Object.entries(parsed.allChainsByMonth).forEach(([monthKey, chains]: [string, any]) => {
              restoredAllChains[monthKey] = chains.map((chain: any) => ({
                ...chain,
                start: new Date(chain.start),
                end: new Date(chain.end),
                dates: chain.dates.map((d: string) => new Date(d)),
                leaveDates: chain.leaveDates.map((d: string) => new Date(d)),
              }))
            })
            setAllChainsByMonth(restoredAllChains)
          }

          if (parsed.selectedChainIndexByMonth) setSelectedChainIndexByMonth(parsed.selectedChainIndexByMonth)

          if (parsed.chainResultsByMonth) {
            const restoredChainResults: Record<string, { longest: ChainResult | null; shortest: ChainResult | null }> = {}
            Object.entries(parsed.chainResultsByMonth).forEach(([monthKey, result]: [string, any]) => {
              if (result.longest) {
                restoredChainResults[monthKey] = {
                  longest: {
                    ...result.longest,
                    start: new Date(result.longest.start),
                    end: new Date(result.longest.end),
                    dates: result.longest.dates.map((d: string) => new Date(d)),
                    leaveDays: result.longest.leaveDays.map((d: string) => new Date(d)),
                  },
                  shortest: result.shortest ? {
                    ...result.shortest,
                    start: new Date(result.shortest.start),
                    end: new Date(result.shortest.end),
                    dates: result.shortest.dates.map((d: string) => new Date(d)),
                    leaveDays: result.shortest.leaveDays.map((d: string) => new Date(d)),
                  } : null,
                }
              }
            })
            setChainResultsByMonth(restoredChainResults)
          }

          if (parsed.chainMode) setChainMode(parsed.chainMode)
          if (parsed.userLeaveDays) setUserLeaveDays(parsed.userLeaveDays)
        }
      }
    } catch (e) {
      console.error('Failed to restore chain state', e)
    }
  }, [currentCountry, currentYear, selectionMode])

  useEffect(() => {
    return () => {
      if (computeTimeoutRef.current) {
        clearTimeout(computeTimeoutRef.current)
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
      if (ctrlClickHintTimeoutRef.current) {
        clearTimeout(ctrlClickHintTimeoutRef.current)
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
      <div className="h-screen flex flex-col overflow-hidden scrollbar-hidden">
        <div
          ref={headerRef}
          className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 transition-colors p-4"
        >
          <div className="container mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <h1 className="text-2xl font-bold">Holiday Calendar</h1>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <Select
                value={currentCountry}
                onValueChange={(value) => handleCountryChange(value as CountryCode)}
              >
                <SelectTrigger id="country-select" className="w-52 rounded-none">
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent className="max-h-64 rounded-none">
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Location/State dropdown - only show if country has states */}
              {hasStates(currentCountry) && (
                <Select
                  value={selectedLocation || "all"}
                  onValueChange={(value) => handleLocationChange(value === "all" ? null : value)}
                >
                  <SelectTrigger id="location-select" className="w-48 rounded-none">
                    <SelectValue placeholder="All Locations" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64 rounded-none">
                    <SelectItem value="all">All Locations</SelectItem>
                    {getStatesForCountry(currentCountry).map((state) => (
                      <SelectItem key={state.code} value={state.code}>
                        {state.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select
                value={String(currentYear)}
                onValueChange={(value) => {
                  const parsedYear = Number(value)
                  if (!Number.isNaN(parsedYear)) {
                    handleYearChange(parsedYear)
                  }
                }}
              >
                <SelectTrigger id="year-select" className="w-32 rounded-none">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent align="center" className="rounded-none">
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Holiday Types multi-select dropdown */}
              <DropdownMenu open={typesDropdownOpen} onOpenChange={handleTypesDropdownOpenChange}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-48 rounded-none h-9 px-3 py-2 text-sm border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground justify-between font-normal"
                  >
                    <span className="truncate">{getSelectedTypesDisplay(selectedTypes)}</span>
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 15 15"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 opacity-50"
                    >
                      <path
                        d="M4.93179 5.43179C4.75605 5.60753 4.75605 5.89245 4.93179 6.06819C5.10753 6.24392 5.39245 6.24392 5.56819 6.06819L7.49999 4.13638L9.43179 6.06819C9.60753 6.24392 9.89245 6.24392 10.0682 6.06819C10.2439 5.89245 10.2439 5.60753 10.0682 5.43179L7.81819 3.18179C7.73379 3.0974 7.61933 3.04999 7.49999 3.04999C7.38064 3.04999 7.26618 3.0974 7.18179 3.18179L4.93179 5.43179ZM10.0682 9.56819C10.2439 9.39245 10.2439 9.10753 10.0682 8.93179C9.89245 8.75606 9.60753 8.75606 9.43179 8.93179L7.49999 10.8636L5.56819 8.93179C5.39245 8.75606 5.10753 8.75606 4.93179 8.93179C4.75605 9.10753 4.75605 9.39245 4.93179 9.56819L7.18179 11.8182C7.26618 11.9026 7.38064 11.95 7.49999 11.95C7.61933 11.95 7.73379 11.9026 7.81819 11.8182L10.0682 9.56819Z"
                        fill="currentColor"
                        fillRule="evenodd"
                        clipRule="evenodd"
                      ></path>
                    </svg>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 rounded-none p-0">
                  <div className="max-h-64 overflow-y-auto p-1">
                    {HOLIDAY_TYPES.map((type) => {
                      const isSelected = tempTypes.includes(type.value)
                      return (
                        <DropdownMenuItem
                          key={type.value}
                          onSelect={(e) => {
                            e.preventDefault()
                          }}
                          onClick={(e) => {
                            e.preventDefault()
                            const newTypes = isSelected
                              ? tempTypes.filter((t) => t !== type.value)
                              : [...tempTypes, type.value]
                            setTempTypes(newTypes)
                          }}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="cursor-pointer w-4 h-4 rounded-none border-2 border-input bg-background checked:bg-foreground checked:border-foreground dark:checked:bg-white dark:checked:border-white appearance-none relative checked:after:content-['✓'] checked:after:absolute checked:after:top-1/2 checked:after:left-1/2 checked:after:-translate-x-1/2 checked:after:-translate-y-1/2 checked:after:text-background dark:checked:after:text-black checked:after:text-xs checked:after:font-bold pointer-events-none"
                          />
                          <div className="flex flex-col">
                            <span className="font-medium">{type.label}</span>
                            <span className="text-xs text-muted-foreground">{type.description}</span>
                          </div>
                        </DropdownMenuItem>
                      )
                    })}
                  </div>
                  <div className="border-t p-2 flex gap-2 bg-background">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTypesClear}
                      className="flex-1 rounded-none"
                    >
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleTypesApply}
                      className="flex-1 rounded-none"
                    >
                      Apply
                    </Button>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" data-testid="mode-dropdown" className="rounded-none">
                    {chainMode === "optimal" ? "Optimal" : `User (${userLeaveDays ?? "?"} days)`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[280px] rounded-none">
                  <DropdownMenuItem
                    data-testid="optimal-mode-item"
                    onClick={() => handleModeChange("optimal")}
                    className="flex flex-col items-start gap-1"
                  >
                    <div className="font-medium">Optimal</div>
                    <div className="text-xs text-muted-foreground">Find the longest holiday using 2 leave days</div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="user-mode-item"
                    onClick={() => handleModeChange("user-total")}
                    className="flex flex-col items-start gap-1"
                  >
                    <div className="font-medium">Custom</div>
                    <div className="text-xs text-muted-foreground">Choose your own number of leave days</div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex pointer-events-auto">
                    <Button
                      variant="default"
                      onClick={() => handleCalculateChain()}
                      disabled={isCalculateDisabled}
                      data-testid="calculate-chain-button"
                      className="rounded-none"
                    >
                      Calculate Chain
                    </Button>
                  </span>
                </TooltipTrigger>
                {shouldShowCalculateTooltip && (
                  <TooltipContent>
                    <p>
                      {selectionMode === "user"
                        ? "Please mark at least one holiday manually to calculate chains."
                        : "Please wait for holidays to load before calculating chains."}
                    </p>
                  </TooltipContent>
                )}
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSearchOpen(true)}
                    className="rounded-none"
                  >
                    <Search className="h-[1.2rem] w-[1.2rem]" />
                    <span className="sr-only">Search holidays</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Search holidays (⌘K)</p>
                </TooltipContent>
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
              className="rounded-none"
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
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle>Custom Mode Configuration</DialogTitle>
            <DialogDescription>
              Enter the total number of consecutive days you want to use (1-15 days).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Input
                type="number"
                min="1"
                max="15"
                placeholder="Enter consecutive days"
                value={dialogInput}
                onChange={(e) => setDialogInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleDialogCalculate()
                  }
                }}
                data-testid="leave-days-input"
                className="rounded-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
              className="rounded-none"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDialogCalculate}
              data-testid="dialog-calculate-button"
              className="rounded-none"
            >
              Set Mode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen} className="rounded-none">
        <CommandInput placeholder="Search holidays..." />
        <CommandList className="scrollbar-hidden">
          <CommandEmpty>No holidays found.</CommandEmpty>
          <CommandGroup heading="Holidays">
            {Object.entries(holidayDescriptions).map(([key, labels]) => {
              const date = parseDateKeyToDate(key)
              if (!date) return null

              const dateStr = date.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })

              return labels.map((label, idx) => (
                <CommandItem
                  key={`${key}-${idx}`}
                  value={`${label} ${dateStr}`}
                  onSelect={() => handleSearchSelect(key, label)}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">{dateStr}</span>
                  </div>
                </CommandItem>
              ))
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* Fixed mode selection button at bottom of screen */}
      <HoverCard open={modeHoverOpen} onOpenChange={setModeHoverOpen}>
        <HoverCardTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="fixed bottom-6 right-20 z-50 h-12 w-12 rounded-none border-2 shadow-lg hover:bg-accent"
            aria-label="Selection mode settings"
          >
            {selectionMode === "auto" ? (
              <Sparkles className="h-6 w-6" />
            ) : (
              <User className="h-6 w-6" />
            )}
          </Button>
        </HoverCardTrigger>
        <HoverCardContent
          className="w-64 rounded-none"
          side="top"
          sideOffset={10}
          align="end"
        >
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Selection Mode</h4>
            <div className="space-y-2">
              <button
                onClick={() => handleSelectionModeChange("auto")}
                className={`w-full text-left rounded-none px-3 py-2 text-sm transition-colors ${
                  selectionMode === "auto"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <div className="flex-1">
                    <div className="font-medium">Auto Mode</div>
                    <div className="text-xs opacity-80">
                      Public holidays only. Calculate chains with Optimal or Custom days.
                    </div>
                  </div>
                  {selectionMode === "auto" && <span className="text-xs">✓</span>}
                </div>
              </button>
              <button
                onClick={() => handleSelectionModeChange("user")}
                className={`w-full text-left rounded-none px-3 py-2 text-sm transition-colors ${
                  selectionMode === "user"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <div className="flex-1">
                    <div className="font-medium">User Mode</div>
                    <div className="text-xs opacity-80">
                      Manually mark any day as holiday. Full control over selections.
                    </div>
                  </div>
                  {selectionMode === "user" && <span className="text-xs">✓</span>}
                </div>
              </button>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>

      {/* Fixed clear button at bottom of screen */}
      <HoverCard open={clearHoverOpen} onOpenChange={setClearHoverOpen}>
        <HoverCardTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-none border-2 shadow-lg hover:bg-accent"
            aria-label="Clear options"
          >
            <Trash2 className="h-6 w-6" />
          </Button>
        </HoverCardTrigger>
        <HoverCardContent
          className="w-64 rounded-none"
          side="top"
          sideOffset={10}
          align="end"
        >
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Clear Options</h4>
            <div className="space-y-2">
              {/* Only show "Clear Everything" in User mode */}
              {selectionMode === "user" && (
                <button
                  onClick={handleClearAll}
                  className="w-full text-left rounded-none px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    <div className="flex-1">
                      <div className="font-medium">Clear Everything</div>
                      <div className="text-xs opacity-80">
                        Clear all holidays including public holidays and chains
                      </div>
                    </div>
                  </div>
                </button>
              )}
              <button
                onClick={handleClearSelection}
                disabled={!hasChains}
                className="w-full text-left rounded-none px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <div className="flex items-center gap-2">
                  <Eraser className="h-4 w-4" />
                  <div className="flex-1">
                    <div className="font-medium">Clear Chain</div>
                    <div className="text-xs opacity-80">
                      {hasChains
                        ? "Clear calculated chains, keep your holiday selections"
                        : "No chains to clear"}
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>

      {/* Ctrl+Click hint banner - fixed at bottom left */}
      {showCtrlClickHint && (
        <div
          className="fixed z-50 border-2 shadow-lg animate-in fade-in slide-in-from-bottom-5 duration-300"
          style={{
            left: 'clamp(1.25rem, 4vw, 2.5rem)',
            bottom: 'clamp(1rem, 3vw, 2rem)',
            padding: 'clamp(0.65rem, 1.5vw, 0.9rem) clamp(0.8rem, 2vw, 1.4rem)',
            fontSize: '0.8rem',
            textAlign: 'left',
            color: 'color-mix(in srgb, var(--muted-foreground) 80%, var(--foreground) 20%)',
            background: 'color-mix(in srgb, var(--background) 92%, var(--muted) 8%)',
            backdropFilter: 'blur(6px)',
            borderRadius: '0',
            maxWidth: 'min(24rem, 80%)',
            lineHeight: '1.45',
          }}
        >
          <strong>Pro Tip:</strong> Hold <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-muted rounded">Ctrl</kbd> (or{" "}
          <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-muted rounded">⌘</kbd>) and click another date to select all dates in between!
        </div>
      )}
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

  const handleDayClick: DayClickEventHandler = useCallback((day, modifiers, e) => {
    onDayClick?.(day, modifiers, e)
  }, [onDayClick])

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
            <HoverCard openDelay={100} closeDelay={200}>
              <HoverCardTrigger asChild>
                <div>
                  <Calendar
                    mode="multiple"
                    selected={normalizedSelection}
                    onSelect={handleSelect}
                    onDayClick={handleDayClick}
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
              </HoverCardTrigger>
              <HoverCardContent
                className="w-80"
                data-testid={`month-hover-card-${monthKey}`}
                side="right"
                sideOffset={5}
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
                          }}
                          className={`w-full text-left rounded-none px-2 py-1.5 text-sm transition-colors ${
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


