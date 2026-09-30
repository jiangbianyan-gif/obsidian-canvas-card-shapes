'use strict';
/* Canvas Card Shapes — unit tests.
 *
 *   node test/shapes.test.js        (or: npm test)
 *
 * How it works: `main.js` is loaded by Obsidian's plugin loader, so a bare
 * `require()` would fail on `require('obsidian')`. The "constants + pure
 * functions" region is sliced out of the source and evaluated with `new
 * Function`, which keeps the test honest: it runs the exact shipped code.
 * A second pass loads the WHOLE file with a stub `obsidian` module, so a
 * mistake in the plugin class body is caught here too.
 *
 * The most valuable group is the **table ↔ stylesheet contract**: a shape in the
 * menu with no CSS rule is invisible (silent failure), and a CSS rule with no
 * menu entry is dead weight. Both are asserted in both directions.
 *
 * No dependencies, no test framework.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'main.js');
const src = fs.readFileSync(SRC, 'utf8');

function slice(startMark, endMark) {
  const i = src.indexOf(startMark);
  const j = src.indexOf(endMark);
  if (i < 0 || j < 0 || j <= i) throw new Error('slice failed: ' + startMark);
  return src.slice(i, j);
}

const code =
  slice('const SHAPES = [', 'module.exports = class') +
  '\nreturn {itemKey, isShapeKey, shapesFromBucket, readShapeClass, applyShapeClass, ' +
  'SHAPES, SHAPE_BY_KEY, GROUPS, CLS_MARK, CLS_PREFIX, ITEM_PREFIX, CLEAR_LABEL, DEFAULT_SETTINGS};';
const A = new Function(code)();

let pass = 0;
let fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    console.log('  x ' + name + '\n      actual:   ' + a + '\n      expected: ' + e);
  }
}

/* ---------- 假元素（够 applyShapeClass / readShapeClass 用） ----------
 * classList 做成真数组 + 三个方法：这样 Array.prototype.slice.call() 也成立，
 * 和真 DOM 的 classList 用法一致。 */
function fakeEl(classes) {
  const cl = (classes || []).slice();
  cl.add = function (c) { if (cl.indexOf(c) < 0) cl.push(c); };
  cl.remove = function (c) { const i = cl.indexOf(c); if (i >= 0) cl.splice(i, 1); };
  cl.contains = function (c) { return cl.indexOf(c) >= 0; };
  return { classList: cl };
}

/* ---------- 形状表 ---------- */
eq(A.SHAPES.length >= 20, true, '形状数量够多（实测 ' + A.SHAPES.length + ' 个）');

const keys = A.SHAPES.map(function (s) { return s.key; });
eq(new Set(keys).size, keys.length, '每个 key 只出现一次');
eq(keys.indexOf(''), -1, '没有空 key');

const groupKeys = A.GROUPS.map(function (g) { return g.key; });
eq(groupKeys, ['basic', 'flow'], '两段：基础几何 / 流程图，顺序稳定（改了会动菜单顺序）');

let maxLabel = 0;
A.SHAPES.forEach(function (s) {
  eq(typeof s.key === 'string' && s.key.length > 0, true, '有 key');
  eq(typeof s.cls === 'string' && s.cls.length > 0, true, '有 cls：' + s.key);
  eq(groupKeys.indexOf(s.group) >= 0, true, 'group 合法：' + s.key);
  eq(typeof s.label === 'string' && s.label.length > 0, true, '有 label：' + s.key);
  if (s.label.length > maxLabel) maxLabel = s.label.length;
  eq(A.SHAPE_BY_KEY[s.key] === s, true, 'SHAPE_BY_KEY 指回同一个对象：' + s.key);
  eq(/^[a-z][a-z0-9-]*$/.test(s.key), true, 'key 只用小写字母数字连字符：' + s.key);
  eq(/^[a-z][a-z0-9-]*$/.test(s.cls), true, 'cls 只用小写字母数字连字符：' + s.cls);
});
eq(maxLabel <= 8, true, '标签够短（最长 ' + maxLabel + ' 字）');
eq(/[，。：；]|说明|提示|注意/.test(JSON.stringify(A.SHAPES)), false, '形状表里没有解释性措辞');

