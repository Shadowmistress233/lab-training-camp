/**
 * 全唐诗大唐诗人流派聚类星空图 - 工业级流派群岛与分级标注引擎
 * Tang Poets Clustering & Scatter Islands - D3.js v5 with Territory Hulls & Hierarchical Labels
 */

(function () {
  'use strict';

  // 全局数据与交互状态
  let dataset = null;
  let activeClusterId = null; // null: 展示全部流派
  let selectedPoet = null;
  let currentZoomK = 1.0;

  // D3 元素句柄
  let svg = null;
  let zoomG = null;
  let zoomBehavior = null;
  let xScale = null;
  let yScale = null;
  let hullGroup = null;
  let dotsGroup = null;

  // 画布几何配置
  const WIDTH = 860;
  const HEIGHT = 540;
  const MARGIN = { top: 40, right: 60, bottom: 40, left: 60 };

  // DOM 元素缓存
  const clusterLegendListEl = document.getElementById('cluster-legend-list');
  const selPoetNameEl = document.getElementById('sel-poet-name');
  const selPoetBodyEl = document.getElementById('sel-poet-body');
  const currentClusterFilterEl = document.getElementById('current-cluster-filter');
  const statsRibbonEl = document.getElementById('clusters-stats-ribbon');
  const tooltipEl = document.getElementById('tooltip');

  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomOutBtn = document.getElementById('zoom-out-btn');
  const zoomResetBtn = document.getElementById('zoom-reset-btn');

  /**
   * 初始化入口
   */
  async function init() {
    try {
      const dataUrl = `data/poet_clusters.json?t=${Date.now()}`;
      dataset = await d3.json(dataUrl);

      if (!dataset || !dataset.poets || dataset.poets.length === 0) {
        throw new Error('聚类数据集异常');
      }

      // 1. 渲染顶部统计
      renderTopRibbon();

      // 2. 渲染左侧图例
      renderClusterLegend();

      // 3. 构建核心流派群岛散点图
      setupScatterPlot();

      // 4. 配置缩放按钮
      setupZoomControls();

    } catch (err) {
      console.error('[!] 加载聚类数据失败:', err);
      if (selPoetNameEl) {
        selPoetNameEl.textContent = '数据加载失败，请检查网络或后端脚本';
      }
    }
  }

  /**
   * 顶部数据指标
   */
  function renderTopRibbon() {
    if (!statsRibbonEl) return;
    const totalPoets = dataset.metadata.total_poets;
    const nClusters = dataset.metadata.n_clusters;
    const masterCount = dataset.poets.filter(p => p.is_master).length;
    statsRibbonEl.innerHTML = `
      <div class="stat-pill">
        <span class="stat-label">聚类诗人</span>
        <span class="stat-val">${totalPoets} <small>位</small></span>
      </div>
      <div class="stat-pill">
        <span class="stat-label">常驻名家</span>
        <span class="stat-val">${masterCount} <small>位</small></span>
      </div>
      <div class="stat-pill">
        <span class="stat-label">流派群岛</span>
        <span class="stat-val">${nClusters} <small>大阵营</small></span>
      </div>
      <div class="stat-pill">
        <span class="stat-label">降维流形</span>
        <span class="stat-val">t-SNE</span>
      </div>
    `;
  }

  /**
   * 切换/过滤特定流派
   */
  function toggleCluster(clusterId) {
    if (activeClusterId === clusterId) {
      activeClusterId = null;
      currentClusterFilterEl.textContent = '全部流派';
      currentClusterFilterEl.style.backgroundColor = 'rgba(178, 58, 34, 0.08)';
      currentClusterFilterEl.style.color = '#b23a22';
      document.querySelectorAll('.cluster-legend-card').forEach(c => c.classList.remove('active'));
    } else {
      activeClusterId = clusterId;
      const cluster = dataset.clusters.find(c => c.id === clusterId);
      currentClusterFilterEl.textContent = `筛选: ${cluster.name}`;
      currentClusterFilterEl.style.backgroundColor = cluster.color;
      currentClusterFilterEl.style.color = '#ffffff';
      document.querySelectorAll('.cluster-legend-card').forEach(c => c.classList.remove('active'));
      const activeCard = document.querySelector(`.cluster-legend-card[data-id="${clusterId}"]`);
      if (activeCard) activeCard.classList.add('active');
    }

    updateScatterDisplay();
  }

  /**
   * 渲染左侧流派图例
   */
  function renderClusterLegend() {
    clusterLegendListEl.innerHTML = '';

    dataset.clusters.forEach(cluster => {
      const card = document.createElement('div');
      card.className = `cluster-legend-card ${activeClusterId === cluster.id ? 'active' : ''}`;
      card.dataset.id = cluster.id;

      card.innerHTML = `
        <div class="cluster-card-top">
          <div class="cluster-badge-group">
            <span class="cluster-color-dot" style="background-color: ${cluster.color}"></span>
            <span class="cluster-title">${cluster.name}</span>
          </div>
          <span class="cluster-count">${cluster.poet_count} 位</span>
        </div>
        <div class="cluster-keywords">
          ${cluster.keywords.slice(0, 5).map(kw => `<span class="cluster-kw-tag">${kw}</span>`).join('')}
        </div>
      `;

      card.addEventListener('click', () => {
        toggleCluster(cluster.id);
      });

      clusterLegendListEl.appendChild(card);
    });
  }

  /**
   * 构建 D3 散点图与流派群岛
   */
  function setupScatterPlot() {
    svg = d3.select('#scatter-plot-svg')
      .attr('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    svg.selectAll('*').remove();

    // 坐标比例尺（留出安全边界）
    xScale = d3.scaleLinear()
      .domain([-95, 95])
      .range([MARGIN.left, WIDTH - MARGIN.right]);

    yScale = d3.scaleLinear()
      .domain([-95, 95])
      .range([HEIGHT - MARGIN.bottom, MARGIN.top]);

    // 可缩放/平移容器
    zoomG = svg.append('g').attr('class', 'zoom-g');

    // 1. 柔和古风同心刻度背景
    drawBackgroundGrid(zoomG);

    // 2. 流派势力气泡/平滑凸包层 (Territory Hulls)
    hullGroup = zoomG.append('g').attr('class', 'territory-hulls-group');
    drawClusterHulls();

    // 3. 诗人散点与姓名层 (Dots & Labels)
    dotsGroup = zoomG.append('g').attr('class', 'scatter-dots-group');
    drawPoetNodes();

    // 4. 配置 D3 缩放与平移
    zoomBehavior = d3.zoom()
      .scaleExtent([0.8, 4.5])
      .on('zoom', () => {
        const transform = d3.event.transform;
        currentZoomK = transform.k;
        zoomG.attr('transform', transform);

        // 缩放级别较高时（k >= 1.6），平滑显现全部诗人姓名
        dotsGroup.selectAll('.poet-dot-label:not(.master)')
          .style('opacity', currentZoomK >= 1.6 ? 0.85 : 0);
      });

    svg.call(zoomBehavior);
  }

  /**
   * 绘制底色网格与原点十字
   */
  function drawBackgroundGrid(container) {
    const gridG = container.append('g').attr('class', 'scatter-grid-group');
    const ticks = [-60, -30, 0, 30, 60];

    ticks.forEach(t => {
      // 纵线
      gridG.append('line')
        .attr('class', 'scatter-grid-line')
        .attr('x1', xScale(t)).attr('x2', xScale(t))
        .attr('y1', MARGIN.top).attr('y2', HEIGHT - MARGIN.bottom);

      // 横线
      gridG.append('line')
        .attr('class', 'scatter-grid-line')
        .attr('x1', MARGIN.left).attr('x2', WIDTH - MARGIN.right)
        .attr('y1', yScale(t)).attr('y2', yScale(t));
    });
  }

  /**
   * 绘制四大流派的“水彩领地气泡” (Smooth Convex Hulls)
   */
  function drawClusterHulls() {
    dataset.clusters.forEach(cluster => {
      const poetsInCluster = dataset.poets.filter(p => p.cluster_id === cluster.id);
      if (poetsInCluster.length < 3) return;

      // 提取像素坐标点
      const points = poetsInCluster.map(p => [xScale(p.x), yScale(p.y)]);
      
      // 计算凸包顶点
      const hull = d3.polygonHull(points);
      if (!hull) return;

      // 计算领地中心点（重心）
      const cx = d3.mean(hull, d => d[0]);
      const cy = d3.mean(hull, d => d[1]);

      // 对凸包顶点进行向外柔和外扩（Padding 24px），使点位于气泡内部
      const paddedHull = hull.map(([x, y]) => {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const pad = 26;
        return [x + (dx / dist) * pad, y + (dy / dist) * pad];
      });

      // 平滑闭合曲线生成器
      const lineGen = d3.line()
        .curve(d3.curveCatmullRomClosed.alpha(0.6))
        .x(d => d[0])
        .y(d => d[1]);

      const clusterHullG = hullGroup.append('g')
        .datum(cluster)
        .attr('class', `cluster-hull-container cluster-hull-${cluster.id}`);

      // 1. 水彩半透明领地底色
      clusterHullG.append('path')
        .attr('d', lineGen(paddedHull))
        .attr('class', 'cluster-hull-path')
        .attr('fill', cluster.color)
        .attr('fill-opacity', 0.08)
        .attr('stroke', cluster.color)
        .attr('stroke-opacity', 0.35)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4 4');

      // 2. 解法1：四角外围固定图签坐标与凸包最近锚点计算 (Corner Slots & Leader Line)
      // 西北 (Cluster 0), 东北 (Cluster 2), 西南 (Cluster 1), 东南 (Cluster 3)
      const CORNER_SLOTS = {
        0: [135, 36],   // 宫闱乐府 (西北外围开阔区)
        2: [725, 36],   // 山水行旅 (东北外围开阔区)
        1: [135, 504],  // 晚唐羁旅 (西南外围开阔区)
        3: [725, 504]   // 现实关怀 (东南外围开阔区)
      };

      const [bx, by] = CORNER_SLOTS[cluster.id] || [cx, cy];

      // 在凸包边缘寻找距离四角徽标最近的锚点 (Nearest Hull Anchor)
      let bestAnchor = paddedHull[0];
      let minDistance = Infinity;

      for (let i = 0; i < paddedHull.length; i++) {
        const p1 = paddedHull[i];
        const p2 = paddedHull[(i + 1) % paddedHull.length];
        for (let t = 0; t <= 1; t += 0.05) {
          const sx = p1[0] * (1 - t) + p2[0] * t;
          const sy = p1[1] * (1 - t) + p2[1] * t;
          const d = Math.hypot(sx - bx, sy - by);
          if (d < minDistance) {
            minDistance = d;
            bestAnchor = [sx, sy];
          }
        }
      }

      // 3. 绘制优雅的虚线引线 (Leader Line from Corner Badge to Hull Anchor)
      clusterHullG.append('line')
        .attr('class', 'cluster-leader-line')
        .attr('x1', bx)
        .attr('y1', by)
        .attr('x2', bestAnchor[0])
        .attr('y2', bestAnchor[1])
        .attr('stroke', cluster.color)
        .attr('stroke-width', 1.2)
        .attr('stroke-opacity', 0.45)
        .attr('stroke-dasharray', '3 3');

      // 4. 绘制凸包边缘锚点微圆 (Anchor Dot on Hull)
      clusterHullG.append('circle')
        .attr('class', 'cluster-anchor-dot')
        .attr('cx', bestAnchor[0])
        .attr('cy', bestAnchor[1])
        .attr('r', 2.8)
        .attr('fill', cluster.color)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1);

      // 5. 绘制外围角标卡片 (Corner Callout Badge)
      const badgeG = clusterHullG.append('g')
        .attr('class', 'cluster-territory-badge')
        .attr('transform', `translate(${bx}, ${by})`)
        .style('cursor', 'pointer')
        .on('click', () => toggleCluster(cluster.id));

      // 徽标背景卡片 (宣纸底色 + 流派主题色细线描边 + 柔和投影)
      const badgeBox = badgeG.append('rect')
        .attr('class', 'cluster-badge-box')
        .attr('y', -14)
        .attr('height', 28)
        .attr('rx', 14)
        .attr('fill', '#fdfaf3')
        .attr('fill-opacity', 0.95)
        .attr('stroke', cluster.color)
        .attr('stroke-width', 1.4)
        .attr('stroke-opacity', 0.6)
        .style('filter', 'drop-shadow(0 2px 6px rgba(44, 62, 80, 0.08))');

      // 徽标文字: 流派名 + 核心关键词
      const badgeText = badgeG.append('text')
        .attr('class', 'cluster-badge-text')
        .attr('y', 4)
        .attr('text-anchor', 'middle')
        .attr('fill', cluster.color)
        .attr('font-size', '11px')
        .attr('letter-spacing', '0.8px');

      badgeText.append('tspan')
        .attr('font-weight', 'bold')
        .text(`【${cluster.name}】 `);

      badgeText.append('tspan')
        .attr('font-size', '9.5px')
        .attr('opacity', 0.8)
        .text(cluster.keywords.slice(0, 3).join(' · '));

      // 自适应外框宽度
      const bbox = badgeText.node().getBBox();
      const padW = 18;
      badgeBox
        .attr('x', -(bbox.width + padW) / 2)
        .attr('width', bbox.width + padW);
    });
  }


  /**
   * 绘制诗人散点与分级标注 (Hierarchical Nodes)
   */
  function drawPoetNodes() {
    const poetGroups = dotsGroup.selectAll('.poet-dot-group')
      .data(dataset.poets, d => d.name)
      .enter()
      .append('g')
      .attr('class', d => `poet-dot-group ${d.is_master ? 'master' : ''}`)
      .attr('transform', d => `translate(${xScale(d.x)}, ${yScale(d.y)})`)
      .on('mouseenter', showTooltip)
      .on('mousemove', moveTooltip)
      .on('mouseleave', hideTooltip)
      .on('click', onPoetClick);

    // 1. 诗人圆点
    poetGroups.append('circle')
      .attr('class', d => `poet-dot-circle ${d.is_master ? 'master' : ''}`)
      .attr('r', d => (d.is_master ? 7.5 : Math.max(4.5, Math.sqrt(d.poem_count) * 0.14)))
      .attr('fill', d => d.color)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', d => (d.is_master ? 2 : 1.2))
      .attr('opacity', 0.92);

    // 2. 诗人姓名文本（分级标注，依托 CSS 纯净白描边光晕防遮挡）
    poetGroups.append('text')
      .attr('class', d => `poet-dot-label ${d.is_master ? 'master' : ''}`)
      .attr('x', 9)
      .attr('y', 4)
      .style('opacity', d => (d.is_master ? 1 : 0)) // 宗师常驻显示，普通诗人默认隐去避让
      .text(d => d.name);
  }

  /**
   * 缩放控制按钮绑定
   */
  function setupZoomControls() {
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        svg.transition().duration(300).call(zoomBehavior.scaleBy, 1.3);
      });
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        svg.transition().duration(300).call(zoomBehavior.scaleBy, 0.75);
      });
    }

    if (zoomResetBtn) {
      zoomResetBtn.addEventListener('click', () => {
        svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity);
      });
    }
  }

  /**
   * 过滤与高亮调度
   */
  function updateScatterDisplay() {
    // 更新点的高亮与半透明
    dotsGroup.selectAll('.poet-dot-group')
      .each(function (d) {
        const group = d3.select(this);
        const isDimmed = activeClusterId !== null && d.cluster_id !== activeClusterId;
        const isSelected = selectedPoet && selectedPoet.name === d.name;

        group.classed('dimmed', isDimmed);
        group.classed('highlight', isSelected);

        // 如果该流派被过滤选中，临时显现该流派所有诗人的名字
        if (activeClusterId !== null && d.cluster_id === activeClusterId) {
          group.select('.poet-dot-label').style('opacity', 1);
        } else if (!d.is_master && currentZoomK < 1.6) {
          group.select('.poet-dot-label').style('opacity', 0);
        }
      });

    // 更新领地气泡、引线与徽标的高亮
    hullGroup.selectAll('.cluster-hull-container')
      .each(function (c) {
        const isCurrent = activeClusterId === null || activeClusterId === c.id;
        const container = d3.select(this);
        container.style('opacity', isCurrent ? 1 : 0.15);
        container.select('.cluster-hull-path')
          .attr('fill-opacity', activeClusterId === c.id ? 0.16 : 0.08)
          .attr('stroke-width', activeClusterId === c.id ? 2.5 : 1.5);
        container.select('.cluster-leader-line')
          .attr('stroke-width', activeClusterId === c.id ? 1.8 : 1.2)
          .attr('stroke-opacity', activeClusterId === c.id ? 0.8 : 0.45);
        container.select('.cluster-anchor-dot')
          .attr('r', activeClusterId === c.id ? 3.8 : 2.8);
        container.select('.cluster-badge-box')
          .attr('stroke-width', activeClusterId === c.id ? 2.0 : 1.4)
          .attr('stroke-opacity', activeClusterId === c.id ? 0.9 : 0.6);
      });

  }

  /**
   * 点击诗人圆点
   */
  function onPoetClick(poet) {
    selectedPoet = poet;
    updateScatterDisplay();

    // 更新左侧详情卡片
    selPoetNameEl.textContent = poet.name;
    selPoetBodyEl.innerHTML = `
      <div class="sel-detail-row">
        <span class="sel-detail-label">归属流派:</span>
        <span class="sel-detail-val" style="color: ${poet.color}">【${poet.cluster_name}】</span>
      </div>
      <div class="sel-detail-row">
        <span class="sel-detail-label">诗作数量:</span>
        <span class="sel-detail-val">${poet.poem_count.toLocaleString()} 首 ${poet.is_master ? '<strong style="color:#b23a22">（文学宗师）</strong>' : ''}</span>
      </div>
      <div class="sel-detail-row">
        <span class="sel-detail-label">高频用词:</span>
        <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px;">
          ${poet.top_words.map(w => `<span class="poet-badge"><strong>${w}</strong></span>`).join('')}
        </div>
      </div>
      <div style="font-size: 0.75rem; color: #9c9284; margin-top: 8px;">
        💡 空间分布: 属于【${poet.cluster_name}】核心语料群岛。
      </div>
    `;
  }

  /**
   * 浮动 Tooltip
   */
  function showTooltip(d) {
    tooltipEl.style.opacity = '1';
    tooltipEl.innerHTML = `
      <div class="tt-header">
        <span class="tt-word" style="color: ${d.color}">
          ${d.name} ${d.is_master ? '<small style="font-size:0.75rem; background:#b23a22; color:#fff; padding:1px 4px; border-radius:2px;">名家</small>' : ''}
        </span>
        <span class="tt-count">${d.poem_count} 首诗</span>
      </div>
      <div style="font-size: 0.85rem; font-weight: bold; color: ${d.color}; margin-bottom: 6px;">
        流派：${d.cluster_name}
      </div>
      <div class="tt-section-title">高权重特征词 (TF-IDF Top 5)</div>
      <div class="tt-poets">
        ${d.top_words.map(w => `<span class="poet-badge">${w}</span>`).join('')}
      </div>
      <div style="font-size: 0.75rem; color: #95a5a6; margin-top: 4px;">
        💡 点击可锁定该诗人；双击或滚轮可放大该区域。
      </div>
    `;

    // 悬停时无论是否宗师都临时显示姓名
    d3.select(this).select('.poet-dot-label').style('opacity', 1);
  }

  function moveTooltip() {
    tooltipEl.style.left = (d3.event.pageX + 16) + 'px';
    tooltipEl.style.top = (d3.event.pageY - 28) + 'px';
  }

  function hideTooltip(d) {
    tooltipEl.style.opacity = '0';
    // 恢复原来的可见性
    if (d && !d.is_master && activeClusterId !== d.cluster_id && currentZoomK < 1.6) {
      d3.select(this).select('.poet-dot-label').style('opacity', 0);
    }
  }

  // 页面加载启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
