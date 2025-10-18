import { useEffect, useState, useRef, type ReactNode } from "react"

import { useNavigate, useSearchParams } from "react-router-dom"

import { motion, type Variants } from "framer-motion"

import { Button } from "@/components/ui/button"

import { ModeToggle } from "@/components/mode-toggle"

import { Skeleton } from "@/components/ui/skeleton"

import { ThemeProvider } from "@/components/theme-provider"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { Calendar } from "@/components/ui/calendar"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

import { NumberStepper } from "@/components/ui/number-stepper"

import { ChevronLeftIcon, Plane, CalendarIcon } from "lucide-react"

import { format, getDay } from "date-fns"

import { AirlineLogo } from "@/components/ui/airline-logo";

import { getCurrencySymbol } from "@/lib/currency-map";

import { cn } from "@/lib/utils"

import airportsData from "../../all_airports_formatted.json";



// --- Airport Data Interfaces ---

interface Airport {

  icao: string;

  iata: string;

  name: string;

  city: string;

  subd: string;

  country: string;

  elevation: number;

  lat: number;

  lon: number;

  tz: string;

  lid: string;

}



interface AirportsData {

  data: Airport[];

}



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



const AirportHoverHighlight = ({ children }: { children: ReactNode }) => {
  const [isHovered, setIsHovered] = useState(false);

  const gradientAnimate = isHovered
    ? { x: ["-160%", "160%"] }
    : { x: "-160%" };

  const hoverTransition = {
    duration: 1.2,
    ease: [0.42, 0, 0.58, 1] as const,
    repeat: Infinity,
    repeatType: "loop" as const,
  };

  const restTransition = {
    duration: 0.4,
    ease: [0.25, 0.1, 0.25, 1] as const,
  };

  const gradientTransition = isHovered ? hoverTransition : restTransition;

  return (
    <span
      className="relative inline-flex items-center overflow-hidden rounded-sm px-1 py-0.5 transition-colors duration-300 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[140%] bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-70 dark:via-white/25"
        initial={{ x: "-160%" }}
        animate={gradientAnimate}
        transition={gradientTransition}
      />
      <span className="relative z-10 transition-colors duration-300">
        {children}
      </span>
    </span>
  );
};



