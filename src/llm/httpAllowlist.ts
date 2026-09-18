/**
 * 原生 App 允许明文 HTTP 的主机。
 * 必须与 ios/App/App/Info.plist 里 NSExceptionDomains 同步。
 */
export const LLM_INSECURE_HTTP_HOSTS = new Set(['43.164.135.40']);

export function isAllowlistedInsecureHttpHost(hostname: string): boolean {
  return LLM_INSECURE_HTTP_HOSTS.has(hostname.trim().toLowerCase());
}
