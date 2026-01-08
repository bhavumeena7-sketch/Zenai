
export enum MeditationTheme {
  FOREST = 'Ancient Mystical Forest',
  OCEAN = 'Deep Azure Ocean',
  SPACE = 'Infinite Cosmic Void',
  MOUNTAIN = 'Cloud-Kissed Peak',
  ZEN = 'Traditional Japanese Zen Garden',
}

export enum VoiceName {
  KORE = 'Kore',
  PUCK = 'Puck',
  CHARON = 'Charon',
  FENRIR = 'Fenrir',
  ZEPHYR = 'Zephyr'
}

export type ImageSize = '1K' | '2K' | '4K';
export type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16' | '16:9' | '21:9';

export interface MeditationScript {
  title: string;
  fullText: string;
  segments: {
    text: string;
    startSecond: number;
    endSecond: number;
  }[];
}

export interface MeditationSession {
  id: string;
  theme: MeditationTheme;
  imageUrl: string;
  videoUrl?: string;
  audioUrl: string;
  script: MeditationScript;
  createdAt: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  groundingUrls?: { title: string; uri: string }[];
}
