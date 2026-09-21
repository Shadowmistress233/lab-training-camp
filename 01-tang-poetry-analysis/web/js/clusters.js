/**
 * 全唐诗大唐诗人流派聚类星空图 - D3.js v5 散点图与缩放交互引擎
 * Tang Poets Clustering Scatter Plot - D3.js v5 with Zoom & Pan
 */

(function () {
  'use strict';

  // 全局数据状态
  let dataset = null;
  let activeClusterId = null; // null 表示展示全部流派
  let selectedPoet = null;
  let svg = null;
  let zoomG = null;
  let zoomBehavior = null;
  let xScale = null;
  let yScale = null;

  // 画布几何配置
  const WIDTH = 820;
  const HEIGHT = 520;
  const MARGIN = { top: 40, right: 50, bottom: 40, left: 50 };

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
        throw new Error('诗人聚类数据集异常');
      }

      // 渲染顶部数据统计指标
      renderTopRibbon();

      // 渲染左侧流派图例卡片
      renderClusterLegend();

      // 构建 D3 散点图
      setupScatterPlot();

      // 绑定缩放控件按钮
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
    const varSum = d3.sum(dataset.metadata.pca_explained_variance);

    statsRibbonEl.innerHTML = `
      <div class="stat-pill">
        <span class="stat-label">聚类诗人</span>
        <span class="stat-val">${totalPoets} <small>位</small></span>
      </div>
      <div class="stat-pill">
        <span class="stat-label">发现流派</span>
        <span class="stat-val">${nClusters} <small>大流派</small></span>
      </div>
      <div class="stat-pill">
        <span class="stat-label">PCA解释方差</span>
        <span class="stat-val">${(varSum * 100).toFixed(1)}%</span>
      </div>
    `;
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
          ${cluster.keywords.slice(0, 6).map(kw => `<span class="cluster-kw-tag">${kw}</span>`).join('')}
        </div>
      `;

      card.addEventListener('click', () => {
        if (activeClusterId === cluster.id) {
          // 再次点击取消过滤
          activeClusterId = null;
          currentClusterFilterEl.textContent = '全部流派';
          currentClusterFilterEl.style.backgroundColor = 'rgba(178, 58, 34, 0.08)';
          currentClusterFilterEl.style.color = '#b23a22';
          document.querySelectorAll('.cluster-legend-card').forEach(c => c.classList.remove('active'));
        } else {
          activeClusterId = cluster.id;
          currentClusterFilterEl.textContent = `筛选: ${cluster.name}`;
          currentClusterFilterEl.style.backgroundColor = cluster.color;
          currentClusterFilterEl.style.color = '#ffffff';
          document.querySelectorAll('.cluster-legend-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
        }

        updateScatterDisplay();
      });

      clusterLegendListEl.appendChild(card);
    });
  }

  /**
   * 构建 D3 散点图
   */
  function setupScatterPlot() {
    svg = d3.select('#scatter-plot-svg')
      .attr('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    svg.selectAll('*').remove();

    // 比例尺设定
    xScale = d3.scaleLinear()
      .domain([-95, 95])
      .range([MARGIN.left, WIDTH - MARGIN.right]);

    yScale = d3.scaleLinear()
      .domain([-95, 95])
      .range([HEIGHT - MARGIN.bottom, MARGIN.top]);

    // 可缩放/平移的容器 G
    zoomG = svg.append('g').attr('class', 'zoom-g');

    // 1. 绘制虚线网格
    const gridTicks = [-60, -30, 0, 30, 60];
    const gridG = zoomG.append('g').attr('class', 'scatter-grid-group');

    // 垂直网格线
    gridTicks.forEach(tick => {
      gridG.append('line')
        .attr('class', 'scatter-grid-line')
        .attr('x1', xScale(tick))
        .attr('x2', xScale(tick))
        .attr('y1', MARGIN.top)
        .attr('y2', HEIGHT - MARGIN.bottom);
    });

    // 水平网格线
    gridTicks.forEach(tick => {
      gridG.append('line')
        .attr('class', 'scatter-grid-line')
        .attr('x1', MARGIN.left)
        .attr('x2', WIDTH - MARGIN.right)
        .attr('y1', yScale(tick))
        .attr('y2', yScale(tick));
    });

    // 2. 绘制原点中心十字轴 (X=0, Y=0)
    const axisG = zoomG.append('g').attr('class', 'scatter-axis-group');

    axisG.append('line')
      .attr('class', 'scatter-axis-line')
      .attr('x1', MARGIN.left)
      .attr('x2', WIDTH - MARGIN.right)
      .attr('y1', yScale(0))
      .attr('y2', yScale(0));

    axisG.append('line')
      .attr('class', 'scatter-axis-line')
      .attr('x1', xScale(0))
      .attr('x2', xScale(0))
      .attr('y1', MARGIN.top)
      .attr('y2', HEIGHT - MARGIN.bottom);

    // 轴端标识
    axisG.append('text')
      .attr('class', 'scatter-axis-label')
      .attr('x', WIDTH - MARGIN.right - 5)
      .attr('y', yScale(0) - 8)
      .attr('text-anchor', 'end')
      .text('PCA 主成分 1 →');

    axisG.append('text')
      .attr('class', 'scatter-axis-label')
      .attr('x', xScale(0) + 8)
      .attr('y', MARGIN.top + 12)
      .attr('text-anchor', 'start')
      .text('↑ PCA 主成分 2');

    // 3. 绘制诗人散点 (Data Join)
    const dotsG = zoomG.append('g').attr('class', 'scatter-dots-group');

    const poetGroups = dotsG.selectAll('.poet-dot-group')
      .data(dataset.poets, d => d.name)
      .enter()
      .append('g')
      .attr('class', 'poet-dot-group')
      .attr('transform', d => `translate(${xScale(d.x)}, ${yScale(d.y)})`)
      .on('mouseenter', showTooltip)
      .on('mousemove', moveTooltip)
      .on('mouseleave', hideTooltip)
      .on('click', onPoetClick);

    // 圆点
    poetGroups.append('circle')
      .attr('class', 'poet-dot-circle')
      .attr('r', d => Math.max(4.5, Math.min(8.5, Math.sqrt(d.poem_count) * 0.16)))
      .attr('fill', d => d.color)
      .attr('opacity', 0.9);

    // 诗人姓名文本
    poetGroups.append('text')
      .attr('class', 'poet-dot-label')
      .attr('x', 7)
      .attr('y', 3)
      .text(d => d.name);

    // 4. 配置 D3 缩放与平移 (Zoom & Pan)
    zoomBehavior = d3.zoom()
      .scaleExtent([0.7, 5]) // 允许 0.7x 到 5x 缩放
      .on('zoom', () => {
        zoomG.attr('transform', d3.event.transform);
      });

    svg.call(zoomBehavior);
  }

  /**
   * 缩放控制按钮
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
   * 更新散点图显示状态（过滤/高亮）
   */
  function updateScatterDisplay() {
    zoomG.selectAll('.poet-dot-group')
      .each(function (d) {
        const group = d3.select(this);
        const isDimmed = activeClusterId !== null && d.cluster_id !== activeClusterId;
        const isSelected = selectedPoet && selectedPoet.name === d.name;

        group.classed('dimmed', isDimmed);
        group.classed('highlight', isSelected);
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
        <span class="sel-detail-label">收录诗作:</span>
        <span class="sel-detail-val">${poet.poem_count.toLocaleString()} 首</span>
      </div>
      <div class="sel-detail-row">
        <span class="sel-detail-label">特征词汇:</span>
        <div style="margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px;">
          ${poet.top_words.map(w => `<span class="poet-badge"><strong>${w}</strong></span>`).join('')}
        </div>
      </div>
      <div style="font-size: 0.75rem; color: #9c9284; margin-top: 8px;">
        💡 空间坐标: X = ${poet.x}, Y = ${poet.y} (PCA 降维二维投影)
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
        <span class="tt-word" style="color: ${d.color}">${d.name}</span>
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
        💡 点击圆点可在左侧固定锁定该诗人。
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

  // 页面加载启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
