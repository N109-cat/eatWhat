# eatWhat

吃什么记录打卡：一个本地优先的美食探店便利贴墙，用来保存从小红书看到的想打卡店铺。

## 功能

- 粘贴小红书链接、帖子正文或截图图片，用 ModelScope 大模型整理店铺名称、类型、位置、人均、推荐菜等字段
- 保存前可编辑解析结果
- 按添加日期生成便利贴分组
- 按店铺类型和自定义标签筛选
- 支持待打卡、已打卡状态
- 已打卡记录可补充日期、评分和备注
- 使用浏览器本地存储保存数据

## 本地运行

复制 `.env.example` 为 `.env.local`，并填入自己的 ModelScope Token：

```bash
MODELSCOPE_API_KEY=你的 ModelScope Token
MODELSCOPE_BASE_URL=https://api-inference.modelscope.cn
MODELSCOPE_MODEL_ID=Qwen/Qwen3.5-397B-A17B
```

```bash
npm install
npm run dev
```

访问 `http://127.0.0.1:3000`。

## 常用命令

```bash
npm run lint
npm run build
```

## 技术栈

- Next.js
- React
- TypeScript
- lucide-react