// 编程逻辑示意图那一组必须齐（这是用户明确要的）
['terminator', 'process', 'decision', 'io', 'predefined', 'document', 'database'].forEach(function (k) {
  eq(A.SHAPES.some(function (s) { return s.key === k; }), true, '流程图标准符号：' + k);
});
eq(A.SHAPES.filter(function (s) { return s.group === 'flow'; }).length, 12,
   '流程图那组 12 个（起止符/处理/判断/输入输出/预定义/文档/数据库/手动输入/延时/注释/准备/连接点）');
eq(A.SHAPES.filter(function (s) { return s.group === 'basic'; }).length, 12, '基础几何那组 12 个');

// 别名：同一个 cls 可以被多个 key 复用（「处理」就是「直角矩形」）
const usedCls = {};
A.SHAPES.forEach(function (s) { usedCls[s.cls] = (usedCls[s.cls] || []).concat(s.key); });
eq(Object.keys(usedCls).length < A.SHAPES.length, true, '确实有别名（一个形状多套叫法）');
eq(usedCls.pill, ['pill', 'terminator'], '胶囊 = 起止符');
eq(usedCls.square, ['square', 'process'], '直角矩形 = 处理');
eq(usedCls.diamond, ['diamond', 'decision'], '菱形 = 判断');
eq(usedCls.pgram, ['parallelogram', 'io'], '平行四边形 = 输入输出');

/* ---------- 常量契约（稳定接口） ---------- */
eq(A.CLS_MARK, 'has-shape', '★ 有形状的标记类名（不带 shapes- 前缀，前缀就等于形状类）');
eq(A.CLS_PREFIX, 'shapes-', '★ 形状类名前缀');
eq(A.ITEM_PREFIX, 's:', '★ data.json 里的键前缀');
eq(A.CLEAR_LABEL, '清除形状', '清除那一项的名字');
eq(A.DEFAULT_SETTINGS.pad, 12, '默认内边距 12px');
eq(typeof A.DEFAULT_SETTINGS.perItem, 'object', '出厂设置里有 perItem 桶');

/* ---------- 数据键 ---------- */
eq(A.itemKey('abc'), 's:abc', '节点 id -> 数据键');
eq(A.isShapeKey('diamond'), true, '认得出的形状');
eq(A.isShapeKey('bogus'), false, '认不出的形状');
eq(A.isShapeKey(null), false, 'null 不算');
eq(A.isShapeKey(undefined), false, 'undefined 不算');

eq(A.shapesFromBucket(null, ['a']), {}, '没有桶 -> 空对象');
eq(A.shapesFromBucket({}, ['a']), {}, '空桶 -> 空对象');
eq(A.shapesFromBucket({ 's:a': 'diamond' }, ['a']), { a: 'diamond' }, '读出一条记录');
eq(A.shapesFromBucket({ 's:a': 'bogus' }, ['a']), {},
   '★ 记录里的值不认识就当没设过（绝不把乱值挂到 DOM 上）');
eq(A.shapesFromBucket({ 's:b': 'star' }, ['a']), {}, '只挑要查的节点');
eq(A.shapesFromBucket({ 's:a': 'star', 's:b': 'note' }, ['a', 'b']),
   { a: 'star', b: 'note' }, '多条一起读');

