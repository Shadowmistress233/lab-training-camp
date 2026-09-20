#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全唐诗意象分析与数据契约生成引擎 (MVP 版本)
Tang Poetry Imagery Extraction - MVP Version

功能：
1. 解析《全唐诗》语料文本。
2. 依据 5 大经典意象分类（四季、植物、天象、色彩、意绪）统计全量字词频次。
3. 输出极简、解耦的数据契约：web/data/imagery_data.json。
"""

import os
import json
from collections import defaultdict

# 经典意象分类字典
TAXONOMY = [
    {
        "id": "season",
        "name": "四季时令",
        "words": ["春", "夏", "秋", "冬"]
    },
    {
        "id": "flora",
        "name": "植物花卉",
        "words": ["松", "柳", "桃", "梅", "竹", "莲", "菊"]
    },
    {
        "id": "nature",
        "name": "天象地理",
        "words": ["山", "月", "风", "云", "江", "雨", "雪"]
    },
    {
        "id": "color",
        "name": "传统色彩",
        "words": ["白", "青", "金", "红", "翠", "绿", "黄"]
    },
    {
        "id": "emotion",
        "name": "人生意绪",
        "words": ["归", "愁", "梦", "醉", "泪", "忆"]
    }
]


def count_imagery_frequencies(corpus_path: str):
    """统计各意象词在全唐诗中的出现频次"""
    all_words = {w for cat in TAXONOMY for w in cat["words"]}
    word_counts = defaultdict(int)
    
    with open(corpus_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line_s = line.strip()
            if not line_s or line_s.startswith("----------------"):
                continue
            for w in all_words:
                if w in line_s:
                    word_counts[w] += line_s.count(w)
                    
    # 构建极简数据契约
    categories_output = []
    for cat in TAXONOMY:
        items = []
        cat_total = 0
        for w in cat["words"]:
            cnt = word_counts[w]
            cat_total += cnt
            items.append({
                "name": w,
                "value": cnt
            })
            
        # 按出现频次降序排序
        items.sort(key=lambda x: x["value"], reverse=True)
        
        categories_output.append({
            "id": cat["id"],
            "name": cat["name"],
            "total_count": cat_total,
            "items": items
        })
        
    return {"categories": categories_output}


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    corpus_path = os.path.join(base_dir, "data", "全唐诗.txt")
    output_path = os.path.join(base_dir, "web", "data", "imagery_data.json")
    
    print(f"[*] 正在分析《全唐诗》: {corpus_path}")
    data_contract = count_imagery_frequencies(corpus_path)
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data_contract, f, ensure_ascii=False, indent=2)
        
    print(f"[+] 极简数据契约已生成: {output_path}")
    for cat in data_contract["categories"]:
        top = cat["items"][0]
        print(f"  - 【{cat['name']}】: 总计 {cat['total_count']} 次 | 榜首: '{top['name']}' ({top['value']} 次)")


if __name__ == "__main__":
    main()
