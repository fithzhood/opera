/* Opera — nucleo logico puro (nessun DOM).
   Usato sia dal gioco nel browser sia dallo script di verifica in Node. */
var OperaCore = (function () {
  'use strict';

  /* ---------- rappresentazione ----------
     Una cella e' [x, y] con x = colonna, y = riga, y verso il basso.
     Una figura e' un array di celle. Una operazione e':
       { k:'m', dx, dy }                 traslazione
       { k:'r', d: 90 | -90 | 180 }      rotazione attorno al centro del perno
       { k:'x', a: 'v'|'h'|'d1'|'d2' }   simmetria rispetto a un asse per il perno
     d1 = asse obliquo "\" (y = x)   d2 = asse obliquo "/" (y = -x)
  */

  function key(cells) {
    var i, s = new Array(cells.length);
    for (i = 0; i < cells.length; i++) s[i] = cells[i][0] + ',' + cells[i][1];
    s.sort();
    return s.join(' ');
  }

  function apply(cells, pivot, op) {
    var out = new Array(cells.length), i, c, x, y, nx, ny;
    if (op.k === 'm') {
      for (i = 0; i < cells.length; i++) out[i] = [cells[i][0] + op.dx, cells[i][1] + op.dy];
      return out;
    }
    var px = pivot[0], py = pivot[1];
    for (i = 0; i < cells.length; i++) {
      c = cells[i]; x = c[0] - px; y = c[1] - py;
      if (op.k === 'r') {
        if (op.d === 90) { nx = -y; ny = x; }            /* orario sullo schermo */
        else if (op.d === -90) { nx = y; ny = -x; }      /* antiorario */
        else { nx = -x; ny = -y; }
      } else {
        if (op.a === 'v') { nx = -x; ny = y; }           /* asse verticale */
        else if (op.a === 'h') { nx = x; ny = -y; }      /* asse orizzontale */
        else if (op.a === 'd1') { nx = y; ny = x; }      /* asse "\" */
        else { nx = -y; ny = -x; }                       /* asse "/" */
      }
      out[i] = [nx + px, ny + py];
    }
    return out;
  }

  function cellSet(list) {
    var s = Object.create(null), i;
    list = list || [];
    for (i = 0; i < list.length; i++) s[list[i][0] + ',' + list[i][1]] = true;
    return s;
  }

  function fireSet(level) { return cellSet(level.fire); }

  /* Il fuoco brucia il quadretto della figura che si ferma sopra: quello che
     resta e' la figura meno quei quadretti. Il fuoco non e' un ostacolo — ci si
     puo' passare sopra e ci si puo' girare attraverso — brucia solo dove la
     figura si posa. */
  function burn(cells, fire) {
    if (!fire) return cells;
    var out = [], i;
    for (i = 0; i < cells.length; i++)
      if (!fire[cells[i][0] + ',' + cells[i][1]]) out.push(cells[i]);
    return out;
  }

  function wallSet(level) {
    var s = Object.create(null), i, w = level.walls || [];
    for (i = 0; i < w.length; i++) s[w[i][0] + ',' + w[i][1]] = true;
    return s;
  }

  function isLegal(cells, level, walls) {
    walls = walls || wallSet(level);
    for (var i = 0; i < cells.length; i++) {
      var x = cells[i][0], y = cells[i][1];
      if (x < 0 || y < 0 || x >= level.cols || y >= level.rows) return false;
      if (walls[x + ',' + y]) return false;
    }
    return true;
  }

  function covers(cells, x, y) {
    for (var i = 0; i < cells.length; i++) if (cells[i][0] === x && cells[i][1] === y) return true;
    return false;
  }

  /* ---------- il cammino ----------
     Un muro non e' solo una casella vietata all'arrivo: e' un ostacolo, e la
     figura non ci puo' passare attraverso. Quindi oltre alla posizione finale
     si guardano le posizioni intermedie:
       - traslazione: i passi di mezzo, uno per casella (gli stessi che si
         vedono nell'animazione);
       - rotazione: le pose a 45 gradi lungo l'arco, arrotondate alla griglia
         (per il mezzo giro anche quelle a 90 e 135);
       - simmetria: nessuna, perche' il ribaltamento avviene sul posto.
     Il bordo del quadro invece non frena il passaggio: conta solo dove si
     ferma la figura. */

  /* L'arco va campionato fitto: prendendo solo la posa a 45 gradi il raggio si
     accorcia con l'arrotondamento e un muro sull'arco non verrebbe intercettato.
     A passi di 15 gradi il cammino di ogni quadretto e' seguito bene. */
  /* Arrotondamento con un pizzico di margine: a 30 gradi un quadretto a
     distanza 3 finisce esatto su 1,5, e li' il rumore di calcolo (1e-16) puo'
     far cadere l'andata e il ritorno da parti opposte. Con il margine la
     regola resta reversibile, che serve perche' annullare deve sempre poter
     rifare la strada al contrario. */
  function arr(v) { return Math.floor(v + 0.5 + 1e-9); }

  function arcoLibero(cells, pivot, da, a, verso, walls) {
    var passo = 15, g, i, t, c, s2, x, y, cx, cy;
    for (g = da; g < a; g += passo) {
      t = verso * g * Math.PI / 180; c = Math.cos(t); s2 = Math.sin(t);
      for (i = 0; i < cells.length; i++) {
        x = cells[i][0] - pivot[0]; y = cells[i][1] - pivot[1];
        cx = arr(x * c - y * s2) + pivot[0];
        cy = arr(x * s2 + y * c) + pivot[1];
        if (walls[cx + ',' + cy]) return false;
      }
    }
    return true;
  }

  /* Il mezzo giro si puo' fare da una parte o dall'altra: si sceglie il verso
     libero. Restituisce +1, -1 oppure 0 se sono murati tutti e due. Serve anche
     all'animazione, che deve girare dalla parte giusta. */
  function spin(cells, pivot, op, level, walls) {
    walls = walls || wallSet(level);
    if (op.k !== 'r') return 0;
    if (op.d !== 180) {
      var v = op.d > 0 ? 1 : -1;
      return arcoLibero(cells, pivot, 15, 90, v, walls) ? v : 0;
    }
    if (arcoLibero(cells, pivot, 15, 180, 1, walls)) return 1;
    if (arcoLibero(cells, pivot, 15, 180, -1, walls)) return -1;
    return 0;
  }

  function moveSweepClear(cells, op, walls) {
    var steps = Math.max(Math.abs(op.dx), Math.abs(op.dy));
    var k, i, sx = op.dx / steps, sy = op.dy / steps;
    for (k = 1; k < steps; k++)
      for (i = 0; i < cells.length; i++)
        if (walls[(cells[i][0] + sx * k) + ',' + (cells[i][1] + sy * k)]) return false;
    return true;
  }

  /* true se nessun muro taglia la strada alla figura */
  function pathClear(cells, pivot, op, level, walls) {
    walls = walls || wallSet(level);
    if (op.k === 'm') return moveSweepClear(cells, op, walls);
    if (op.k === 'r') return spin(cells, pivot, op, level, walls) !== 0;
    return true;   /* il ribaltamento avviene sul posto */
  }

  /* Tutte le mosse giocabili da una posizione: pulsante coperto dalla figura,
     risultato dentro la griglia e nessun muro sulla strada. */
  function moves(cells, level, walls, fire) {
    walls = walls || wallSet(level);
    if (fire === undefined) fire = level.fire && level.fire.length ? fireSet(level) : null;
    var out = [], i, b, res, dopo, ok, libera;
    for (i = 0; i < level.buttons.length; i++) {
      b = level.buttons[i];
      if (!covers(cells, b.x, b.y)) continue;
      res = apply(cells, [b.x, b.y], b.op);
      ok = isLegal(res, level, walls);
      libera = pathClear(cells, [b.x, b.y], b.op, level, walls);
      dopo = burn(res, fire);
      /* bruciare tutta la figura non si puo': resterebbe una partita senza
         niente da muovere e senza uscita */
      if (!dopo.length) ok = false;
      out.push({ index: i, button: b, cells: dopo,
                 brucia: res.length - dopo.length,
                 legal: ok && libera, fuori: !ok, murata: ok && !libera });
    }
    return out;
  }

  function solved(cells, level) {
    return key(cells) === key(level.target);
  }

  /* Ricerca in ampiezza: cammino minimo di pulsanti dalla posizione data
     alla sagoma d'arrivo. Restituisce un array di indici, [] se gia' risolto,
     null se irraggiungibile. */
  function solve(level, fromCells) {
    var start = fromCells || level.shape;
    var goal = key(level.target);
    var walls = wallSet(level);
    var fire = level.fire && level.fire.length ? fireSet(level) : null;
    var startKey = key(start);
    if (startKey === goal) return [];
    var seen = Object.create(null);
    seen[startKey] = true;
    var queue = [{ cells: start, path: [] }];
    var head = 0, limit = 400000;
    while (head < queue.length && head < limit) {
      var node = queue[head++];
      var ms = moves(node.cells, level, walls, fire);
      for (var i = 0; i < ms.length; i++) {
        if (!ms[i].legal) continue;
        var k = key(ms[i].cells);
        if (seen[k]) continue;
        var path = node.path.concat([ms[i].index]);
        if (k === goal) return path;
        seen[k] = true;
        queue.push({ cells: ms[i].cells, path: path });
      }
    }
    return null;
  }

  /* Quante posizioni distinte sono raggiungibili (serve alla verifica dei livelli). */
  function reachable(level, fromCells) {
    var walls = wallSet(level);
    var fire = level.fire && level.fire.length ? fireSet(level) : null;
    var start = fromCells || level.shape;
    var seen = Object.create(null);
    seen[key(start)] = true;
    var queue = [start], head = 0;
    while (head < queue.length) {
      var ms = moves(queue[head++], level, walls, fire);
      for (var i = 0; i < ms.length; i++) {
        if (!ms[i].legal) continue;
        var k = key(ms[i].cells);
        if (seen[k]) continue;
        seen[k] = true;
        queue.push(ms[i].cells);
      }
    }
    return Object.keys(seen).length;
  }

  /* I lati di bordo, uno per uno, senza incatenarli in anelli. Serve perche'
     col fuoco la figura puo' spezzarsi o toccarsi solo d'angolo, e li' il
     tracciamento degli anelli si romperebbe (un vertice avrebbe due uscite). */
  function boundary(cells) {
    var has = Object.create(null), out = [], i, c, x, y;
    for (i = 0; i < cells.length; i++) has[cells[i][0] + ',' + cells[i][1]] = true;
    for (i = 0; i < cells.length; i++) {
      c = cells[i]; x = c[0]; y = c[1];
      if (!has[x + ',' + (y - 1)]) out.push([x, y, x + 1, y]);
      if (!has[(x + 1) + ',' + y]) out.push([x + 1, y, x + 1, y + 1]);
      if (!has[x + ',' + (y + 1)]) out.push([x + 1, y + 1, x, y + 1]);
      if (!has[(x - 1) + ',' + y]) out.push([x, y + 1, x, y]);
    }
    return out;
  }

  /* Contorno esterno di un poliomino: lista di anelli, ognuno un array di
     punti [x, y] in unita' di cella. Serve a disegnare la figura come un
     pezzo unico invece che come tanti quadretti staccati. */
  function outline(cells) {
    var has = Object.create(null), i, c;
    for (i = 0; i < cells.length; i++) has[cells[i][0] + ',' + cells[i][1]] = true;
    var edges = Object.create(null); /* "x,y" -> [x2,y2] */
    function add(ax, ay, bx, by) { edges[ax + ',' + ay] = [bx, by]; }
    for (i = 0; i < cells.length; i++) {
      c = cells[i];
      var x = c[0], y = c[1];
      if (!has[x + ',' + (y - 1)]) add(x, y, x + 1, y);                 /* alto  -> */
      if (!has[(x + 1) + ',' + y]) add(x + 1, y, x + 1, y + 1);         /* destra v */
      if (!has[x + ',' + (y + 1)]) add(x + 1, y + 1, x, y + 1);         /* basso <- */
      if (!has[(x - 1) + ',' + y]) add(x, y + 1, x, y);                 /* sinistra ^ */
    }
    var rings = [], startKeys = Object.keys(edges);
    var used = Object.create(null);
    for (i = 0; i < startKeys.length; i++) {
      if (used[startKeys[i]]) continue;
      var ring = [], k = startKeys[i];
      while (k && !used[k]) {
        used[k] = true;
        var p = k.split(',');
        ring.push([parseInt(p[0], 10), parseInt(p[1], 10)]);
        var nxt = edges[k];
        k = nxt ? nxt[0] + ',' + nxt[1] : null;
      }
      if (ring.length > 2) rings.push(simplify(ring));
    }
    return rings;
  }

  /* toglie i punti allineati, cosi' il tracciato ha solo gli angoli veri */
  function simplify(ring) {
    var out = [], n = ring.length, i;
    for (i = 0; i < n; i++) {
      var a = ring[(i - 1 + n) % n], b = ring[i], c = ring[(i + 1) % n];
      var ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
      if (ux * vy - uy * vx !== 0) out.push(b);
    }
    return out.length ? out : ring;
  }

  return {
    key: key, apply: apply, isLegal: isLegal, covers: covers, moves: moves,
    pathClear: pathClear, spin: spin, boundary: boundary,
    fireSet: fireSet, burn: burn,
    solved: solved, solve: solve, reachable: reachable, outline: outline,
    wallSet: wallSet
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OperaCore;
