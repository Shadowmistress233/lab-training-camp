/**
 * 全唐诗意象谱系可视化 - D3.js (v5) 交互渲染引擎
 * 
 * 架构设计说明：
 * 1. 状态管理 (State Management): 单一可信源 activeCategoryId，驱动视图响应式更新。
 * 2. D3 经典更新模式 (General Update Pattern): 结合 key 函数精准绑定意象字词，
 *    通过 enter -> merge -> exit 配合 d3.transition 实现流畅的补间动画。
 * 3. 左右视图联动 (Bi-directional Coordination): 左侧卡片激活事件驱动右侧柱状图与轴线重绘。
 */

// 预定义传统中国色彩板（每个意象大类对应专属雅致主色）
const CATEGORY_THEMES = {
  season: { primary: "#c25138", secondary: "#e08a74", name: "朱柿红" },
  flora:  { primary: "#3b7a57", secondary: "#70a686", name: "竹青绿" },
  nature: { primary: "#2c3e50", secondary: "#5d738a", name: "黛墨蓝" },
  color:  { primary: "#c28b38", secondary: "#e6b86a", name: "藤黄色" },
  emotion:{ primary: "#6a4c77", secondary: "#9d7ea9", name: "暮春紫" }
};

document.addEventListener("DOMContentLoaded", () => {
  // 加载数据契约
  d3.json("data/imagery_data.json")
    .then(data => {
      initApp(data);
    })
    .catch(err => {
      console.error("加载意象数据契约失败:", err);
      d3.select("#chart-stage").html(
        `<div style="color: #b23a22; padding: 40px; text-align: center;">
          <h3>⚠️ 数据契约加载失败</h3>
          <p>请确保已先运行 <code>python src/process_poems.py</code> 生成 <code>web/data/imagery_data.json</code>。</p>
        </div>`
      );
    });
});

function initApp(data) {
  const categories = data.categories;
  if (!categories || categories.length === 0) return;

  // 1. 动态生成顶部统计指标（消除硬编码）
  const totalOccurrences = categories.reduce((sum, c) => sum + c.total_count, 0);
  d3.select("#stats-ribbon").html(`
    <div class="stat-pill"><span class="stat-label">分析类目</span><span class="stat-value">${categories.length} 大类</span></div>
    <div class="stat-pill"><span class="stat-label">意象总频次</span><span class="stat-value">${totalOccurrences.toLocaleString()} 次</span></div>
  `);

  // 2. 状态变量
  let activeCategoryId = categories[0].id;

  // 3. 渲染左侧分类卡片与标签云
  renderCategoryCards(categories, activeCategoryId, (newCatId) => {
    activeCategoryId = newCatId;
    updateView(categories, activeCategoryId);
  });

  // 4. 计算全唐诗所有分类中的全局最大值，用于构建统一全局标尺（方案二）
  const globalMax = d3.max(categories, c => d3.max(c.items, d => d.value)) || 20000;

  // 5. 初始化 D3 柱状图画布（传入全局标尺上限）
  const chart = createBarChart("#bar-chart-svg", globalMax);

  // 6. 初始渲染第一组数据
  updateView(categories, activeCategoryId);

  function updateView(categories, catId) {
    const currentCat = categories.find(c => c.id === catId);
    if (!currentCat) return;

    // 更新右侧头部说明与指标
    d3.select("#current-cat-badge").text(currentCat.name);
    d3.select("#current-cat-name").text(currentCat.name);
    d3.select("#current-cat-desc").text(currentCat.description);
    d3.select("#current-cat-total").text(currentCat.total_count.toLocaleString());

    // 切换左侧高亮态
    d3.selectAll(".cat-card").classed("active", d => d.id === catId);

    // 驱动 D3 柱状图平滑更新
    const theme = CATEGORY_THEMES[catId] || CATEGORY_THEMES.season;
    chart.update(currentCat.items, theme);
  }
}

/**
 * 渲染左侧分类卡片与标签云
 */
