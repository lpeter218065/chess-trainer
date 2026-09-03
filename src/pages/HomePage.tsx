import { useState } from 'react';
import { lessonsBySection } from '../lessons';
import { SECTION_LABEL, type Section } from '../lessons/schema';
import { useProgress } from '../store/progress';
import { useSettings } from '../store/settings';
import { LessonCard } from '../components/LessonCard';
import { SettingsDialog } from '../components/SettingsDialog';

const SECTIONS: Section[] = ['opening', 'middlegame', 'endgame'];

export function HomePage() {
  const records = useProgress((s) => s.records);
  const hasKey = useSettings((s) => Boolean(s.llm.apiKey));
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">国际象棋训练</h1>
        <button className="rounded border px-3 py-1 text-sm" onClick={() => setOpen(true)}>设置{hasKey ? '' : '（未配置 API Key）'}</button>
      </header>
      <div className="grid gap-6 md:grid-cols-3">
        {SECTIONS.map((sec) => (
          <section key={sec}>
            <h2 className="mb-2 text-lg font-medium">{SECTION_LABEL[sec]}</h2>
            <div className="flex flex-col gap-3">
              {lessonsBySection(sec).map((l) => <LessonCard key={l.id} lesson={l} record={records[l.id]} />)}
            </div>
          </section>
        ))}
      </div>
      {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
