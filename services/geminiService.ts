import { GoogleGenAI, Type } from "@google/genai";
import { WordEntry } from "../types";

// Initialize AI Client
// Note: In a real Vite app, use import.meta.env.VITE_GOOGLE_API_KEY
// Per instructions, we assume process.env.API_KEY is available or configured globally.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export interface WordGroup {
  masterText: string;
  idsToMerge: string[];
}

export const groupWordsWithAI = async (topic: string, words: WordEntry[]): Promise<WordGroup[]> => {
  if (!words || words.length < 2) return [];

  try {
    const simplifiedList = words.map(w => ({ id: w.id, text: w.text }));
    const jsonStringList = JSON.stringify(simplifiedList);

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        You are a semantic grouping assistant for a word cloud app.
        Topic: "${topic}"
        
        List of user answers:
        ${jsonStringList}

        Task:
        1. Identify answers that mean the SAME thing (synonyms, typos, same intent).
        2. Group them together.
        3. Select the best, shortest, and most grammatically correct text as the "masterText".
        4. Ignore unique answers that don't match anything else.
        5. Return ONLY groups that have 2 or more items.

        Output JSON format:
        {
          "groups": [
            { "masterText": "Final Text", "idsToMerge": ["id_1", "id_2"] }
          ]
        }
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                groups: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            masterText: { type: Type.STRING },
                            idsToMerge: { 
                                type: Type.ARRAY,
                                items: { type: Type.STRING } 
                            }
                        }
                    }
                }
            }
        }
      }
    });

    if (response.text) {
        const parsed = JSON.parse(response.text);
        return parsed.groups || [];
    }
    
    return [];

  } catch (error) {
    console.error("AI Grouping Error:", error);
    return [];
  }
};