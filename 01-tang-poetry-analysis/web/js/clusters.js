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

    // 3. 诗人散点与姓名层 (Dots & Labels with 8-direction adaptive layout)
    computeAdaptiveLabelLayout();
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

    });
  }


  /**
   * 八方向自适应投射避让标注算法 (8-Direction Adaptive Raycasting Label Placement)
   * 自动探测诗人周围 8 个象限的空旷度与遮挡情况，自适应选出最优朝向与对齐方式
   */
  function computeAdaptiveLabelLayout() {
    // 8 个候选方向配置及符合自然阅读习惯的基础偏好分 (pref)
    const DIRECTIONS = [
      { name: 'E',  pref: 0 },
      { name: 'NE', pref: 2 },
      { name: 'SE', pref: 3 },
      { name: 'N',  pref: 4 },
      { name: 'S',  pref: 5 },
      { name: 'W',  pref: 6 },
      { name: 'NW', pref: 7 },
      { name: 'SW', pref: 8 }
    ];

    // 预提取所有诗人的像素坐标与基础几何属性
    const poetNodes = dataset.poets.map(p => {
      const px = xScale(p.x);
      const py = yScale(p.y);
      const r = p.is_master ? 7.5 : Math.max(4.5, Math.sqrt(p.poem_count) * 0.14);
      const textW = p.name.length * 12 + 4; // 11px 中文字体宽度预估与缓冲
      const textH = 13;
      return { poet: p, px, py, r, textW, textH };
    });

    // 优先级排序：宗师诗人优先霸占黄金无碰撞位置，其余按诗作篇数排序
    const sortedNodes = [...poetNodes].sort((a, b) => {
      if (a.poet.is_master && !b.poet.is_master) return -1;
      if (!a.poet.is_master && b.poet.is_master) return 1;
      return (b.poet.poem_count || 0) - (a.poet.poem_count || 0);
    });

    // 各方向几何包围盒与相对偏移计算
    function getDirectionBox(node, dirName) {
      const { px, py, r, textW, textH } = node;
      let x1, y1, x2, y2, dx, dy, anchor;

      switch (dirName) {
        case 'E':
          dx = r + 4;
          dy = 4;
          anchor = 'start';
          x1 = px + dx;
          x2 = x1 + textW;
          y1 = py - 9;
          y2 = py + 5;
          break;
        case 'W':
          dx = -r - 4;
          dy = 4;
          anchor = 'end';
          x2 = px + dx;
          x1 = x2 - textW;
          y1 = py - 9;
          y2 = py + 5;
          break;
        case 'N':
          dx = 0;
          dy = -r - 4;
          anchor = 'middle';
          x1 = px - textW / 2;
          x2 = px + textW / 2;
          y2 = py + dy;
          y1 = y2 - textH;
          break;
        case 'S':
          dx = 0;
          dy = r + textH;
          anchor = 'middle';
          x1 = px - textW / 2;
          x2 = px + textW / 2;
          y1 = py + r + 2;
          y2 = y1 + textH;
          break;
        case 'NE':
          dx = r + 2;
          dy = -r;
          anchor = 'start';
          x1 = px + dx;
          x2 = x1 + textW;
          y2 = py + dy;
          y1 = y2 - textH;
          break;
        case 'NW':
          dx = -r - 2;
          dy = -r;
          anchor = 'end';
          x2 = px + dx;
          x1 = x2 - textW;
          y2 = py + dy;
          y1 = y2 - textH;
          break;
        case 'SE':
          dx = r + 2;
          dy = r + textH;
          anchor = 'start';
          x1 = px + dx;
          x2 = x1 + textW;
          y1 = py + r + 2;
          y2 = y1 + textH;
          break;
        case 'SW':
          dx = -r - 2;
          dy = r + textH;
          anchor = 'end';
          x2 = px + dx;
          x1 = x2 - textW;
          y1 = py + r + 2;
          y2 = y1 + textH;
          break;
      }
      return { box: [x1, y1, x2, y2], dx, dy, anchor };
    }

    // 碰撞检测辅助：矩形与矩形相交
    function isBoxOverlap(b1, b2, pad = 2) {
      return !(b1[2] + pad < b2[0] || b1[0] - pad > b2[2] || b1[3] + pad < b2[1] || b1[1] - pad > b2[3]);
    }

    // 碰撞检测辅助：圆点进入矩形
    function isDotInBox(b, cx, cy, cr = 5) {
      return cx >= b[0] - cr && cx <= b[2] + cr && cy >= b[1] - cr && cy <= b[3] + cr;
    }

    const placedBoxes = [];

    sortedNodes.forEach(node => {
      let bestDir = 'E';
      let bestConfig = null;
      let minPenalty = Infinity;

      for (const dir of DIRECTIONS) {
        const config = getDirectionBox(node, dir.name);
        const [x1, y1, x2, y2] = config.box;
        let penalty = dir.pref;

        // 1. 画布边缘裁切保护
        if (x1 < MARGIN.left || x2 > WIDTH - MARGIN.right || y1 < MARGIN.top || y2 > HEIGHT - MARGIN.bottom) {
          penalty += 1000;
        }

        // 2. 邻近散点圆圈碰撞保护（防止字压点）
        for (const other of poetNodes) {
          if (other.poet.name === node.poet.name) continue;
          if (isDotInBox(config.box, other.px, other.py, other.r + 3)) {
            penalty += 500;
          }
        }

        // 3. 已放置文字重叠保护（防止字压字）
        for (const pbox of placedBoxes) {
          if (isBoxOverlap(config.box, pbox)) {
            penalty += 300;
          }
        }

        if (penalty < minPenalty) {
          minPenalty = penalty;
          bestDir = dir.name;
          bestConfig = config;
        }
      }

      placedBoxes.push(bestConfig.box);
      node.poet._labelLayout = {
        dx: bestConfig.dx,
        dy: bestConfig.dy,
        anchor: bestConfig.anchor,
        dir: bestDir
      };
    });
  }

  /**
   * 绘制诗人散点与分级标注 (Hierarchical Nodes with Adaptive Placement)
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

    // 2. 诗人姓名文本（八方向自适应避让 + 纯净白描边光晕防遮挡）
    poetGroups.append('text')
      .attr('class', d => `poet-dot-label ${d.is_master ? 'master' : ''}`)
      .attr('x', d => (d._labelLayout ? d._labelLayout.dx : 9))
      .attr('y', d => (d._labelLayout ? d._labelLayout.dy : 4))
      .attr('text-anchor', d => (d._labelLayout ? d._labelLayout.anchor : 'start'))
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

    // 更新领地水彩气泡的高亮
    hullGroup.selectAll('.cluster-hull-container')
      .each(function (c) {
        const isCurrent = activeClusterId === null || activeClusterId === c.id;
        const container = d3.select(this);
        container.style('opacity', isCurrent ? 1 : 0.15);
        container.select('.cluster-hull-path')
          .attr('fill-opacity', activeClusterId === c.id ? 0.18 : 0.08)
          .attr('stroke-width', activeClusterId === c.id ? 2.5 : 1.5)
          .attr('stroke-opacity', activeClusterId === c.id ? 0.7 : 0.35);
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
