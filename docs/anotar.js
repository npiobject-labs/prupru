/* anotar.js — botón «Anotar» para que el cliente marque y comente cualquier página de docs/.
   Uso: <script src="vendor/snapdom.min.js"></script><script src="anotar.js"></script>
   Sin dependencias aparte de snapdom (opcional: sin él se anota sobre un fondo plano).
   Fase 1+2 del plan (docs/planificacion/analisis-anotaciones-cliente.md): captura de la
   vista, lienzo con herramientas y paleta, nota de texto, nota de voz, compartir o descargar.
   Todo ocurre en el navegador; no se envía nada a ningún servidor. */
(function () {
  'use strict';
  if (window.ANOTAR) return;

  var COLORES = ['#E5322D', '#1F6FEB', '#1D9E5A', '#F2A900', '#111111', '#FFFFFF'];
  var GROSORES = [3, 6, 11];
  var HERR = [
    ['lapiz', 'Lápiz', '<path d="M4 20l4-1 10-10-3-3L5 16z"/><path d="M13 7l3 3"/>'],
    ['linea', 'Línea', '<path d="M5 19L19 5"/>'],
    ['flecha', 'Flecha', '<path d="M5 19L19 5M11 5h8v8"/>'],
    ['rect', 'Rectángulo', '<rect x="4" y="6" width="16" height="12" rx="1.5"/>'],
    ['elipse', 'Círculo', '<ellipse cx="12" cy="12" rx="8" ry="6.5"/>'],
    ['cruz', 'Cruz', '<path d="M6 6l12 12M18 6L6 18"/>'],
    ['texto', 'Texto', '<path d="M5 6h14M12 6v13M9 19h6"/>'],
    ['imagen', 'Imagen', '<rect x="4" y="5" width="16" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4 3 3 3-2 5 3"/>']
  ];
  var Z = 2147483000;

  var css = '\
.an-ui,.an-ui *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-tap-highlight-color:transparent}\
.an-fab{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:' + Z + ';display:inline-flex;align-items:center;gap:.45rem;padding:.7rem 1rem;border:0;border-radius:999px;background:#9A4A2C;color:#fff;font:600 15px/1 system-ui,sans-serif;box-shadow:0 6px 20px -6px rgba(0,0,0,.45);cursor:pointer}\
.an-fab svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}\
.an-capa{position:fixed;inset:0;z-index:' + (Z + 1) + ';background:#1B2023;color:#EEE;display:flex;flex-direction:column;touch-action:none;overscroll-behavior:contain}\
.an-top{display:flex;align-items:center;gap:.5rem;padding:.4rem .6rem;padding-top:calc(.4rem + env(safe-area-inset-top,0px));background:#0F1315;min-height:46px}\
.an-top b{flex:1;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.an-top small{color:#9AA5AA;font-size:12px}\
.an-ib{display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:40px;padding:0 .3rem;border:0;border-radius:9px;background:transparent;color:#EEE;cursor:pointer;font:500 13px system-ui,sans-serif;flex:none;gap:.3rem}\
.an-ib svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}\
.an-ib.on{background:#fff;color:#111}\
.an-ib:disabled{opacity:.35;cursor:default}\
.an-zona{flex:1;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#2A3134 repeating-conic-gradient(#2A3134 0 25%,#262C2F 0 50%) 0 0/24px 24px}\
.an-marco{position:relative;box-shadow:0 0 0 1px rgba(255,255,255,.12),0 12px 40px -10px rgba(0,0,0,.6)}\
.an-marco canvas{position:absolute;inset:0;width:100%;height:100%;display:block}\
.an-marco canvas.an-dibujo{touch-action:none;cursor:crosshair}\
.an-cargando{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#DDD;font-size:15px;background:rgba(27,32,35,.85)}\
.an-txt{position:absolute;z-index:3;display:flex;gap:.3rem;background:#fff;padding:.3rem;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.4)}\
.an-txt input{font-size:16px;padding:.4rem .5rem;border:1px solid #CCC;border-radius:6px;min-width:160px;color:#111}\
.an-txt button{border:0;border-radius:6px;background:#111;color:#fff;padding:0 .7rem;font-size:15px;cursor:pointer}\
.an-barra{display:flex;align-items:center;gap:.1rem;padding:.25rem .3rem 0;background:#0F1315;overflow-x:auto;scrollbar-width:none;flex:none}\
.an-barra2{padding-top:.15rem;padding-bottom:.25rem}\
.an-barra::-webkit-scrollbar{display:none}\
.an-sep{width:1px;height:26px;background:#3A4245;margin:0 .3rem;flex:none}\
.an-col{width:28px;height:28px;border-radius:50%;border:2px solid transparent;flex:none;cursor:pointer;padding:0;margin:0 3px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}\
.an-col.on{border-color:#fff;transform:scale(1.15)}\
.an-gro{width:36px;height:36px;border:0;border-radius:8px;background:transparent;display:inline-flex;align-items:center;justify-content:center;flex:none;cursor:pointer}\
.an-gro i{display:block;border-radius:50%;background:#EEE}\
.an-gro.on{background:#fff}.an-gro.on i{background:#111}\
.an-pie{display:flex;gap:.4rem;padding:.45rem .6rem;padding-bottom:calc(.45rem + env(safe-area-inset-bottom,0px));background:#0F1315;flex:none;align-items:center}\
.an-btn{flex:1;min-height:42px;border:1px solid #3A4245;border-radius:10px;background:#1B2023;color:#EEE;font:600 14px system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:.4rem;padding:0 .6rem;white-space:nowrap}\
.an-btn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}\
.an-btn.pri{background:#9A4A2C;border-color:#9A4A2C;color:#fff}\
.an-btn.rec{background:#B3261E;border-color:#B3261E;color:#fff}\
.an-btn.hay{border-color:#6CC493;color:#BFF0D3}\
.an-panel{background:#151A1D;padding:.6rem;display:flex;flex-direction:column;gap:.5rem;flex:none;max-height:40vh;overflow:auto}\
.an-panel textarea{width:100%;min-height:64px;font-size:16px;padding:.5rem;border-radius:8px;border:1px solid #3A4245;background:#0F1315;color:#EEE;resize:vertical}\
.an-panel audio{width:100%;height:36px}\
.an-fila{display:flex;gap:.4rem;align-items:center;flex-wrap:wrap}\
.an-fila .an-btn{flex:1 1 auto}\
.an-msg{font-size:13px;color:#9AA5AA;margin:0}\
.an-envio{background:#151A1D;padding:.7rem .7rem;padding-bottom:calc(.7rem + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:.5rem;flex:none;max-height:60vh;overflow:auto}\
.an-envio h3{margin:0;font-size:16px;font-weight:600;color:#EEE}\
.an-envio .an-res{margin:0 0 .2rem;font-size:13px;color:#9AA5AA}\
.an-envio .an-btn{min-height:48px;font-size:15px;justify-content:flex-start;padding:0 .9rem}\
.an-envio .an-btn small{font-weight:400;color:#9AA5AA;margin-left:auto;font-size:12px}\
.an-envio .an-btn.pri small{color:#F3D9CC}\
.an-msg.err{color:#F28B82}\
.an-msg.ok{color:#6CC493}\
.an-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}\
@media (min-width:700px){.an-barra{justify-content:center}.an-pie{justify-content:center}.an-btn{flex:0 1 220px}}';

  var estilo = document.createElement('style');
  estilo.textContent = css;
  document.head.appendChild(estilo);

  var A = {
    abierto: false, capa: null, fondo: null, dibujo: null, ctx: null,
    baseW: 0, baseH: 0, dpr: 1, captura: null, sinCaptura: false,
    formas: [], actual: null, herr: 'lapiz', color: COLORES[0], grosor: GROSORES[1],
    sel: null, arrastre: null, audio: null, grabador: null, nota: '', meta: null
  };

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function svg(d) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fechaIso() {
    var d = new Date(), o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + s + p(Math.floor(Math.abs(o) / 60)) + ':' + p(Math.abs(o) % 60);
  }
  function sello() { return fechaIso().slice(0, 19).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{6})$/, '$1-$2'); }
  function meta(n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.content : ''; }

  /* ---------- captura ---------- */
  function fijarFijos() {
    // Los elementos fixed/sticky se capturan donde están ahora, no donde caerían en la página entera.
    var tocados = [], todos = document.body.querySelectorAll('*'), sx = window.scrollX, sy = window.scrollY;
    // El cuerpo debe llegar al menos hasta el final de la ventana para que la captura incluya los elementos
    // pegados abajo. snapdom mide el contenido (ignora min-height), así que se añade un espaciador real.
    var falta = sy + window.innerHeight - document.body.getBoundingClientRect().height;
    if (falta > 0) { var relleno = document.createElement('div'); relleno.style.cssText = 'height:' + Math.ceil(falta) + 'px;flex:none'; document.body.appendChild(relleno); tocados.push([relleno, null, relleno]); }
    for (var i = 0; i < todos.length; i++) {
      var e = todos[i];
      if (e.closest && e.closest('.an-ui')) continue;
      var pos = getComputedStyle(e).position;
      if (pos !== 'fixed' && pos !== 'sticky') continue;
      var r = e.getBoundingClientRect(), hueco = null;
      if (pos === 'sticky') {
        // Un sticky ocupa sitio en el flujo: se deja un hueco del mismo tamaño para que nada se mueva.
        var cs = getComputedStyle(e); hueco = document.createElement('div');
        hueco.style.cssText = 'width:' + r.width + 'px;height:' + r.height + 'px;margin:' + cs.marginTop + ' ' + cs.marginRight + ' ' + cs.marginBottom + ' ' + cs.marginLeft + ';flex:none;visibility:hidden';
        e.parentNode.insertBefore(hueco, e);
      }
      tocados.push([e, e.getAttribute('style'), hueco]);
      e.style.cssText += ';position:absolute!important;top:' + (r.top + sy) + 'px!important;left:' + (r.left + sx) + 'px!important;right:auto!important;bottom:auto!important;width:' + r.width + 'px!important;height:' + r.height + 'px!important;margin:0!important;transform:none!important';
    }
    return function () { tocados.forEach(function (t) { if (t[2]) t[2].remove(); if (t[1] == null) t[0].removeAttribute('style'); else t[0].setAttribute('style', t[1]); }); };
  }

  function capturar() {
    A.baseW = window.innerWidth; A.baseH = window.innerHeight;
    A.dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (A.baseW * A.baseH * A.dpr * A.dpr > 12e6) A.dpr = 1;
    A.meta = {
      pagina: location.href.split('#')[0], titulo: document.title, build: meta('build'), fecha: fechaIso(),
      ventana: { ancho: A.baseW, alto: A.baseH, dpr: window.devicePixelRatio || 1, scrollX: window.scrollX, scrollY: window.scrollY },
      navegador: navigator.userAgent, pantalla: (screen.width || 0) + 'x' + (screen.height || 0)
    };
    var fondo = document.createElement('canvas');
    fondo.width = Math.round(A.baseW * A.dpr); fondo.height = Math.round(A.baseH * A.dpr);
    var fc = fondo.getContext('2d');
    fc.fillStyle = getComputedStyle(document.body).backgroundColor || '#fff';
    if (/rgba\(0, 0, 0, 0\)|transparent/.test(fc.fillStyle)) fc.fillStyle = '#fff';
    fc.fillRect(0, 0, fondo.width, fondo.height);
    if (!window.snapdom) { A.sinCaptura = true; return Promise.resolve(fondo); }
    var restaurar = fijarFijos(), sx = window.scrollX, sy = window.scrollY;
    var tope = new Promise(function (_, rj) { setTimeout(function () { rj(new Error('tiempo')); }, 12000); });
    var trabajo = window.snapdom(document.body, { exclude: ['.an-ui'], excludeMode: 'remove', dpr: A.dpr, scale: 1, embedFonts: 'auto', fast: true })
      .then(function (r) { return r.toCanvas(); });
    return Promise.race([trabajo, tope]).then(function (c) {
      restaurar();
      // Recorte a lo que se veía: la captura es de la página entera.
      fc.drawImage(c, -Math.round(sx * A.dpr), -Math.round(sy * A.dpr));
      return fondo;
    }, function (e) {
      restaurar(); A.sinCaptura = true; A.meta.error_captura = String(e && e.message || e);
      return fondo;
    });
  }

  /* ---------- dibujo ---------- */
  function pintaForma(c, f, enCurso) {
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = f.c; c.fillStyle = f.c; c.lineWidth = f.w;
    var x1 = f.x1, y1 = f.y1, x2 = f.x2, y2 = f.y2;
    switch (f.t) {
      case 'lapiz':
        if (f.p.length === 1) { c.beginPath(); c.arc(f.p[0][0], f.p[0][1], f.w / 2, 0, 7); c.fill(); break; }
        c.beginPath(); c.moveTo(f.p[0][0], f.p[0][1]);
        for (var i = 1; i < f.p.length - 1; i++) { var mx = (f.p[i][0] + f.p[i + 1][0]) / 2, my = (f.p[i][1] + f.p[i + 1][1]) / 2; c.quadraticCurveTo(f.p[i][0], f.p[i][1], mx, my); }
        var u = f.p[f.p.length - 1]; c.lineTo(u[0], u[1]); c.stroke(); break;
      case 'linea': c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); break;
      case 'flecha':
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
        var a = Math.atan2(y2 - y1, x2 - x1), L = 10 + f.w * 2.2;
        c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - L * Math.cos(a - .5), y2 - L * Math.sin(a - .5)); c.lineTo(x2 - L * Math.cos(a + .5), y2 - L * Math.sin(a + .5)); c.closePath(); c.fill(); break;
      case 'rect': c.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); break;
      case 'elipse':
        c.beginPath(); c.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.max(1, Math.abs(x2 - x1) / 2), Math.max(1, Math.abs(y2 - y1) / 2), 0, 0, 7); c.stroke(); break;
      case 'cruz':
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.moveTo(x2, y1); c.lineTo(x1, y2); c.stroke(); break;
      case 'texto':
        c.font = '600 ' + f.s + 'px system-ui,sans-serif'; c.textBaseline = 'top';
        c.lineWidth = Math.max(3, f.s / 6); c.strokeStyle = f.c === '#FFFFFF' ? '#000' : '#fff';
        c.strokeText(f.txt, f.x, f.y); c.fillText(f.txt, f.x, f.y); break;
      case 'imagen':
        if (f.img) c.drawImage(f.img, f.x, f.y, f.w, f.h);
        if (f === A.sel) { c.setLineDash([6, 4]); c.lineWidth = 2; c.strokeStyle = '#1F6FEB'; c.strokeRect(f.x - 2, f.y - 2, f.w + 4, f.h + 4); }
        break;
    }
    c.restore();
  }
  function pintaTodo(c, escala) {
    c.save(); c.setTransform(escala, 0, 0, escala, 0, 0);
    for (var i = 0; i < A.formas.length; i++) pintaForma(c, A.formas[i]);
    if (A.actual) pintaForma(c, A.actual, true);
    c.restore();
  }
  function redibuja() { A.ctx.clearRect(0, 0, A.dibujo.width, A.dibujo.height); pintaTodo(A.ctx, A.dpr); actualizaBotones(); }

  function punto(e) { var r = A.dibujo.getBoundingClientRect(); return [(e.clientX - r.left) * A.baseW / r.width, (e.clientY - r.top) * A.baseH / r.height]; }
  function imagenEn(x, y) { for (var i = A.formas.length - 1; i >= 0; i--) { var f = A.formas[i]; if (f.t === 'imagen' && x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return f; } return null; }

  function abajo(e) {
    if (A.actual || A.arrastre || A.enviando) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { A.dibujo.setPointerCapture(e.pointerId); } catch (x) { }
    var p = punto(e), x = p[0], y = p[1];
    cerrarTexto();
    var im = imagenEn(x, y);
    if (im && (A.herr === 'imagen' || A.sel === im)) { A.sel = im; A.arrastre = { f: im, dx: x - im.x, dy: y - im.y, id: e.pointerId }; redibuja(); return; }
    if (A.herr === 'imagen') { A.sel = null; redibuja(); return; }
    A.sel = null;
    if (A.herr === 'texto') { abrirTexto(e.clientX, e.clientY, x, y); return; }
    if (A.herr === 'lapiz') A.actual = { t: 'lapiz', c: A.color, w: A.grosor, p: [[x, y]], id: e.pointerId };
    else A.actual = { t: A.herr, c: A.color, w: A.grosor, x1: x, y1: y, x2: x, y2: y, id: e.pointerId };
    redibuja();
  }
  function mueve(e) {
    if (A.arrastre && A.arrastre.id === e.pointerId) { var p = punto(e); A.arrastre.f.x = p[0] - A.arrastre.dx; A.arrastre.f.y = p[1] - A.arrastre.dy; redibuja(); return; }
    if (!A.actual || A.actual.id !== e.pointerId) return;
    e.preventDefault();
    var q = punto(e);
    if (A.actual.t === 'lapiz') {
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (var i = 0; i < evs.length; i++) { var r = punto(evs[i]); A.actual.p.push(r); }
      if (!evs.length) A.actual.p.push(q);
    } else { A.actual.x2 = q[0]; A.actual.y2 = q[1]; }
    redibuja();
  }
  function arriba(e) {
    if (A.arrastre && A.arrastre.id === e.pointerId) { A.arrastre = null; return; }
    if (!A.actual || A.actual.id !== e.pointerId) return;
    var f = A.actual; A.actual = null; delete f.id;
    if (f.t !== 'lapiz' && Math.abs(f.x2 - f.x1) < 4 && Math.abs(f.y2 - f.y1) < 4) {
      // Un toque sin arrastre: forma de tamaño fijo centrada en el punto.
      var r = 14 + f.w * 2; f.x1 -= r; f.y1 -= r; f.x2 += r; f.y2 += r;
      if (f.t === 'linea' || f.t === 'flecha') { f.y1 = f.y2 = (f.y1 + f.y2) / 2; }
    }
    A.formas.push(f); redibuja();
  }

  /* ---------- texto ---------- */
  var cajaTxt = null;
  function abrirTexto(cx, cy, x, y) {
    cerrarTexto();
    var zona = A.capa.querySelector('.an-zona'), zr = zona.getBoundingClientRect();
    cajaTxt = el('div', 'an-txt an-ui');
    var inp = el('input'); inp.type = 'text'; inp.placeholder = 'Escribe y pulsa ✓'; inp.setAttribute('aria-label', 'Texto de la anotación');
    var ok = el('button', null, '✓'); ok.type = 'button'; ok.setAttribute('aria-label', 'Colocar el texto');
    cajaTxt.appendChild(inp); cajaTxt.appendChild(ok);
    cajaTxt.style.left = Math.max(4, Math.min(cx - zr.left, zr.width - 240)) + 'px';
    cajaTxt.style.top = Math.max(4, Math.min(cy - zr.top - 44, zr.height - 50)) + 'px';
    zona.appendChild(cajaTxt);
    function fin() { var t = inp.value.trim(); if (t) { A.formas.push({ t: 'texto', c: A.color, w: A.grosor, s: 12 + A.grosor * 2, x: x, y: y, txt: t }); } cerrarTexto(); redibuja(); }
    ok.addEventListener('click', fin);
    inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); fin(); } if (ev.key === 'Escape') cerrarTexto(); });
    setTimeout(function () { inp.focus(); }, 30);
  }
  function cerrarTexto() { if (cajaTxt) { cajaTxt.remove(); cajaTxt = null; } }

  /* ---------- imagen ---------- */
  function cargarImagen(fichero) {
    if (!fichero) return;
    var url = URL.createObjectURL(fichero), img = new Image();
    img.onload = function () {
      var w = Math.min(img.naturalWidth, A.baseW * .45), h = w * img.naturalHeight / img.naturalWidth;
      if (h > A.baseH * .45) { h = A.baseH * .45; w = h * img.naturalWidth / img.naturalHeight; }
      var f = { t: 'imagen', x: (A.baseW - w) / 2, y: (A.baseH - h) / 2, w: w, h: h, img: img, nombre: fichero.name, tipo: fichero.type };
      A.formas.push(f); A.sel = f; A.herr = 'imagen'; redibuja(); marcaHerr();
    };
    img.src = url;
  }
  function escalaSel(k) { var f = A.sel; if (!f) return; var cx = f.x + f.w / 2, cy = f.y + f.h / 2; f.w *= k; f.h *= k; f.x = cx - f.w / 2; f.y = cy - f.h / 2; redibuja(); }

  /* ---------- voz ---------- */
  function tipoAudio() {
    var ts = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/aac'];
    for (var i = 0; i < ts.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported(ts[i])) return ts[i];
    return '';
  }
  function extAudio(t) { return /mp4|aac/.test(t) ? 'm4a' : /ogg/.test(t) ? 'ogg' : 'webm'; }
  function grabarVoz() {
    var b = A.capa.querySelector('#an-voz'), m = A.capa.querySelector('#an-msg');
    if (A.grabador) { A.grabador.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { mensaje('Este navegador no puede grabar audio.', 'err'); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var t = tipoAudio(), g = new MediaRecorder(stream, t ? { mimeType: t } : undefined), trozos = [], t0 = Date.now(), reloj;
      g.ondataavailable = function (ev) { if (ev.data && ev.data.size) trozos.push(ev.data); };
      g.onstop = function () {
        clearInterval(reloj); stream.getTracks().forEach(function (tr) { tr.stop(); });
        var blob = new Blob(trozos, { type: g.mimeType || t || 'audio/webm' });
        A.grabador = null;
        if (blob.size < 100) { mensaje('No se grabó nada.', 'err'); pintaVoz(); return; }
        if (A.audio && A.audio.url) URL.revokeObjectURL(A.audio.url);
        A.audio = { blob: blob, tipo: blob.type, dur: Math.round((Date.now() - t0) / 1000), url: URL.createObjectURL(blob) };
        mensaje('Nota de voz guardada (' + A.audio.dur + ' s). Puedes escucharla abajo.', 'ok'); pintaVoz();
      };
      g.onerror = function () { mensaje('Falló la grabación.', 'err'); };
      g.start(250); A.grabador = g;
      reloj = setInterval(function () { var s = Math.round((Date.now() - t0) / 1000); b.innerHTML = svg('<rect x="6" y="6" width="12" height="12" rx="2"/>') + ' Parar · ' + s + ' s'; if (s >= 300) g.stop(); }, 500);
      b.className = 'an-btn rec'; b.innerHTML = svg('<rect x="6" y="6" width="12" height="12" rx="2"/>') + ' Parar';
      mensaje('Grabando… habla y pulsa «Parar» cuando termines.');
    }).catch(function (e) {
      mensaje(e && e.name === 'NotAllowedError' ? 'Sin permiso para el micrófono: actívalo en el navegador y vuelve a pulsar.' : 'No se pudo abrir el micrófono: ' + (e && e.message || e), 'err');
    });
  }
  function pintaVoz() {
    var b = A.capa.querySelector('#an-voz'), a = A.capa.querySelector('#an-audio');
    b.className = 'an-btn' + (A.audio ? ' hay' : '');
    b.innerHTML = svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>') + (A.audio ? ' Grabar de nuevo' : ' Grabar voz');
    a.innerHTML = '';
    if (A.audio) {
      var au = el('audio'); au.controls = true; au.src = A.audio.url; a.appendChild(au);
      var q = el('button', 'an-btn', svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>') + ' Quitar la voz'); q.type = 'button';
      q.addEventListener('click', function () { URL.revokeObjectURL(A.audio.url); A.audio = null; pintaVoz(); mensaje(''); });
      a.appendChild(q);
    }
  }
  function mensaje(t, cls, id) { var m = A.capa && A.capa.querySelector('#' + (id || 'an-msg')); if (!m) return; m.textContent = t; m.className = 'an-msg' + (cls ? ' ' + cls : ''); }

  /* ---------- exportar ---------- */
  function lienzoFinal() {
    var c = document.createElement('canvas'); c.width = A.fondo.width; c.height = A.fondo.height;
    var x = c.getContext('2d'); x.drawImage(A.fondo, 0, 0); var s = A.sel; A.sel = null; pintaTodo(x, A.dpr); A.sel = s; return c;
  }
  function aBlob(c) { return new Promise(function (ok) { if (c.toBlob) c.toBlob(ok, 'image/png'); else { var d = atob(c.toDataURL('image/png').split(',')[1]), u = new Uint8Array(d.length); for (var i = 0; i < d.length; i++) u[i] = d.charCodeAt(i); ok(new Blob([u], { type: 'image/png' })); } }); }
  function leerDataUrl(blob) { return new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = ko; r.readAsDataURL(blob); }); }
  function datos() {
    var formas = A.formas.map(function (f) { var o = {}; for (var k in f) if (k !== 'img') o[k] = f[k]; if (f.t === 'imagen' && f.img) { try { var c = document.createElement('canvas'); c.width = f.img.naturalWidth; c.height = f.img.naturalHeight; c.getContext('2d').drawImage(f.img, 0, 0); o.src = c.toDataURL('image/png'); } catch (e) { o.src = null; } } return o; });
    var m = {}; for (var k in A.meta) m[k] = A.meta[k];
    return { formato: 'anotacion-prupru/1', meta: m, nota: A.nota, audio: A.audio ? { tipo: A.audio.tipo, segundos: A.audio.dur } : null, sin_captura: A.sinCaptura, formas: formas };
  }
  function nombreBase() { var p = (location.pathname.split('/').pop() || 'index').replace(/\.html?$/, '') || 'index'; return 'anotacion-' + p + '-' + sello(); }

  function informeHtml(pngUrl, audioUrl, json) {
    var m = json.meta;
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anotación · ' + esc(m.titulo) + ' · ' + esc(m.fecha) + '</title>'
      + '<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#F6F2EA;color:#1E2528}main{max-width:900px;margin:0 auto;padding:16px}h1{font-size:1.35rem;margin:.2rem 0 .6rem}img{width:100%;height:auto;border-radius:10px;box-shadow:0 8px 24px -14px rgba(0,0,0,.5);background:#fff}dl{display:grid;grid-template-columns:auto 1fr;gap:.25rem .8rem;font-size:.9rem;margin:.6rem 0}dt{color:#7C868A}dd{margin:0;word-break:break-word}.nota{white-space:pre-wrap;background:#fff;border:1px solid #DED7C9;border-radius:10px;padding:.8rem;margin:.8rem 0}audio{width:100%;margin:.5rem 0}details{font-size:.85rem}pre{white-space:pre-wrap;word-break:break-all;background:#EFEBE2;padding:.6rem;border-radius:8px;max-height:40vh;overflow:auto}</style></head><body><main>'
      + '<h1>Anotación sobre «' + esc(m.titulo) + '»</h1>'
      + '<dl><dt>Página</dt><dd><a href="' + esc(m.pagina) + '">' + esc(m.pagina) + '</a></dd><dt>Build</dt><dd>' + esc(m.build || '—') + '</dd><dt>Fecha</dt><dd>' + esc(m.fecha) + '</dd><dt>Ventana</dt><dd>' + m.ventana.ancho + '×' + m.ventana.alto + ' px, scroll ' + m.ventana.scrollX + ',' + m.ventana.scrollY + '</dd><dt>Navegador</dt><dd>' + esc(m.navegador) + '</dd></dl>'
      + '<img src="' + pngUrl + '" alt="Captura anotada">'
      + (json.nota ? '<div class="nota">' + esc(json.nota) + '</div>' : '<p style="color:#7C868A">Sin nota de texto.</p>')
      + (audioUrl ? '<p><b>Nota de voz</b> (' + json.audio.segundos + ' s)</p><audio controls src="' + audioUrl + '"></audio>' : '')
      + (json.sin_captura ? '<p style="color:#B3261E">La captura automática falló en este navegador: el fondo es plano; la posición de las marcas es correcta respecto a la ventana.</p>' : '')
      + '<details><summary>Datos de la anotación (JSON)</summary><pre id="j"></pre></details>'
      + '<script type="application/json" id="datos">' + JSON.stringify(json).replace(/<\//g, '<\\/') + '</script>'
      + '<script>document.getElementById("j").textContent=JSON.stringify(JSON.parse(document.getElementById("datos").textContent),null,1)</script>'
      + '</main></body></html>';
  }

  function preparar() {
    A.nota = (A.capa.querySelector('#an-nota').value || '').trim();
    var json = datos(), png;
    return aBlob(lienzoFinal()).then(function (b) { png = b; return leerDataUrl(b); }).then(function (pngUrl) {
      return (A.audio ? leerDataUrl(A.audio.blob) : Promise.resolve(null)).then(function (audioUrl) {
        var base = nombreBase();
        var html = new Blob([informeHtml(pngUrl, audioUrl, json)], { type: 'text/html' });
        var salida = { base: base, png: new File([png], base + '.png', { type: 'image/png' }), html: new File([html], base + '.html', { type: 'text/html' }), audio: null, json: json };
        if (A.audio) salida.audio = new File([A.audio.blob], base + '-voz.' + extAudio(A.audio.tipo), { type: A.audio.tipo });
        return salida;
      });
    });
  }
  function descargar(f) { var a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
  function puedeCompartir(files) { try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: files })); } catch (e) { return false; } }

  // ¿Este navegador comparte ficheros (WhatsApp, correo…)? Se decide con un fichero de prueba.
  function shareDisponible() { try { return puedeCompartir([new File(['x'], 'x.png', { type: 'image/png' })]); } catch (e) { return false; } }
  // Comparte los ficheros ya preparados. Debe llamarse dentro del toque del usuario: Safari y Chrome lo exigen.
  function compartirListo(s) {
    var texto = 'Anotación sobre ' + s.json.meta.titulo + (s.json.nota ? ': ' + s.json.nota : '');
    var listas = [[s.png, s.audio, s.html], [s.png, s.audio], [s.png]].map(function (l) { return l.filter(Boolean); });
    for (var i = 0; i < listas.length; i++) if (puedeCompartir(listas[i])) {
      return navigator.share({ title: 'Anotación · ' + s.json.meta.titulo, text: texto, files: listas[i] });
    }
    return Promise.reject(new Error('sin-share'));
  }

  /* ---------- interfaz ---------- */
  function marcaHerr() {
    A.capa.querySelectorAll('[data-herr]').forEach(function (b) { b.classList.toggle('on', b.dataset.herr === A.herr); b.setAttribute('aria-pressed', b.dataset.herr === A.herr); });
    A.capa.querySelectorAll('[data-color]').forEach(function (b) { b.classList.toggle('on', b.dataset.color === A.color); });
    A.capa.querySelectorAll('[data-grosor]').forEach(function (b) { b.classList.toggle('on', +b.dataset.grosor === A.grosor); });
    A.dibujo.style.cursor = A.herr === 'imagen' ? 'move' : A.herr === 'texto' ? 'text' : 'crosshair';
  }
  function actualizaBotones() {
    var d = A.capa.querySelector('#an-deshacer'), b = A.capa.querySelector('#an-borrar'), z = A.capa.querySelectorAll('.an-zoom');
    d.disabled = b.disabled = !A.formas.length;
    z.forEach(function (x) { x.hidden = !A.sel; });
  }

  function abrir() {
    if (A.abierto) return Promise.resolve();
    A.abierto = true; A.formas = []; A.actual = null; A.sel = null; A.audio = null; A.sinCaptura = false;
    var fab = document.querySelector('.an-fab'); if (fab) fab.hidden = true;
    var capa = el('div', 'an-capa an-ui'); capa.setAttribute('role', 'dialog'); capa.setAttribute('aria-label', 'Anotar esta pantalla');
    var top = el('div', 'an-top'); var cerrar = el('button', 'an-ib', svg('<path d="M6 6l12 12M18 6L6 18"/>')); cerrar.type = 'button'; cerrar.setAttribute('aria-label', 'Cerrar sin enviar');
    top.appendChild(cerrar); top.appendChild(el('b', null, 'Anotar esta pantalla <small>· ' + esc(meta('build') || document.title) + '</small>'));
    var zona = el('div', 'an-zona'), marco = el('div', 'an-marco'); zona.appendChild(marco);
    var cargando = el('div', 'an-cargando', 'Capturando la pantalla…'); zona.appendChild(cargando);
    var barra = el('div', 'an-barra'); barra.setAttribute('role', 'toolbar'); barra.setAttribute('aria-label', 'Herramientas');
    HERR.forEach(function (h) { var b = el('button', 'an-ib', svg(h[2])); b.type = 'button'; b.dataset.herr = h[0]; b.title = h[1]; b.setAttribute('aria-label', h[1]); barra.appendChild(b); });
    barra.appendChild(el('span', 'an-sep'));
    // Segunda fila: colores y grosores, para que en el móvil se vean sin desplazar.
    var barra2 = el('div', 'an-barra an-barra2'); barra2.setAttribute('role', 'toolbar'); barra2.setAttribute('aria-label', 'Colores y grosor');
    COLORES.forEach(function (c) { var b = el('button', 'an-col'); b.type = 'button'; b.dataset.color = c; b.style.background = c; b.setAttribute('aria-label', 'Color ' + c); barra2.appendChild(b); });
    barra2.appendChild(el('span', 'an-sep'));
    GROSORES.forEach(function (g) { var b = el('button', 'an-gro', '<i style="width:' + (g + 4) + 'px;height:' + (g + 4) + 'px"></i>'); b.type = 'button'; b.dataset.grosor = g; b.setAttribute('aria-label', 'Grosor ' + g); barra2.appendChild(b); });
    var zm = el('button', 'an-ib an-zoom', svg('<circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M20 20l-4-4"/>')); zm.type = 'button'; zm.title = 'Imagen más grande'; zm.setAttribute('aria-label', zm.title); zm.hidden = true;
    var zl = el('button', 'an-ib an-zoom', svg('<circle cx="11" cy="11" r="7"/><path d="M8 11h6M20 20l-4-4"/>')); zl.type = 'button'; zl.title = 'Imagen más pequeña'; zl.setAttribute('aria-label', zl.title); zl.hidden = true;
    var des = el('button', 'an-ib', svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h9a6 6 0 0 1 0 12H8"/>')); des.type = 'button'; des.id = 'an-deshacer'; des.title = 'Deshacer'; des.setAttribute('aria-label', 'Deshacer');
    var bor = el('button', 'an-ib', svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')); bor.type = 'button'; bor.id = 'an-borrar'; bor.title = 'Borrar todo'; bor.setAttribute('aria-label', 'Borrar todo');
    barra.appendChild(zm); barra.appendChild(zl); barra.appendChild(des); barra.appendChild(bor);
    var fich = el('input', 'an-sr'); fich.type = 'file'; fich.accept = 'image/*'; fich.setAttribute('aria-label', 'Elegir imagen'); fich.id = 'an-fichero';
    // Panel «Nota y voz»: solo el comentario escrito y la nota de voz.
    var panel = el('div', 'an-panel'); panel.hidden = true;
    var ta = el('textarea'); ta.id = 'an-nota'; ta.placeholder = 'Escribe aquí tu comentario (opcional)'; ta.setAttribute('aria-label', 'Nota de texto');
    var fila = el('div', 'an-fila'); var voz = el('button', 'an-btn'); voz.type = 'button'; voz.id = 'an-voz';
    var bHecho = el('button', 'an-btn', svg('<path d="M5 12l5 5 9-10"/>') + ' Hecho'); bHecho.type = 'button'; bHecho.id = 'an-hecho';
    var audioCaja = el('div', 'an-fila'); audioCaja.id = 'an-audio';
    fila.appendChild(voz); fila.appendChild(bHecho); panel.appendChild(ta); panel.appendChild(fila); panel.appendChild(audioCaja);
    var msg = el('p', 'an-msg'); msg.id = 'an-msg'; msg.setAttribute('aria-live', 'polite'); panel.appendChild(msg);
    // Hoja «Enviar»: una sola forma de llegar aquí y tres salidas claras.
    var envio = el('div', 'an-envio'); envio.hidden = true; envio.id = 'an-envio';
    envio.appendChild(el('h3', null, '¿Cómo quieres enviar la anotación?'));
    var resumen = el('p', 'an-res'); resumen.id = 'an-resumen'; envio.appendChild(resumen);
    var bComp = el('button', 'an-btn pri', svg('<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3M7 8l5-5 5 5"/>') + ' Compartir <small>WhatsApp, correo…</small>'); bComp.type = 'button'; bComp.id = 'an-compartir';
    var bHtml = el('button', 'an-btn', svg('<path d="M12 3v12M7 10l5 5 5-5M4 19h16"/>') + ' Descargar informe <small>todo en un fichero</small>'); bHtml.type = 'button'; bHtml.id = 'an-informe';
    var bPng = el('button', 'an-btn', svg('<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 17l5-4 3 3 3-2 5 3"/>') + ' Descargar imagen <small>solo la captura</small>'); bPng.type = 'button'; bPng.id = 'an-png';
    var msg2 = el('p', 'an-msg'); msg2.id = 'an-msg2'; msg2.setAttribute('aria-live', 'polite');
    var bVolver = el('button', 'an-btn', svg('<path d="M15 6l-6 6 6 6"/>') + ' Volver a la anotación'); bVolver.type = 'button'; bVolver.id = 'an-volver';
    var bFin = el('button', 'an-btn pri', svg('<path d="M5 12l5 5 9-10"/>') + ' Enviado: cerrar'); bFin.type = 'button'; bFin.id = 'an-fin'; bFin.hidden = true;
    envio.appendChild(bComp); envio.appendChild(bHtml); envio.appendChild(bPng); envio.appendChild(msg2); envio.appendChild(bFin); envio.appendChild(bVolver);
    var pie = el('div', 'an-pie');
    var bNota = el('button', 'an-btn', svg('<path d="M4 5h16v11H8l-4 4z"/>') + ' Nota y voz'); bNota.type = 'button'; bNota.id = 'an-abre-nota';
    var bEnv = el('button', 'an-btn pri', svg('<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3M7 8l5-5 5 5"/>') + ' Enviar'); bEnv.type = 'button'; bEnv.id = 'an-enviar';
    pie.appendChild(bNota); pie.appendChild(bEnv);
    capa.appendChild(top); capa.appendChild(zona); capa.appendChild(barra); capa.appendChild(barra2); capa.appendChild(panel); capa.appendChild(envio); capa.appendChild(pie); capa.appendChild(fich);
    document.body.appendChild(capa); A.capa = capa;
    var scrollAntes = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden';
    A.restaurarScroll = function () { document.documentElement.style.overflow = scrollAntes; };

    function abrePanel(mostrar) { panel.hidden = !mostrar; bNota.classList.toggle('on', mostrar); ajustar(); if (mostrar) pintaVoz(); }
    function abreEnvio() {
      abrePanel(false); cerrarTexto(); A.sel = null; redibuja();
      if (A.grabador) { mensaje2('Para la grabación de voz antes de enviar.'); abrePanel(true); return; }
      A.enviando = true; A.listo = null; barra.hidden = barra2.hidden = pie.hidden = true; envio.hidden = false; bFin.hidden = true;
      var partes = [A.formas.length ? A.formas.length + (A.formas.length === 1 ? ' marca' : ' marcas') : 'sin marcas', ta.value.trim() ? 'comentario' : null, A.audio ? 'voz de ' + A.audio.dur + ' s' : null].filter(Boolean);
      resumen.textContent = 'Se envía la captura anotada (' + partes.join(', ') + ') sobre «' + (meta('build') || document.title) + '».';
      bComp.hidden = !shareDisponible(); [bComp, bHtml, bPng].forEach(function (b) { b.disabled = true; });
      mensaje2('Preparando los ficheros…'); ajustar();
      preparar().then(function (s) { if (!A.enviando) return; A.listo = s; [bComp, bHtml, bPng].forEach(function (b) { b.disabled = false; }); mensaje2(bComp.hidden ? 'Listo. Este navegador no comparte ficheros: descarga el informe y envíalo por correo o mensajería.' : 'Listo.'); })
        .catch(function (e) { mensaje2('No se pudieron preparar los ficheros: ' + (e && e.message || e), 'err'); });
    }
    function cierraEnvio() { A.enviando = false; A.listo = null; envio.hidden = true; barra.hidden = barra2.hidden = pie.hidden = false; ajustar(); }
    function mensaje2(t, cls) { mensaje(t, cls, 'an-msg2'); }
    cerrar.addEventListener('click', function () { if (!A.formas.length && !A.audio && !ta.value.trim() || confirm('¿Cerrar sin enviar? Se perderá la anotación.')) cerrarTodo(); });
    barra2.addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b) return; if (b.dataset.color) A.color = b.dataset.color; else if (b.dataset.grosor) A.grosor = +b.dataset.grosor; marcaHerr(); });
    barra.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.herr) { if (b.dataset.herr === 'imagen') { fich.value = ''; fich.click(); } A.herr = b.dataset.herr; if (A.herr !== 'imagen') A.sel = null; cerrarTexto(); marcaHerr(); redibuja(); }
      else if (b.dataset.color) { A.color = b.dataset.color; marcaHerr(); }
      else if (b.dataset.grosor) { A.grosor = +b.dataset.grosor; marcaHerr(); }
      else if (b === des) { A.formas.pop(); A.sel = null; redibuja(); }
      else if (b === bor) { if (confirm('¿Borrar todas las marcas?')) { A.formas = []; A.sel = null; redibuja(); } }
      else if (b === zm) escalaSel(1.25); else if (b === zl) escalaSel(0.8);
    });
    fich.addEventListener('change', function () { cargarImagen(fich.files && fich.files[0]); });
    bNota.addEventListener('click', function () { abrePanel(panel.hidden); });
    bHecho.addEventListener('click', function () { abrePanel(false); });
    bEnv.addEventListener('click', abreEnvio);
    bVolver.addEventListener('click', cierraEnvio);
    bFin.addEventListener('click', cerrarTodo);
    bComp.addEventListener('click', function () {
      if (!A.listo) return;
      compartirListo(A.listo).then(function () { mensaje2('Enviado.', 'ok'); bFin.hidden = false; }, function (e) {
        if (e && e.name === 'AbortError') mensaje2('No se ha enviado: has cerrado el menú de compartir. Puedes volver a intentarlo.');
        else if (e && e.name === 'NotAllowedError') mensaje2('El navegador no dejó abrir el menú de compartir. Toca «Compartir» otra vez.', 'err');
        else if (e && e.message === 'sin-share') { bComp.hidden = true; mensaje2('Este navegador no comparte ficheros: descarga el informe y envíalo por correo o mensajería.'); }
        else mensaje2('No se pudo compartir: ' + (e && e.message || e), 'err');
      });
    });
    bHtml.addEventListener('click', function () { if (!A.listo) return; descargar(A.listo.html); mensaje2('Descargado ' + A.listo.html.name + '. Es un solo fichero con la imagen, el comentario y la voz: envíalo por correo o mensajería.', 'ok'); bFin.hidden = false; });
    bPng.addEventListener('click', function () { if (!A.listo) return; descargar(A.listo.png); mensaje2('Descargada ' + A.listo.png.name + ' (la voz y el comentario no van en la imagen).', 'ok'); bFin.hidden = false; });
    voz.addEventListener('click', grabarVoz);

    return capturar().then(function (fondo) {
      A.fondo = fondo;
      var cf = document.createElement('canvas'); cf.className = 'an-fondo'; cf.width = fondo.width; cf.height = fondo.height; cf.getContext('2d').drawImage(fondo, 0, 0);
      var cd = document.createElement('canvas'); cd.className = 'an-dibujo'; cd.width = fondo.width; cd.height = fondo.height; cd.setAttribute('aria-label', 'Lienzo de anotación');
      marco.appendChild(cf); marco.appendChild(cd); A.dibujo = cd; A.ctx = cd.getContext('2d');
      cd.addEventListener('pointerdown', abajo); cd.addEventListener('pointermove', mueve); cd.addEventListener('pointerup', arriba); cd.addEventListener('pointercancel', arriba);
      cd.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      cargando.remove(); ajustar(); marcaHerr(); redibuja();
      if (A.sinCaptura) { abrePanel(true); mensaje('No se pudo fotografiar la página en este navegador: anota sobre el fondo plano; la posición de las marcas se conserva.', 'err'); }
      A.abrePanel = abrePanel;
      window.addEventListener('resize', ajustar);
      return true;
    });
  }
  function ajustar() {
    if (!A.capa || !A.dibujo) return;
    var zona = A.capa.querySelector('.an-zona'), marco = A.capa.querySelector('.an-marco');
    var aw = zona.clientWidth - 12, ah = zona.clientHeight - 12, k = Math.min(aw / A.baseW, ah / A.baseH, 1);
    marco.style.width = Math.floor(A.baseW * k) + 'px'; marco.style.height = Math.floor(A.baseH * k) + 'px';
  }
  function cerrarTodo() {
    if (!A.abierto) return;
    if (A.grabador) { try { A.grabador.stop(); } catch (e) { } }
    cerrarTexto(); window.removeEventListener('resize', ajustar);
    if (A.audio && A.audio.url) URL.revokeObjectURL(A.audio.url);
    A.capa.remove(); A.capa = null; A.dibujo = null; A.ctx = null; A.audio = null; A.grabador = null; A.abierto = false; A.enviando = false; A.listo = null;
    if (A.restaurarScroll) A.restaurarScroll();
    var fab = document.querySelector('.an-fab'); if (fab) fab.hidden = false;
  }

  function fab() {
    if (document.querySelector('.an-fab')) return;
    var b = el('button', 'an-fab an-ui', svg('<path d="M4 20l4-1 10-10-3-3L5 16z"/><path d="M13 7l3 3"/>') + 'Anotar');
    b.type = 'button'; b.setAttribute('aria-label', 'Anotar esta pantalla y enviar comentarios');
    b.addEventListener('click', function () { abrir(); });
    document.body.appendChild(b);
  }
  if (document.body) fab(); else document.addEventListener('DOMContentLoaded', fab);

  window.ANOTAR = {
    abrir: abrir, cerrar: cerrarTodo, preparar: preparar,
    estado: function () { return { abierto: A.abierto, formas: A.formas.length, tipos: A.formas.map(function (f) { return f.t; }), herr: A.herr, color: A.color, grosor: A.grosor, sinCaptura: A.sinCaptura, audio: A.audio ? { tipo: A.audio.tipo, bytes: A.audio.blob.size, dur: A.audio.dur } : null, base: [A.baseW, A.baseH, A.dpr], meta: A.meta }; },
    datos: datos
  };
})();
