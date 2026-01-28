import { SimulationNodeDatum } from 'd3';

export type GameMode = 'WORD_CLOUD' | '3_SECONDS';

export interface WordEntry {
  id: string;
  text: string;
  normalizedText: string;
  count: number;
  submittedBy: string[];
  sessionId: string;
}

export interface SimulationNode extends SimulationNodeDatum {
  text: string;
  count: number;
  r: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export enum ViewMode {
  CLOUD = 'CLOUD',
  LIST = 'LIST',
}

// Room: The persistent container (Login once)
export interface DBRoom {
  id: string;
  code: string;
  is_active: boolean;
  created_at: string;
}

// Session: The specific question/topic within a room
export interface DBSession {
  id: string;
  room_id: string;
  topic: string;
  is_active: boolean;
  created_at: string;
}

// Legacy type for history component
export interface Session {
  id: string;
  timestamp: number;
  topic: string;
  words: WordEntry[];
  roomCode?: string;
}

export interface WheelState {
  isOpen: boolean;
  isSpinning: boolean;
  currentResult: number | null;
  history: number[];
  min: number;
  max: number;
}

// 3 Seconds Game Types
export interface ThreeSecConfig {
  questions: string[];
  history: number[]; // Store indices of used questions
  currentQuestionIndex: number | null;
  targetIndex?: number | null; // For syncing spin result
  isSpinning: boolean;
  showingResult: boolean; // For expanding the result modal
  soundSpinUrl?: string;
  soundWinUrl?: string;
}