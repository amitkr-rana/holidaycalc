import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { ModeToggle } from "@/components/mode-toggle"
import { Spinner } from "@/components/ui/spinner"
import { Skeleton } from "@/components/ui/skeleton"
import { ThemeProvider } from "@/components/theme-provider"
import { getCountryName } from "@/lib/countries"
import type { HolidayCacheData, HolidayDetail } from "@/lib/holiday-service"
import {
  dateKey,
  fetchHolidayData,
  normalizeDate,
  readHolidayCache,
  writeHolidayCache,
} from "@/lib/holiday-service"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

const RAW_PEXELS_SEARCH_URL = (import.meta.env.VITE_PEXELS_SEARCH_URL ?? "").trim()
const PEXELS_SEARCH_ENDPOINT =
  RAW_PEXELS_SEARCH_URL || (import.meta.env.DEV ? "/pexels/v1/search" : "https://api.pexels.com/v1/search")
const PEXELS_API_KEY = (import.meta.env.VITE_PEXELS_API_KEY ?? "").trim()

type LocationState = {
  dateKey?: string
  labels?: string[]
  countryName?: string
  cacheVersion?: number
}

type ImageState =
  | { status: "idle" | "loading" }
  | {
      status: "ready"
      imageUrl: string
      sourcePageUrl: string | null
      photographer?: string | null
      photographerUrl?: string | null
    }
  | {
      status: "error"
      message: string
      sourcePageUrl: string | null
    }

const INITIAL_IMAGE_STATE: ImageState = { status: "idle" }
const monthLabelFormatter = new Intl.DateTimeFormat(undefined, { month: "long"})