/* ---------- 挂类名 / 读类名 ---------- */
let el = fakeEl(['canvas-node', 'my-own-class']);
eq(A.applyShapeClass(el, 'diamond'), true, '挂形状成功');
eq(el.classList.indexOf(A.CLS_MARK) >= 0, true, '挂上了 has-shape 标记');
eq(el.classList.indexOf('shapes-diamond') >= 0, true, '挂上了 shapes-diamond');
eq(el.classList.indexOf('my-own-class') >= 0, true, '★ 用户自己的类名没被碰');
eq(el.classList.indexOf('canvas-node') >= 0, true, 'Obsidian 自己的类名没被碰');

A.applyShapeClass(el, 'star');
eq(el.classList.indexOf('shapes-diamond'), -1, '换形状时旧的清掉了');
eq(el.classList.indexOf('shapes-star') >= 0, true, '新形状挂上了');
eq(el.classList.filter(function (c) { return c.indexOf(A.CLS_PREFIX) === 0; }).length, 1,
   '★ 任何时候最多只有一个 shapes-* 形状类');

A.applyShapeClass(el, null);
eq(el.classList.indexOf(A.CLS_MARK), -1, '清除时标记也摘掉');
eq(el.classList.filter(function (c) { return c.indexOf(A.CLS_PREFIX) === 0; }).length, 0,
   '清除后一个形状类都不剩');
eq(el.classList.indexOf('my-own-class') >= 0, true, '清除时也不碰用户的类名');

A.applyShapeClass(el, 'not-a-shape');
eq(el.classList.filter(function (c) { return c.indexOf(A.CLS_PREFIX) === 0; }).length, 0,
   '不认识的 key 等价于清除（不会挂出半个形状）');
eq(A.applyShapeClass(null, 'diamond'), false, '传 null 元素不报错');
eq(A.applyShapeClass({}, 'diamond'), false, '没有 classList 也不报错');
eq(A.applyShapeClass(fakeEl([]), null), true, '空元素清除也返回 true');

eq(A.readShapeClass(fakeEl(['canvas-node'])), null, '没形状 -> null');
eq(A.readShapeClass(fakeEl(['has-shape'])), null, '只有标记 -> null（它不是形状）');
eq(A.readShapeClass(fakeEl(['shapes-diamond'])), 'diamond', '读得出菱形');
eq(A.readShapeClass(fakeEl(['shapes-pill'])), 'pill',
   '共用一个 cls 的别名返回表里靠前的那个 key（胶囊）');
eq(A.readShapeClass(null), null, 'null 元素 -> null');
eq(A.readShapeClass({}), null, '没有 classList -> null');
// 挂 -> 读 的往返
eq(A.readShapeClass(fakeEl(['shapes-octagon'])), 'octagon', '往返一致：八边形');

