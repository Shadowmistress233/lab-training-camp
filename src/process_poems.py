#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全唐诗意象分析与数据契约生成引擎
Tang Poetry Imagery Extraction and Data Contract Generator

功能：
1. 正则解析《全唐诗》全文，提取 42,000+ 首诗的卷号、诗题、诗人与正文。
2. 依据经典多维意象体系（四季、花木、天象、色彩、意绪）统计全量词频。
3. 挖掘各意象的高频关联诗人（Top Poets）与经典代表名句（Sample Verses）。
4. 输出符合前端 D3.js 消费规范的 JSON 数据契约：web/data/imagery_data.json。
"""

import os
import re
import json
from collections import defaultdict
from datetime import datetime

# 意象分类字典体系
TAXONOMY = [
    {
        "id": "season",
        "name": "四季时令",
        "description": "四时更迭，草木荣枯，唐人笔下的岁月流转",
        "words": ["春", "夏", "秋", "冬"]
    },
    {
        "id": "flora",
        "name": "植物花卉",
        "description": "花木寄情，岁寒知节，中国古典文学的人格化意象",
        "words": ["柳", "桃", "梅", "菊", "竹", "莲", "松"]
    },
    {
        "id": "nature",
        "name": "天象地理",
        "description": "关山明月，长风烟云，盛唐雄浑阔大的自然图景",
        "words": ["月", "风", "云", "雪", "雨", "山", "江"]
    },
    {
        "id": "color",
        "name": "传统色彩",
        "description": "青黛朱白，金翠相映，大唐诗画交融的美学底色",
        "words": ["青", "白", "红", "翠", "金", "绿", "黄"]
    },
    {
        "id": "emotion",
        "name": "人生意绪",
        "description": "行客望乡，浮生若梦，唐代士人的悲欢与旷达",
        "words": ["愁", "梦", "泪", "归", "忆", "醉"]
    }
]

# 著名诗人白名单（用于名句优先挑选具有代表性的诗篇）
FAMOUS_POETS = {
    "李白", "杜甫", "白居易", "王维", "孟浩然", "李商隐", "杜牧",
    "王勃", "高适", "岑参", "韩愈", "柳宗元", "刘禹锡", "孟郊",
    "贺知章", "王昌龄", "温庭筠", "韦应物", "贾岛", "元稹"
}


def parse_tang_poems(corpus_path: str):
    """高效解析全唐诗文本文件"""
    poem_pattern = re.compile(r"^卷(\d+)_(\d+)\s+【(.*?)】(.*)")
    poems = []
    
    with open(corpus_path, "r", encoding="utf-8", errors="ignore") as f:
        current_poem = None
        for line in f:
            line_s = line.strip()
            if not line_s or line_s.startswith("----------------"):
                continue
            
            m = poem_pattern.match(line_s)
            if m:
                if current_poem and current_poem["content"]:
                    poems.append(current_poem)
                author = m.group(4).replace(" ", "").replace("\u3000", "").strip()
                current_poem = {
                    "volume": int(m.group(1)),
                    "index": int(m.group(2)),
                    "title": m.group(3).strip(),
                    "author": author if author else "佚名",
                    "content": []
                }
            elif current_poem is not None:
                current_poem["content"].append(line_s)
                
        if current_poem and current_poem["content"]:
            poems.append(current_poem)
            
    return poems


def extract_imagery_analytics(poems):
    """全面统计意象词频、高频诗人与代表名句"""
    # 获取所有需要分析的词集合
    all_words = set()
    for cat in TAXONOMY:
        for w in cat["words"]:
            all_words.add(w)
            
    # 数据统计容器
    word_counts = defaultdict(int)
    poet_word_counts = defaultdict(lambda: defaultdict(int))
    sample_verses = defaultdict(list)
    all_poets = set()

    for p in poems:
        author = p["author"]
        all_poets.add(author)
        full_text = " ".join(p["content"])
        
        # 拆解诗句（按常见标点切分为半句或单联）
        clauses = re.split(r"[，。？！；\s]+", full_text)
        
        for w in all_words:
            count = full_text.count(w)
            if count > 0:
                word_counts[w] += count
                poet_word_counts[w][author] += count
                
                # 提取名句示例：优先挑选著名诗人的精炼诗句
                is_famous = author in FAMOUS_POETS
                if is_famous and len(sample_verses[w]) < 10:
                    for i in range(len(clauses)):
                        clause = clauses[i].strip()
                        if w in clause and 4 <= len(clause) <= 10:
                            pair = clause
                            if i + 1 < len(clauses) and len(clauses[i+1]) in (5, 7):
                                pair = f"{clause}，{clauses[i+1]}。"
                            elif i > 0 and len(clauses[i-1]) in (5, 7):
                                pair = f"{clauses[i-1]}，{clause}。"
                            else:
                                pair = f"{clause}。"
                                
                            sample_verses[w].append({
                                "author": author,
                                "title": p["title"],
                                "verse": pair,
                                "is_famous": True
                            })
                            break
                elif not sample_verses[w]:  # 兜底：若暂无著名诗人名句，先暂存一条普通诗句
                    for i in range(len(clauses)):
                        clause = clauses[i].strip()
                        if w in clause and 4 <= len(clause) <= 10:
                            pair = f"{clause}。"
                            sample_verses[w].append({
                                "author": author,
                                "title": p["title"],
                                "verse": pair,
                                "is_famous": False
                            })
                            break

    # 排序与组装 JSON 契约
    categories_output = []
    for cat in TAXONOMY:
        items = []
        cat_total = 0
        for w in cat["words"]:
            w_total = word_counts[w]
            cat_total += w_total
            
            # 排序 Top 诗人
            sorted_poets = sorted(
                poet_word_counts[w].items(),
                key=lambda x: x[1],
                reverse=True
            )[:5]
            top_poets = [{"poet": poet, "count": cnt} for poet, cnt in sorted_poets]
            
            # 整理名句（著名诗人优先）
            verses = sorted(
                sample_verses[w],
                key=lambda x: (not x["is_famous"], -len(x["verse"]))
            )[:3]
            
            items.append({
                "name": w,
                "value": w_total,
                "top_poets": top_poets,
                "samples": verses
            })
            
        # 按频次降序排列子意象
        items.sort(key=lambda x: x["value"], reverse=True)
        
        categories_output.append({
            "id": cat["id"],
            "name": cat["name"],
            "description": cat["description"],
            "total_count": cat_total,
            "items": items
        })

    result = {
        "categories": categories_output,
        "meta": {
            "corpus_name": "全唐诗",
            "total_poems": len(poems),
            "total_poets": len(all_poets),
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
    }
    
    return result


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    corpus_path = os.path.join(base_dir, "data", "全唐诗.txt")
    output_path = os.path.join(base_dir, "web", "data", "imagery_data.json")
    
    print(f"[*] 正在解析《全唐诗》语料: {corpus_path}")
    poems = parse_tang_poems(corpus_path)
    print(f"[+] 成功解析 {len(poems)} 首唐诗。")
    
    print("[*] 正在进行多维意象与诗人关联挖掘...")
    data_contract = extract_imagery_analytics(poems)
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data_contract, f, ensure_ascii=False, indent=2)
        
    print(f"[+] 数据契约生成完毕，已保存至: {output_path}")
    
    # 打印简短摘要
    print("\n=== 意象挖掘概览 ===")
    for cat in data_contract["categories"]:
        top_item = cat["items"][0] if cat["items"] else None
        top_str = f"Top1: '{top_item['name']}' ({top_item['value']}次)" if top_item else ""
        print(f"- 【{cat['name']}】: 总频次 {cat['total_count']} | {top_str}")


if __name__ == "__main__":
    main()
