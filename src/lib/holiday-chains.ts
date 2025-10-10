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
 * Finds all possible chains per month, respecting max leaves per month and overflow rules
 */
const computeChainsPerMonth = (
  calendar: CalendarDay[],
  mode: HolidayChainMode,
  leavesBudget: number,
  maxPolicy: number
): HolidayChainResult[] => {
  if (calendar.length === 0) return []

  // Group calendar days by month
  const daysByMonth = new Map<string, { days: CalendarDay[]; startIndex: number }>()
  calendar.forEach((day, index) => {
    if (!daysByMonth.has(day.monthKey)) {
      daysByMonth.set(day.monthKey, { days: [], startIndex: index })
    }
    daysByMonth.get(day.monthKey)!.days.push(day)
  })

  const allChains: HolidayChainResult[] = []
  const usedMonths = new Set<string>()

  // Process each month independently
  for (const [monthKey, { startIndex }] of daysByMonth) {
    if (usedMonths.has(monthKey)) continue

    const monthChains = new Map<string, HolidayChainResult>()
    let maxLength = 0
    let minLeaves = Infinity

    // Try all possible chains starting from this month
    for (let S = startIndex; S < calendar.length; S++) {
      const leavesByMonth: Record<string, number> = {}
      let hasWeekdayPublicHoliday = false
      let currentLeavesUsed = 0
      let chainStartMonth = calendar[S].monthKey

      // Only process chains that start in this month
      if (chainStartMonth !== monthKey) break

      for (let E = S; E < calendar.length; E++) {
        const D = calendar[E]

        if (D.type === "WD") {
          leavesByMonth[D.monthKey] = (leavesByMonth[D.monthKey] || 0) + 1
          currentLeavesUsed++
        }
        if (D.type === "PH") hasWeekdayPublicHoliday = true

        const maxLeavesInAnyMonth = Object.values(leavesByMonth).reduce(
          (max, val) => Math.max(max, val),
          0
        )
        if (maxLeavesInAnyMonth > maxPolicy) break

        const monthKeys = Object.keys(leavesByMonth)
        const numMonths = monthKeys.length

        // Don't allow chains spanning more than 2 months
        if (numMonths > 2) break

        // Check user-total mode constraints
        if (mode === "user-total") {
          if (currentLeavesUsed > leavesBudget) break

          if (hasWeekdayPublicHoliday && currentLeavesUsed === leavesBudget) {
            // Constraint: Odd X spanning exactly 2 months MUST be 1 and X-1 split
            if (leavesBudget % 2 !== 0 && numMonths === 2) {
              const L1 = leavesByMonth[monthKeys[0]]
              const L2 = leavesByMonth[monthKeys[1]]
              const isUnevenSplit =
                (L1 === 1 && L2 === leavesBudget - 1) || (L1 === leavesBudget - 1 && L2 === 1)
              if (!isUnevenSplit) continue
            }

            // Constraint: Even X spanning 2+ months should distribute evenly
            if (leavesBudget === 2 && numMonths >= 2) {
              const leavesPerMonth = Object.values(leavesByMonth)
              const isEvenDistribution = leavesPerMonth.every(count => count === 1)
              if (!isEvenDistribution) continue
            }

            const currentLength = E - S + 1
            const chainKey = `${calendar[S].timestamp}-${calendar[E].timestamp}`

            // Keep all chains with max length
            if (currentLength >= maxLength) {
              if (currentLength > maxLength) {
                monthChains.clear()
                maxLength = currentLength
                minLeaves = currentLeavesUsed
              }
              if (!monthChains.has(chainKey)) {
                monthChains.set(chainKey, buildResult(calendar, S, E, currentLeavesUsed))
              }
            }
          }
        } else {
          // Optimal mode
          if (hasWeekdayPublicHoliday) {
            const currentLength = E - S + 1
            const chainKey = `${calendar[S].timestamp}-${calendar[E].timestamp}`

            // Keep all chains with max length and min leaves
            if (currentLength > maxLength || (currentLength === maxLength && currentLeavesUsed <= minLeaves)) {
              if (currentLength > maxLength) {
                monthChains.clear()
                maxLength = currentLength
                minLeaves = currentLeavesUsed
              } else if (currentLeavesUsed < minLeaves) {
                monthChains.clear()
                minLeaves = currentLeavesUsed
              }

              if (currentLeavesUsed === minLeaves && !monthChains.has(chainKey)) {
                monthChains.set(chainKey, buildResult(calendar, S, E, currentLeavesUsed))
              }
            }
          }
        }
      }
    }

    // Add all chains found for this month
    monthChains.forEach(chain => {
      allChains.push(chain)
      // Mark all months touched by this chain as used
      chain.monthKeys.forEach(mk => usedMonths.add(mk))
    })
  }

  return allChains
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
  const chains = computeChainsPerMonth(calendar, options.mode, leavesBudget, options.maxLeavesPerMonth)

  return chains
}
