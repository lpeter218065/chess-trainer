import type { StoreApi } from 'zustand';
import type { SessionState } from '../../store/session';
import { useSession } from '../../store/sessionInstance';
import { HintButton } from '../HintButton';

/** 提示文本是流式的，交给这个自订阅组件，页面不订阅 hintText */
export function LessonHint({ store, disabled }: { store: StoreApi<SessionState>; disabled: boolean }) {
  const hintText = useSession(store, (s) => s.hintText);
  const streaming = useSession(store, (s) => s.streaming === 'hint');
  return (
    <HintButton
      disabled={disabled}
      hintText={hintText}
      streaming={streaming}
      onHint={(lv) => void store.getState().requestHint(lv)}
    />
  );
}
