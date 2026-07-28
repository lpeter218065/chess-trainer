# 小棋星

面向青少年国际象棋棋手的智能棋谱复盘与训练计划应用。支持导入从国象联盟平台导出的 PGN 棋谱，并为接入 Stockfish 分析 API 提供完整的前端交互。

## 功能

- 上传 `.pgn`/`.txt` 文件或粘贴 PGN 内容；
- 调用 Stockfish 分析任务接口；
- 为不同棋手建立档案；
- 按 `profileId` 隔离棋谱；
- 展示个性化训练计划、最近棋谱和成长统计；
- 响应式桌面端和移动端界面。

## 本地运行

```bash
python3 -m http.server 4173
```

访问 <http://localhost:4173>。

## API 契约

- `POST /api/analysis`：接收 PGN 文件或文本、`profileId` 和 `engine=stockfish`；
- `GET /api/analysis/:id`：查询分析状态和逐步评价；
- `GET /api/training-plan?profileId=:id`：获取当前棋手的训练计划。

生产环境应由服务端运行 Stockfish，并限制分析深度、并发数、文件大小和任务时长。后端不能只信任客户端传入的 `profileId`，必须结合登录账户验证档案归属，在棋谱、分析结果和训练计划查询中强制实施数据隔离。

## Nginx

静态文件可放在 `/var/www/chess`，并将 `/api/` 代理到分析服务：

```nginx
server {
    listen 80;
    server_name _;
    root /var/www/chess;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
    }
}
```
