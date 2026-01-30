import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { WordEntry } from "../types";

// Initialize AI Client
// Using Vite env var
const apiKey = import.meta.env.VITE_GOOGLE_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
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