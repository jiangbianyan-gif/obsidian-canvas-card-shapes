'use strict';

/* ============================================================================
   Canvas Card Shapes —— 给白板卡片套一个形状
   Canvas Card Shapes — shape presets for Canvas cards
   ----------------------------------------------------------------------------
   设计原则（和配套的 Canvas Node Align 一致）：插件只负责「挂类名」，
   形状全部由 CSS 完成（border-radius / clip-path）。渲染交给样式表，
   插件里没有任何几何计算。

   ★ 两种做法，按形状挑：
     · border-radius —— 圆角矩形 / 胶囊 / 椭圆 / 折角以外的圆润形状。
       这一类**保留卡片原生描边**（描边跟着圆角走）。
     · clip-path: polygon(...) —— 菱形 / 六边形 / 平行四边形 / 三角形 /
       星形这些有直边的形状。
       ⚠️ 代价：clip-path 只能裁形状、**不能描边**，所以多边形没有边框线；
       要边框就得套两层元素，那会破坏 Obsidian 的选中/拖动，不值得。
       多边形的文字内边距会自动加大（见 styles.css 里每个形状的 --shapes-pad-x/y）。

   ★ 形状记在哪？**插件自己的 data.json**，不写进 .canvas。
     和 Canvas Node Align 的选择一致 —— .canvas 保持标准 JSON Canvas 格式，
     别的工具/别的电脑打开都不会看到私有字段。
     代价：卸载插件后形状就没了（见 README 已知限制）。
     数据结构：data.json → perItem["<白板路径>"]["s:<节点 id>"] = 形状 key

   ★ 卡片 DOM 会被 Obsidian 重建（切标签、缩放重排、改尺寸都会），
     重建后运行时类名会丢。所以每次 layout-change / active-leaf-change 都要
     把类名重新挂一遍 —— 见 reapplyCanvas()。这是整个插件最关键的一段。

   用到的 Obsidian 接口（已在 1.13.7 上逐条核实）：
     workspace.on('canvas:node-menu',      (menu, node)   => ...)   // 右键单张卡片
     workspace.on('canvas:selection-menu', (menu, canvas) => ...)   // 框选多张后右键
     workspace.on('layout-change' / 'active-leaf-change')           // 重挂类名的时机
     node.nodeEl        // 卡片的那个 .canvas-node 元素（类名就挂在它上面）
     node.getData().id  // 节点 id，用来做 data.json 的键
     edge.labelElement… （本插件不用连线）
     menu.addItem(i => i.setTitle(..).setSubmenu().addItem(...))
     item.setSubmenu() / setIcon() / setSection() / setChecked() / onClick()
   ============================================================================ */

const { Plugin, PluginSettingTab, Setting, Notice, Menu } = require('obsidian');


/* ══════════════════════════════════════════════════════════ 形状表 */

/* 每个形状四个字段：
     key    存进 data.json 的值（稳定接口，改了老数据就认不出来）
     label  菜单里的名字（2–5 个字）
     group  分在哪个菜单段：'basic' 基础几何 / 'flow' 流程图
     cls    对应 styles.css 里的 .canvas-node.shapes-<cls>
   ★ 一个 cls 可以被多个 key 复用（流程图的「处理」就是「直角矩形」、
     「判断」就是「菱形」）—— 这样菜单里能用各自领域的叫法，
     而样式只有一份，不会漂。

   ★ 流程图那一组是**编程逻辑示意图**的标准符号（ISO 5807 / 常见教科书）：
     起止符、处理、判断、输入输出、预定义处理（子程序）、文档、数据库、
     手动输入、延时、注释、准备、连接点。 */
