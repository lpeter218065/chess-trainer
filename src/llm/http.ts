import { isNative } from '../platform';

export type CapacitorHttpLike = {
  request(options: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    data?: unknown;
    responseType?: 'text' | 'json' | 'arraybuffer' | 'blob' | 'document';
  }): Promise<{ status: number; headers?: Record<string, string>; data: unknown }>;
};

export function bufferedResponse(status: number, headers: Record<string, string>, body: string): Response {
  const bytes = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (bytes.byteLength > 0) controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(stream, { status, headers });
}

function headerRecord(init?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init).forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function requestData(init?: RequestInit): unknown {
  const body = init?.body;
  if (body == null || typeof body !== 'string') return body ?? undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function responseText(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export function capacitorHttpFetch(http: CapacitorHttpLike): typeof fetch {
  return async (input, init) => {
    if (init?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const res = await http.request({
      url,
      method: init?.method ?? 'GET',
      headers: headerRecord(init?.headers),
      data: requestData(init),
      responseType: 'text',
    });
    return bufferedResponse(res.status, res.headers ?? {}, responseText(res.data));
  };
}

export const llmFetch: typeof fetch = async (input, init) => {
  if (isNative()) {
    const { getNativeSsePlugin, nativeSseFetch } = await import('./nativeSse');
    return nativeSseFetch(await getNativeSsePlugin())(input, init);
  }
  return fetch(input, init);
};
