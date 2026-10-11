const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 在隔离的模拟 DOM 中运行真实网页脚本；测试接口只注入测试副本，网页不暴露内部状态。
function loadGame() {
  const elements = new Map();
  function element(id) {
    const listeners = {};
    const classes = new Set(id === 'overlay' ? ['show'] : []);
    const context = new Proxy({}, { get: (target, key) => key in target ? target[key] : () => {} });
    return {
      id, width: id === 'board' ? 300 : 160, height: id === 'board' ? 600 : 110,
      textContent: '', innerHTML: '', dataset: {},
      classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
      getContext: () => context,
      addEventListener: (event, callback) => { listeners[event] = callback; },
      click: () => listeners.click?.(),
    };
  }
  const actions = ['left', 'right', 'rotate', 'down', 'drop', 'pause', 'restart'];
  const buttons = Object.fromEntries(actions.map(action => {
    const button = element(action); button.dataset.action = action; return [action, button];
  }));
  const documentListeners = {}, windowListeners = {};
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); },
    querySelectorAll(selector) { assert.equal(selector, '[data-action]'); return Object.values(buttons); },
    addEventListener: (event, callback) => { documentListeners[event] = callback; },
  };
  const window = { addEventListener: (event, callback) => { windowListeners[event] = callback; } };
  const sandbox = { document, window, requestAnimationFrame: () => 1, Math: Object.create(Math) };
  sandbox.Math.random = () => 0;
  const html = fs.readFileSync(path.join(__dirname, '../tetris/index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const probe = `globalThis.probe = {
    rotate, collide, emptyGrid, newPiece, softDrop, hardDrop, clearLines, spawn,
    state: () => ({ grid, cur, next, score, lines, level, dropInterval, running, paused, gameOver, dropCounter }),
    setGrid: value => { grid = value; }, setPiece: value => { cur = value; },
    setStats: value => { score = value.score; lines = value.lines; level = value.level; },
    setDropCounter: value => { dropCounter = value; }
  };`;
  assert.ok(script.includes('})();'), '找到真实游戏脚本的闭包结尾');
  vm.runInNewContext(script.replace('})();', probe + '\n})();'), sandbox);
  return {
    api: sandbox.probe, elements, buttons,
    start: () => elements.get('ovBtn').click(),
    key(key) { let prevented = false; documentListeners.keydown({ key, preventDefault() { prevented = true; } }); return prevented; },
    blur: () => windowListeners.blur(),
  };
}
const normal = value => JSON.parse(JSON.stringify(value));
const square = { type: 'O', shape: [[1, 1], [1, 1]], x: 4, y: 0 };

test('开始按钮初始化 20×10 棋盘、计分和下一块', () => {
  const game = loadGame(); game.start(); const s = game.api.state();
  assert.equal(s.grid.length, 20); assert.equal(s.grid[0].length, 10);
  assert.equal(s.running, true); assert.equal(s.score, 0); assert.equal(s.level, 1);
  assert.ok(s.cur && s.next); assert.equal(game.elements.get('overlay').classList.contains('show'), false);
});
test('连续四次旋转恢复原始方块', () => {
  const { api } = loadGame(); const initial = [[0,1,0],[1,1,1]]; let shape = initial;
  for (let i = 0; i < 4; i++) shape = api.rotate(shape);
  assert.deepEqual(normal(shape), initial);
});
test('碰撞检测识别左右边界、底部与已落下的方块', () => {
  const { api } = loadGame(); const grid = api.emptyGrid();
  for (const piece of [{...square,x:-1}, {...square,x:9}, {...square,y:19}]) assert.equal(api.collide(piece, grid), true);
  assert.equal(api.collide(square, grid), false); grid[0][4] = 'I'; assert.equal(api.collide(square, grid), true);
});
test('方向键移动不能穿过左墙', () => {
  const game = loadGame(); game.start(); game.api.setPiece({...square,x:0});
  assert.equal(game.key('ArrowLeft'), true); assert.equal(game.api.state().cur.x, 0);
  game.key('ArrowRight'); assert.equal(game.api.state().cur.x, 1);
});
test('下方向键使方块下落一格', () => {
  const game = loadGame(); game.start(); game.api.setPiece({...square});
  game.key('ArrowDown'); assert.equal(game.api.state().cur.y, 1);
});
test('空格直接落下、固定方块并生成下一块', () => {
  const game = loadGame(); game.start(); game.api.setPiece({...square}); game.api.setDropCounter(900);
  game.key(' '); const s = game.api.state();
  assert.equal(s.grid[19][4], 'O'); assert.equal(s.grid[18][5], 'O');
  assert.equal(s.cur.y, 0); assert.equal(s.dropCounter, 0);
});
test('消除一行增加 100 分并补充空行', () => {
  const game = loadGame(); game.start(); const grid = game.api.emptyGrid(); grid[19].fill('I');
  game.api.setGrid(grid); game.api.clearLines(); const s = game.api.state();
  assert.equal(s.lines, 1); assert.equal(s.score, 100); assert.equal(s.grid.length, 20);
  assert.equal(s.grid[0].every(cell => cell === null), true);
});
test('一次消除四行增加 800 分', () => {
  const game = loadGame(); game.start(); const grid = game.api.emptyGrid();
  for (let row = 16; row < 20; row++) grid[row].fill('I');
  game.api.setGrid(grid); game.api.clearLines(); assert.equal(game.api.state().score, 800); assert.equal(game.api.state().lines, 4);
});
test('不完整的行不会被消除或得分', () => {
  const game = loadGame(); game.start(); const grid = game.api.emptyGrid(); grid[19][0] = 'O';
  game.api.setGrid(grid); game.api.clearLines(); assert.equal(game.api.state().score, 0); assert.equal(game.api.state().grid[19][0], 'O');
});
test('累计十行提升等级并加快下落速度', () => {
  const game = loadGame(); game.start(); const grid = game.api.emptyGrid(); grid[19].fill('I');
  game.api.setGrid(grid); game.api.setStats({score:0,lines:9,level:1}); game.api.clearLines();
  assert.equal(game.api.state().level, 2); assert.equal(game.api.state().dropInterval, 920);
  assert.equal(Number(game.elements.get('lines').textContent), 10);
});
test('P 暂停后移动无效，再按 P 恢复', () => {
  const game = loadGame(); game.start(); const x = game.api.state().cur.x;
  game.key('p'); assert.equal(game.api.state().paused, true); game.key('ArrowLeft'); assert.equal(game.api.state().cur.x, x);
  game.key('P'); assert.equal(game.api.state().paused, false); assert.equal(game.elements.get('overlay').classList.contains('show'), false);
});
test('鼠标操作按钮支持移动、旋转、直接落下及暂停', () => {
  const game = loadGame(); game.start(); const x = game.api.state().cur.x;
  game.buttons.left.click(); assert.equal(game.api.state().cur.x, x-1);
  game.buttons.right.click(); assert.equal(game.api.state().cur.x, x);
  game.buttons.rotate.click(); assert.equal(game.api.state().cur.shape[0].length, 1);
  game.buttons.down.click(); assert.equal(game.api.state().cur.y, 1);
  game.buttons.drop.click(); assert.ok(game.api.state().grid.flat().some(Boolean));
  game.buttons.pause.click(); assert.equal(game.api.state().paused, true);
});
test('切换窗口会自动暂停，重复失焦不会恢复游戏', () => {
  const game = loadGame(); game.start(); game.blur(); assert.equal(game.api.state().paused, true);
  game.blur(); assert.equal(game.api.state().paused, true);
});
test('出生位置被占满时结束游戏，再玩一次恢复空棋盘', () => {
  const game = loadGame(); game.start(); const grid = game.api.emptyGrid(); grid[0].fill('O');
  game.api.setGrid(grid); game.api.spawn(); assert.equal(game.api.state().gameOver, true); assert.equal(game.api.state().running, false);
  assert.equal(game.elements.get('ovTitle').textContent, '游戏结束'); game.elements.get('ovBtn').click();
  assert.equal(game.api.state().gameOver, false); assert.equal(game.api.state().grid.flat().some(Boolean), false);
});
test('重新开始按钮清空计分、等级与暂停状态', () => {
  const game = loadGame(); game.start(); game.api.setStats({score:800,lines:12,level:2}); game.key('p');
  game.buttons.restart.click(); const s = game.api.state(); assert.equal(s.score, 0); assert.equal(s.lines, 0); assert.equal(s.level, 1); assert.equal(s.paused, false);
});
