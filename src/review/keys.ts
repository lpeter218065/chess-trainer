import type { PlyNav } from '../chess/notation';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLTextAreaElement) return !target.readOnly;
  return target.isContentEditable;
}

/** 复盘步进快捷键。可编辑输入框里不抢键；只读棋谱框里方向键仍可用。 */
export function reviewKeyToNav(e: KeyboardEvent): PlyNav | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (isEditableTarget(e.target)) return null;
  if ((e.key === ' ' || e.key === 'Enter') && e.target instanceof HTMLButtonElement) return null;
  if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') return 'back';
  if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L' || e.key === ' ') return 'forward';
  if (e.key === 'ArrowUp' || e.key === 'Home') return 'start';
  if (e.key === 'ArrowDown' || e.key === 'End') return 'end';
  return null;
}
