import { Capacitor } from '@capacitor/core';
import { debugLog } from '../debug/log';
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

const NATIVE_SSE_PLUGIN = 'NativeSse';

export type LlmFetchDeps = {
  isNative(): boolean;
  isPluginAvailable(name: string): boolean;
  /** 懒加载原生 SSE 通道；仅在插件确实可用时调用 */
  nativeFetch(): Promise<typeof fetch>;
  webFetch: typeof fetch;
};

/**
 * 原生端优先走 NativeSse 插件；插件缺失（安装包没打进去 / 方法名不匹配）时回退普通 fetch，
 * 而不是让 `"NativeSse.start()" is not implemented on ios` 冒泡成未处理拒绝。
 * 可用性判断与插件加载只做一次，之后复用结果。
 */
export function createLlmFetch(deps: LlmFetchDeps): typeof fetch {
  let resolved: Promise<typeof fetch | null> | null = null;
  const nativeImpl = (): Promise<typeof fetch | null> => {
    if (resolved) return resolved;
    const p = (async () => {
      if (!deps.isNative()) return null;
      if (!deps.isPluginAvailable(NATIVE_SSE_PLUGIN)) {
        debugLog('warn', 'llm', 'NativeSse 插件不可用，回退 fetch');
        return null;
      }
      return deps.nativeFetch();
    })();
    resolved = p;
    // 加载失败不永久毒化缓存：下次调用重新尝试；错误仍抛给调用方
    p.catch(() => {
      if (resolved === p) resolved = null;
    });
    return p;
  };
  return async (input, init) => {
    const impl = await nativeImpl();
    return impl ? impl(input, init) : deps.webFetch(input, init);
  };
}

export const llmFetch: typeof fetch = createLlmFetch({
  isNative,
  isPluginAvailable: (name) => {
    try {
      return Capacitor.isPluginAvailable(name);
    } catch {
      return false;
    }
  },
  nativeFetch: async () => {
    const { getNativeSsePlugin, nativeSseFetch } = await import('./nativeSse');
    return nativeSseFetch(await getNativeSsePlugin());
  },
  webFetch: (input, init) => fetch(input, init),
});
