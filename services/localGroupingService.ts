import { pipeline, env } from '@xenova/transformers';
import { WordEntry } from '../types';

// Configure transformers.js for browser
env.allowLocalModels = false;
env.useBrowserCache = true;

export interface WordGroup {
  masterText: string;
  idsToMerge: string[];
}

// Model singleton
let embedder: any = null;
let isModelLoading = false;

/**
 * Get or initialize the embedding model (singleton)
 */
const getEmbedder = async () => {
  if (embedder) return embedder;

  if (isModelLoading) {
    while (isModelLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return embedder!;
  }

  isModelLoading = true;
  try {
    console.log('🔄 Loading embedding model...');
    embedder = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small');
    console.log('✅ Embedding model loaded!');
    return embedder;
  } finally {
    isModelLoading = false;
  }
};

/**
 * Calculate cosine similarity between two vectors
 */
const cosineSimilarity = (a: number[], b: number[]): number => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

/**
 * Group words by semantic similarity using local embeddings
 */
export const groupWordsWithLocalAI = async (
  topic: string,
  words: WordEntry[],
  threshold: number = 0.7
): Promise<WordGroup[]> => {
  if (!words || words.length < 2) return [];

  try {
    const model = await getEmbedder();
    
    // Get embeddings for all words
    const texts = words.map(w => w.text);
    const embeddings: number[][] = [];
    
    for (const text of texts) {
      const output = await model(text, { pooling: 'mean', normalize: true });
      embeddings.push(Array.from(output.data as Float32Array));
    }

    // Build similarity groups
    const groups: Map<number, number[]> = new Map();
    const assigned = new Set<number>();

    for (let i = 0; i < words.length; i++) {
      if (assigned.has(i)) continue;
      
      const group: number[] = [i];
      assigned.add(i);

      for (let j = i + 1; j < words.length; j++) {
        if (assigned.has(j)) continue;
        
        const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
        if (similarity >= threshold) {
          group.push(j);
          assigned.add(j);
        }
      }

      if (group.length >= 2) {
        groups.set(i, group);
      }
    }

    // Convert to WordGroup format
    const result: WordGroup[] = [];
    groups.forEach((indices) => {
      const groupWords = indices.map(idx => words[idx]);
      const masterWord = groupWords.reduce((shortest, current) => 
        current.text.length < shortest.text.length ? current : shortest
      , groupWords[0]);
      
      result.push({
        masterText: masterWord.text,
        idsToMerge: groupWords.map(w => w.id)
      });
    });

    return result;

  } catch (error) {
    console.error('Local AI Grouping Error:', error);
    throw new Error('Local AI ไม่สามารถใช้งานได้');
  }
};

/**
 * Check if the model is ready
 */
export const isModelReady = (): boolean => {
  return embedder !== null;
};
