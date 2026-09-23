/**
 * 全唐诗大唐诗人多维情感画像 - D3.js v5 极坐标罗盘渲染引擎
 * Tang Poets Multidimensional Sentiment Profile - D3.js Polar Chart
 */

(function () {
  'use strict';

  // 模块全局状态
  let dataset = null;
  let currentPoet = null;
  let svg = null;
  let chartG = null;
  let rScale = null;
  let arcGenerator = null;

  // 极坐标几何参数
  const WIDTH = 620;
  const HEIGHT = 480;
  const CX = WIDTH / 2;
  const CY = HEIGHT / 2;
  const INNER_RADIUS = 35;
  const OUTER_RADIUS = 180;
  const NUM_DIMENSIONS = 6;
  const ANGLE_STEP = (2 * Math.PI) / NUM_DIMENSIONS;
  const BAR_WIDTH_RAD = ANGLE_STEP * 0.52; // 扇条角宽度（保留间隙美感）

  // DOM 缓存
  const poetRankListEl = document.getElementById('poet-rank-list');
  const currentPoetRankEl = document.getElementById('current-poet-rank');
  const currentPoetNameEl = document.getElementById('current-poet-name');
  const currentPoetPoemsEl = document.getElementById('current-poet-poems');
  const currentPoetDominantEl = document.getElementById('current-poet-dominant');
  const verseContentEl = document.getElementById('verse-content');
  const tooltipEl = document.getElementById('tooltip');
  const statsRibbonEl = document.getElementById('poet-stats-ribbon');

  /**
   * 初始化入口
   */
  async function init() {
    try {
      // 动态时间戳破坏缓存
      const dataUrl = `data/poet_sentiment.json?t=${Date.now()}`;
      dataset = await d3.json(dataUrl);

      if (!dataset || !dataset.poets || dataset.poets.length === 0) {
        throw new Error('诗人情感数据集格式异常');
      }

      // 初始化统计徽章
      renderTopRibbon();

      // 初始化第一个诗人为当前选中项（白居易）
      currentPoet = dataset.poets[0];

      // 渲染左侧诗人榜单
      renderPoetList();

      // 构建 D3 极坐标主图
      setupPolarChart();

      // 首次渲染右侧图表与诗句
      updateView(currentPoet);

    } catch (err) {
      console.error('[!] 加载诗人数据失败:', err);
      if (currentPoetNameEl) {
        currentPoetNameEl.textContent = '数据加载失败，请检查网络或后端脚本';
      }
    }
  }

  /**
   * 顶部数据指标徽章
   */
  function renderTopRibbon() {
    if (!statsRibbonEl) return;
    const totalPoets = dataset.poets.length;
    const totalPoems = d3.sum(dataset.poets, d => d.poem_count);

    statsRibbonEl.innerHTML = `
      <div class="stat-pill">
        <span class="stat-label">入选诗人</span>
        <span class="stat-val">${totalPoets} <small>位</small></span>
      </div>
      <div class="stat-pill">
        <span class="stat-label">覆盖诗作</span>
        <span class="stat-val">${totalPoems.toLocaleString()} <small>首</small></span>
      </div>
      <div class="stat-pill">
        <span class="stat-label">情感维度</span>
        <span class="stat-val">6 <small>维</small></span>
      </div>
    `;
  }

  /**
   * 渲染左侧诗人排行榜列表
   */
  function renderPoetList() {
    poetRankListEl.innerHTML = '';

    dataset.poets.forEach((poet) => {
      const item = document.createElement('div');
      item.className = `poet-item ${poet.rank === currentPoet.rank ? 'active' : ''}`;
      item.dataset.rank = poet.rank;

      item.innerHTML = `
        <div class="poet-item-left">
          <span class="poet-rank-badge">${poet.rank}</span>
          <span class="poet-name">${poet.name}</span>
        </div>
        <div class="poet-item-right">
          <span class="poet-count-tag">${poet.poem_count} 首</span>
          <span class="poet-dominant-badge">${poet.dominant_emotion}</span>
        </div>
      `;

      item.addEventListener('click', () => {
        if (currentPoet.rank === poet.rank) return;
        currentPoet = poet;

        // 更新选中状态高亮
        document.querySelectorAll('.poet-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');

        // 更新视图与动画
        updateView(currentPoet);
      });

      poetRankListEl.appendChild(item);
    });
  }

  /**
   * 初始化极坐标罗盘静态网格、坐标轴与标签
   */
  function setupPolarChart() {
    svg = d3.select('#polar-chart-svg')
      .attr('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    svg.selectAll('*').remove();

    chartG = svg.append('g')
      .attr('transform', `translate(${CX}, ${CY})`);

    // 半径比例尺：0 ~ 100 分 -> INNER_RADIUS ~ OUTER_RADIUS
    rScale = d3.scaleLinear()
      .domain([0, 100])
      .range([INNER_RADIUS, OUTER_RADIUS]);

    // 1. 同心圆刻度网格 (20, 40, 60, 80, 100)
    const gridTicks = [20, 40, 60, 80, 100];
    const gridG = chartG.append('g').attr('class', 'polar-grid-group');

    gridTicks.forEach(tick => {
      const r = rScale(tick);
      gridG.append('circle')
        .attr('class', 'polar-grid-circle')
        .attr('r', r);

      // 刻度数值标签（置于正上方轴线右侧）
      gridG.append('text')
        .attr('class', 'polar-grid-label')
        .attr('x', 6)
        .attr('y', -r + 3)
        .text(tick);
    });

    // 2. 放射轴线与维度文本标签
    const axisG = chartG.append('g').attr('class', 'polar-axis-group');

    dataset.dimensions.forEach((dim, i) => {
      // 0 度从 12 点钟方向开始，顺时针旋转
      const angle = i * ANGLE_STEP - Math.PI / 2;
      const xOuter = Math.cos(angle) * OUTER_RADIUS;
      const yOuter = Math.sin(angle) * OUTER_RADIUS;
      const xLabel = Math.cos(angle) * (OUTER_RADIUS + 28);
      const yLabel = Math.sin(angle) * (OUTER_RADIUS + 28);

      // 轴线
      axisG.append('line')
        .attr('class', 'polar-axis-line')
        .attr('x1', Math.cos(angle) * INNER_RADIUS)
        .attr('y1', Math.sin(angle) * INNER_RADIUS)
        .attr('x2', xOuter)
        .attr('y2', yOuter);

      // 文本对齐依据角度调整
      let textAnchor = 'middle';
      if (Math.cos(angle) > 0.3) textAnchor = 'start';
      else if (Math.cos(angle) < -0.3) textAnchor = 'end';

      axisG.append('text')
        .attr('class', 'polar-axis-label')
        .attr('x', xLabel)
        .attr('y', yLabel + 5)
        .attr('text-anchor', textAnchor)
        .text(dim.name);
    });

    // 3. 中心圆装饰（国风印章底纹感）
    chartG.append('circle')
      .attr('class', 'polar-center-core')
      .attr('r', INNER_RADIUS - 2)
      .attr('fill', '#f4ede1')
      .attr('stroke', '#d4cbb8')
      .attr('stroke-width', 1.5);

    chartG.append('text')
      .attr('class', 'polar-center-text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '12px')
      .attr('fill', '#9c8c78')
      .attr('letter-spacing', '2px')
      .text('六維');

    // 4. 扇形柱条容器
    chartG.append('g').attr('class', 'polar-bars-group');

    // 5. 扇形数值标签容器（置于柱条上层）
    chartG.append('g').attr('class', 'polar-labels-group');

    // 弧度生成器
    arcGenerator = d3.arc()
      .innerRadius(INNER_RADIUS)
      .startAngle(d => d.startAngle)
      .endAngle(d => d.endAngle)
      .cornerRadius(3);
  }

  /**
   * 视图更新调度（更新头部信息、极坐标柱条与代表名句）
   */
  function updateView(poet) {
    // 1. 更新头部信息
    currentPoetRankEl.textContent = `#${poet.rank}`;
    currentPoetNameEl.textContent = poet.name;
    currentPoetPoemsEl.textContent = poet.poem_count.toLocaleString();
    currentPoetDominantEl.textContent = `主导情绪：${poet.dominant_emotion}`;

    // 2. 准备 D3 数据
    const barData = poet.profile.map((item, i) => {
      const angle = i * ANGLE_STEP - Math.PI / 2;
      // D3.arc 的 0 度是 12 点钟方向顺时针，与数学极坐标相差 + PI/2
      const d3Angle = i * ANGLE_STEP;
      const dimInfo = dataset.dimensions.find(d => d.id === item.id) || {};

      return {
        ...item,
        color: dimInfo.color || '#b23a22',
        description: dimInfo.description || '',
        d3Angle: d3Angle,
        startAngle: d3Angle - BAR_WIDTH_RAD / 2,
        endAngle: d3Angle + BAR_WIDTH_RAD / 2,
        targetOuterRadius: rScale(item.score)
      };
    });

    // 3. 更新极坐标扇条 (Data Join)
    const barsGroup = chartG.select('.polar-bars-group');
    const bars = barsGroup.selectAll('.polar-bar-arc')
      .data(barData, d => d.id);

    // Enter + Update
    const barsEnter = bars.enter()
      .append('path')
      .attr('class', 'polar-bar-arc')
      .attr('fill', d => d.color)
      .attr('opacity', 0.85)
      .each(function (d) {
        this._current = {
          startAngle: d.startAngle,
          endAngle: d.endAngle,
          innerRadius: INNER_RADIUS,
          outerRadius: INNER_RADIUS
        };
      });

    // 合并并执行平滑补间动画
    barsEnter.merge(bars)
      .on('mouseenter', showTooltip)
      .on('mousemove', moveTooltip)
      .on('mouseleave', hideTooltip)
      .transition()
      .duration(550)
      .ease(d3.easeCubicInOut)
      .attrTween('d', function (d) {
        const interpolate = d3.interpolate(this._current.outerRadius, d.targetOuterRadius);
        return function (t) {
          const currentOuter = interpolate(t);
          this._current.outerRadius = currentOuter;
          return arcGenerator({
            startAngle: d.startAngle,
            endAngle: d.endAngle,
            innerRadius: INNER_RADIUS,
            outerRadius: currentOuter
          });
        };
      });

    bars.exit().remove();

    // 4. 更新扇形花瓣上的量化分值数字 (Data Join & Transition)
    const labelsGroup = chartG.select('.polar-labels-group');
    const labels = labelsGroup.selectAll('.polar-bar-label')
      .data(barData, d => d.id);

    const labelsEnter = labels.enter()
      .append('text')
      .attr('class', 'polar-bar-label')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .style('pointer-events', 'none')
      .style('user-select', 'none')
      .style('font-family', 'var(--font-sans)')
      .style('font-size', '11.5px')
      .style('font-weight', '700');

    labelsEnter.merge(labels)
      .transition()
      .duration(550)
      .ease(d3.easeCubicInOut)
      .attr('x', d => {
        const isShort = (d.targetOuterRadius - INNER_RADIUS) < 24;
        const rPos = isShort ? d.targetOuterRadius + 11 : (INNER_RADIUS + d.targetOuterRadius) / 2;
        return Math.sin(d.d3Angle) * rPos;
      })
      .attr('y', d => {
        const isShort = (d.targetOuterRadius - INNER_RADIUS) < 24;
        const rPos = isShort ? d.targetOuterRadius + 11 : (INNER_RADIUS + d.targetOuterRadius) / 2;
        return -Math.cos(d.d3Angle) * rPos;
      })
      .attr('fill', d => {
        const isShort = (d.targetOuterRadius - INNER_RADIUS) < 24;
        return isShort ? d.color : '#ffffff';
      })
      .style('text-shadow', d => {
        const isShort = (d.targetOuterRadius - INNER_RADIUS) < 24;
        return isShort ? '0 1px 3px rgba(255, 255, 255, 0.95)' : '0 1px 3px rgba(0, 0, 0, 0.55)';
      })
      .text(d => Math.round(d.score));

    labels.exit().remove();

    // 4. 更新底部代表名句卡片
    updateVerseCard(poet);
  }

  /**
   * 更新代表名句卡片
   */
  function updateVerseCard(poet) {
    verseContentEl.innerHTML = '';

    // 筛选有代表诗句的维度（最多展示 3 个维度的名句）
    const itemsWithVerses = poet.profile.filter(p => p.samples && p.samples.length > 0);
    const displayItems = itemsWithVerses.slice(0, 3);

    if (displayItems.length === 0) {
      verseContentEl.innerHTML = '<div class="verse-item"><p class="verse-item-text">暂无代表名句记录</p></div>';
      return;
    }

    displayItems.forEach(item => {
      const sample = item.samples[0];
      const card = document.createElement('div');
      card.className = 'verse-item';
      card.style.borderLeftColor = dataset.dimensions.find(d => d.id === item.id)?.color || '#b23a22';

      // 高亮触发词
      let highlightedVerse = sample.verse;
      if (sample.trigger_word) {
        highlightedVerse = highlightedVerse.replaceAll(
          sample.trigger_word,
          `<span class="trigger-highlight">${sample.trigger_word}</span>`
        );
      }

      card.innerHTML = `
        <div class="verse-item-emo" style="color:${card.style.borderLeftColor}">
          【${item.name}】偏好指数 ${item.score} · 常用词：${item.top_words.join('、')}
        </div>
        <p class="verse-item-text">“${highlightedVerse}”</p>
        <p class="verse-item-title">——《${sample.title}》</p>
      `;

      verseContentEl.appendChild(card);
    });
  }

  /**
   * Tooltip 浮动交互
   */
  function showTooltip(d) {
    tooltipEl.style.opacity = '1';
    tooltipEl.innerHTML = `
      <div class="tt-header">
        <span class="tt-word" style="color: ${d.color}">${d.name}</span>
        <span class="tt-count">指数: <strong>${d.score}</strong> / 100</span>
      </div>
      <p style="font-size: 0.8rem; color: #7f8c8d; margin-bottom: 8px;">${d.description}</p>
      <div class="tt-section-title">高频情感用词</div>
      <div class="tt-poets">
        ${d.top_words.map(w => `<span class="poet-badge">${w}</span>`).join('')}
      </div>
      <div style="font-size: 0.75rem; color: #95a5a6; margin-top: 4px;">
        [提示] 指数基于该诗人在该维度下的千行词频密度归一化计算。
      </div>
    `;
  }

  function moveTooltip() {
    tooltipEl.style.left = (d3.event.pageX + 16) + 'px';
    tooltipEl.style.top = (d3.event.pageY - 28) + 'px';
  }

  function hideTooltip() {
    tooltipEl.style.opacity = '0';
  }

  // 页面加载完成后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
