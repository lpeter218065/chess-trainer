/** 用当前复盘页走系统打印。标题写进文档名，方便另存 PDF。 */
export function printReview(title?: string): void {
  const prev = document.title;
  const next = title?.trim();
  if (next) document.title = next;
  const restore = () => {
    document.title = prev;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
}
