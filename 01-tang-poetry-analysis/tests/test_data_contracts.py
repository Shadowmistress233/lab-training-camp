#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
单元测试：前后端数据契约与关键指标对齐
Unit test: Data Contracts & Baseline Alignment
"""

import json
import os
import unittest


class TestDataContracts(unittest.TestCase):
    """测试三份 JSON 数据契约的格式完整度与数值准确性"""

    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        cls.imagery_json_path = os.path.join(base_dir, "web", "data", "imagery_data.json")
        cls.sentiment_json_path = os.path.join(base_dir, "web", "data", "poet_sentiment.json")
        cls.clusters_json_path = os.path.join(base_dir, "web", "data", "poet_clusters.json")

    def test_imagery_data_contract_and_benchmark(self):
        """测试 Tab 1 意象数据契约：不仅校验基准词频，且必须包含 top_poets 与 samples 字段"""
        self.assertTrue(os.path.exists(self.imagery_json_path))
        with open(self.imagery_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIn("categories", data)
        self.assertEqual(len(data["categories"]), 5)

        # 校验官方基准核心词频
        all_items = {
            item["name"]: item
            for cat in data["categories"]
            for item in cat["items"]
        }

        self.assertIn("春", all_items)
        self.assertEqual(all_items["春"]["value"], 6832, "基准对齐失败：'春' 频次应为 6832")
        self.assertEqual(all_items["花"]["value"], 5521, "基准对齐失败：'花' 频次应为 5521")
        self.assertEqual(all_items["云"]["value"], 7661, "基准对齐失败：'云' 频次应为 7661")

        # 校验前端 Tooltip 消费所需的 top_poets 与 samples 字段
        for name, item in all_items.items():
            self.assertIn(
                "top_poets", item,
                f"契约缺失：意象 '{name}' 缺少 top_poets 字段"
            )
            self.assertGreater(
                len(item["top_poets"]), 0,
                f"契约空值：意象 '{name}' 的 top_poets 不能为空"
            )
            top_p = item["top_poets"][0]
            self.assertIn("poet", top_p)
            self.assertIn("count", top_p)

            self.assertIn(
                "samples", item,
                f"契约缺失：意象 '{name}' 缺少 samples 字段"
            )
            self.assertGreater(
                len(item["samples"]), 0,
                f"契约空值：意象 '{name}' 的 samples 不能为空"
            )
            samp = item["samples"][0]
            self.assertIn("verse", samp)
            self.assertIn("author", samp)
            self.assertIn("title", samp)

    def test_sentiment_data_contract(self):
        """测试 Tab 2 诗人六维画像契约完整性"""
        self.assertTrue(os.path.exists(self.sentiment_json_path))
        with open(self.sentiment_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIn("dimensions", data)
        self.assertEqual(len(data["dimensions"]), 6)
        self.assertIn("poets", data)
        self.assertGreaterEqual(len(data["poets"]), 50)

        for poet in data["poets"]:
            self.assertIn("name", poet)
            self.assertIn("poem_count", poet)
            self.assertIn("profile", poet)
            self.assertEqual(len(poet["profile"]), 6)
            for dim in poet["profile"]:
                score = dim["score"]
                self.assertTrue(
                    15 <= score <= 100,
                    f"诗人 {poet['name']} 维度 {dim['name']} 得分 {score} 超出 [15, 100] 规范区间"
                )

    def test_clusters_data_contract(self):
        """测试 Tab 3 风格聚类流形契约完整性"""
        self.assertTrue(os.path.exists(self.clusters_json_path))
        with open(self.clusters_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIn("metadata", data)
        self.assertIn("t-SNE", data["metadata"]["method"])
        self.assertIn("clusters", data)
        self.assertIn("poets", data)

        for poet in data["poets"]:
            self.assertTrue(-85 <= poet["x"] <= 85)
            self.assertTrue(-85 <= poet["y"] <= 85)
            self.assertIn("cluster_id", poet)
            self.assertIn("cluster_name", poet)


if __name__ == "__main__":
    unittest.main()