export function HolidayDetailPage() {
  const { country, year, month, day } = useParams()
  const location = useLocation()
  const { state } = location as { state?: LocationState }
  const navigate = useNavigate()

  const yearNumber = Number(year)
  const monthNumber = Number(month)
  const dayNumber = Number(day)

  const isValidDate =
    Number.isInteger(yearNumber) &&
    Number.isInteger(monthNumber) &&
    Number.isInteger(dayNumber) &&
    monthNumber >= 1 &&
    monthNumber <= 12 &&
    dayNumber >= 1 &&
    dayNumber <= 31

  const resolvedCountry = (country ?? "").toUpperCase()
  const countryName = getCountryName(resolvedCountry)

  const initialSelectedDate = useMemo(() => {
    if (!isValidDate) return null
    const candidate = new Date(yearNumber, monthNumber - 1, dayNumber)
    return Number.isNaN(candidate.getTime()) ? null : normalizeDate(candidate)
  }, [dayNumber, isValidDate, monthNumber, yearNumber])

  const [activeDate, setActiveDate] = useState<Date | null>(initialSelectedDate)
  const [viewMonth, setViewMonth] = useState<Date | null>(
    initialSelectedDate
      ? new Date(initialSelectedDate.getFullYear(), initialSelectedDate.getMonth(), 1)
      : null
  )
  const [holidayDataByYear, setHolidayDataByYear] = useState<Map<number, HolidayCacheData>>(new Map())
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [imageState, setImageState] = useState<ImageState>(INITIAL_IMAGE_STATE)
  const pexelsRequestsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (initialSelectedDate) {
      setActiveDate(initialSelectedDate)
      setViewMonth(new Date(initialSelectedDate.getFullYear(), initialSelectedDate.getMonth(), 1))
    } else {
      setActiveDate(null)
      setViewMonth(null)
    }
  }, [initialSelectedDate ? initialSelectedDate.getTime() : null])

  const displayMonth = useMemo(() => {
    const base =
      viewMonth ??
      activeDate ??
      initialSelectedDate ??
      new Date(yearNumber, Math.max(0, monthNumber - 1), 1)
    return new Date(base.getFullYear(), base.getMonth(), 1)
  }, [activeDate, initialSelectedDate, monthNumber, viewMonth, yearNumber])

  const targetYear = displayMonth.getFullYear()
  const holidayData = holidayDataByYear.get(targetYear) ?? null
  const holidayDateKeys = useMemo(
    () => new Set(Object.keys(holidayData?.labels ?? {})),
    [holidayData]
  )

  const ensureHolidayData = async (yearToLoad: number, signal?: AbortSignal) => {
    const cached = readHolidayCache(resolvedCountry, yearToLoad)
    if (cached) {
      setHolidayDataByYear((prev) => {
        const next = new Map(prev)
        next.set(yearToLoad, cached)
        return next
      })
      return
    }

    setIsLoading(true)
    setStatusMessage(`Fetching holidays for ${countryName} ${yearToLoad}...`)
    try {
      const data = await fetchHolidayData(resolvedCountry, yearToLoad, signal)
      writeHolidayCache(resolvedCountry, yearToLoad, data)
      setHolidayDataByYear((prev) => {
        const next = new Map(prev)
        next.set(yearToLoad, data)
        return next
      })
      setStatusMessage(null)
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        console.error("Failed to fetch holidays", error)
        setStatusMessage(`Unable to fetch holidays for ${countryName} ${yearToLoad}.`)
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!resolvedCountry) return
    const controller = new AbortController()
    ensureHolidayData(targetYear, controller.signal)
    return () => controller.abort()
  }, [resolvedCountry, targetYear])

  const selectedDateKey = useMemo(() => {
    if (activeDate) {
      return dateKey(activeDate)
    }
    return state?.dateKey ?? ""
  }, [activeDate, state?.dateKey])

  const selectedLabels: string[] = useMemo(() => {
    if (!selectedDateKey || !holidayData) {
      return []
    }
    const labelsFromData = holidayData.labels[selectedDateKey]
    if (labelsFromData && labelsFromData.length) {
      return labelsFromData
    }
    if (state?.labels && state.dateKey === selectedDateKey) {
      return state.labels
    }
    return []
  }, [holidayData, selectedDateKey, state?.dateKey, state?.labels])

  const selectedHolidayDetails: HolidayDetail[] = useMemo(() => {
    if (!holidayData || !selectedDateKey) {
      return []
    }
    return holidayData.details[selectedDateKey] ?? []
  }, [holidayData, selectedDateKey])

  const navigateToDate = (date: Date, labels: string[]) => {
    const normalized = normalizeDate(date)
    const path = `/holiday/${resolvedCountry}/${normalized.getFullYear()}/${String(
      normalized.getMonth() + 1
    ).padStart(2, "0")}/${String(normalized.getDate()).padStart(2, "0")}`

    navigate(path, {
      replace: true,
      state: {
        dateKey: dateKey(normalized),
        labels,
        countryName,
      },
    })
  }

  const selectHolidayForMonth = (monthDate: Date) => {
    if (!holidayData) return
    const monthKey = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
    const matchingKey = Object.keys(holidayData.labels).find((key) => {
      const candidate = new Date(key)
      return (
        candidate.getFullYear() === monthKey.getFullYear() &&
        candidate.getMonth() === monthKey.getMonth()
      )
    })

    if (matchingKey) {
      const candidate = normalizeDate(new Date(matchingKey))
      setActiveDate(candidate)
      const labels = holidayData.labels[matchingKey] ?? []
      navigateToDate(candidate, labels)
    }
  }

  const handleShiftMonth = (delta: number) => {
    const nextMonth = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + delta, 1)
    setViewMonth(nextMonth)
    ensureHolidayData(nextMonth.getFullYear())
    selectHolidayForMonth(nextMonth)
  }

  const handleCalendarSelect = (date?: Date) => {
    if (!date || !holidayData) {
      return
    }
    const normalized = normalizeDate(date)
    const key = dateKey(normalized)
    if (!holidayDateKeys.has(key)) {
      return
    }
    setActiveDate(normalized)
    setViewMonth(new Date(normalized.getFullYear(), normalized.getMonth(), 1))
    const labels = holidayData.labels[key] ?? []
    navigateToDate(normalized, labels)
  }

  useEffect(() => {
    if (!activeDate || !selectedLabels.length) {
      setImageState(INITIAL_IMAGE_STATE)
      return
    }

    const key = `${selectedDateKey}:${selectedLabels[0]}`
    if (pexelsRequestsRef.current.has(key)) {
      return
    }

    const occasion = selectedLabels[0]?.trim() || ""
    // Clean up occasion name: take text before parentheses or slash
    const cleanOccasion = occasion
      .split(/[\(\)\/]/) // Split on parentheses or forward slash
      .map(part => part.trim())
      .filter(Boolean)[0] || occasion // Take first part or fall back to original

    // For country-specific holidays, include country name in search
    const countrySpecificKeywords = [
      'independence day',
      'republic day',
      'national day',
      'liberation day',
      'constitution day',
      'unification day',
      'revolution day',
      'freedom day',
      'founding day',
    ]

    const shouldIncludeCountry = countrySpecificKeywords.some(keyword =>
      cleanOccasion.toLowerCase().includes(keyword)
    )

    const searchQuery = shouldIncludeCountry
      ? `${cleanOccasion} ${countryName}`
      : cleanOccasion
    const fallbackSearchUrl = searchQuery
      ? `https://www.pexels.com/search/${encodeURIComponent(searchQuery)}/`
      : "https://www.pexels.com"

    if (!PEXELS_API_KEY) {
      setImageState({
        status: "error",
        message: "Pexels API key missing. Set VITE_PEXELS_API_KEY to load holiday imagery.",
        sourcePageUrl: fallbackSearchUrl,
      })
      return
    }

    let resolvedEndpoint = PEXELS_SEARCH_ENDPOINT
    if (!/^https?:\/\//i.test(resolvedEndpoint) && typeof window !== "undefined") {
      const prefix = resolvedEndpoint.startsWith("/") ? "" : "/"
      resolvedEndpoint = `${window.location.origin}${prefix}${resolvedEndpoint}`
    }

    let searchUrl: URL
    try {
      searchUrl = new URL(resolvedEndpoint)
    } catch (error) {
      console.error("Invalid Pexels search endpoint provided:", error)
      setImageState({
        status: "error",
        message: "Invalid Pexels search endpoint configuration.",
        sourcePageUrl: fallbackSearchUrl,
      })
      return
    }

    if (searchQuery) {
      searchUrl.searchParams.set("query", searchQuery)
    }
    searchUrl.searchParams.set("per_page", "1")
    searchUrl.searchParams.set("orientation", "landscape")

    setImageState({ status: "loading" })
    pexelsRequestsRef.current.add(key)

    fetch(searchUrl.toString(), {
      headers: {
        Authorization: PEXELS_API_KEY
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Pexels request failed with status ${response.status}`)
        }
        return (await response.json()) as {
          photos?: Array<{
            url?: string
            src?: {
              original?: string
              large2x?: string
              large?: string
            }
            photographer?: string
            photographer_url?: string
          }>
        }
      })
      .then((payload) => {
        const photo = payload?.photos?.[0]
        const src = photo?.src
        const photoUrl =
          (typeof src?.original === "string" && src.original) ||
          (typeof src?.large2x === "string" && src.large2x) ||
          (typeof src?.large === "string" && src.large) ||
          null

        if (!photoUrl) {
          throw new Error(`No image returned by Pexels for query "${searchQuery}".`)
        }

        return new Promise<ImageState>((resolve, reject) => {
          const loader = new Image()
          loader.onload = () => {
            resolve({
              status: "ready",
              imageUrl: photoUrl,
              sourcePageUrl:
                typeof photo?.url === "string" && photo.url.trim().length > 0
                  ? photo.url
                  : fallbackSearchUrl,
              photographer:
                typeof photo?.photographer === "string" && photo.photographer.trim().length > 0
                  ? photo.photographer
                  : null,
              photographerUrl:
                typeof photo?.photographer_url === "string" && photo.photographer_url.trim().length > 0
                  ? photo.photographer_url
                  : null,
            })
          }
          loader.onerror = () => reject(new Error("Failed to preload Pexels image."))
          loader.src = photoUrl
        })
      })
      .then((state) => {
        setImageState(state)
      })
      .catch((error) => {
        console.error("Failed to fetch holiday photo from Pexels", error)
        setImageState({
          status: "error",
          message: "Unable to load holiday photo. View similar shots on Pexels instead.",
          sourcePageUrl: fallbackSearchUrl,
        })
      })
      .finally(() => {
        pexelsRequestsRef.current.delete(key)
      })
  }, [activeDate, countryName, selectedDateKey, selectedLabels, resolvedCountry])

  if (!isValidDate || !activeDate) {
    return (
      <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-2xl font-semibold">Invalid holiday selection</h1>
          <Button onClick={() => navigate("/")}>Back to Calendar</Button>
        </div>
      </ThemeProvider>
    )
  }

  const formattedDate = activeDate.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  const headerLine = [countryName, formattedDate].filter(Boolean).join(" . ")

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <div className="container mx-auto flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  onClick={() => navigate(-1)}
                  aria-label="Back to calendar"
                >
                  <ChevronLeftIcon className="size-4" />
                </Button>
                <h1 className="text-xl font-semibold md:text-2xl">{headerLine}</h1>
              </div>
              {statusMessage && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {isLoading && <Spinner size={16} />}
                  <p>{statusMessage}</p>
                </div>
              )}
            </div>
            <ModeToggle />
          </div>
        </header>

        <main className="container mx-auto flex-1 px-4 py-6">
          <div className="calendar-grid detail-grid">
            <div className="calendar-grid-cell detail-grid-cell detail-grid-cell--calendar">
              <div className="detail-summary">
                <h2 className="detail-title">{selectedLabels[0] ?? "Holiday"}</h2>
                {selectedLabels.length > 1 && (
                  <p className="detail-subtitle">Also: {selectedLabels.slice(1).join(", ")}</p>
                )}
                {selectedHolidayDetails[0]?.description && (
                  <p className="detail-description">{selectedHolidayDetails[0].description}</p>
                )}
              </div>
              <br />
              <div className="detail-calendar-nav">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleShiftMonth(-1)}
                  aria-label="Previous month"
                >
                  <ChevronLeftIcon className="size-4" />
                </Button>
                <span className="detail-calendar-label">{monthLabelFormatter.format(displayMonth)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleShiftMonth(1)}
                  aria-label="Next month"
                >
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>
              <Calendar
                mode="single"
                selected={activeDate ?? undefined}
                month={displayMonth}
                onSelect={handleCalendarSelect}
                classNames={{
                  month_caption: "hidden",
                  caption_label: "hidden",
                }}
                onMonthChange={(monthDate) => {
                  setViewMonth(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1))
                  ensureHolidayData(monthDate.getFullYear())
                }}
                showOutsideDays
                disabled={(date) => !holidayDateKeys.has(dateKey(normalizeDate(date)))}
                className="w-full"
              />
            </div>

            <div className="calendar-grid-cell detail-grid-cell detail-grid-cell--image">
              {imageState.status === "ready" && (
                <figure className="detail-image-figure">
                  <img
                    src={imageState.imageUrl}
                    alt={`Holiday imagery for ${selectedLabels[0] ?? formattedDate}`}
                  />
                  <figcaption className="detail-image-caption">
                    {imageState.photographer ? (
                      <>
                        Photo by{" "}
                        {imageState.photographerUrl ? (
                          <a href={imageState.photographerUrl} target="_blank" rel="noreferrer">
                            {imageState.photographer}
                          </a>
                        ) : (
                          imageState.photographer
                        )}
                      </>
                    ) : (
                      <>Image courtesy of Pexels</>
                    )}
                    {imageState.sourcePageUrl && (
                      <>
                        {" - "}
                        <a href={imageState.sourcePageUrl} target="_blank" rel="noreferrer">
                          View on Pexels
                        </a>
                      </>
                    )}
                  </figcaption>
                </figure>
              )}
              {imageState.status === "loading" && (
                <div className="detail-image-loading" aria-live="polite">
                  <div className="detail-image-loading__stack">
                    <Skeleton className="detail-image-loading__media" />
                    <div className="detail-image-loading__meta">
                      <Skeleton className="detail-image-loading__line" />
                      <Skeleton className="detail-image-loading__line detail-image-loading__line--short" />
                    </div>
                  </div>
                  <span className="sr-only">Fetching holiday photo...</span>
                </div>
              )}
              {imageState.status === "error" && (
                <div className="detail-image-placeholder">
                  <p>{imageState.message}</p>
                  {imageState.sourcePageUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-none"
                      onClick={() => {
                        if (imageState.sourcePageUrl) {
                          window.open(imageState.sourcePageUrl, "_blank", "noopener,noreferrer")
                        }
                      }}
                    >
                      View on Pexels
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </ThemeProvider>
  )
}

