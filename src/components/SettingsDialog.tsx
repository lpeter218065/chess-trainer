import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../store/settings';
import { probeLlmConnection } from '../llm/client';
import { DIFFICULTIES, type DifficultyId } from '../engine/difficulty';

export function SettingsDialog({ onClose }: { onClose(): void }) {
  const { llm, temperature, difficultyId, setLlm, setTemperature, setDifficultyId } = useSettings();
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
    setStatus('测试中…');
    try { await probeLlmConnection(llm); setStatus('连接成功。'); }
    catch (e) { setStatus(`失败：${(e as Error).message}`); }
  };
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-ink/50 p-4" onClick={onClose} role="presentation">
      <div
        className="w-full max-w-md rounded-2xl bg-paper p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <h2 id="settings-title" className="font-display mb-4 text-xl font-semibold text-ink">设置</h2>
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
          <Link to="/licenses" className="text-felt underline-offset-4 hover:underline" onClick={onClose}>开源许可</Link>
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary" onClick={() => void test()}>测试连接</button>
          <button type="button" className="btn" onClick={resetFromEnv}>恢复 .env 配置</button>
          <button type="button" className="btn" onClick={onClose}>关闭</button>
        </div>
        {status && <p className="mt-3 text-sm text-muted" role="status">{status}</p>}
      </div>
    </div>
  );
}
