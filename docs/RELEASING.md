# 发布检查清单

在提交 App Store / 对外发布 Web 前跑一遍。

## 自动化

```bash
npm run verify
```

包含 `typecheck`、全量 `vitest`、`production build`（含 Stockfish 与第三方许可证生成）。

CI 在 `main` 的 push / PR 上运行相同命令（`.github/workflows/ci.yml`）。

## iOS（Capacitor）

1. 在 `package.json` 更新 `version`，然后 `npm run ios:sync`（同步 MARKETING_VERSION 与 web 资源）。
2. Xcode 打开 `ios/App/App.xcworkspace`，选 **Any iOS Device (arm64)**，**Product → Archive**。
3. App Store Connect 填写隐私问卷（无追踪；语音仅设备端转写；API Key 在 Keychain）。
4. 确认 `Info.plist` 用途说明与 `PrivacyInfo.xcprivacy` 与功能一致。
5. LLM 服务地址须 **HTTPS**（已移除 `NSAllowsArbitraryLoads`，仅保留本地网络调试例外）。

## Web

1. `npm run build` 产出 `dist/`，静态托管即可。
2. 勿在构建产物或仓库中嵌入 API Key；用户自备 Key（Web 本地存储 / iOS Keychain）。

## 法务与依赖

- 应用内 **设置 → 开源许可**（`/licenses`）与 `npm run licenses` 生成文件一致。
- 设置页隐私说明描述数据去向（无自有后端）。

## 仍须人工确认

- App Store 截图、描述、分级。
- TestFlight 真机走一遍：课程、探索、闯关、语音问教练、离线无 Key 时的空状态。
- 若使用非 OpenAI 兼容端点，在真机用「测试连接」验证 ATS 与 CORS（Web）。