const SHAPES = [
  // ── 基础几何 ────────────────────────────────────────────────
  { key: 'square',        label: '直角矩形',   group: 'basic', cls: 'square' },
  { key: 'round',         label: '圆角矩形',   group: 'basic', cls: 'round' },
  { key: 'pill',          label: '胶囊',       group: 'basic', cls: 'pill' },
  { key: 'ellipse',       label: '椭圆',       group: 'basic', cls: 'ellipse' },
  { key: 'diamond',       label: '菱形',       group: 'basic', cls: 'diamond' },
  { key: 'parallelogram', label: '平行四边形', group: 'basic', cls: 'pgram' },
  { key: 'hexagon',       label: '六边形',     group: 'basic', cls: 'hexagon' },
  { key: 'octagon',       label: '八边形',     group: 'basic', cls: 'octagon' },
  { key: 'triangle',      label: '三角形',     group: 'basic', cls: 'triangle' },
  { key: 'star',          label: '星形',       group: 'basic', cls: 'star' },
  { key: 'blob',          label: '云形',       group: 'basic', cls: 'blob' },
  { key: 'note',          label: '折角便签',   group: 'basic', cls: 'note' },

  // ── 流程图（编程逻辑示意图） ─────────────────────────────────
  { key: 'terminator',   label: '起止符',     group: 'flow', cls: 'pill' },
  { key: 'process',      label: '处理',       group: 'flow', cls: 'square' },
  { key: 'decision',     label: '判断 / 分支', group: 'flow', cls: 'diamond' },
  { key: 'io',           label: '输入输出',   group: 'flow', cls: 'pgram' },
  { key: 'predefined',   label: '预定义处理', group: 'flow', cls: 'predefined' },
  { key: 'document',     label: '文档',       group: 'flow', cls: 'document' },
  { key: 'database',     label: '数据库',     group: 'flow', cls: 'database' },
  { key: 'manual',       label: '手动输入',   group: 'flow', cls: 'manual' },
  { key: 'delay',        label: '延时 / 等待', group: 'flow', cls: 'delay' },
  { key: 'annotation',   label: '注释',       group: 'flow', cls: 'annotation' },
  { key: 'preparation',  label: '准备',       group: 'flow', cls: 'hexagon' },
  { key: 'connector',    label: '连接点',     group: 'flow', cls: 'ellipse' }
];

const SHAPE_BY_KEY = {};
SHAPES.forEach(function (s) { SHAPE_BY_KEY[s.key] = s; });

// 菜单里两段的标题，顺序即菜单顺序
const GROUPS = [
  { key: 'basic', label: '基础几何' },
  { key: 'flow',  label: '流程图' }
];

const CLEAR_LABEL = '清除形状';

/* 形状相关的类名。★ 稳定接口：CSS 里一一对应，改了样式就全失效 */
const CLS_MARK = 'has-shape';     // 有形状时挂这个（也是清除时的开关）
                                  // ★ 刻意**不带** shapes- 前缀：这样"前缀筛出来的
                                  //   就是形状类"，两边都不用为它开特例
const CLS_PREFIX = 'shapes-';     // 具体形状：shapes-diamond

// data.json 里逐条记录的键前缀（'s:' 表示 shape）
const ITEM_PREFIX = 's:';

// 自动重挂类名的防抖间隔（毫秒）。Obsidian 的 layout-change 会连着触发好几次。
const REAPPLY_DELAY = 60;

const DEFAULT_SETTINGS = {
  pad: 12,        // 文字离形状边的内边距（px），写进 --shapes-pad
  perItem: {}     // { "<白板路径>": { "s:<节点id>": "<形状key>" } }
};


/* ══════════════════════════════════════════════════════════ 纯函数（可单测） */

// data.json 的 perItem 键：'s:' + 节点 id
function itemKey(nodeId) {
  return ITEM_PREFIX + nodeId;
}

// 这个形状 key 合法吗（不合法就当没设过，绝不把乱值挂上 DOM）
function isShapeKey(key) {
  return !!SHAPE_BY_KEY[key];
}

/* 从 data.json 的那一小撮记录里挑出属于这些节点 id 的形状。
   返回 { "<节点id>": "<形状key>" }，只含合法值。纯函数，可单测。 */
function shapesFromBucket(bucket, nodeIds) {
  const out = {};
  if (!bucket) return out;
  (nodeIds || []).forEach(function (id) {
    const key = bucket[itemKey(id)];
    if (isShapeKey(key)) out[id] = key;
  });
  return out;
}

/* 一个元素上现在挂的是哪个形状？找不到返回 null。
   （清类名之前要先知道清了什么，自检命令也用它读回来核对。） */
