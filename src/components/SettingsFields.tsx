import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DIFFICULTIES, type DifficultyId } from '../engine/difficulty';
import { requestDebugOverlay } from '../debug/install';
import { debugLog } from '../debug/log';
import { useT, type LocalePreference } from '../i18n';
import { probeLlmConnection } from '../llm/client';
import { useSettings } from '../store/settings';

export function LanguageChips() {
  const t = useT();
  const localePref = useSettings((s) => s.localePref);
  const setLocalePref = useSettings((s) => s.setLocalePref);
  return (
    <section>
      <header className="home-section-head">
        <h2 id="settings-language">{t('settings.language')}</h2>
      </header>
      <div className="lang-chip-row" role="group" aria-labelledby="settings-language">
        {([
          ['system', 'settings.languageSystem'],
          ['zh', 'settings.languageZh'],
          ['en', 'settings.languageEn'],
        ] as const).map(([id, key]) => (
          <button
            key={id}
            type="button"
            className="lang-chip"
            aria-pressed={localePref === id}
            onClick={() => setLocalePref(id as LocalePreference)}
          >
            {t(key)}
          </button>
        ))}
      </div>
    </section>
  );
}

export function SettingsFields({ onClose, showLanguage = true }: { onClose?: () => void; showLanguage?: boolean }) {
  const t = useT();
  const { llm, temperature, difficultyId, debugGesturesEnabled, setLlm, setTemperature, setDifficultyId, setDebugGesturesEnabled } =
    useSettings();
  const [status, setStatus] = useState('');
  const [showKey, setShowKey] = useState(false);
  const resetFromEnv = () => {
    const env = import.meta.env;
    const effort = env.VITE_LLM_REASONING_EFFORT as typeof llm.reasoningEffort | undefined;
    setLlm({
      baseUrl: env.VITE_LLM_BASE_URL || 'https://api.openai.com/v1',
      apiKey: env.VITE_LLM_API_KEY || '',
      model: env.VITE_LLM_MODEL || 'gpt-4o-mini',
      ...(effort ? { reasoningEffort: effort } : { reasoningEffort: undefined }),
    });
    setStatus(t('settings.resetOk'));
  };
  const test = async () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setStatus(t('settings.testing'));
    debugLog('info', 'settings', 'probe start');
    try {
      await probeLlmConnection(llm);
      setStatus(t('settings.testOk'));
      debugLog('info', 'settings', 'probe ok');
    } catch (e) {
      const msg = (e as Error).message;
      debugLog('error', 'settings', `probe ${msg}`);
      setStatus(t('settings.testFail', { msg }));
    }
  };
  return (
    <div>
      {showLanguage && (
        <div className="mb-4">
          <LanguageChips />
        </div>
      )}
      <label className="block text-sm font-medium text-ink">{t('settings.baseUrl')}
        <input className="field mt-1" value={llm.baseUrl} onChange={(e) => setLlm({ baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" autoComplete="url" />
        <span className="mt-1 block text-xs text-muted">{t('settings.baseUrlHint')}</span>
      </label>
      <label className="mt-3 block text-sm font-medium text-ink">{t('settings.apiKey')}
        <span className="mt-1 flex gap-2">
          <input className="field" type={showKey ? 'text' : 'password'} value={llm.apiKey} onChange={(e) => setLlm({ apiKey: e.target.value })} autoComplete="off" />
          <button type="button" className="btn shrink-0 text-xs" onClick={() => setShowKey((v) => !v)} aria-pressed={showKey}>
            {showKey ? t('settings.hide') : t('settings.show')}
          </button>
        </span>
      </label>
      <label className="mt-3 block text-sm font-medium text-ink">{t('settings.model')}
        <input className="field mt-1" value={llm.model} onChange={(e) => setLlm({ model: e.target.value })} />
      </label>
      <label className="mt-3 block text-sm font-medium text-ink">{t('settings.temperature', { n: temperature.toFixed(1) })}
        <input className="mt-2 w-full" type="range" min={0} max={1.2} step={0.1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
      </label>
      <label className="mt-3 block text-sm font-medium text-ink">{t('settings.difficulty')}
        <select className="field mt-1" value={difficultyId} onChange={(e) => setDifficultyId(e.target.value as DifficultyId)}>
          {DIFFICULTIES.map((d) => (
            <option key={d.id} value={d.id}>
              {t(d.id === 'beginner' ? 'difficulty.beginner' : d.id === 'easy' ? 'difficulty.easy' : d.id === 'medium' ? 'difficulty.medium' : d.id === 'hard' ? 'difficulty.hard' : 'difficulty.max')}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        {t('settings.privacy')}
      </p>
      <p className="mt-2 text-xs">
        <Link to="/licenses" className="text-walnut underline-offset-4 hover:underline" onClick={onClose}>{t('home.licenses')}</Link>
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" onClick={() => void test()}>{t('settings.test')}</button>
        <button type="button" className="btn" onClick={resetFromEnv}>{t('settings.resetEnv')}</button>
        <button type="button" className="btn" onClick={() => requestDebugOverlay(true)}>{t('settings.logs')}</button>
        {onClose && (
          <button type="button" className="btn" onClick={onClose}>{t('settings.close')}</button>
        )}
      </div>
      <label className="ios-switch mt-4 flex items-center justify-between gap-3 text-sm font-medium text-ink cursor-pointer">
        <span className="min-w-0 flex-1">{t('settings.debugGestures')}</span>
        <input
          type="checkbox"
          className="ios-switch-input"
          checked={debugGesturesEnabled}
          onChange={(e) => setDebugGesturesEnabled(e.target.checked)}
        />
        <span className="ios-switch-track" aria-hidden="true">
          <span className="ios-switch-thumb" />
        </span>
      </label>
      {status && (
        <p
          className={`mt-3 max-w-full min-w-0 text-sm break-words [overflow-wrap:anywhere] ${status.startsWith('失败') || status.startsWith('Failed') ? 'text-danger' : 'text-muted'}`}
          role="status"
        >
          {status}
        </p>
      )}
    </div>
  );
}
