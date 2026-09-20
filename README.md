# 唐诗意象分析与交互可视化系统 (Tang Poetry Imagery Analysis & Visualization)

本项目为实验室训练营综合训练题——“文本相关数据分析：唐诗用词特点分析”。

## 项目定位与架构设计

本项目遵循 **CS61A/B 软件工程与数据抽象原则** 进行分层设计：

- **数据抽象层 (Data Layer - Python)**：
  - 高效解析《全唐诗》全量文本（卷号、诗题、诗人、正文）。
  - 基于多维意象字典（四季、花卉、色彩、天象、情感）进行词频统计与关联分析。
  - 提取意象关联的 **Top 诗人 (Poet)** 与 **代表名句 (Sample Verses)**。
  - 产出规范的前后端数据契约：`web/data/imagery_data.json`。

- **可视化表现层 (Presentation Layer - D3.js)**：
  - 采用中国古典美学风格（宣纸质感底色、中国传统色、古风排版）。
  - 左侧：古风意象分类卡片/标签云。
  - 右侧：D3.js (v5) 响应式柱状图，支持分类切换时的平滑补间动画（Transition）与交互 Tooltip。

## 目录结构

```text
tang-poetry-analysis/
├── .gitignore              # Git 忽略规则
├── README.md               # 项目文档与技术规格
├── .venv/                  # uv 创建的 Python 虚拟环境 (已忽略)
├── data/                   # 原始语料数据
├── src/                    # Python 数据清洗与解析脚本
│   └── process_poems.py    # 全唐诗解析与意象挖掘引擎
└── web/                    # 前端可视化
    ├── index.html          # 可视化主页面
    ├── css/
    │   └── style.css       # 古风样式
    ├── js/
    │   └── app.js          # D3 交互与渲染逻辑
    └── data/
        └── imagery_data.json # 前后端交互数据契约
```

## 快速上手

### 1. 环境准备
使用 `uv` 虚拟环境：
```bash
# 激活虚拟环境
source .venv/bin/activate
```

### 2. 数据处理
```bash
python src/process_poems.py
```

### 3. 启动可视化预览
```bash
cd web
python3 -m http.server 8000
```
在浏览器中访问 `http://localhost:8000` 查看效果。
