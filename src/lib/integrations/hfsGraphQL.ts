import { GraphQLClient } from "graphql-request"
import { getSdk } from "./generated"
import type { MealDescriptor } from "$lib/services/DiningCourtService"
import { DayOverviewQuery } from "$lib/queries/DayOverviewQuery"
import { resolve } from "$app/paths"

const client = new GraphQLClient((globalThis?.location?.origin ?? "") + resolve("/menu-api"))

export const sdk = getSdk(client)

export interface DiningCourtLocation {
  name: string
  latitude: number | null
  longitude: number | null
  category: string
}

// Needed over toISOString because if late in the day, will think it's the next day
export function localISODate(today: Date) {
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-")
}

export function getCurrentMeals<T extends { startTime?: any; endTime?: any }>(
  meals: T[] | null | undefined,
  meal: MealDescriptor,
) {
  const now = new Date(`${meal.date}T${meal.time}`)
  return (
    meals?.filter((meal) => {
      if (!meal.startTime || !meal.endTime) return false
      const start = new Date(meal.startTime)
      const end = new Date(meal.endTime)
      return now >= start && now < end
    }) ?? []
  )
}

export async function getLocations(meal: MealDescriptor, abortSignal?: AbortSignal) {
  const data = await sdk.diningCourts({ date: meal.date }, undefined, abortSignal)

  return (data.diningCourts ?? [])
    .map((court) => {
      const currentMeals = getCurrentMeals(court?.dailyMenu?.meals, meal)

      return {
        ...court,
        dailyMenu: currentMeals,
      }
    })
    .filter((court) => court.dailyMenu.length > 0)
}

export async function getMenu(location: MealDescriptor) {
  const data = await sdk.getMenu({
    date: location.date,
    location: location.name,
  })

  const currentMeals = getCurrentMeals(data.diningCourtByName?.dailyMenu?.meals, location)

  const items = currentMeals.flatMap((meal) =>
    meal.stations.flatMap((station) =>
      station.items.flatMap((entry) => [
        entry.item,
        ...(entry.components ?? []).map((component) => component.item),
      ]),
    ),
  )

  // Don't include items with no nutrition facts
  return items.filter(
    (
      item,
    ): item is typeof item & {
      nutritionFacts: NonNullable<typeof item.nutritionFacts>
    } => item.nutritionFacts != null,
  )
}

export async function getAllFoods(
  meal: MealDescriptor = {
    name: "all",
    date: DayOverviewQuery.today(),
    time: DayOverviewQuery.nowTime(),
  },
  courtsToInclude?: string[],
): Promise<Record<string, string[]>> {
  const data = await sdk.allFoods({ date: meal.date })
  const diningCourts = (data.diningCourts ?? []).filter((court) => {
    if (!court?.name) return false
    if (courtsToInclude && courtsToInclude.length > 0 && !courtsToInclude.includes(court.name)) {
      return false
    }
    return true
  })

  return Object.fromEntries(
    diningCourts.map((court) => [
      court?.name,
      getCurrentMeals(court?.dailyMenu?.meals, meal).flatMap((meal) =>
        meal.stations.flatMap((station) => station.items.map((item) => item.item.name)),
      ),
    ]),
  )
}

;(globalThis as any).getLocations = getLocations
