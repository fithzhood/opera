/* Opera — gioco. Le trasformazioni vere stanno in opera-core.js;
   qui c'e' solo il disegno, l'animazione e la partita. */
(function () {
  'use strict';

  var C = OperaCore;
  var LEVELS = OPERA_LEVELS;
  var ACTS = OPERA_ACTS;
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
    future: [],
    moves: 0,
    busy: false,
    hintIdx: -1,
    ghost: null,
    inMenu: true
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

  /* Un solo tracciato con un rettangolo per cella. Serve che sia UNO: cosi' il
     disegnatore lo riempie come una figura sola e fra caselle vicine non resta
     nessun filo chiaro, nemmeno mentre la figura ruota. Il contorno unito non
     va bene qui, perche' i quadretti verdi possono toccarsi solo d'angolo e il
     tracciamento degli anelli si romperebbe. */
  function cellsPath(cells, cell) {
    var out = '', i, x, y;
    for (i = 0; i < cells.length; i++) {
      x = f(cells[i][0] * cell); y = f(cells[i][1] * cell);
      out += 'M' + x + ' ' + y + 'h' + f(cell) + 'v' + f(cell) + 'h' + f(-cell) + 'Z';
    }
    return out;
  }

  /* La figura e' rossa mentre la si muove e diventa verde solo quando e' tutta
     dentro la sagoma: il verde vale "a posto", non "a meta' strada". Il colore
     lo decide la classe .won sul contenitore, che sopravvive al ridisegno. */
  function drawFigure() {
    var b = boardSize(), w = b[0], h = b[1], cell = b[2];
    $('figure').innerHTML =
      '<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">' +
        '<path class="fig-body" d="' + cellsPath(S.cells, cell) + '"/>' +
        '<path class="fig-seam" d="' + seamsPath(S.cells, cell) + '" fill="none"/>' +
        '<path class="fig-edge" d="' + ringsPath(C.outline(S.cells), cell) + '"/>' +
      '</svg>';
  }

  function drawMarks() {
    var b = boardSize(), w = b[0], h = b[1], cell = b[2];
    var dt = ringsPath(C.outline(S.level.target), cell);
    /* due passate: un alone chiaro sotto e le trattine scure sopra. Senza alone
       il tratteggio sparisce dove la figura e' gia' appoggiata sulla sagoma. */
    var parts = '<path class="target-halo" d="' + dt + '"/>' +
                '<path class="target-edge" d="' + dt + '"/>';
    if (S.ghost) {
      if (S.ghost.axis !== undefined) {
        var ang = AXIS_ANGLE[S.ghost.axis] * Math.PI / 180;
        var cx = (S.ghost.pivot[0] + .5) * cell, cy = (S.ghost.pivot[1] + .5) * cell;
        var L = (w + h);
        var x1 = f(cx - Math.cos(ang) * L), y1 = f(cy - Math.sin(ang) * L);
        var x2 = f(cx + Math.cos(ang) * L), y2 = f(cy + Math.sin(ang) * L);
        parts += '<line class="target-halo" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>' +
                 '<line class="target-edge" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>';
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
    if (!S.level || S.inMenu) return;   /* nascosto: la misura darebbe zero */
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
    $('btnRedo').disabled = S.future.length === 0 || S.busy;
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
  function transformFor(op, cell, verso) {
    if (op.k === 'm') return 'translate(' + f(op.dx * cell) + 'px,' + f(op.dy * cell) + 'px)';
    /* il mezzo giro si puo' fare da una parte o dall'altra: se un muro ne chiude
       una, l'animazione deve girare dall'altra, se no si vede passare nel muro */
    if (op.k === 'r') return 'rotate(' + (op.d === 180 ? 180 * (verso || 1) : op.d) + 'deg)';
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
      var verso = op.d === 180 ? (C.spin(S.cells, [b.x, b.y], op, S.level) || 1) : 1;
      return tween(fig, transformFor(op, cell, verso), op.d === 180 ? 520 : 380);
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
      say('Quella mossa porterebbe la figura fuori dal quadro, o su un muro.');
      return;
    }
    if (!C.pathClear(S.cells, [b.x, b.y], b.op, lv)) {
      shake();
      say('Un muro le taglia la strada: da lì non ci passa, e non ci gira nemmeno attraverso.');
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
      S.future.length = 0;      /* una mossa nuova cancella il filo del rifai */
      S.cells = res;
      S.moves++;
      /* il flag va spento PRIMA di ridisegnare: render() decide da qui se
         annulla e ricomincia sono attivi, e nessuno lo richiama dopo */
      S.busy = false;
      render();
      void fig.offsetWidth;
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
    var lv = S.level, prima = store.best[lv.id];
    var stellePrima = prima === undefined ? 0 : stellePer(prima, lv.par);
    var record = prima === undefined || S.moves < prima;
    if (record) { store.best[lv.id] = S.moves; saveStore(); }
    var n = stellePer(Math.min(S.moves, prima === undefined ? S.moves : prima), lv.par);
    var guadagnate = n - stellePrima;

    setTimeout(function () {
      $('winTitle').innerHTML = (S.moves === lv.par ? 'Perfetto ' : 'Risolto ') + stelleHtml(n);
      var riga = S.moves === lv.par
        ? 'Chiuso nel minimo possibile: ' + S.moves + ' mosse.'
        : 'Chiuso in ' + S.moves + ' mosse. Il minimo è ' + lv.par + '.';
      if (guadagnate > 0)
        riga += ' Hai guadagnato ' + (guadagnate === 1 ? 'una stella' : guadagnate + ' stelle') +
                ': ora ne hai ' + stelleTotali() + '.';
      else if (!record && prima !== undefined)
        riga += ' Il tuo record resta ' + prima + '.';
      $('winLine').textContent = riga;

      var seguente = S.idx + 1;
      var puoi = seguente < LEVELS.length && aperto(seguente);
      $('btnNext').textContent = puoi ? 'Quadro seguente' : 'Ai quadri';
      $('btnNext').dataset.vai = puoi ? seguente : -1;
      open$('win');
    }, 620);
  }

  function loadLevel(i) {
    S.idx = Math.max(0, Math.min(LEVELS.length - 1, i));
    S.level = LEVELS[S.idx];
    S.cells = S.level.shape.slice();
    S.history = [];
    S.future = [];
    S.moves = 0;
    S.busy = false;
    S.hintIdx = -1;
    S.ghost = null;
    hideMenu();
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
    S.future.push(S.cells);
    S.cells = S.history.pop();
    S.moves = Math.max(0, S.moves - 1);
    S.hintIdx = -1;
    $('figure').classList.remove('won');
    render();
    say(S.level.hint || '');
  }

  function redo() {
    if (S.busy || !S.future.length) return;
    S.history.push(S.cells);
    S.cells = S.future.pop();
    S.moves++;
    S.hintIdx = -1;
    render();
    afterMove();
  }

  function reset() {
    if (S.busy) return;
    S.cells = S.level.shape.slice();
    S.history = [];
    S.future = [];
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

  /* ================= stelle e apertura dei quadri ================= */

  /* Ogni quadro chiuso vale da una a tre stelle. Per entrare in un quadro serve
     un totale di stelle, non l'aver chiuso quello prima: cosi' un quadro che
     non viene non blocca la strada. La soglia cresce piu' piano dei quadri
     (tre quarti), quindi chi raccoglie anche una sola stella per quadro va
     sempre avanti, e chi ne prende tre puo' saltare avanti parecchio. */
  var SOGLIA = 0.75;

  function risolto(i) { return store.best[LEVELS[i].id] !== undefined; }

  /* Tre stelle nel minimo di mosse, due entro il doppio del minimo, una
     comunque: la fascia cresce col quadro senza bisogno di correzioni. */
  function stellePer(n, par) {
    return n <= par ? 3 : n <= par * 2 ? 2 : 1;
  }

  function stelleDi(i) {
    var lv = LEVELS[i], best = store.best[lv.id];
    if (best === undefined) return 0;
    return stellePer(best, lv.par);
  }

  function stelleTotali() {
    var t = 0;
    for (var i = 0; i < LEVELS.length; i++) t += stelleDi(i);
    return t;
  }

  function soglia(i) { return Math.round(i * SOGLIA); }

  function aperto(i, totale) {
    return (totale === undefined ? stelleTotali() : totale) >= soglia(i);
  }

  /* -1 quando non c'e' piu' niente da fare: se no il segno "da fare" finirebbe
     sul primo quadro, che pero' e' gia' chiuso, e i due stili si scontrano */
  function primoDaFare() {
    var tot = stelleTotali(), i;
    for (i = 0; i < LEVELS.length; i++) if (aperto(i, tot) && !risolto(i)) return i;
    for (i = 0; i < LEVELS.length; i++) if (!risolto(i)) return i;
    return -1;
  }

  function stelleHtml(n) {
    return '<em class="stelle">' + new Array(n + 1).join('★') +
           '<i>' + new Array(4 - n).join('☆') + '</i></em>';
  }

  var LUCCHETTO =
    '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true">' +
      '<rect x="5" y="10.5" width="14" height="10" rx="2"/>' +
      '<path d="M8.2 10.5V7.6a3.8 3.8 0 0 1 7.6 0v2.9" fill="none" stroke-width="2"/>' +
    '</svg>';

  var ROMANI = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

  /* la sagoma del quadro in miniatura, normalizzata dentro il riquadro */
  function miniShape(cells) {
    var xs = [], ys = [], i;
    for (i = 0; i < cells.length; i++) { xs.push(cells[i][0]); ys.push(cells[i][1]); }
    var mx = Math.min.apply(null, xs), my = Math.min.apply(null, ys);
    var w = Math.max.apply(null, xs) - mx + 1, h = Math.max.apply(null, ys) - my + 1;
    var u = 100 / Math.max(w, h);
    var ox = (100 - w * u) / 2, oy = (100 - h * u) / 2, d = '';
    for (i = 0; i < cells.length; i++) {
      var x = f(ox + (cells[i][0] - mx) * u), y = f(oy + (cells[i][1] - my) * u);
      d += 'M' + x + ' ' + y + 'h' + f(u) + 'v' + f(u) + 'h' + f(-u) + 'Z';
    }
    return '<svg class="mini" viewBox="-6 -6 112 112" aria-hidden="true">' +
             '<path d="' + d + '"/></svg>';
  }

  function tile(i, prossimo, totale) {
    var lv = LEVELS[i], best = store.best[lv.id], n = stelleDi(i);
    if (!aperto(i, totale)) {
      /* quante ne mancano dice quanto e' vicino; la soglia secca no */
      var mancano = soglia(i) - totale;
      var vicino = mancano <= 3 ? ' vicino' : '';
      return '<div class="lv locked' + vicino + '" aria-disabled="true">' +
               '<span class="lv-top"><span class="num">' + lv.n + '</span>' + LUCCHETTO + '</span>' +
               '<span class="st">ancora ' + mancano + ' ★</span>' +
             '</div>';
    }
    var cls = 'lv';
    if (best !== undefined) cls += n === 3 ? ' done perfect' : ' done';
    if (i === prossimo && best === undefined) cls += ' next';
    var st = best === undefined
      ? (i === prossimo ? '<em class="ora">da fare</em> · minimo ' + lv.par : 'minimo ' + lv.par)
      : stelleHtml(n) + ' <span class="mosse">' + best + '/' + lv.par + '</span>';
    return '<button class="' + cls + '" data-lv="' + i + '">' +
             '<span class="lv-top"><span class="num">' + lv.n + '</span>' +
               miniShape(lv.shape) + '</span>' +
             '<span class="nm">' + lv.name + '</span>' +
             '<span class="st">' + st + '</span>' +
           '</button>';
  }

  function buildMenu() {
    var totale = stelleTotali(), massimo = LEVELS.length * 3;
    var fatti = 0, i;
    for (i = 0; i < LEVELS.length; i++) if (risolto(i)) fatti++;
    var prossimo = primoDaFare();

    var html = '';
    for (var a = 0; a < ACTS.length; a++) {
      var atto = ACTS[a], dentro = [], chiuse = 0, stelleAtto = 0, apertiAtto = 0, primoDentro = -1;
      for (i = 0; i < LEVELS.length; i++) if (LEVELS[i].act === atto.n) {
        if (primoDentro < 0) primoDentro = i;
        dentro.push(i);
        if (risolto(i)) chiuse++;
        stelleAtto += stelleDi(i);
        if (aperto(i, totale)) apertiAtto++;
      }
      var qualcunoAperto = apertiAtto > 0;
      if (!dentro.length) continue;

      var testa = qualcunoAperto
        ? '<span class="act-t">' + atto.title + '</span>' +
          '<span class="act-note">' + atto.note + '</span>'
        : '<span class="act-t da-scoprire">Da scoprire</span>' +
          '<span class="act-note">Si apre con ' + soglia(primoDentro) + ' stelle.</span>';

      html += '<section class="act' + (qualcunoAperto ? '' : ' act-locked') +
                (chiuse === dentro.length ? ' act-done' : '') + '">' +
                '<header class="act-head">' +
                  '<span class="act-n">' + (ROMANI[atto.n] || atto.n) + '</span>' +
                  '<span class="act-txt">' + testa + '</span>' +
                  '<span class="act-count">' +
                    (apertiAtto && apertiAtto < dentro.length
                      ? '<b>' + apertiAtto + ' di ' + dentro.length + ' aperti</b> · ' : '') +
                    stelleAtto + '/' + dentro.length * 3 + '<i>★</i></span>' +
                '</header><div class="act-grid">';
      for (i = 0; i < dentro.length; i++) html += tile(dentro[i], prossimo, totale);
      html += '</div></section>';
    }
    $('pickerGrid').innerHTML = html;

    $('menuLine').innerHTML =
      '<b class="conta">' + totale + '</b><span class="astro">★</span>' +
      '<span class="su">su ' + massimo + '</span>' +
      '<span class="sep">·</span>' + fatti + ' quadri chiusi su ' + LEVELS.length;
    $('menuBar').firstChild.style.width = Math.round(totale / massimo * 100) + '%';

    var tutti = fatti === LEVELS.length;
    $('btnPlay').textContent = tutti
      ? 'Rigioca il primo'
      : fatti === 0 ? 'Comincia' : 'Riprendi dal quadro ' + LEVELS[prossimo].n;
    $('btnPlay').dataset.lv = prossimo < 0 ? 0 : prossimo;

    var segno = $('pickerGrid').querySelector('.lv.next');
    if (segno) setTimeout(function () {
      var g = $('pickerGrid');
      g.scrollTop = Math.max(0, segno.offsetTop - g.clientHeight / 2);
    }, 0);
  }

  function showMenu() {
    if (S.busy) return;
    S.inMenu = true;
    buildMenu();
    $('app').classList.add('in-menu');
    close$('win');
  }

  function hideMenu() {
    S.inMenu = false;
    $('app').classList.remove('in-menu');
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
    $('btnRedo').onclick = redo;
    $('btnReset').onclick = reset;
    $('btnHint').onclick = hint;
    $('btnPreview').onclick = function () {
      store.preview = !store.preview;
      saveStore();
      $('btnPreview').classList.toggle('on', store.preview);
      if (!store.preview) clearGhost();
    };

    $('btnLevels').onclick = showMenu;
    $('btnPlay').onclick = function () { loadLevel(+$('btnPlay').dataset.lv); };
    $('pickerGrid').addEventListener('click', function (e) {
      var b = e.target.closest('button.lv');   /* i bloccati sono div, non pulsanti */
      if (b) loadLevel(+b.dataset.lv);
    });
    $('btnWipe').onclick = function () {
      if (!confirm('Cancello tutti i risultati salvati? I quadri tornano da aprire.')) return;
      store = { best: {}, preview: store.preview };
      saveStore(); buildMenu();
    };
    $('btnRulesMenu').onclick = function () { open$('howto'); };

    $('btnAgain').onclick = function () { close$('win'); reset(); };
    $('btnMenuWin').onclick = function () { close$('win'); showMenu(); };
    $('btnNext').onclick = function () {
      close$('win');
      var vai = +($('btnNext').dataset.vai);
      if (vai >= 0) loadLevel(vai); else showMenu();
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
        if (!S.inMenu) showMenu();
        return;
      }
      if (S.inMenu) return;
      if (e.target.tagName === 'INPUT') return;
      var k = e.key.toLowerCase();
      if (k === 'z') { e.shiftKey ? redo() : undo(); }
      if (k === 'y') redo();
      if (k === 'r') reset();
      if (k === 'h') hint();
    });

    var relayout = function () { layout(); render(); };
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', function () { setTimeout(relayout, 120); });

    setupNative();
    /* si parte sempre dal menu; il quadro si sceglie da li' */
    S.level = LEVELS[Math.min(typeof store.last === 'number' ? store.last : 0, LEVELS.length - 1)];
    S.cells = S.level.shape.slice();
    showMenu();
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
      if (!S.inMenu) return showMenu();
      App.exitApp();
    });
  }

  window.__opera = { transformFor: transformFor, AXIS_ANGLE: AXIS_ANGLE, state: S, press: press };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
