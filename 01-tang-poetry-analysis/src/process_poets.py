#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全唐诗诗人多维情感偏好提取引擎 (Poet Multidimensional Sentiment Mining Engine)

功能：
1. 扫描《全唐诗》全文，提取诗作数量 >= 200 首的核心代表诗人（前 28 位诗人，覆盖李杜、白居易、王维、孟浩然、高适、岑参等）。
2. 基于古典诗词六维情感模型（豪迈旷达、沉郁悲怆、闲适禅意、羁旅相思、孤高愤懑、愉悦欢欣），使用 Jieba 分词提取情感词频。
3. 对每位诗人的情感特征进行千行密度归一化（0~100 偏好指数），消除创作总量的规模偏差。
4. 提取各诗人最具代表性的名句与高频情感词。
5. 输出标准化 JSON 数据契约：web/data/poet_sentiment.json。
"""

import os
import re
import json
import jieba
from collections import defaultdict

# 六维古典情感词典体系
EMOTION_TAXONOMY = [
    {
        "id": "heroic",
        "name": "豪迈旷达",
        "description": "豪情壮志、纵酒狂歌、仗剑天涯",
        "color": "#c23531",  # 朱红
        "words": ["狂", "豪", "剑", "醉", "烈", "雄", "啸", "饮", "歌", "纵", "万", "浩", "飞"]
    },
    {
        "id": "tragic",
        "name": "沉郁悲怆",
        "description": "忧国忧民、身世漂泊、慷慨悲歌",
        "color": "#2f4554",  # 墨青
        "words": ["悲", "哀", "泪", "哭", "痛", "伤", "死", "苦", "凄", "惨", "凋", "病", "老"]
    },
    {
        "id": "zen",
        "name": "闲适禅意",
        "description": "山水田园、淡泊宁静、禅意栖居",
        "color": "#61a0a8",  # 翠绿/青碧
        "words": ["静", "闲", "禅", "松", "竹", "幽", "溪", "眠", "云", "僧", "泉", "清", "鹤"]
    },
    {
        "id": "nostalgia",
        "name": "羁旅相思",
        "description": "故园怀想、关山难越、离愁别恨",
        "color": "#d48265",  # 赭石/浅褐
        "words": ["愁", "思", "忆", "归", "乡", "客", "梦", "望", "别", "远", "家", "关", "夜"]
    },
    {
        "id": "solitary",
        "name": "孤高愤懑",
        "description": "怀才不遇、孤芳自赏、清冷峻峭",
        "color": "#91c7ae",  # 灰绿/冷青
        "words": ["孤", "独", "恨", "怨", "愤", "叹", "寒", "空", "寂", "难", "穷", "落", "冷"]
    },
    {
        "id": "joy",
        "name": "愉悦欢欣",
        "description": "春意盎然、良朋相聚、怡然自得",
        "color": "#ca8622",  # 琥珀/金黄
        "words": ["欢", "喜", "笑", "乐", "欣", "适", "悦", "佳", "春", "荣", "晴", "芳", "新"]
    }
]


VOLUME_DIVIDER_PATTERN = re.compile(
    r'^(?:钱建文制作|全唐诗|卷[一二三四五六七八九十百千万\d]+|[-=_\s]{4,})$'
)


def parse_poets_and_sentiments(corpus_path: str, min_poems: int = 200):
    print(f"[*] 1. 开始解析全唐诗文本: {corpus_path}")
    
    # 词典预热与扁平化索引
    word_to_emotion = {}
    for emo in EMOTION_TAXONOMY:
        for w in emo["words"]:
            word_to_emotion[w] = emo["id"]

    # 诗人诗作收集
    # poet -> {"poem_count": int, "lines": list of (title, line_text)}
    poet_data = defaultdict(lambda: {"poem_count": 0, "lines": []})

    current_poet = None
    current_title = None

    with open(corpus_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line_s = line.strip()
            if not line_s:
                continue

            # 1. 遇到分卷标记或系统版权线，强制重置当前诗人与诗题状态
            if VOLUME_DIVIDER_PATTERN.match(line_s):
                current_poet = None
                current_title = None
                continue

            # 2. 匹配诗题与诗人: 卷1_1 【帝京篇十首】李世民
            m = re.match(r'^卷\d+_\d+\s+【(.*?)】(.*)$', line_s)
            if m:
                title = m.group(1).strip()
                poet = m.group(2).strip()
                # 清洗括号或附加说明
                poet = re.sub(r'[\s（\(].*$', '', poet)
                if poet:
                    current_poet = poet
                    current_title = title
                    poet_data[poet]["poem_count"] += 1
                else:
                    current_poet = None
                    current_title = None
            elif current_poet:
                # 3. 诗句行（确保过滤残留的分卷与脏元数据）
                if not (line_s.startswith(('---', '===', '卷')) or VOLUME_DIVIDER_PATTERN.match(line_s)):
                    poet_data[current_poet]["lines"].append((current_title, line_s))


    print(f"[*] 解析完毕，全书检测到诗人 {len(poet_data)} 位。")

    # 筛选诗作 >= min_poems 的诗人
    qualified_poets = [
        (p, d["poem_count"], d["lines"])
        for p, d in poet_data.items()
        if d["poem_count"] >= min_poems
    ]
    # 按诗作数量降序排列
    qualified_poets.sort(key=lambda x: x[1], reverse=True)
    print(f"[*] 筛选出诗作 >= {min_poems} 首的代表诗人共 {len(qualified_poets)} 位。")

    # 2. 分词与情感统计
    print("[*] 2. 正在进行 Jieba 分词与情感特征提取...")
    jieba.initialize()

    results = {
        "dimensions": [
            {
                "id": emo["id"],
                "name": emo["name"],
                "description": emo["description"],
                "color": emo["color"]
            }
            for emo in EMOTION_TAXONOMY
        ],
        "poets": []
    }

    # 收集所有合格诗人的原始频次，以便后续全局归一化
    # poet_name -> {emo_id: count}
    raw_densities = {}

    for poet, poem_count, lines in qualified_poets:
        emo_counts = defaultdict(int)
        word_freq = defaultdict(int)
        sample_verses = defaultdict(list)
        total_lines = len(lines)

        for title, line_text in lines:
            words = jieba.lcut(line_text, cut_all=True)
            for w in words:
                if w in word_to_emotion:
                    emo_id = word_to_emotion[w]
                    emo_counts[emo_id] += 1
                    word_freq[(emo_id, w)] += 1
                    # 记录代表性诗句（诗句包含该词且诗句长度适中）
                    if len(sample_verses[emo_id]) < 3 and 10 <= len(line_text) <= 30:
                        sample_verses[emo_id].append({
                            "title": title,
                            "verse": line_text,
                            "trigger_word": w
                        })

        # 计算每千行出现频次 (Density per 1000 lines)
        density = {}
        for emo in EMOTION_TAXONOMY:
            e_id = emo["id"]
            cnt = emo_counts[e_id]
            # 每 1000 行出现次数
            density[e_id] = (cnt / max(total_lines, 1)) * 1000

        raw_densities[poet] = {
            "poem_count": poem_count,
            "total_lines": total_lines,
            "density": density,
            "sample_verses": sample_verses,
            "word_freq": word_freq
        }

    # 3. 归一化评分 (按各情感维度的最大密度映射到 20 ~ 100，保留辨识度)
    max_densities = {}
    for emo in EMOTION_TAXONOMY:
        e_id = emo["id"]
        max_densities[e_id] = max(
            raw_densities[p]["density"][e_id] for p in raw_densities
        )

    for rank, (poet, _, _) in enumerate(qualified_poets, 1):
        info = raw_densities[poet]
        profile = []
        dominant_emo = None
        max_score = -1

        for emo in EMOTION_TAXONOMY:
            e_id = emo["id"]
            d_val = info["density"][e_id]
            max_d = max_densities[e_id]
            # 归一化得分 (15 - 100 分，避免圆心重叠)
            score = round((d_val / max_d) * 85 + 15, 1)

            # 提取该维度最高频的 3 个词
            top_words = sorted(
                [w for (eid, w), cnt in info["word_freq"].items() if eid == e_id],
                key=lambda w: info["word_freq"][(e_id, w)],
                reverse=True
            )[:3]

            samples = info["sample_verses"].get(e_id, [])

            profile.append({
                "id": e_id,
                "name": emo["name"],
                "score": score,
                "top_words": top_words,
                "samples": samples
            })

            if score > max_score:
                max_score = score
                dominant_emo = emo["name"]

        results["poets"].append({
            "rank": rank,
            "name": poet,
            "poem_count": info["poem_count"],
            "total_lines": info["total_lines"],
            "dominant_emotion": dominant_emo,
            "profile": profile
        })

    return results


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    corpus_path = os.path.join(project_root, "data", "全唐诗.txt")
    output_path = os.path.join(project_root, "web", "data", "poet_sentiment.json")

    results = parse_poets_and_sentiments(corpus_path, min_poems=200)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"[✓] 成功生成诗人情感偏好数据契约: {output_path}")
    print(f"[*] 首批诗人示例:")
    for p in results["poets"][:5]:
        print(f"    #{p['rank']} {p['name']} ({p['poem_count']}首) -> 主导情绪: {p['dominant_emotion']}")


if __name__ == "__main__":
    main()
