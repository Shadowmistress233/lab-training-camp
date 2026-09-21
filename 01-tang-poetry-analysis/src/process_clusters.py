#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全唐诗诗人用词偏好聚类与 PCA 降维分析引擎 (Poet Clustering & PCA Engine)

功能：
1. 提取诗作 >= 200 首的代表诗人，构建诗人的全文语料。
2. 使用 Jieba 分词与精炼古典停用词过滤，构建 150 维 TF-IDF 词频特征矩阵。
3. 应用 KMeans 算法进行无监督聚类 (K=4)，自动发掘唐诗核心文学流派。
4. 应用 PCA (主成分分析) 将 150 维特征降维至二维平面坐标 (X, Y)。
5. 提取各聚类簇的核心特征词与代表诗人，输出标准化数据契约：web/data/poet_clusters.json。
"""

import os
import re
import json
import jieba
import numpy as np
from collections import defaultdict
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from sklearn.manifold import TSNE

# 核心文学宗师名单（散点图中默认高亮显示名字，其他诗人悬停/放大显示）
CORE_MASTERS = {
    "李白", "杜甫", "白居易", "王维", "孟浩然", "高适", "岑参", 
    "李商隐", "杜牧", "贾岛", "孟郊", "刘禹锡", "温庭筠", "韦应物", "齐己", "元稹"
}

# 古典汉语停用词与高频虚词（过滤语法杂音与泛用套话，突出具有流派特征的实体名词、意象与情感词）
STOP_WORDS = {
    "之", "乎", "者", "也", "而", "其", "于", "以", "为", "不", "无", "一", "有", 
    "是", "中", "所", "去", "得", "自", "与", "时", "出", "如", "上", "下", "来", 
    "看", "见", "知", "相", "何", "莫", "此", "前", "后", "生", "向", "复", "又", 
    "多", "将", "欲", "尽", "可", "已", "未", "还", "便", "若", "道", "作", "更",
    "那", "甚", "且", "休", "虽", "争", "徒", "应", "须", "聊", "唯", "但", "方",
    "正", "即", "随", "因", "故", "被", "及", "各", "共", "齐", "同", "并", "或",
    "即", "重", "两", "三", "四", "五", "六", "七", "八", "九", "十", "百", "千",
    # 常见泛用短语与虚词套话
    "不知", "何处", "今日", "不得", "不可", "万里", "千里", "平生", "相逢", "何事",
    "如何", "此时", "故人", "无人", "悠悠", "年年", "风光", "莫怪", "休问", "应是",
    "长是", "犹是", "只有", "到处", "归去", "何必", "自是", "未得", "不是", "莫向",
    "岂知", "借问", "不见", "若是", "正是", "空有", "犹有", "更有", "那堪", "可怜",
    "争奈", "莫道", "往往", "终日", "几度", "分明", "此地", "当年", "谁知", "从今",
    "何年", "何日", "先生", "天子", "如今", "一时", "何人", "几人", "无限", "多少",
    "制作", "建文", "全唐诗", "卷数"
}

# 预设中国传统色用于区分聚类
CLUSTER_COLORS = [
    "#b23a22",  # 朱砂 (盛唐/宏大现实)
    "#6a4c77",  # 暮紫 (晚唐/感伤绮丽)
    "#3b7a57",  # 碧玉 (山水田园/幽栖)
    "#2c3e50"   # 黛蓝/玄青 (禅门隐逸/清修)
]


def parse_corpus(corpus_path: str, min_poems: int = 200):
    print(f"[*] 1. 开始读取全唐诗语料: {corpus_path}")
    poet_texts = defaultdict(list)
    poet_poem_counts = defaultdict(int)

    current_poet = None

    with open(corpus_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line_s = line.strip()
            if not line_s:
                continue

            m = re.match(r'^卷\d+_\d+\s+【(.*?)】(.*)$', line_s)
            if m:
                poet = m.group(2).strip()
                poet = re.sub(r'[\s（\(].*$', '', poet)
                if poet:
                    current_poet = poet
                    poet_poem_counts[poet] += 1
                else:
                    current_poet = None
            elif current_poet:
                poet_texts[current_poet].append(line_s)

    # 筛选合格诗人
    qualified = [
        (p, poet_poem_counts[p], "\n".join(poet_texts[p]))
        for p in poet_texts
        if poet_poem_counts[p] >= min_poems
    ]
    qualified.sort(key=lambda x: x[1], reverse=True)
    print(f"[*] 成功提取 {len(qualified)} 位诗作 >= {min_poems} 首的代表诗人。")
    return qualified


def tokenize_corpus(qualified_poets):
    print("[*] 2. 正在进行 Jieba 分词与停用词过滤...")
    jieba.initialize()

    corpus_tokenized = []
    poet_names = []
    poet_counts = []

    for name, count, full_text in qualified_poets:
        words = jieba.lcut(full_text, cut_all=False)
        # 仅保留长度 >= 1 的有效词，且不在停用词表中，且非纯标点/空格
        clean_words = [
            w for w in words
            if len(w) >= 1 and w not in STOP_WORDS and not re.match(r'^[\s\d\W]+$', w)
        ]
        corpus_tokenized.append(" ".join(clean_words))
        poet_names.append(name)
        poet_counts.append(count)

    return poet_names, poet_counts, corpus_tokenized


def perform_clustering_and_pca(poet_names, poet_counts, corpus_tokenized, n_clusters=4):
    print("[*] 3. 构建 TF-IDF 特征矩阵 (Top 150 词)...")
    vectorizer = TfidfVectorizer(max_features=150, min_df=2)
    tfidf_matrix = vectorizer.fit_transform(corpus_tokenized)
    feature_names = np.array(vectorizer.get_feature_names_out())

    print(f"[*] 特征矩阵形状: {tfidf_matrix.shape}")

    # KMeans 聚类
    print(f"[*] 4. 执行 KMeans 聚类 (K={n_clusters})...")
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=15)
    cluster_labels = kmeans.fit_predict(tfidf_matrix)

    # t-SNE 流形学习降维至 2 维（流派群岛化分离，彻底解决中心扎堆与拥挤问题）
    print("[*] 5. 执行 t-SNE 流形降维 (群岛化流派分离)...")
    tsne = TSNE(
        n_components=2,
        perplexity=10,
        random_state=42,
        max_iter=1500,
        learning_rate="auto",
        init="pca"
    )
    coords_2d = tsne.fit_transform(tfidf_matrix.toarray())

    # 坐标归一化到 [-80, 80] 区间，保证 D3 画布居中友好
    x_min, x_max = coords_2d[:, 0].min(), coords_2d[:, 0].max()
    y_min, y_max = coords_2d[:, 1].min(), coords_2d[:, 1].max()

    x_norm = ((coords_2d[:, 0] - x_min) / (x_max - x_min) * 160) - 80
    y_norm = ((coords_2d[:, 1] - y_min) / (y_max - y_min) * 160) - 80

    # 分析各聚类簇的代表性词汇 (Centroid Top Words)
    centroids = kmeans.cluster_centers_
    cluster_keywords = {}
    for c_id in range(n_clusters):
        top_indices = centroids[c_id].argsort()[::-1][:8]
        cluster_keywords[c_id] = feature_names[top_indices].tolist()

    # 智能为各簇打上文学流派标签
    cluster_names = {}
    for c_id, kws in cluster_keywords.items():
        kw_str = "".join(kws)
        if any(w in kw_str for w in ["马", "剑", "旗", "胡", "沙", "城", "边", "军", "烽"]):
            cluster_names[c_id] = "边塞关山 / 豪迈壮阔"
        elif any(w in kw_str for w in ["禅", "僧", "松", "泉", "竹", "幽", "白云", "青山"]):
            cluster_names[c_id] = "山水田园 / 禅意幽栖"
        elif any(w in kw_str for w in ["惆怅", "芳草", "落花", "夕阳", "秋风", "回首"]):
            cluster_names[c_id] = "晚唐羁旅 / 叹惋伤感"
        elif any(w in kw_str for w in ["寒", "瘦", "泪", "骨", "孤", "苦", "啼", "凄"]):
            cluster_names[c_id] = "苦吟冷峭 / 凄苦身世"
        else:
            cluster_names[c_id] = "盛唐气象 / 宏大世情"

    # 组装输出数据
    output = {
        "metadata": {
            "total_poets": len(poet_names),
            "n_clusters": n_clusters,
            "method": "t-SNE (群岛化降维)"
        },
        "clusters": [
            {
                "id": c_id,
                "name": cluster_names[c_id],
                "color": CLUSTER_COLORS[c_id % len(CLUSTER_COLORS)],
                "keywords": cluster_keywords[c_id],
                "poet_count": int(np.sum(cluster_labels == c_id))
            }
            for c_id in range(n_clusters)
        ],
        "poets": []
    }

    # 组装诗人数据
    for i, name in enumerate(poet_names):
        c_id = int(cluster_labels[i])
        # 提取该诗人 TF-IDF 最高的 5 个词
        poet_vec = tfidf_matrix[i].toarray()[0]
        top_word_indices = poet_vec.argsort()[::-1][:5]
        top_words = feature_names[top_word_indices].tolist()

        output["poets"].append({
            "name": name,
            "poem_count": poet_counts[i],
            "cluster_id": c_id,
            "cluster_name": cluster_names[c_id],
            "color": CLUSTER_COLORS[c_id % len(CLUSTER_COLORS)],
            "is_master": name in CORE_MASTERS,
            "x": round(float(x_norm[i]), 2),
            "y": round(float(y_norm[i]), 2),
            "top_words": top_words
        })

    return output


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    corpus_path = os.path.join(project_root, "data", "全唐诗.txt")
    output_path = os.path.join(project_root, "web", "data", "poet_clusters.json")

    qualified = parse_corpus(corpus_path, min_poems=200)
    poet_names, poet_counts, corpus_tokenized = tokenize_corpus(qualified)
    cluster_data = perform_clustering_and_pca(poet_names, poet_counts, corpus_tokenized, n_clusters=4)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(cluster_data, f, ensure_ascii=False, indent=2)

    print(f"[✓] 成功生成诗人流派聚类数据契约: {output_path}")
    print("[*] 聚类簇概览:")
    for c in cluster_data["clusters"]:
        print(f"    簇 #{c['id']} [{c['name']}] ({c['poet_count']}位诗人): 核心词 -> {'、'.join(c['keywords'][:5])}")


if __name__ == "__main__":
    main()
