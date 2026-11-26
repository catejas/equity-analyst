/* charts.js — every figure in every document.
 *
 * Inline SVG, no library. Each chart returns a complete <figure>: a numbered
 * title, the plot, a source line, and one or two sentences saying what the
 * plot shows — because a figure without a source is an assertion and a figure
 * without a reading is decoration.
 *
 * REBUILT FOR BUILD 21. Tejas put two published reports beside ours — a
 * BOBCAPS initiation and a CFA Research Challenge entry — and said what was
 * wrong: "Graphs are all properly populated with appropriate description
 * heading of x and y axis and what it means for reader with short commentary
 * on charts. Fonts size and chart size must fit and look good in the report
 * like any professionally published report using professional pastel color
 * palette."
 *
 * Measured against that, the old module failed in four specific ways:
 *
 *   1. EVERY CHART WAS A DIFFERENT SIZE. Each was drawn to its own viewBox and
 *      then scaled to fit a height cap, so a 300-unit donut was blown up to
 *      fill the column while a 560-unit football field shrank to a strip — and
 *      the type inside scaled with them. One page carried axis labels at four
 *      different sizes.
 *   2. NO AXIS SAID WHAT IT MEASURED. Units lived in the title or nowhere.
 *   3. THE NUMBERS WERE MIS-SCALED. fmt() turned any value over a lakh into
 *      "x.x L" and over a crore into "x.x cr" — on figures that were already
 *      in ₹ crore, so revenue of ₹1,62,009 Crs was labelled "1.6 L".
 *   4. THE PALETTE WAS HEAVY. Saturated navy, gold and oxblood fills.
 *
 * So there are now exactly two canvases — half the text measure and the full
 * measure — and every chart is drawn at the size it is printed, 1:1. Type is
 * the same size in every figure on every page. Every plot names its y unit
 * above the axis and its x dimension beneath it, labels its values where they
 * fit, and carries a reading. The fills are a muted, print-safe pastel set.
 *
 * Every chart still refuses rather than guesses: given no data it returns a
 * stated absence.
 */
