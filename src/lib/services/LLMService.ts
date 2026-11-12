import { getAllFoods } from "$lib/integrations/hfsGraphQL"
import { askAI, generateStructured } from "$lib/integrations/openai"
import type { Nutrients } from "$lib/models/meal"
import type { NumericNutrientKey, MealDescriptor } from "$lib/services/DiningCourtService"
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

export const RawServingItemSchema = z.object({
  name: z.string().describe("Food item name from menu context"),
  servings: z.number().describe("Multiple of its serving size consumed"),
})

export const RawServingAnalysisSchema = z.object({
  servings: z
    .array(RawServingItemSchema)
    .describe("List of food items and their consumed serving multiple"),
  unknowns: z
    .array(z.string())
    .describe("List of foods and portions consumed not in the menu context"),
})
export type RawServingAnalysis = z.infer<typeof RawServingAnalysisSchema>

export interface ServingAnalysis {
  servings: Record<string, number>
  unknowns: string[]
}

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

    const result = await generateStructured({
      apiKey,
      prompt,
      imageDataUrl,
      schema: RawServingAnalysisSchema,
      schemaName: "ServingAnalysis",
      schemaDescription: "Servings of menu items and unknown foods",
    })

    const servings: Record<string, number> = {}
    for (const item of result.servings) {
      servings[item.name] = item.servings
    }

    return {
      servings,
      unknowns: result.unknowns,
    }
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

  async generateMealPlan(
    apiKey: string,
    meal: MealDescriptor,
    selectedCourts: string[],
    customPrompt?: string,
  ): Promise<PlanResponse> {
    const allFoods = await getAllFoods(meal, selectedCourts)
    // Only pass courts that have menu items available at this time
    const availableMenus = Object.fromEntries(
      Object.entries(allFoods).filter(
        ([name, foods]) => selectedCourts.includes(name) && foods.length > 0,
      ),
    )

    const menuContext = JSON.stringify(availableMenus, null, 2)
    const basePrompt =
      customPrompt || settings.mealSuggestionPrompt || DEFAULT_MEAL_SUGGESTION_PROMPT

    const prompt = [
      basePrompt,
      "",
      "AVAILABLE DINING COURT MENUS FOR THIS TIME:",
      menuContext,
      "",
      "STRICT INSTRUCTIONS:",
      "1. For each dining court in the menu, provide multiple distinct meal options (at least 2 to 3 options per location if enough items exist).",
      "2. All items for a given meal must come exclusively from that same dining court.",
      "3. Each option must focus on fulfilling the USDA MyPlate food groups: fruits, vegetables, grains, protein, and dairy.",
      "4. Do NOT calculate or output macros or calories. Categorize food items into their MyPlate food groups.",
      "5. Use the exact food item names as they appear in the menu. Never make up items or make ingredient assumptions.",
      "6. If a dining court does not have enough options to make a balanced meal, indicate that in notes or missingFoodGroups; do NOT invent foods.",
    ].join("\n")

    return generateStructured({
      apiKey,
      prompt,
      schema: PlanResponseSchema,
      schemaName: "PlanResponse",
      schemaDescription: "USDA MyPlate meal recommendations for dining courts",
    })
  },
}

export const MyPlateFoodGroupEnum = z.enum([
  "fruits",
  "vegetables",
  "grains",
  "protein",
  "dairy",
])
export type MyPlateFoodGroup = z.infer<typeof MyPlateFoodGroupEnum>

export const MyPlatePlanItemSchema = z.object({
  name: z.string().describe("Exact food item name as listed in the dining court menu"),
  portion: z.string().optional().describe("Portion guidance, e.g. '1 cup' or '1 serving'"),
  foodGroups: z
    .array(MyPlateFoodGroupEnum)
    .describe("MyPlate food groups fulfilled by this specific item"),
})
export type MyPlatePlanItem = z.infer<typeof MyPlatePlanItemSchema>

export const MyPlateMealOptionSchema = z.object({
  title: z
    .string()
    .describe("Short descriptive meal title, e.g. 'Baked Fish with Steamed Greens & Brown Rice'"),
  description: z
    .string()
    .describe("Brief 1-2 sentence explanation of how this meal meets USDA MyPlate nutritional guidelines"),
  items: z
    .array(MyPlatePlanItemSchema)
    .describe("Menu items that make up this meal. MUST only come from this location's menu"),
  foodGroupsFulfilled: z
    .array(MyPlateFoodGroupEnum)
    .describe("All USDA MyPlate food groups fulfilled by this meal (fruits, vegetables, grains, protein, dairy)"),
  missingFoodGroups: z
    .array(MyPlateFoodGroupEnum)
    .optional()
    .describe("Any MyPlate food groups not fulfilled if options were limited"),
})
export type MyPlateMealOption = z.infer<typeof MyPlateMealOptionSchema>

export const LocationMealPlanSchema = z.object({
  location: z.string().describe("Name of the dining court"),
  options: z
    .array(MyPlateMealOptionSchema)
    .describe("Multiple (at least 2-3) distinct meal options for this dining court"),
  notes: z
    .string()
    .optional()
    .describe("Notes on menu availability or if no good options exist"),
})
export type LocationMealPlan = z.infer<typeof LocationMealPlanSchema>

export const PlanResponseSchema = z.object({
  locations: z.array(LocationMealPlanSchema).describe("Meal suggestions per dining court"),
})
export type PlanResponse = z.infer<typeof PlanResponseSchema>

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
