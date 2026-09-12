import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../store/settings';
import { probeLlmConnection } from '../llm/client';
import { DIFFICULTIES, type DifficultyId } from '../engine/difficulty';
import { requestDebugOverlay } from '../debug/install';
import { debugLog } from '../debug/log';

export function SettingsDialog({ onClose }: { onClose(): void }) {
  const { llm, temperature, difficultyId, debugGesturesEnabled, setLlm, setTemperature, setDifficultyId, setDebugGesturesEnabled } =
    useSettings();
  const [status, setStatus] = useState<string>('');
  const [showKey, setShowKey] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const resetFromEnv = () => {
    const env = import.meta.env;
    const effort = env.VITE_LLM_REASONING_EFFORT as typeof llm.reasoningEffort | undefined;
    setLlm({
      baseUrl: env.VITE_LLM_BASE_URL || 'https://api.openai.com/v1',
      apiKey: env.VITE_LLM_API_KEY || '',
      model: env.VITE_LLM_MODEL || 'gpt-4o-mini',
      ...(effort ? { reasoningEffort: effort } : { reasoningEffort: undefined }),
    });
    setStatus('已恢复为 .env.local / 默认配置。');
  };
  const test = async () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setStatus('测试中…');
    debugLog('info', 'settings', 'probe start');
    try {
      await probeLlmConnection(llm);
      setStatus('连接成功。');
      debugLog('info', 'settings', 'probe ok');
    } catch (e) {
      const msg = (e as Error).message;
      debugLog('error', 'settings', `probe ${msg}`);
      setStatus(`失败：${msg}`);
    }
  };
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center overflow-x-hidden overflow-y-auto overscroll-contain bg-ink/50 p-3 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="sheet max-h-[calc(100dvh-2rem)] min-w-0 overflow-x-hidden overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="sheet-handle sm:hidden" />
        <h2 id="settings-title" className="page-title mb-4 text-xl">设置</h2>
        <label className="block text-sm font-medium text-ink">Base URL
          <input className="field mt-1" value={llm.baseUrl} onChange={(e) => setLlm({ baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" autoComplete="url" />
          <span className="mt-1 block text-xs text-muted">OpenAI 兼容接口填到 /v1 为止，勿含 /chat/completions</span>
        </label>
        <label className="mt-3 block text-sm font-medium text-ink">API Key
          <span className="mt-1 flex gap-2">
            <input className="field" type={showKey ? 'text' : 'password'} value={llm.apiKey} onChange={(e) => setLlm({ apiKey: e.target.value })} autoComplete="off" />
            <button type="button" className="btn shrink-0 text-xs" onClick={() => setShowKey((v) => !v)} aria-pressed={showKey}>
              {showKey ? '隐藏' : '显示'}
            </button>
          </span>
        </label>
        <label className="mt-3 block text-sm font-medium text-ink">模型
          <input className="field mt-1" value={llm.model} onChange={(e) => setLlm({ model: e.target.value })} />
        </label>
        <label className="mt-3 block text-sm font-medium text-ink">讲解温度 {temperature.toFixed(1)}
          <input className="mt-2 w-full" type="range" min={0} max={1.2} step={0.1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
        </label>
        <label className="mt-3 block text-sm font-medium text-ink">默认难度
          <select className="field mt-1" value={difficultyId} onChange={(e) => setDifficultyId(e.target.value as DifficultyId)}>
            {DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          API Key 只存在本机（Web 为本地存储，iOS 为 Keychain）。讲解请求发往你填写的服务地址；本项目没有任何自有服务器。
        </p>
        <p className="mt-2 text-xs">
          <Link to="/licenses" className="text-walnut underline-offset-4 hover:underline" onClick={onClose}>开源许可</Link>
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary" onClick={() => void test()}>测试连接</button>
          <button type="button" className="btn" onClick={resetFromEnv}>恢复 .env 配置</button>
          <button type="button" className="btn" onClick={() => requestDebugOverlay(true)}>查看日志</button>
          <button type="button" className="btn" onClick={onClose}>关闭</button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={debugGesturesEnabled}
            onChange={(e) => setDebugGesturesEnabled(e.target.checked)}
          />
          启用调试手势（摇一摇 / 三指触屏）
        </label>
        {status && (
          <p
            className={`mt-3 max-w-full min-w-0 text-sm break-words [overflow-wrap:anywhere] ${status.startsWith('失败') ? 'text-danger' : 'text-muted'}`}
            role="status"
          >
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
