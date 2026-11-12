import { localISODate } from "$lib/integrations/hfsGraphQL"
import type { Nutrients } from "$lib/models/meal"
import { MealRepository } from "$lib/repositories/MealRepository"
import {
  DiningCourtService,
  NUMERIC_NUTRIENT_LABELS,
  type NumericNutrientKey,
} from "$lib/services/DiningCourtService"
import { getNutrientBreakdown, type NutrientContribution } from "$lib/utils/nutrientBreakdown"

export interface NutrientTrendPoint {
  date: string
  label: string
  value: number
  hasMeals: boolean
  entries: NutrientContribution[]
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function mondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const offset = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + offset)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  })
}

export const NutrientTrendsQuery = {
  async forPastWeek(nutrient: NumericNutrientKey): Promise<NutrientTrendPoint[]> {
    return this.forDays(nutrient, new Date(), 7)
  },

  async forDays(
    nutrient: NumericNutrientKey,
    endDate: Date,
    numDays: number = 7,
  ): Promise<NutrientTrendPoint[]> {
    const end = new Date(endDate)
    end.setHours(0, 0, 0, 0)

    const start = addDays(end, -(numDays - 1))
    const meals = await MealRepository.getBetweenDates(localISODate(start), localISODate(end))
    const totalsByDate = new Map<string, Nutrients>()
    const entriesByDate = new Map<string, NutrientContribution[]>()
    const mealCountsByDate = new Map<string, number>()

    for (const meal of meals) {
      const current = totalsByDate.get(meal.date) ?? {}
      totalsByDate.set(meal.date, DiningCourtService.addNutrients(current, meal.nutrients))
      entriesByDate.set(meal.date, [
        ...(entriesByDate.get(meal.date) ?? []),
        ...getNutrientBreakdown([meal], nutrient),
      ])
      mealCountsByDate.set(meal.date, (mealCountsByDate.get(meal.date) ?? 0) + 1)
    }

    return Array.from({ length: numDays }, (_, index) => {
      const date = addDays(start, index)
      const isoDate = localISODate(date)
      const nutrients = totalsByDate.get(isoDate) ?? {}
      const entries = [...(entriesByDate.get(isoDate) ?? [])].sort((a, b) => b.value - a.value)

      return {
        date: isoDate,
        label: formatLabel(date),
        value: nutrients[nutrient] ?? 0,
        hasMeals: (mealCountsByDate.get(isoDate) ?? 0) > 0,
        entries,
      }
    })
  },

  async forWeeks(
    nutrient: NumericNutrientKey,
    endWeekDate: Date,
    numWeeks: number = 6,
  ): Promise<NutrientTrendPoint[]> {
    const end = mondayOf(endWeekDate)
    const startDate = addDays(end, -7 * (numWeeks - 1))
    const endDate = addDays(end, 6)

    const meals = await MealRepository.getBetweenDates(
      localISODate(startDate),
      localISODate(endDate),
    )

    const totalsByDate = new Map<string, Nutrients>()
    const entriesByDate = new Map<string, NutrientContribution[]>()
    const mealCountsByDate = new Map<string, number>()

    for (const meal of meals) {
      const current = totalsByDate.get(meal.date) ?? {}
      totalsByDate.set(meal.date, DiningCourtService.addNutrients(current, meal.nutrients))
      entriesByDate.set(meal.date, [
        ...(entriesByDate.get(meal.date) ?? []),
        ...getNutrientBreakdown([meal], nutrient),
      ])
      mealCountsByDate.set(meal.date, (mealCountsByDate.get(meal.date) ?? 0) + 1)
    }

    const points: NutrientTrendPoint[] = []

    for (let i = 0; i < numWeeks; i++) {
      const weekStart = addDays(startDate, i * 7)

      let sumDailyValues = 0
      let loggedDaysInWeek = 0
      const allEntriesInWeek: NutrientContribution[] = []

      for (let day = 0; day < 7; day++) {
        const d = addDays(weekStart, day)
        const isoDate = localISODate(d)

        const hasMeals = (mealCountsByDate.get(isoDate) ?? 0) > 0
        if (hasMeals) {
          const nutrients = totalsByDate.get(isoDate) ?? {}
          sumDailyValues += nutrients[nutrient] ?? 0
          loggedDaysInWeek++

          const dailyEntries = entriesByDate.get(isoDate) ?? []
          allEntriesInWeek.push(...dailyEntries)
        }
      }

      // Group entries by food name and sum values, sorting descending and taking top 15
      const aggregatedMap = new Map<string, number>()
      for (const entry of allEntriesInWeek) {
        aggregatedMap.set(entry.name, (aggregatedMap.get(entry.name) ?? 0) + entry.value)
      }
      const sortedEntries = Array.from(aggregatedMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 15)

      const hasMeals = loggedDaysInWeek > 0
      const averageValue = hasMeals ? sumDailyValues / loggedDaysInWeek : 0

      points.push({
        date: localISODate(weekStart),
        label: formatLabel(weekStart),
        value: averageValue,
        hasMeals,
        entries: sortedEntries,
      })
    }

    return points
  },

  labelFor(nutrient: NumericNutrientKey): string {
    return NUMERIC_NUTRIENT_LABELS[nutrient]
  },
}
