import { useEffect, useState, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { Skeleton } from "@/components/ui/skeleton"
import { ThemeProvider } from "@/components/theme-provider"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ChevronLeftIcon, Plane } from "lucide-react"
import { format, getDay } from "date-fns"
import { AirlineLogo } from "@/components/ui/airline-logo";

interface FlightSegment {
  departureAirportCode: string
  departureAirportName: string
  arrivalAirportName: string
  arrivalAirportCode: string
  durationMinutes: number
  departureTime: string
  arrivalTime: string
  cabinClass: number
  airline: {
    airlineCode: string
    flightNumber: string
    airlineName: string
  }
  departureDate: string
  arrivalDate: string
  aircraftName?: string
}

interface FlightOption {
  price: number
  airlineCode: string
  airlineNames: string[]
  segments: FlightSegment[]
  departureAirportCode: string
  departureDate: string
  departureTime: string
  arrivalAirportCode: string
  arrivalDate: string
  arrivalTime: string
  duration: number
  stops: number | null
}

interface GoogleFlightsApiResponse {
  status: boolean
  message: string
  data: {
    topFlights: FlightOption[]
    otherFlights: FlightOption[]
  }
}

interface ProcessedFlight {
  airline: string
  airlineCode: string
  flightNumber: string
  scheduledDepartureTime: string
  scheduledArrivalTime: string
  duration: number
  departureAirportName: string
  arrivalAirportName: string
  departureAirportCode: string
  arrivalAirportCode: string
  price?: number
  stops: number
  segments: FlightSegment[]
  totalDuration: number
}

