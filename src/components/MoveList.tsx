export function MoveList({ history, startMoveNumber, blackFirst }: { history: string[]; startMoveNumber: number; blackFirst: boolean }) {
  const cells: { num: number; white?: string; black?: string }[] = [];
  let i = 0;
  let num = startMoveNumber;
  if (blackFirst && history.length) { cells.push({ num, black: history[0] }); i = 1; num++; }
  for (; i < history.length; i += 2, num++) cells.push({ num, white: history[i], black: history[i + 1] });
  return (
    <div className="grid grid-cols-[2.5rem_1fr_1fr] gap-x-2 gap-y-0.5 font-mono text-sm">
      {cells.map((c) => (
        <div key={c.num} className="contents">
          <span className="text-neutral-400">{c.num}.</span>
          <span>{c.white ?? '…'}</span>
          <span>{c.black ?? ''}</span>
        </div>
      ))}
    </div>
  );
}
