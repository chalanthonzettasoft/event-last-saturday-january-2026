import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { WordEntry } from "../types";

// Initialize AI Client
// Using Vite env var
const apiKey = import.meta.env.VITE_GOOGLE_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ 
  /**
List of models that support generateContent:
- models/gemini-2.5-flash
- models/gemini-2.5-pro
- models/gemini-2.0-flash
- models/gemini-2.0-flash-001
- models/gemini-2.0-flash-exp-image-generation
- models/gemini-2.0-flash-lite-001
- models/gemini-2.0-flash-lite
- models/gemini-exp-1206
- models/gemini-2.5-flash-preview-tts
- models/gemini-2.5-pro-preview-tts
- models/gemma-3-1b-it
- models/gemma-3-4b-it
- models/gemma-3-12b-it
- models/gemma-3-27b-it
- models/gemma-3n-e4b-it
- models/gemma-3n-e2b-it
- models/gemini-flash-latest
- models/gemini-flash-lite-latest
- models/gemini-pro-latest
- models/gemini-2.5-flash-lite
- models/gemini-2.5-flash-image
- models/gemini-2.5-flash-preview-09-2025
- models/gemini-2.5-flash-lite-preview-09-2025
- models/gemini-3-pro-preview
- models/gemini-3-flash-preview
- models/gemini-3-pro-image-preview
- models/nano-banana-pro-preview
- models/gemini-robotics-er-1.5-preview
- models/gemini-2.5-computer-use-preview-10-2025
- models/deep-research-pro-preview-12-2025

List of models that support embedContent:
- models/embedding-001
- models/text-embedding-004
- models/gemini-embedding-001
   */
    model: "gemini-3-flash-preview",
    generationConfig: {
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
    }
});

export interface WordGroup {
  masterText: string;
  idsToMerge: string[];
}

export const groupWordsWithAI = async (topic: string, words: WordEntry[]): Promise<WordGroup[]> => {
  if (!apiKey) {
      throw new Error("Missing Google API Key. Please Add VITE_GOOGLE_API_KEY to .env");
  }

  if (!words || words.length < 2) return [];

  // Filter out very short words to save tokens, if needed. But for now keep all.
  const simplifiedList = words.map(w => ({ id: w.id, text: w.text }));
  const jsonStringList = JSON.stringify(simplifiedList);

  try {
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

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    if (responseText) {
        const parsed = JSON.parse(responseText);
        return parsed.groups || [];
    }
    
    return [];

  } catch (error) {
    console.error("Gemini Grouping Error:", error);
    throw error; // Re-throw to let UI handle it
  }
};