import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Plane } from "lucide-react"

interface Airport {
  id: string
  name: string
  code?: string
  city?: string
  country?: string
}

interface AirportAutocompleteProps {
  value: string
  onChange: (value: string, airport?: Airport) => void
  placeholder?: string
  className?: string
  id?: string
}

// Client-side cache for airport searches (infinite duration - airports don't change)
const airportCache = new Map<string, Airport[]>()

export function AirportAutocomplete({
  value,
  onChange,
  placeholder = "Search airport...",
  className = "",
  id
}: AirportAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [airports, setAirports] = useState<Airport[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [inputValue, setInputValue] = useState(value)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle clicks outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Fetch airport suggestions
  const fetchAirports = async (query: string) => {
    if (query.length < 2) {
      setAirports([])
      return
    }

    // Check client-side cache first (infinite cache - airports don't change)
    const cacheKey = query.toLowerCase()
    const cachedResult = airportCache.get(cacheKey)

    if (cachedResult) {
      setAirports(cachedResult)
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    try {
      // Direct API call (same for dev and prod)
      const apiKey = import.meta.env.VITE_BOOKINGCOM_RAPIDAPI
      const url = `https://booking-com15.p.rapidapi.com/api/v1/flights/searchDestination?query=${encodeURIComponent(query)}`
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'booking-com15.p.rapidapi.com'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch airports')
      }

      const rawData = await response.json()
      const formattedAirports: Airport[] = (rawData.data || []).map((airport: any) => ({
        id: airport.id || airport.code || airport.iata,
        name: airport.name || airport.label,
        code: airport.code || airport.iata,
        city: airport.city,
        country: airport.country
      }))

      setAirports(formattedAirports)

      // Cache the result on client side (infinite - airports don't change)
      airportCache.set(cacheKey, formattedAirports)
    } catch (error) {
      console.error('Error fetching airports:', error)
      setAirports([])
    } finally {
      setIsLoading(false)
    }
  }

  // Debounced search
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    if (inputValue.length >= 2) {
      setIsOpen(true)
      debounceTimerRef.current = setTimeout(() => {
        fetchAirports(inputValue)
      }, 300)
    } else {
      setAirports([])
      setIsOpen(false)
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [inputValue])

  // Update input when external value changes
  useEffect(() => {
    setInputValue(value)
  }, [value])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    onChange(newValue)
  }

  const handleSelectAirport = (airport: Airport) => {
    const displayValue = airport.code || airport.id
    setInputValue(displayValue)
    onChange(displayValue, airport)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        value={inputValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        className={`${className} uppercase`}
        autoComplete="off"
      />

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-none shadow-lg">
          <Command>
            <CommandList>
              {isLoading && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Searching airports...
                </div>
              )}

              {!isLoading && airports.length === 0 && inputValue.length >= 2 && (
                <CommandEmpty>No airports found.</CommandEmpty>
              )}

              {!isLoading && airports.length > 0 && (
                <CommandGroup>
                  {airports.map((airport) => (
                    <CommandItem
                      key={airport.id}
                      onSelect={() => handleSelectAirport(airport)}
                      className="cursor-pointer"
                    >
                      <Plane className="mr-2 h-4 w-4" />
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {airport.code && `${airport.code} - `}
                          {airport.name}
                        </span>
                        {(airport.city || airport.country) && (
                          <span className="text-xs text-muted-foreground">
                            {[airport.city, airport.country].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  )
}
