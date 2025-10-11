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
}

const addDays = (date: Date, days: number): Date => {
  const newDate = new Date(date)
  newDate.setDate(newDate.getDate() + days)
  return newDate
}

const getDaysBetween = (start: Date, end: Date): Date[] => {
  if (start > end) return []
  const days: Date[] = []
  let current = new Date(start)
  while (current <= end) {
    days.push(new Date(current))
    current = addDays(current, 1)
  }
  return days
}

const monthKeyFromDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`

/**
 * The primary function to calculate holiday chains based on the refined logic.
 */
export const calculateHolidayChains = (
  options: CalculateHolidayChainsOptions
): HolidayChainResult[] => {
  const { startDate, endDate, holidayDates: rawHolidayDates, mode } = options
  const leavesBudget =
    mode === "user-total" ? Math.max(0, options.leavesBudget ?? 0) : 2

  if (leavesBudget === 0 || rawHolidayDates.length === 0) return []

  const normalizedStartDate = normalizeDate(startDate)
  const normalizedEndDate = normalizeDate(endDate)

  // Create a set of all "off days" (weekends and holidays) for quick lookups.
  const offDays = new Set<string>()
  const holidaySet = new Set<string>()
  
  // FIX 1: Use a Set of strings for proper deduplication.
  new Set(rawHolidayDates.map(d => dateKey(normalizeDate(d)))).forEach(key => {
    holidaySet.add(key)
  });

  for (
    let d = new Date(normalizedStartDate);
    d <= normalizedEndDate;
    d = addDays(d, 1)
  ) {
    const day = d.getDay()
    const key = dateKey(d)
    if (day === 0 || day === 6 || holidaySet.has(key)) {
      offDays.add(key)
    }
  }

  // 1. Identify and merge consecutive holidays/weekends into "anchor blocks".
  const anchorBlocks: Date[][] = []
  const sortedHolidays = [...holidaySet].map(key => new Date(key)).sort(
    (a, b) => a.getTime() - b.getTime()
  )

  if (sortedHolidays.length > 0) {
    let currentBlock = [sortedHolidays[0]]
    for (let i = 1; i < sortedHolidays.length; i++) {
      const prevDate = sortedHolidays[i - 1]
      const currentDate = sortedHolidays[i]
      
      let cursor = addDays(prevDate, 1)
      let isConsecutive = false
      while(cursor <= currentDate) {
        if (isSameDay(cursor, currentDate)) {
          isConsecutive = true
          break
        }
        if (!offDays.has(dateKey(cursor))) {
          isConsecutive = false
          break
        }
        cursor = addDays(cursor, 1)
      }

      if (isConsecutive) {
        getDaysBetween(addDays(prevDate, 1), currentDate).forEach(d => currentBlock.push(d))
      } else {
        anchorBlocks.push(currentBlock)
        currentBlock = [currentDate]
      }
    }
    anchorBlocks.push(currentBlock)
  }

  const allChains: HolidayChainResult[] = []
  const seenChains = new Set<string>()

  // 2. For each anchor block, generate all possible leave combinations.
  for (const block of anchorBlocks) {
    const blockStart = block[0]
    const blockEnd = block[block.length - 1]

    // Slide the window of leave days
    for (let leavesBefore = leavesBudget; leavesBefore >= 0; leavesBefore--) {
      const leavesAfter = leavesBudget - leavesBefore

      const potentialLeaveDates: Date[] = []
      let isValidPlacement = true

      // Find workdays for leave BEFORE the block
      let cursor = addDays(blockStart, -1)
      for (let i = 0; i < leavesBefore; i++) {
        // FIX 2: Enforce range bounds.
        while (offDays.has(dateKey(cursor)) && cursor >= normalizedStartDate) {
          cursor = addDays(cursor, -1)
        }
        if (cursor < normalizedStartDate || cursor.getFullYear() < blockStart.getFullYear()) {
          isValidPlacement = false
          break
        }
        potentialLeaveDates.unshift(cursor)
        cursor = addDays(cursor, -1)
      }
      if (!isValidPlacement) continue

      // Find workdays for leave AFTER the block
      cursor = addDays(blockEnd, 1)
      for (let i = 0; i < leavesAfter; i++) {
        // FIX 2: Enforce range bounds.
        while (offDays.has(dateKey(cursor)) && cursor <= normalizedEndDate) {
          cursor = addDays(cursor, 1)
        }
        if (cursor > normalizedEndDate) {
            isValidPlacement = false
            break
        }
        potentialLeaveDates.push(cursor)
        cursor = addDays(cursor, 1)
      }
      if (!isValidPlacement || potentialLeaveDates.length !== leavesBudget) continue

      // 3. Expand the chain to include all adjacent off days.
      let chainStart = potentialLeaveDates[0] ?? blockStart
      let chainEnd =
        potentialLeaveDates[potentialLeaveDates.length - 1] ?? blockEnd

      while (addDays(chainStart, -1) >= normalizedStartDate && offDays.has(dateKey(addDays(chainStart, -1)))) {
        chainStart = addDays(chainStart, -1)
      }
      while (addDays(chainEnd, 1) <= normalizedEndDate && offDays.has(dateKey(addDays(chainEnd, 1)))) {
        chainEnd = addDays(chainEnd, 1)
      }
      
      const dates = getDaysBetween(chainStart, chainEnd)
      const id = `${dateKey(chainStart)}-${dateKey(chainEnd)}`

      if (!seenChains.has(id)) {
        const leaveDates = dates.filter(d => !offDays.has(dateKey(d)))
        const monthKeys = [...new Set(dates.map(monthKeyFromDate))].sort()
        allChains.push({
          id,
          start: chainStart,
          end: chainEnd,
          length: dates.length,
          leaves: leaveDates.length,
          dates,
          leaveDates,
          monthKeys,
        })
        seenChains.add(id)
      }
    }
  }
  
  // Sort by length (desc), then by start date (asc) for stable ordering
  allChains.sort((a, b) => {
    if (b.length !== a.length) {
      return b.length - a.length
    }
    return a.start.getTime() - b.start.getTime()
  })

  return allChains
}

// Helper function not in original code, but useful for the anchor block logic
const isSameDay = (a: Date, b: Date) => {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
}