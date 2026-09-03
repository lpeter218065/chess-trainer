# 国际象棋训练

纯浏览器的国际象棋训练 Web 应用。从课程给定局面开始与 Stockfish 对弈，GPT 基于引擎分析做中文讲解、提示和总结。没有后端，设置与进度存在本机浏览器。

## 启动

```bash
npm install
npm run dev
```

浏览器打开提示的本地地址。首次启动会把 Stockfish 单线程 lite 构建复制到 `public/engine/`。

## 设置

右上角「设置」填写 OpenAI 兼容的：

- Base URL（例如 `https://api.openai.com/v1`）
- API Key（仅保存在本机 `localStorage`，不会上传到本仓库）
- 模型名

也可以复制 `.env.example` 为 `.env.local`（已 gitignore），用 `VITE_LLM_BASE_URL` / `VITE_LLM_API_KEY` / `VITE_LLM_MODEL` / `VITE_LLM_REASONING_EFFORT` 做开发默认值。设置页未填 Key 时会回落到这些环境变量。

「测试连接」会发一条流式请求，收到第一个 token 即视为成功。第三方兼容服务若不允许浏览器 CORS，请求会失败。

## 新增课程

1. 在 `src/lessons/data/<opening|middlegame|endgame>/` 新增一个 `.ts` 文件，导出 `lesson: Lesson`。
2. 在 `src/lessons/index.ts` 导入并加入 `LESSONS`。
3. 运行 `npm test`：会校验 FEN 合法、`playerColor` 与行棋方一致、`principleIds` 存在、`modelLine` 每步可走。

## 新增棋理

在 `src/lessons/principles.ts` 的 `PRINCIPLES` 追加条目（含 `triggers` 局面特征），再在对应课程的 `principleIds` 里引用。
