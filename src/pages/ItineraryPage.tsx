import { useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { ThemeProvider } from "@/components/theme-provider"
import { ChevronLeftIcon, Plane } from "lucide-react"
import { format } from "date-fns"

export function ItineraryPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

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
            <div className="rounded-lg border border-border bg-muted/50 p-6">
              <h2 className="mb-4 text-lg font-semibold">Flight Search Summary</h2>
              <div className="grid gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Route:</span>
                  <span className="font-semibold">{departure} → {arrival}</span>
                </div>
                {outbound && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Departure:</span>
                    <span className="font-semibold">{format(new Date(outbound), "MMM d, yyyy")}</span>
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

            {/* Placeholder Message */}
            <div className="flex flex-col items-center justify-center gap-4 py-12 rounded-lg border border-dashed border-border">
              <Plane className="size-16 text-muted-foreground" />
              <div className="text-center">
                <p className="text-lg font-medium mb-2">Flight Search Ready</p>
                <p className="text-sm text-muted-foreground max-w-md">
                  Your flight search parameters have been saved. Flight booking integration will be added here.
                </p>
              </div>
              <Button variant="outline" onClick={() => navigate(-1)}>
                Modify Search
              </Button>
            </div>
          </div>
        </main>
      </div>
    </ThemeProvider>
  )
}
