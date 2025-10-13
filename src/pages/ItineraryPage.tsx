import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { Spinner } from "@/components/ui/spinner"
import { ThemeProvider } from "@/components/theme-provider"
import { ChevronLeftIcon, Plane, Clock } from "lucide-react"
import { format } from "date-fns"

interface Flight {
  departure_airport: {
    name: string
    id: string
    time: string
  }
  arrival_airport: {
    name: string
    id: string
    time: string
  }
  duration: number
  airline: string
  airline_logo?: string
  flight_number: string
  travel_class: string
  extensions?: string[]
}

interface FlightOption {
  flights: Flight[]
  total_duration: number
  carbon_emissions?: {
    this_flight: number
    typical_for_this_route: number
    difference_percent: number
  }
  price: number
  type: string
  booking_token?: string
}

interface FlightResults {
  best_flights?: FlightOption[]
  other_flights?: FlightOption[]
  price_insights?: {
    lowest_price: number
    price_level: string
    typical_price_range: [number, number]
  }
}

export function ItineraryPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(true)
  const [flightResults, setFlightResults] = useState<FlightResults | null>(null)
  const [error, setError] = useState<string | null>(null)

  const departure = searchParams.get("departure")
  const arrival = searchParams.get("arrival")
  const outbound = searchParams.get("outbound")
  const returnDate = searchParams.get("return")
  const travelClass = searchParams.get("class") || "1"

  useEffect(() => {
    if (!departure || !arrival || !outbound) {
      setError("Missing required search parameters")
      setIsLoading(false)
      return
    }

    const fetchFlights = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch("/api/flights-search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            departure_id: departure,
            arrival_id: arrival,
            outbound_date: outbound,
            return_date: returnDate,
            currency: "USD",
            travel_class: Number(travelClass),
          }),
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch flights: ${response.statusText}`)
        }

        const data = await response.json()
        setFlightResults(data)
      } catch (err) {
        console.error("Error fetching flights:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch flight data")
      } finally {
        setIsLoading(false)
      }
    }

    fetchFlights()
  }, [departure, arrival, outbound, returnDate, travelClass])

  const getTravelClassName = (classCode: string) => {
    const classes: Record<string, string> = {
      "1": "Economy",
      "2": "Premium Economy",
      "3": "Business",
      "4": "First Class",
    }
    return classes[classCode] || "Economy"
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  const renderFlight = (flight: Flight, index: number) => (
    <div key={index} className="flex items-center justify-between border-b border-border p-4 last:border-0">
      <div className="flex items-center gap-4">
        {flight.airline_logo && (
          <img src={flight.airline_logo} alt={flight.airline} className="h-8 w-8 object-contain" />
        )}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{flight.departure_airport.id}</span>
            <span className="text-sm text-muted-foreground">{flight.departure_airport.time}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-semibold">{flight.arrival_airport.id}</span>
            <span className="text-sm text-muted-foreground">{flight.arrival_airport.time}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{flight.airline}</span>
            <span>•</span>
            <span>{flight.flight_number}</span>
            <span>•</span>
            <span>{formatDuration(flight.duration)}</span>
          </div>
          {flight.extensions && flight.extensions.length > 0 && (
            <div className="flex gap-2 text-xs text-muted-foreground">
              {flight.extensions.map((ext, i) => (
                <span key={i}>{ext}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const renderFlightOption = (option: FlightOption, index: number) => (
    <div key={index} className="rounded-lg border border-border bg-background p-4 hover:border-primary">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              {option.type === "Round trip" ? "Round Trip" : "One Way"}
            </span>
            {option.carbon_emissions && (
              <span className="text-xs text-muted-foreground">
                {option.carbon_emissions.this_flight} kg CO₂
              </span>
            )}
          </div>
          <div className="space-y-2">
            {option.flights.map((flight, idx) => renderFlight(flight, idx))}
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="size-4" />
            <span>Total: {formatDuration(option.total_duration)}</span>
          </div>
        </div>
        <div className="ml-4 flex flex-col items-end gap-2">
          <div className="text-right">
            <div className="text-2xl font-bold">${option.price}</div>
            <div className="text-xs text-muted-foreground">{getTravelClassName(travelClass)}</div>
          </div>
          <Button size="sm">Select Flight</Button>
        </div>
      </div>
    </div>
  )

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
          {isLoading && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <Spinner size={48} />
              <p className="text-muted-foreground">Searching for flights...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-center">
                <p className="text-destructive">{error}</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
                  Go Back
                </Button>
              </div>
            </div>
          )}

          {!isLoading && !error && flightResults && (
            <div className="space-y-6">
              {/* Price Insights */}
              {flightResults.price_insights && (
                <div className="rounded-lg border border-border bg-muted/50 p-4">
                  <h2 className="mb-2 font-semibold">Price Insights</h2>
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Lowest Price: </span>
                      <span className="font-semibold">${flightResults.price_insights.lowest_price}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Typical Range: </span>
                      <span className="font-semibold">
                        ${flightResults.price_insights.typical_price_range[0]} - $
                        {flightResults.price_insights.typical_price_range[1]}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Price Level: </span>
                      <span
                        className={`font-semibold capitalize ${
                          flightResults.price_insights.price_level === "high"
                            ? "text-destructive"
                            : flightResults.price_insights.price_level === "low"
                              ? "text-green-600"
                              : ""
                        }`}
                      >
                        {flightResults.price_insights.price_level}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Best Flights */}
              {flightResults.best_flights && flightResults.best_flights.length > 0 && (
                <div>
                  <h2 className="mb-4 text-lg font-semibold">Best Flights</h2>
                  <div className="space-y-4">
                    {flightResults.best_flights.map((option, index) => renderFlightOption(option, index))}
                  </div>
                </div>
              )}

              {/* Other Flights */}
              {flightResults.other_flights && flightResults.other_flights.length > 0 && (
                <div>
                  <h2 className="mb-4 text-lg font-semibold">Other Flights</h2>
                  <div className="space-y-4">
                    {flightResults.other_flights.map((option, index) => renderFlightOption(option, index))}
                  </div>
                </div>
              )}

              {!flightResults.best_flights?.length && !flightResults.other_flights?.length && (
                <div className="flex flex-col items-center justify-center gap-4 py-12">
                  <Plane className="size-16 text-muted-foreground" />
                  <p className="text-lg text-muted-foreground">No flights found for this route</p>
                  <Button variant="outline" onClick={() => navigate(-1)}>
                    Try Different Search
                  </Button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </ThemeProvider>
  )
}
