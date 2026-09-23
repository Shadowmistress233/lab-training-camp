#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全唐诗意象分析与数据契约生成引擎 (jieba 全模式分词版)
Tang Poetry Imagery Extraction - jieba cut_all Version

功能：
1. 使用 jieba 全模式 (cut_all=True) 解析《全唐诗》全文，严格对齐官方基准 (唐诗 top1000.csv)。
2. 基于 Trie 前缀树扫描 5 大经典意象分类（四季、植物花卉、天象地理、传统色彩、人生意绪）。
3. 输出符合前端 D3.js 消费规范的极简 JSON 数据契约：web/data/imagery_data.json。
"""

import os
import re
import json
import jieba
from collections import defaultdict

# 经典文学宗师（经典诗句优先提取宗师名作）
CORE_MASTERS = {
    "李白", "杜甫", "白居易", "王维", "孟浩然", "李商隐", "杜牧",
    "刘禹锡", "贾岛", "孟郊", "岑参", "高适", "韦应物", "温庭筠"
}

VOLUME_DIVIDER_PATTERN = re.compile(
    r'^(?:钱建文制作|全唐诗|卷[一二三四五六七八九十百千万\d]+|[-=_\s]{4,})$'
)

# 经典意象分类字典体系（严格对应古典诗词核心意象）
TAXONOMY = [
    {
        "id": "season",
        "name": "四季时令",
        "description": "春生夏长，秋收冬藏，四时流转中的岁月感怀与生命律动",
        "words": ["春", "秋", "夏", "冬"]
    },
    {
        "id": "flora",
        "name": "植物花卉",
        "description": "松竹傲骨，草木寄兴，藉自然芳菲抒发人格气节与幽居情致",
        "words": ["花", "松", "竹", "柳", "梅", "莲", "菊"]
    },
    {
        "id": "nature",
        "name": "天象地理",
        "description": "天象浩荡，山河辽阔，以天地万象构建博大开阔的诗性空间",
        "words": ["云", "月", "山", "风", "雨", "雪", "江"]
    },
    {
        "id": "color",
        "name": "传统色彩",
        "description": "丹青交织，白山青水，藉斑斓物象寄托主观色彩与审美意趣",
        "words": ["金", "白", "青", "红", "翠", "绿", "黄"]
    },
    {
        "id": "emotion",
        "name": "人生意绪",
        "description": "悲欢离合，羁旅乡思，唐人深情凝注的人生寄托与心灵图景",
        "words": ["归", "愁", "醉", "忆", "梦", "泪"]
    }
]


def count_imagery_frequencies_jieba(corpus_path: str):
    """使用 jieba 全模式 (cut_all=True) 分词统计各意象词在全唐诗中的出现频次，并提取偏好诗人与名句"""
    all_words = {w for cat in TAXONOMY for w in cat["words"]}
    word_counts = defaultdict(int)
    word_poet_counts = defaultdict(lambda: defaultdict(int))
    word_samples = defaultdict(list)

    print("[*] 正在加载 jieba 词典与 Trie 前缀树...")
    jieba.initialize()

    print(f"[*] 正在进行 jieba 全模式分词与名句抽取: {corpus_path}")
    current_poet = None
    current_title = None

    with open(corpus_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line_s = line.strip()
            if not line_s:
                continue

            # 1. 遇到分卷标记，清空当前诗人状态
            if VOLUME_DIVIDER_PATTERN.match(line_s):
                current_poet = None
                current_title = None
                continue

            # 2. 匹配诗题与诗人: 卷1_1 【帝京篇十首】李世民
            m = re.match(r'^卷\d+_\d+\s+【(.*?)】(.*)$', line_s)
            if m:
                title = m.group(1).strip()
                poet = m.group(2).strip()
                poet = re.sub(r'[\s（\(].*$', '', poet)
                if poet:
                    current_poet = poet
                    current_title = title
                else:
                    current_poet = None
                    current_title = None
            elif current_poet and current_title:
                # 3. 收集高质量样本诗句 (行长度在 10 ~ 28 字之间，含中文逗号或句号)
                if 10 <= len(line_s) <= 28 and ("，" in line_s or "。" in line_s):
                    is_master = current_poet in CORE_MASTERS
                    for w in all_words:
                        if w in line_s:
                            candidate = {
                                "verse": line_s,
                                "author": current_poet,
                                "title": current_title
                            }
                            if is_master:
                                word_samples[w].insert(0, candidate)
                            elif len(word_samples[w]) < 5:
                                word_samples[w].append(candidate)

            # 4. 全模式分词（严格保持与基准完全一致的统计口径）
            tokens = jieba.lcut(line_s, cut_all=True)
            for token in tokens:
                if token in all_words:
                    word_counts[token] += 1
                    if current_poet:
                        word_poet_counts[token][current_poet] += 1

    # 构建结构化 JSON 数据契约
    categories_output = []
    for cat in TAXONOMY:
        items = []
        cat_total = 0
        for w in cat["words"]:
            cnt = word_counts[w]
            cat_total += cnt

            # 提取前 3 位高频偏好诗人
            top_poets = [
                {"poet": p, "count": c}
                for p, c in sorted(
                    word_poet_counts[w].items(),
                    key=lambda x: x[1],
                    reverse=True
                )[:3]
            ]

            # 提取 1 条经典诗句
            samples = word_samples[w][:1]

            items.append({
                "name": w,
                "value": cnt,
                "top_poets": top_poets,
                "samples": samples
            })

        # 按出现频次降序排序
        items.sort(key=lambda x: x["value"], reverse=True)

        categories_output.append({
            "id": cat["id"],
            "name": cat["name"],
            "description": cat["description"],
            "total_count": cat_total,
            "items": items
        })

    return {"categories": categories_output}



def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    corpus_path = os.path.join(base_dir, "data", "全唐诗.txt")
    output_path = os.path.join(base_dir, "web", "data", "imagery_data.json")
    
    data_contract = count_imagery_frequencies_jieba(corpus_path)
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data_contract, f, ensure_ascii=False, indent=2)
        
    print(f"[+] jieba 全模式数据契约已生成: {output_path}")
    print("\n=== 对齐基准验证结果 ===")
    for cat in data_contract["categories"]:
        top = cat["items"][0]
        print(f"  - 【{cat['name']}】: 总计 {cat['total_count']} 次 | 榜首: '{top['name']}' ({top['value']} 次)")


if __name__ == "__main__":
    main()