function readShapeClass(el) {
  if (!el || !el.classList) return null;
  const list = Array.prototype.slice.call(el.classList);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.indexOf(CLS_PREFIX) === 0) {
      const key = c.slice(CLS_PREFIX.length);
      // 后缀是不是已知形状（打错字的类名当没挂）
      const found = Object.keys(SHAPE_BY_KEY).filter(function (k) {
        return SHAPE_BY_KEY[k].cls === key;
      });
      if (found.length) return found[0];
    }
  }
  return null;
}

/* 把形状类名从元素上摘干净（只摘我们自己的，用户/主题的类名一个不碰）。
   传 key 则只挂那一个；不传就只清不挂。 */
function applyShapeClass(el, key) {
  if (!el || !el.classList) return false;
  const shape = key ? SHAPE_BY_KEY[key] : null;
  const wantCls = shape ? CLS_PREFIX + shape.cls : null;

  // 先清：所有 shapes-* 和标记类
  Array.prototype.slice.call(el.classList).forEach(function (c) {
    if (c === CLS_MARK || c.indexOf(CLS_PREFIX) === 0) el.classList.remove(c);
  });
  if (!wantCls) return true;
  el.classList.add(CLS_MARK);
  el.classList.add(wantCls);
  return true;
}


/* ══════════════════════════════════════════════════════════ 插件本体 */

