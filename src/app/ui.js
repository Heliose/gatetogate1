import { WORLD_SCHEMA, CAMERA_SCHEMA, LOOK_SCHEMA, fmtValue } from './state.js';
import { fmtHour, timeWord } from '../world/lighting.js';

/* ------------------------------------------------------------------ *
 * DOM side: chapter rail, transport, scrubber, captions, clock, the
 * schema-driven controls panel (Chapter / World / Camera / Look /
 * Vitals), toasts, tooltip, help. Built once, refreshed from state.
 * ------------------------------------------------------------------ */
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export class UI {
  constructor(app) {
    this.app = app;
    this.director = app.director;
    this.tab = 'chapter';
    this.panelBody = $('#panel-body');
    this.toastEl = $('#toast');
    this.tooltipEl = $('#tooltip');
    this.captionEl = $('#caption-text');
    this.buildChips();
    this.buildTransport();
    this.buildScrub();
    this.buildTabs();
    this.buildToolbar();
    this.renderPanel();
    this._lastLive = 0;
    this.director.onChange = (what) => this.onDirector(what);
    this.onDirector('chapter');
  }

  /* ---------- chapter rail ---------- */
  buildChips() {
    const wrap = $('#chips');
    this.chips = this.director.chapters.map((c, i) => {
      const b = el('button', 'chip');
      b.innerHTML = `<div class="n">${String(i + 1).padStart(2, '0')}</div><div class="t">${c.title}</div><i class="bar"></i>`;
      b.title = `${c.title} — ${c.sub}`;
      b.addEventListener('click', () => this.director.go(i));
      wrap.appendChild(b);
      return b;
    });
  }
  buildTransport() {
    $('#btn-prev').onclick = () => this.director.prev();
    $('#btn-next').onclick = () => this.director.next();
    $('#btn-play').onclick = () => this.director.toggle();
    $('#btn-resume').onclick = () => this.app.setAutoCam(true);
  }
  buildScrub() {
    const s = $('#scrub');
    const frac = (clientX) => {
      const r = s.getBoundingClientRect();
      return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    };
    let dragging = false, wasPlaying = false;
    s.addEventListener('pointerdown', (e) => {
      dragging = true;
      wasPlaying = this.director.playing;
      this.director.pause();
      try { s.setPointerCapture(e.pointerId); } catch { /* released */ }
      this.director.scrub(frac(e.clientX));
    });
    s.addEventListener('pointermove', (e) => dragging && this.director.scrub(frac(e.clientX)));
    const end = () => { if (!dragging) return; dragging = false; if (wasPlaying) this.director.play(); };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
    s.addEventListener('keydown', (e) => {
      const d = this.director, step = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowRight') d.scrub(Math.min(1, (d.t + step) / d.duration));
      if (e.key === 'ArrowLeft') d.scrub(Math.max(0, (d.t - step) / d.duration));
    });
  }

  /* ---------- panel ---------- */
  buildTabs() {
    const tabs = $('#ptabs');
    this.tabEls = {};
    for (const [id, label] of [['chapter', 'Chapter'], ['world', 'World'], ['camera', 'Camera'], ['look', 'Look'], ['vitals', 'Vitals']]) {
      const b = el('button', 'ptab', label);
      b.addEventListener('click', () => this.setTab(id));
      tabs.appendChild(b);
      this.tabEls[id] = b;
    }
    $('#panel-collapse').onclick = () => this.togglePanel(false);
    $('#panel-open').onclick = () => this.togglePanel(true);
    this.setTab('chapter');
  }
  togglePanel(open) {
    const closed = open === undefined ? !document.body.classList.contains('panel-closed') : !open;
    document.body.classList.toggle('panel-closed', closed);
  }
  setTab(id) {
    this.tab = id;
    for (const [k, b] of Object.entries(this.tabEls)) b.classList.toggle('on', k === id);
    this.renderPanel();
  }
  renderPanel() {
    const body = this.panelBody;
    body.innerHTML = '';
    body.scrollTop = 0;
    const d = this.director, c = d.chapter;
    if (this.tab === 'chapter' && c) {
      const head = el('div', 'pnote');
      head.innerHTML = `<b>${String(d.index + 1).padStart(2, '0')} · ${c.title}</b><br>${c.blurb || c.sub}`;
      body.appendChild(head);
      this.liveEl = el('div', 'live');
      body.appendChild(this.liveEl);
      this.renderLive(true);
      if (c.params?.length) {
        const groups = new Map();
        for (const s of c.params) { const g = s.group || 'Controls'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(s); }
        for (const [g, list] of groups) body.appendChild(this.controlsGroup(g, list, d.p, (k, v) => d.setParam(k, v)));
        const reset = el('button', 'ctl-btn', 'Reset chapter controls');
        reset.onclick = () => { d.resetParams(); this.renderPanel(); };
        body.appendChild(reset);
      }
    } else if (this.tab === 'world') {
      body.appendChild(this.controlsGroup('World', WORLD_SCHEMA, this.app.settings.world, (k, v) => this.app.setSetting('world', k, v)));
      const lights = el('div', 'ctl-group');
      lights.appendChild(el('span', 'label', 'AIRFIELD LIGHT GROUPS'));
      this.app.lightGroups.forEach((name, i) => {
        const row = el('div', 'ctl');
        row.innerHTML = `<div class="cl">${name}</div>`;
        const sw = el('button', 'switch' + (this.app.settings.lightGroups[i] ? ' on' : ''));
        sw.setAttribute('role', 'switch');
        sw.onclick = () => { const on = !this.app.settings.lightGroups[i]; this.app.setLightGroup(i, on); sw.classList.toggle('on', on); };
        row.appendChild(sw);
        lights.appendChild(row);
      });
      body.appendChild(lights);
    } else if (this.tab === 'camera') {
      body.appendChild(this.controlsGroup('Camera', CAMERA_SCHEMA, this.app.settings.camera, (k, v) => this.app.setSetting('camera', k, v)));
      if (c?.shots?.length) {
        const g = el('div', 'ctl-group');
        g.appendChild(el('span', 'label', 'SHOTS IN THIS CHAPTER'));
        const seg = el('div', 'seg');
        seg.style.flexWrap = 'wrap';
        c.shots.forEach((s, i) => {
          const b = el('button', '', `${i + 1}`);
          b.title = `Jump to shot ${i + 1} (${Math.round(s.at)} s)`;
          b.style.flex = '0 0 30px';
          b.onclick = () => { this.app.setAutoCam(true); d.scrub(s.at / d.duration); };
          seg.appendChild(b);
        });
        g.appendChild(seg);
        body.appendChild(g);
      }
      const note = el('div', 'pnote', 'Drag the view at any time to take the camera. <b>F</b> hands it back to the film. Right-drag pans, wheel zooms.');
      body.appendChild(note);
    } else if (this.tab === 'look') {
      body.appendChild(this.controlsGroup('Look', LOOK_SCHEMA, this.app.settings.look, (k, v) => this.app.setSetting('look', k, v)));
      const stats = el('div', 'pnote');
      stats.id = 'render-stats';
      body.appendChild(stats);
      const presets = el('div', 'ctl-group');
      presets.appendChild(el('span', 'label', 'LOOK PRESETS'));
      const seg = el('div', 'seg');
      for (const [name, vals] of Object.entries(this.app.lookPresets)) {
        const b = el('button', '', name);
        b.onclick = () => { for (const [k, v] of Object.entries(vals)) this.app.setSetting('look', k, v); this.renderPanel(); this.toast(`${name} look`); };
        seg.appendChild(b);
      }
      presets.appendChild(seg);
      body.appendChild(presets);
    } else if (this.tab === 'vitals') {
      this.vitalsEl = el('div', 'vitals');
      body.appendChild(this.vitalsEl);
      const note = el('div', 'pnote', 'Live readings derived from the simulation: traffic, flows under the apron, the turnaround, and the time of day. The pulse in the header is the airport’s activity, as a heartbeat.');
      body.appendChild(note);
      this.renderVitals(true);
    }
  }

  /* schema-driven controls */
  controlsGroup(title, schema, values, onChange) {
    const g = el('div', 'ctl-group');
    g.appendChild(el('span', 'label', title.toUpperCase()));
    for (const s of schema) g.appendChild(this.control(s, values, onChange));
    return g;
  }
  control(s, values, onChange) {
    const row = el('div', 'ctl');
    row.dataset.key = s.key;
    const v = values[s.key];
    if (s.type === 'range') {
      row.innerHTML = `<div class="cl">${s.label}</div><div class="cv">${fmtValue(s, v)}</div>`;
      const inp = el('input', 'accent');
      inp.type = 'range';
      inp.min = s.min; inp.max = s.max; inp.step = s.step;
      inp.value = v;
      const upd = () => { inp.style.setProperty('--p', `${((inp.value - s.min) / (s.max - s.min)) * 100}%`); row.querySelector('.cv').textContent = fmtValue(s, +inp.value); };
      upd();
      inp.addEventListener('input', () => { upd(); onChange(s.key, +inp.value); });
      const w = el('div', 'cw');
      w.appendChild(inp);
      row.appendChild(w);
      row._sync = (val) => { inp.value = val; upd(); };
    } else if (s.type === 'toggle') {
      row.innerHTML = `<div class="cl">${s.label}</div>`;
      const sw = el('button', 'switch' + (v ? ' on' : ''));
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-checked', String(!!v));
      sw.onclick = () => { const nv = !sw.classList.contains('on'); sw.classList.toggle('on', nv); sw.setAttribute('aria-checked', String(nv)); onChange(s.key, nv); };
      row.appendChild(sw);
      row._sync = (val) => sw.classList.toggle('on', !!val);
    } else if (s.type === 'seg') {
      row.innerHTML = `<div class="cl">${s.label}</div><div class="cv"></div>`;
      const seg = el('div', 'seg cw');
      for (const opt of s.options) {
        const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
        const b = el('button', o.value === v ? 'on' : '', o.label);
        b.onclick = () => { [...seg.children].forEach((x) => x.classList.remove('on')); b.classList.add('on'); onChange(s.key, o.value); };
        seg.appendChild(b);
      }
      row.appendChild(seg);
    } else if (s.type === 'select') {
      row.innerHTML = `<div class="cl">${s.label}</div>`;
      const sel = el('select', 'cw');
      for (const opt of s.options) {
        const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
        const op = el('option', '', o.label);
        op.value = o.value;
        if (o.value === v) op.selected = true;
        sel.appendChild(op);
      }
      sel.onchange = () => onChange(s.key, sel.value);
      row.appendChild(sel);
    } else if (s.type === 'color') {
      row.innerHTML = `<div class="cl">${s.label}</div>`;
      const inp = el('input');
      inp.type = 'color';
      inp.value = v;
      inp.addEventListener('input', () => onChange(s.key, inp.value));
      row.appendChild(inp);
    } else if (s.type === 'text') {
      row.innerHTML = `<div class="cl">${s.label}</div>`;
      const inp = el('input', 'cw');
      inp.type = 'text';
      inp.value = v;
      inp.maxLength = s.max || 12;
      inp.addEventListener('change', () => onChange(s.key, inp.value));
      row.appendChild(inp);
    } else if (s.type === 'button') {
      const b = el('button', 'ctl-btn' + (s.variant ? ' ' + s.variant : ''), s.label);
      b.onclick = () => onChange(s.key, Date.now());
      row.classList.add('cw');
      row.style.display = 'block';
      row.appendChild(b);
    }
    if (s.hint) row.appendChild(el('div', 'hint', s.hint));
    return row;
  }
  syncControl(key, value) {
    const row = this.panelBody.querySelector(`.ctl[data-key="${key}"]`);
    row?._sync?.(value);
  }

  /* live block inside the Chapter tab (gantt, legend, read-outs) */
  renderLive(force = false) {
    if (this.tab !== 'chapter' || !this.liveEl) return;
    const now = performance.now();
    if (!force && now - this._lastLive < 250) return;
    this._lastLive = now;
    const c = this.director.chapter;
    const html = c.panel ? c.panel(this.app.ctx, this.director.p, this.director.t) : '';
    if (html !== this._liveHtml) { this.liveEl.innerHTML = html; this._liveHtml = html; }
  }
  renderVitals(force = false) {
    if (this.tab !== 'vitals' || !this.vitalsEl) return;
    const now = performance.now();
    if (!force && now - this._lastLive < 250) return;
    this._lastLive = now;
    const rows = this.app.vitals();
    let html = '';
    for (const r of rows) html += `<div class="vital ${r.cls || ''}"><div class="vl">${r.label}</div><div class="vv">${r.value}<small>${r.unit || ''}</small></div><div class="vb"><i style="width:${Math.round(Math.min(1, r.pct) * 100)}%"></i></div></div>`;
    if (html !== this._vitalsHtml) { this.vitalsEl.innerHTML = html; this._vitalsHtml = html; }
  }

  /* ---------- toolbar ---------- */
  buildToolbar() {
    $('#btn-eye').onclick = () => this.app.toggleUI();
    $('#btn-help').onclick = () => this.toggleHelp();
    $('#help-close').onclick = () => this.toggleHelp(false);
    $('#help').addEventListener('click', (e) => e.target.id === 'help' && this.toggleHelp(false));
    $('#btn-save').onclick = () => this.app.saveFrame();
    $('#btn-link').onclick = () => this.app.copyLink();
    $('#btn-sound').onclick = () => this.app.toggleSound();
    $('#btn-narrate').onclick = () => this.app.toggleNarration();
  }
  toggleHelp(force) {
    const h = $('#help');
    const show = force === undefined ? h.hidden : force;
    h.hidden = !show;
  }

  /* ---------- refresh from the director ---------- */
  onDirector(what) {
    const d = this.director, c = d.chapter;
    if (!c) return;
    if (what === 'chapter') {
      $('#ch-num').textContent = String(d.index + 1).padStart(2, '0');
      $('#ch-title').textContent = c.title;
      $('#ch-sub').textContent = c.sub;
      this.chips.forEach((b, i) => { b.classList.toggle('on', i === d.index); b.classList.toggle('done', i < d.index); b.querySelector('.bar').style.width = i < d.index ? '100%' : '0'; });
      // caption marks on the scrubber
      const marks = $('#scrub-marks');
      marks.innerHTML = '';
      const dur = d.duration;
      for (const cap of c.captions || []) { const i = el('i', 'cap'); i.style.left = `${(cap.at / dur) * 100}%`; marks.appendChild(i); }
      for (const s of c.shots || []) { const i = el('i'); i.style.left = `${(s.at / dur) * 100}%`; marks.appendChild(i); }
      if (this.tab === 'chapter' || this.tab === 'camera') this.renderPanel();
      document.title = `Gate to Gate — ${String(d.index + 1).padStart(2, '0')} ${c.title}`;
    }
    if (what === 'play' || what === 'chapter') $('#btn-play').classList.toggle('playing', d.playing);
    if (what === 'time' || what === 'chapter') {
      const dur = d.duration, k = Math.min(1, d.t / dur);
      $('#scrub-fill').style.width = `${k * 100}%`;
      $('#scrub-knob').style.left = `${k * 100}%`;
      $('#scrub').setAttribute('aria-valuenow', Math.round(k * 100));
      const f = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      $('#scrub-time').textContent = `${f(d.t)} / ${f(dur)}`;
      this.chips[d.index].querySelector('.bar').style.width = `${k * 100}%`;
      this.renderLive();
      this.renderVitals();
    }
    if (what === 'params' && this.tab === 'chapter') this.renderLive(true);
  }

  caption(html) {
    const e = this.captionEl;
    if (!html) { e.classList.remove('show'); return; }
    e.innerHTML = html;
    e.classList.add('show');
  }
  clock(hour, bpm) {
    $('#clock-time').textContent = fmtHour(hour);
    $('#clock-word').textContent = timeWord(hour);
    $('#pulse-bpm').textContent = Math.round(bpm);
    $('#pulse i').style.animationDuration = `${(60 / Math.max(30, bpm)).toFixed(2)}s`;
  }
  toast(msg) {
    const t = this.toastEl;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }
  tooltip(title, sub, x, y) {
    const t = this.tooltipEl;
    if (!title) { t.classList.remove('show'); return; }
    t.querySelector('.tt-title').textContent = title;
    t.querySelector('.tt-sub').textContent = sub || '';
    t.classList.add('show');
    const w = t.offsetWidth, h = t.offsetHeight;
    let left = x - w / 2 + 10, top = y - h - 30;
    left = Math.max(8, Math.min(innerWidth - w - 8, left));
    if (top < 8) top = y + 24;
    t.style.left = `${left}px`;
    t.style.top = `${top}px`;
  }
  setButton(id, on) { $(id).classList.toggle('on', on); }
  renderStats(text) { const e = $('#render-stats'); if (e) e.innerHTML = text; }
}
