#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
单元测试：诗人聚类质量与文学流派判别合理性
Unit test: Poet Clustering Quality & Literary School Sanity
"""

import json
import os
import unittest


class TestClusteringQuality(unittest.TestCase):
    """测试聚类算法指标与文学流派分类常识"""

    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        cls.cluster_json_path = os.path.join(base_dir, "web", "data", "poet_clusters.json")

    def test_cluster_json_exists_and_valid(self):
        """测试聚类 JSON 存在且符合格式"""
        self.assertTrue(
            os.path.exists(self.cluster_json_path),
            f"缺少聚类数据文件: {self.cluster_json_path}"
        )
        with open(self.cluster_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIn("metadata", data)
        self.assertIn("clusters", data)
        self.assertIn("poets", data)
        self.assertGreaterEqual(len(data["poets"]), 50)
        self.assertEqual(len(data["clusters"]), 4)

    def test_distinct_cluster_names(self):
        """测试 4 大流派标签无重复命名"""
        with open(self.cluster_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        cluster_names = [c["name"] for c in data["clusters"]]
        self.assertEqual(
            len(cluster_names),
            len(set(cluster_names)),
            f"流派标签存在重复命名: {cluster_names}"
        )

    def test_literary_common_sense_classification(self):
        """测试文学常识：杜甫、白居易绝不应被划入边塞关山流派"""
        with open(self.cluster_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        poet_map = {p["name"]: p for p in data["poets"]}

        # 杜甫、白居易属于现实关怀/新乐府，不应归为边塞
        for poet in ["杜甫", "白居易", "元稹"]:
            if poet in poet_map:
                school = poet_map[poet]["cluster_name"]
                self.assertNotIn(
                    "边塞",
                    school,
                    f"文学常识违和：现实主义名家 {poet} 被错误划入【{school}】"
                )

    def test_silhouette_score_threshold(self):
        """测试聚类轮廓系数质量阈值 (>= 0.10)"""
        with open(self.cluster_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        score = data["metadata"].get("silhouette_score", 0)
        self.assertGreaterEqual(
            score,
            0.10,
            f"聚类轮廓系数过低 ({score:.4f} < 0.10)，表明聚类结构不稳定且重叠"
        )


if __name__ == "__main__":
    unittest.main()
