# 国际象棋训练

浏览器与 iOS 上的国际象棋训练应用。从课程给定局面与 Stockfish 对弈，由你配置的 LLM 做讲解、提示和总结。没有自有后端；进度与设置保存在本机（Web 为 IndexedDB / localStorage，iOS 为 Preferences + Keychain）。

## 启动（Web）

```bash
npm install
npm run dev
```

浏览器打开提示的本地地址。首次启动会把 Stockfish 单线程 lite 构建复制到 `public/engine/`。

## 发布前自检

```bash
npm run verify
```

详见 [docs/RELEASING.md](docs/RELEASING.md)。

## iOS 模拟器 / 真机

```bash
npm run ios:sync   # build + cap sync + 同步 version 到 Xcode
npm run ios:open   # 打开 Xcode
```

Bundle ID：`dev.xu.chesstrainer`。Deep link scheme：`chesstrainer://`。

## 设置

设置页填写 OpenAI 兼容接口：

- Base URL（须 HTTPS，例如 `https://api.openai.com/v1`）
- API Key（Web 存本机；iOS 优先 Keychain，见设置页隐私说明）
- 模型名

开发时可复制 `.env.example` 为 `.env.local`（已 gitignore），使用 `VITE_LLM_*` 变量作为默认值。

「测试连接」会发一条流式请求，收到第一个 token 即视为成功。浏览器端第三方服务若不允许 CORS 会失败；iOS 原生 SSE 插件可绕过部分 CORS 限制。

## 新增课程

1. 在 `src/lessons/data/<opening|middlegame|endgame>/` 新增 `.ts`，导出 `lesson: Lesson`。
2. 在 `src/lessons/index.ts` 导入并加入 `LESSONS`。
3. 运行 `npm test`：校验 FEN、`playerColor`、棋理 ID、`modelLine` 可走。

## 新增棋理

在 `src/lessons/principles.ts` 的 `PRINCIPLES` 追加条目，再在课程的 `principleIds` 里引用。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run verify` | typecheck + test + production build |
| `npm run ios:sync` | 发布构建并同步 iOS |
| `npm run licenses` | 重新生成第三方许可列表 |
