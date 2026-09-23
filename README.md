# 实验室训练营综合实践 (lab-training-camp)

本项目为实验室训练营的综合练习合集，包含文本分析、时间序列可视化以及图网络分析等模块。

## 模块列表

| 模块目录 | 内容简介 | 技术栈 | 状态 |
| :--- | :--- | :--- | :--- |
| `01-tang-poetry-analysis` | 全唐诗意象用词分析与交互可视化 | Python (Jieba, Sklearn), D3.js v5, Vite | 已结项 (v1.0.0) |
| `02-time-series-analysis` | 多维时间序列数据分析与可视化 | Python, D3.js | 待展开 |
| `03-graph-network-analysis` | 复杂网络与图结构分析 | Python (NetworkX), D3-force | 待展开 |

## 目录结构

```text
lab-training-camp/
├── README.md                       # 合集仓库导航文档
├── LICENSE                         # 开源许可证声明 (ISC License)
├── AGENTS.md                       # AI 编程助手协作规范与知识沉淀
├── .gitignore                      # 全局 Git 忽略规则
│
├── 01-tang-poetry-analysis/        # 模块一：唐诗意象分析
│   ├── README.md                   # 模块说明文档
│   ├── requirements.txt            # Python 依赖清单
│   ├── package.json                # 前端构建配置
│   ├── vite.config.js              # Vite 配置
│   ├── src/                        # Python 数据处理
│   ├── tests/                      # 自动化测试套件
│   └── web/                        # D3.js 前端页面与数据
│
├── 02-time-series-analysis/        # 模块二（待展开）
└── 03-graph-network-analysis/      # 模块三（待展开）
```

## 环境要求

- Python >= 3.10
- Node.js >= 20.x
- pnpm >= 9.x (推荐 pnpm 10+)
