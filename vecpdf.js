/* ============================================================================
   vecpdf.js — write the report to a real vector PDF, in the browser.

   Why this exists.

   Share used to build the PDF with html2canvas and jsPDF: every page was
   photographed and the photograph pasted in. It produced a File, so the Web
   Share API worked and the iPhone share sheet opened directly — but the file
   was 9.2 MB of bitmaps, blurred at zoom, and the text in it was a hidden
   layer pasted behind the picture.

   The fix for that was to route Share through the print preview, because the
   browser's own print path writes proper vector PDFs. It did, and the same
   document came out at 135 KB. But it also meant that tapping Share opened the
   printer, which is not sharing. Tejas put it plainly: "Share button is not
   working directly and this is very inconvenient."

   Both objections are right, and neither has to be paid. The documents are
   Helvetica text, flat rules, and inline SVG charts drawn from six primitives.
   That is exactly the set a PDF can hold natively. So this walks the laid-out
   DOM and writes the same shapes into jsPDF as vectors: text stays text,
   rules stay rules, charts stay curves. No canvas is involved at any point.

   The result is a File — so navigator.share() takes it and the share sheet
   opens on the first tap — at print-path size and print-path sharpness.

   Coordinates. Everything is measured in CSS pixels against the page box and
   converted once: k = 595.276pt / boxWidthPx. The content box is 210 x 263mm
   (see --pageh in render.js) and is centred on an A4 sheet, so a printed copy
   has the same margins a printed copy has always had.
   ========================================================================== */
