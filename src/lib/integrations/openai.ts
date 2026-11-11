import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { generateText, Output, type FlexibleSchema } from "ai"
import { settings } from "$lib/stores/settings.svelte"

function getClient(apiKey: string) {
  return createOpenRouter({
    apiKey,
  })
}

function getModel(apiKey: string) {
  const client = getClient(apiKey)
  return client(settings.model, {
    plugins: [{ id: "response-healing" }],
  })
}

/*
Which model to use?
4o and 5.4-mini are surprisingly the same cost, kinda expensive. I estimated at my usage, would cost $20/yr
Not bad, but I think I can do better

Deciding between 4o-mini, 5-nano, or 5.4-nano (all roughly same cost, with 5.4 most expensive)

https://developers.openai.com/api/docs/models/all
https://developers.openai.com/api/docs/pricing
 */

export async function askAI(apiKey: string, prompt: string): Promise<string> {
  const model = getModel(apiKey)
  const { text } = await generateText({
    model,
    prompt,
  })

  return text
}

export interface GenerateStructuredOptions<T> {
  apiKey: string
  prompt: string
  schema: FlexibleSchema<T>
  imageDataUrl?: string
  schemaName?: string
  schemaDescription?: string
}

export async function generateStructured<T>({
  apiKey,
  prompt,
  schema,
  imageDataUrl,
  schemaName,
  schemaDescription,
}: GenerateStructuredOptions<T>): Promise<T> {
  const model = getModel(apiKey)

  const { output } = await generateText({
    model,
    output: Output.object({
      schema,
      name: schemaName,
      description: schemaDescription,
    }),
    messages: [
      {
        role: "user",
        content: imageDataUrl
          ? [
              { type: "text", text: prompt },
              { type: "image", image: imageDataUrl },
            ]
          : [{ type: "text", text: prompt }],
      },
    ],
  })

  return output
}

export async function analyzeText<T>(
  apiKey: string,
  prompt: string,
  schema: FlexibleSchema<T>,
): Promise<T> {
  return generateStructured({ apiKey, prompt, schema })
}

export async function analyzeImage<T>(
  apiKey: string,
  imageDataUrl: string,
  prompt: string,
  schema: FlexibleSchema<T>,
): Promise<T> {
  return generateStructured({ apiKey, prompt, imageDataUrl, schema })
}