module.exports = class CanvasCardShapes extends Plugin {

  async loadSettings() {
    const raw = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
    this.settings.perItem = raw.perItem || {};
    this._reapplyTimer = null;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async onload() {
    await this.loadSettings();
    this.useSubmenu = canUseSubmenu();

    this.applyPad();

    // 每次加载往 data.json 写个戳记：只要它一直在动，就说明插件真被加载过。
    // "设置里找不到插件"绝大多数是没关受限模式，这个戳记能把两种情况分开。
    const firstLoad = !this.settings._lastLoad;
    this._loadedAt = new Date().toISOString();
    this.settings._lastLoad = this._loadedAt;
    this.settings._lastVersion = (this.manifest && this.manifest.version) || '';
    this.saveSettings();

    this.registerCanvasMenus();
    this.registerCommands();
    this.registerReapplyTriggers();
    this.addSettingTab(new CanvasCardShapesSettingTab(this.app, this));

    console.log('[canvas-card-shapes] loaded v' + this.settings._lastVersion);
    if (firstLoad) {
      new Notice('Canvas Card Shapes 已启动 —— 右键白板卡片即可看到「卡片形状」', 6000);
    }
  }

  // 内边距写进 body 上的 CSS 变量（body 比 :root 更靠下，能盖住样式表默认值）
  applyPad() {
    const pad = Number(this.settings.pad);
    document.body.style.setProperty('--shapes-pad', (isFinite(pad) ? pad : 12) + 'px');
  }


  /* ─────────────────────────────────────────────── 右键菜单 */

  registerCanvasMenus() {
    // 1. 右键单张卡片
    this.registerEvent(
      this.app.workspace.on('canvas:node-menu', (menu, node) => {
        if (!node || !node.canvas || node.canvas.readonly) return;
        const current = this.shapeOf(node.canvas, node);
        this.addShapeMenu(menu, '卡片形状', (key) => this.setShape(node.canvas, [node], key), current);
        // 不管有没有单独设置过，先把已记录的形状重新挂一遍，
        // 免得节点刚重建过、类名还没跟上
        this.reapplyCanvas(node.canvas);
      })
    );

    // 2. 右键多选的一堆卡片（形状统一成一个）
    this.registerEvent(
      this.app.workspace.on('canvas:selection-menu', (menu, canvas) => {
        if (!canvas || canvas.readonly) return;
        const nodes = this.shapeableNodes(canvas);
        if (!nodes.length) return;
        const first = this.shapeOf(canvas, nodes[0]);
        const same = nodes.every((n) => this.shapeOf(canvas, n) === first);
        this.addShapeMenu(menu, '卡片形状（' + nodes.length + ' 张）',
          (key) => this.setShape(canvas, nodes, key), same ? first : null);
      })
    );
  }

  /* 在菜单里加「卡片形状 ▸」，子菜单按「基础几何 / 流程图 / 清除」分段。
     子菜单挂不上（很老的 Obsidian）就平铺到主菜单。 */
  addShapeMenu(menu, title, handler, current) {
    if (!menu || typeof menu.addItem !== 'function') return;
    if (this.useSubmenu) {
      menu.addItem((item) => {
        item.setTitle(title).setIcon('shapes').setSection('action');
        this.fillShapeItems(item.setSubmenu(), handler, current);
      });
    } else {
      this.fillShapeItems(menu, handler, current, 'action');
    }
  }

  /* 铺开全部形状。传了 section 就按组分段（平铺模式下才需要，子菜单里
     直接用组名当 section 也能分段）。currently 生效的那一项打勾。 */
  fillShapeItems(menu, handler, current, flatSection) {
    GROUPS.forEach((g) => {
      SHAPES.filter(function (s) { return s.group === g.key; }).forEach((s) => {
        menu.addItem((item) => {
          item.setTitle(s.label).setSection(flatSection || g.label);
          item.setChecked(s.key === current);
          item.onClick(() => handler(s.key));
        });
      });
    });
    // 清除：section 传空串 ⇒ 排序时会落到最后（Obsidian 把 '' 段放末尾）
    menu.addItem((item) => {
      item.setTitle(CLEAR_LABEL).setSection('').setChecked(!current);
      item.onClick(() => handler(null));
    });
  }


  /* ─────────────────────────────────────────────── 命令面板 */

  registerCommands() {
    // 每个形状一条命令，作用于**选中的卡片**（多选也生效）
    SHAPES.forEach((s) => {
      this.addCommand({
        id: 'shape-' + s.key,
        name: '卡片形状：' + s.label,
        checkCallback: (checking) => {
          const nodes = this.selectedShapeableNodes();
          if (!nodes.length) return false;
          if (!checking) this.setShape(nodes[0].canvas, nodes, s.key);
          return true;
        }
      });
    });

    this.addCommand({
      id: 'shape-clear',
      name: '卡片形状：清除选中卡片的形状',
      checkCallback: (checking) => {
        const nodes = this.selectedShapeableNodes();
        if (!nodes.length) return false;
        if (!checking) this.setShape(nodes[0].canvas, nodes, null);
        return true;
      }
    });

    this.addCommand({
      id: 'shape-clear-canvas',
      name: '卡片形状：清除整块白板的形状',
      checkCallback: (checking) => {
        const view = this.activeCanvasView();
        if (!view) return false;
        if (!checking) {
          const nodes = this.shapeableNodes(view.canvas);
          this.setShape(view.canvas, nodes, null);
        }
        return true;
      }
    });

    this.addCommand({
      id: 'doctor',
      name: '自检：插件与当前白板的状态',
      callback: () => this.showDoctor()
    });
  }


  /* ─────────────────────────────────────────────── 数据读写 */

  // 形状记在插件数据里，键 = 白板路径 + 节点 id。读不到就是"没设过"。
  bucket(canvas, create) {
    const path = canvasPath(canvas);
    if (!path) return null;
    if (!create) return this.settings.perItem[path] || null;
    return this.settings.perItem[path] || (this.settings.perItem[path] = {});
  }

  shapeOf(canvas, node) {
    const bucket = this.bucket(canvas, false);
    const id = nodeIdOf(node);
    if (!bucket || !id) return null;
    const key = bucket[itemKey(id)];
    return isShapeKey(key) ? key : null;
  }

  /* 设定（或清除）形状。key 为 null = 清除。
     ★ 一次只 saveSettings 一次、只挂一次类名 —— 多选时也是批量做完再存。 */
  setShape(canvas, nodes, key) {
    if (!canvas || !nodes || !nodes.length) return;
    const path = canvasPath(canvas);
    if (!path) {
      new Notice('这块白板还没有保存到磁盘，形状没法记录（先存一下再试）');
      return;
    }
    const bucket = this.bucket(canvas, true);
    let changed = 0;

    nodes.forEach((node) => {
      const id = nodeIdOf(node);
      if (!id) return;
      const k = itemKey(id);
      const before = bucket[k] || null;
      const next = key || null;
      if (before !== next) changed++;
      if (next) bucket[k] = next;
      else delete bucket[k];
      applyShapeClass(node.nodeEl, next);
    });

    if (!Object.keys(bucket).length) delete this.settings.perItem[path];
    this.saveSettings();

    if (!changed) return;   // 没有实际改动就不发提示
    const name = key ? (SHAPE_BY_KEY[key] || {}).label || key : '已清除';
    new Notice(key ? '已设置 ' + nodes.length + ' 张卡片：' + name
                   : '已清除 ' + nodes.length + ' 张卡片的形状');
  }


  /* ─────────────────────────────────────────────── 重挂类名 */

  registerReapplyTriggers() {
    const later = () => this.scheduleReapply();
    this.registerEvent(this.app.workspace.on('layout-change', later));
    this.registerEvent(this.app.workspace.on('active-leaf-change', later));
  }

  scheduleReapply() {
    if (this._reapplyTimer) window.clearTimeout(this._reapplyTimer);
    this._reapplyTimer = window.setTimeout(() => {
      this._reapplyTimer = null;
      this.app.workspace.iterateAllLeaves((leaf) => {
        const view = leaf && leaf.view;
        if (view && typeof view.getViewType === 'function' &&
            view.getViewType() === 'canvas' && view.canvas) {
          this.reapplyCanvas(view.canvas);
        }
      });
    }, REAPPLY_DELAY);
  }

  /* 把这块白板里记录过的形状重新挂一遍。
     ★ 必须在 canvasPath 早退之前做完 —— 拿不到文件路径（比如没保存的新板）
       也要能重新挂，否则刚设置的形状一重排就没了。 */
  reapplyCanvas(canvas) {
    if (!canvas || !canvas.nodes) return;
    const bucket = this.bucket(canvas, false);
    if (!bucket) return;
    canvas.nodes.forEach((node) => {
      const id = nodeIdOf(node);
      if (!id) return;
      const key = bucket[itemKey(id)];
      applyShapeClass(node.nodeEl, isShapeKey(key) ? key : null);
    });
  }


  /* ─────────────────────────────────────────────── 取对象 */

  activeCanvasView() {
    const leaf = this.app.workspace.activeLeaf;
    const view = leaf && leaf.view;
    if (!view || typeof view.getViewType !== 'function') return null;
    return view.getViewType() === 'canvas' ? view : null;
  }

  // 当前白板上"能套形状"的节点：有 nodeEl 的都算（文本卡 / 嵌入卡 / 分组…）
  shapeableNodes(canvas) {
    const out = [];
    if (!canvas || !canvas.nodes) return out;
    canvas.nodes.forEach((n) => { if (n && n.nodeEl) out.push(n); });
    return out;
  }

  selectedShapeableNodes() {
    const view = this.activeCanvasView();
    if (!view || !view.canvas) return [];
    const sel = view.canvas.selection;
    const out = [];
    if (sel && typeof sel.forEach === 'function') {
      sel.forEach((n) => { if (n && n.nodeEl) out.push(n); });
    }
    return out;
  }

  // 自检：出问题时让用户把这段贴给我，比截图管用
  showDoctor() {
    const v = (this.manifest && this.manifest.version) || '?';
    const view = this.activeCanvasView();
    const nodes = view ? this.shapeableNodes(view.canvas) : [];
    let withShape = 0;
    let onDom = 0;
    nodes.forEach((n) => {
      if (this.shapeOf(view.canvas, n)) withShape++;
      if (readShapeClass(n.nodeEl)) onDom++;
    });
    let cssVar = '';
    try { cssVar = getComputedStyle(document.body).getPropertyValue('--shapes-pad').trim(); } catch (e) {}
    const lines = [
      'Canvas Card Shapes v' + v + ' —— 插件正在运行',
      '本次加载：' + (this._loadedAt || '未知'),
      '右键子菜单：' + (this.useSubmenu ? '支持' : '不支持，已回退平铺菜单'),
      '--shapes-pad 变量：' + (cssVar ? '"' + cssVar + '"（样式已生效）' : '（空，样式没生效）'),
      '当前白板可套形状的节点：' + (view ? nodes.length + ' 个' : '不在白板视图'),
      '其中已记录形状：' + (view ? withShape + ' 个' : '—'),
      '其中 DOM 上真的挂着类名：' + (view ? onDom + ' 个' : '—'),
      '形状总数：' + SHAPES.length + '（基础 ' +
        SHAPES.filter(function (s) { return s.group === 'basic'; }).length + ' · 流程图 ' +
        SHAPES.filter(function (s) { return s.group === 'flow'; }).length + '）'
    ];
    new Notice(lines.join('\n'), 10000);
  }
};


/* ══════════════════════════════════════════════════════════ 设置面板 */

class CanvasCardShapesSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const p = this.plugin;
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Canvas Card Shapes' });
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: '给白板卡片套形状。形状记在本插件的数据文件里，不写进 .canvas —— ' +
            '白板文件始终是标准 JSON Canvas 格式。'
    });

    containerEl.createEl('h3', { text: '文字与形状边的距离' });
    new Setting(containerEl)
      .setName('内边距')
      .setDesc('文字离卡片边缘的留白。菱形、椭圆这类形状本身就会再多留一些' +
               '（不然文字会被裁掉），这里是最基础的值。')
      .addSlider(function (sl) {
        sl.setLimits(0, 40, 1)
          .setValue(Number(p.settings.pad) || 12)
          .setDynamicTooltip()
          .onChange(async function (v) {
            p.settings.pad = v;
            p.applyPad();
            await p.saveSettings();
          });
      });

    containerEl.createEl('h3', { text: '怎么用' });
    const tips = containerEl.createEl('div', { cls: 'setting-item-description' });
    tips.createEl('p', { text: '· 右键卡片 →「卡片形状」→ 选一个（当前生效的那项打勾）' });
    tips.createEl('p', { text: '· 框选多张再右键 → 一次给它们套同一个形状' });
    tips.createEl('p', { text: '· 命令面板 →「卡片形状：菱形」等，作用于选中的卡片' });
    tips.createEl('p', {
      text: '· 流程图那一组是编程逻辑示意图的标准符号：起止符 / 处理 / 判断 / ' +
            '输入输出 / 预定义处理 / 文档 / 数据库 / 延时 / 注释……'
    });

    containerEl.createEl('h3', { text: '说明' });
    const notes = containerEl.createEl('div', { cls: 'setting-item-description' });
    notes.createEl('p', {
      text: '· 圆角 / 胶囊 / 椭圆这一类保留卡片原生描边；' +
            '菱形 / 六边形这类用裁剪做的形状**没有描边**（CSS 的裁剪只能裁形状、不能描边）'
    });
    notes.createEl('p', { text: '· 形状不影响卡片大小。多边形里文字空间小的话，把卡片拉大一点' });
    notes.createEl('p', { text: '· 卸载插件后形状会丢（它记在插件数据里）' });
  }
}


