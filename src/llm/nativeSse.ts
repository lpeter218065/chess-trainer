import { debugLog } from '../debug/log';
import { tl } from '../i18n';

export type NativeSseOpen = { id: string; status: number; headers?: Record<string, string> };
export type NativeSseChunk = { id: string; chunk: string };
export type NativeSseEnd = { id: string };
export type NativeSseError = { id: string; message: string };

type ListenerHandle = { remove: () => Promise<void> };

export type NativeSsePlugin = {
  start(opts: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<{ id: string }>;
  cancel(opts: { id: string }): Promise<void>;
  addListener(event: 'open', cb: (e: NativeSseOpen) => void): Promise<ListenerHandle> | ListenerHandle;
  addListener(event: 'chunk', cb: (e: NativeSseChunk) => void): Promise<ListenerHandle> | ListenerHandle;
  addListener(event: 'end', cb: (e: NativeSseEnd) => void): Promise<ListenerHandle> | ListenerHandle;
  addListener(event: 'error', cb: (e: NativeSseError) => void): Promise<ListenerHandle> | ListenerHandle;
};

function headerRecord(init?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init).forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export function nativeSseFetch(
  plugin: NativeSsePlugin,
  opts?: { openTimeoutMs?: number },
): typeof fetch {
  // 高推理强度模型（如 reasoning_effort=high）首包可能超过 60 s，留足 120 s 再判超时
  const openTimeoutMs = opts?.openTimeoutMs ?? 120_000;
  return async (input, init) => {
    if (init?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';
    const headers = headerRecord(init?.headers);
    const hasHeader = (name: string) => Object.keys(headers).some((k) => k.toLowerCase() === name);
    headers['Accept-Encoding'] = 'identity';
    if (!hasHeader('accept')) headers['Accept'] = 'text/event-stream';
    if (!hasHeader('cache-control')) headers['Cache-Control'] = 'no-cache';
    const body = typeof init?.body === 'string' ? init.body : undefined;

    const encoder = new TextEncoder();
    const queue: Uint8Array[] = [];
    let ended = false;
    let failed: Error | null = null;
    let notify: (() => void) | null = null;

    let streamId = '';
    let cancelled = false;
    const pendingOpen = new Map<string, NativeSseOpen>();
    let resolveOpen: (e: NativeSseOpen) => void = () => {};
    let rejectOpen: (e: Error) => void = () => {};
    const openP = new Promise<NativeSseOpen>((resolve, reject) => {
      resolveOpen = resolve;
      rejectOpen = reject;
    });
    let opened = false;
    const finishOpen = (e: NativeSseOpen) => {
      if (opened) return;
      if (streamId && e.id !== streamId) return;
      opened = true;
      resolveOpen(e);
    };

    const handles: ListenerHandle[] = [];
    let chunkBytes = 0;
    let chunkCount = 0;
    handles.push(await Promise.resolve(plugin.addListener('open', (e) => {
      pendingOpen.set(e.id, e);
      debugLog('info', 'sse', `open ${e.status} ${e.headers?.['content-type'] ?? e.headers?.['Content-Type'] ?? ''}`);
      finishOpen(e);
    })));
    handles.push(await Promise.resolve(plugin.addListener('chunk', (e) => {
      if (streamId && e.id !== streamId) return;
      chunkCount += 1;
      chunkBytes += e.chunk.length;
      if (chunkCount === 1 || chunkCount % 20 === 0) {
        debugLog('debug', 'sse', `chunk#${chunkCount} +${e.chunk.length}B total=${chunkBytes}B`);
      }
      queue.push(encoder.encode(e.chunk));
      notify?.();
    })));
    handles.push(await Promise.resolve(plugin.addListener('end', (e) => {
      if (streamId && e.id !== streamId) return;
      debugLog('info', 'sse', `end chunks=${chunkCount} bytes=${chunkBytes}`);
      ended = true;
      notify?.();
    })));
    handles.push(await Promise.resolve(plugin.addListener('error', (e) => {
      if (streamId && e.id !== streamId) return;
      debugLog('error', 'sse', e.message);
      failed = new Error(e.message);
      if (!opened) rejectOpen(failed);
      notify?.();
    })));

    debugLog('info', 'sse', `start ${method} ${url}`);
    const { id } = await plugin.start({ url, method, headers, body });
    streamId = id;
    debugLog('debug', 'sse', `id ${id.slice(0, 8)}`);
    const already = pendingOpen.get(id);
    if (already) finishOpen(already);

    const onAbort = () => {
      void plugin.cancel({ id });
      failed = new DOMException('Aborted', 'AbortError');
      if (!opened) rejectOpen(failed);
      notify?.();
    };
    init?.signal?.addEventListener('abort', onAbort, { once: true });

    const removeListeners = () => {
      void Promise.all(handles.map((h) => h.remove().catch(() => {})));
    };
    const open = await Promise.race([
      openP,
      new Promise<never>((_, reject) => {
        const t = setTimeout(() => {
          void plugin.cancel({ id });
          removeListeners();
          debugLog('error', 'sse', `open timeout ${openTimeoutMs}ms`);
          reject(new Error(tl('error.sseTimeout', { ms: openTimeoutMs })));
        }, openTimeoutMs);
        void openP.then(() => clearTimeout(t), () => clearTimeout(t));
      }),
    ]);
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        for (;;) {
          if (cancelled) return;
          let got = false;
          while (queue.length > 0) {
            controller.enqueue(queue.shift()!);
            got = true;
          }
          if (failed) {
            removeListeners();
            controller.error(failed);
            return;
          }
          if (ended) {
            removeListeners();
            controller.close();
            return;
          }
          if (got) return;
          await new Promise<void>((resolve) => {
            notify = resolve;
            if (queue.length > 0 || ended || failed || cancelled) {
              notify = null;
              resolve();
            }
          });
        }
      },
      cancel() {
        cancelled = true;
        ended = true;
        notify?.();
        void plugin.cancel({ id });
        removeListeners();
      },
    });
    return new Response(stream, { status: open.status, headers: open.headers ?? {} });
  };
}

/**
 * Capacitor 插件是 Proxy，会拦截 `then`。从 async 函数直接 `return plugin`
 * 会被当成 thenable 去调 `NativeSse.then()`，真机报 not implemented，请求永远不 start。
 * 这里只把插件交给 nativeSseFetch，向外返回普通 fetch 函数。
 */
export async function createNativeSseFetch(opts?: {
  openTimeoutMs?: number;
  loadPlugin?: () => NativeSsePlugin;
}): Promise<typeof fetch> {
  const plugin = opts?.loadPlugin
    ? opts.loadPlugin()
    : (await import('@capacitor/core')).registerPlugin<NativeSsePlugin>('NativeSse');
  return nativeSseFetch(plugin, { openTimeoutMs: opts?.openTimeoutMs });
}
