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

// --- (Interfaces remain the same) ---
interface FlightSegment {
  departureAirportCode: string;
  departureAirportName: string;
  arrivalAirportName: string;
  arrivalAirportCode: string;
  durationMinutes: number;
  departureTime: string;
  arrivalTime: string;
  cabinClass: number;
  airline: {
    airlineCode: string;
    flightNumber: string;
    airlineName: string;
  };
  departureDate: string;
  arrivalDate: string;
  aircraftName?: string;
}

interface FlightOption {
  price: number;
  airlineCode: string;
  airlineNames: string[];
  segments: FlightSegment[];
  departureAirportCode: string;
  departureDate: string;
  departureTime: string;
  arrivalAirportCode: string;
  arrivalDate: string;
  arrivalTime: string;
  duration: number;
  stops: number | null;
}

interface GoogleFlightsApiResponse {
  status: boolean;
  message: string;
  data: {
    topFlights: FlightOption[];
    otherFlights: FlightOption[];
  };
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
  segments: FlightSegment[];
  totalDuration: number;
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
  const formatTime = (datetime: string) => {
    try {
      return datetime.split(' ')[1] || datetime;
    } catch {
      return datetime;
    }
  };
  const calculateLayover = (arrivalTime: string, departureTime: string, arrivalDate: string, departureDate: string) => {
    try {
      const arrival = new Date(`${arrivalDate} ${arrivalTime}`);
      const departure = new Date(`${departureDate} ${departureTime}`);
      const diffMinutes = Math.floor((departure.getTime() - arrival.getTime()) / (1000 * 60));
      const hours = Math.floor(diffMinutes / 60);
      const mins = diffMinutes % 60;
      return `${hours} hr ${mins} min`;
    } catch {
      return '';
    }
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

      const cacheKey = `${departure}-${arrival}-${outbound}-${passengers}-${travelClassCode}`;
      const cachedData = flightCache.get(cacheKey);

      if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
        console.log("Using cached flight data");
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
            departureId: departure,
            arrivalId: arrival,
            departureDate: outbound,
            currency: "INR",
            adults: passengers,
            cabinClass: travelClassCode,
            sort: "1",
            stops: "0",
        });

        const apiKey = import.meta.env.VITE_FLIGHT_SCRAPER_SKY_RAPIDAPI;
        const url = `https://flights-sky.p.rapidapi.com/google/flights/search-one-way?${params.toString()}`;
        const response = await fetch(url, { signal: controller.signal, headers: { "x-rapidapi-key": apiKey, "x-rapidapi-host": "flights-sky.p.rapidapi.com" } });
        if (!response.ok) throw new Error(`Failed to fetch flights: ${response.statusText}`);

        const data: GoogleFlightsApiResponse = await response.json();
        if (!data.status || !data.data) throw new Error("No flight data available");

        const processFlightOptions = (options: FlightOption[]): ProcessedFlight[] => options.map(option => {
            const firstSegment = option.segments[0];
            const lastSegment = option.segments[option.segments.length - 1];
            const stopsCount = option.stops !== null ? option.stops : Math.max(0, option.segments.length - 1);
            return {
                airline: firstSegment.airline.airlineName, airlineCode: firstSegment.airline.airlineCode, flightNumber: firstSegment.airline.flightNumber,
                scheduledDepartureTime: formatTime(option.departureTime || firstSegment.departureTime), scheduledArrivalTime: formatTime(option.arrivalTime || lastSegment.arrivalTime),
                duration: firstSegment.durationMinutes, departureAirportName: firstSegment.departureAirportName, arrivalAirportName: lastSegment.arrivalAirportName,
                departureAirportCode: firstSegment.departureAirportCode, arrivalAirportCode: lastSegment.arrivalAirportCode,
                price: option.price, stops: stopsCount, segments: option.segments, totalDuration: option.duration,
            };
        });

        const processedTopFlights = processFlightOptions(data.data.topFlights || []);
        const processedOtherFlights = processFlightOptions(data.data.otherFlights || []);

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
          console.log("Request was cancelled");
          return;
        }
        console.error("Error fetching flights:", err);
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
  }, [departure, arrival, outbound, passengers, travelClassCode]);

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
        {flights.map((flight, index) => (
          <motion.div key={`${flight.airlineCode}-${flight.flightNumber}-${flight.scheduledDepartureTime}`} layout variants={itemVariants}>
            <AccordionItem value={`flight-${index}`} className="border border-border bg-background hover:border-transparent hover:outline hover:outline-1 hover:outline-primary hover:outline-offset-[-1px] transition-colors">
              <AccordionTrigger className="px-6 py-4 hover:no-underline">
                <div className="flex flex-1 items-center gap-8 pr-2">
                    <div className="flex items-center gap-4 min-w-[180px]">
                        <AirlineLogo airlineCode={flight.airlineCode} airlineName={flight.airline} className="h-10 w-10"/>
                        <div className="text-left flex-1">
                            <div className="text-base font-medium">{flight.scheduledDepartureTime} – {flight.scheduledArrivalTime}</div>
                            <div className="text-xs text-muted-foreground">{flight.airline}</div>
                        </div>
                    </div>
                    <div className="flex flex-col items-start min-w-[140px]">
                        <span className="text-sm font-medium">{formatDuration(flight.totalDuration)}</span>
                        <span className="text-xs text-muted-foreground">{departure} – {arrival}</span>
                    </div>
                    <div className="flex-1 flex flex-col items-start">
                        <span className="text-sm font-medium">{flight.stops === 0 ? "Nonstop" : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}</span>
                        {flight.stops > 0 && flight.segments.length > 1 && (<span className="text-xs text-muted-foreground">{flight.segments[0].arrivalAirportCode}</span>)}
                    </div>
                    <div className="flex items-center gap-2">
                        {flight.price && (<span className="text-lg font-semibold mr-2">₹{flight.price.toLocaleString('en-IN')}</span>)}
                        <Button size="sm" onClick={(e) => { e.stopPropagation(); console.log("Selected flight:", flight); }}>Select</Button>
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
                          <div className="text-sm text-muted-foreground">Travel time: {formatDuration(segment.durationMinutes)}</div>
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
                        <div className="space-y-1">
                          <div>
                            <span className="font-medium">{segment.airline.airlineName}</span>
                            <span className="text-muted-foreground"> · {getTravelClassName(travelClassCode)}</span>
                            <span className="text-muted-foreground"> · Flight {segment.airline.flightNumber}</span>
                          </div>
                          {segment.aircraftName && (<div className="text-xs text-muted-foreground">{segment.aircraftName}</div>)}
                        </div>
                      </div>
                      {segmentIdx < flight.segments.length - 1 && (
                        <div className="flex items-center gap-4 mb-4">
                          <div className="flex-1 border-2 border-dashed border-muted-foreground/40 px-4 py-3 text-sm ml-7">
                            <span className="font-medium text-muted-foreground">
                              {calculateLayover(segment.arrivalTime, flight.segments[segmentIdx + 1].departureTime, segment.arrivalDate, flight.segments[segmentIdx + 1].departureDate)} layover · {segment.arrivalAirportName}
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
        ))}
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