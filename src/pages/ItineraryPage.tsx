import { useEffect, useState, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { motion, type Variants } from "framer-motion"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { Skeleton } from "@/components/ui/skeleton"
import { ThemeProvider } from "@/components/theme-provider"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronLeftIcon, Plane } from "lucide-react"
import { format, getDay } from "date-fns"
import { AirlineLogo } from "@/components/ui/airline-logo";
import { getCurrencySymbol } from "@/lib/currency-map";

// --- SerpAPI Response Interfaces ---
interface SerpFlightSegment {
  airline: string;
  airline_logo: string;
  airplane: string;
  arrival_airport: {
    id: string;
    name: string;
    time: string;
  };
  departure_airport: {
    id: string;
    name: string;
    time: string;
  };
  duration: number;
  extensions: string[];
  flight_number: string;
  legroom?: string;
  overnight?: boolean;
  travel_class: string;
  often_delayed_by_over_30_min?: boolean;
  ticket_also_sold_by?: string[];
  plane_and_crew_by?: string;
}

interface SerpLayover {
  duration: number;
  id: string;
  name: string;
}

interface SerpFlightOption {
  airline_logo: string;
  carbon_emissions: {
    difference_percent: number;
    this_flight: number;
    typical_for_this_route: number;
  };
  departure_token: string;
  flights: SerpFlightSegment[];
  layovers: SerpLayover[];
  price: number;
  total_duration: number;
  type: string;
}

interface SerpApiResponse {
  airports: any[];
  best_flights: SerpFlightOption[];
  other_flights: SerpFlightOption[];
  price_insights: any;
  search_metadata: any;
  search_parameters: any;
}

// --- Processed Flight Interfaces (for internal use) ---
interface ProcessedFlightSegment {
  departureAirportCode: string;
  departureAirportName: string;
  arrivalAirportName: string;
  arrivalAirportCode: string;
  durationMinutes: number;
  departureTime: string;
  arrivalTime: string;
  departureDate: string;
  arrivalDate: string;
  airline: string;
  flightNumber: string;
  airlineCode?: string;
  aircraftName?: string;
  travelClass: string;
  emissionsKg?: number;
}

interface ProcessedFlight {
  airline: string;
  airlineCode: string;
  flightNumber: string;
  scheduledDepartureTime: string;
  scheduledArrivalTime: string;
  duration: number;
  departureAirportName: string;
  arrivalAirportName: string;
  departureAirportCode: string;
  arrivalAirportCode: string;
  price?: number;
  stops: number;
  segments: ProcessedFlightSegment[];
  totalDuration: number;
  carbonEmissions?: {
    thisFlightKg: number;
    typicalForRouteKg: number;
    differencePercent: number;
  };
}

