import { useState } from 'react';
import { useSettings } from '../store/settings';
import { testConnection } from '../llm/client';
import { DIFFICULTIES, type DifficultyId } from '../engine/difficulty';

export function SettingsDialog({ onClose }: { onClose(): void }) {
  const { llm, temperature, difficultyId, setLlm, setTemperature, setDifficultyId } = useSettings();
  const [status, setStatus] = useState<string>('');
  const test = async () => {
    setStatus('测试中…');
    try { await testConnection(llm); setStatus('连接成功，已收到流式内容。'); }
    catch (e) { setStatus(`失败：${(e as Error).message}`); }
  };
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[28rem] rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-lg font-semibold">设置</h2>
        <label className="block text-sm">Base URL
          <input className="mt-1 w-full rounded border px-2 py-1" value={llm.baseUrl} onChange={(e) => setLlm({ baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" />
        </label>
        <label className="mt-2 block text-sm">API Key
          <input className="mt-1 w-full rounded border px-2 py-1" type="password" value={llm.apiKey} onChange={(e) => setLlm({ apiKey: e.target.value })} />
        </label>
        <label className="mt-2 block text-sm">模型
          <input className="mt-1 w-full rounded border px-2 py-1" value={llm.model} onChange={(e) => setLlm({ model: e.target.value })} />
        </label>
        <label className="mt-2 block text-sm">讲解温度 {temperature.toFixed(1)}
          <input className="mt-1 w-full" type="range" min={0} max={1.2} step={0.1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
        </label>
        <label className="mt-2 block text-sm">默认难度
          <select className="mt-1 w-full rounded border px-2 py-1" value={difficultyId} onChange={(e) => setDifficultyId(e.target.value as DifficultyId)}>
            {DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
        <p className="mt-2 text-xs text-neutral-500">Key 仅保存在本机浏览器的 localStorage 中，请求默认使用流式（stream）模式。</p>
        <div className="mt-3 flex items-center gap-2">
          <button className="rounded bg-blue-600 px-3 py-1 text-sm text-white" onClick={test}>测试连接</button>
          <button className="rounded border px-3 py-1 text-sm" onClick={onClose}>关闭</button>
          <span className="text-xs text-neutral-600">{status}</span>
        </div>
      </div>
    </div>
  );
}
