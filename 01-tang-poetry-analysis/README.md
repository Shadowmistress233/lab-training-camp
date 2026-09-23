# 唐诗意象用词分析与交互可视化 (01-tang-poetry-analysis)

基于《全唐诗》语料库的文本数据分析与交互可视化系统。

## 模块说明

- **数据处理层 (Python)**：
  - `src/process_poems.py`：解析《全唐诗》原始语料，基于 Jieba 全模式进行高频意象挖掘与代表诗句切片，生成 `web/data/imagery_data.json`。
  - `src/process_poets.py`：统计高产诗人在悲喜、山水、边塞等 6 个古典维度的词频密度（按各诗人总词数归一化，消除作品篇数偏差），生成 `web/data/poet_sentiment_data.json`。
  - `src/process_clusters.py`：提取 52 位代表诗人的 150 维 TF-IDF 词袋特征，执行 KMeans (K=4) 聚类与 t-SNE 二维流形降维，输出兼顾全局结构与局部岛屿分布的 `web/data/cluster_data.json`。

- **交互可视化层 (D3.js v5 + Vite)**：
  - 宣纸底色与传统中国古典墨色系调色盘。
  - **Tab 1 - 意象词频 (index.html)**：全局统一 Y 轴尺度的交互柱状图，支持类别平滑过渡与悬浮诗句摘录。
  - **Tab 2 - 诗人画像 (poets.html)**：多诗人六维情感雷达/极坐标柱状图，支持诗人即时切换与动态环形补间动画。
  - **Tab 3 - 风格流形 (clusters.html)**：t-SNE 二维散点群与平滑凸包水彩疆域（Watercolor Polygon Hulls），配备 SVG 文本 Halo 描边与画布平移缩放（Zoom & Pan）。

## 目录说明

```text
01-tang-poetry-analysis/
├── README.md
├── package.json
├── vite.config.js
├── src/
│   ├── process_poems.py            # 语料解析与意象统计
│   ├── process_poets.py            # 诗人六维情感特征计算
│   └── process_clusters.py         # TF-IDF + KMeans + t-SNE 聚类流形
└── web/
    ├── index.html                  # Tab 1: 意象词频柱状图
    ├── poets.html                  # Tab 2: 诗人六维画像极坐标图
    ├── clusters.html               # Tab 3: 诗人风格聚类流形散点图
    ├── css/
    │   └── style.css               # 古风统一样式与 Halo 描边规则
    ├── js/
    │   ├── app.js                  # Tab 1 逻辑
    │   ├── poets.js                # Tab 2 逻辑
    │   └── clusters.js             # Tab 3 逻辑
    └── data/
        ├── imagery_data.json       # 意象数据
        ├── poet_sentiment.json     # 诗人画像数据
        └── poet_clusters.json      # 聚类流形数据

```

## 快速上手

### 1. 安装依赖

```bash
# Python 依赖 (推荐在虚拟环境中执行)
pip install jieba scikit-learn numpy scipy

# 前端依赖
pnpm install
```

### 2. 执行数据处理

```bash
# 生成意象数据
python src/process_poems.py

# 生成诗人画像数据
python src/process_poets.py

# 生成聚类流形数据
python src/process_clusters.py
```

### 3. 启动前端服务

```bash
pnpm dev
```

启动后可在浏览器中直接访问系统：
- 意象分析：`http://localhost:5173/`
- 诗人画像：`http://localhost:5173/poets.html`
- 风格流形：`http://localhost:5173/clusters.html`

