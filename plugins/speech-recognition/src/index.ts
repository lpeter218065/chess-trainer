import { registerPlugin } from '@capacitor/core';

export interface SpeechRecognitionPlugin {
  available(): Promise<{ available: boolean }>;
  start(opts: { locale: string }): Promise<void>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
}

export const SpeechRecognition = registerPlugin<SpeechRecognitionPlugin>('SpeechRecognition');