/* ══════════════════════════════════════════════════════════ 工具 */

// 白板对应的文件路径（data.json 的键）。没保存过的板拿不到，返回 null。
function canvasPath(canvas) {
  const f = canvas && canvas.view && canvas.view.file;
  return (f && f.path) || null;
}

// 节点 id：优先用 getData().id，退回 node.id
function nodeIdOf(node) {
  try {
    const d = node.getData && node.getData();
    if (d && d.id) return d.id;
  } catch (e) { /* 忽略，走下面的兜底 */ }
  return (node && node.id) || null;
}

/* 这台 Obsidian 支不支持「菜单项挂子菜单」。不支持的版本上平铺，不报错也不留死项。
   探针是真的 new 一个 Menu 加一项试，不是看版本号（版本号猜不准）；
   探针菜单从不 show，所以没有副作用。 */
function canUseSubmenu() {
  try {
    const probe = new Menu();
    let ok = false;
    probe.addItem(function (item) {
      ok = typeof item.setSubmenu === 'function';
    });
    return ok;
  } catch (e) {
    return false;
  }
}


/* ══════════════════════════════════════════════════════════ 导出给单测

   （Obsidian 环境里 module.exports 是插件类，这里只在 Node 下补充挂载） */
module.exports.__pure = {
  itemKey, isShapeKey, shapesFromBucket, readShapeClass, applyShapeClass,
  SHAPES, SHAPE_BY_KEY, GROUPS, CLS_MARK, CLS_PREFIX, ITEM_PREFIX,
  CLEAR_LABEL, DEFAULT_SETTINGS
};
