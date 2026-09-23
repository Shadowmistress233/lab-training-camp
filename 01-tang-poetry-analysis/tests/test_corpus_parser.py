#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
单元测试：全唐诗语料解析与分卷边界保护
Unit test: Corpus Parser & Boundary Protection
"""

import io
import re
import unittest
from collections import defaultdict


class TestCorpusParser(unittest.TestCase):
    """测试语料解析逻辑与分卷状态机重置"""

    def setUp(self):
        # 模拟包含分卷标记、制作人署名、分隔线及多位诗人的语料文本
        self.sample_corpus = """
卷1_1 【帝京篇十首】李世民
秦川雄帝宅，函谷壮皇居。
绮殿千寻起，离宫百雉馀。

近日毛虽暖，闻弦心已惊。
 钱建文制作 
 
　 
 卷二 
 
--------------------------------------------------------------------------------
 
　 
    卷2_1 【太子纳妃太平公主出降】李治 
龙楼光曙景，鲁馆启朝扉。
方期六合泰，共赏万年春。
"""
        self.volume_divider_pattern = re.compile(
            r'^(?:钱建文制作|全唐诗|卷[一二三四五六七八九十百千万\d]+|[-=_\s]{4,})$'
        )

    def test_divider_pattern_matching(self):
        """测试分卷分隔符及元数据正则匹配"""
        dividers = [
            "钱建文制作",
            " 钱建文制作 ",
            "卷二",
            " 卷二 ",
            "卷九百",
            "--------------------------------------------------------------------------------",
            "====================",
            "全唐诗"
        ]
        for div in dividers:
            with self.subTest(divider=div):
                self.assertTrue(
                    bool(self.volume_divider_pattern.match(div.strip())),
                    f"分卷标记未被正确匹配: {div}"
                )

    def test_sample_corpus_no_metadata_leakage(self):
        """测试在分卷与制作者标记出现时，上一位诗人不被污染"""
        poet_data = defaultdict(list)
        current_poet = None

        for line in self.sample_corpus.splitlines():
            line_s = line.strip()
            if not line_s:
                continue

            # 1. 遇到分卷标记，清空当前诗人状态
            if self.volume_divider_pattern.match(line_s):
                current_poet = None
                continue

            # 2. 匹配诗题与诗人
            m = re.match(r'^卷\d+_\d+\s+【(.*?)】(.*)$', line_s)
            if m:
                poet = m.group(2).strip()
                poet = re.sub(r'[\s（\(].*$', '', poet)
                current_poet = poet if poet else None
            elif current_poet:
                if not self.volume_divider_pattern.match(line_s):
                    poet_data[current_poet].append(line_s)

        # 断言提取出的诗人
        self.assertIn("李世民", poet_data)
        self.assertIn("李治", poet_data)

        # 断言李世民的诗句中绝不包含制作人署名、分卷名或分割线
        for line in poet_data["李世民"]:
            self.assertNotIn("钱建文制作", line)
            self.assertNotIn("卷二", line)
            self.assertFalse(line.startswith("---"))

        self.assertEqual(len(poet_data["李世民"]), 3)
        self.assertEqual(len(poet_data["李治"]), 2)


if __name__ == "__main__":
    unittest.main()
