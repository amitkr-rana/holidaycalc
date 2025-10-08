import fs from "node:fs"

const filePath = "src/App.tsx"
let source = fs.readFileSync(filePath, "utf8")
const markerStart = '  useEffect(() => {'
const markerEnd = '  const getDayTooltip'
const startIndex = source.indexOf(markerStart)
const endIndex = source.indexOf(markerEnd, startIndex)
if (startIndex === -1 || endIndex === -1) {
  console.error('Could not locate effect block to replace')
  process.exit(1)
}

const newBlock = `  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    cancelHolidayFetch({ silent: true })

    const cachedHolidays = readHolidayCache(currentCountry, currentYear)
    if (cachedHolidays) {
      applyHolidayData(cachedHolidays)
      const count = Object.keys(cachedHolidays).length
      setStatusMessage(
        count
          ? `Loaded ${count} cached holiday${count === 1 ? "" : "s"} for ${
              selectedCountry?.name ?? currentCountry
            } ${currentYear}.`
          : `No holidays found for ${selectedCountry?.name ?? currentCountry} ${currentYear}.`
      )
      return
    }

    const controller = new AbortController()
    holidayFetchControllerRef.current = controller
    holidayFetchCancelledRef.current = false
    setIsLoadingHolidays(true)
    setLoadingMessage(
      `Fetching holidays for ${selectedCountry?.name ?? currentCountry} ${currentYear}...`
    )

    const fetchHolidays = async () => {
      try {
        const holidayMap: HolidayMap = {}

        const url = new URL(CALENDARIFIC_ENDPOINT)
        url.searchParams.set("api_key", CALENDARIFIC_API_KEY)
        url.searchParams.set("country", currentCountry)
        url.searchParams.set("year", String(currentYear))
        url.searchParams.set("type", "national")

        const response = await fetch(url.toString(), { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Holiday request failed with status ${response.status}`)
        }

        const payload = (await response.json()) as CalendarificResponse
        const holidays = payload?.response?.holidays ?? []

        holidays.forEach((holiday) => {
          if (!holiday || typeof holiday !== "object") {
            return
          }

          let key: string | null = null

          const iso = typeof holiday.date?.iso === "string" ? holiday.date.iso.split("T")[0] : null
          if (iso) {
            const isoParts = iso.split("-")
            if (isoParts.length === 3) {
              const [yearPart, monthPart, dayPart] = isoParts
              key = buildDateKeyFromParts(yearPart, monthPart, dayPart)
            }
          }

          if (!key && holiday.date?.datetime) {
            const { year, month, day } = holiday.date.datetime
            if (
              typeof year === "number" &&
              typeof month === "number" &&
              typeof day === "number"
            ) {
              key = buildDateKeyFromParts(year, month, day)
            }
          }

          if (!key) {
            return
          }

          const nameValue = holiday.name
          if (typeof nameValue === "string") {
            addHolidayToMap(holidayMap, key, nameValue)
          }
        })

        if (holidayFetchCancelledRef.current) {
          return
        }

        applyHolidayData(holidayMap)
        writeHolidayCache(currentCountry, currentYear, holidayMap)

        const count = Object.keys(holidayMap).length
        setStatusMessage(
          count
            ? `Loaded ${count} holiday${count === 1 ? "" : "s"} for ${
                selectedCountry?.name ?? currentCountry
              } ${currentYear}.`
            : `No holidays found for ${selectedCountry?.name ?? currentCountry} ${currentYear}.`
        )
      } catch (error) {
        if ((error as Error)?.name === "AbortError" || holidayFetchCancelledRef.current) {
          return
        }

        console.error("Failed to fetch holidays", error)
        setStatusMessage(
          `Unable to fetch holidays for ${selectedCountry?.name ?? currentCountry} ${currentYear}.`
        )
      } finally {
        holidayFetchControllerRef.current = null
        holidayFetchCancelledRef.current = false
        setIsLoadingHolidays(false)
        setLoadingMessage(null)
      }
    }

    fetchHolidays()

    return () => {
      cancelHolidayFetch({ silent: true })
    }
  }, [
    applyHolidayData,
    cancelHolidayFetch,
    currentCountry,
    currentYear,
    selectedCountry,
  ])

`

source = source.slice(0, startIndex) + newBlock + source.slice(endIndex)
fs.writeFileSync(filePath, source, "utf8")
