import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Plane } from "lucide-react"
import airportsData from "../../../airports.json"

interface Airport {
  id: string
  name: string
  code?: string
  location?: string
  iata?: string
}

interface AirportAutocompleteProps {
  value: string
  onChange: (value: string, airport?: Airport) => void
  placeholder?: string
  className?: string
  id?: string
}

// Load and parse airports from JSON file
const allAirports: Airport[] = airportsData.data.map((airport: any) => ({
  id: airport.id || airport.iata || airport.skyId,
  name: airport.name,
  code: airport.iata || airport.skyId,
  iata: airport.iata,
  location: airport.location,
}))

// Client-side cache for airport searches
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

  // Search airports locally
  const searchAirports = (query: string) => {
    if (query.length < 2) {
      setAirports([])
      return
    }

    // Check cache first
    const cacheKey = query.toLowerCase()
    const cachedResult = airportCache.get(cacheKey)

    if (cachedResult) {
      setAirports(cachedResult)
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    try {
      const queryLower = query.toLowerCase()

      // Search through airports by name, code, or location
      const results = allAirports
        .filter(airport => {
          const nameMatch = airport.name?.toLowerCase().includes(queryLower)
          const codeMatch = airport.code?.toLowerCase().includes(queryLower)
          const iataMatch = airport.iata?.toLowerCase().includes(queryLower)
          const locationMatch = airport.location?.toLowerCase().includes(queryLower)

          return nameMatch || codeMatch || iataMatch || locationMatch
        })
        .slice(0, 20) // Limit to 20 results

      setAirports(results)

      // Cache the result
      airportCache.set(cacheKey, results)
    } catch (error) {
      console.error('Error searching airports:', error)
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
        searchAirports(inputValue)
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
                        {airport.location && (
                          <span className="text-xs text-muted-foreground">
                            {airport.location}
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
