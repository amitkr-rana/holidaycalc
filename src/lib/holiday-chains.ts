import { dateKey, normalizeDate } from "@/lib/holiday-service"

export type HolidayChainMode = "optimal" | "user-total"

export type HolidayChainResult = {
  id: string
  start: Date
  end: Date
  length: number
  leaves: number
  dates: Date[]
  leaveDates: Date[]
  monthKeys: string[]
}

export type CalculateHolidayChainsOptions = {
  mode: HolidayChainMode
  leavesBudget?: number
  startDate: Date
  endDate: Date
  holidayDates: Date[]
  maxLeavesPerMonth: number
}

type CalendarDay = {
  date: Date
  type: "WD" | "W" | "PH" | "W-PH"
  monthKey: string
  monthName: string
  timestamp: number
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const monthKeyFromDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`

const normalizeUniqueDates = (dates: Date[]) => {
  const map = new Map<string, Date>()
  dates.forEach((date) => {
    const normalized = normalizeDate(date)
    const key = dateKey(normalized)
    if (!map.has(key)) {
      map.set(key, normalized)
    }
  })
  return Array.from(map.values()).sort((a, b) => a.getTime() - b.getTime())
}

/**
 * Generates the calendar array with categorized days for the defined period.
 */
const buildCalendar = (startDate: Date, endDate: Date, holidayDates: Date[]): CalendarDay[] => {
  const normalizedStart = normalizeDate(startDate)
  const normalizedEnd = normalizeDate(endDate)
  if (normalizedStart.getTime() > normalizedEnd.getTime()) {
    return []
  }

  const holidaySet = new Set(holidayDates.map((date) => dateKey(normalizeDate(date))))
  const calendar: CalendarDay[] = []
  const cursor = new Date(normalizedStart)

  while (cursor.getTime() <= normalizedEnd.getTime()) {
    const current = normalizeDate(cursor)
    const key = dateKey(current)
    const dayOfWeek = current.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isPublicHoliday = holidaySet.has(key)

    let type: CalendarDay["type"] = "WD" // Work Day is default
    if (isWeekend && !isPublicHoliday) {
      type = "W"
    } else if (isWeekend && isPublicHoliday) {
      type = "W-PH" // Weekend PH (no value)
    } else if (isPublicHoliday) {
      type = "PH" // Weekday PH (valuable)
    }

    const monthKey = monthKeyFromDate(current)

    calendar.push({
      date: new Date(current),
      type,
      monthKey,
      monthName: MONTH_NAMES[current.getMonth()],
      timestamp: current.getTime(),
    })

    cursor.setDate(cursor.getDate() + 1)
  }

  return calendar
}

/**
 * Core O(N²) algorithm to find holiday chains based on mode and constraints.
 */
const computeChains = (
  calendar: CalendarDay[],
  mode: HolidayChainMode,
  leavesBudget: number,
  maxPolicy: number
): HolidayChainResult[] => {
  if (calendar.length === 0) return []

  let maxChainLength = 0
  let minTotalLeaves = -1
  const N = calendar.length
  const seenChains = new Map<string, HolidayChainResult>()

  if (mode === "user-total") {
    // User-Total Mode: Find chains using exactly X leaves
    const totalWorkDays = calendar.filter((d) => d.type === "WD").length

    if (leavesBudget < 1 || leavesBudget > totalWorkDays || leavesBudget > 15) {
      return []
    }

    minTotalLeaves = leavesBudget

    for (let S = 0; S < N; S++) {
      const leavesByMonth: Record<string, number> = {}
      let hasWeekdayPublicHoliday = false
      let currentLeavesUsed = 0

      for (let E = S; E < N; E++) {
        const D = calendar[E]

        if (D.type === "WD") {
          const monthKey = D.monthKey
          leavesByMonth[monthKey] = (leavesByMonth[monthKey] || 0) + 1
          currentLeavesUsed++
        }
        if (D.type === "PH") hasWeekdayPublicHoliday = true

        const maxLeavesInAnyMonth = Object.values(leavesByMonth).reduce(
          (max, val) => Math.max(max, val),
          0
        )
        if (maxLeavesInAnyMonth > maxPolicy) break

        if (currentLeavesUsed > leavesBudget) break

        if (hasWeekdayPublicHoliday && currentLeavesUsed === leavesBudget) {
          const monthKeys = Object.keys(leavesByMonth)
          const numMonths = monthKeys.length

          // Constraint: Odd X spanning exactly 2 months MUST be 1 and X-1 split
          if (leavesBudget % 2 !== 0 && numMonths === 2) {
            const L1 = leavesByMonth[monthKeys[0]]
            const L2 = leavesByMonth[monthKeys[1]]
            const isUnevenSplit =
              (L1 === 1 && L2 === leavesBudget - 1) || (L1 === leavesBudget - 1 && L2 === 1)
            if (!isUnevenSplit) continue
          }

          // Constraint: Even X (like 2) spanning 2+ months should distribute evenly (1 per month)
          if (leavesBudget === 2 && numMonths >= 2) {
            const leavesPerMonth = Object.values(leavesByMonth)
            const isEvenDistribution = leavesPerMonth.every(count => count === 1)
            if (!isEvenDistribution) continue
          }

          const currentLength = E - S + 1
          const chainKey = `${calendar[S].timestamp}-${calendar[E].timestamp}`

          if (currentLength >= maxChainLength) {
            if (currentLength > maxChainLength) {
              seenChains.clear()
              maxChainLength = currentLength
            }

            if (!seenChains.has(chainKey)) {
              const result = buildResult(calendar, S, E, leavesBudget)
              seenChains.set(chainKey, result)
            }
          }
        }
      }
    }
  } else {
    // Optimal Mode: Maximize length, minimize leaves
    for (let S = 0; S < N; S++) {
      const leavesByMonth: Record<string, number> = {}
      let hasWeekdayPublicHoliday = false

      for (let E = S; E < N; E++) {
        const D = calendar[E]

        if (D.type === "WD") {
          const monthKey = D.monthKey
          leavesByMonth[monthKey] = (leavesByMonth[monthKey] || 0) + 1
        }
        if (D.type === "PH") hasWeekdayPublicHoliday = true

        const maxLeavesInAnyMonth = Object.values(leavesByMonth).reduce(
          (max, val) => Math.max(max, val),
          0
        )
        if (maxLeavesInAnyMonth > maxPolicy) break

        const totalLeaves = Object.values(leavesByMonth).reduce((sum, val) => sum + val, 0)

        if (hasWeekdayPublicHoliday) {
          const currentLength = E - S + 1
          const chainKey = `${calendar[S].timestamp}-${calendar[E].timestamp}`

          // Tie-breaking: Length (maximized) > Leaves (minimized)
          if (currentLength > maxChainLength) {
            seenChains.clear()
            maxChainLength = currentLength
            minTotalLeaves = totalLeaves
            const result = buildResult(calendar, S, E, totalLeaves)
            seenChains.set(chainKey, result)
          } else if (currentLength === maxChainLength) {
            if (minTotalLeaves === -1 || totalLeaves < minTotalLeaves) {
              seenChains.clear()
              minTotalLeaves = totalLeaves
              const result = buildResult(calendar, S, E, totalLeaves)
              seenChains.set(chainKey, result)
            } else if (totalLeaves === minTotalLeaves) {
              if (!seenChains.has(chainKey)) {
                const result = buildResult(calendar, S, E, totalLeaves)
                seenChains.set(chainKey, result)
              }
            }
          }
        }
      }
    }
  }

  return Array.from(seenChains.values())
}

const buildResult = (
  calendar: CalendarDay[],
  startIndex: number,
  endIndex: number,
  leaves: number
): HolidayChainResult => {
  const slice = calendar.slice(startIndex, endIndex + 1)
  const dates = slice.map((day) => new Date(day.date))
  const leaveDates = slice.filter((day) => day.type === "WD").map((day) => new Date(day.date))

  const start = new Date(slice[0]?.date ?? 0)
  const end = new Date(slice[slice.length - 1]?.date ?? 0)
  const monthKeys = Array.from(new Set(slice.map((day) => day.monthKey)))

  return {
    id: `${slice[0]?.timestamp ?? 0}-${slice[slice.length - 1]?.timestamp ?? 0}`,
    start,
    end,
    length: slice.length,
    leaves,
    dates,
    leaveDates,
    monthKeys,
  }
}

/**
 * Calculates the array of optimal holiday chain possibilities based on the given mode.
 * @param options - Configuration including mode, dates, holidays, and constraints
 * @returns Array of the best chain possibilities found
 */
export const calculateHolidayChains = (
  options: CalculateHolidayChainsOptions
): HolidayChainResult[] => {
  const holidayDates = normalizeUniqueDates(options.holidayDates)
  const calendar = buildCalendar(options.startDate, options.endDate, holidayDates)
  if (!calendar.length) {
    return []
  }

  const leavesBudget = options.mode === "user-total" ? options.leavesBudget ?? 0 : 0
  const chains = computeChains(calendar, options.mode, leavesBudget, options.maxLeavesPerMonth)

  return chains
}