function renderCategoryCards(categories, activeId, onSelect) {
  const container = d3.select("#category-cards");
  container.html(""); // 清空容器

  const cards = container.selectAll(".cat-card")
    .data(categories)
    .enter()
    .append("div")
    .attr("class", d => `cat-card ${d.id === activeId ? "active" : ""}`)
    .on("click", (d) => onSelect(d.id));

  // 卡片头部
  const header = cards.append("div").attr("class", "cat-card-header");
  header.append("span").attr("class", "cat-card-name").text(d => d.name);
  header.append("span").attr("class", "cat-card-count").text(d => `${d.total_count.toLocaleString()} 次`);

  // 卡片描述
  cards.append("div").attr("class", "cat-card-desc").text(d => d.description);

  // 意象字词标签云 (Tag Cloud)
  const tagClouds = cards.append("div").attr("class", "cat-tag-cloud");
  tagClouds.selectAll(".word-tag")
    .data(d => d.items.slice(0, 7))
    .enter()
    .append("span")
    .attr("class", "word-tag")
    .text(d => d.name);
}

/**
 * 创建 D3 柱状图实例并返回 update 方法
 */
function createBarChart(svgSelector, globalMax) {
  const svg = d3.select(svgSelector);
  const stage = document.getElementById("chart-stage");

  // 尺寸与边距规范
  const margin = { top: 35, right: 30, bottom: 45, left: 65 };
  let width = stage.clientWidth - margin.left - margin.right;
  let height = stage.clientHeight - margin.top - margin.bottom;

  // 主绘图分组
  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // =========================================================================
  // 方案二核心：基于全局最大值构建统一固定的 Y 比例尺（全唐诗最高词频为“山” 19,525）
  // =========================================================================
  const yScale = d3.scaleLinear()
    .domain([0, (globalMax || 20000) * 1.1])
    .range([height, 0])
    .nice();

  // 1. 静态网格线（一次性绘制，全局固定，永远不移动、不跳变）
  const gridGroup = g.append("g")
    .attr("class", "grid-line")
    .call(
      d3.axisLeft(yScale)
        .ticks(5)
        .tickSize(-width)
        .tickFormat("")
    );

  // 2. 静态 Y 轴（一次性绘制，刻度数字永远固定不动，彻底杜绝闪烁和飞入）
  const yAxisGroup = g.append("g")
    .attr("class", "y-axis")
    .call(
      d3.axisLeft(yScale)
        .ticks(5)
        .tickFormat(d3.format(","))
    );

  yAxisGroup.selectAll(".tick text")
    .attr("class", "axis-text")
    .style("font-size", "0.85rem");

  // 3. X 坐标轴分组
  const xAxisGroup = g.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height})`);

  // Y 轴标题（独立分组）
  g.append("text")
    .attr("class", "axis-label")
    .attr("x", -10)
    .attr("y", -14)
    .attr("text-anchor", "start")
    .text("出 现 频 次 ( 次 )");

  // 柱体与标签主分组
  const barsGroup = g.append("g").attr("class", "bars-layer");
  const labelsGroup = g.append("g").attr("class", "labels-layer");

  // Tooltip DOM
  const tooltip = d3.select("#tooltip");

  // 渐变色定义
  const defs = svg.append("defs");

  function update(data, theme) {
    // 动态重算容器宽高
    width = stage.clientWidth - margin.left - margin.right;
    height = stage.clientHeight - margin.top - margin.bottom;

    svg.attr("viewBox", `0 0 ${stage.clientWidth} ${stage.clientHeight}`);
    xAxisGroup.attr("transform", `translate(0,${height})`);

    // 1. 创建该分类下的线性渐变
    const gradientId = `bar-gradient-${theme.primary.replace('#', '')}`;
    defs.selectAll(`#${gradientId}`).remove();

    const linearGradient = defs.append("linearGradient")
      .attr("id", gradientId)
      .attr("x1", "0%").attr("y1", "0%")
      .attr("x2", "0%").attr("y2", "100%");

    linearGradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", theme.primary);

    linearGradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", theme.secondary);

    // 2. X 比例尺构建（仅 X 轴随当前分类词列表动态变化）
    const xScale = d3.scaleBand()
      .domain(data.map(d => d.name))
      .range([0, width])
      .padding(0.36);

    // 3. 补间过渡动画定义（时长 450ms，仅作用于柱体和 X 轴字词）
    const t = d3.transition()
      .duration(450)
      .ease(d3.easeCubicInOut);

    // 4. X 轴：参考《纽约时报》的纯净溶解（In-place Dissolve）
    // 立即定点设置 X 轴刻度几何坐标（彻底消除横向位移与飞入），仅让文字做平滑的原地淡入
    xAxisGroup.call(d3.axisBottom(xScale));
    xAxisGroup.selectAll(".tick text")
      .attr("class", "axis-text")
      .style("font-size", "1.05rem")
      .style("font-weight", "600")
      .style("opacity", 0)
      .transition()
      .duration(280)
      .style("opacity", 1);

    // =========================================================================
    // 6. D3 核心更新模式: 柱体 (Bars) - 唯一保留平滑高度过渡的视觉主体
    // =========================================================================
    const bars = barsGroup.selectAll(".bar")
      .data(data, d => d.name);

    // EXIT: 旧柱体原位淡出
    bars.exit()
      .transition(t)
      .attr("height", 0)
      .attr("y", height)
      .style("opacity", 0)
      .remove();

    // ENTER: 新柱体从底部原位升起
    const enterBars = bars.enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", d => xScale(d.name))
      .attr("y", height)
      .attr("width", xScale.bandwidth())
      .attr("height", 0)
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", `url(#${gradientId})`)
      .style("opacity", 0);

    // MERGE: 统一调整高度与位置
    enterBars.merge(bars)
      .on("mouseover", function(d) {
        showTooltip(d, theme);
      })
      .on("mousemove", function() {
        moveTooltip();
      })
      .on("mouseout", function() {
        hideTooltip();
      })
      .transition(t)
      .attr("x", d => xScale(d.name))
      .attr("width", xScale.bandwidth())
      .attr("y", d => yScale(d.value))
      .attr("height", d => height - yScale(d.value))
      .attr("fill", `url(#${gradientId})`)
      .style("opacity", 1);

    // =========================================================================
    // 7. D3 核心更新模式: 柱顶数值标注 (原地淡入淡出，绝不在屏幕上飞行)
    // =========================================================================
    const labels = labelsGroup.selectAll(".bar-label")
      .data(data, d => d.name);

    labels.exit()
      .transition()
      .duration(150)
      .style("opacity", 0)
      .remove();

    const enterLabels = labels.enter()
      .append("text")
      .attr("class", "bar-label")
      .attr("x", d => xScale(d.name) + xScale.bandwidth() / 2)
      .attr("y", d => yScale(d.value) - 8)
      .text(d => d.value.toLocaleString())
      .style("opacity", 0);

    enterLabels.merge(labels)
      .transition()
      .duration(250)
      .attr("x", d => xScale(d.name) + xScale.bandwidth() / 2)
      .attr("y", d => yScale(d.value) - 8)
      .text(d => d.value.toLocaleString())
      .style("opacity", 1);
  }

  // Tooltip 交互方法
  function showTooltip(d, theme) {
    let extraHtml = "";
    if (d.top_poets && d.top_poets.length > 0) {
      const topPoetsHtml = d.top_poets
        .map(p => `<span class="poet-badge">${p.poet} <strong>${p.count}</strong></span>`)
        .join("");
      extraHtml += `
        <div class="tt-section-title">高频偏好诗人</div>
        <div class="tt-poets">${topPoetsHtml}</div>
      `;
    }
    if (d.samples && d.samples.length > 0) {
      const sample = d.samples[0];
      extraHtml += `
        <div class="tt-section-title">经典名句</div>
        <div class="tt-quote">
          “${sample.verse}”
          <div class="tt-quote-author">—— [唐] ${sample.author}《${sample.title}》</div>
        </div>
      `;
    }

    tooltip.html(`
      <div class="tt-header">
        <span class="tt-word">${d.name}</span>
        <span class="tt-count">全唐诗出现 <strong>${d.value.toLocaleString()}</strong> 次</span>
      </div>
      ${extraHtml}
    `);

    tooltip.style("opacity", 1);
  }

  function moveTooltip() {
    const e = d3.event;
    if (!e) return;
    tooltip
      .style("left", (e.pageX + 16) + "px")
      .style("top", (e.pageY - 28) + "px");
  }

  function hideTooltip() {
    tooltip.style("opacity", 0);
  }

  return { update };
}
