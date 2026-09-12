export function MissingKeyEmpty({
  onConfigure,
  compact = false,
}: {
  onConfigure: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 pb-2">
        <p className="min-w-0 flex-1 text-xs text-muted">填入 API Key 后可讲解</p>
        <button type="button" className="btn btn-primary btn-sm shrink-0" onClick={onConfigure}>
          去配置 Key
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-sm leading-relaxed text-muted">
        填入 API Key 后，教练会按当前局面讲解。Key 只存在本机，请求发往你在设置里填写的服务地址。
      </p>
      <button type="button" className="btn btn-primary" onClick={onConfigure}>
        去配置 Key
      </button>
    </div>
  );
}
