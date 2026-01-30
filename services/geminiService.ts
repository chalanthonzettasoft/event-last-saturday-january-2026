import { GoogleGenerativeAI, SchemaType, GenerationConfig } from "@google/generative-ai";
import { WordEntry } from "../types";

/**
 * List of models that support generateContent (Reference):
 * - models/gemini-2.5-flash
 * - models/gemini-2.5-pro
 * - models/gemini-2.0-flash
 * - models/gemini-3-flash-preview
 * ... (full list available in tools/check_models.go)
 */

const MODEL_NAME = "gemini-3-flash-preview";

// Configuration for consistent response format
const GENERATION_CONFIG: GenerationConfig = {
    responseMimeType: "application/json",
    responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
            groups: {
                type: SchemaType.ARRAY,
                items: {
                    type: SchemaType.OBJECT,
                    properties: {
                        masterText: { type: SchemaType.STRING },
                        idsToMerge: { 
                            type: SchemaType.ARRAY,
                            items: { type: SchemaType.STRING } 
                        }
                    },
                    required: ["masterText", "idsToMerge"]
                }
            }
        }
    }
};

export interface WordGroup {
  masterText: string;
  idsToMerge: string[];
}

const getApiKeys = (): string[] => {
    const raw = import.meta.env.VITE_GOOGLE_API_KEY || '';
    return raw.split(',').map(k => k.trim()).filter(k => k.length > 0);
};

export const groupWordsWithAI = async (topic: string, words: WordEntry[]): Promise<WordGroup[]> => {
  const apiKeys = getApiKeys();
  if (apiKeys.length === 0) {
      throw new Error("Missing Google API Key. Please Add VITE_GOOGLE_API_KEY to .env (comma separated for multiple keys)");
  }

  if (!words || words.length < 2) return [];

  const simplifiedList = words.map(w => ({ id: w.id, text: w.text }));
  const jsonStringList = JSON.stringify(simplifiedList);

  const prompt = `
      You are a semantic grouping assistant for a word cloud.
      
      CONTEXT / TOPIC: "${topic}"
      
      INPUT DATA (List of user answers):
      ${jsonStringList}

      INSTRUCTIONS:
      1. Analyze the "text" of each item.
      2. Identify items that are SEMANTICALLY IDENTICAL or SYNONYMS within the context of the "${topic}".
      3. Group them together.
      4. STRICTNESS: 
         - Group "Apple" and "Red Apple" (Same fruit).
         - Group "KTC" and "บัตร KTC" (Same brand).
         - Do NOT group distinct items like "Apple" and "Banana" just because they are both fruit.
         - Do NOT group items if you are unsure.
      5.  For each group, select the shortest, cleanest text as "masterText".
      6. Return ONLY groups that contain 2 or more items.
    `;

  let lastError: any = null;

  // Retry with each API key
  for (const key of apiKeys) {
      try {
          const genAI = new GoogleGenerativeAI(key);
          const model = genAI.getGenerativeModel({ 
              model: MODEL_NAME,
              generationConfig: GENERATION_CONFIG
          });

          const result = await model.generateContent(prompt);
          const responseText = result.response.text();

          if (responseText) {
            const parsed = JSON.parse(responseText);
            return parsed.groups || [];
          }
          
          return []; // Success with empty result

      } catch (error: any) {
          console.warn(`Gemini API Failed with key ...${key.slice(-4)}. Trying next key...`, error.message);
          lastError = error;
          // Continue loop to next key
      }
  }

  // If we exit the loop, all keys failed
  console.error("All Gemini API keys exhausted.");
  throw lastError || new Error("All API keys failed to generate content.");
};