/* ---------- 样式守卫 ---------- */
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const cssNoComment = css.replace(/\/\*[\s\S]*?\*\//g, '');

// 注释里也不能出现 has 伪类的完整字面形式（构建脚本扫原文）
eq(/:has\s*\(/.test(css), false, 'styles.css 原文里（含注释）都不出现 has 伪类');

/* ★★ 本文件最重要的两条守卫 ★★

   ① 可见的卡片框是 .canvas-node-container；.canvas-node 是 Obsidian 用来定位
      的 0×0 锚点（position:absolute; width:0; height:0，宽高由 JS 内联写在它
      身上）。视觉属性一旦直接打在 .canvas-node 上，界面上不会有任何变化 ——
      整个插件静默失效。所以形状规则**只允许**声明 --shapes-* 变量。

   ② 裁剪族不能把 filter 和 clip-path 挂在同一个元素上。规范里
        "first any filter effect is applied, then any clipping, masking and
         opacity"       （Filter Effects Level 1 §2）
      同元素上 drop-shadow 会连同整个矩形一起被裁掉：阴影全没，只剩平面形状
      （用 Chrome 无头截图实测确认）。
      ⇒ filter 挂 container，clip-path 挂它里面的元素（::before / 正文 / 提示字）。
*/
function ruleFor(cls) {
  const m = cssNoComment.match(new RegExp(
    '\\.canvas-node\\.has-shape\\.shapes-' + cls + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : null;
}

// 裁剪族三处 :is(...) 类名清单（容器补偿 / 裁剪目标 / 选中提示），必须一字不差
const isLists = [];
const reIs = /\.canvas-node\.has-shape:is\(([^)]*)\)/g;
let isHit;
while ((isHit = reIs.exec(cssNoComment))) {
  isLists.push(isHit[1].split(',').map(function (s) {
    return s.trim().replace(/^\.shapes-/, '');
  }).join('|'));
}
const clipClasses = isLists.length ? isLists[0].split('|') : [];
eq(isLists.length >= 3, true, '裁剪族至少三处 :is() 清单（实测 ' + isLists.length + ' 处）');
eq(isLists.every(function (l) { return l === isLists[0]; }), true,
   '★ 三处 :is() 清单必须一字不差（漏一处就有形状半残）');
eq(clipClasses.length >= 8, true, '裁剪族形状够多（实测 ' + clipClasses.length + ' 个）');

// ③ 圆角族：容器消费 --shapes-radius
const contRule = cssNoComment.match(
  /\.canvas-node\.has-shape:not\(\.canvas-node-group\)\s*>\s*\.canvas-node-container\s*\{([^}]*)\}/);
const contBody = contRule ? contRule[1] : '';
eq(/border-radius\s*:\s*var\(--shapes-radius/.test(contBody), true,
   '★ 圆角族的圆角由容器消费 --shapes-radius');

// ④-a 裁剪族的容器规则
const clipContRule = cssNoComment.match(/:is\([^)]*\)\s*>\s*\.canvas-node-container\s*\{([^}]*)\}/);
const clipContBody = clipContRule ? clipContRule[1] : '';
eq(clipContBody !== '', true, '裁剪族有一条容器规则');
eq(/background-color\s*:\s*transparent/.test(clipContBody), true,
   '裁剪族的容器底色关掉（改由 ::before 画）');
eq(/border-color\s*:\s*transparent/.test(clipContBody), true,
   '★ 裁剪族去掉原生描边（描边画在矩形边上，裁完只剩浮在形状外的碎线）');
eq(/box-shadow\s*:\s*none/.test(clipContBody), true,
   '★ 裁剪族关掉 box-shadow（会被一起裁掉，只剩一个和形状无关的矩形框）');
eq(/filter\s*:\s*drop-shadow/.test(clipContBody), true, '★ 裁剪族的投影挂在 container 上');
eq(/clip-path/.test(clipContBody), false,
   '★★ container 自己绝不能被裁剪 —— 那样 drop-shadow 会被一起裁掉（实测：完全没有阴影）');

// ④-b / ④-c 裁剪目标与底色块
//   （三个选择器共用一条声明，所以下面查的是"选择器清单"而不是声明出现次数）
const clipUseIdx = cssNoComment.search(/clip-path\s*:\s*var\(--shapes-clip\)/);
const clipSel = clipUseIdx < 0 ? '' : cssNoComment.slice(
  cssNoComment.lastIndexOf('}', clipUseIdx) + 1,
  cssNoComment.lastIndexOf('{', clipUseIdx));
eq(clipSel !== '', true, '★ 裁剪族有 `clip-path: var(--shapes-clip)` 的公共规则');
eq(/::before/.test(clipSel), true, '★ 卡片底色块（::before）要按形状裁');
eq(/\.canvas-node-content/.test(clipSel), true, '★ 正文也要裁（不裁长文字会从形状的角上溢出去）');
eq(/\.canvas-node-placeholder/.test(clipSel), true, '★ 空卡片的提示字也要裁');
eq((cssNoComment.match(/clip-path/g) || []).length,
   (cssNoComment.match(/clip-path\s*:\s*var\(--shapes-clip\)/g) || []).length,
   '★ clip-path 值只走 --shapes-clip 一个入口（形状规则里不许再写 clip-path）');
eq(clipClasses.every(function (c) { return ruleFor(c) !== null; }), true,
   '裁剪族的每个形状都有自己的变量规则');
eq(/z-index\s*:\s*-1/.test(cssNoComment), true,
   '底色块 z-index: -1（压在正文下面；container 有 filter，是个层叠上下文，跑不出去）');
eq(/inset\s*:\s*0/.test(cssNoComment), true, '底色块铺满整张卡片');

// ★ 表 -> 样式：每个形状都必须有自己的规则，否则菜单里点了没反应（静默失败）
Object.keys(usedCls).forEach(function (cls) {
  const body = ruleFor(cls);
  eq(body !== null, true, '★ styles.css 里有这个形状的规则：shapes-' + cls);
  if (!body) return;
  const hasRadius = /--shapes-radius\s*:/.test(body);
  const hasClip = /--shapes-clip\s*:/.test(body);
  eq(hasRadius || hasClip, true, '形状至少声明一种做法（--shapes-radius 或 --shapes-clip）：' + cls);
  eq(hasRadius && hasClip, false, '★ 一个形状不能同时属于圆角族和裁剪族：' + cls);
  // ★ 形状规则里只许出现 --shapes-* 变量，不许出现任何视觉属性
  body.split(';').forEach(function (decl) {
    const prop = decl.split(':')[0].trim();
    if (!prop) return;
    eq(prop.indexOf('--shapes-') === 0, true,
       '★ 形状规则只能声明 --shapes-* 变量，不能写 `' + prop + '`（直接写会打不到可见的卡片框）：' + cls);
  });
  if (hasClip) {
    eq(/polygon\s*\(/.test(body), true, '裁剪用的是 polygon：' + cls);
    eq(clipClasses.indexOf(cls) >= 0, true, '★ 裁剪形状必须列进 :is() 清单：' + cls);
  } else {
    eq(clipClasses.indexOf(cls) < 0, true, '★ 圆角形状不该出现在 :is() 清单里：' + cls);
  }
});

// 预定义处理（子程序）的两条内竖线：必须用 background-image，不能动 box-shadow
const preBody = cssNoComment.match(
  /shapes-predefined\s*>\s*\.canvas-node-container\s*\{([^}]*)\}/);
eq(preBody !== null, true, '预定义处理有额外的容器规则（画两条内竖线）');
eq(preBody && /background-image\s*:/.test(preBody[1]), true,
   '★ 两条竖线用 background-image 画');
eq(preBody && /box-shadow\s*:/.test(preBody[1]), false,
   '★ 两条竖线不能用 box-shadow 画 —— 会把选中圈整条覆盖掉，选中就看不出来了');

// ★ 样式 -> 表：样式里不该有表里没有的形状（打错字/删剩的死规则）
const cssCls = {};
(cssNoComment.match(/\.canvas-node\.has-shape\.shapes-[a-z0-9-]+/g) || []).forEach(function (sel) {
  cssCls[sel.replace('.canvas-node.has-shape.shapes-', '')] = true;
});
Object.keys(cssCls).forEach(function (cls) {
  eq(usedCls[cls] !== undefined, true, '★ styles.css 里的 shapes-' + cls + ' 在形状表里有对应项');
});
eq(Object.keys(cssCls).length, Object.keys(usedCls).length, '两边形状数量一致');

// ★ 反向守卫：旧的错误写法（缺 has-shape / 缺 container）不该残留
eq(/\.canvas-node\.shapes-[a-z0-9-]+\s*\{/.test(cssNoComment), false,
   '★ 不该有 `.canvas-node.shapes-x {` 这种写法（0×0 锚点，挂了等于没挂）');
// 形状规则一律只声明变量，不往 container 上写视觉属性 —— 唯一的例外是
// shapes-predefined（它要给容器加两条内竖线），那条由下面的 preBody 专门守。
(cssNoComment.match(/\.canvas-node\.has-shape\.shapes-[a-z0-9-]+\s*>\s*\.canvas-node-container\s*\{/g) || [])
  .forEach(function (sel) {
    eq(sel.indexOf('shapes-predefined') >= 0, true,
       '★ 只有 shapes-predefined 允许额外往 container 上写东西，出现了：' + sel);
  });

/* ---------- 公共规则 ---------- */
eq(cssNoComment.indexOf(
     '.canvas-node.has-shape:not(.canvas-node-group) > .canvas-node-container > .canvas-node-content') >= 0,
   true, '有"文字内边距"那条公共规则（挂在标记类上，打到正文上）');
eq(cssNoComment.indexOf(':not(.canvas-node-group)') >= 0, true,
   '★ 公共规则排除了分组卡片（分组是装卡片的容器，裁成形状会把里面的卡片一起藏掉）');
eq(/box-sizing\s*:\s*border-box/.test(cssNoComment), true,
   '★ 正文必须 border-box（卡片正文是 content-box，直接加 padding 会撑出容器被裁掉）');
eq(/padding\s*:\s*var\(--shapes-pad-t,\s*var\(--shapes-pad-y,\s*var\(--shapes-pad\)\)\)\s+var\(--shapes-pad-x,\s*var\(--shapes-pad\)\)/.test(cssNoComment),
   true, '内边距默认跟随 --shapes-pad，形状可以按上下左右各自覆盖');
// ★ 垂直居中：核心样式里正文的高度链是完整的（.markdown-preview-view 也有
//   height:100%），所以**不用动布局链**，只要把"谁分剩余高度"反过来：
//   核心 sizer 是 flex:1 0 0（吃掉剩余高度 → 正文贴顶）、占位块被 max-height:16px
//   卡死。改这两条即可。（Chrome 无头 + DOM 探针实测：改完占位块上下各 56px、偏差 0）
const cssFlat = cssNoComment.replace(/\s+/g, ' ');
eq(/\.markdown-preview-sizer\s*\{[^}]*flex\s*:\s*0 0 auto/.test(cssNoComment), true,
   '★ 正文块不再抢剩余高度（核心是 flex:1 0 0，这才是"贴顶"的根因）');
eq(/\.markdown-preview-view::before/.test(cssNoComment) &&
   /max-height\s*:\s*none/.test(cssNoComment), true,
   '★ 放开 Obsidian 那两个 16px 限高的占位块，它们才能均分剩余空间');
eq(cssFlat.indexOf('> .canvas-node-content .markdown-preview-view::after { flex: 1 1 0; min-height: 0; max-height: none; }') >= 0,
   true, '占位块的 flex / min-height / max-height 三条齐全');

// ★ 不要动布局链：.canvas-node-content 底下还并排着编辑器和链接卡的 iframe
eq(/\.canvas-node-content\s*\{[^}]*display\s*:\s*flex/.test(cssNoComment), false,
   '★ 不给 .canvas-node-content 加 display:flex（链接卡 iframe、编辑态会受影响，且没用）');
eq(/\.markdown-embed-content\s*\{[^}]*display\s*:\s*flex/.test(cssNoComment), false,
   '★ 不给 .markdown-embed-content 加 display:flex（同上，实测多余）');

// ★ 绝对不用 justify-content：内容超高时它会把上半截顶出可视区且滚不到
eq(/justify-content/.test(cssNoComment), false,
   '★ 文件里不出现 justify-content（超高时会把开头顶出可视区，经典缺陷）');
eq(/--shapes-pad\s*:\s*12px/.test(cssNoComment), true, ':root 里有 --shapes-pad 的默认值');
eq(/^[^/]*:root\s*\{[^}]*--shapes-pad/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')) , true,
   '--shapes-pad 定义在 :root 里（插件再往 body 上覆盖）');
eq(/\s!important/.test(cssNoComment), false, '不用 !important（不跟用户的主题/片段打架）');

// 裁剪形状丢了 box-shadow，选中圈也就没了 -> 必须有替代的选中提示
const glowStart = cssNoComment.indexOf('.is-selected > .canvas-node-container');
const glowEnd = glowStart < 0 ? -1 : cssNoComment.indexOf('}', glowStart);
const glowBody = glowStart < 0 ? '' : cssNoComment.slice(glowStart, glowEnd);
eq(glowStart >= 0, true, '★ 裁剪形状要有选中提示规则（box-shadow 被裁掉后选中就看不出来了）');
eq(/drop-shadow\([^)]*var\(--color-accent\)/.test(glowBody), true,
   '★ 选中提示用 accent 色光晕，顺着形状走');
eq(cssNoComment.indexOf('.is-focused > .canvas-node-container') >= 0, true,
   '编辑态（is-focused）也有提示');

// 上下内边距按卡片高度算，宽高比变了文字也不会顶到形状边
eq(/var\(--canvas-node-height/.test(cssNoComment), true,
   '上下内边距用 --canvas-node-height（Obsidian 写在 .canvas-node 上）按比例算');
eq(/var\(--canvas-node-height,\s*\d+px\)/.test(cssNoComment), true,
   '★ --canvas-node-height 必须带兜底值（取不到时整条 padding 会失效）');

/* ---------- 整份加载（假 require）：类体里写错会在这里炸 ---------- */
const stub = function (id) {
  if (id === 'obsidian') {
    return {
      Plugin: function () {}, PluginSettingTab: function () {},
      Setting: function () {}, Notice: function () {}, Menu: function () {}
    };
  }
  throw new Error('unexpected require: ' + id);
};
const mod = { exports: {} };
new Function('require', 'module', 'exports', src)(stub, mod, {});
eq(typeof mod.exports, 'function', 'module.exports 是插件类');
eq(typeof mod.exports.__pure, 'object', '纯函数挂载成功（整份文件能解析）');
eq(mod.exports.__pure.SHAPES.length, A.SHAPES.length, '挂载出去的形状表就是那张表');

/* ---------- 接线守卫 ----------
 * 这些都是"改坏了不会报错、只会静默少功能"的类型，而且只能在真机上观察，
 * 所以在这里钉住源码里的关键痕迹。 */
eq(src.indexOf("on('canvas:node-menu'") >= 0, true, '挂了单张卡片的右键菜单');
eq(src.indexOf("on('canvas:selection-menu'") >= 0, true, '挂了多选的右键菜单');
eq(src.indexOf("on('layout-change'") >= 0, true,
   '★ 监听 layout-change —— 卡片 DOM 会重建，类名必须重挂');
eq(src.indexOf("on('active-leaf-change'") >= 0, true, '切标签也要重挂');
eq(src.indexOf('nodeEl') >= 0, true, '类名挂在 node.nodeEl 上（那是卡片的元素）');
eq(src.indexOf('readonly') >= 0, true, '只读白板要跳过');
eq(src.indexOf('setProperty') >= 0, true, '内边距走 CSS 变量，不写死进样式表');
eq(src.indexOf('saveSettings') >= 0, true, '形状记在插件数据里');

// 提交规则：不联网、不用 Node 内置模块、命令 id 不重复插件 id
eq(/fetch\s*\(|XMLHttpRequest|requestUrl/.test(src), false, '不联网');
eq(/eval\s*\(/.test(src), false, '不用 eval');
eq(/new Function/.test(src), false, '不用 new Function');
const requires = src.match(/require\(['"][^'"]+['"]\)/g) || [];
eq(requires, ["require('obsidian')"], '只 require obsidian，不用 Node 内置模块');
eq(src.indexOf("id: 'canvas-card-shapes") >= 0, false, '命令 id 不重复插件 id');
eq(src.indexOf("id: 'shape-'") >= 0, true, '命令 id 用 shape- 前缀');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
