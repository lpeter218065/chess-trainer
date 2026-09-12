function choiceFinished(payload: string): boolean {
  try {
    const json = JSON.parse(payload) as { choices?: { finish_reason?: string | null }[] };
    const reason = json.choices?.[0]?.finish_reason;
    return typeof reason === 'string' && reason.length > 0;
  } catch {
    return false;
  }
}

/** 最小 SSE 解析：只关心 data: 行，事件以空行分隔 */
export function createSseParser() {
  let buffer = '';
  let finished = false;
  const parseEvent = (raw: string): string | null => {
    const dataLines = raw
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart());
    if (dataLines.length === 0) return null;
    const payload = dataLines.join('\n');
    if (payload === '[DONE]') {
      finished = true;
      return null;
    }
    if (choiceFinished(payload)) finished = true;
    return payload;
  };
  return {
    get done() {
      return finished;
    },
    push(chunk: string): string[] {
      buffer += chunk.replace(/\r\n/g, '\n');
      const out: string[] = [];
      let idx: number;
      // 标准 SSE 用空行分事件；不少代理只发 data: …\n，再等 \n\n 会把后半段卡在 buffer 里
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line === '' || line.startsWith(':')) continue;
        const p = parseEvent(line);
        if (p !== null) out.push(p);
        if (finished) {
          buffer = '';
          break;
        }
      }
      return out;
    },
    flush(): string[] {
      if (finished) {
        buffer = '';
        return [];
      }
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
