import { getAllFoods } from "$lib/integrations/hfsGraphQL"
import { askAI, generateStructured } from "$lib/integrations/openai"
import type { Nutrients } from "$lib/models/meal"
import type { NumericNutrientKey } from "$lib/services/DiningCourtService"
import { unscaleNutrientValue } from "$lib/utils/nutrientUnits"
import { settings, DEFAULT_MEAL_SUGGESTION_PROMPT } from "$lib/stores/settings.svelte"
import { z } from "zod"

export const LLMNutrientsSchema = z.object({
  calories: z.number().describe("Calories"),
  totalFatGrams: z.number().describe("Total fat in grams"),
  saturatedFatGrams: z.number().describe("Saturated fat in grams"),
  transFatGrams: z.number().describe("Trans fat in grams"),
  cholesterolMilligrams: z.number().describe("Cholesterol in milligrams"),
  sodiumMilligrams: z.number().describe("Sodium in milligrams"),
  totalCarbohydrateGrams: z.number().describe("Total carbohydrate in grams"),
  dietaryFiberGrams: z.number().describe("Dietary fiber in grams"),
  totalSugarsGrams: z.number().describe("Total sugars in grams"),
  addedSugarsGrams: z.number().describe("Added sugars in grams"),
  proteinGrams: z.number().describe("Protein in grams"),
  vitaminDMicrograms: z.number().describe("Vitamin D in micrograms"),
  vitaminCMilligrams: z.number().describe("Vitamin C in milligrams"),
  calciumMilligrams: z.number().describe("Calcium in milligrams"),
  ironMilligrams: z.number().describe("Iron in milligrams"),
  potassiumMilligrams: z.number().describe("Potassium in milligrams"),
})
export type LLMNutrients = z.infer<typeof LLMNutrientsSchema>

export const RawFoodAnalysisSchema = z.object({
  title: z.string().describe("Comma-separated list of items seen, no quantities"),
  nutrients: LLMNutrientsSchema,
})
export type RawFoodAnalysis = z.infer<typeof RawFoodAnalysisSchema>

export interface FoodAnalysis {
  title: string
  nutrients: Nutrients
}

export const ServingAnalysisSchema = z.object({
  servings: z
    .record(z.string(), z.number())
    .describe("Map of food items with multiple of its serving size"),
  unknowns: z
    .array(z.string())
    .describe("List of foods and portions consumed not in the menu context"),
})
export type ServingAnalysis = z.infer<typeof ServingAnalysisSchema>

export const LLMService = {
  async analyzeFood(
    apiKey: string,
    imageDataUrl: string | undefined,
    textDescription?: string,
  ): Promise<FoodAnalysis> {
    const prompt = imageDataUrl
      ? "Analyze the food in this image. Title should be a comma-separated list of items seen with no quantities. Estimate the nutrition values."
      : `The user described what they ate as: "${textDescription}". Title should be a comma-separated list of items seen with no quantities. Estimate the nutrition values.`

    const result = await generateStructured({
      apiKey,
      prompt,
      imageDataUrl,
      schema: RawFoodAnalysisSchema,
      schemaName: "FoodAnalysis",
      schemaDescription: "Identified foods and estimated nutritional values",
    })

    return {
      title: result.title,
      nutrients: LLMNutrientsToNormal(result.nutrients),
    }
  },

  async analyzeDiningCourtMeal(
    apiKey: string,
    imageDataUrl: string | undefined,
    menuContext: string,
    textDescription?: string,
  ): Promise<ServingAnalysis> {
    const foodSource = imageDataUrl
      ? "the food in this image"
      : `what the user described: "${textDescription}"`
    const prompt = [
      "Here are some foods and their serving sizes (menu context):",
      menuContext,
      "",
      `Now, analyze ${foodSource}.`,
      "Identify the servings consumed for items in the menu context, and list any unknown foods consumed that aren't in the menu context.",
    ].join("\n")

    return generateStructured({
      apiKey,
      prompt,
      imageDataUrl,
      schema: ServingAnalysisSchema,
      schemaName: "ServingAnalysis",
      schemaDescription: "Servings of menu items and unknown foods",
    })
  },

  async suggestMeals(apiKey: string): Promise<string> {
    const menuContext = JSON.stringify(await getAllFoods())

    const prompt = [
      settings.mealSuggestionPrompt || DEFAULT_MEAL_SUGGESTION_PROMPT,
      "",
      menuContext,
      "",
      "Describe each meal in 1 sentence, each on its own bullet point. This is all for the same meal period",
    ].join("\n")

    return askAI(apiKey, prompt)
  },
}

// LLM outputs Nutrients struct, but with units affixed. Example: `totalFatGrams` must become `totalFat`
// Needed because LLM sometimes doesn't normalize to grams when asked. This will also allow me to use a cheaper non-thinking model.
function LLMNutrientsToNormal(llmNutrients: LLMNutrients): Nutrients {
  const nutrients: Nutrients = {}
  for (const [nutrient, quantity] of Object.entries(llmNutrients)) {
    const noUnitNutrient = nutrient.replace(/Grams|Milligrams|Micrograms/, "") as NumericNutrientKey
    nutrients[noUnitNutrient] = unscaleNutrientValue(noUnitNutrient, quantity)
  }
  return nutrients
}
