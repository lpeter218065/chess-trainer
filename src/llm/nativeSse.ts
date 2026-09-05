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

export function nativeSseFetch(plugin: NativeSsePlugin): typeof fetch {
  return async (input, init) => {
    if (init?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';
    const headers = headerRecord(init?.headers);
    const body = typeof init?.body === 'string' ? init.body : undefined;

    const encoder = new TextEncoder();
    const queue: Uint8Array[] = [];
    let ended = false;
    let failed: Error | null = null;
    let notify: (() => void) | null = null;

    let streamId = '';
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
    handles.push(await Promise.resolve(plugin.addListener('open', (e) => {
      pendingOpen.set(e.id, e);
      finishOpen(e);
    })));
    handles.push(await Promise.resolve(plugin.addListener('chunk', (e) => {
      if (streamId && e.id !== streamId) return;
      queue.push(encoder.encode(e.chunk));
      notify?.();
    })));
    handles.push(await Promise.resolve(plugin.addListener('end', (e) => {
      if (streamId && e.id !== streamId) return;
      ended = true;
      notify?.();
    })));
    handles.push(await Promise.resolve(plugin.addListener('error', (e) => {
      if (streamId && e.id !== streamId) return;
      failed = new Error(e.message);
      if (!opened) rejectOpen(failed);
      notify?.();
    })));

    const { id } = await plugin.start({ url, method, headers, body });
    streamId = id;
    const already = pendingOpen.get(id);
    if (already) finishOpen(already);

    const onAbort = () => {
      void plugin.cancel({ id });
      failed = new DOMException('Aborted', 'AbortError');
      if (!opened) rejectOpen(failed);
      notify?.();
    };
    init?.signal?.addEventListener('abort', onAbort, { once: true });

    const open = await openP;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        while (queue.length > 0) {
          controller.enqueue(queue.shift()!);
        }
        if (failed) {
          controller.error(failed);
          return;
        }
        if (ended) {
          controller.close();
          return;
        }
        return new Promise<void>((resolve) => {
          notify = () => {
            notify = null;
            resolve();
          };
        }).then(() => {
          while (queue.length > 0) controller.enqueue(queue.shift()!);
          if (failed) controller.error(failed);
          else if (ended) controller.close();
        });
      },
      cancel() {
        void plugin.cancel({ id });
        void Promise.all(handles.map((h) => h.remove()));
      },
    });
    return new Response(stream, { status: open.status, headers: open.headers ?? {} });
  };
}

export async function getNativeSsePlugin(): Promise<NativeSsePlugin> {
  const { registerPlugin } = await import('@capacitor/core');
  return registerPlugin<NativeSsePlugin>('NativeSse');
}
