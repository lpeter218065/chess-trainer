import { registerPlugin } from '@capacitor/core';

export interface NativeSsePlugin {
  start(opts: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<{ id: string }>;
  cancel(opts: { id: string }): Promise<void>;
}

export const NativeSse = registerPlugin<NativeSsePlugin>('NativeSse');