// Cache for flight search results
const flightCache = new Map<string, { data: ProcessedFlight[], timestamp: number }>()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export function ItineraryPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [flights, setFlights] = useState<ProcessedFlight[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false) // State to track if a search has been performed
  const abortControllerRef = useRef<AbortController | null>(null)

  const departure = searchParams.get("departure")
  const arrival = searchParams.get("arrival")
  const outbound = searchParams.get("outbound")
  const returnDate = searchParams.get("return")
  const passengers = searchParams.get("passengers") || "1"
  const travelClassCode = searchParams.get("class") || "1"

  // Map numeric class codes to display names
  const getTravelClassName = (code: string) => {
    const classMap: Record<string, string> = {
      "1": "Economy",
      "2": "Premium Economy",
      "3": "Business",
      "4": "First Class",
    }
    return classMap[code] || "Economy"
  }

  // Get day of week from date
  const getDayName = (dateString: string) => {
    const dayIndex = getDay(new Date(dateString))
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    return days[dayIndex]
  }

  // Calculate flight duration from minutes
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours} hr ${mins} min`
  }

  // Format time from datetime string
  const formatTime = (datetime: string) => {
    try {
      // Extract time from datetime string (format: "2024-10-14 12:30")
      const timePart = datetime.split(' ')[1] || datetime
      return timePart
    } catch {
      return datetime
    }
  }

  // Calculate layover duration between two segments
  const calculateLayover = (arrivalTime: string, departureTime: string, arrivalDate: string, departureDate: string) => {
    try {
      const arrival = new Date(`${arrivalDate} ${arrivalTime}`)
      const departure = new Date(`${departureDate} ${departureTime}`)
      const diffMinutes = Math.floor((departure.getTime() - arrival.getTime()) / (1000 * 60))
      const hours = Math.floor(diffMinutes / 60)
      const mins = diffMinutes % 60
      return `${hours} hr ${mins} min`
    } catch {
      return ''
    }
  }

  useEffect(() => {
    const fetchFlights = async () => {
      if (!departure || !arrival || !outbound) {
        setError("Missing required search parameters")
        setIsLoading(false)
        return
      }

      // Create cache key from search parameters
      const cacheKey = `${departure}-${arrival}-${outbound}-${passengers}-${travelClassCode}`

      // Check if we have cached data
      const cachedData = flightCache.get(cacheKey)
      if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
        console.log("Using cached flight data")
        setFlights(cachedData.data)
        setIsLoading(false)
        setHasSearched(true)
        return
      }

      // Set loading state only when we need to fetch
      setIsLoading(true)
      setError(null)
      setHasSearched(false) // Reset search status on new fetch

      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      // Create new abort controller for this request
      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        console.log("Searching flights:", { departure, arrival, outbound, passengers, travelClassCode })

        // Build URL with parameters
        const params = new URLSearchParams({
          departureId: departure,
          arrivalId: arrival,
          departureDate: outbound,
          currency: "INR",
          adults: passengers,
          cabinClass: travelClassCode,
          sort: "1", // Top flights
          stops: "0", // Any number of stops
        })

        const apiKey = import.meta.env.VITE_RAPIDAPI_KEY || "11600a4995msh82f29c80858d25dp11bdd9jsn8c3a51676c7b"
        const url = `https://flights-sky.p.rapidapi.com/google/flights/search-one-way?${params.toString()}`

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "x-rapidapi-key": apiKey,
            "x-rapidapi-host": "flights-sky.p.rapidapi.com",
          },
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch flights: ${response.statusText}`)
        }

        const data: GoogleFlightsApiResponse = await response.json()
        console.log("API Response:", data)

        if (!data.status || !data.data) {
          throw new Error("No flight data available")
        }

        // Process and flatten flights from both topFlights and otherFlights
        const allFlightOptions = [
          ...(data.data.topFlights || []),
          ...(data.data.otherFlights || []),
        ]

        const processedFlights: ProcessedFlight[] = allFlightOptions.map((option) => {
          const firstSegment = option.segments[0]
          const lastSegment = option.segments[option.segments.length - 1]
          const stopsCount = option.stops !== null ? option.stops : Math.max(0, option.segments.length - 1)

          return {
            airline: firstSegment.airline.airlineName,
            airlineCode: firstSegment.airline.airlineCode,
            flightNumber: firstSegment.airline.flightNumber,
            scheduledDepartureTime: formatTime(option.departureTime || firstSegment.departureTime),
            scheduledArrivalTime: formatTime(option.arrivalTime || lastSegment.arrivalTime),
            duration: firstSegment.durationMinutes,
            departureAirportName: firstSegment.departureAirportName,
            arrivalAirportName: lastSegment.arrivalAirportName,
            departureAirportCode: firstSegment.departureAirportCode,
            arrivalAirportCode: lastSegment.arrivalAirportCode,
            price: option.price,
            stops: stopsCount,
            segments: option.segments,
            totalDuration: option.duration,
          }
        })

        setFlights(processedFlights)

        // Store in cache
        flightCache.set(cacheKey, {
          data: processedFlights,
          timestamp: Date.now()
        })
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') {
          console.log("Request was cancelled")
          return
        }
        console.error("Error fetching flights:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch flight data")
      } finally {
        setIsLoading(false)
        setHasSearched(true) // Mark search as complete
      }
    }

    fetchFlights()

    // Cleanup function to cancel request on unmount or dependency change
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [departure, arrival, outbound, passengers, travelClassCode])

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <div className="container mx-auto flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                onClick={() => navigate(-1)}
                aria-label="Back"
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
              <div>
                <h1 className="text-xl font-semibold md:text-2xl">Flight Results</h1>
                {departure && arrival && (
                  <p className="text-sm text-muted-foreground">
                    {departure} → {arrival}
                    {outbound && (
                      <>
                        {" • "}
                        {format(new Date(outbound), "MMM d, yyyy")}
                        {returnDate && <> - {format(new Date(returnDate), "MMM d, yyyy")}</>}
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
            <ModeToggle />
          </div>
        </header>

        <main className="container mx-auto flex-1 px-4 py-6">
          <div className="space-y-6">
            {/* Search Summary */}
            <div className="border border-border bg-muted/50 p-6">
              <h2 className="mb-4 text-lg font-semibold">Flight Search Summary</h2>
              <div className="grid gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Route:</span>
                  <span className="font-semibold">{departure} → {arrival}</span>
                </div>
                {outbound && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Departure:</span>
                    <span className="font-semibold">
                      {format(new Date(outbound), "MMM d, yyyy")} ({getDayName(outbound)})
                    </span>
                  </div>
                )}
                {returnDate && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Return:</span>
                    <span className="font-semibold">{format(new Date(returnDate), "MMM d, yyyy")}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Passengers:</span>
                  <span className="font-semibold">{passengers}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Class:</span>
                  <span className="font-semibold">{getTravelClassName(travelClassCode)}</span>
                </div>
              </div>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="space-y-0">
                {[...Array(5)].map((_, index) => (
                  <div
                    key={index}
                    className="border border-border bg-background p-6"
                  >
                    <div className="flex items-center gap-8">
                      {/* Airline Logo Skeleton */}
                      <div className="flex items-center gap-4 min-w-[180px]">
                        <Skeleton className="h-10 w-10 rounded-none" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>

                      {/* Duration Skeleton */}
                      <div className="space-y-2 min-w-[140px]">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-3 w-24" />
                      </div>

                      {/* Stops Skeleton */}
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-3 w-20" />
                      </div>

                      {/* Price Skeleton */}
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-6 w-20" />
                        <Skeleton className="h-8 w-24" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <div className="border border-destructive bg-destructive/10 p-6 text-center">
                  <p className="text-destructive">{error}</p>
                  <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
                    Go Back
                  </Button>
                </div>
              </div>
            )}

            {/* Flight Results */}
            {!isLoading && !error && flights.length > 0 && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Available Flights</h2>
                  <span className="text-sm text-muted-foreground">{flights.length} flight(s) found</span>
                </div>
                <Accordion type="single" collapsible className="space-y-0">
                  {flights.map((flight, index) => {
                    const totalDuration = formatDuration(flight.totalDuration)
                    const stopsText = flight.stops === 0 ? "Nonstop" : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`
                    const layoverAirport = flight.stops > 0 && flight.segments.length > 1
                      ? flight.segments[0].arrivalAirportCode
                      : null

                    return (
                      <AccordionItem
                        key={index}
                        value={`flight-${index}`}
                        className="border border-border bg-background hover:border-primary transition-colors"
                      >
                        <AccordionTrigger className="px-6 py-4 hover:no-underline">
                          <div className="flex flex-1 items-center gap-8 pr-2">
                            {/* Time and Airline */}
                            <div className="flex items-center gap-4 min-w-[180px]">
                              <AirlineLogo
                                airlineCode={flight.airlineCode}
                                airlineName={flight.airline}
                                className="h-10 w-10"
                              />
                              <div className="text-left flex-1">
                                <div className="text-base font-medium">
                                  {flight.scheduledDepartureTime} – {flight.scheduledArrivalTime}
                                </div>
                                <div className="text-xs text-muted-foreground">{flight.airline}</div>
                              </div>
                            </div>

                            {/* Duration */}
                            <div className="flex flex-col items-start min-w-[140px]">
                              <span className="text-sm font-medium">{totalDuration}</span>
                              <span className="text-xs text-muted-foreground">
                                {departure} – {arrival}
                              </span>
                            </div>

                            {/* Stops Badge */}
                            <div className="flex-1 flex flex-col items-start">
                              <span className="text-sm font-medium">{stopsText}</span>
                              {layoverAirport && (
                                <span className="text-xs text-muted-foreground">
                                  {layoverAirport}
                                </span>
                              )}
                            </div>

                            {/* Select Button */}
                            <div className="flex items-center gap-2">
                              {flight.price && (
                                <span className="text-lg font-semibold mr-2">₹{flight.price.toLocaleString('en-IN')}</span>
                              )}
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  console.log("Selected flight:", flight)
                                }}
                              >
                                Select
                              </Button>
                            </div>
                          </div>
                        </AccordionTrigger>

                        <AccordionContent className="px-6 pb-4">
                          <div className="space-y-4 pt-2 pl-14">
                            {flight.segments.map((segment, segmentIdx) => (
                              <div key={segmentIdx}>
                                {/* Departure Details */}
                                <div className="flex items-start gap-4">
                                  <div className="flex flex-col items-center">
                                    <div className="flex h-3 w-3 items-center justify-center rounded-full border-2 border-foreground" />
                                    <div className="h-16 w-0.5 bg-border" />
                                  </div>
                                  <div className="flex-1 space-y-1">
                                    <div className="flex items-baseline gap-2">
                                      <span className="text-base font-semibold">{formatTime(segment.departureTime)}</span>
                                      <span className="text-sm">
                                        {segment.departureAirportName} ({segment.departureAirportCode})
                                      </span>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      Travel time: {formatDuration(segment.durationMinutes)}
                                    </div>
                                  </div>
                                </div>

                                {/* Arrival Details */}
                                <div className="flex items-start gap-4">
                                  <div className="flex flex-col items-center">
                                    <div className="flex h-3 w-3 items-center justify-center rounded-full border-2 border-foreground bg-foreground" />
                                    {segmentIdx < flight.segments.length - 1 && (
                                      <div className="h-16 w-0.5 bg-border" />
                                    )}
                                  </div>
                                  <div className="flex-1 space-y-1">
                                    <div className="flex items-baseline gap-2">
                                      <span className="text-base font-semibold">{formatTime(segment.arrivalTime)}</span>
                                      <span className="text-sm">
                                        {segment.arrivalAirportName} ({segment.arrivalAirportCode})
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Flight Details for this segment */}
                                <div className="bg-muted/50 p-3 text-sm border-t border-border mt-2 mb-4 ml-7">
                                  <div className="space-y-1">
                                    <div>
                                      <span className="font-medium">{segment.airline.airlineName}</span>
                                      <span className="text-muted-foreground"> · {getTravelClassName(travelClassCode)}</span>
                                      <span className="text-muted-foreground"> · Flight {segment.airline.flightNumber}</span>
                                    </div>
                                    {segment.aircraftName && (
                                      <div className="text-xs text-muted-foreground">{segment.aircraftName}</div>
                                    )}
                                  </div>
                                </div>

                                {/* Layover Info */}
                                {segmentIdx < flight.segments.length - 1 && (
                                  <div className="flex items-center gap-4 mb-4">
                                    <div className="flex-1 border-2 border-dashed border-muted-foreground/40 px-4 py-3 text-sm ml-7">
                                      <span className="font-medium text-muted-foreground">
                                        {calculateLayover(
                                          segment.arrivalTime,
                                          flight.segments[segmentIdx + 1].departureTime,
                                          segment.arrivalDate,
                                          flight.segments[segmentIdx + 1].departureDate
                                        )} layover · {segment.arrivalAirportName}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}
                </Accordion>
              </div>
            )}

            {/* No Results: Condition updated to check hasSearched */}
            {!isLoading && !error && flights.length === 0 && hasSearched && (
              <div className="flex flex-col items-center justify-center gap-4 py-12 border border-dashed border-border">
                <Plane className="size-16 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-lg font-medium mb-2">No Flights Found</p>
                  <p className="text-sm text-muted-foreground max-w-md">
                    No flights available for this route on {outbound && getDayName(outbound)}. Try a different date or
                    route.
                  </p>
                </div>
                <Button variant="outline" onClick={() => navigate(-1)}>
                  Try Different Search
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>
    </ThemeProvider>
  )
}