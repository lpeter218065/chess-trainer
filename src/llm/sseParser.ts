/** 最小 SSE 解析：只关心 data: 行，事件以空行分隔 */
export function createSseParser() {
  let buffer = '';
  const parseEvent = (raw: string): string | null => {
    const dataLines = raw
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart());
    if (dataLines.length === 0) return null;
    const payload = dataLines.join('\n');
    return payload === '[DONE]' ? null : payload;
  };
  return {
    push(chunk: string): string[] {
      buffer += chunk.replace(/\r\n/g, '\n');
      const out: string[] = [];
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const p = parseEvent(raw);
        if (p !== null) out.push(p);
      }
      return out;
    },
    flush(): string[] {
      const raw = buffer;
      buffer = '';
      const p = raw.trim() ? parseEvent(raw) : null;
      return p === null ? [] : [p];
    },
  };
}

export function extractDelta(payload: string): string {
  try {
    const json = JSON.parse(payload) as { choices?: { delta?: { content?: string | null } }[] };
    return json.choices?.[0]?.delta?.content ?? '';
  } catch {
    return '';
  }
}
