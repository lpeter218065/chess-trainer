export type DebugLevel = 'debug' | 'info' | 'warn' | 'error';

export type DebugEntry = {
  t: number;
  level: DebugLevel;
  source: string;
  message: string;
};

export function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/("api[_-]?key"\s*:\s*")[^"]+/gi, '$1***')
    .replace(/([?&](?:key|token|api[_-]?key)=)[^&]+/gi, '$1***');
}

export function createDebugLog(max = 300) {
  let entries: DebugEntry[] = [];
  const listeners = new Set<() => void>();
  const emit = () => {
    listeners.forEach((fn) => fn());
  };
  return {
    append(level: DebugLevel, source: string, message: string) {
      entries.push({
        t: Date.now(),
        level,
        source,
        message: redactSecrets(String(message)),
      });
      if (entries.length > max) entries = entries.slice(-max);
      emit();
    },
    list(): DebugEntry[] {
      return entries.slice();
    },
    clear() {
      entries = [];
      emit();
    },
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    format(): string {
      return entries
        .map((e) => {
          const ts = new Date(e.t).toISOString().slice(11, 23);
          return `${ts}\t${e.source}\t${e.level}\t${e.message}`;
        })
        .join('\n');
    },
  };
}

export const appDebugLog = createDebugLog();

export function debugLog(level: DebugLevel, source: string, message: string): void {
  appDebugLog.append(level, source, message);
}
