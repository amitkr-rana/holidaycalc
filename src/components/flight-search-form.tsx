import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { format } from "date-fns"
import { CalendarIcon, PlaneTakeoff, PlaneLanding } from "lucide-react"

interface FlightSearchFormProps {
  defaultDate?: Date
  defaultCountry?: string
}

export function FlightSearchForm({ defaultDate, defaultCountry }: FlightSearchFormProps) {
  const navigate = useNavigate()
  const [departureAirport, setDepartureAirport] = useState("")
  const [arrivalAirport, setArrivalAirport] = useState("")
  const [outboundDate, setOutboundDate] = useState<Date | undefined>(defaultDate)
  const [returnDate, setReturnDate] = useState<Date | undefined>()
  const [passengers, setPassengers] = useState("1")
  const [travelClass, setTravelClass] = useState("1")
  const [isLoading, setIsLoading] = useState(false)
  const [showOutboundCalendar, setShowOutboundCalendar] = useState(false)
  const [showReturnCalendar, setShowReturnCalendar] = useState(false)

  const handleSearch = async () => {
    if (!departureAirport || !arrivalAirport || !outboundDate) {
      alert("Please fill in all required fields")
      return
    }

    setIsLoading(true)

    try {
      const searchParams = new URLSearchParams({
        departure: departureAirport.toUpperCase(),
        arrival: arrivalAirport.toUpperCase(),
        outbound: format(outboundDate, "yyyy-MM-dd"),
        passengers,
        class: travelClass,
      })

      if (returnDate) {
        searchParams.append("return", format(returnDate, "yyyy-MM-dd"))
      }

      navigate(`/itinerary?${searchParams.toString()}`)
    } catch (error) {
      console.error("Error navigating to itinerary:", error)
      alert("Failed to search flights. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Departure Airport */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="departure" className="flex items-center gap-2">
            <PlaneTakeoff className="size-4" />
            Departure Airport
          </Label>
          <Input
            id="departure"
            placeholder="e.g., JFK, LAX"
            value={departureAirport}
            onChange={(e) => setDepartureAirport(e.target.value)}
            className="uppercase"
          />
          <p className="text-xs text-muted-foreground">Enter 3-letter airport code</p>
        </div>

        {/* Arrival Airport */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="arrival" className="flex items-center gap-2">
            <PlaneLanding className="size-4" />
            Arrival Airport
          </Label>
          <Input
            id="arrival"
            placeholder="e.g., LHR, CDG"
            value={arrivalAirport}
            onChange={(e) => setArrivalAirport(e.target.value)}
            className="uppercase"
          />
          <p className="text-xs text-muted-foreground">Enter 3-letter airport code</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Outbound Date */}
        <div className="flex flex-col gap-2">
          <Label>Outbound Date</Label>
          <div className="relative">
            <Button
              variant="outline"
              className="w-full justify-start text-left font-normal"
              onClick={() => setShowOutboundCalendar(!showOutboundCalendar)}
            >
              <CalendarIcon className="mr-2 size-4" />
              {outboundDate ? format(outboundDate, "PPP") : "Pick a date"}
            </Button>
            {showOutboundCalendar && (
              <div className="absolute z-50 mt-2 rounded-md border bg-background p-3 shadow-lg">
                <Calendar
                  mode="single"
                  selected={outboundDate}
                  onSelect={(date) => {
                    setOutboundDate(date)
                    setShowOutboundCalendar(false)
                  }}
                  disabled={(date) => date < new Date()}
                />
              </div>
            )}
          </div>
        </div>

        {/* Return Date */}
        <div className="flex flex-col gap-2">
          <Label>Return Date (Optional)</Label>
          <div className="relative">
            <Button
              variant="outline"
              className="w-full justify-start text-left font-normal"
              onClick={() => setShowReturnCalendar(!showReturnCalendar)}
            >
              <CalendarIcon className="mr-2 size-4" />
              {returnDate ? format(returnDate, "PPP") : "Pick a date"}
            </Button>
            {showReturnCalendar && (
              <div className="absolute z-50 mt-2 rounded-md border bg-background p-3 shadow-lg">
                <Calendar
                  mode="single"
                  selected={returnDate}
                  onSelect={(date) => {
                    setReturnDate(date)
                    setShowReturnCalendar(false)
                  }}
                  disabled={(date) => date < (outboundDate || new Date())}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Passengers */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="passengers">Passengers</Label>
          <Select value={passengers} onValueChange={setPassengers}>
            <SelectTrigger id="passengers">
              <SelectValue placeholder="Select passengers" />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                <SelectItem key={num} value={String(num)}>
                  {num} {num === 1 ? "Passenger" : "Passengers"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Travel Class */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="class">Travel Class</Label>
          <Select value={travelClass} onValueChange={setTravelClass}>
            <SelectTrigger id="class">
              <SelectValue placeholder="Select class" />
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

      {/* Search Button */}
      <Button
        onClick={handleSearch}
        disabled={isLoading || !departureAirport || !arrivalAirport || !outboundDate}
        className="w-full"
        size="lg"
      >
        {isLoading ? (
          <>
            <Spinner size={16} className="mr-2" />
            Searching...
          </>
        ) : (
          "Search Flights"
        )}
      </Button>
    </div>
  )
}
