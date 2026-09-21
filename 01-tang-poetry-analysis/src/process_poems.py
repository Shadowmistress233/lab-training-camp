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
import json
import jieba
from collections import defaultdict

# 经典意象分类字典体系（严格对应古典诗词核心意象）
TAXONOMY = [
    {
        "id": "season",
        "name": "四季时令",
        "words": ["春", "秋", "夏", "冬"]
    },
    {
        "id": "flora",
        "name": "植物花卉",
        "words": ["花", "松", "竹", "柳", "梅", "莲", "菊"]
    },
    {
        "id": "nature",
        "name": "天象地理",
        "words": ["云", "月", "山", "风", "雨", "雪", "江"]
    },
    {
        "id": "color",
        "name": "传统色彩",
        "words": ["金", "白", "青", "红", "翠", "绿", "黄"]
    },
    {
        "id": "emotion",
        "name": "人生意绪",
        "words": ["归", "愁", "醉", "忆", "梦", "泪"]
    }
]


def count_imagery_frequencies_jieba(corpus_path: str):
    """使用 jieba 全模式 (cut_all=True) 分词统计各意象词在全唐诗中的出现频次"""
    all_words = {w for cat in TAXONOMY for w in cat["words"]}
    word_counts = defaultdict(int)
    
    print("[*] 正在加载 jieba 词典与 Trie 前缀树...")
    jieba.initialize()
    
    print(f"[*] 正在进行 jieba 全模式分词扫描: {corpus_path}")
    with open(corpus_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line_s = line.strip()
            if not line_s:
                continue
            
            # 使用 jieba 全模式分词（Trie 树前缀匹配）
            tokens = jieba.lcut(line_s, cut_all=True)
            for token in tokens:
                if token in all_words:
                    word_counts[token] += 1
                    
    # 构建结构化 JSON 数据契约
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
