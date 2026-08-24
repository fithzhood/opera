/* Opera — gioco. Le trasformazioni vere stanno in opera-core.js;
   qui c'e' solo il disegno, l'animazione e la partita. */
(function () {
  'use strict';

  var C = OperaCore;
  var LEVELS = OPERA_LEVELS;
  var $ = function (id) { return document.getElementById(id); };

  /* ================= memoria ================= */

  var KEY = 'opera.v1';
  function loadStore() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function saveStore() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  }
  var store = loadStore();
  if (!store.best) store.best = {};

  /* ================= stato della partita ================= */

  var S = {
    idx: 0,
    level: null,
    cells: [],
    history: [],
    moves: 0,
    busy: false,
    hintIdx: -1,
    ghost: null
  };

  /* ================= icone ================= */

  function f(n) { return Math.round(n * 100) / 100; }
  function pol(cx, cy, r, a) {
    var t = a * Math.PI / 180;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  }
  /* arco in senso orario da a0 ad a1 (gradi, y verso il basso) */
  function arcPath(cx, cy, r, a0, a1) {
    var p0 = pol(cx, cy, r, a0), p1 = pol(cx, cy, r, a1);
    var large = (a1 - a0) > 180 ? 1 : 0;
    return 'M' + f(p0[0]) + ' ' + f(p0[1]) +
           'A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + f(p1[0]) + ' ' + f(p1[1]);
  }
  /* punta di freccia a "V", tangente all'arco nel punto ad angolo a */
  function arcHead(cx, cy, r, a, size) {
    var p = pol(cx, cy, r, a);
    var t = (a + 90) * Math.PI / 180;
    var ux = Math.cos(t), uy = Math.sin(t);
    var nx = -uy, ny = ux;
    var b1 = [p[0] - ux * size + nx * size * .8, p[1] - uy * size + ny * size * .8];
    var b2 = [p[0] - ux * size - nx * size * .8, p[1] - uy * size - ny * size * .8];
    return 'M' + f(b1[0]) + ' ' + f(b1[1]) + 'L' + f(p[0]) + ' ' + f(p[1]) + 'L' + f(b2[0]) + ' ' + f(b2[1]);
  }
  function svg(inner) {
    return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + inner + '</svg>';
  }

  /* traslazione: tante punte quante sono le caselle di spostamento */
  function iconMove(dx, dy) {
    var ang = Math.atan2(dy, dx) * 180 / Math.PI;
    var n = Math.max(Math.abs(dx), Math.abs(dy));
    var xs = n === 1 ? [50] : n === 2 ? [38, 63] : [27, 50, 73];
    var d = xs.map(function (cx) {
      return 'M' + (cx - 11) + ' 31L' + (cx + 9) + ' 50L' + (cx - 11) + ' 69';
    }).join(' ');
    return svg('<g transform="rotate(' + f(ang) + ' 50 50)">' +
      '<path class="glyph" d="' + d + '" stroke-width="10"/></g>');
  }

  /* rotazione: freccia curva; mezzo giro = due punte opposte */
  function iconRot(d) {
    var r = 28, inner;
    if (d === 180) {
      inner = '<path class="glyph" d="' + arcPath(50, 50, r, 20, 150) + '" stroke-width="9"/>' +
              '<path class="glyph" d="' + arcHead(50, 50, r, 150, 13) + '" stroke-width="9"/>' +
              '<path class="glyph" d="' + arcPath(50, 50, r, 200, 330) + '" stroke-width="9"/>' +
              '<path class="glyph" d="' + arcHead(50, 50, r, 330, 13) + '" stroke-width="9"/>';
      return svg(inner);
    }
    inner = '<path class="glyph" d="' + arcPath(50, 50, r, 125, 390) + '" stroke-width="9"/>' +
            '<path class="glyph" d="' + arcHead(50, 50, r, 390, 14) + '" stroke-width="9"/>';
    /* antiorario: stessa figura ribaltata */
    if (d === -90) return svg('<g transform="translate(100,0) scale(-1,1)">' + inner + '</g>');
    return svg(inner);
  }

  var AXIS_ANGLE = { h: 0, v: 90, d1: 45, d2: -45 };

  /* simmetria: asse tratteggiato con due cunei che lo puntano */
  function iconMirror(a) {
    var ang = AXIS_ANGLE[a];
    var inner =
      '<path class="glyph" d="M6 50H94" stroke-width="6" stroke-dasharray="10 9"/>' +
      '<path class="glyph-f" d="M33 20H67L50 39Z"/>' +
      '<path class="glyph-f" d="M33 80H67L50 61Z"/>';
    return svg('<g transform="rotate(' + ang + ' 50 50)">' + inner + '</g>');
  }

  function iconFor(op) {
    if (op.k === 'm') return iconMove(op.dx, op.dy);
    if (op.k === 'r') return iconRot(op.d);
    return iconMirror(op.a);
  }

  function describe(op) {
    if (op.k === 'm') {
      var n = Math.max(Math.abs(op.dx), Math.abs(op.dy));
      var dir = op.dx && op.dy
        ? (op.dy < 0 ? 'in alto ' : 'in basso ') + (op.dx > 0 ? 'a destra' : 'a sinistra')
        : op.dx > 0 ? 'a destra' : op.dx < 0 ? 'a sinistra' : op.dy > 0 ? 'in basso' : 'in alto';
      return 'sposta di ' + n + (n === 1 ? ' casella ' : ' caselle ') + dir;
    }
    if (op.k === 'r') {
      return op.d === 180 ? 'gira di mezzo giro'
           : 'gira di un quarto di giro ' + (op.d === 90 ? 'in senso orario' : 'in senso antiorario');
    }
    return 'ribalta rispetto all’asse ' +
      { v: 'verticale', h: 'orizzontale', d1: 'obliquo “\\”', d2: 'obliquo “/”' }[op.a];
  }

  /* ================= disegno ================= */

  function cellPx() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell'));
  }

  function ringsPath(rings, cell) {
    return rings.map(function (r) {
      return 'M' + r.map(function (p) { return f(p[0] * cell) + ' ' + f(p[1] * cell); }).join('L') + 'Z';
    }).join(' ');
  }

  function seamsPath(cells, cell) {
    var has = Object.create(null), out = [];
    cells.forEach(function (c) { has[c[0] + ',' + c[1]] = true; });
    cells.forEach(function (c) {
      if (has[(c[0] + 1) + ',' + c[1]])
        out.push('M' + f((c[0] + 1) * cell) + ' ' + f(c[1] * cell) + 'V' + f((c[1] + 1) * cell));
      if (has[c[0] + ',' + (c[1] + 1)])
        out.push('M' + f(c[0] * cell) + ' ' + f((c[1] + 1) * cell) + 'H' + f((c[0] + 1) * cell));
    });
    return out.join(' ');
  }

  function boardSize() {
    var cell = cellPx();
    return [S.level.cols * cell, S.level.rows * cell, cell];
  }

  function drawFigure() {
    var b = boardSize(), w = b[0], h = b[1], cell = b[2];
    var d = ringsPath(C.outline(S.cells), cell);
    $('figure').innerHTML =
      '<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">' +
        '<path class="fig-body" d="' + d + '"/>' +
        '<path class="fig-seam" d="' + seamsPath(S.cells, cell) + '" fill="none"/>' +
        '<path class="fig-edge" d="' + d + '"/>' +
      '</svg>';
  }

  function drawMarks() {
    var b = boardSize(), w = b[0], h = b[1], cell = b[2];
    var parts = '<path class="target-edge" d="' + ringsPath(C.outline(S.level.target), cell) + '"/>';
    if (S.ghost) {
      if (S.ghost.axis !== undefined) {
        var ang = AXIS_ANGLE[S.ghost.axis] * Math.PI / 180;
        var cx = (S.ghost.pivot[0] + .5) * cell, cy = (S.ghost.pivot[1] + .5) * cell;
        var L = (w + h);
        parts += '<line class="target-edge" x1="' + f(cx - Math.cos(ang) * L) + '" y1="' + f(cy - Math.sin(ang) * L) +
                 '" x2="' + f(cx + Math.cos(ang) * L) + '" y2="' + f(cy + Math.sin(ang) * L) + '"/>';
      }
      if (S.ghost.pivot && S.ghost.axis === undefined && S.ghost.spin)
        parts += '<circle class="pivot-dot" cx="' + f((S.ghost.pivot[0] + .5) * cell) +
                 '" cy="' + f((S.ghost.pivot[1] + .5) * cell) + '" r="4"/>';
      parts += '<path class="ghost-edge" d="' + ringsPath(C.outline(S.ghost.cells), cell) + '"/>';
    }
    $('marks').innerHTML =
      '<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">' + parts + '</svg>';
  }

  function buildCells() {
    var lv = S.level, html = '';
    var walls = C.wallSet(lv), tgt = Object.create(null);
    lv.target.forEach(function (c) { tgt[c[0] + ',' + c[1]] = true; });
    for (var y = 0; y < lv.rows; y++) for (var x = 0; x < lv.cols; x++) {
      var cls = 'cell';
      if (x === lv.cols - 1) cls += ' edge-r';
      if (y === lv.rows - 1) cls += ' edge-b';
      if (tgt[x + ',' + y]) cls += ' target';
      if (walls[x + ',' + y]) cls += ' wall';
      html += '<div class="' + cls + '"></div>';
    }
    $('cells').innerHTML = html;
  }

  function buildControls() {
    var lv = S.level, html = '';
    var byCell = Object.create(null);
    lv.buttons.forEach(function (b, i) { byCell[b.x + ',' + b.y] = i; });
    for (var y = 0; y < lv.rows; y++) for (var x = 0; x < lv.cols; x++) {
      var i = byCell[x + ',' + y];
      if (i === undefined) { html += '<div class="ctrl"></div>'; continue; }
      var op = lv.buttons[i].op;
      html += '<button class="ctrl op" data-i="' + i + '" title="' + describe(op) + '">' + iconFor(op) + '</button>';
    }
    $('controls').innerHTML = html;
  }

  function updateControls() {
    var lv = S.level;
    var legal = Object.create(null);
    C.moves(S.cells, lv).forEach(function (m) { legal[m.index] = m.legal; });
    var nodes = $('controls').querySelectorAll('.ctrl.op');
    for (var k = 0; k < nodes.length; k++) {
      var n = nodes[k], i = +n.dataset.i;
      n.classList.toggle('live', legal[i] === true);
      n.classList.toggle('blocked', legal[i] === false);
      n.classList.toggle('hinted', i === S.hintIdx);
    }
  }

  /* ================= impaginazione ================= */

  /* Col telefono coricato il nome del quadro e il suggerimento si spostano nella
     colonna di lato, cosi' l'altezza resta tutta al quadro. */
  function placeChrome(rail) {
    var name = $('levelName'), hint = $('hint'), top = $('top'), stage = $('stage'), tools = $('tools');
    if (rail) {
      if (name.parentNode !== top) top.appendChild(name);
      if (hint.parentNode !== tools) tools.appendChild(hint);
    } else {
      if (name.parentNode !== stage) stage.insertBefore(name, stage.firstChild);
      if (hint.parentNode !== stage) stage.appendChild(hint);
    }
  }

  /* Il lato della cella non si indovina con numeri fissi: si rimpicciolisce il
     quadro a nulla, si misura lo spazio che resta davvero, e si ricalcola. */
  function layout() {
    if (!S.level) return;
    var lv = S.level, root = document.documentElement.style;
    root.setProperty('--cols', lv.cols);
    root.setProperty('--rows', lv.rows);

    placeChrome(window.matchMedia('(orientation: landscape) and (max-height: 620px)').matches);

    root.setProperty('--cell', '1px');
    var stage = $('stage'), box = stage.getBoundingClientRect();
    var used = 0, kids = stage.children;
    for (var i = 0; i < kids.length; i++)
      if (kids[i].id !== 'boardWrap') used += kids[i].getBoundingClientRect().height;
    var gaps = (kids.length - 1) * (parseFloat(getComputedStyle(stage).rowGap) || 0);

    var availW = box.width - 4;
    var availH = box.height - used - gaps - 4;
    var cell = Math.floor(Math.min(availW / lv.cols, availH / lv.rows));
    cell = Math.max(22, Math.min(88, cell));
    root.setProperty('--cell', cell + 'px');
  }

  function render() {
    drawFigure();
    drawMarks();
    updateControls();
    $('moveCount').textContent = S.moves;
    $('parVal').textContent = S.level.par;
    $('levNum').textContent = S.level.n;
    $('btnUndo').disabled = S.history.length === 0 || S.busy;
    $('btnReset').disabled = S.moves === 0 || S.busy;
    $('moveCount').parentNode.classList.toggle('perfect', S.moves > 0 && S.moves <= S.level.par);
  }

  /* ================= animazione ================= */

  function tween(node, transform, ms) {
    return new Promise(function (res) {
      node.style.transition = 'transform ' + ms + 'ms cubic-bezier(.34,.05,.2,1)';
      void node.offsetWidth;
      node.style.transform = transform;
      setTimeout(res, ms + 15);
    });
  }

  /* La trasformazione finale che l'animazione deve raggiungere, in coordinate
     CSS e con il perno come origine. Tenuta separata perche' e' il punto in cui
     un asse o un verso sbagliati non si vedrebbero fino a partita in corso. */
  function transformFor(op, cell) {
    if (op.k === 'm') return 'translate(' + f(op.dx * cell) + 'px,' + f(op.dy * cell) + 'px)';
    if (op.k === 'r') return 'rotate(' + op.d + 'deg)';
    var A = AXIS_ANGLE[op.a];
    return 'rotate(' + A + 'deg) scaleY(-1) rotate(' + (-A) + 'deg)';
  }

  function animateMove(b, op) {
    var fig = $('figure'), cell = cellPx();
    fig.style.transformOrigin = ((b.x + .5) * cell) + 'px ' + ((b.y + .5) * cell) + 'px';

    if (op.k === 'm') {
      /* passo per passo: si vede di quante caselle si sposta */
      var steps = Math.max(Math.abs(op.dx), Math.abs(op.dy));
      var sx = op.dx / steps, sy = op.dy / steps;
      var chain = Promise.resolve();
      for (var i = 1; i <= steps; i++) (function (k) {
        chain = chain.then(function () {
          return tween(fig, 'translate(' + f(sx * k * cell) + 'px,' + f(sy * k * cell) + 'px)', 135);
        });
      })(i);
      return chain;
    }

    if (op.k === 'r') {
      return tween(fig, transformFor(op, cell), op.d === 180 ? 520 : 380);
    }

    /* il ribaltamento parte dalla stessa forma con scaleY(1): cosi' il passaggio
       da 1 a -1 si interpola schiacciando la figura, che e' l'aria del gesto */
    var A = AXIS_ANGLE[op.a];
    fig.style.transition = 'none';
    fig.style.transform = 'rotate(' + A + 'deg) scaleY(1) rotate(' + (-A) + 'deg)';
    void fig.offsetWidth;
    return tween(fig, transformFor(op, cell), 460);
  }

  function shake() {
    var l = $('figureLayer');
    l.classList.remove('shake');
    void l.offsetWidth;
    l.classList.add('shake');
    setTimeout(function () { l.classList.remove('shake'); }, 320);
  }

  /* ================= partita ================= */

  function press(i) {
    if (S.busy) return;
    var lv = S.level, b = lv.buttons[i];
    if (!C.covers(S.cells, b.x, b.y)) return;
    var res = C.apply(S.cells, [b.x, b.y], b.op);
    if (!C.isLegal(res, lv)) {
      shake();
      say('Quella mossa porterebbe la figura fuori dal quadro.');
      return;
    }
    S.busy = true;
    S.hintIdx = -1;
    S.ghost = null;
    drawMarks();
    updateControls();

    animateMove(b, b.op).then(function () {
      var fig = $('figure');
      fig.style.transition = 'none';
      fig.style.transform = 'none';
      S.history.push(S.cells);
      S.cells = res;
      S.moves++;
      render();
      void fig.offsetWidth;
      S.busy = false;
      afterMove();
    });
  }

  function afterMove() {
    if (C.solved(S.cells, S.level)) { win(); return; }
    var path = C.solve(S.level, S.cells);
    if (path === null) say('Da questa posizione la sagoma non è più raggiungibile: annulla o ricomincia.');
    else say(S.level.hint || '');
  }

  function say(t) { $('hint').textContent = t || ''; }

  function win() {
    $('figure').classList.add('won');
    var id = S.level.id, prev = store.best[id];
    if (prev === undefined || S.moves < prev) { store.best[id] = S.moves; saveStore(); }
    var perfect = S.moves === S.level.par;
    setTimeout(function () {
      $('winTitle').textContent = perfect ? 'Perfetto' : 'Risolto';
      $('winLine').textContent = perfect
        ? 'Hai chiuso il quadro nel minimo possibile: ' + S.moves + ' mosse.'
        : 'Risolto in ' + S.moves + ' mosse. Il minimo è ' + S.level.par + '.';
      $('btnNext').textContent = S.idx < LEVELS.length - 1 ? 'Quadro seguente' : 'Torna ai quadri';
      open$('win');
    }, 620);
  }

  function loadLevel(i) {
    S.idx = Math.max(0, Math.min(LEVELS.length - 1, i));
    S.level = LEVELS[S.idx];
    S.cells = S.level.shape.slice();
    S.history = [];
    S.moves = 0;
    S.busy = false;
    S.hintIdx = -1;
    S.ghost = null;
    store.last = S.idx; saveStore();
    $('figure').classList.remove('won');
    $('figure').style.transition = 'none';
    $('figure').style.transform = 'none';
    $('levelName').textContent = S.level.name;
    layout();
    buildCells();
    buildControls();
    render();
    say(S.level.hint || '');
  }

  function undo() {
    if (S.busy || !S.history.length) return;
    S.cells = S.history.pop();
    S.moves = Math.max(0, S.moves - 1);
    S.hintIdx = -1;
    $('figure').classList.remove('won');
    render();
    say(S.level.hint || '');
  }

  function reset() {
    if (S.busy) return;
    S.cells = S.level.shape.slice();
    S.history = [];
    S.moves = 0;
    S.hintIdx = -1;
    $('figure').classList.remove('won');
    render();
    say(S.level.hint || '');
  }

  function hint() {
    if (S.busy) return;
    var path = C.solve(S.level, S.cells);
    if (path === null) { say('Da questa posizione la sagoma non è più raggiungibile: annulla o ricomincia.'); return; }
    if (!path.length) { say('Ci sei già.'); return; }
    S.hintIdx = path[0];
    updateControls();
    say('Da qui bastano ' + path.length + (path.length === 1 ? ' mossa' : ' mosse') +
        '. Il pulsante cerchiato è una mossa giusta.');
  }

  /* ================= anteprima al passaggio del mouse ================= */

  function showGhost(i) {
    if (S.busy || !store.preview) return;
    var b = S.level.buttons[i];
    if (!C.covers(S.cells, b.x, b.y)) return;
    var res = C.apply(S.cells, [b.x, b.y], b.op);
    if (!C.isLegal(res, S.level)) return;
    S.ghost = { cells: res, pivot: [b.x, b.y] };
    if (b.op.k === 'x') S.ghost.axis = b.op.a;
    else if (b.op.k === 'r') S.ghost.spin = true;
    drawMarks();
  }
  function clearGhost() {
    if (!S.ghost) return;
    S.ghost = null;
    drawMarks();
  }

  /* ================= pannelli ================= */

  function open$(id) { $(id).classList.add('open'); }
  function close$(id) { $(id).classList.remove('open'); }

  function buildPicker() {
    var html = '';
    for (var i = 0; i < LEVELS.length; i++) {
      var lv = LEVELS[i], best = store.best[lv.id];
      var cls = 'lv';
      if (i === S.idx) cls += ' current';
      if (best !== undefined) cls += best <= lv.par ? ' done perfect' : ' done';
      var st = best === undefined ? 'minimo ' + lv.par : best + ' / ' + lv.par + (best <= lv.par ? '  ✦' : '  ✓');
      html += '<button class="' + cls + '" data-lv="' + i + '">' +
                '<span class="num">' + lv.n + '</span>' +
                '<span class="nm">' + lv.name + '</span>' +
                '<span class="st">' + st + '</span>' +
              '</button>';
    }
    $('pickerGrid').innerHTML = html;
  }

  /* ================= avvio ================= */

  function init() {
    var hasHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
    store.preview = store.preview !== false;
    $('btnPreview').classList.toggle('on', store.preview);
    if (!hasHover) $('btnPreview').hidden = true;   /* col dito non c'e' passaggio del mouse */

    $('controls').addEventListener('click', function (e) {
      var b = e.target.closest('.ctrl.op');
      if (b) press(+b.dataset.i);
    });
    $('controls').addEventListener('mouseover', function (e) {
      var b = e.target.closest('.ctrl.op');
      if (b) showGhost(+b.dataset.i);
    });
    $('controls').addEventListener('mouseout', function (e) {
      if (e.target.closest('.ctrl.op')) clearGhost();
    });

    $('btnUndo').onclick = undo;
    $('btnReset').onclick = reset;
    $('btnHint').onclick = hint;
    $('btnPreview').onclick = function () {
      store.preview = !store.preview;
      saveStore();
      $('btnPreview').classList.toggle('on', store.preview);
      if (!store.preview) clearGhost();
    };

    $('btnLevels').onclick = function () { buildPicker(); open$('picker'); };
    $('btnClosePicker').onclick = function () { close$('picker'); };
    $('picker').addEventListener('click', function (e) {
      if (e.target === $('picker')) return close$('picker');
      var b = e.target.closest('.lv');
      if (b) { close$('picker'); loadLevel(+b.dataset.lv); }
    });
    $('btnWipe').onclick = function () {
      if (!confirm('Cancello tutti i risultati salvati?')) return;
      store = { best: {}, preview: store.preview };
      saveStore(); buildPicker();
    };

    $('btnAgain').onclick = function () { close$('win'); reset(); };
    $('btnNext').onclick = function () {
      close$('win');
      if (S.idx < LEVELS.length - 1) loadLevel(S.idx + 1);
      else { buildPicker(); open$('picker'); }
    };
    $('btnRules').onclick = function () { open$('howto'); };
    $('btnCloseHowto').onclick = function () {
      close$('howto');
      store.seenHowto = true; saveStore();
    };

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && $('win').classList.contains('open')) { $('btnNext').click(); return; }
      if (e.key === 'Escape') {
        if ($('howto').classList.contains('open')) return $('btnCloseHowto').click();
        if ($('win').classList.contains('open')) return;
        $('picker').classList.contains('open') ? close$('picker') : $('btnLevels').click();
      }
      if (e.target.tagName === 'INPUT') return;
      var k = e.key.toLowerCase();
      if (k === 'z') undo();
      if (k === 'r') reset();
      if (k === 'h') hint();
    });

    var relayout = function () { layout(); render(); };
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', function () { setTimeout(relayout, 120); });

    setupNative();
    loadLevel(typeof store.last === 'number' ? store.last : 0);
    if (!store.seenHowto) open$('howto');
  }

  /* ================= dentro l'APK ================= */

  function isCapacitorNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  function setupNative() {
    if (!isCapacitorNative()) return;
    document.body.classList.add('capacitor');
    var App = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (!App || !App.addListener) return;
    /* il tasto indietro chiude quello che e' aperto invece di uscire dall'app */
    App.addListener('backButton', function () {
      if ($('howto').classList.contains('open')) return close$('howto');
      if ($('win').classList.contains('open')) return close$('win');
      if ($('picker').classList.contains('open')) return close$('picker');
      if (S.history.length) return reset();
      App.exitApp();
    });
  }

  window.__opera = { transformFor: transformFor, AXIS_ANGLE: AXIS_ANGLE, state: S, press: press };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
