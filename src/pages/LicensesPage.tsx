import { Link } from 'react-router-dom';
import { APP_LICENSE, STOCKFISH_ENGINE_SOURCE, STOCKFISH_JS_SOURCE } from '../licenses/notice';
import { APP_VERSION, THIRD_PARTY_LICENSES } from '../licenses/thirdParty.generated';

export function LicensesPage() {
  return (
    <div
      className="mx-auto max-w-3xl px-4 py-8 sm:px-6"
      style={{
        paddingTop: 'max(2rem, env(safe-area-inset-top))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
        paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
      }}
    >
      <header className="mb-6">
        <Link to="/" className="inline-flex min-h-11 items-center text-sm text-felt underline-offset-4 hover:underline">
          ← 返回
        </Link>
        <h1 className="font-display mt-2 text-2xl font-semibold text-ink">开源许可</h1>
        <p className="mt-2 text-sm text-muted">国际象棋训练 {APP_VERSION} · {APP_LICENSE}</p>
      </header>

      <section className="panel mb-6 p-4">
        <h2 className="font-display text-lg font-semibold text-ink">本 App</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          本程序以 GNU GPLv3 发布。源码与课程数据随仓库公开，完整条款见仓库根目录
          {' '}
          <code className="text-ink">LICENSE</code>
          {' '}
          与
          {' '}
          <code className="text-ink">COPYING</code>
          。
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          API Key 只存在本机（Web 为本地存储，iOS 为 Keychain）。讲解请求发往你在设置里填写的服务地址；本项目没有任何自有服务器。
        </p>
      </section>

      <section className="panel mb-6 p-4">
        <h2 className="font-display text-lg font-semibold text-ink">Stockfish</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          对局引擎为 Stockfish 的单线程 lite WASM 构建，许可为 GPLv3。
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-felt">
          <li>
            <a className="underline-offset-4 hover:underline" href={STOCKFISH_ENGINE_SOURCE} target="_blank" rel="noreferrer">
              官方引擎源码
            </a>
          </li>
          <li>
            <a className="underline-offset-4 hover:underline" href={STOCKFISH_JS_SOURCE} target="_blank" rel="noreferrer">
              本仓库使用的 WASM 移植
            </a>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-display mb-3 text-lg font-semibold text-ink">第三方依赖</h2>
        <p className="mb-3 text-sm text-muted">清单由构建脚本从 package.json 生成。</p>
        <ul className="panel divide-y divide-line">
          {THIRD_PARTY_LICENSES.map((pkg) => (
            <li key={pkg.name} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3">
              <div className="min-w-0">
                {pkg.homepage ? (
                  <a className="font-medium text-ink underline-offset-4 hover:underline" href={pkg.homepage} target="_blank" rel="noreferrer">
                    {pkg.name}
                  </a>
                ) : (
                  <span className="font-medium text-ink">{pkg.name}</span>
                )}
                <span className="ml-2 text-xs text-muted">{pkg.version}</span>
              </div>
              <span className="text-sm text-muted">{pkg.license}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