export function ItineraryPage() {

  const [searchParams] = useSearchParams();

  const navigate = useNavigate();

  // Outbound flight states
  const [outboundTopFlights, setOutboundTopFlights] = useState<ProcessedFlight[]>([]);
  const [outboundOtherFlights, setOutboundOtherFlights] = useState<ProcessedFlight[]>([]);
  const [outboundSortedFlights, setOutboundSortedFlights] = useState<ProcessedFlight[]>([]);
  const [outboundStatus, setOutboundStatus] = useState<'loading' | 'error' | 'success' | 'empty'>('loading');
  const [outboundError, setOutboundError] = useState<string | null>(null);

  // Return flight states
  const [returnTopFlights, setReturnTopFlights] = useState<ProcessedFlight[]>([]);
  const [returnOtherFlights, setReturnOtherFlights] = useState<ProcessedFlight[]>([]);
  const [returnSortedFlights, setReturnSortedFlights] = useState<ProcessedFlight[]>([]);
  const [returnStatus, setReturnStatus] = useState<'loading' | 'error' | 'success' | 'empty'>('loading');
  const [returnError, setReturnError] = useState<string | null>(null);

  // Legacy states for one-way trips (backward compatibility)
  const [topFlights, setTopFlights] = useState<ProcessedFlight[]>([]);
  const [otherFlights, setOtherFlights] = useState<ProcessedFlight[]>([]);
  const [sortedFlights, setSortedFlights] = useState<ProcessedFlight[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'success' | 'empty'>('loading');

  const [sortBy, setSortBy] = useState("top");
  const [outboundSortBy, setOutboundSortBy] = useState("top");
  const [returnSortBy, setReturnSortBy] = useState("top");
  const abortControllerRef = useRef<AbortController | null>(null);
  const returnAbortControllerRef = useRef<AbortController | null>(null);

  // Editable summary state
  const [editedDepartureDate, setEditedDepartureDate] = useState<Date | undefined>(undefined);
  const [editedReturnDate, setEditedReturnDate] = useState<Date | undefined>(undefined);
  const [editedAdults, setEditedAdults] = useState(1);
  const [editedChildren, setEditedChildren] = useState(0);
  const [editedInfantsOnSeat, setEditedInfantsOnSeat] = useState(0);
  const [editedInfantsOnLap, setEditedInfantsOnLap] = useState(0);
  const [editedTravelClass, setEditedTravelClass] = useState("1");



  const departure = searchParams.get("departure");

  const arrival = searchParams.get("arrival");

  const outbound = searchParams.get("outbound");

  const returnDate = searchParams.get("return");

  const adults = searchParams.get("adults") || searchParams.get("passengers") || "1";
  const children = searchParams.get("children") || "0";
  const infantsOnSeat = searchParams.get("infants_on_seat") || "0";
  const infantsOnLap = searchParams.get("infants_on_lap") || "0";

  const travelClassCode = searchParams.get("class") || "1";

  const currency = searchParams.get("currency") || "USD";

  // Initialize editable values from URL params
  useEffect(() => {
    if (outbound) {
      setEditedDepartureDate(new Date(outbound));
    }
    if (returnDate) {
      setEditedReturnDate(new Date(returnDate));
    } else {
      setEditedReturnDate(undefined);
    }
    setEditedAdults(parseInt(adults) || 1);
    setEditedChildren(parseInt(children) || 0);
    setEditedInfantsOnSeat(parseInt(infantsOnSeat) || 0);
    setEditedInfantsOnLap(parseInt(infantsOnLap) || 0);
    setEditedTravelClass(travelClassCode);
  }, [outbound, returnDate, adults, children, infantsOnSeat, infantsOnLap, travelClassCode]);



  // --- (Helper functions remain the same) ---

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



  const getAirportCoordinates = (airportCode: string): { lat: number; lon: number } | null => {

    const typedAirportsData = airportsData as AirportsData;

    const airport = typedAirportsData.data.find(

      (ap: Airport) => ap.iata === airportCode || ap.icao === airportCode

    );

    if (airport && typeof airport.lat === 'number' && typeof airport.lon === 'number') {

      return { lat: airport.lat, lon: airport.lon };

    }

    return null;

  };



  const openGoogleMaps = (airportCode: string) => {

    const coords = getAirportCoordinates(airportCode);

    if (coords) {

      const url = `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lon}`;

      window.open(url, '_blank', 'noopener,noreferrer');

    }

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
    const isRoundTrip = Boolean(returnDate);

    const fetchFlights = async () => {
      if (!departure || !arrival || !outbound) {
        const errorMsg = "Missing required search parameters";
        setError(errorMsg);
        setStatus('error');
        if (isRoundTrip) {
          setOutboundError(errorMsg);
          setOutboundStatus('error');
          setReturnError(errorMsg);
          setReturnStatus('error');
        }
        return;
      }

      // Helper function to fetch flight data
      const fetchFlightData = async (
        depAirport: string,
        arrAirport: string,
        date: string,
        controller: AbortController
      ): Promise<{ top: ProcessedFlight[], other: ProcessedFlight[] }> => {
        const params = new URLSearchParams({
          departure_id: depAirport,
          arrival_id: arrAirport,
          outbound_date: date,
          currency: currency,
          hl: "en",
          gl: "us",
        });

        // Only add passenger counts if greater than 0
        if (parseInt(adults) > 0) {
          params.set('adults', adults);
        }
        if (parseInt(children) > 0) {
          params.set('children', children);
        }
        if (parseInt(infantsOnSeat) > 0) {
          params.set('infants_in_seat', infantsOnSeat);
        }
        if (parseInt(infantsOnLap) > 0) {
          params.set('infants_on_lap', infantsOnLap);
        }

        // Always add travel class
        params.set('travel_class', travelClassCode);

        const baseUrl = import.meta.env.DEV
          ? '/api/flights'
          : 'https://sunidhiyadav69.pythonanywhere.com/flight-result';
        const url = `${baseUrl}?${params.toString()}`;

        const response = await fetch(url, {
          signal: controller.signal,
          mode: 'cors',
          headers: {
            'Accept': 'application/json',
          }
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          if (errorData.error && errorData.error.includes("Google Flights hasn't returned any results")) {
            throw new Error("No flights found for this route with the selected travel class.");
          }
          throw new Error(`Failed to fetch flights: ${errorData.error || response.statusText}`);
        }

        const data: SerpApiResponse = await response.json();
        if (!data.best_flights && !data.other_flights) throw new Error("No flight data available");

        const extractAirlineCode = (flightNumber: string): string => {
          return flightNumber.split(' ')[0] || '';
        };

        const processFlightOptions = (options: SerpFlightOption[]): ProcessedFlight[] => {
          return options
            .filter(option => {
              if (!option.flights || !Array.isArray(option.flights) || option.flights.length === 0) return false;
              const firstSegment = option.flights[0];
              const lastSegment = option.flights[option.flights.length - 1];
              if (!firstSegment?.departure_airport?.time || !lastSegment?.arrival_airport?.time) return false;
              if (!option.price || option.price <= 0) return false;
              return true;
            })
            .map(option => {
              const firstSegment = option.flights[0];
              const lastSegment = option.flights[option.flights.length - 1];
              const stopsCount = option.layovers?.length || 0;
              const airlineCode = extractAirlineCode(firstSegment.flight_number);

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

        return { top: processedTopFlights, other: processedOtherFlights };
      };

      if (isRoundTrip) {
        // Round trip: Make two separate API calls
        setOutboundStatus('loading');
        setReturnStatus('loading');
        setOutboundTopFlights([]);
        setOutboundOtherFlights([]);
        setReturnTopFlights([]);
        setReturnOtherFlights([]);

        // Check cache for both flights
        const outboundCacheKey = `${departure}-${arrival}-${outbound}-${adults}-${children}-${infantsOnSeat}-${infantsOnLap}-${travelClassCode}-${currency}`;
        const returnCacheKey = `${arrival}-${departure}-${returnDate}-${adults}-${children}-${infantsOnSeat}-${infantsOnLap}-${travelClassCode}-${currency}`;

        const outboundCachedData = flightCache.get(outboundCacheKey);
        const returnCachedData = flightCache.get(returnCacheKey);

        // Abort previous requests
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        if (returnAbortControllerRef.current) {
          returnAbortControllerRef.current.abort();
        }

        const outboundController = new AbortController();
        const returnController = new AbortController();
        abortControllerRef.current = outboundController;
        returnAbortControllerRef.current = returnController;

        // Fetch outbound flights
        const fetchOutbound = async () => {
          try {
            if (outboundCachedData && Date.now() - outboundCachedData.timestamp < CACHE_DURATION) {
              setOutboundTopFlights(outboundCachedData.top);
              setOutboundOtherFlights(outboundCachedData.other);
              setOutboundStatus(outboundCachedData.top.length > 0 || outboundCachedData.other.length > 0 ? 'success' : 'empty');
            } else {
              const result = await fetchFlightData(departure, arrival, outbound, outboundController);
              setOutboundTopFlights(result.top);
              setOutboundOtherFlights(result.other);
              setOutboundStatus(result.top.length === 0 && result.other.length === 0 ? 'empty' : 'success');
              flightCache.set(outboundCacheKey, { top: result.top, other: result.other, timestamp: Date.now() });
            }
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return;
            setOutboundError(err instanceof Error ? err.message : "Failed to fetch outbound flights");
            setOutboundStatus('error');
          }
        };

        // Fetch return flights
        const fetchReturn = async () => {
          try {
            if (returnCachedData && Date.now() - returnCachedData.timestamp < CACHE_DURATION) {
              setReturnTopFlights(returnCachedData.top);
              setReturnOtherFlights(returnCachedData.other);
              setReturnStatus(returnCachedData.top.length > 0 || returnCachedData.other.length > 0 ? 'success' : 'empty');
            } else {
              const result = await fetchFlightData(arrival, departure, returnDate!, returnController);
              setReturnTopFlights(result.top);
              setReturnOtherFlights(result.other);
              setReturnStatus(result.top.length === 0 && result.other.length === 0 ? 'empty' : 'success');
              flightCache.set(returnCacheKey, { top: result.top, other: result.other, timestamp: Date.now() });
            }
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return;
            setReturnError(err instanceof Error ? err.message : "Failed to fetch return flights");
            setReturnStatus('error');
          }
        };

        // Fetch both in parallel
        Promise.all([fetchOutbound(), fetchReturn()]);

      } else {
        // One-way trip: Use legacy behavior
        setStatus('loading');
        setTopFlights([]);
        setOtherFlights([]);

        const cacheKey = `${departure}-${arrival}-${outbound}-${adults}-${children}-${infantsOnSeat}-${infantsOnLap}-${travelClassCode}-${currency}`;
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
          const result = await fetchFlightData(departure, arrival, outbound, controller);
          setTopFlights(result.top);
          setOtherFlights(result.other);
          setStatus(result.top.length === 0 && result.other.length === 0 ? 'empty' : 'success');
          flightCache.set(cacheKey, { top: result.top, other: result.other, timestamp: Date.now() });
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
          setError(err instanceof Error ? err.message : "Failed to fetch flight data");
          setStatus('error');
        }
      }
    };

    fetchFlights();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (returnAbortControllerRef.current) {
        returnAbortControllerRef.current.abort();
      }
    };
  }, [departure, arrival, outbound, returnDate, adults, children, infantsOnSeat, infantsOnLap, travelClassCode, currency]);



  useEffect(() => {
    const isRoundTrip = Boolean(returnDate);

    if (isRoundTrip) {
      // Sort outbound flights with separate sort value
      const allOutboundFlights = [...outboundTopFlights, ...outboundOtherFlights];
      let sortedOutbound = [...allOutboundFlights];
      switch (outboundSortBy) {
        case 'price': sortedOutbound.sort((a, b) => (a.price || 0) - (b.price || 0)); break;
        case 'departure': sortedOutbound.sort((a, b) => a.scheduledDepartureTime.localeCompare(b.scheduledDepartureTime)); break;
        case 'arrival': sortedOutbound.sort((a, b) => a.scheduledArrivalTime.localeCompare(b.scheduledArrivalTime)); break;
        case 'duration': sortedOutbound.sort((a, b) => a.totalDuration - b.totalDuration); break;
        case 'stops': sortedOutbound.sort((a, b) => a.stops - b.stops); break;
        default: break;
      }
      setOutboundSortedFlights(sortedOutbound);

      // Sort return flights with separate sort value
      const allReturnFlights = [...returnTopFlights, ...returnOtherFlights];
      let sortedReturn = [...allReturnFlights];
      switch (returnSortBy) {
        case 'price': sortedReturn.sort((a, b) => (a.price || 0) - (b.price || 0)); break;
        case 'departure': sortedReturn.sort((a, b) => a.scheduledDepartureTime.localeCompare(b.scheduledDepartureTime)); break;
        case 'arrival': sortedReturn.sort((a, b) => a.scheduledArrivalTime.localeCompare(b.scheduledArrivalTime)); break;
        case 'duration': sortedReturn.sort((a, b) => a.totalDuration - b.totalDuration); break;
        case 'stops': sortedReturn.sort((a, b) => a.stops - b.stops); break;
        default: break;
      }
      setReturnSortedFlights(sortedReturn);
    } else {
      // One-way trip sorting
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
    }
  }, [sortBy, outboundSortBy, returnSortBy, topFlights, otherFlights, outboundTopFlights, outboundOtherFlights, returnTopFlights, returnOtherFlights, returnDate]);



  const containerVariants: Variants = {

    hidden: { opacity: 0 },

    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },

  };

  const itemVariants: Variants = {

    hidden: { y: 20, opacity: 0 },

    visible: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 100 } },

  };



  // Handle Apply button - update search params with edited values
  const handleApply = () => {
    const newParams = new URLSearchParams();
    newParams.set("departure", departure || "");
    newParams.set("arrival", arrival || "");
    if (editedDepartureDate) {
      newParams.set("outbound", format(editedDepartureDate, "yyyy-MM-dd"));
    }
    if (editedReturnDate) {
      newParams.set("return", format(editedReturnDate, "yyyy-MM-dd"));
    }
    newParams.set("adults", editedAdults.toString());
    newParams.set("children", editedChildren.toString());
    newParams.set("infants_on_seat", editedInfantsOnSeat.toString());
    newParams.set("infants_on_lap", editedInfantsOnLap.toString());
    newParams.set("class", editedTravelClass);
    newParams.set("currency", currency);

    navigate(`/itinerary?${newParams.toString()}`);
  };

  // Handle Reset button - revert to original URL params
  const handleReset = () => {
    if (outbound) {
      setEditedDepartureDate(new Date(outbound));
    }
    if (returnDate) {
      setEditedReturnDate(new Date(returnDate));
    } else {
      setEditedReturnDate(undefined);
    }
    setEditedAdults(parseInt(adults) || 1);
    setEditedChildren(parseInt(children) || 0);
    setEditedInfantsOnSeat(parseInt(infantsOnSeat) || 0);
    setEditedInfantsOnLap(parseInt(infantsOnLap) || 0);
    setEditedTravelClass(travelClassCode);
  };

  const FlightList = ({ flights, animationKey }: { flights: ProcessedFlight[], animationKey?: string }) => (

    <motion.div key={animationKey} layout variants={containerVariants} initial="hidden" animate="visible" className="border-b border-border">

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

                      <div className="flex flex-col items-center gap-1">

                          <span className="text-sm font-medium">{formatDuration(flight.totalDuration)}</span>

                          <div className="flex items-center gap-1 text-xs text-muted-foreground">

                            <AirportHoverHighlight>{departure}</AirportHoverHighlight>

                            <span aria-hidden="true"></span>

                            <AirportHoverHighlight>{arrival}</AirportHoverHighlight>

                          </div>

                      </div>

                      <div className="flex flex-col items-center">

                          <span className="text-sm font-medium">{flight.stops === 0 ? "Nonstop" : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}</span>

                          {flight.stops > 0 && flight.segments.length > 1 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              {(() => {
                                if (flight.stops === 1) {
                                  return (
                                    <AirportHoverHighlight>
                                      {flight.segments[0].arrivalAirportCode}
                                    </AirportHoverHighlight>
                                  );
                                }
                                if (flight.stops === 2) {
                                  return (
                                    <>
                                      <AirportHoverHighlight>
                                        {flight.segments[0].arrivalAirportCode}
                                      </AirportHoverHighlight>
                                      <span>,</span>
                                      <AirportHoverHighlight>
                                        {flight.segments[1].arrivalAirportCode}
                                      </AirportHoverHighlight>
                                    </>
                                  );
                                }
                                return (
                                  <>
                                    <AirportHoverHighlight>
                                      {flight.segments[0].arrivalAirportCode}
                                    </AirportHoverHighlight>
                                    <span>, and {flight.stops - 1} others</span>
                                  </>
                                );
                              })()}
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

                            <span

                              className="text-sm text-muted-foreground cursor-pointer transition-colors"

                              onClick={(e) => {

                                e.stopPropagation();

                                openGoogleMaps(segment.departureAirportCode);

                              }}

                            >

                              <AirportHoverHighlight>

                                {segment.departureAirportName} ({segment.departureAirportCode})

                              </AirportHoverHighlight>

                            </span>

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

                            <span

                              className="text-sm text-muted-foreground cursor-pointer transition-colors"

                              onClick={(e) => {

                                e.stopPropagation();

                                openGoogleMaps(segment.arrivalAirportCode);

                              }}

                            >

                              <AirportHoverHighlight>

                                {segment.arrivalAirportName} ({segment.arrivalAirportCode})

                              </AirportHoverHighlight>

                            </span>

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
                             {calculateLayover(segment.arrivalTime, flight.segments[segmentIdx + 1].departureTime)} layover at {" "}
                             <span
                               className="text-muted-foreground cursor-pointer transition-colors"
                               onClick={(e) => {
                                 e.stopPropagation();
                                 openGoogleMaps(segment.arrivalAirportCode);
                               }}
                             >
                               <AirportHoverHighlight>
                                 {segment.arrivalAirportName} ({segment.arrivalAirportCode})
                               </AirportHoverHighlight>
                             </span>
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

              <Button variant="outline" size="icon" className="rounded-none" onClick={() => navigate(-1)} aria-label="Back">

                <ChevronLeftIcon className="size-4" />

              </Button>

              <div>

                <h1 className="text-xl font-semibold md:text-2xl">Flight Results</h1>

                {departure && arrival && (

                  <p className="text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <AirportHoverHighlight>{departure}</AirportHoverHighlight>
                      <span aria-hidden="true"></span>
                      <AirportHoverHighlight>{arrival}</AirportHoverHighlight>
                    </span>
                    {outbound && (
                      <>
                        {" - "}{format(new Date(outbound), "MMM d, yyyy")}
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

            <div className="border-2 border-dashed border-border bg-muted/50 rounded-none overflow-hidden">
              <div className="border-b-2 border-dashed border-border bg-background/50 px-6 py-3">
                <h2 className="text-base font-semibold">Summary</h2>
              </div>

              <div className="grid grid-cols-4 divide-x-2 divide-dashed divide-border">
                {/* Departure Column */}
                <div className="p-4 space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Departure</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-between text-left font-normal rounded-none",
                          !editedDepartureDate && "text-muted-foreground"
                        )}
                      >
                        <div className="flex items-center">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {editedDepartureDate ? format(editedDepartureDate, "MMM d, yyyy") : "Pick date"}
                        </div>
                        {editedDepartureDate && (
                          <span className="text-muted-foreground text-sm">
                            {format(editedDepartureDate, "EEE")}
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-none" align="start">
                      <Calendar
                        mode="single"
                        selected={editedDepartureDate}
                        onSelect={setEditedDepartureDate}
                        initialFocus
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        className="rounded-none"
                        showNav={true}
                        formatters={{
                          formatWeekdayName: (date) => {
                            const day = date.toLocaleDateString('en-US', { weekday: 'short' });
                            return day.substring(0, 3);
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Return Column */}
                <div className="p-4 space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Return</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-between text-left font-normal rounded-none",
                          !editedReturnDate && "text-muted-foreground"
                        )}
                      >
                        <div className="flex items-center">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {editedReturnDate ? format(editedReturnDate, "MMM d, yyyy") : "One-way"}
                        </div>
                        {editedReturnDate && (
                          <span className="text-muted-foreground text-sm">
                            {format(editedReturnDate, "EEE")}
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-none" align="start">
                      <Calendar
                        mode="single"
                        selected={editedReturnDate}
                        onSelect={setEditedReturnDate}
                        initialFocus
                        disabled={(date) => {
                          const today = new Date(new Date().setHours(0, 0, 0, 0));
                          if (date < today) return true;
                          if (editedDepartureDate && date < editedDepartureDate) return true;
                          return false;
                        }}
                        className="rounded-none"
                        showNav={true}
                        formatters={{
                          formatWeekdayName: (date) => {
                            const day = date.toLocaleDateString('en-US', { weekday: 'short' });
                            return day.substring(0, 3);
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Passengers Column */}
                <div className="p-4 space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Passengers</label>
                  <div className="space-y-0">
                    <div className="py-2 border-b-2 border-border rounded-none">
                      <NumberStepper
                        label="Adults"
                        value={editedAdults}
                        onChange={setEditedAdults}
                        min={1}
                        max={9}
                      />
                    </div>
                    <div className="py-2 border-b-2 border-border rounded-none">
                      <NumberStepper
                        label="Children"
                        value={editedChildren}
                        onChange={setEditedChildren}
                        min={0}
                        max={9}
                      />
                    </div>
                    <div className="py-2 border-b-2 border-border rounded-none">
                      <NumberStepper
                        label="Infants on Seat"
                        value={editedInfantsOnSeat}
                        onChange={setEditedInfantsOnSeat}
                        min={0}
                        max={9}
                      />
                    </div>
                    <div className="py-2">
                      <NumberStepper
                        label="Infants on Lap"
                        value={editedInfantsOnLap}
                        onChange={setEditedInfantsOnLap}
                        min={0}
                        max={9}
                      />
                    </div>
                  </div>
                </div>

                {/* Travel Class Column */}
                <div className="p-4 space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Travel Class</label>
                  <Select value={editedTravelClass} onValueChange={setEditedTravelClass}>
                    <SelectTrigger className="rounded-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Economy</SelectItem>
                      <SelectItem value="2">Premium Economy</SelectItem>
                      <SelectItem value="3">Business</SelectItem>
                      <SelectItem value="4">First Class</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="border-t-2 border-dashed border-border bg-background/50 px-6 py-3 flex justify-end gap-2">
                <Button variant="outline" onClick={handleReset} className="rounded-none">
                  Reset
                </Button>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Button
                          onClick={handleApply}
                          disabled={!editedDepartureDate}
                          className="rounded-none"
                        >
                          Apply Changes
                        </Button>
                      </div>
                    </TooltipTrigger>
                    {!editedDepartureDate && (
                      <TooltipContent>
                        <p>Departure date is required</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>



            {/* Round Trip Display */}
            {returnDate && (
              <>
                {/* Loading State for Round Trip */}
                {(outboundStatus === 'loading' || returnStatus === 'loading') && (
                  <>
                    <Tabs defaultValue="outbound" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 mb-6">
                        <TabsTrigger value="outbound" className="text-base">
                          Outbound • {departure} → {arrival}
                          {outbound && <span className="ml-2 text-xs text-muted-foreground">({format(new Date(outbound), "MMM d")})</span>}
                        </TabsTrigger>
                        <TabsTrigger value="return" className="text-base">
                          Return • {arrival} → {departure}
                          {returnDate && <span className="ml-2 text-xs text-muted-foreground">({format(new Date(returnDate), "MMM d")})</span>}
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="outbound" className="space-y-4">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-lg font-semibold">Loading Outbound Flights...</h2>
                        </div>
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
                      </TabsContent>

                      <TabsContent value="return" className="space-y-4">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-lg font-semibold">Loading Return Flights...</h2>
                        </div>
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
                      </TabsContent>
                    </Tabs>
                  </>
                )}

                {/* Error or Success State for Round Trip */}
                {outboundStatus !== 'loading' && returnStatus !== 'loading' && (
                  <>
                    <Tabs defaultValue="outbound" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 mb-6">
                        <TabsTrigger value="outbound" className="text-base">
                          Outbound • {departure} → {arrival}
                          {outbound && <span className="ml-2 text-xs text-muted-foreground">({format(new Date(outbound), "MMM d")})</span>}
                        </TabsTrigger>
                        <TabsTrigger value="return" className="text-base">
                          Return • {arrival} → {departure}
                          {returnDate && <span className="ml-2 text-xs text-muted-foreground">({format(new Date(returnDate), "MMM d")})</span>}
                        </TabsTrigger>
                      </TabsList>

                      {/* Outbound Tab Content */}
                      <TabsContent value="outbound" className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="text-lg font-semibold">Available Outbound Flights</h2>
                          <Select value={outboundSortBy} onValueChange={setOutboundSortBy}>
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

                        {outboundStatus === 'error' && (
                          <div className="border-2 border-dashed border-border bg-muted/30 p-8 rounded-none">
                            <div className="flex flex-col items-center justify-center gap-6">
                              <Plane className="size-16 text-muted-foreground" />
                              <div className="text-center space-y-2">
                                <p className="text-lg font-medium">{outboundError}</p>
                                {outboundError?.includes("travel class") && (
                                  <>
                                    <p className="text-sm text-muted-foreground">Try searching with a different travel class:</p>
                                    <div className="flex gap-2 justify-center mt-4">
                                      {travelClassCode !== "1" && (
                                        <Button
                                          variant="outline"
                                          className="rounded-none"
                                          onClick={() => {
                                            setEditedTravelClass("1");
                                            const newParams = new URLSearchParams(window.location.search);
                                            newParams.set("class", "1");
                                            navigate(`/itinerary?${newParams.toString()}`);
                                          }}
                                        >
                                          Economy
                                        </Button>
                                      )}
                                      {travelClassCode !== "2" && (
                                        <Button
                                          variant="outline"
                                          className="rounded-none"
                                          onClick={() => {
                                            setEditedTravelClass("2");
                                            const newParams = new URLSearchParams(window.location.search);
                                            newParams.set("class", "2");
                                            navigate(`/itinerary?${newParams.toString()}`);
                                          }}
                                        >
                                          Premium Economy
                                        </Button>
                                      )}
                                      {travelClassCode !== "3" && (
                                        <Button
                                          variant="outline"
                                          className="rounded-none"
                                          onClick={() => {
                                            setEditedTravelClass("3");
                                            const newParams = new URLSearchParams(window.location.search);
                                            newParams.set("class", "3");
                                            navigate(`/itinerary?${newParams.toString()}`);
                                          }}
                                        >
                                          Business
                                        </Button>
                                      )}
                                      {travelClassCode !== "4" && (
                                        <Button
                                          variant="outline"
                                          className="rounded-none"
                                          onClick={() => {
                                            setEditedTravelClass("4");
                                            const newParams = new URLSearchParams(window.location.search);
                                            newParams.set("class", "4");
                                            navigate(`/itinerary?${newParams.toString()}`);
                                          }}
                                        >
                                          First Class
                                        </Button>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {outboundStatus === 'empty' && (
                          <div className="flex flex-col items-center justify-center gap-4 py-12 border border-dashed border-border">
                            <Plane className="size-16 text-muted-foreground" />
                            <div className="text-center">
                              <p className="text-lg font-medium mb-2">No Outbound Flights Found</p>
                              <p className="text-sm text-muted-foreground">No flights available for this route on {outbound && getDayName(outbound)}.</p>
                            </div>
                          </div>
                        )}

                        {outboundStatus === 'success' && (
                          <>
                            {outboundSortBy === 'top' ? (
                              <>
                                {outboundTopFlights.length > 0 && (
                                  <div className="mb-8">
                                    <h3 className="mb-4 text-base font-semibold text-primary">Best Flights</h3>
                                    <FlightList flights={outboundTopFlights} animationKey={`outbound-top-${outboundSortBy}`} />
                                  </div>
                                )}
                                {outboundOtherFlights.length > 0 && (
                                  <div>
                                    <h3 className="mb-4 text-base font-semibold">Other Flights</h3>
                                    <FlightList flights={outboundOtherFlights} animationKey={`outbound-other-${outboundSortBy}`} />
                                  </div>
                                )}
                              </>
                            ) : (
                              <FlightList flights={outboundSortedFlights} animationKey={`outbound-sorted-${outboundSortBy}`} />
                            )}
                          </>
                        )}
                      </TabsContent>

                      {/* Return Tab Content */}
                      <TabsContent value="return" className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="text-lg font-semibold">Available Return Flights</h2>
                          <Select value={returnSortBy} onValueChange={setReturnSortBy}>
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

                        {returnStatus === 'error' && (
                          <div className="border-2 border-dashed border-border bg-muted/30 p-8 rounded-none">
                            <div className="flex flex-col items-center justify-center gap-6">
                              <Plane className="size-16 text-muted-foreground" />
                              <div className="text-center space-y-2">
                                <p className="text-lg font-medium">{returnError}</p>
                                {returnError?.includes("travel class") && (
                                  <>
                                    <p className="text-sm text-muted-foreground">Try searching with a different travel class:</p>
                                    <div className="flex gap-2 justify-center mt-4">
                                      {travelClassCode !== "1" && (
                                        <Button
                                          variant="outline"
                                          className="rounded-none"
                                          onClick={() => {
                                            setEditedTravelClass("1");
                                            const newParams = new URLSearchParams(window.location.search);
                                            newParams.set("class", "1");
                                            navigate(`/itinerary?${newParams.toString()}`);
                                          }}
                                        >
                                          Economy
                                        </Button>
                                      )}
                                      {travelClassCode !== "2" && (
                                        <Button
                                          variant="outline"
                                          className="rounded-none"
                                          onClick={() => {
                                            setEditedTravelClass("2");
                                            const newParams = new URLSearchParams(window.location.search);
                                            newParams.set("class", "2");
                                            navigate(`/itinerary?${newParams.toString()}`);
                                          }}
                                        >
                                          Premium Economy
                                        </Button>
                                      )}
                                      {travelClassCode !== "3" && (
                                        <Button
                                          variant="outline"
                                          className="rounded-none"
                                          onClick={() => {
                                            setEditedTravelClass("3");
                                            const newParams = new URLSearchParams(window.location.search);
                                            newParams.set("class", "3");
                                            navigate(`/itinerary?${newParams.toString()}`);
                                          }}
                                        >
                                          Business
                                        </Button>
                                      )}
                                      {travelClassCode !== "4" && (
                                        <Button
                                          variant="outline"
                                          className="rounded-none"
                                          onClick={() => {
                                            setEditedTravelClass("4");
                                            const newParams = new URLSearchParams(window.location.search);
                                            newParams.set("class", "4");
                                            navigate(`/itinerary?${newParams.toString()}`);
                                          }}
                                        >
                                          First Class
                                        </Button>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {returnStatus === 'empty' && (
                          <div className="flex flex-col items-center justify-center gap-4 py-12 border border-dashed border-border">
                            <Plane className="size-16 text-muted-foreground" />
                            <div className="text-center">
                              <p className="text-lg font-medium mb-2">No Return Flights Found</p>
                              <p className="text-sm text-muted-foreground">No flights available for this route on {returnDate && getDayName(returnDate)}.</p>
                            </div>
                          </div>
                        )}

                        {returnStatus === 'success' && (
                          <>
                            {returnSortBy === 'top' ? (
                              <>
                                {returnTopFlights.length > 0 && (
                                  <div className="mb-8">
                                    <h3 className="mb-4 text-base font-semibold text-primary">Best Flights</h3>
                                    <FlightList flights={returnTopFlights} animationKey={`return-top-${returnSortBy}`} />
                                  </div>
                                )}
                                {returnOtherFlights.length > 0 && (
                                  <div>
                                    <h3 className="mb-4 text-base font-semibold">Other Flights</h3>
                                    <FlightList flights={returnOtherFlights} animationKey={`return-other-${returnSortBy}`} />
                                  </div>
                                )}
                              </>
                            ) : (
                              <FlightList flights={returnSortedFlights} animationKey={`return-sorted-${returnSortBy}`} />
                            )}
                          </>
                        )}
                      </TabsContent>
                    </Tabs>
                  </>
                )}
              </>
            )}

            {/* One-Way Trip Display (Legacy) */}
            {!returnDate && (
              <>
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
                  <div className="border-2 border-dashed border-border bg-muted/30 p-8 rounded-none">
                    <div className="flex flex-col items-center justify-center gap-6">
                      <Plane className="size-16 text-muted-foreground" />
                      <div className="text-center space-y-2">
                        <p className="text-lg font-medium">{error}</p>
                        {error?.includes("travel class") && (
                          <>
                            <p className="text-sm text-muted-foreground">Try searching with a different travel class:</p>
                            <div className="flex gap-2 justify-center mt-4">
                              {travelClassCode !== "1" && (
                                <Button
                                  variant="outline"
                                  className="rounded-none"
                                  onClick={() => {
                                    setEditedTravelClass("1");
                                    const newParams = new URLSearchParams(window.location.search);
                                    newParams.set("class", "1");
                                    navigate(`/itinerary?${newParams.toString()}`);
                                  }}
                                >
                                  Economy
                                </Button>
                              )}
                              {travelClassCode !== "2" && (
                                <Button
                                  variant="outline"
                                  className="rounded-none"
                                  onClick={() => {
                                    setEditedTravelClass("2");
                                    const newParams = new URLSearchParams(window.location.search);
                                    newParams.set("class", "2");
                                    navigate(`/itinerary?${newParams.toString()}`);
                                  }}
                                >
                                  Premium Economy
                                </Button>
                              )}
                              {travelClassCode !== "3" && (
                                <Button
                                  variant="outline"
                                  className="rounded-none"
                                  onClick={() => {
                                    setEditedTravelClass("3");
                                    const newParams = new URLSearchParams(window.location.search);
                                    newParams.set("class", "3");
                                    navigate(`/itinerary?${newParams.toString()}`);
                                  }}
                                >
                                  Business
                                </Button>
                              )}
                              {travelClassCode !== "4" && (
                                <Button
                                  variant="outline"
                                  className="rounded-none"
                                  onClick={() => {
                                    setEditedTravelClass("4");
                                    const newParams = new URLSearchParams(window.location.search);
                                    newParams.set("class", "4");
                                    navigate(`/itinerary?${newParams.toString()}`);
                                  }}
                                >
                                  First Class
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
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
                        {topFlights.length > 0 && (<div className="mb-8"><h3 className="mb-4 text-base font-semibold text-primary">Best Flights</h3><FlightList flights={topFlights} animationKey={`top-${sortBy}`} /></div>)}
                        {otherFlights.length > 0 && (<div><h3 className="mb-4 text-base font-semibold">Other Flights</h3><FlightList flights={otherFlights} animationKey={`other-${sortBy}`} /></div>)}
                      </>
                    ) : (
                      <FlightList flights={sortedFlights} animationKey={`sorted-${sortBy}`} />
                    )}
                  </div>
                )}
              </>
            )}

          </div>

        </main>

      </div>

    </ThemeProvider>

  )

}

