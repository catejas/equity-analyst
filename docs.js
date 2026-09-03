/* ============================================================================
   docs.js — generate, download and share the documents the app renders
   locally from an imported payload. PDF uses the browser's own vector print
   path where possible; PNG uses html2canvas at 4x for 600 DPI at A4.
   ========================================================================== */
(function(){
'use strict';
function $(s){ return document.querySelector(s); }

var ALL_LANG = 'en';                        /* the Report page language switch */
var A4_W = 1240, A4_H = 1754;               /* CSS px at 150 DPI */
var PNG_SCALE = 4;   /* 4960 x 7016 = 600 DPI at A4. Messaging apps downscale
                        hard, so we oversample and use large type in the layout. */

/* What every builder receives. A run, not a company: the report model the
   engine produced, the run metadata, the gap warnings, and which company in the
   run the two per-company documents should use. */
function currentPayload(){
  var id = $('#libSel') && $('#libSel').value;
  var lib = [];
  try{ lib = JSON.parse(localStorage.getItem('eq.library')||'[]'); }catch(e){}
  var r = id ? lib.filter(function(x){ return x.id===id; })[0]
             : lib.filter(function(x){ return x && x.report; })[0];
  if(!r || !r.report) return null;
  var idx = 0;
  var sel = $('#scCo');
  if(sel && sel.value !== '' && sel.value != null){
    var v = parseInt(sel.value, 10);
    if(!isNaN(v)) idx = v;
  }
  return {
    meta: { segment: r.segment, subsegment: r.subsegment,
            company: r.company, analysis_datetime: r.ts ? new Date(r.ts).toISOString() : '' },
    report: r.report,
    warnings: r.warnings || [],
    companyIndex: idx
  };
}
/* One language switch governs every document on the Report page. It used to be
   read from the Analyse form, which meant the research settings decided what a
   button on a different tab produced — a switch you could not see from where
   you were pressing. */
function langsWanted(){ return [ALL_LANG]; }
function docLang(){ return ALL_LANG; }
function fileBase(p, kind, lang){
  /* Per-company documents are named for the company; run-level ones for the
     segment, since naming three companies' report after one of them is how a
     file ends up filed in the wrong place. */
  var perCompany = /^co[123]$/.test(kind) || kind === 'score' || kind === 'scorepng';
  var co = null;
  if(perCompany && p.report && p.report.full){
    co = p.report.full[p.companyIndex || 0];
  }
  var raw = (window.EQDocs && EQDocs.S)
    ? EQDocs.S(co ? (co.name || co.symbol) : (p.meta && (p.meta.segment || p.meta.company)))
    : '';
  var nm = (raw || 'Equity').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  var k = kind==='sector' ? 'Sector_Research_Report'
        : /^co[123]$/.test(kind) ? 'Company_Research_Report'
        : kind==='exec' ? 'Executive_Summary'
        : 'Score_Card';
  return nm + '_' + k + '_' + lang.toUpperCase();
}
/* A1 — the app knows the earliest premium it ever recorded for this issue; the
   payload usually does not. Fold it in just before rendering, so the report can
   print the drift without the model having to supply a figure it cannot know.
   The payload's own value always wins: it may have found an older quote. */
function withLocalGmp(p){
  try{
    if(!p || !p.ipo) return p;
    var g = p.ipo.gmp;
    if(!g || typeof g !== 'object') return p;
    if(g.first_seen_value != null) return p;
    if(typeof window.gmpFirstSeen !== 'function') return p;
    var seen = window.gmpFirstSeen((p.meta || {}).company);
    if(!seen || seen.value == null) return p;
    g.first_seen_value = seen.value;
    if(seen.date) g.first_seen_date = seen.date;
  }catch(e){}
  return p;
}
function buildHTML(p, kind, lang){
  p = withLocalGmp(p);
  /* The three company reports are the same builder pointed at a different
     rank. Nothing else distinguishes them. */
  var rank = /^co([123])$/.exec(kind);
  if(rank) return EQDocs.buildCompany(Object.assign({}, p, { companyIndex: Number(rank[1]) - 1 }), lang);
  if(kind === 'sector') return EQDocs.buildSector(p, lang);
  if(kind === 'exec')   return EQDocs.buildExec(p, lang);
  return EQDocs.buildScorecard(p, lang);
}
function selFor(kind){ return kind==='visual' ? '.vpage' : '.page'; }
function isPng(kind){ return kind==='visual' || kind==='scorepng'; }
var MSG_EL = '#docMsg';
function msg(t, bad){
  var el = $(MSG_EL); if(!el) return;
  el.innerHTML = t ? (bad ? '<b style="color:var(--red)">'+t+'</b>' : t) : '';
}

/* One capture path for both PDF and PNG.

   html2canvas decides for itself how much of an element to photograph, and it
   uses the scrolling box — so a page whose content overflows by a few pixels
   produced a taller canvas, and one it measured short produced a shorter one.
   Either way the result was then stretched into a fixed A4 rectangle, which
   magnified or squashed that page relative to every other page in the document.
   The capture is now pinned to the page element's own box, so what comes back
   is always exactly one page. */
function shootPage(el, scale){
  var r = el.getBoundingClientRect();
  var w = Math.round(r.width), h = Math.round(r.height);
  return html2canvas(el, {
    scale: scale, backgroundColor:'#ffffff', useCORS:true, logging:false,
    width: w, height: h,
    windowWidth: w, windowHeight: h,
    scrollX: 0, scrollY: 0, x: 0, y: 0
  });
}

/* hidden iframe so html2canvas has a real laid-out document to photograph */
function stage(html){
  return new Promise(function(res){
    var f = document.createElement('iframe');
    f.setAttribute('aria-hidden','true');
    f.style.cssText = 'position:fixed;left:-20000px;top:0;border:0;width:'+A4_W+'px;height:'+A4_H+'px;';
    document.body.appendChild(f);
    f.onload = function(){ setTimeout(function(){ res(f); }, 350); };
    f.srcdoc = html;
  });
}
function unstage(f){ try{ document.body.removeChild(f); }catch(e){} }

/* ---------- PDF: preview in-app, print from there ----------
   This used to be window.open(). Inside an installed PWA that new window has no
   browser chrome and no back gesture, so the only way out was to kill the app.
   The document is now shown in a full-screen panel with a Back button, and
   printing happens from inside it. */
function showPreview(html, title){
  var pv = $('#preview'), fr = $('#pvFrame');
  if(!pv || !fr){ return false; }
  $('#pvTitle').textContent = title || '';
  fr.srcdoc = html;
  pv.classList.remove('hidden');
  document.body.classList.add('previewing');
  /* so the phone's own Back gesture closes the preview instead of the app */
  try{ history.pushState({ preview:1 }, ''); }catch(e){}
  return true;
}
function closePreview(){
  var pv = $('#preview');
  if(!pv || pv.classList.contains('hidden')) return false;
  pv.classList.add('hidden');
  document.body.classList.remove('previewing');
  $('#pvFrame').srcdoc = '';
  return true;
}
function printPreview(){
  var fr = $('#pvFrame');
  try{
    if(fr && fr.contentWindow){ fr.contentWindow.focus(); fr.contentWindow.print(); return; }
  }catch(e){}
  window.print();
}
window.EQPreview = { show:showPreview, close:closePreview, print:printPreview };

/* ---------- PDF as a real file, for sharing ----------

   The page image is what you see; a transparent text layer underneath is what
   the reader searches, selects and copies. This is the same construction as an
   OCR'd scan, and it is the only way to keep the exact layout of the design and
   still hand over a document that behaves like a document.

   Latin script only. jsPDF's built-in fonts cannot encode Gujarati, so those
   runs are skipped rather than written as nonsense bytes — the Gujarati edition
   still looks identical, it simply is not text-searchable. Embedding a Gujarati
   font would fix that at the cost of a few hundred kilobytes in the package. */

var LATIN_OK = /^[\u0000-\u024F\u2000-\u206F\u20A0-\u20BF\s]*$/;

/* Every visible line of text on a page, with its box, in page coordinates. */
function textLines(pageEl){
  var out = [], base = pageEl.getBoundingClientRect();
  var walker = pageEl.ownerDocument.createTreeWalker(pageEl, NodeFilter.SHOW_TEXT, {
    acceptNode: function(node){
      if(!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      var pe = node.parentElement;
      if(!pe) return NodeFilter.FILTER_REJECT;
      if(/^(SCRIPT|STYLE|svg|SVG)$/.test(pe.nodeName)) return NodeFilter.FILTER_REJECT;
      if(pe.closest && pe.closest('svg')) return NodeFilter.FILTER_REJECT;
      var st = pageEl.ownerDocument.defaultView.getComputedStyle(pe);
      if(st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0)
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  var node;
  while((node = walker.nextNode())){
    var txt = node.nodeValue;
    if(!LATIN_OK.test(txt)) continue;
    var pe = node.parentElement;
    var st = pageEl.ownerDocument.defaultView.getComputedStyle(pe);
    var size = parseFloat(st.fontSize) || 10;
    var bold = (parseInt(st.fontWeight, 10) || 400) >= 600;
    /* Range rects split a wrapped node into one box per visual line, which is
       what the text layer needs — one draw call per line, correctly placed. */
    var rng = pageEl.ownerDocument.createRange();
    rng.selectNodeContents(node);
    var rects = rng.getClientRects();
    if(rects.length === 1){
      var r0 = rects[0];
      if(r0.width < 0.5 || r0.height < 0.5) continue;
      out.push({ text:txt.replace(/\s+/g,' ').trim(),
                 x:r0.left-base.left, y:r0.top-base.top, w:r0.width, h:r0.height,
                 size:size, bold:bold });
      continue;
    }
    /* Multi-line: split the string across the boxes by proportion of width. */
    var words = txt.replace(/\s+/g,' ').trim().split(' ');
    var totalW = 0, i;
    for(i=0;i<rects.length;i++) totalW += rects[i].width;
    var cursor = 0;
    for(i=0;i<rects.length;i++){
      var r = rects[i];
      if(r.width < 0.5 || r.height < 0.5) continue;
      var take = (i === rects.length-1)
        ? words.length - cursor
        : Math.max(1, Math.round(words.length * (r.width/(totalW||1))));
      var chunk = words.slice(cursor, cursor+take).join(' ');
      cursor += take;
      if(!chunk) continue;
      out.push({ text:chunk, x:r.left-base.left, y:r.top-base.top,
                 w:r.width, h:r.height, size:size, bold:bold });
      if(cursor >= words.length) break;
    }
  }
  return out;
}

/* Section headings and their page, for the PDF bookmark tree. */
function outlineOf(pages){
  var items = [];
  pages.forEach(function(pg, idx){
    Array.prototype.slice.call(pg.querySelectorAll('.ir-grph, .ir-blk[id] .sec .ti, .sec .ti'))
      .forEach(function(el){
        var isGroup = el.classList.contains('ir-grph');
        var t = (el.textContent||'').replace(/\s+/g,' ').trim();
        if(!t) return;
        if(!isGroup){
          var blk = el.closest('.ir-blk');
          var no = blk && blk.id ? blk.id.replace(/^s/,'') : '';
          if(no) t = no + '  ' + t;
        }
        items.push({ title:t, page:idx+1, group:isGroup });
      });
  });
  return items;
}

function htmlToPdfBlob(html, sel){
  return stage(html).then(function(f){
    var doc = f.contentDocument;
    var pages = Array.prototype.slice.call(doc.querySelectorAll(sel));
    var jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    var pdf = new jsPDF({ orientation:'p', unit:'pt', format:'a4', compress:true });
    var W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
    var chain = Promise.resolve();

    /* page element -> PDF page number, for links and bookmarks */
    var pageNo = new Map();
    pages.forEach(function(el, i){ pageNo.set(el, i+1); });

    pages.forEach(function(el, i){
      chain = chain.then(function(){
        return shootPage(el, 2)
          .then(function(cv){
            if(i) pdf.addPage();
            /* The canvas is drawn at the aspect ratio it actually has. It used
               to be stretched into the full A4 box no matter what it captured,
               so a page html2canvas measured even slightly short came out
               magnified and lost its last lines under the footer — while the
               text layer, which is computed from the DOM, stayed correct. That
               mismatch is what made one page of a report look like a different
               document. shootPage() now pins the capture to the page box, and
               this keeps the drawing honest if it ever still differs. */
            var ar = cv.height / (cv.width || 1);
            var dw = W, dh = W * ar;
            if(dh > H){ dh = H; dw = H / (ar || 1); }
            pdf.addImage(cv.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, dw, dh, undefined, 'FAST');

            var box = el.getBoundingClientRect();
            var kx = dw / (box.width || 1), ky = dh / (box.height || 1);

            /* the invisible, searchable text layer */
            try{
              pdf.setTextColor(0, 0, 0);
              textLines(el).forEach(function(ln){
                if(!ln.text) return;
                var fs = Math.max(1, ln.size * ky);
                pdf.setFont('helvetica', ln.bold ? 'bold' : 'normal');
                pdf.setFontSize(fs);
                /* jsPDF places text on its baseline; the box top plus roughly
                   four fifths of the line box lands on it closely enough for
                   selection to track the visible glyphs. */
                var bx = ln.x * kx, by = (ln.y + ln.h * 0.78) * ky;
                var want = ln.w * kx;
                var have = pdf.getTextWidth(ln.text) || want;
                var opts = { renderingMode:'invisible', baseline:'alphabetic' };
                /* Nudge the invisible glyphs to sit under the visible ones, but
                   only a little. Headings are set with wide CSS tracking, and
                   matching that exactly spaces the letters so far apart that a
                   reader extracts "T e m p s e n s" and search stops working.
                   A close-enough selection box beats an unsearchable word. */
                /* Only ever tighten, never spread. Spreading is what produced
                   "T e m p s e n s" — a reader that sees wide glyph gaps splits
                   the word, and the document stops being searchable. */
                if(have > want && want > 0){
                  var per = (want - have) / Math.max(1, ln.text.length);
                  var cap = -fs * 0.10;
                  opts.charSpace = per < cap ? cap : per;
                }
                pdf.text(ln.text, bx, by, opts);
              });
            }catch(e){}

            /* contents rows become real jumps inside the document */
            try{
              Array.prototype.slice.call(el.querySelectorAll('a[href^="#"]')).forEach(function(a){
                var target = doc.getElementById(a.getAttribute('href').slice(1));
                if(!target) return;
                var tp = pageNo.get(target.closest(sel.replace(/^\./,'.')) || target.closest('.page'));
                if(!tp) return;
                var r = a.getBoundingClientRect();
                pdf.link((r.left-box.left)*kx, (r.top-box.top)*ky,
                         r.width*kx, r.height*ky, { pageNumber:tp });
              });
            }catch(e){}

            msg('Rendering page '+(i+1)+' of '+pages.length+'…');
          });
      });
    });

    return chain.then(function(){
      /* bookmarks, grouped the same way the contents page is grouped */
      try{
        if(pdf.outline && pdf.outline.add){
          var parent = null;
          outlineOf(pages).forEach(function(it){
            if(it.group) parent = pdf.outline.add(null, it.title, { pageNumber:it.page });
            else pdf.outline.add(parent, it.title, { pageNumber:it.page });
          });
        }
      }catch(e){}
      unstage(f);
      return pdf.output('blob');
    }).catch(function(err){ unstage(f); throw err; });
  });
}

/* ---------- PNG at 600 DPI ---------- */
function htmlToPngBlobs(html, sel){
  return stage(html).then(function(f){
    var pages = Array.prototype.slice.call(f.contentDocument.querySelectorAll(sel));
    var outs = [], chain = Promise.resolve();
    pages.forEach(function(el, i){
      chain = chain.then(function(){
        msg('Rendering image '+(i+1)+' of '+pages.length+' at 600 DPI…');
        return shootPage(el, PNG_SCALE)
          .then(function(cv){
            return new Promise(function(r){ cv.toBlob(function(b){ outs.push(b); r(); }, 'image/png'); });
          });
      });
    });
    return chain.then(function(){ unstage(f); return outs; })
                .catch(function(err){ unstage(f); throw err; });
  });
}

function download(blob, name){
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); document.body.removeChild(a); }, 1500);
}
/* Sharing has to happen inside a live user gesture. Building a five-document set
   takes half a minute, so by the time the files exist the tap that started it has
   expired and iOS rejects navigator.share with NotAllowedError. The old code then
   fell back to downloading each file — and on iOS a programmatic download of a PDF
   blob opens it in a viewer rather than saving, so the last file in the batch (the
   score card) appeared on screen and nothing was shared. That is the bug.

   Now: try to share; if the gesture has gone, hold the finished files and offer a
   button. The user's tap on that button is a fresh gesture, and the share works. */
var PENDING_SHARE = null;

function canShareFiles(files){
  try{ return !!(navigator.canShare && navigator.canShare({ files:files })); }catch(e){ return false; }
}

function shareNow(files, title){
  if(!navigator.share) return Promise.resolve({ ok:false, reason:'unsupported' });
  if(!canShareFiles(files)) return Promise.resolve({ ok:false, reason:'unsupported' });
  return navigator.share({ files:files, title:title })
    .then(function(){ return { ok:true }; })
    .catch(function(err){
      var name = (err && err.name) || '';
      if(name === 'AbortError') return { ok:true, cancelled:true };     /* user closed the sheet */
      return { ok:false, reason: name === 'NotAllowedError' ? 'gesture' : 'failed', err:err };
    });
}

/* Offer a second tap rather than silently dumping five downloads. */
function offerShare(files, title, note){
  PENDING_SHARE = { files:files, title:title };
  msg((note || '') + '<button type="button" class="btn sm pri" id="btnShareNow" style="margin-top:10px;">'
    + 'TAP TO SHARE ' + files.length + ' FILE' + (files.length > 1 ? 'S' : '')
    + '</button><button type="button" class="btn sm" id="btnSaveInstead" style="margin-top:8px;">'
    + 'Save to this device instead</button>');
}

/* One button per rendered page. PENDING_PAGES holds the blobs so the click
   handler can open exactly the page that was tapped. */
var PENDING_PAGES = null;

function offerPages(pages){
  PENDING_PAGES = pages;
  msg('<b>' + pages.length + ' pages ready.</b> Tap a page to open or save it — '
    + 'one at a time, so the right page opens.'
    + pages.map(function(pg, i){
        return '<button type="button" class="btn sm' + (i === 0 ? ' pri' : '')
             + '" data-page="' + i + '" style="margin-top:8px;">' + pg.label + '</button>';
      }).join('')
    + '<div class="mut" style="margin-top:8px;">Send them on WhatsApp as a Document, not a Photo — '
    + 'photo mode recompresses images and softens small type.</div>');
}

function share(files, title){
  return shareNow(files, title).then(function(r){ return r.ok; });
}

function needPayload(){
  var p = currentPayload();
  if(!p){
    msg('Select a saved analysis first — and it must be a v3 data block imported with Import Data.', true);
    return null;
  }
  return p;
}


/* ---------- All Reports: every document, one language, one tap ---------- */
var ALL_KINDS = [
  { kind:'sector', ext:'pdf' },
  { kind:'co1',    ext:'pdf' },
  { kind:'co2',    ext:'pdf' },
  { kind:'co3',    ext:'pdf' },
  { kind:'exec',   ext:'pdf' },
  { kind:'score',  ext:'pdf' }
];

/* PDFs are rasterised to a real file here rather than routed through the print
   dialog, because a batch cannot ask the user to drive five print sheets. */
function buildAllFiles(p, lang, onStep){
  var out = [], i = 0;
  var wanted = ALL_KINDS.slice();
  function next(){
    if(i >= wanted.length) return Promise.resolve(out);
    var k = wanted[i++];
    onStep(i, wanted.length, k.kind);
    var html = buildHTML(p, k.kind, lang), sel = selFor(k.kind);
    if(k.ext === 'png'){
      return htmlToPngBlobs(html, sel).then(function(blobs){
        blobs.forEach(function(b, n){
          out.push(new File([b], fileBase(p, k.kind, lang) + (blobs.length > 1 ? '_p'+(n+1) : '') + '.png',
                            { type:'image/png' }));
        });
        return next();
      });
    }
    return htmlToPdfBlob(html, sel).then(function(blob){
      out.push(new File([blob], fileBase(p, k.kind, lang) + '.pdf', { type:'application/pdf' }));
      return next();
    });
  }
  return next();
}

function doAll(act, msgTarget){
  MSG_EL = msgTarget || '#docMsg';
  var p = needPayload(); if(!p) return;
  var lang = ALL_LANG;
  var label = 'English';
  var names = { inst:'institutional research report', report:'research report',
                exec:'executive summary', visual:'investment summary', score:'score card' };
  function step(n, total, kind){
    msg('Building the ' + label + ' set — ' + n + ' of ' + total + ': ' + (names[kind]||kind) + '…');
  }
  buildAllFiles(p, lang, step).then(function(files){
    if(act === 'share'){
      var title = EQDocs.S(p.meta.company || p.meta.segment) + ' — ' + label;
      return shareNow(files, title).then(function(r){
        if(r.ok){ msg(r.cancelled ? '' : 'Shared all ' + files.length + ' ' + label + ' files.'); return; }
        if(r.reason === 'gesture'){
          offerShare(files, title, '<b>' + files.length + ' ' + label + ' files are ready.</b> '
            + 'Building them took longer than the phone allows a share to stay open, so tap once more '
            + 'to send them. ');
          return;
        }
        files.forEach(function(f){ download(f, f.name); });
        msg('Sharing is not available in this browser, so all ' + files.length + ' '
          + label + ' files were saved instead.');
      });
    }
    files.forEach(function(f){ download(f, f.name); });
    msg('<b>Saved ' + files.length + ' ' + label + ' files</b> — institutional research report, '
      + 'research report, executive summary, investment summary and score card. '
      + 'Send images on WhatsApp as a <b>Document, not a Photo</b>.');
  }).catch(function(err){
    msg('Could not build the set: ' + err.message, true);
  });
}

/* ---------- one delegated handler for every document row ---------- */
function doAction(kind, act, msgTarget){
  if(kind === 'all') return doAll(act, msgTarget);
  MSG_EL = msgTarget || '#docMsg';
  var p = needPayload(); if(!p) return;
  var langs = langsWanted();

  if(act === 'make' && !isPng(kind)){
    var lg0 = langs[0];
    msg('Preview open. Tap <b>Save as PDF</b>, then <b>Back</b> to return to the app.');
    showPreview(buildHTML(p, kind, lg0), fileBase(p, kind, lg0) + '.pdf');
    return;
  }
  if(act === 'make'){
    /* A multi-page PNG used to fire one download() per page back to back. On iOS a
       programmatic blob download opens in a viewer instead of saving, so the pages
       raced and whichever fired last — page 2 — was the one left on screen. Every
       page now gets its own button, so the tap that opens a page is a fresh gesture
       and the page the user asked for is the page they get. */
    var pages = [];
    var run = function(ix){
      if(ix >= langs.length){
        if(pages.length === 1){
          download(pages[0].blob, pages[0].name);
          msg('Saved at 600 DPI. <b>Send it on WhatsApp as a Document, not a Photo</b> — photo mode '
            + 'recompresses images and softens small type.');
        } else {
          offerPages(pages);
        }
        return;
      }
      var lg = langs[ix];
      msg('Rendering the image…');
      htmlToPngBlobs(buildHTML(p, kind, lg), selFor(kind)).then(function(blobs){
        blobs.forEach(function(b, i){
          pages.push({ blob:b, name: fileBase(p,kind,lg) + (blobs.length>1 ? '_p'+(i+1) : '') + '.png',
                       label: 'Page ' + (i+1) + ' of ' + blobs.length
                              + (langs.length > 1 ? ' · ' + lg.toUpperCase() : '') });
        });
        run(ix+1);
      }).catch(function(err){ msg('Could not render the image: '+err.message, true); });
    };
    run(0);
    return;
  }

  /* share */
  var lg = langs[0];
  if(isPng(kind)){
    msg('Building the images…');
    htmlToPngBlobs(buildHTML(p, kind, lg), selFor(kind)).then(function(blobs){
      var files = blobs.map(function(b,i){
        return new File([b], fileBase(p,kind,lg)+(blobs.length>1?'_p'+(i+1):'')+'.png', { type:'image/png' }); });
      var ttl = EQDocs.S(p.meta.company || p.meta.segment);
      return shareNow(files, ttl).then(function(r){
        if(r.ok){ msg(r.cancelled ? '' : 'Shared.'); return; }
        if(r.reason === 'gesture'){
          offerShare(files, ttl, '<b>The images are ready.</b> Tap once more to send them. ');
          return;
        }
        files.forEach(function(f,i){ download(blobs[i], f.name); });
        msg('Sharing is not available in this browser, so the images were saved instead.');
      });
    }).catch(function(err){ msg('Could not render the images: '+err.message, true); });
  } else {
    msg('Building the PDF…');
    htmlToPdfBlob(buildHTML(p, kind, lg), selFor(kind)).then(function(blob){
      var name = fileBase(p, kind, lg)+'.pdf';
      var file = new File([blob], name, { type:'application/pdf' });
      var ttl2 = EQDocs.S(p.meta.company || p.meta.segment);
      return shareNow([file], ttl2).then(function(r){
        if(r.ok){ msg(r.cancelled ? '' : 'Shared.'); return; }
        if(r.reason === 'gesture'){
          offerShare([file], ttl2, '<b>The PDF is ready.</b> Tap once more to send it. ');
          return;
        }
        download(blob, name);
        msg('Sharing is not available in this browser, so the file was saved instead.');
      });
    }).catch(function(err){ msg('Could not build the PDF: '+err.message, true); });
  }
}

document.addEventListener('DOMContentLoaded', function(){
  document.addEventListener('click', function(ev){
    var t = ev.target;

    var lg = t.closest && t.closest('[data-alllang]');
    if(lg){
      ALL_LANG = lg.dataset.alllang;
      var row = lg.closest('.langseg');
      Array.prototype.forEach.call(row.querySelectorAll('.lg'), function(x){
        x.classList.toggle('on', x === lg); });
      return;
    }

    if(t.id === 'btnShareNow' && PENDING_SHARE){
      var ps = PENDING_SHARE;
      shareNow(ps.files, ps.title).then(function(r){
        if(r.ok){ PENDING_SHARE = null; msg(r.cancelled ? '' : 'Shared ' + ps.files.length + ' file(s).'); }
        else { ps.files.forEach(function(f){ download(f, f.name); });
               PENDING_SHARE = null;
               msg('That did not go through, so the files were saved to this device instead.'); }
      });
      return;
    }
    if(t.id === 'btnSaveInstead' && PENDING_SHARE){
      PENDING_SHARE.files.forEach(function(f){ download(f, f.name); });
      msg('Saved ' + PENDING_SHARE.files.length + ' file(s) to this device.');
      PENDING_SHARE = null;
      return;
    }

    var pb = t.closest && t.closest('[data-page]');
    if(pb && PENDING_PAGES){
      var pg = PENDING_PAGES[Number(pb.dataset.page)];
      if(pg) download(pg.blob, pg.name);
      return;
    }

    var b = t.closest && t.closest('[data-doc]');
    if(!b) return;
    var inScore = !!(b.closest('#scDocs'));
    doAction(b.dataset.doc, b.dataset.act, inScore ? '#scMsg' : '#docMsg');
  });

  var back = $('#pvBack'), save = $('#pvSave');
  if(back) back.addEventListener('click', function(){ try{ history.back(); }catch(e){ closePreview(); } });
  if(save) save.addEventListener('click', printPreview);
  window.addEventListener('popstate', function(){ closePreview(); });
  document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape') closePreview(); });
});

window.EQDocTools = { currentPayload:currentPayload, buildHTML:buildHTML, doAction:doAction,
                       htmlToPngBlobs:htmlToPngBlobs, htmlToPdfBlob:htmlToPdfBlob };
})();