(function () {
  'use strict';

  var PT_W = 595.276, PT_H = 841.89;              /* A4 in points */

  /* jsPDF's built-in Helvetica is WinAnsi. Everything the reports use is in
     that set except these two, which have exact typographic stand-ins. */
  var SUBS = { '≈': '~', '−': '-', ' ': ' ', ' ': ' ',
    ' ': ' ', ' ': ' ', ' ': ' ', '﻿': '' };
  function ascii(s) {
    return String(s == null ? '' : s).replace(/[≈−     ﻿]/g,
      function (c) { return SUBS[c]; });
  }

  /* --- colour -------------------------------------------------------------
     getComputedStyle hands back "rgb(r, g, b)" or "rgba(r, g, b, a)". Anything
     fully transparent is not drawn at all, which is what keeps the file small:
     most elements have no background and contribute nothing. */
  function rgb(v) {
    if (!v) return null;
    var m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/.exec(v);
    if (!m) return null;
    var a = m[4] == null ? 1 : parseFloat(m[4]);
    if (!(a > 0.02)) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: a };
  }

  /* --- the writer ---------------------------------------------------------
     One instance per document. Holds the jsPDF handle, the current page's
     origin, and the scale. Keeping the transform here rather than passing it
     down every call is what keeps the shape emitters readable. */
  function Writer(pdf, box, k, offY) {
    this.pdf = pdf; this.box = box; this.k = k; this.offY = offY;
    this._fill = null; this._stroke = null; this._lw = null; this._text = null;
    this._font = null; this._size = null; this._space = 0;
  }
  Writer.prototype.X = function (px) { return (px - this.box.left) * this.k; };
  Writer.prototype.Y = function (px) { return (px - this.box.top) * this.k + this.offY; };
  Writer.prototype.L = function (px) { return px * this.k; };

  Writer.prototype.fill = function (c) {
    var key = c.r + ',' + c.g + ',' + c.b;
    if (this._fill !== key) { this.pdf.setFillColor(c.r, c.g, c.b); this._fill = key; }
  };
  /* jsPDF keeps text colour separate from fill colour: setFillColor paints
     shapes, setTextColor paints glyphs. Setting only the first is why the
     first vector proof came out in flat black — every heading that should have
     been the house navy, and every muted caption that should have been grey,
     was drawn in the default ink. */
  Writer.prototype.textColor = function (c) {
    var key = c.r + ',' + c.g + ',' + c.b;
    if (this._text !== key) { this.pdf.setTextColor(c.r, c.g, c.b); this._text = key; }
  };
  Writer.prototype.stroke = function (c, w) {
    var key = c.r + ',' + c.g + ',' + c.b;
    if (this._stroke !== key) { this.pdf.setDrawColor(c.r, c.g, c.b); this._stroke = key; }
    if (this._lw !== w) { this.pdf.setLineWidth(w); this._lw = w; }
  };
  Writer.prototype.font = function (style, size, space) {
    if (this._font !== style) { this.pdf.setFont('helvetica', style); this._font = style; }
    if (this._size !== size) { this.pdf.setFontSize(size); this._size = size; }
    space = space || 0;
    if (this._space !== space) { this.pdf.setCharSpace(space); this._space = space; }
  };
  Writer.prototype.newPage = function () {
    this.pdf.addPage();
    this._fill = this._stroke = this._lw = this._font = this._size = this._text = null; this._space = 0;
  };

  /* Rect in CSS px, optionally rounded. Sub-pixel rules are kept: a 0.4px hair
     rule is a real design element in these documents and rounding it to zero
     is how a table loses its grid. */
  Writer.prototype.rect = function (x, y, w, h, colour, radius) {
    if (!(w > 0.05) || !(h > 0.05)) return;
    this.fill(colour);
    var X = this.X(x), Y = this.Y(y), W = this.L(w), H = this.L(h);
    var r = Math.min(this.L(radius || 0), W / 2, H / 2);
    if (r > 0.4) this.pdf.roundedRect(X, Y, W, H, r, r, 'F');
    else this.pdf.rect(X, Y, W, H, 'F');
  };

  Writer.prototype.line = function (x1, y1, x2, y2, colour, w) {
    this.stroke(colour, Math.max(0.12, this.L(w)));
    this.pdf.line(this.X(x1), this.Y(y1), this.X(x2), this.Y(y2));
  };

  Writer.prototype.poly = function (pts, fillC, strokeC, w, close) {
    if (pts.length < 2) return;
    var self = this;
    var mapped = pts.map(function (p) { return [self.X(p[0]), self.Y(p[1])]; });
    var deltas = [];
    for (var i = 1; i < mapped.length; i++) {
      deltas.push([mapped[i][0] - mapped[i - 1][0], mapped[i][1] - mapped[i - 1][1]]);
    }
    var style = '';
    if (fillC) { this.fill(fillC); style += 'F'; }
    if (strokeC) { this.stroke(strokeC, Math.max(0.12, this.L(w || 1))); style += 'D'; }
    if (!style) return;
    this.pdf.lines(deltas, mapped[0][0], mapped[0][1], [1, 1], style, !!close);
  };

  Writer.prototype.circle = function (cx, cy, r, fillC, strokeC, w) {
    var R = this.L(r);
    if (!(R > 0.15)) return;
    var style = '';
    if (fillC) { this.fill(fillC); style += 'F'; }
    if (strokeC) { this.stroke(strokeC, Math.max(0.12, this.L(w || 1))); style += 'D'; }
    if (!style) return;
    this.pdf.circle(this.X(cx), this.Y(cy), R, style);
  };

  /* Text. The position comes from the browser's own layout, so alignment,
     wrapping, tabular figures and letter-spacing are all already resolved —
     there is nothing to re-decide here, only to transcribe. */
  Writer.prototype.text = function (str, x, baseline, colour, style, sizePx, spacePx) {
    str = ascii(str);
    if (!str.trim()) return;
    this.textColor(colour);
    this.font(style, this.L(sizePx), this.L(spacePx || 0));
    this.pdf.text(str, this.X(x), this.Y(baseline), { baseline: 'alphabetic' });
  };

  /* --- SVG ---------------------------------------------------------------
     The charts are hand-built SVG using six primitives and no groups, no
     gradients and no clip paths, which is why this is a page rather than a
     library. Coordinates go through getScreenCTM, so a chart drawn in its own
     user units lands in the same CSS-pixel space as everything else. */
  function ctmPoint(svg, m, x, y) {
    var p = svg.createSVGPoint(); p.x = x; p.y = y;
    return p.matrixTransform(m);
  }
  function svgLen(m) { return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; }

  /* Arcs are sampled rather than converted to beziers. The only arcs in these
     documents are donut segments; at half a degree a sampled arc and a true
     one are indistinguishable at any zoom a reader will use, and the sampler
     is fifty lines shorter than a correct endpoint-to-centre conversion. */
  function arcPoints(x0, y0, rx, ry, rot, large, sweep, x1, y1) {
    var out = [];
    if (!(rx > 0) || !(ry > 0)) return [[x1, y1]];
    var phi = rot * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi);
    var dx2 = (x0 - x1) / 2, dy2 = (y0 - y1) / 2;
    var x1p = cp * dx2 + sp * dy2, y1p = -sp * dx2 + cp * dy2;
    var lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { var s = Math.sqrt(lam); rx *= s; ry *= s; }
    var num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    var den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    var co = Math.sqrt(Math.max(0, num / (den || 1))) * (large === sweep ? -1 : 1);
    var cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    var cx = cp * cxp - sp * cyp + (x0 + x1) / 2;
    var cy = sp * cxp + cp * cyp + (y0 + y1) / 2;
    var ang = function (ux, uy, vx, vy) {
      var d = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy)) || 1;
      var a = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / d)));
      return (ux * vy - uy * vx < 0) ? -a : a;
    };
    var t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    var dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI;
    if (sweep && dt < 0) dt += 2 * Math.PI;
    var steps = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 360)));
    for (var i = 1; i <= steps; i++) {
      var t = t1 + dt * (i / steps);
      var ct = Math.cos(t), st = Math.sin(t);
      out.push([cp * rx * ct - sp * ry * st + cx, sp * rx * ct + cp * ry * st + cy]);
    }
    return out;
  }

  /* A path parser for the commands these charts emit: M, L, H, V, C, A and Z,
     absolute and relative. Anything else is skipped rather than guessed at —
     a wrong curve is worse than a missing one, and this fails visibly. */
  function pathPoints(d) {
    var toks = String(d).match(/[MmLlHhVvCcSsQqTtAaZz]|-?[\d.]+(?:e-?\d+)?/g) || [];
    var subs = [], cur = null, x = 0, y = 0, sx = 0, sy = 0, cmd = '', i = 0;
    function num() { return parseFloat(toks[i++]); }
    function push(px, py) { if (!cur) { cur = { pts: [], close: false }; subs.push(cur); } cur.pts.push([px, py]); }
    while (i < toks.length) {
      var t = toks[i];
      if (/^[A-Za-z]$/.test(t)) { cmd = t; i++; } else if (!cmd) { i++; continue; }
      var rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
      if (C === 'M') {
        var mx = num(), my = num(); x = rel ? x + mx : mx; y = rel ? y + my : my;
        cur = null; push(x, y); sx = x; sy = y; cmd = rel ? 'l' : 'L';
      } else if (C === 'L') {
        var lx = num(), ly = num(); x = rel ? x + lx : lx; y = rel ? y + ly : ly; push(x, y);
      } else if (C === 'H') { var hx = num(); x = rel ? x + hx : hx; push(x, y); }
      else if (C === 'V') { var vy = num(); y = rel ? y + vy : vy; push(x, y); }
      else if (C === 'C') {
        var c1x = num(), c1y = num(), c2x = num(), c2y = num(), ex = num(), ey = num();
        var ax = rel ? x + c1x : c1x, ay = rel ? y + c1y : c1y;
        var bx = rel ? x + c2x : c2x, by = rel ? y + c2y : c2y;
        var nx = rel ? x + ex : ex, ny = rel ? y + ey : ey;
        for (var s = 1; s <= 24; s++) {
          var u = s / 24, v = 1 - u;
          push(v * v * v * x + 3 * v * v * u * ax + 3 * v * u * u * bx + u * u * u * nx,
            v * v * v * y + 3 * v * v * u * ay + 3 * v * u * u * by + u * u * u * ny);
        }
        x = nx; y = ny;
      } else if (C === 'A') {
        var rx = num(), ry = num(), rot = num(), lg = num(), sw = num();
        var axe = num(), aye = num();
        var tx = rel ? x + axe : axe, ty = rel ? y + aye : aye;
        arcPoints(x, y, Math.abs(rx), Math.abs(ry), rot, lg, sw, tx, ty)
          .forEach(function (p) { push(p[0], p[1]); });
        x = tx; y = ty;
      } else if (C === 'Z') { if (cur) cur.close = true; x = sx; y = sy; cur = null; i++; }
      else { i++; }   /* a command this parser does not write is not invented */
    }
    return subs;
  }

  function drawSvg(w, svg) {
    var nodes = svg.querySelectorAll('rect,line,circle,ellipse,polyline,polygon,path,text');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue;
      var m; try { m = el.getScreenCTM(); } catch (e) { m = null; }
      if (!m) continue;
      var scale = svgLen(m);
      var f = rgb(cs.fill), st = rgb(cs.stroke);
      var sw = parseFloat(cs.strokeWidth) || 0;
      if (!(sw > 0)) st = null;
      var tag = el.tagName.toLowerCase();
      var P = function (ux, uy) { var p = ctmPoint(svg, m, ux, uy); return [p.x, p.y]; };

      if (tag === 'text') {
        var col = f || { r: 0, g: 0, b: 0 };
        var fs = (parseFloat(cs.fontSize) || 10);
        /* The browser has already resolved text-anchor into a box, so the box
           is the truth: reading it back beats re-deriving the anchor. */
        var bb = el.getBoundingClientRect();
        var anchor = cs.textAnchor || 'start';
        var str = ascii(el.textContent || '');
        if (!str.trim()) continue;
        w.font(/^(bold|[6-9]00)$/.test(cs.fontWeight) ? 'bold' : 'normal', w.L(fs), 0);
        var tw = w.pdf.getTextWidth(str);
        var x0 = anchor === 'middle' ? (bb.left + bb.right) / 2 - tw / (2 * w.k)
          : anchor === 'end' ? bb.right - tw / w.k : bb.left;
        w.text(str, x0, bb.bottom - fs * 0.20, col,
          /^(bold|[6-9]00)$/.test(cs.fontWeight) ? 'bold' : 'normal', fs, 0);
        continue;
      }
      if (tag === 'rect') {
        var rx = +el.getAttribute('x') || 0, ry = +el.getAttribute('y') || 0;
        var rw = +el.getAttribute('width') || 0, rh = +el.getAttribute('height') || 0;
        var a = P(rx, ry), c = P(rx + rw, ry + rh);
        var rr = (+el.getAttribute('rx') || 0) * scale;
        if (f) w.rect(Math.min(a[0], c[0]), Math.min(a[1], c[1]),
          Math.abs(c[0] - a[0]), Math.abs(c[1] - a[1]), f, rr);
        if (st) {
          var b1 = P(rx + rw, ry), b2 = P(rx, ry + rh);
          w.poly([a, b1, c, b2], null, st, sw * scale, true);
        }
      } else if (tag === 'line') {
        var p1 = P(+el.getAttribute('x1') || 0, +el.getAttribute('y1') || 0);
        var p2 = P(+el.getAttribute('x2') || 0, +el.getAttribute('y2') || 0);
        if (st) {
          var dash = (cs.strokeDasharray || '').replace(/none/, '').trim();
          if (dash) w.dashLine(p1, p2, st, sw * scale, dash.split(/[\s,]+/).map(Number).map(function (v) { return v * scale; }));
          else w.line(p1[0], p1[1], p2[0], p2[1], st, sw * scale);
        }
      } else if (tag === 'circle' || tag === 'ellipse') {
        var cx = +(el.getAttribute('cx') || 0), cy = +(el.getAttribute('cy') || 0);
        var r = tag === 'circle' ? +(el.getAttribute('r') || 0) : +(el.getAttribute('rx') || 0);
        var cc = P(cx, cy);
        w.circle(cc[0], cc[1], r * scale, f, st, sw * scale);
      } else if (tag === 'polyline' || tag === 'polygon') {
        var raw = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
        var pts = [];
        for (var q = 0; q + 1 < raw.length; q += 2) pts.push(P(raw[q], raw[q + 1]));
        w.poly(pts, tag === 'polygon' ? f : null, st, sw * scale, tag === 'polygon');
      } else if (tag === 'path') {
        pathPoints(el.getAttribute('d') || '').forEach(function (sub) {
          var pts = sub.pts.map(function (p) { return P(p[0], p[1]); });
          w.poly(pts, sub.close ? f : null, st, sw * scale, sub.close);
        });
      }
    }
  }

  Writer.prototype.dashLine = function (p1, p2, colour, w, pattern) {
    var dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    var len = Math.sqrt(dx * dx + dy * dy);
    if (!(len > 0)) return;
    var ux = dx / len, uy = dy / len, at = 0, on = true, k = 0;
    var pat = pattern.filter(function (v) { return v > 0; });
    if (!pat.length) { this.line(p1[0], p1[1], p2[0], p2[1], colour, w); return; }
    while (at < len) {
      var seg = Math.min(pat[k % pat.length], len - at);
      if (on) this.line(p1[0] + ux * at, p1[1] + uy * at,
        p1[0] + ux * (at + seg), p1[1] + uy * (at + seg), colour, w);
      at += seg; k++; on = !on;
    }
  };

  /* --- boxes -------------------------------------------------------------- */
  function drawBox(w, el, cs, r) {
    var bg = rgb(cs.backgroundColor);
    if (bg) {
      var rad = parseFloat(cs.borderTopLeftRadius) || 0;
      w.rect(r.left, r.top, r.width, r.height, bg, rad);
    }
    var sides = [
      ['Top', r.left, r.top, r.width, 0],
      ['Bottom', r.left, r.bottom, r.width, 0],
      ['Left', r.left, r.top, 0, r.height],
      ['Right', r.right, r.top, 0, r.height]
    ];
    for (var i = 0; i < sides.length; i++) {
      var s = sides[i], name = s[0];
      var bw = parseFloat(cs['border' + name + 'Width']) || 0;
      if (!(bw > 0) || cs['border' + name + 'Style'] === 'none') continue;
      var bc = rgb(cs['border' + name + 'Color']);
      if (!bc) continue;
      /* Borders are drawn as filled rects rather than strokes: a stroke is
         centred on its path, which puts half of every table rule outside the
         cell and makes adjacent rules land 0.5px apart instead of together. */
      if (name === 'Top') w.rect(s[1], s[2], s[3], bw, bc, 0);
      else if (name === 'Bottom') w.rect(s[1], s[2] - bw, s[3], bw, bc, 0);
      else if (name === 'Left') w.rect(s[1], s[2], bw, s[4], bc, 0);
      else w.rect(s[1] - bw, s[2], bw, s[4], bc, 0);
    }
  }

  /* --- text --------------------------------------------------------------
     A text node is drawn from its own client rects, which is how wrapped
     prose keeps the browser's line breaks. A node that occupies one rect —
     most table cells, every label — is drawn in one call; only wrapped nodes
     pay for the word-by-word walk. */
  function transform(txt, tt) {
    if (tt === 'uppercase') return txt.toUpperCase();
    if (tt === 'lowercase') return txt.toLowerCase();
    if (tt === 'capitalize') return txt.replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
    return txt;
  }

  function drawText(w, node, cs, clip) {
    var raw = node.nodeValue;
    if (!raw || !raw.trim()) return;
    var range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    var rects = range.getClientRects();
    if (!rects.length) return;

    var colour = rgb(cs.color) || { r: 0, g: 0, b: 0 };
    var size = parseFloat(cs.fontSize) || 10;
    var weight = cs.fontWeight;
    var style = (/^(bold|bolder|[6-9]00)$/.test(weight) ? 'bold' : 'normal');
    if (/italic|oblique/.test(cs.fontStyle)) style = style === 'bold' ? 'bolditalic' : 'italic';
    var spacing = parseFloat(cs.letterSpacing);
    if (!isFinite(spacing)) spacing = 0;
    var tt = cs.textTransform;
    var deco = /line-through|underline/.test(cs.textDecorationLine || cs.textDecoration || '');

    function put(str, r) {
      if (!str.trim()) return;
      if (clip && (r.left >= clip.right - 0.5 || r.right <= clip.left + 0.5
        || r.top >= clip.bottom - 0.5 || r.bottom <= clip.top + 0.5)) return;
      /* The baseline sits inside the line box: centre the em box in the line
         box, then drop to the baseline at 0.8em. This is what makes a 5.6pt
         footer and a 19pt headline sit on the same rules they do on screen. */
      var baseline = r.top + (r.height - size) / 2 + size * 0.80;
      w.text(transform(str, tt), r.left, baseline, colour, style, size, spacing);
      if (deco) {
        var mid = /line-through/.test(cs.textDecorationLine || cs.textDecoration || '');
        w.rect(r.left, mid ? baseline - size * 0.28 : baseline + size * 0.10,
          r.width, Math.max(0.35, size * 0.06), colour, 0);
      }
    }

    if (rects.length === 1) { put(raw, rects[0]); range.detach && range.detach(); return; }

    /* Wrapped: group words by the rect they landed in. Measuring per word and
       not per character keeps this linear and fast enough on a phone. */
    var lines = [];
    var re = /\S+/g, mm;
    var pieces = [];
    while ((mm = re.exec(raw))) {
      range.setStart(node, mm.index);
      range.setEnd(node, mm.index + mm[0].length);
      /* A word normally occupies one rect. "pre-provision" can occupy two,
         because the browser may break inside it at the hyphen — and then its
         bounding rect spans both lines, which put the tail of the word at the
         union's origin, overlapping the line above. That is exactly what the
         first vector proof showed. When a word straddles a break, it is split
         at the character where the break falls and each part placed on its own
         line. */
      var wrects = range.getClientRects();
      if (wrects.length <= 1) {
        if (wrects.length) pieces.push({ text: mm[0], rect: wrects[0] });
        continue;
      }
      var at = mm.index, part = '';
      var cur = null;
      for (var ci = 0; ci < mm[0].length; ci++) {
        range.setStart(node, at + ci);
        range.setEnd(node, at + ci + 1);
        var cr = range.getClientRects()[0];
        if (!cr) { part += mm[0][ci]; continue; }
        if (cur && Math.abs(cur.rect.top - cr.top) < 1.5) { part += mm[0][ci]; }
        else {
          if (cur && part) pieces.push({ text: part, rect: cur.rect });
          cur = { rect: { left: cr.left, top: cr.top, right: cr.right,
            bottom: cr.bottom, width: cr.width, height: cr.height } };
          part = mm[0][ci];
        }
      }
      if (cur && part) pieces.push({ text: part, rect: cur.rect });
    }
    for (var pi = 0; pi < pieces.length; pi++) {
      var wr = pieces[pi].rect, word = pieces[pi].text;
      if (!wr.width && !wr.height) continue;
      var last = lines[lines.length - 1];
      if (last && Math.abs(last.rect.top - wr.top) < 1.5) {
        last.words.push(word);
        last.rect = { left: last.rect.left, top: Math.min(last.rect.top, wr.top),
          right: Math.max(last.rect.right, wr.right),
          bottom: Math.max(last.rect.bottom, wr.bottom),
          height: Math.max(last.rect.height, wr.height) };
        last.rect.width = last.rect.right - last.rect.left;
      } else {
        lines.push({ words: [word], rect: { left: wr.left, top: wr.top, right: wr.right,
          bottom: wr.bottom, width: wr.width, height: wr.height } });
      }
    }
    lines.forEach(function (ln) { put(ln.words.join(' '), ln.rect); });
    range.detach && range.detach();
  }

  /* --- list markers -------------------------------------------------------
     A list marker is drawn by the browser from ::marker, which has no node and
     therefore no client rect — a DOM walker cannot see it at all. The first
     vector proof printed the thesis as three unnumbered paragraphs for exactly
     that reason.

     Rather than guess where a marker sits, the markers are made real: a span
     is inserted into each item and the browser is asked to lay it out, next to
     the content box where the real marker was. Then it is drawn like any other
     text, in the right place, at the right size, in the right colour. The
     staged document is a throwaway iframe, so mutating it costs nothing. */
  function materialiseMarkers(root) {
    var items = root.querySelectorAll('li');
    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      if (li.__marked) continue;
      var cs = getComputedStyle(li);
      var type = cs.listStyleType;
      if (!type || type === 'none') continue;
      var list = li.parentElement;
      var label;
      if (/decimal/.test(type)) {
        var n = 1, sib = li;
        while ((sib = sib.previousElementSibling)) if (sib.tagName === 'LI') n++;
        var start = parseInt((list && list.getAttribute('start')) || '1', 10);
        label = (isFinite(start) ? start - 1 + n : n) + '.';
      } else if (/lower-alpha|lower-latin/.test(type)) {
        var m = 0, s2 = li;
        while ((s2 = s2.previousElementSibling)) if (s2.tagName === 'LI') m++;
        label = String.fromCharCode(97 + (m % 26)) + '.';
      } else if (/circle/.test(type)) label = '◦';
      else if (/square/.test(type)) label = '▪';
      else label = '•';

      var span = li.ownerDocument.createElement('span');
      span.textContent = label;
      span.setAttribute('data-vec-marker', '1');
      span.style.cssText = 'position:absolute;right:100%;margin-right:1.6mm;'
        + 'white-space:nowrap;font-weight:inherit;';
      if (getComputedStyle(li).position === 'static') li.style.position = 'relative';
      li.style.listStyle = 'none';
      li.insertBefore(span, li.firstChild);
      li.__marked = 1;
    }
  }

  /* --- the page walk ------------------------------------------------------ */
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, HEAD: 1, LINK: 1, META: 1 };

  function walk(w, root, pageRect) {
    var doc = root.ownerDocument;
    /* Backgrounds and rules first, in document order, then the text — so a
       heading is never painted over by the panel it sits in. Two passes is
       simpler and more reliable than trying to interleave them correctly. */
    var svgs = [];
    (function boxes(el, clip) {
      if (SKIP[el.tagName]) return;
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (parseFloat(cs.opacity) < 0.05) return;
      if (el.tagName === 'svg') { svgs.push({ el: el, clip: clip }); return; }
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) drawBox(w, el, cs, r);
      var next = clip;
      if (/hidden|clip|auto|scroll/.test(cs.overflow) || /hidden|clip/.test(cs.overflowX)) {
        next = clip ? { left: Math.max(clip.left, r.left), top: Math.max(clip.top, r.top),
          right: Math.min(clip.right, r.right), bottom: Math.min(clip.bottom, r.bottom) }
          : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) boxes(c, next);
      el.__clip = next;
    })(root, { left: pageRect.left, top: pageRect.top, right: pageRect.right, bottom: pageRect.bottom });

    svgs.forEach(function (s) { drawSvg(w, s.el); });

    var tw = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentElement;
        if (!p || SKIP[p.tagName]) return NodeFilter.FILTER_REJECT;
        if (p.closest('svg')) return NodeFilter.FILTER_REJECT;   /* drawn above */
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = tw.nextNode())) {
      var p = n.parentElement;
      var cs = getComputedStyle(p);
      if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue;
      drawText(w, n, cs, p.__clip || (p.closest('[class]') && p.closest('.page') && p.closest('.page').__clip));
    }
  }

  /* --- entry point --------------------------------------------------------
     Takes a staged document (an iframe whose layout has settled) and the
     selector for its page boxes, and returns a Blob. */
  function writePdf(doc, sel) {
    var pages = Array.prototype.slice.call(doc.querySelectorAll(sel || '.page'));
    if (!pages.length) throw new Error('no pages to write');
    var jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDF) throw new Error('the PDF writer did not load');

    var first = pages[0].getBoundingClientRect();
    var k = PT_W / (first.width || 1);
    /* The content box is shorter than A4 on purpose (see --pageh). Centre it,
       so the sheet a reader prints has an even margin top and bottom. */
    var offY = Math.max(0, (PT_H - first.height * k) / 2);

    var pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4', compress: true });
    pdf.setLineJoin('round'); pdf.setLineCap('butt');
    var w = new Writer(pdf, first, k, offY);

    /* Every marker is inserted before anything is measured, so the one reflow
       it costs happens once rather than once per page. */
    materialiseMarkers(doc.body || doc.documentElement);
    first = pages[0].getBoundingClientRect();
    w.box = first; w.k = k = PT_W / (first.width || 1);

    pages.forEach(function (el, i) {
      if (i) w.newPage();
      var r = el.getBoundingClientRect();
      w.box = r;
      w.offY = Math.max(0, (PT_H - r.height * k) / 2);
      walk(w, el, r);
    });

    /* Internal links: the contents page points at section anchors, and a PDF
       can carry that natively. The destination is the page the anchor landed
       on, which only the finished layout knows. */
    var pageOf = new Map();
    pages.forEach(function (el, i) { pageOf.set(el, i + 1); });
    try {
      var links = doc.querySelectorAll('a[href^="#"]');
      for (var i = 0; i < links.length; i++) {
        var a = links[i], id = a.getAttribute('href').slice(1);
        if (!id) continue;
        var target = doc.getElementById(id);
        if (!target) continue;
        var tp = target.closest(sel || '.page');
        var sp = a.closest(sel || '.page');
        if (!tp || !sp || !pageOf.has(tp) || !pageOf.has(sp)) continue;
        var ar = a.getBoundingClientRect();
        var spr = sp.getBoundingClientRect();
        if (!(ar.width > 0)) continue;
        pdf.setPage(pageOf.get(sp));
        pdf.link((ar.left - spr.left) * k, (ar.top - spr.top) * k + Math.max(0, (PT_H - spr.height * k) / 2),
          ar.width * k, ar.height * k, { pageNumber: pageOf.get(tp) });
      }
      pdf.setPage(pages.length);
    } catch (e) { /* a missing link is not worth losing the document over */ }

    return pdf.output('blob');
  }

  window.EQVecPdf = { writePdf: writePdf, ascii: ascii };
})();
