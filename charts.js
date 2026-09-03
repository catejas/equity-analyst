/* charts.js — every figure in every document.
 *
 * Inline SVG, no library. html2canvas rasterises SVG faithfully at the 4x scale
 * the PDF pipeline uses; a canvas-based library would export soft at 600 DPI and
 * a font-based one would need a network. Each chart returns a complete <figure>
 * with its own number, title and source line, because a figure without a source
 * is an assertion.
 *
 * Every chart refuses rather than guesses: given no data it returns a stated
 * absence, which is the same discipline the engine applies to a missing rating.
 */
(function (window) {
  'use strict';

  /* The report palette. Charts share the five-step scale used for every
     judgement elsewhere, so a red bar means the same thing on every page. */
  var C = {
    navy: '#0F2C52', navy2: '#1B4370', teal: '#00736C', teal2: '#7FB4B0',
    gold: '#C8891B', ink: '#12161C', ink3: '#6B7480', rule: '#DEDAD2',
    grid: '#EDEAE4', paper: '#FFFFFF',
    s1: '#B4442E', s2: '#C8891B', s3: '#8A8F98', s4: '#3E7FA8', s5: '#0E7C66',
    series: ['#0F2C52', '#00736C', '#C8891B', '#7A5AA8', '#B4442E', '#2E9BC9', '#5C7A3F']
  };

  var FIG = 0;
  function resetFigures() { FIG = 0; }
  function nextFigure() { return ++FIG; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };

  /* Wrap any chart body in the standard figure furniture. */
  function figure(title, source, body, opts) {
    opts = opts || {};
    var n = opts.unnumbered ? null : nextFigure();
    return '<figure class="fig' + (opts.cls ? ' ' + opts.cls : '') + '">'
      + (title ? '<figcaption class="fig-t">'
          + (n ? '<b>Fig ' + n + '</b> ' : '') + esc(title) + '</figcaption>' : '')
      + '<div class="fig-b">' + body + '</div>'
      + (source ? '<div class="fig-s">Source: ' + esc(source) + '</div>' : '')
      + '</figure>';
  }

  function unavailable(title, reason) {
    return figure(title, null,
      '<div class="fig-na">' + esc(reason || 'Not available.') + '</div>',
      { unnumbered: true });
  }

  /* ------------------------------------------------------------ scaling */

  function niceTicks(min, max, count) {
    count = count || 4;
    if (min === max) { min = min - 1; max = max + 1; }
    var span = max - min;
    var raw = span / count;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    var lo = Math.floor(min / step) * step;
    var hi = Math.ceil(max / step) * step;
    var out = [];
    for (var v = lo; v <= hi + step / 1000; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }

  function fmt(v, dp) {
    if (!isNum(v)) return '—';
    var a = Math.abs(v);
    if (a >= 1e7) return (v / 1e7).toFixed(dp == null ? 1 : dp) + ' cr';
    if (a >= 1e5) return (v / 1e5).toFixed(dp == null ? 1 : dp) + ' L';
    if (a >= 1000) return v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    return (Math.round(v * 100) / 100).toString();
  }

  /* Standard plot frame: axes, gridlines, y labels, x labels. */
  function frame(w, h, pad, yTicks, xLabels, opts) {
    opts = opts || {};
    var g = '';
    var plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
    var lo = yTicks[0], hi = yTicks[yTicks.length - 1];
    var y = function (v) { return pad.t + plotH - ((v - lo) / (hi - lo)) * plotH; };

    yTicks.forEach(function (t) {
      g += '<line x1="' + pad.l + '" y1="' + y(t).toFixed(1) + '" x2="' + (w - pad.r)
        + '" y2="' + y(t).toFixed(1) + '" stroke="' + (t === 0 ? C.rule : C.grid)
        + '" stroke-width="' + (t === 0 ? 1 : 0.6) + '"/>';
      g += '<text x="' + (pad.l - 5) + '" y="' + (y(t) + 3).toFixed(1)
        + '" text-anchor="end" class="ax">' + esc(opts.yFmt ? opts.yFmt(t) : fmt(t)) + '</text>';
    });

    if (xLabels && xLabels.length) {
      var step = plotW / xLabels.length;
      xLabels.forEach(function (lab, i) {
        g += '<text x="' + (pad.l + step * (i + 0.5)).toFixed(1) + '" y="' + (h - pad.b + 13)
          + '" text-anchor="middle" class="ax">' + esc(lab) + '</text>';
      });
    }
    return { g: g, y: y, plotW: plotW, plotH: plotH, lo: lo, hi: hi };
  }

  function svg(w, h, inner) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" preserveAspectRatio="xMidYMid meet"'
      + ' xmlns="http://www.w3.org/2000/svg" role="img">' + inner + '</svg>';
  }

  function legend(names, colours) {
    if (!names || names.length < 2) return '';
    return '<div class="fig-l">' + names.map(function (n, i) {
      return '<span><i style="background:' + (colours[i] || C.series[i % C.series.length]) + '"></i>'
        + esc(n) + '</span>';
    }).join('') + '</div>';
  }

  /* ------------------------------------------------------------- column */

  /**
   * Grouped or stacked columns.
   * series: [{ name, values:[], color }]  categories: []
   */
  function columns(opts) {
    var cats = opts.categories || [];
    var series = (opts.series || []).filter(function (s) { return s && s.values; });
    if (!cats.length || !series.length) return unavailable(opts.title, 'No data supplied.');

    var stacked = opts.stacked === true;
    var w = 560, h = opts.height || 240, pad = { l: 46, r: 12, t: 12, b: 28 };
    var flat = [];
    if (stacked) {
      cats.forEach(function (_, i) {
        flat.push(series.reduce(function (a, s) { return a + (isNum(s.values[i]) ? s.values[i] : 0); }, 0));
      });
    } else {
      series.forEach(function (s) { s.values.forEach(function (v) { if (isNum(v)) flat.push(v); }); });
    }
    if (!flat.length) return unavailable(opts.title, 'No numeric values in the series.');

    var ticks = niceTicks(Math.min(0, Math.min.apply(null, flat)), Math.max.apply(null, flat), 4);
    var f = frame(w, h, pad, ticks, cats, opts);
    var step = f.plotW / cats.length;
    var body = f.g;

    cats.forEach(function (_, i) {
      if (stacked) {
        var base = 0;
        series.forEach(function (s, si) {
          var v = s.values[i];
          if (!isNum(v)) return;
          var col = s.color || C.series[si % C.series.length];
          var y0 = f.y(base + v), y1 = f.y(base);
          body += '<rect x="' + (pad.l + step * i + step * 0.18).toFixed(1) + '" y="' + Math.min(y0, y1).toFixed(1)
            + '" width="' + (step * 0.64).toFixed(1) + '" height="' + Math.abs(y1 - y0).toFixed(1)
            + '" fill="' + col + '"/>';
          base += v;
        });
      } else {
        var bw = (step * 0.72) / series.length;
        series.forEach(function (s, si) {
          var v = s.values[i];
          if (!isNum(v)) return;
          var col = s.color || C.series[si % C.series.length];
          var y0 = f.y(v), yz = f.y(Math.max(ticks[0], 0));
          body += '<rect x="' + (pad.l + step * i + step * 0.14 + bw * si).toFixed(1)
            + '" y="' + Math.min(y0, yz).toFixed(1) + '" width="' + (bw * 0.86).toFixed(1)
            + '" height="' + Math.max(1, Math.abs(yz - y0)).toFixed(1) + '" fill="' + col + '"/>';
        });
      }
    });

    return figure(opts.title, opts.source,
      svg(w, h, body) + legend(series.map(function (s) { return s.name; }),
        series.map(function (s) { return s.color; })));
  }

  /* --------------------------------------------------------------- line */

  function lines(opts) {
    var cats = opts.categories || [];
    var series = (opts.series || []).filter(function (s) { return s && s.values; });
    if (!cats.length || !series.length) return unavailable(opts.title, 'No data supplied.');

    var w = 560, h = opts.height || 240, pad = { l: 46, r: 12, t: 12, b: 28 };
    var flat = [];
    series.forEach(function (s) { s.values.forEach(function (v) { if (isNum(v)) flat.push(v); }); });
    if (!flat.length) return unavailable(opts.title, 'No numeric values in the series.');

    var ticks = niceTicks(Math.min.apply(null, flat), Math.max.apply(null, flat), 4);
    var f = frame(w, h, pad, ticks, cats, opts);
    var step = f.plotW / cats.length;
    var body = f.g;

    series.forEach(function (s, si) {
      var col = s.color || C.series[si % C.series.length];
      var pts = [];
      s.values.forEach(function (v, i) {
        if (!isNum(v)) return;   /* a gap stays a gap; the line breaks */
        pts.push([pad.l + step * (i + 0.5), f.y(v)]);
      });
      if (!pts.length) return;
      body += '<polyline fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round"'
        + ' points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
      pts.forEach(function (p) {
        body += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.4" fill="' + col + '"/>';
      });
    });

    return figure(opts.title, opts.source,
      svg(w, h, body) + legend(series.map(function (s) { return s.name; }),
        series.map(function (s) { return s.color; })));
  }

  /* ------------------------------------------ columns with a line on top
     The most used chart in institutional research: a quantity and its growth
     rate, on two axes. */

  function columnLine(opts) {
    var cats = opts.categories || [];
    var bars = opts.bars, line = opts.line;
    if (!cats.length || !bars || !bars.values) return unavailable(opts.title, 'No data supplied.');

    var w = 560, h = opts.height || 250, pad = { l: 46, r: 42, t: 12, b: 28 };
    var bv = bars.values.filter(isNum);
    if (!bv.length) return unavailable(opts.title, 'No numeric values in the series.');
    var bticks = niceTicks(Math.min(0, Math.min.apply(null, bv)), Math.max.apply(null, bv), 4);
    var f = frame(w, h, pad, bticks, cats, opts);
    var step = f.plotW / cats.length;
    var body = f.g;

    bars.values.forEach(function (v, i) {
      if (!isNum(v)) return;
      var y0 = f.y(v), yz = f.y(0);
      body += '<rect x="' + (pad.l + step * i + step * 0.2).toFixed(1) + '" y="' + Math.min(y0, yz).toFixed(1)
        + '" width="' + (step * 0.6).toFixed(1) + '" height="' + Math.max(1, Math.abs(yz - y0)).toFixed(1)
        + '" fill="' + (bars.color || C.navy) + '"/>';
    });

    if (line && line.values) {
      var lv = line.values.filter(isNum);
      if (lv.length) {
        var lt = niceTicks(Math.min.apply(null, lv), Math.max.apply(null, lv), 4);
        var lo = lt[0], hi = lt[lt.length - 1];
        var ly = function (v) { return pad.t + f.plotH - ((v - lo) / (hi - lo)) * f.plotH; };
        var pts = [];
        line.values.forEach(function (v, i) {
          if (isNum(v)) pts.push([pad.l + step * (i + 0.5), ly(v)]);
        });
        body += '<polyline fill="none" stroke="' + (line.color || C.gold) + '" stroke-width="2"'
          + ' points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
        pts.forEach(function (p) {
          body += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.4" fill="' + (line.color || C.gold) + '"/>';
        });
        lt.forEach(function (t) {
          body += '<text x="' + (w - pad.r + 5) + '" y="' + (ly(t) + 3).toFixed(1)
            + '" class="ax">' + esc(line.fmt ? line.fmt(t) : t + '%') + '</text>';
        });
      }
    }

    return figure(opts.title, opts.source,
      svg(w, h, body) + legend([bars.name, line && line.name].filter(Boolean),
        [bars.color || C.navy, (line && line.color) || C.gold]));
  }

  /* ---------------------------------------------------------- waterfall */

  function waterfall(opts) {
    var items = (opts.items || []).filter(function (i) { return i && isNum(i.value); });
    if (!items.length) return unavailable(opts.title, 'No data supplied.');

    var w = 560, h = opts.height || 250, pad = { l: 46, r: 12, t: 12, b: 40 };
    var run = 0, points = [], lo = 0, hi = 0;
    items.forEach(function (it) {
      if (it.total) { points.push({ from: 0, to: it.value, it: it }); run = it.value; }
      else { points.push({ from: run, to: run + it.value, it: it }); run += it.value; }
      lo = Math.min(lo, points[points.length - 1].from, points[points.length - 1].to);
      hi = Math.max(hi, points[points.length - 1].from, points[points.length - 1].to);
    });

    var ticks = niceTicks(lo, hi, 4);
    var f = frame(w, h, pad, ticks, null, opts);
    var step = f.plotW / points.length;
    var body = f.g;

    points.forEach(function (p, i) {
      var y0 = f.y(p.to), y1 = f.y(p.from);
      var col = p.it.total ? C.navy : (p.it.value >= 0 ? C.s5 : C.s1);
      body += '<rect x="' + (pad.l + step * i + step * 0.2).toFixed(1) + '" y="' + Math.min(y0, y1).toFixed(1)
        + '" width="' + (step * 0.6).toFixed(1) + '" height="' + Math.max(1.5, Math.abs(y1 - y0)).toFixed(1)
        + '" fill="' + col + '"/>';
      body += '<text x="' + (pad.l + step * (i + 0.5)).toFixed(1) + '" y="' + (Math.min(y0, y1) - 4).toFixed(1)
        + '" text-anchor="middle" class="ax">' + esc(fmt(p.it.value)) + '</text>';
      body += '<text x="' + (pad.l + step * (i + 0.5)).toFixed(1) + '" y="' + (h - pad.b + 13)
        + '" text-anchor="middle" class="ax">' + esc(p.it.label || '') + '</text>';
    });

    return figure(opts.title, opts.source, svg(w, h, body));
  }

  /* ------------------------------------------------------ football field
     The valuation range across methods, against the price. */

  function footballField(opts) {
    var rows = (opts.rows || []).filter(function (r) { return r && isNum(r.low) && isNum(r.high); });
    if (!rows.length) return unavailable(opts.title, 'No valuation ranges supplied.');

    var price = opts.price;
    var w = 560, rowH = 30, h = rows.length * rowH + 46, pad = { l: 140, r: 20, t: 10, b: 26 };
    var all = [];
    rows.forEach(function (r) { all.push(r.low, r.high); });
    if (isNum(price)) all.push(price);
    var ticks = niceTicks(Math.min.apply(null, all), Math.max.apply(null, all), 4);
    var lo = ticks[0], hi = ticks[ticks.length - 1];
    var plotW = w - pad.l - pad.r;
    var x = function (v) { return pad.l + ((v - lo) / (hi - lo)) * plotW; };
    var body = '';

    ticks.forEach(function (t) {
      body += '<line x1="' + x(t).toFixed(1) + '" y1="' + pad.t + '" x2="' + x(t).toFixed(1)
        + '" y2="' + (h - pad.b) + '" stroke="' + C.grid + '" stroke-width="0.6"/>';
      body += '<text x="' + x(t).toFixed(1) + '" y="' + (h - pad.b + 14)
        + '" text-anchor="middle" class="ax">' + esc(fmt(t)) + '</text>';
    });

    rows.forEach(function (r, i) {
      var y = pad.t + i * rowH + rowH / 2;
      body += '<text x="' + (pad.l - 8) + '" y="' + (y + 3) + '" text-anchor="end" class="ax">'
        + esc(r.label || '') + '</text>';
      body += '<rect x="' + x(r.low).toFixed(1) + '" y="' + (y - 8) + '" width="'
        + Math.max(2, x(r.high) - x(r.low)).toFixed(1) + '" height="16" rx="2" fill="'
        + (r.color || C.teal) + '" opacity="0.85"/>';
      if (isNum(r.mid)) {
        body += '<line x1="' + x(r.mid).toFixed(1) + '" y1="' + (y - 10) + '" x2="' + x(r.mid).toFixed(1)
          + '" y2="' + (y + 10) + '" stroke="' + C.ink + '" stroke-width="1.5"/>';
      }
    });

    if (isNum(price)) {
      body += '<line x1="' + x(price).toFixed(1) + '" y1="' + pad.t + '" x2="' + x(price).toFixed(1)
        + '" y2="' + (h - pad.b) + '" stroke="' + C.s1 + '" stroke-width="1.6" stroke-dasharray="4 3"/>';
      body += '<text x="' + x(price).toFixed(1) + '" y="' + (pad.t - 1)
        + '" text-anchor="middle" class="ax" fill="' + C.s1 + '">price ' + esc(fmt(price)) + '</text>';
    }

    return figure(opts.title, opts.source, svg(w, h, body));
  }

  /* ------------------------------------------------------------- bullet
     A score against its maximum. Used for every scoring model. */

  function bullets(opts) {
    var rows = (opts.rows || []).filter(function (r) { return r; });
    if (!rows.length) return unavailable(opts.title, 'Nothing scored.');
    var w = 560, rowH = 26, h = rows.length * rowH + 12, pad = { l: 170, r: 44, t: 6 };
    var plotW = w - pad.l - pad.r;
    var body = '';
    rows.forEach(function (r, i) {
      var y = pad.t + i * rowH + rowH / 2;
      var max = isNum(r.max) ? r.max : 100;
      var pc = isNum(r.value) ? Math.max(0, Math.min(1, r.value / max)) : 0;
      body += '<text x="' + (pad.l - 8) + '" y="' + (y + 3) + '" text-anchor="end" class="ax">'
        + esc(r.label || '') + '</text>';
      body += '<rect x="' + pad.l + '" y="' + (y - 6) + '" width="' + plotW + '" height="12" fill="' + C.grid + '"/>';
      body += '<rect x="' + pad.l + '" y="' + (y - 6) + '" width="' + (plotW * pc).toFixed(1)
        + '" height="12" fill="' + scaleColour(pc * 100) + '"/>';
      body += '<text x="' + (w - pad.r + 5) + '" y="' + (y + 3) + '" class="ax">'
        + (isNum(r.value) ? esc(r.value.toFixed(1)) : '—') + '</text>';
    });
    return figure(opts.title, opts.source, svg(w, h, body));
  }

  function scaleColour(v) {
    if (!isNum(v)) return C.s3;
    if (v >= 80) return C.s5;
    if (v >= 62) return C.s4;
    if (v >= 45) return C.s3;
    if (v >= 30) return C.s2;
    return C.s1;
  }

  /* -------------------------------------------------- scatter, for risk */

  function scatter(opts) {
    var pts = (opts.points || []).filter(function (p) { return p && isNum(p.x) && isNum(p.y); });
    if (!pts.length) return unavailable(opts.title, 'No points supplied.');
    var w = 460, h = 300, pad = { l: 54, r: 16, t: 14, b: 40 };
    var plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
    var xr = opts.xRange || [0, 100], yr = opts.yRange || [0, 100];
    var X = function (v) { return pad.l + ((v - xr[0]) / (xr[1] - xr[0])) * plotW; };
    var Y = function (v) { return pad.t + plotH - ((v - yr[0]) / (yr[1] - yr[0])) * plotH; };
    var body = '';

    /* Quadrant shading: the top right is where the attention goes. */
    body += '<rect x="' + X((xr[0] + xr[1]) / 2) + '" y="' + pad.t + '" width="' + (plotW / 2)
      + '" height="' + (plotH / 2) + '" fill="' + C.s1 + '" opacity="0.07"/>';
    [0.5].forEach(function () {
      body += '<line x1="' + X((xr[0] + xr[1]) / 2) + '" y1="' + pad.t + '" x2="' + X((xr[0] + xr[1]) / 2)
        + '" y2="' + (h - pad.b) + '" stroke="' + C.grid + '"/>';
      body += '<line x1="' + pad.l + '" y1="' + Y((yr[0] + yr[1]) / 2) + '" x2="' + (w - pad.r)
        + '" y2="' + Y((yr[0] + yr[1]) / 2) + '" stroke="' + C.grid + '"/>';
    });
    body += '<rect x="' + pad.l + '" y="' + pad.t + '" width="' + plotW + '" height="' + plotH
      + '" fill="none" stroke="' + C.rule + '"/>';

    pts.forEach(function (p) {
      body += '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="6" fill="'
        + (p.color || C.navy) + '" opacity="0.9"/>';
      body += '<text x="' + X(p.x).toFixed(1) + '" y="' + (Y(p.y) + 3).toFixed(1)
        + '" text-anchor="middle" class="ax" fill="#fff">' + esc(p.label || '') + '</text>';
    });
    body += '<text x="' + (pad.l + plotW / 2) + '" y="' + (h - 8) + '" text-anchor="middle" class="ax">'
      + esc(opts.xLabel || '') + '</text>';
    body += '<text x="14" y="' + (pad.t + plotH / 2) + '" text-anchor="middle" class="ax"'
      + ' transform="rotate(-90 14 ' + (pad.t + plotH / 2) + ')">' + esc(opts.yLabel || '') + '</text>';

    return figure(opts.title, opts.source, svg(w, h, body));
  }

  /* ------------------------------------------------------------ heatgrid
     The sensitivity table, coloured. */

  function heatgrid(opts) {
    var rows = opts.rows || [];
    if (!rows.length) return unavailable(opts.title, 'No grid supplied.');
    var vals = [];
    rows.forEach(function (r) { (r.cells || []).forEach(function (c) { if (isNum(c.value)) vals.push(c.value); }); });
    if (!vals.length) return unavailable(opts.title, 'The grid has no computable cells.');
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);

    var head = '<tr><th></th>' + (opts.columns || []).map(function (c) {
      return '<th class="num">' + esc(c) + '</th>'; }).join('') + '</tr>';
    var body = rows.map(function (r) {
      return '<tr><th scope="row">' + esc(r.label) + '</th>' + (r.cells || []).map(function (c) {
        if (!isNum(c.value)) return '<td class="num heat-na">—</td>';
        var t = hi === lo ? 0.5 : (c.value - lo) / (hi - lo);
        return '<td class="num" style="background:' + mix(C.s1, C.s5, t) + ';color:'
          + (t > 0.55 || t < 0.2 ? '#fff' : C.ink) + '">' + esc(fmt(c.value)) + '</td>';
      }).join('') + '</tr>';
    }).join('');

    return figure(opts.title, opts.source,
      '<table class="heat"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>');
  }

  function mix(a, b, t) {
    function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
    var A = hex(a), B = hex(b);
    var r = A.map(function (v, i) { return Math.round(v + (B[i] - v) * Math.max(0, Math.min(1, t))); });
    return 'rgb(' + r.join(',') + ')';
  }

  /* --------------------------------------------------------------- donut */

  function donut(opts) {
    var slices = (opts.slices || []).filter(function (s) { return s && isNum(s.value) && s.value > 0; });
    if (!slices.length) return unavailable(opts.title, 'No shares supplied.');
    var total = slices.reduce(function (a, s) { return a + s.value; }, 0);
    var w = 300, h = 200, cx = 100, cy = 100, R = 76, r = 44;
    var body = '', ang = -Math.PI / 2;

    slices.forEach(function (s, i) {
      var frac = s.value / total, end = ang + frac * 2 * Math.PI;
      var col = s.color || C.series[i % C.series.length];
      var big = frac > 0.5 ? 1 : 0;
      var p = function (a, rad) { return [(cx + rad * Math.cos(a)).toFixed(2), (cy + rad * Math.sin(a)).toFixed(2)]; };
      var o1 = p(ang, R), o2 = p(end, R), i1 = p(end, r), i2 = p(ang, r);
      body += '<path d="M' + o1 + ' A' + R + ' ' + R + ' 0 ' + big + ' 1 ' + o2
        + ' L' + i1 + ' A' + r + ' ' + r + ' 0 ' + big + ' 0 ' + i2 + ' Z" fill="' + col + '"/>';
      ang = end;
    });

    var lg = '<div class="fig-l col">' + slices.map(function (s, i) {
      return '<span><i style="background:' + (s.color || C.series[i % C.series.length]) + '"></i>'
        + esc(s.label) + ' <b>' + (s.value / total * 100).toFixed(1) + '%</b></span>';
    }).join('') + '</div>';

    return figure(opts.title, opts.source,
      '<div class="fig-row">' + svg(w, h, body) + lg + '</div>');
  }

  /* ------------------------------------------------------------ timeline */

  function timeline(opts) {
    var items = (opts.items || []).filter(function (i) { return i && i.label; });
    if (!items.length) return unavailable(opts.title, 'No dated events supplied.');
    var w = 560, h = 40 + items.length * 30, pad = { l: 100, t: 16 };
    var body = '<line x1="' + pad.l + '" y1="' + pad.t + '" x2="' + pad.l + '" y2="'
      + (h - 14) + '" stroke="' + C.rule + '" stroke-width="1.5"/>';
    items.forEach(function (it, i) {
      var y = pad.t + i * 30 + 8;
      body += '<circle cx="' + pad.l + '" cy="' + y + '" r="4.5" fill="' + (it.color || C.teal) + '"/>';
      body += '<text x="' + (pad.l - 12) + '" y="' + (y + 3) + '" text-anchor="end" class="ax">'
        + esc(it.when || '') + '</text>';
      body += '<text x="' + (pad.l + 12) + '" y="' + (y + 3) + '" class="ax ink">' + esc(it.label) + '</text>';
    });
    return figure(opts.title, opts.source, svg(w, h, body));
  }

  /* -------------------------------------------------------------- funnel */

  function funnel(opts) {
    var steps = (opts.steps || []).filter(function (s) { return s && isNum(s.value); });
    if (!steps.length) return unavailable(opts.title, 'No funnel supplied.');
    var top = steps[0].value || 1;
    var w = 460, rowH = 34, h = steps.length * rowH + 10, body = '';
    steps.forEach(function (s, i) {
      var frac = Math.max(0.04, (s.value || 0) / top);
      var bw = frac * (w - 150);
      var y = 6 + i * rowH;
      body += '<rect x="140" y="' + y + '" width="' + bw.toFixed(1) + '" height="' + (rowH - 10)
        + '" fill="' + (i === steps.length - 1 ? C.teal : C.navy2) + '" opacity="'
        + (0.45 + 0.55 * (i / Math.max(1, steps.length - 1))).toFixed(2) + '"/>';
      body += '<text x="132" y="' + (y + rowH / 2 - 1) + '" text-anchor="end" class="ax">' + esc(s.label) + '</text>';
      body += '<text x="' + (146 + bw).toFixed(1) + '" y="' + (y + rowH / 2 - 1) + '" class="ax ink">'
        + esc(fmt(s.value, 0)) + '</text>';
    });
    return figure(opts.title, opts.source, svg(w, h, body));
  }

  /* ---------------------------------------------------------- slope pair
     Our estimate against consensus. */

  function slope(opts) {
    var rows = (opts.rows || []).filter(function (r) { return r && isNum(r.left) && isNum(r.right); });
    if (!rows.length) return unavailable(opts.title, 'Nothing to compare.');
    var w = 420, h = 40 + rows.length * 34, pad = { t: 26 };
    var all = [];
    rows.forEach(function (r) { all.push(r.left, r.right); });
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var X = function (v) { return 120 + ((v - lo) / (hi - lo || 1)) * 220; };
    var body = '<text x="120" y="16" text-anchor="middle" class="ax">' + esc(opts.leftLabel || 'Consensus') + '</text>'
      + '<text x="340" y="16" text-anchor="middle" class="ax">' + esc(opts.rightLabel || 'Our model') + '</text>';
    rows.forEach(function (r, i) {
      var y = pad.t + i * 34;
      var up = r.right >= r.left;
      body += '<text x="112" y="' + (y + 4) + '" text-anchor="end" class="ax">' + esc(r.label) + '</text>';
      body += '<line x1="120" y1="' + y + '" x2="340" y2="' + y + '" stroke="' + C.grid + '"/>';
      body += '<circle cx="120" cy="' + y + '" r="4" fill="' + C.ink3 + '"/>';
      body += '<circle cx="340" cy="' + y + '" r="4" fill="' + (up ? C.s5 : C.s1) + '"/>';
      body += '<text x="348" y="' + (y + 4) + '" class="ax">' + esc(fmt(r.right)) + '</text>';
      body += '<text x="' + (X(r.left) * 0 + 92) + '" y="' + (y + 18) + '" class="ax" fill="'
        + (up ? C.s5 : C.s1) + '">' + (up ? '+' : '') + esc(((r.right - r.left) / Math.abs(r.left) * 100).toFixed(1)) + '%</text>';
    });
    return figure(opts.title, opts.source, svg(w, h, body));
  }

  /* --------------------------------------------------------- value chain */

  function valueChain(opts) {
    var nodes = (opts.nodes || []).filter(function (n) { return n && n.name; });
    if (!nodes.length) return unavailable(opts.title, 'No value chain supplied.');
    var per = 560 / nodes.length, h = 150, body = '';
    nodes.forEach(function (n, i) {
      var x = i * per + 6, bw = per - 12;
      body += '<rect x="' + x.toFixed(1) + '" y="14" width="' + bw.toFixed(1) + '" height="34" rx="3" fill="'
        + (i === nodes.length - 1 ? C.teal : C.navy) + '"/>';
      body += '<text x="' + (x + bw / 2).toFixed(1) + '" y="35" text-anchor="middle" class="ax" fill="#fff">'
        + esc(n.name) + '</text>';
      if (i < nodes.length - 1) {
        body += '<path d="M' + (x + bw + 1) + ' 31 L' + (x + per - 2) + ' 31" stroke="' + C.rule + '" stroke-width="1.5"/>';
      }
      (n.beneficiaries || []).slice(0, 6).forEach(function (b, j) {
        body += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (66 + j * 14)
          + '" text-anchor="middle" class="ax ink">' + esc(b) + '</text>';
      });
    });
    return figure(opts.title, opts.source, svg(560, h, body));
  }

  /* ------------------------------------------------------------ sparkline */

  function sparkline(values, opts) {
    opts = opts || {};
    var v = (values || []).filter(isNum);
    if (v.length < 2) return '<span class="unavailable">—</span>';
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    var w = 62, h = 16;
    var pts = v.map(function (x, i) {
      return [(i / (v.length - 1)) * w, h - ((x - lo) / (hi - lo || 1)) * (h - 3) - 1.5];
    });
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h
      + '" xmlns="http://www.w3.org/2000/svg"><polyline fill="none" stroke="'
      + (opts.color || (v[v.length - 1] >= v[0] ? C.s5 : C.s1))
      + '" stroke-width="1.4" points="'
      + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/></svg>';
  }

  /* The stylesheet the figures need, appended to the document CSS. */
  var CSS = `
.fig{margin:2.5mm 0 3.5mm;break-inside:avoid;page-break-inside:avoid;}
.fig-t{font:600 8.2pt/1.35 var(--sans);color:var(--ink2);margin-bottom:1.2mm;}
.fig-t b{color:var(--navy);}
.fig-b{background:var(--panel2);border:1px solid var(--rule2);padding:2mm 2mm 1mm;}
.fig-s{font:400 6.6pt/1.3 var(--sans);color:var(--ink4);margin-top:0.8mm;}
.fig-na{font:italic 400 7.6pt/1.4 var(--sans);color:var(--ink3);padding:6mm 2mm;text-align:center;}
.fig-l{display:flex;flex-wrap:wrap;gap:3mm;margin-top:1mm;font:400 6.8pt/1.2 var(--sans);color:var(--ink2);}
.fig-l.col{display:block;}
.fig-l span{display:flex;align-items:center;gap:1.2mm;margin-bottom:0.8mm;}
.fig-l i{width:2.4mm;height:2.4mm;border-radius:0.5mm;display:inline-block;flex:0 0 auto;}
.fig-row{display:flex;align-items:center;gap:3mm;}
.fig svg{display:block;}
.fig text.ax{font:400 6.4pt var(--sans);fill:var(--ink3);}
.fig text.ax.ink{fill:var(--ink2);}
table.heat{width:100%;border-collapse:collapse;font:400 7pt var(--sans);}
table.heat th{font-weight:600;color:var(--ink2);padding:1mm;text-align:left;}
table.heat th.num,table.heat td.num{text-align:right;}
table.heat td{padding:1mm 1.4mm;border:1px solid var(--paper);}
table.heat td.heat-na{background:var(--panel);color:var(--ink4);}
svg.spark{vertical-align:middle;}
`;

  window.EQCharts = {
    columns: columns, lines: lines, columnLine: columnLine, waterfall: waterfall,
    footballField: footballField, bullets: bullets, scatter: scatter,
    heatgrid: heatgrid, donut: donut, timeline: timeline, funnel: funnel,
    slope: slope, valueChain: valueChain, sparkline: sparkline,
    figure: figure, unavailable: unavailable,
    resetFigures: resetFigures, figureCount: function () { return FIG; },
    scaleColour: scaleColour, palette: C, CSS: CSS, fmt: fmt
  };
})(typeof window !== 'undefined' ? window : globalThis);
