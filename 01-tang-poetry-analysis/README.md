# 唐诗意象用词分析与交互可视化 (01-tang-poetry-analysis)

基于《全唐诗》语料库的文本数据分析与交互可视化系统。

## 模块说明

- **数据处理层 (Python)**：
  - 解析《全唐诗》原始文本（卷号、诗题、作者、诗句）。
  - 使用 Jieba 全模式（`cut_all=True`）进行前缀分词，准确提取复合词中的单字意象（如从“青山”中提取“山”）。
  - 统计意象频次、代表诗人及诗句，生成前后端数据契约 `web/data/imagery_data.json`。

- **可视化交互层 (D3.js v5 + Vite)**：
  - 采用古典宣纸与传统配色风格。
  - 响应式 D3 柱状图，支持平滑过渡动画与悬浮提示（Tooltip）。
  - 采用全局固定 Y 轴刻度，避免分类切换时坐标轴数字抖动或越界。
  - 基于 Vite + pnpm 构建，支持热更新（HMR）。

## 目录说明

```text
01-tang-poetry-analysis/
├── README.md
├── package.json
├── vite.config.js
├── src/
│   └── process_poems.py            # 语料解析与意象统计脚本
└── web/
    ├── index.html                  # 页面结构
    ├── css/
    │   └── style.css               # 古风样式
    ├── js/
    │   └── app.js                  # D3 可视化与交互逻辑
    └── data/
        └── imagery_data.json       # 处理后的意象数据
```

## 快速上手

### 1. 安装依赖

```bash
# Python 依赖
pip install jieba

# 前端依赖
pnpm install
```

### 2. 执行数据处理

```bash
python src/process_poems.py
```

### 3. 启动前端服务

```bash
pnpm dev
```

启动后访问 `http://localhost:5173` 即可查看可视化页面。