(function (window) {
  'use strict';

  /* ── Palette ─────────────────────────────────────────────────────────
     Seven muted hues that stay distinct in greyscale order and on a laser
     printer, led by a dusty blue. No opacity anywhere: the vector PDF writer
     draws solid fills, so a tint is a colour of its own, not a transparency. */
  var C = {
    navy: '#1F3A5F', navy2: '#3F6C9B', teal: '#5FA8A0', teal2: '#BFE0DB',
    gold: '#E0A458', ink: '#22272E', ink2: '#3D4653', ink3: '#5F6772', ink4: '#8A929C',
    rule: '#C9CED6', grid: '#E9ECF0', paper: '#FFFFFF', band: '#F4F6F9',
    /* the five-step judgement scale, weak to strong, softened */
    s1: '#E08E88', s2: '#F0B37E', s3: '#C5CAD1', s4: '#8CC5B8', s5: '#5B8FB9',
    series: ['#5B8FB9', '#F0B37E', '#7FC4A8', '#B7A3D6', '#E99A94', '#A9CBE8', '#C9C79A'],
    /* text that sits on a fill of the same family */
    seriesInk: ['#2F5F88', '#B36B22', '#2F7E66', '#6B52A0', '#A9433C', '#3F6C9B', '#7A7742']
  };

  var FIG = 0;
  function resetFigures() { FIG = 0; }
  function nextFigure() { return ++FIG; }

  /* The two canvases, in px at 96dpi. A figure is printed at exactly this
     size: half is 84mm, wide is 180mm, the two widths the page grid allows. */
  var HALF = { w: 318, h: 186 };
  var WIDE = { w: 680, h: 206 };
  var FS = 8.6;            /* axis and label type, px — 6.5pt in print */
  var CH = FS * 0.54;      /* average advance of one character at that size */

  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* SVG text neither wraps nor shrinks. Anything drawn as a label is cut to
     what its slot can hold; the full text is always in the table beside it. */
  function fitLabel(t, maxPx, fontPx) {
    var s = String(t == null ? '' : t);
    var per = (fontPx || FS) * 0.54;
    var max = Math.max(3, Math.floor((maxPx || 90) / per));
    return s.length <= max ? s : s.slice(0, max - 1).replace(/[\s,;:.-]+$/, '') + '…';
  }

  /* ── Numbers ─────────────────────────────────────────────────────────
     A value is printed as the number it is, grouped the Indian way. It is
     never rescaled: the unit belongs to the axis, and the axis says it. */
  function fmt(v, dp) {
    if (!isNum(v)) return '—';
    var a = Math.abs(v);
    if (dp == null) dp = a >= 1000 ? 0 : a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 1 : 2;
    var s = v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: dp });
    return s === '-0' ? '0' : s;
  }
  function pctChange(a, b) {
    if (!isNum(a) || !isNum(b) || a === 0) return null;
    return (b - a) / Math.abs(a) * 100;
  }
  function signed(v, dp) { return (v > 0 ? '+' : '') + fmt(v, dp == null ? 1 : dp); }

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

  /* ── Figure furniture ────────────────────────────────────────────────
     Title, plot, source, reading — in that order, as one object. `wide`
     figures take the full measure; the rest take half of it and are set two
     to a row by the document (see pairFigures in render.js). */
  function figure(title, source, body, opts) {
    opts = opts || {};
    /* A figure with no title is furniture inside a panel, not an exhibit. */
    var n = (opts.unnumbered || !title) ? null : nextFigure();
    return '<figure class="fig' + (opts.wide ? ' wide' : '') + (opts.cls ? ' ' + opts.cls : '') + '">'
      + (title ? '<figcaption class="fig-t">' + esc((n ? 'Fig ' + n + ' \u2013 ' : '') + title)
        + '</figcaption>' : '')
      + '<div class="fig-b">' + body + '</div>'
      + (source ? '<div class="fig-s">Source: ' + esc(source) + '</div>' : '')
      + (opts.note ? '<div class="fig-n"><b>What it shows.</b> ' + esc(opts.note) + '</div>' : '')
      + '</figure>';
  }

  function unavailable(title, reason) {
    return figure(title, null,
      '<div class="fig-na">' + esc(reason || 'Not available.') + '</div>',
      { unnumbered: true });
  }

  /* Drawn at the size it is printed. width:100% lets it settle into its
     column; the viewBox is the same number of px, so nothing is scaled and
     8.6px type is 8.6px type in every figure. */
  function svg(w, h, inner) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '"'
      + ' style="display:block;width:100%;height:auto;max-width:' + w + 'px;overflow:hidden"'
      + ' preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img">'
      + inner + '</svg>';
  }
  function T(x, y, s, cls, anchor, fill) {
    return '<text x="' + (+x).toFixed(1) + '" y="' + (+y).toFixed(1) + '"'
      + (anchor ? ' text-anchor="' + anchor + '"' : '')
      + ' class="' + (cls || 'ax') + '"' + (fill ? ' fill="' + fill + '" style="fill:' + fill + '"' : '')
      + '>' + esc(s) + '</text>';
  }
  function R(x, y, w, h, fill, rx) {
    return '<rect x="' + (+x).toFixed(1) + '" y="' + (+y).toFixed(1) + '" width="' + Math.max(0, +w).toFixed(1)
      + '" height="' + Math.max(0, +h).toFixed(1) + '" fill="' + fill + '"' + (rx ? ' rx="' + rx + '"' : '') + '/>';
  }
  function Ln(x1, y1, x2, y2, stroke, sw, dash) {
    return '<line x1="' + (+x1).toFixed(1) + '" y1="' + (+y1).toFixed(1) + '" x2="' + (+x2).toFixed(1)
      + '" y2="' + (+y2).toFixed(1) + '" stroke="' + stroke + '" stroke-width="' + (sw || 0.7) + '"'
      + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
  }

  /* A legend drawn inside the plot, centred along the top, the way a printed
     chart carries it. Returns the markup and the height it used. */
  function legendRow(names, colours, w, y, marks) {
    var items = [];
    (names || []).forEach(function (n, i) { if (n) items.push({ n: String(n), c: colours[i], m: marks && marks[i] }); });
    if (items.length < 2 && !(items.length === 1 && marks)) return { g: '', h: 0 };
    var gap = 12, sw = 9, rows = [[]], x = 0;
    items.forEach(function (it) {
      it.w = sw + 4 + it.n.length * CH + gap;
      if (x + it.w > w - 16 && rows[rows.length - 1].length) { rows.push([]); x = 0; }
      rows[rows.length - 1].push(it); x += it.w;
    });
    var g = '';
    rows.forEach(function (row, ri) {
      var tot = row.reduce(function (a, it) { return a + it.w; }, 0) - gap;
      var cx = (w - tot) / 2, yy = y + ri * 12;
      row.forEach(function (it) {
        if (it.m === 'line') {
          g += Ln(cx, yy - 3, cx + sw, yy - 3, it.c, 1.8);
          g += '<circle cx="' + (cx + sw / 2).toFixed(1) + '" cy="' + (yy - 3).toFixed(1) + '" r="2" fill="#fff" stroke="' + it.c + '" stroke-width="1.2"/>';
        } else {
          g += R(cx, yy - 7, sw - 2, 7, it.c);
        }
        g += T(cx + sw + 3, yy, it.n, 'ax ink');
        cx += it.w;
      });
    });
    return { g: g, h: rows.length * 12 + 4 };
  }

  /* The standard plot frame: unit above the y axis, light horizontal grid,
     tick labels, category labels, and the x-axis title beneath. */
  function frame(cv, o) {
    var w = cv.w, h = cv.h;
    var yFmt = o.yFmt || function (v) { return fmt(v); };
    var labs = o.yTicks.map(yFmt);
    var padL = Math.max(26, Math.max.apply(null, labs.map(function (s) { return String(s).length; })) * CH + 9);
    var padR = o.rightTicks
      ? Math.max(24, Math.max.apply(null, o.rightTicks.map(function (s) { return String(s).length; })) * CH + 9) : 8;
    var top = (o.unit || o.unit2 ? 19 : 9) + (o.legendH || 0);
    var xl = o.xLabels || [];
    var plotW = w - padL - padR;
    var slots = o.slots || xl.length;
    var step = slots ? plotW / slots : plotW;
    /* Category labels: one line if they fit, two if they wrap at a space, and
       cut only as the last resort. */
    var perLine = Math.max(4, Math.floor((step - 2) / CH));
    var wrapped = xl.map(function (lab) {
      var words = String(lab == null ? '' : lab).split(/\s+/), lines = [''];
      words.forEach(function (wd) {
        var t = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + wd : wd;
        if (t.length <= perLine || !lines[lines.length - 1]) lines[lines.length - 1] = t;
        else if (lines.length < 2) lines.push(wd);
        else lines[1] += ' ' + wd;
      });
      return lines.map(function (l) { return fitLabel(l, step - 2); });
    });
    var xLines = wrapped.reduce(function (a, l) { return Math.max(a, l.length); }, (xl.length || o.xRows) ? 1 : 0);
    var bottom = 5 + xLines * 10 + (o.xTitle ? 12 : 0);
    var plotH = h - top - bottom;
    var lo = o.yTicks[0], hi = o.yTicks[o.yTicks.length - 1];
    var y = function (v) { return top + plotH - ((v - lo) / ((hi - lo) || 1)) * plotH; };
    var g = '';
    if (o.unit) g += T(2, 9, '(' + o.unit + ')', 'ax');
    if (o.unit2) g += T(w - 2, 9, '(' + o.unit2 + ')', 'ax', 'end');
    g += (o.legendG || '');
    o.yTicks.forEach(function (t, i) {
      g += Ln(padL, y(t), w - padR, y(t), t === 0 ? C.rule : C.grid, t === 0 ? 0.9 : 0.6);
      g += T(padL - 4, y(t) + 3, labs[i], 'ax', 'end');
    });
    /* the baseline the categories stand on */
    g += Ln(padL, top + plotH, w - padR, top + plotH, C.rule, 0.9);
    wrapped.forEach(function (lines, i) {
      lines.forEach(function (l, li) {
        g += T(padL + step * (i + 0.5), top + plotH + 11 + li * 10, l, 'ax', 'middle');
      });
    });
    if (o.xTitle) g += T(padL + plotW / 2, h - 3, o.xTitle, 'ax axt', 'middle');
    return { g: g, y: y, padL: padL, padR: padR, top: top, plotW: plotW, plotH: plotH, step: step, lo: lo, hi: hi };
  }

  /* ── Readings ────────────────────────────────────────────────────────
     One or two plain sentences computed from the data in the chart. Never a
     description of the chart ("this bar chart shows…"); always what the
     numbers did. A caller that knows more passes its own `note` instead. */
  function readSeries(name, cats, vals, unit) {
    var pts = [];
    vals.forEach(function (v, i) { if (isNum(v)) pts.push({ v: v, c: cats[i] }); });
    if (pts.length < 2) return '';
    var a = pts[0], b = pts[pts.length - 1];
    var hi = pts.reduce(function (m, p) { return p.v > m.v ? p : m; }, pts[0]);
    var lo = pts.reduce(function (m, p) { return p.v < m.v ? p : m; }, pts[0]);
    /* A unit that is a rate is written against the number; a currency goes in
       front of it; anything else follows. "(% a year, compound)" reads as
       11.0%, not "11 % a year, compound". */
    var u = String(unit || '');
    var isPct = /^%/.test(u);
    var cur = /^[₹$£€]/.test(u) ? u.charAt(0) : '';
    var rest = cur ? u.slice(1).trim() : '';
    var one = function (v) {
      if (isPct) return fmt(v, 1) + '%';
      if (cur) return cur + fmt(v) + (rest ? ' ' + rest : '');
      return fmt(v) + (u ? ' ' + u : '');
    };
    var ch = pctChange(a.v, b.v);
    var at = function (p, last) { return p.c ? ' (' + p.c + ')' : (last ? ' at the latest reading' : ''); };
    var s = (name || 'The series') + ' moved from ' + one(a.v) + at(a) + ' to ' + one(b.v) + at(b, true);
    if (isPct) s += ', a change of ' + signed(b.v - a.v) + ' percentage points';
    else if (ch != null && a.v > 0) s += ', ' + (ch >= 0 ? 'up ' : 'down ') + fmt(Math.abs(ch), 1) + '%';
    s += '.';
    if (hi !== b && hi !== a) s += ' The peak was ' + one(hi.v) + (hi.c ? ' in ' + hi.c : '') + '.';
    else if (lo !== b && lo !== a) s += ' The low was ' + one(lo.v) + (lo.c ? ' in ' + lo.c : '') + '.';
    return s;
  }
  function looksOrdered(cats) {
    return cats.length > 1 && cats.every(function (c) { return /\d/.test(String(c)); });
  }

  /* ── Columns ─────────────────────────────────────────────────────────
     Grouped or stacked. series: [{ name, values:[], color }]  categories: [] */
  function columns(opts) {
    var cats = opts.categories || [];
    var series = (opts.series || []).filter(function (s) { return s && s.values; });
    if (!cats.length || !series.length) return unavailable(opts.title, 'No data supplied.');
    var stacked = opts.stacked === true;
    var flat = [];
    if (stacked) {
      cats.forEach(function (_, i) {
        flat.push(series.reduce(function (a, s) { return a + (isNum(s.values[i]) ? s.values[i] : 0); }, 0));
      });
    } else {
      series.forEach(function (s) { s.values.forEach(function (v) { if (isNum(v)) flat.push(v); }); });
    }
    if (!flat.length) return unavailable(opts.title, 'No numeric values in the series.');
    /* A chart of zeros is a blank frame with a title. The table beside it
       already says the figures are nil. */
    if (flat.every(function (v) { return v === 0; })) return '';

    var nBars = stacked ? cats.length : cats.length * series.length;
    var wide = opts.wide === true || nBars > 12;
    var cv = wide ? WIDE : HALF;
    var cols = series.map(function (s, si) { return s.color || C.series[si % C.series.length]; });
    var lg = legendRow(series.map(function (s) { return s.name; }), cols, cv.w, opts.unit ? 27 : 17);
    /* Reference lines (build 23): a horizontal mark across the plot for a
       rate the reader should compare every bar against — the company's own
       return on equity on the multibagger chart. Their values join the range
       so a line is never drawn off the top. */
    var refs = (opts.refLines || []).filter(function (r) { return r && isNum(r.value); });
    var span = flat.concat(refs.map(function (r) { return r.value; }));
    var ticks = niceTicks(Math.min(0, Math.min.apply(null, span)), Math.max.apply(null, span) * 1.08, 4);
    var f = frame(cv, { yTicks: ticks, xLabels: cats, yFmt: opts.yFmt, unit: opts.unit,
      xTitle: opts.xTitle, legendG: lg.g, legendH: lg.h });
    var body = f.g;
    var vf = opts.vFmt || opts.yFmt || function (v) { return fmt(v); };
    var showVals = opts.values !== false && nBars <= (wide ? 24 : 10);

    cats.forEach(function (_, i) {
      if (stacked) {
        var base = 0, bw = Math.min(f.step * 0.62, 46), x = f.padL + f.step * i + (f.step - bw) / 2;
        series.forEach(function (s, si) {
          var v = s.values[i]; if (!isNum(v)) return;
          var y0 = f.y(base + v), y1 = f.y(base), hh = Math.abs(y1 - y0);
          body += R(x, Math.min(y0, y1), bw, hh, cols[si]);
          if (showVals && hh > 11) body += T(x + bw / 2, (y0 + y1) / 2 + 3, vf(v), 'ax val', 'middle', '#fff');
          base += v;
        });
        if (showVals && opts.total !== false) body += T(x + bw / 2, f.y(base) - 3, vf(base), 'ax val', 'middle');
      } else {
        var group = Math.min(f.step * 0.78, series.length * 34);
        var bw2 = group / series.length, gx = f.padL + f.step * i + (f.step - group) / 2;
        series.forEach(function (s, si) {
          var v = s.values[i]; if (!isNum(v)) return;
          var y0 = f.y(v), yz = f.y(Math.max(ticks[0], 0));
          body += R(gx + bw2 * si + 1, Math.min(y0, yz), bw2 - 2, Math.max(1, Math.abs(yz - y0)), cols[si]);
          if (showVals && bw2 >= vf(v).length * CH * 0.92) {
            body += T(gx + bw2 * (si + 0.5), v >= 0 ? y0 - 3 : y0 + 10, vf(v), 'ax val', 'middle');
          }
        });
      }
    });

    refs.forEach(function (r, ri) {
      var yy = f.y(r.value), col = r.color || C.navy;
      body += Ln(f.padL, yy, cv.w - f.padR, yy, col, 1.1, '4 3');
      /* The label sits on a white tab so it reads over the bars it crosses. */
      var lab = fitLabel(r.label, f.plotW * 0.6), lw = lab.length * CH * 1.02 + 6;
      body += R(cv.w - f.padR - lw, yy - 12, lw, 10, '#FFFFFF');
      body += T(cv.w - f.padR - 3, yy - 4, lab, 'ax val', 'end', col);
    });

    var note = opts.note;
    if (!note) {
      var lone = series.length === 1
        ? series[0].values.map(function (v, i) { return isNum(v) ? { v: v, c: cats[i] } : null; }).filter(Boolean) : [];
      if (lone.length === 1) {
        /* One bar is a figure, not a comparison. Say which it is and that the
           rest of the axis is empty because nothing was established there. */
        note = 'Only ' + lone[0].c + ' has a figure, ' + vf(lone[0].v) + '. The other '
          + (cats.length - 1) + (cats.length - 1 === 1 ? ' is' : ' are') + ' not established.';
      } else if (series.length === 1 && looksOrdered(cats)) {
        note = readSeries(series[0].name || opts.title, cats, series[0].values, opts.unit);
      } else if (series.length === 1) {
        var ps = [];
        series[0].values.forEach(function (v, i) { if (isNum(v)) ps.push({ v: v, c: cats[i] }); });
        ps.sort(function (a, b) { return b.v - a.v; });
        if (ps.length > 1) note = ps[0].c + ' is the largest at ' + vf(ps[0].v) + ' and ' + ps[ps.length - 1].c
          + ' the smallest at ' + vf(ps[ps.length - 1].v) + (ps.length > 2 ? ', with ' + (ps.length - 2) + ' between them.' : '.');
      } else {
        var best = null, worst = null;
        series.forEach(function (s) { s.values.forEach(function (v, i) {
          if (!isNum(v)) return;
          if (!best || v > best.v) best = { v: v, c: cats[i], s: s.name };
          if (!worst || v < worst.v) worst = { v: v, c: cats[i], s: s.name };
        }); });
        if (best && worst) note = 'The highest reading is ' + vf(best.v) + ' (' + best.c + ', ' + best.s
          + ') and the lowest ' + vf(worst.v) + ' (' + worst.c + ', ' + worst.s + ').';
      }
    }
    return figure(opts.title, opts.source, svg(cv.w, cv.h, body), { note: note, wide: wide });
  }

  /* ── Lines ─────────────────────────────────────────────────────────── */
  function lines(opts) {
    var cats = opts.categories || [];
    var series = (opts.series || []).filter(function (s) { return s && s.values; });
    if (!cats.length || !series.length) return unavailable(opts.title, 'No data supplied.');
    var flat = [];
    series.forEach(function (s) { s.values.forEach(function (v) { if (isNum(v)) flat.push(v); }); });
    if (!flat.length) return unavailable(opts.title, 'No numeric values in the series.');
    var wide = opts.wide === true || (opts.wide !== false && cats.length > 14);
    var cv = wide ? WIDE : HALF;
    var cols = series.map(function (s, si) { return s.color || C.series[si % C.series.length]; });
    var lg = legendRow(series.map(function (s) { return s.name; }), cols, cv.w, opts.unit ? 27 : 17,
      series.map(function () { return 'line'; }));
    var mn = Math.min.apply(null, flat), mx = Math.max.apply(null, flat);
    var ticks = niceTicks(mn >= 0 && mn < (mx - mn) ? 0 : mn, mx, 4);
    /* A long run of dates is thinned to what the axis can carry. */
    /* A caller with a long daily or weekly series has usually blanked most of
       its labels already; where it has not, they are thinned here. Either way
       the labels that remain are placed at their own points and given the
       room of the gaps between them — not one category's width, which on a
       hundred-point series is three pixels and cut every date to "20…". */
    var blanks = cats.some(function (c) { return c === '' || c == null; });
    var every = blanks ? 1 : Math.max(1, Math.ceil(cats.length / (wide ? 14 : 7)));
    var marks = [];
    cats.forEach(function (c, i) { if (c !== '' && c != null && i % every === 0) marks.push({ i: i, t: String(c) }); });
    var f = frame(cv, { yTicks: ticks, xLabels: [], xRows: 1, slots: cats.length, yFmt: opts.yFmt,
      unit: opts.unit, xTitle: opts.xTitle, legendG: lg.g, legendH: lg.h });
    var body = f.g;
    var room = marks.length ? f.plotW / marks.length : f.plotW;
    marks.forEach(function (mk, k) {
      var x = f.padL + f.step * (mk.i + 0.5);
      var anchor = k === 0 && x - f.padL < room / 2 ? 'start'
        : (k === marks.length - 1 && cv.w - f.padR - x < room / 2 ? 'end' : 'middle');
      body += T(x, f.top + f.plotH + 11, fitLabel(mk.t, room - 3), 'ax', anchor);
    });
    var vf = opts.vFmt || opts.yFmt || function (v) { return fmt(v); };
    var dense = cats.length > 10;

    series.forEach(function (s, si) {
      var col = cols[si], pts = [];
      s.values.forEach(function (v, i) { if (isNum(v)) pts.push([f.padL + f.step * (i + 0.5), f.y(v), v]); });
      if (!pts.length) return;
      var ref = s.dashed === true;
      body += '<polyline fill="none" stroke="' + col + '" stroke-width="' + (ref ? '1.1' : '1.9') + '"'
        + (ref ? ' stroke-dasharray="4 3"' : '') + ' stroke-linejoin="round" stroke-linecap="round"'
        + ' points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
      if (ref) return;
      if (!dense) pts.forEach(function (p) {
        body += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.3" fill="#fff" stroke="' + col + '" stroke-width="1.3"/>';
      });
      /* Values on a single line; the end value only when lines share a plot. */
      var ink = C.seriesInk[si % C.seriesInk.length];
      if (!dense && series.length === 1) pts.forEach(function (p) {
        body += T(p[0], p[1] - 5, vf(p[2]), 'ax val', 'middle', ink); });
      else { var e = pts[pts.length - 1];
        body += T(Math.min(e[0], cv.w - 4), e[1] - 5, vf(e[2]), 'ax val', 'end', ink); }
    });

    var note = opts.note;
    if (!note) {
      var real = series.filter(function (s) { return s.dashed !== true; });
      note = real.slice(0, 2).map(function (s) { return readSeries(s.name || opts.title, cats, s.values, opts.unit); })
        .filter(Boolean).join(' ');
    }
    return figure(opts.title, opts.source, svg(cv.w, cv.h, body), { note: note, wide: wide, cls: opts.cls });
  }

  /* ── Columns with a line on a second axis ────────────────────────────
     The most used chart in sell-side research: a quantity and its rate. */
  function columnLine(opts) {
    var cats = opts.categories || [];
    var bars = opts.bars, line = opts.line;
    if (!cats.length || !bars || !bars.values) return unavailable(opts.title, 'No data supplied.');
    var bv = bars.values.filter(isNum);
    if (!bv.length) return unavailable(opts.title, 'No numeric values in the series.');
    var wide = opts.wide === true || cats.length > 9;
    var cv = wide ? WIDE : HALF;
    var bcol = bars.color || C.series[0], lcol = (line && line.color) || C.series[1];
    var linkInk = C.seriesInk[1];
    var lv = line && line.values ? line.values.filter(isNum) : [];
    var lt = lv.length ? niceTicks(Math.min.apply(null, lv), Math.max.apply(null, lv), 4) : null;
    var lfmt = (line && line.fmt) || function (t) { return fmt(t); };
    var lg = legendRow([bars.name, lt ? line.name + ' (R)' : null], [bcol, lcol], cv.w, 27, ['bar', 'line']);
    var bticks = niceTicks(Math.min(0, Math.min.apply(null, bv)), Math.max.apply(null, bv) * 1.1, 4);
    var f = frame(cv, { yTicks: bticks, xLabels: cats, yFmt: opts.yFmt, unit: opts.unit || bars.unit,
      unit2: lt ? (opts.unit2 || line.unit || '%') : null, xTitle: opts.xTitle,
      rightTicks: lt ? lt.map(lfmt) : null, legendG: lg.g, legendH: lg.h });
    var body = f.g;
    var vf = opts.vFmt || opts.yFmt || function (v) { return fmt(v); };
    var bw = Math.min(f.step * 0.6, 40);

    bars.values.forEach(function (v, i) {
      if (!isNum(v)) return;
      var y0 = f.y(v), yz = f.y(0), x = f.padL + f.step * i + (f.step - bw) / 2;
      body += R(x, Math.min(y0, yz), bw, Math.max(1, Math.abs(yz - y0)), bcol);
      if (cats.length <= (wide ? 16 : 7)) body += T(x + bw / 2, v >= 0 ? y0 - 3 : y0 + 10, vf(v), 'ax val', 'middle');
    });
    if (lt) {
      var lo = lt[0], hi = lt[lt.length - 1];
      var ly = function (v) { return f.top + f.plotH - ((v - lo) / ((hi - lo) || 1)) * f.plotH; };
      var pts = [];
      line.values.forEach(function (v, i) { if (isNum(v)) pts.push([f.padL + f.step * (i + 0.5), ly(v)]); });
      body += '<polyline fill="none" stroke="' + lcol + '" stroke-width="1.9" stroke-linejoin="round"'
        + ' points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
      pts.forEach(function (p) {
        body += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.3" fill="#fff" stroke="' + lcol + '" stroke-width="1.3"/>';
      });
      lt.forEach(function (t) { body += T(cv.w - f.padR + 4, ly(t) + 3, lfmt(t), 'ax', 'start', linkInk); });
    }
    var note = opts.note;
    if (!note) {
      note = [readSeries(bars.name, cats, bars.values, opts.unit || bars.unit),
        lt ? readSeries(line.name, cats, line.values, opts.unit2 || line.unit || '%') : '']
        .filter(Boolean).join(' ');
    }
    return figure(opts.title, opts.source, svg(cv.w, cv.h, body), { note: note, wide: wide });
  }

  /* ── Waterfall ─────────────────────────────────────────────────────── */
  function waterfall(opts) {
    var items = (opts.items || []).filter(function (i) { return i && isNum(i.value); });
    if (!items.length) return unavailable(opts.title, 'No data supplied.');
    var wide = opts.wide === true || items.length > 6;
    var cv = wide ? WIDE : HALF;
    var run = 0, points = [], lo = 0, hi = 0;
    items.forEach(function (it) {
      if (it.total) { points.push({ from: 0, to: it.value, it: it }); run = it.value; }
      else { points.push({ from: run, to: run + it.value, it: it }); run += it.value; }
      var p = points[points.length - 1];
      lo = Math.min(lo, p.from, p.to); hi = Math.max(hi, p.from, p.to);
    });
    var ticks = niceTicks(lo, hi * 1.1, 4);
    var f = frame(cv, { yTicks: ticks, xLabels: points.map(function (p) { return p.it.label || ''; }),
      yFmt: opts.yFmt, unit: opts.unit, xTitle: opts.xTitle });
    var body = f.g, bw = Math.min(f.step * 0.62, 44);
    points.forEach(function (p, i) {
      var y0 = f.y(p.to), y1 = f.y(p.from), x = f.padL + f.step * i + (f.step - bw) / 2;
      var col = p.it.total ? C.series[0] : (p.it.value >= 0 ? C.s4 : C.s1);
      body += R(x, Math.min(y0, y1), bw, Math.max(1.5, Math.abs(y1 - y0)), col);
      body += T(x + bw / 2, Math.min(y0, y1) - 3, (p.it.total ? '' : (p.it.value > 0 ? '+' : '')) + fmt(p.it.value), 'ax val', 'middle');
      if (i < points.length - 1) body += Ln(x + bw, f.y(p.to), x + f.step, f.y(p.to), C.rule, 0.6, '2 2');
    });
    var note = opts.note;
    if (!note) {
      var steps = points.filter(function (p) { return !p.it.total; })
        .sort(function (a, b) { return Math.abs(b.it.value) - Math.abs(a.it.value); });
      if (steps.length) note = 'The largest step is ' + steps[0].it.label + ' at ' + signed(steps[0].it.value, 0)
        + '; the bridge ends at ' + fmt(points[points.length - 1].to) + '. Blue bars are totals, green adds and red takes away.';
    }
    return figure(opts.title, opts.source, svg(cv.w, cv.h, body), { note: note, wide: wide });
  }

  /* ── Horizontal ranges: the valuation "football field" ─────────────── */
  function footballField(opts) {
    var rows = (opts.rows || []).filter(function (r) { return r && isNum(r.low) && isNum(r.high); });
    if (!rows.length) return unavailable(opts.title, 'No valuation ranges supplied.');
    var price = opts.price;
    var cv = opts.wide ? WIDE : HALF;
    var w = cv.w, rowH = 24, labW = Math.min(w * 0.44, Math.max.apply(null, rows.map(function (r) {
      return String(r.label || '').length; })) * CH + 10);
    var top = 24, h = top + rows.length * rowH + 30;
    var all = [];
    rows.forEach(function (r) { all.push(r.low, r.high); });
    if (isNum(price)) all.push(price);
    var ticks = niceTicks(Math.min.apply(null, all), Math.max.apply(null, all), 4);
    var lo = ticks[0], hi = ticks[ticks.length - 1], plotW = w - labW - 14;
    var x = function (v) { return labW + ((v - lo) / ((hi - lo) || 1)) * plotW; };
    var body = '';
    if (opts.unit) body += T(2, 9, '(' + opts.unit + ')', 'ax');
    ticks.forEach(function (t) {
      body += Ln(x(t), top, x(t), top + rows.length * rowH, C.grid, 0.6);
      body += T(x(t), top + rows.length * rowH + 11, fmt(t), 'ax', 'middle');
    });
    body += Ln(labW, top + rows.length * rowH, w - 14, top + rows.length * rowH, C.rule, 0.9);
    rows.forEach(function (r, i) {
      var y = top + i * rowH + rowH / 2;
      body += T(labW - 6, y + 3, fitLabel(r.label || '', labW - 8), 'ax ink', 'end');
      body += R(x(r.low), y - 6.5, Math.max(2, x(r.high) - x(r.low)), 13, r.color || C.series[i % 2 ? 2 : 0], 1.5);
      body += T(x(r.low) - 3, y + 3, fmt(r.low), 'ax', 'end');
      body += T(x(r.high) + 3, y + 3, fmt(r.high), 'ax', 'start');
      if (isNum(r.mid)) body += Ln(x(r.mid), y - 9, x(r.mid), y + 9, C.ink, 1.4);
    });
    if (isNum(price)) {
      body += Ln(x(price), top - 4, x(price), top + rows.length * rowH, C.s1, 1.4, '4 3');
      body += T(x(price), top - 7, 'Price ' + fmt(price), 'ax val', 'middle', '#A9433C');
    }
    if (opts.xTitle) body += T(labW + plotW / 2, h - 3, opts.xTitle, 'ax axt', 'middle');
    var note = opts.note;
    if (!note && isNum(price)) {
      var below = rows.filter(function (r) { return price < r.low; }).length;
      var above = rows.filter(function (r) { return price > r.high; }).length;
      note = 'Each bar is the range one method produces and the dashed line is the price, ' + fmt(price) + '. '
        + (below === rows.length ? 'The price sits below every range.'
          : above === rows.length ? 'The price sits above every range.'
          : 'The price sits inside ' + (rows.length - below - above) + ' of ' + rows.length + ' ranges, below '
            + below + ' and above ' + above + '.');
    }
    return figure(opts.title, opts.source, svg(w, h, body), { note: note, wide: !!opts.wide });
  }

  /* ── Bullets: a score against its maximum ──────────────────────────── */
  function scaleColour(v) {
    if (!isNum(v)) return C.s3;
    if (v >= 80) return C.s5;
    if (v >= 62) return C.s4;
    if (v >= 45) return C.s3;
    if (v >= 30) return C.s2;
    return C.s1;
  }
  function bullets(opts) {
    var rows = (opts.rows || []).filter(function (r) { return r; });
    if (!rows.length) return unavailable(opts.title, 'Nothing scored.');
    var cv = opts.wide ? WIDE : HALF;
    var w = cv.w, rowH = 22, labW = Math.min(w * 0.42, Math.max.apply(null, rows.map(function (r) {
      return String(r.label || '').length; })) * CH + 10);
    var top = 16, h = top + rows.length * rowH + 22, plotW = w - labW - 34;
    var body = T(labW, 9, '(score, out of ' + (isNum(rows[0].max) ? rows[0].max : 100) + ')', 'ax');
    [0, 25, 50, 75, 100].forEach(function (t) {
      body += Ln(labW + plotW * t / 100, top, labW + plotW * t / 100, top + rows.length * rowH, C.grid, 0.6);
      body += T(labW + plotW * t / 100, top + rows.length * rowH + 11, String(t), 'ax', 'middle');
    });
    rows.forEach(function (r, i) {
      var y = top + i * rowH + rowH / 2;
      var max = isNum(r.max) ? r.max : 100;
      var pc = isNum(r.value) ? Math.max(0, Math.min(1, r.value / max)) : 0;
      body += T(labW - 6, y + 3, fitLabel(r.label || '', labW - 8), 'ax ink', 'end');
      body += R(labW, y - 5.5, plotW, 11, C.band);
      body += R(labW, y - 5.5, plotW * pc, 11, scaleColour(pc * 100));
      body += T(labW + plotW * pc + 4, y + 3, isNum(r.value) ? fmt(r.value, 1) : 'n/a', 'ax val');
    });
    var note = opts.note;
    if (!note) {
      var sc = rows.filter(function (r) { return isNum(r.value); }).sort(function (a, b) { return b.value - a.value; });
      if (sc.length > 1) note = 'Strongest on ' + sc[0].label + ' (' + fmt(sc[0].value, 1) + ') and weakest on '
        + sc[sc.length - 1].label + ' (' + fmt(sc[sc.length - 1].value, 1) + '). Blue and green bars are the stronger bands, grey is middling, amber and red are weak.';
    }
    return figure(opts.title, opts.source, svg(w, h, body), { note: note, wide: !!opts.wide });
  }

  /* ── Scatter ───────────────────────────────────────────────────────── */
  function scatter(opts) {
    var pts = (opts.points || []).filter(function (p) { return p && isNum(p.x) && isNum(p.y); });
    if (!pts.length) return unavailable(opts.title, 'No points supplied.');
    var cv = opts.wide ? WIDE : HALF;
    var w = cv.w, h = cv.h + 14;
    var xr = (opts.xRange || [0, 100]).slice(), yr = (opts.yRange || [0, 100]).slice();
    /* Build 23. A point outside the stated range was drawn outside the plot —
       on PNB's risk chart, through the catalyst table above it. The range now
       grows to hold every point, so nothing lands off the chart. */
    var grow = function (r, vals) {
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      var span = (Math.max(hi, r[1]) - Math.min(lo, r[0])) || 1;
      if (lo < r[0]) r[0] = lo - span * 0.06;
      if (hi > r[1]) r[1] = hi + span * 0.06;
      return r;
    };
    xr = grow(xr, pts.map(function (p) { return p.x; }));
    yr = grow(yr, pts.map(function (p) { return p.y; }));
    var xt = niceTicks(xr[0], xr[1], 4).filter(function (t) { return t >= xr[0] && t <= xr[1]; });
    var yt = niceTicks(yr[0], yr[1], 4).filter(function (t) { return t >= yr[0] && t <= yr[1]; });
    var padL = Math.max(26, Math.max.apply(null, yt.map(function (t) { return fmt(t).length; })) * CH + 9);
    var top = 14, bottom = 28, padR = 12;
    var plotW = w - padL - padR, plotH = h - top - bottom;
    var X = function (v) { return padL + ((v - xr[0]) / ((xr[1] - xr[0]) || 1)) * plotW; };
    var Y = function (v) { return top + plotH - ((v - yr[0]) / ((yr[1] - yr[0]) || 1)) * plotH; };
    var body = '';
    /* The quadrant that wants attention, as a flat tint. */
    /* Build 34: the tinted corner can be chosen (shade 'tr', 'tl', 'none')
       and split at given values (xMid, yMid) rather than the middle. */
    var sh = opts.shade || 'tr';
    if (sh !== 'none') {
      var xm = isNum(opts.xMid) ? Math.min(Math.max(opts.xMid, xr[0]), xr[1]) : (xr[0] + xr[1]) / 2;
      var ym = isNum(opts.yMid) ? Math.min(Math.max(opts.yMid, yr[0]), yr[1]) : (yr[0] + yr[1]) / 2;
      body += sh === 'tl' ? R(padL, top, X(xm) - padL, Y(ym) - top, '#EAF4EE')
        : R(X(xm), top, padL + plotW - X(xm), Y(ym) - top, '#FBEFEE');
    }
    yt.forEach(function (t) { body += Ln(padL, Y(t), w - padR, Y(t), C.grid, 0.6) + T(padL - 4, Y(t) + 3, fmt(t), 'ax', 'end'); });
    xt.forEach(function (t) { body += Ln(X(t), top, X(t), top + plotH, C.grid, 0.6) + T(X(t), top + plotH + 11, fmt(t), 'ax', 'middle'); });
    body += Ln(padL, top + plotH, w - padR, top + plotH, C.rule, 0.9) + Ln(padL, top, padL, top + plotH, C.rule, 0.9);
    if (opts.yLabel) body += T(2, 9, '(' + opts.yLabel + ')', 'ax');
    if (opts.xLabel) body += T(padL + plotW / 2, h - 3, opts.xLabel, 'ax axt', 'middle');
    var placed = [];
    pts.forEach(function (p, i) {
      var col = p.emph ? C.navy : (p.color || C.series[i % C.series.length]);
      body += '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="' + (p.emph ? 6 : p.label && !p.title ? 7 : 4.5)
        + '" fill="' + col + '" stroke="#fff" stroke-width="0.8"/>';
      if (p.title) {
        var right = X(p.x) < padL + plotW * 0.66;
        var lab = fitLabel(p.title, plotW * 0.34);
        var lw = lab.length * CH * 1.02, lx0 = right ? X(p.x) + 8 : X(p.x) - 8 - lw;
        /* Labels of nearby points are moved apart vertically so two names
           never print on top of each other (build 23: PNB, Union Bank and
           Canara Bank sat on one line). */
        var base = Y(p.y) + 3, ly = base, offs = [10, -10, 20, -20, 30, -30], tries = 0;
        var clash = function (yv) { return placed.some(function (b) { return lx0 < b.x2 && lx0 + lw > b.x1 && Math.abs(yv - b.y) < 9; }); };
        while (clash(ly) && tries < offs.length) { ly = base + offs[tries++]; }
        placed.push({ x1: lx0, x2: lx0 + lw, y: ly });
        if (Math.abs(ly - (Y(p.y) + 3)) > 1) body += Ln(X(p.x), Y(p.y), right ? lx0 - 1 : lx0 + lw + 1, ly - 3, '#B8C2CC', 0.5);
        body += T(X(p.x) + (right ? 8 : -8), ly, lab, p.emph ? 'ax val' : 'ax ink', right ? 'start' : 'end');
      } else if (p.label) {
        body += T(X(p.x), Y(p.y) + 3, p.label, 'ax val', 'middle', '#fff');
      }
    });
    var note = opts.note || ('Each point is one item. Further right means more ' + String(opts.xLabel || 'on the x axis').toLowerCase()
      + '; higher means more ' + String(opts.yLabel || 'on the y axis').toLowerCase()
      + '. The shaded corner is where both are high.');
    return figure(opts.title, opts.source, svg(w, h, body), { note: note, wide: !!opts.wide });
  }

  /* ── Heat grid: the sensitivity table, tinted ──────────────────────── */
  function mix(a, b, t) {
    function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
    var A = hex(a), B = hex(b);
    var r = A.map(function (v, i) { return Math.round(v + (B[i] - v) * Math.max(0, Math.min(1, t))); });
    return 'rgb(' + r.join(',') + ')';
  }
  function heatgrid(opts) {
    var rows = opts.rows || [];
    if (!rows.length) return unavailable(opts.title, 'No grid supplied.');
    var vals = [];
    rows.forEach(function (r) { (r.cells || []).forEach(function (c) { if (isNum(c.value)) vals.push(c.value); }); });
    if (!vals.length) return unavailable(opts.title, 'The grid has no computable cells.');
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var head = '<tr><th>' + esc(opts.corner || '') + '</th>' + (opts.columns || []).map(function (c) {
      return '<th class="num">' + esc(c) + '</th>'; }).join('') + '</tr>';
    var body = rows.map(function (r) {
      return '<tr><th scope="row">' + esc(r.label) + '</th>' + (r.cells || []).map(function (c) {
        if (!isNum(c.value)) return '<td class="num heat-na">—</td>';
        var t = hi === lo ? 0.5 : (c.value - lo) / (hi - lo);
        /* pale red through white to pale blue: legible in print, and the
           figure in the cell stays dark on every tint */
        var bg = t < 0.5 ? mix('#F3C6C2', '#FFFFFF', t * 2) : mix('#FFFFFF', '#BCD6EC', (t - 0.5) * 2);
        return '<td class="num" style="background:' + bg + '">' + esc(fmt(c.value)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var note = opts.note || ('Each cell is the value under one pair of assumptions. It runs from ' + fmt(lo) + ' to '
      + fmt(hi) + ' across the grid; red cells are the low end and blue the high end.');
    return figure(opts.title, opts.source,
      '<table class="heat"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>', { note: note, wide: true });
  }

  /* ── Donut ─────────────────────────────────────────────────────────── */
  function donut(opts) {
    var slices = (opts.slices || []).filter(function (s) { return s && isNum(s.value) && s.value > 0; });
    if (!slices.length) return unavailable(opts.title, 'No shares supplied.');
    var total = slices.reduce(function (a, s) { return a + s.value; }, 0);
    var cv = HALF, w = cv.w, h = Math.max(150, 20 + slices.length * 15);
    var cx = 74, cy = h / 2, Rr = 62, r = 36;
    var body = '', ang = -Math.PI / 2;
    var cols = slices.map(function (s, i) { return s.color || C.series[i % C.series.length]; });
    slices.forEach(function (s, i) {
      var frac = s.value / total, end = ang + frac * 2 * Math.PI;
      /* A single slice of 100% is two half-arcs: one arc from a point to
         itself draws nothing. */
      var segs = frac > 0.999 ? [[ang, ang + Math.PI], [ang + Math.PI, end]] : [[ang, end]];
      segs.forEach(function (sg) {
        var big = (sg[1] - sg[0]) > Math.PI ? 1 : 0;
        var p = function (a, rad) { return [(cx + rad * Math.cos(a)).toFixed(2), (cy + rad * Math.sin(a)).toFixed(2)]; };
        var o1 = p(sg[0], Rr), o2 = p(sg[1], Rr), i1 = p(sg[1], r), i2 = p(sg[0], r);
        body += '<path d="M' + o1 + ' A' + Rr + ' ' + Rr + ' 0 ' + big + ' 1 ' + o2
          + ' L' + i1 + ' A' + r + ' ' + r + ' 0 ' + big + ' 0 ' + i2 + ' Z" fill="' + cols[i] + '" stroke="#fff" stroke-width="1"/>';
      });
      ang = end;
    });
    body += T(cx, cy - 1, opts.centre || '100%', 'ax val', 'middle') + T(cx, cy + 9, opts.centreSub || 'of total', 'ax', 'middle');
    var lx = 152, ly = h / 2 - slices.length * 15 / 2 + 10;
    slices.forEach(function (s, i) {
      body += R(lx, ly + i * 15 - 7, 8, 8, cols[i]);
      body += T(lx + 12, ly + i * 15, fitLabel(s.label, w - lx - 12 - 40), 'ax ink');
      body += T(w - 2, ly + i * 15, fmt(s.value / total * 100, 1) + '%', 'ax val', 'end');
    });
    var note = opts.note;
    if (!note) {
      var srt = slices.slice().sort(function (a, b) { return b.value - a.value; });
      note = srt[0].label + ' is the largest share at ' + fmt(srt[0].value / total * 100, 1) + '%'
        + (srt.length > 2 ? '; the three largest together hold ' + fmt((srt[0].value + srt[1].value + srt[2].value) / total * 100, 1) + '%.' : '.');
    }
    return figure(opts.title, opts.source, svg(w, h, body), { note: note });
  }

  /* ── Timeline ──────────────────────────────────────────────────────── */
  function timeline(opts) {
    var items = (opts.items || []).filter(function (i) { return i && i.label; });
    if (!items.length) return unavailable(opts.title, 'No dated events supplied.');
    var w = WIDE.w, rowH = 17, top = 8, h = top + items.length * rowH + 6, lx = 96;
    var body = Ln(lx, top, lx, h - 6, C.rule, 1.2);
    items.forEach(function (it, i) {
      var y = top + i * rowH + 8;
      body += '<circle cx="' + lx + '" cy="' + y + '" r="3.6" fill="' + (it.color || C.series[0]) + '" stroke="#fff" stroke-width="1"/>';
      body += T(lx - 9, y + 3, fitLabel(it.when || '', lx - 12), 'ax val', 'end');
      body += T(lx + 10, y + 3, fitLabel(it.label, w - lx - 14), 'ax ink');
    });
    var note = opts.note || (items.length + ' dated ' + (items.length === 1 ? 'event' : 'events')
      + ', in order. The first is ' + (items[0].when ? items[0].when + ': ' : '') + items[0].label.replace(/\.$/, '') + '.');
    return figure(opts.title, opts.source, svg(w, h, body), { note: note, wide: true });
  }

  /* ── Funnel ────────────────────────────────────────────────────────── */
  function funnel(opts) {
    var steps = (opts.steps || []).filter(function (s) { return s && isNum(s.value); });
    if (!steps.length) return unavailable(opts.title, 'No funnel supplied.');
    var topV = Math.max.apply(null, steps.map(function (s) { return s.value; })) || 1;
    var w = HALF.w, rowH = 23, top = 14, h = top + steps.length * rowH + 4;
    var labW = Math.min(w * 0.46, Math.max.apply(null, steps.map(function (s) { return String(s.label).length; })) * CH + 10);
    var plotW = w - labW - 30;
    var body = T(labW, 9, '(' + (opts.unit || 'companies') + ')', 'ax');
    steps.forEach(function (s, i) {
      var bw = Math.max(3, (s.value || 0) / topV * plotW), y = top + i * rowH;
      body += T(labW - 6, y + rowH / 2 + 2, fitLabel(s.label, labW - 8), 'ax ink', 'end');
      body += R(labW, y + 3, bw, rowH - 8, mix('#A9CBE8', '#3F6C9B', steps.length > 1 ? i / (steps.length - 1) : 1));
      body += T(labW + bw + 4, y + rowH / 2 + 2, fmt(s.value, 0), 'ax val');
    });
    var note = opts.note;
    if (!note && steps.length > 1) {
      var a = steps[0], b = steps[steps.length - 1];
      note = fmt(a.value, 0) + ' at "' + a.label + '" came down to ' + fmt(b.value, 0) + ' at "' + b.label + '"'
        + (a.value > 0 ? ' — ' + fmt(b.value / a.value * 100, 0) + '% of where it started.' : '.');
    }
    return figure(opts.title, opts.source, svg(w, h, body), { note: note });
  }

  /* ── Slope pair: our estimate against consensus ────────────────────── */
  function slope(opts) {
    var rows = (opts.rows || []).filter(function (r) { return r && isNum(r.left) && isNum(r.right); });
    if (!rows.length) return unavailable(opts.title, 'Nothing to compare.');
    var w = HALF.w, rowH = 24, top = 22, h = top + rows.length * rowH + 4;
    var labW = Math.min(w * 0.34, Math.max.apply(null, rows.map(function (r) { return String(r.label).length; })) * CH + 10);
    var x1 = labW + 44, x2 = w - 84;
    var body = T(x1, 10, opts.leftLabel || 'Consensus', 'ax val', 'middle') + T(x2, 10, opts.rightLabel || 'Our model', 'ax val', 'middle');
    var up = 0;
    rows.forEach(function (r, i) {
      var y = top + i * rowH + 8, more = r.right >= r.left;
      if (more) up++;
      var ink = more ? '#2F7E66' : '#A9433C';
      body += T(labW - 6, y + 3, fitLabel(r.label, labW - 8), 'ax ink', 'end');
      body += Ln(x1, y, x2, y, C.rule, 0.8);
      body += '<circle cx="' + x1 + '" cy="' + y + '" r="3.4" fill="' + C.s3 + '"/>';
      body += '<circle cx="' + x2 + '" cy="' + y + '" r="3.4" fill="' + (more ? C.s4 : C.s1) + '"/>';
      body += T(x1 - 7, y + 3, fmt(r.left), 'ax', 'end') + T(x2 + 7, y + 3, fmt(r.right), 'ax val');
      var d = pctChange(r.left, r.right);
      if (d != null) body += T(w - 2, y + 3, signed(d) + '%', 'ax val', 'end', ink);
    });
    var note = opts.note || ('Our figure is above consensus on ' + up + ' of ' + rows.length
      + ' lines. The right-hand column is the gap, as a percentage of consensus.');
    return figure(opts.title, opts.source, svg(w, h, body), { note: note });
  }

  /* ── Value chain ───────────────────────────────────────────────────── */
  function valueChain(opts) {
    var nodes = (opts.nodes || []).filter(function (n) { return n && n.name; });
    if (!nodes.length) return unavailable(opts.title, 'No value chain supplied.');
    var w = WIDE.w, per = w / nodes.length;
    var most = Math.min(6, Math.max.apply(null, nodes.map(function (n) { return (n.beneficiaries || []).length; })));
    var h = 46 + most * 11 + 4, body = '';
    nodes.forEach(function (n, i) {
      var x = i * per + 4, bw = per - 16;
      body += R(x, 6, bw, 24, i % 2 ? '#DCE9F5' : '#C5DCF0', 2);
      body += T(x + bw / 2, 21.5, fitLabel(n.name, bw - 6), 'ax val', 'middle', C.navy);
      if (i < nodes.length - 1) {
        var ax = x + bw + 2;
        body += '<polygon points="' + ax + ',13 ' + (ax + 8) + ',18 ' + ax + ',23" fill="' + C.rule + '"/>';
      }
      (n.beneficiaries || []).slice(0, 6).forEach(function (b, j) {
        body += T(x + bw / 2, 44 + j * 11, fitLabel(b, bw), 'ax ink', 'middle');
      });
    });
    var note = opts.note || ('The chain runs left to right through ' + nodes.length + ' stages, from '
      + nodes[0].name + ' to ' + nodes[nodes.length - 1].name + '. Listed companies are named under the stage they sit at.');
    return figure(opts.title, opts.source, svg(w, h, body), { note: note, wide: true });
  }

  /* ── Sparkline ─────────────────────────────────────────────────────── */
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
      + (opts.color || (v[v.length - 1] >= v[0] ? '#3F9B84' : '#C96A63'))
      + '" stroke-width="1.4" points="'
      + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/></svg>';
  }

  /* The stylesheet the figures need, appended to the document CSS. Type is in
     px on purpose: a chart is drawn in px, and its labels must not follow the
     page's point scale up or down. */
  var CSS = `
:root{ --sans:"Helvetica Neue",Helvetica,Arial,sans-serif; }
.fig{ margin:0 0 4mm; break-inside:avoid; page-break-inside:avoid; }
.fig-t{ font:700 8.6pt/1.3 var(--sans); color:var(--ink); padding-bottom:1.1mm; margin-bottom:1.6mm;
        border-bottom:.9pt solid var(--ink); }
.fig-t b{ font-weight:700; }
.fig-b{ padding:0; }
.fig-s{ font:400 6.2pt/1.3 var(--sans); color:var(--ink3); margin-top:1mm; padding-top:.9mm;
        border-top:.5pt solid var(--accent, #C9CED6); }
.fig-n{ font:400 7.6pt/1.42 var(--sans); color:var(--ink2); margin-top:1.4mm; }
.fig-n b{ font-weight:700; color:var(--ink); }
.fig-na{ font:italic 400 7.8pt/1.4 var(--sans); color:var(--ink3); padding:7mm 2mm; text-align:center;
         background:#F4F6F9; }
.fig svg{ display:block; }
.fig text{ font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
.fig text.ax{ font-size:8.6px; font-weight:400; fill:#5F6772; }
.fig text.ax.ink{ fill:#22272E; }
.fig text.ax.val{ font-weight:700; fill:#22272E; }
.fig text.ax.axt{ font-weight:700; fill:#3D4653; }
/* Two half-measure figures to a row; a figure with no neighbour takes the
   left half and its reading takes the right. */
figure.figrow{ display:grid; grid-template-columns:1fr 1fr; column-gap:7mm; align-items:start;
               margin:1mm 0 3mm; break-inside:avoid; page-break-inside:avoid; }
figure.figrow > .fig{ margin:0 0 1mm; min-width:0; }
figure.figrow.solo > .fig{ grid-column:1 / 3; display:grid; grid-template-columns:1fr 1fr; column-gap:7mm;
                           grid-template-rows:auto auto auto; }
figure.figrow.solo > .fig > .fig-t, figure.figrow.solo > .fig > .fig-b,
figure.figrow.solo > .fig > .fig-s{ grid-column:1; }
figure.figrow.solo > .fig > .fig-n{ grid-column:2; grid-row:1 / 4; align-self:center; margin:0;
        padding:2.4mm 0 2.4mm 4mm; border-left:1.6pt solid var(--accent, #5B8FB9); font-size:8.4pt; line-height:1.5; }
.fig.wide{ margin:1mm 0 4mm; }
table.heat{ width:100%; border-collapse:collapse; font:400 7.6pt var(--sans); }
table.heat th{ font-weight:700; color:var(--ink2); padding:1.2mm 1.4mm; text-align:left; background:#E9ECF0;
               border:0; text-transform:none; letter-spacing:0; font-size:7.4pt; }
table.heat th.num,table.heat td.num{ text-align:right; }
table.heat td{ padding:1.2mm 1.6mm; border:1px solid #fff; color:#22272E; font-size:7.6pt; }
table.heat td.heat-na{ background:#F4F6F9; color:var(--ink4); }
svg.spark{ vertical-align:middle; }
`;

  window.EQCharts = {
    columns: columns, lines: lines, columnLine: columnLine, waterfall: waterfall,
    footballField: footballField, bullets: bullets, scatter: scatter,
    heatgrid: heatgrid, donut: donut, timeline: timeline, funnel: funnel,
    slope: slope, valueChain: valueChain, sparkline: sparkline,
    figure: figure, unavailable: unavailable,
    resetFigures: resetFigures, figureCount: function () { return FIG; },
    fitLabel: fitLabel, scaleColour: scaleColour, palette: C, CSS: CSS, fmt: fmt,
    HALF: HALF, WIDE: WIDE
  };
})(typeof window !== 'undefined' ? window : globalThis);