const flightCache = new Map<string, { top: ProcessedFlight[], other: ProcessedFlight[], timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000;

export function ItineraryPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [topFlights, setTopFlights] = useState<ProcessedFlight[]>([]);
  const [otherFlights, setOtherFlights] = useState<ProcessedFlight[]>([]);
  const [sortedFlights, setSortedFlights] = useState<ProcessedFlight[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("top");
  const [status, setStatus] = useState<'loading' | 'error' | 'success' | 'empty'>('loading');
  const abortControllerRef = useRef<AbortController | null>(null);

  const departure = searchParams.get("departure");
  const arrival = searchParams.get("arrival");
  const outbound = searchParams.get("outbound");
  const returnDate = searchParams.get("return");
  const passengers = searchParams.get("passengers") || "1";
  const travelClassCode = searchParams.get("class") || "1";
  const currency = searchParams.get("currency") || "USD";

  // --- (Helper functions remain the same) ---
  const getTravelClassName = (code: string) => {
    const classMap: Record<string, string> = { "1": "Economy", "2": "Premium Economy", "3": "Business", "4": "First Class" };
    return classMap[code] || "Economy";
  };
  const getDayName = (dateString: string) => {
    const dayIndex = getDay(new Date(dateString));
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[dayIndex];
  };
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours} hr ${mins} min`;
  };
  const formatEmissionDifference = (differencePercent?: number) => {
    if (differencePercent === undefined || Number.isNaN(differencePercent)) {
      return "";
    }

    if (differencePercent === 0) {
      return "Typical emissions";
    }

    const absolutePercent = Math.abs(differencePercent);
    const formattedPercent = new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(absolutePercent);
    const sign = differencePercent > 0 ? "+" : "-";

    return `${sign}${formattedPercent}% than usual`;
  };
  const formatTime = (datetime: string) => {
    try {
      return datetime.split(' ')[1] || datetime;
    } catch {
      return datetime;
    }
  };
  const calculateLayover = (arrivalDateTime: string, departureDateTime: string) => {
    const parseDateTime = (value: string) => {
      if (!value) return null;
      const trimmed = value.trim();

      const directParse = new Date(trimmed);
      if (!Number.isNaN(directParse.getTime())) {
        return directParse;
      }

      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        const isoCandidate = `${parts[0]}T${parts[1]}`;
        const parsed = new Date(isoCandidate);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }

      return null;
    };

    const arrival = parseDateTime(arrivalDateTime);
    const departure = parseDateTime(departureDateTime);

    if (!arrival || !departure) return "";

    const diffMinutes = Math.max(0, Math.floor((departure.getTime() - arrival.getTime()) / (1000 * 60)));
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;

    if (hours === 0 && mins === 0) return "0 min";
    if (hours === 0) return `${mins} min`;
    if (mins === 0) return `${hours} hr`;
    return `${hours} hr ${mins} min`;
  };

  useEffect(() => {
    const fetchFlights = async () => {
      setStatus('loading'); // Always start in a loading state.
      setTopFlights([]);
      setOtherFlights([]);

      if (!departure || !arrival || !outbound) {
        setError("Missing required search parameters");
        setStatus('error');
        return;
      }

      const cacheKey = `${departure}-${arrival}-${outbound}-${passengers}-${travelClassCode}-${currency}`;
      const cachedData = flightCache.get(cacheKey);

      if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
        setTopFlights(cachedData.top);
        setOtherFlights(cachedData.other);
        setStatus(cachedData.top.length > 0 || cachedData.other.length > 0 ? 'success' : 'empty');
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const params = new URLSearchParams({
            departure_id: departure,
            arrival_id: arrival,
            outbound_date: outbound,
            currency: currency,
            hl: "en",
            gl: "us",
        });

        // Add return_date if it exists
        if (returnDate) {
          params.append("return_date", returnDate);
        }

        // Use Vite proxy in development (optional), direct URL in production
        const baseUrl = import.meta.env.DEV
          ? '/api/flights'  // Uses Vite proxy for convenience in dev
          : 'https://sunidhiyadav69.pythonanywhere.com/flight-result';  // Direct call in production (CORS enabled on server)
        const url = `${baseUrl}?${params.toString()}`;

        const response = await fetch(url, {
          signal: controller.signal,
          mode: 'cors',
          headers: {
            'Accept': 'application/json',
          }
        });

        if (!response.ok) throw new Error(`Failed to fetch flights: ${response.statusText}`);

        const data: SerpApiResponse = await response.json();
        if (!data.best_flights && !data.other_flights) throw new Error("No flight data available");

        const extractAirlineCode = (flightNumber: string): string => {
          // Extract airline code from flight number (e.g., "UA 889" -> "UA")
          return flightNumber.split(' ')[0] || '';
        };

        const processFlightOptions = (options: SerpFlightOption[]): ProcessedFlight[] => {
          return options
            .filter(option => {
              // Filter out flights with missing critical data
              if (!option.flights || !Array.isArray(option.flights) || option.flights.length === 0) return false;

              const firstSegment = option.flights[0];
              const lastSegment = option.flights[option.flights.length - 1];

              // Check if departure/arrival times and price exist
              if (!firstSegment?.departure_airport?.time || !lastSegment?.arrival_airport?.time) return false;
              if (!option.price || option.price <= 0) return false;

              return true;
            })
            .map(option => {
            const firstSegment = option.flights[0];
            const lastSegment = option.flights[option.flights.length - 1];
            const stopsCount = option.layovers?.length || 0;

            // Extract airline code from first segment's flight number
            const airlineCode = extractAirlineCode(firstSegment.flight_number);

            // Process segments for internal use
            const processedSegments: ProcessedFlightSegment[] = option.flights.map(segment => {
              const depTimeParts = segment.departure_airport?.time?.split(' ') || ['', ''];
              const arrTimeParts = segment.arrival_airport?.time?.split(' ') || ['', ''];
              const [depDate] = depTimeParts;
              const [arrDate] = arrTimeParts;
              const emissionExtension = segment.extensions?.find(ext =>
                ext.toLowerCase().includes("carbon emissions estimate")
              );
              const emissionsKg = emissionExtension
                ? (() => {
                    const numeric = emissionExtension.replace(/[^0-9.]/g, "");
                    const parsed = parseFloat(numeric);
                    return Number.isFinite(parsed) ? parsed : undefined;
                  })()
                : undefined;

              return {
                departureAirportCode: segment.departure_airport.id,
                departureAirportName: segment.departure_airport.name,
                arrivalAirportName: segment.arrival_airport.name,
                arrivalAirportCode: segment.arrival_airport.id,
                durationMinutes: segment.duration,
                departureTime: segment.departure_airport.time,
                arrivalTime: segment.arrival_airport.time,
                departureDate: depDate,
                arrivalDate: arrDate,
                airline: segment.airline,
                flightNumber: segment.flight_number,
                airlineCode: extractAirlineCode(segment.flight_number),
                aircraftName: segment.airplane,
                travelClass: segment.travel_class,
                emissionsKg,
              };
            });

            const carbonEmissions = option.carbon_emissions
              ? {
                  thisFlightKg: option.carbon_emissions.this_flight / 1000,
                  typicalForRouteKg: option.carbon_emissions.typical_for_this_route / 1000,
                  differencePercent: option.carbon_emissions.difference_percent,
                }
              : undefined;

            return {
                airline: firstSegment.airline,
                airlineCode: airlineCode,
                flightNumber: firstSegment.flight_number,
                scheduledDepartureTime: formatTime(firstSegment.departure_airport.time),
                scheduledArrivalTime: formatTime(lastSegment.arrival_airport.time),
                duration: firstSegment.duration,
                departureAirportName: firstSegment.departure_airport.name,
                arrivalAirportName: lastSegment.arrival_airport.name,
                departureAirportCode: firstSegment.departure_airport.id,
                arrivalAirportCode: lastSegment.arrival_airport.id,
                price: option.price,
                stops: stopsCount,
                segments: processedSegments,
                totalDuration: option.total_duration,
                carbonEmissions,
            };
          });
        };

        const processedTopFlights = processFlightOptions(data.best_flights || []);
        const processedOtherFlights = processFlightOptions(data.other_flights || []);

        setTopFlights(processedTopFlights);
        setOtherFlights(processedOtherFlights);

        if (processedTopFlights.length === 0 && processedOtherFlights.length === 0) {
          setStatus('empty');
        } else {
          setStatus('success');
        }

        flightCache.set(cacheKey, { top: processedTopFlights, other: processedOtherFlights, timestamp: Date.now() });

      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to fetch flight data");
        setStatus('error');
      }
    };

    fetchFlights();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [departure, arrival, outbound, passengers, travelClassCode, currency]);

  useEffect(() => {
    const allFlights = [...topFlights, ...otherFlights];
    let sorted = [...allFlights];
    switch (sortBy) {
        case 'price': sorted.sort((a, b) => (a.price || 0) - (b.price || 0)); break;
        case 'departure': sorted.sort((a, b) => a.scheduledDepartureTime.localeCompare(b.scheduledDepartureTime)); break;
        case 'arrival': sorted.sort((a, b) => a.scheduledArrivalTime.localeCompare(b.scheduledArrivalTime)); break;
        case 'duration': sorted.sort((a, b) => a.totalDuration - b.totalDuration); break;
        case 'stops': sorted.sort((a, b) => a.stops - b.stops); break;
        default: break;
    }
    setSortedFlights(sorted);
  }, [sortBy, topFlights, otherFlights]);

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };
  const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 100 } },
  };

  const FlightList = ({ flights }: { flights: ProcessedFlight[] }) => (
    <motion.div layout variants={containerVariants} initial="hidden" animate="visible" className="border-b border-border">
      <Accordion type="single" collapsible className="space-y-0">
        {flights.map((flight, index) => {
          const emissionsDifferenceLabel = flight.carbonEmissions
            ? formatEmissionDifference(flight.carbonEmissions.differencePercent)
            : "";

          return (
            <motion.div key={`${flight.departureAirportCode}-${flight.arrivalAirportCode}-${flight.scheduledDepartureTime}-${index}`} layout variants={itemVariants}>
              <AccordionItem value={`flight-${index}`} className="border border-border bg-background hover:border-transparent hover:outline hover:outline-1 hover:outline-primary hover:outline-offset-[-1px] transition-colors">
              <AccordionTrigger className="px-6 py-4 hover:no-underline">
                <div className="flex flex-1 items-center pr-2">
                    <div className="flex items-center gap-4 min-w-[180px]">
                        <AirlineLogo airlineCode={flight.airlineCode} airlineName={flight.airline} className="h-10 w-10"/>
                        <div className="text-left flex-1">
                            <div className="text-base font-medium">{flight.scheduledDepartureTime} – {flight.scheduledArrivalTime}</div>
                            <div className="text-xs text-muted-foreground">{flight.airline}</div>
                        </div>
                    </div>
                    <div className="flex flex-1 items-center justify-evenly">
                      <div className="flex flex-col items-center">
                          <span className="text-sm font-medium">{formatDuration(flight.totalDuration)}</span>
                          <span className="text-xs text-muted-foreground">{departure} – {arrival}</span>
                      </div>
                      <div className="flex flex-col items-center">
                          <span className="text-sm font-medium">{flight.stops === 0 ? "Nonstop" : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}</span>
                          {flight.stops > 0 && flight.segments.length > 1 && (
                            <span className="text-xs text-muted-foreground">
                              {flight.stops === 1
                                ? flight.segments[0].arrivalAirportCode
                                : flight.stops === 2
                                ? `${flight.segments[0].arrivalAirportCode}, ${flight.segments[1].arrivalAirportCode}`
                                : `${flight.segments[0].arrivalAirportCode}, and ${flight.stops - 1} others`
                              }
                            </span>
                          )}
                      </div>
                      <div className="flex flex-col items-center">
                        {flight.carbonEmissions ? (
                          <>
                            <span className="text-sm font-medium">
                              Emissions: {new Intl.NumberFormat("en-US", {
                                minimumFractionDigits: flight.carbonEmissions.thisFlightKg < 100 ? 1 : 0,
                                maximumFractionDigits: flight.carbonEmissions.thisFlightKg < 100 ? 1 : 0,
                              }).format(flight.carbonEmissions.thisFlightKg)} kg CO<sub>2</sub>
                            </span>
                            {emissionsDifferenceLabel && (
                              <span className="text-xs text-muted-foreground">
                                {emissionsDifferenceLabel}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">Emissions unavailable</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {flight.price && (<span className="text-lg font-semibold mr-2">{getCurrencySymbol(currency)}{flight.price.toLocaleString('en-US')}</span>)}
                        <Button size="sm" onClick={(e) => { e.stopPropagation(); }} asChild>
                          <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); } }}>
                            Select
                          </div>
                        </Button>
                    </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4 pt-2 pl-14">
                  {flight.segments.map((segment, segmentIdx) => (
                    <motion.div key={segmentIdx} variants={itemVariants}>
                      <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center">
                          <div className="flex h-3 w-3 items-center justify-center rounded-full border-2 border-foreground" />
                          <div className="h-16 w-0.5 bg-border" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-base font-semibold">{formatTime(segment.departureTime)}</span>
                            <span className="text-sm">{segment.departureAirportName} ({segment.departureAirportCode})</span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <span className="font-semibold">Travel time:</span> {formatDuration(segment.durationMinutes)}
                            {typeof segment.emissionsKg === "number" && (
                              <> · <span className="font-semibold">Emission</span> {new Intl.NumberFormat("en-US", {
                                minimumFractionDigits: segment.emissionsKg < 100 ? 1 : 0,
                                maximumFractionDigits: segment.emissionsKg < 100 ? 1 : 0,
                              }).format(segment.emissionsKg)} kg CO<sub>2</sub></>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center">
                          <div className="flex h-3 w-3 items-center justify-center rounded-full border-2 border-foreground bg-foreground" />
                          {segmentIdx < flight.segments.length - 1 && (<div className="h-16 w-0.5 bg-border" />)}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-base font-semibold">{formatTime(segment.arrivalTime)}</span>
                            <span className="text-sm">{segment.arrivalAirportName} ({segment.arrivalAirportCode})</span>
                          </div>
                        </div>
                      </div>
                      <div className="bg-muted/50 p-3 text-sm border-t border-border mt-2 mb-4 ml-7">
                        <div className="flex items-center gap-3">
                          <AirlineLogo
                            airlineCode={segment.airlineCode || ''}
                            airlineName={segment.airline}
                            className="h-8 w-8 flex-shrink-0"
                          />
                          <div className="space-y-1 flex-1">
                            <div>
                              <span className="font-medium">{segment.airline}</span>
                              <span className="text-muted-foreground"> · {segment.travelClass}</span>
                              <span className="text-muted-foreground"> · Flight {segment.flightNumber}</span>
                            </div>
                            {segment.aircraftName && (<div className="text-xs text-muted-foreground">{segment.aircraftName}</div>)}
                          </div>
                        </div>
                      </div>
                      {segmentIdx < flight.segments.length - 1 && (
                        <div className="flex items-center gap-4 mb-4">
                          <div className="flex-1 border-2 border-dashed border-muted-foreground/40 px-4 py-3 text-sm ml-7">
                            <span className="font-medium text-muted-foreground">
                              {calculateLayover(segment.arrivalTime, flight.segments[segmentIdx + 1].departureTime)} layover · {segment.arrivalAirportName} ({segment.arrivalAirportCode})
                            </span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </motion.div>
              </AccordionContent>
            </AccordionItem>
            </motion.div>
          );
        })}
      </Accordion>
    </motion.div>
  );

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <div className="container mx-auto flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" className="rounded-full" onClick={() => navigate(-1)} aria-label="Back">
                <ChevronLeftIcon className="size-4" />
              </Button>
              <div>
                <h1 className="text-xl font-semibold md:text-2xl">Flight Results</h1>
                {departure && arrival && (
                  <p className="text-sm text-muted-foreground">
                    {departure} → {arrival}
                    {outbound && (<>{" • "}{format(new Date(outbound), "MMM d, yyyy")}{returnDate && <> - {format(new Date(returnDate), "MMM d, yyyy")}</>}</>)}
                  </p>
                )}
              </div>
            </div>
            <ModeToggle />
          </div>
        </header>

        <main className="container mx-auto flex-1 px-4 py-6">
          <div className="space-y-6">
            <div className="border border-border bg-muted/50 p-6">
              <h2 className="mb-4 text-lg font-semibold">Flight Search Summary</h2>
              <div className="grid gap-3 text-sm">
                <div className="flex items-center gap-2"><span className="text-muted-foreground">Route:</span><span className="font-semibold">{departure} → {arrival}</span></div>
                {outbound && (<div className="flex items-center gap-2"><span className="text-muted-foreground">Departure:</span><span className="font-semibold">{format(new Date(outbound), "MMM d, yyyy")} ({getDayName(outbound)})</span></div>)}
                {returnDate && (<div className="flex items-center gap-2"><span className="text-muted-foreground">Return:</span><span className="font-semibold">{format(new Date(returnDate), "MMM d, yyyy")}</span></div>)}
                <div className="flex items-center gap-2"><span className="text-muted-foreground">Passengers:</span><span className="font-semibold">{passengers}</span></div>
                <div className="flex items-center gap-2"><span className="text-muted-foreground">Class:</span><span className="font-semibold">{getTravelClassName(travelClassCode)}</span></div>
              </div>
            </div>

            {status === 'loading' && (
              <div className="space-y-0">
                {[...Array(5)].map((_, index) => (
                  <div key={index} className="border border-border bg-background p-6">
                    <div className="flex items-center gap-8">
                      <div className="flex items-center gap-4 min-w-[180px]"><Skeleton className="h-10 w-10 rounded-none" /><div className="space-y-2 flex-1"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div></div>
                      <div className="space-y-2 min-w-[140px]"><Skeleton className="h-4 w-20" /><Skeleton className="h-3 w-24" /></div>
                      <div className="flex-1 space-y-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-3 w-20" /></div>
                      <div className="flex items-center gap-2"><Skeleton className="h-6 w-20" /><Skeleton className="h-8 w-24" /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <div className="border border-destructive bg-destructive/10 p-6 text-center">
                  <p className="text-destructive">{error}</p>
                  <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Go Back</Button>
                </div>
              </div>
            )}
            
            {status === 'empty' && (
              <div className="flex flex-col items-center justify-center gap-4 py-12 border border-dashed border-border">
                <Plane className="size-16 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-lg font-medium mb-2">No Flights Found</p>
                  <p className="text-sm text-muted-foreground max-w-md">
                    No flights available for this route on {outbound && getDayName(outbound)}. Try a different date or route.
                  </p>
                </div>
                <Button variant="outline" onClick={() => navigate(-1)}>Try Different Search</Button>
              </div>
            )}

            {status === 'success' && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Available Flights</h2>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Sort by" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="top">Top Flights</SelectItem>
                      <SelectItem value="price">Price</SelectItem>
                      <SelectItem value="departure">Departure Time</SelectItem>
                      <SelectItem value="arrival">Arrival Time</SelectItem>
                      <SelectItem value="duration">Duration</SelectItem>
                      <SelectItem value="stops">Number of Stops</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {sortBy === 'top' ? (
                  <>
                    {topFlights.length > 0 && (<div className="mb-8"><h3 className="mb-4 text-base font-semibold text-primary">Best Flights</h3><FlightList flights={topFlights} /></div>)}
                    {otherFlights.length > 0 && (<div><h3 className="mb-4 text-base font-semibold">Other Flights</h3><FlightList flights={otherFlights} /></div>)}
                  </>
                ) : (
                  <FlightList flights={sortedFlights} />
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </ThemeProvider>
  )
}
