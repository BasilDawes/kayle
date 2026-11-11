import { DAILY_VALUES } from "$lib"
import type { NumericNutrientKey } from "$lib/services/DiningCourtService"

const { servingSize: _, servingsPerContainer: __, ...dailyValueDefaults } = DAILY_VALUES

// Models available through OpenRouter. All must support vision + JSON output.
export const MODELS = [
  "openai/gpt-6-luna",
  "google/gemini-2.5-flash",
  "google/gemini-3.8-flash",
  "anthropic/claude-haiku-5.5",
] as const

export type Model = (typeof MODELS)[number]

const DEFAULT_MODEL: Model = MODELS[0]

export const DEFAULT_MEAL_SUGGESTION_PROMPT =
  "Suggest 3 nutritious, balanced meals following the USDA myplate guidelines. All the items for one meal must come from the same location."

const KEYS = {
  openrouter: "kayle_openrouter_key",
  openfoodfacts: "kayle_off_key",
  dailyValues: "kayle_daily_values",
  model: "kayle_model",
  mealSuggestionPrompt: "kayle_meal_suggestion_prompt",
} as const

function load(key: string): string {
  if (typeof localStorage === "undefined") return ""
  return localStorage.getItem(key) ?? ""
}

function loadDailyValues(): Record<NumericNutrientKey, number> {
  const raw = load(KEYS.dailyValues)
  if (!raw) return { ...dailyValueDefaults }
  try {
    const parsed = JSON.parse(raw) as Partial<Record<NumericNutrientKey, number>>
    return { ...dailyValueDefaults, ...parsed }
  } catch {
    return { ...dailyValueDefaults }
  }
}

function persistDailyValues(values: Record<NumericNutrientKey, number>) {
  localStorage.setItem(KEYS.dailyValues, JSON.stringify(values))
}

function loadModel(): Model {
  const raw = load(KEYS.model)
  return (MODELS as readonly string[]).includes(raw) ? (raw as Model) : DEFAULT_MODEL
}

function loadMealSuggestionPrompt(): string {
  const raw = load(KEYS.mealSuggestionPrompt)
  return raw !== "" ? raw : DEFAULT_MEAL_SUGGESTION_PROMPT
}

function createSettings() {
  let openrouterKey = $state(load(KEYS.openrouter))
  let openfoodfactsKey = $state(load(KEYS.openfoodfacts))
  let model = $state(loadModel())
  let dailyValues = $state(loadDailyValues())
  let mealSuggestionPrompt = $state(loadMealSuggestionPrompt())

  return {
    get openrouterKey() {
      return openrouterKey
    },
    setOpenrouterKey(v: string) {
      openrouterKey = v
      localStorage.setItem(KEYS.openrouter, v)
    },
    get openfoodfactsKey() {
      return openfoodfactsKey
    },
    setOpenfoodfactsKey(v: string) {
      openfoodfactsKey = v
      localStorage.setItem(KEYS.openfoodfacts, v)
    },
    get model() {
      return model
    },
    setModel(v: Model) {
      model = v
      localStorage.setItem(KEYS.model, v)
    },
    get mealSuggestionPrompt() {
      return mealSuggestionPrompt
    },
    setMealSuggestionPrompt(v: string) {
      mealSuggestionPrompt = v
      localStorage.setItem(KEYS.mealSuggestionPrompt, v)
    },
    get hasOpenrouter() {
      return openrouterKey.trim().length > 0
    },
    get dailyValues() {
      return dailyValues
    },
    getDailyValue(key: NumericNutrientKey): number {
      return dailyValues[key]
    },
    isNutrientVisible(key: NumericNutrientKey): boolean {
      return dailyValues[key] !== -1
    },
    setDailyValue(key: NumericNutrientKey, value: number) {
      dailyValues = { ...dailyValues, [key]: value }
      persistDailyValues(dailyValues)
    },
    resetDailyValues() {
      dailyValues = { ...dailyValueDefaults }
      persistDailyValues(dailyValues)
    },
  }
}

export const settings = createSettings()
