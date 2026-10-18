import * as THREE from 'three';

/* HTML labels projected over the 3D view, with optional leader lines (no CSS2DRenderer). */
export class Labels {
  constructor(container, svg) {
    this.container = container;
    this.svg = svg;
    this.items = new Map();
    this._v = new THREE.Vector3();
    this.zoom = 1;
    this.maxVisible = 40;
  }
  add(id, { anchor, html = '', cls = '', offset = [0, -14], leader = false, maxDist = Infinity, priority = 0, pop = false }) {
    let it = this.items.get(id);
    if (!it) {
      const el = document.createElement('div');
      el.className = 'lbl ' + cls;
      this.container.appendChild(el);
      let line = null, dot = null;
      if (leader) {
        const ns = 'http://www.w3.org/2000/svg';
        line = document.createElementNS(ns, 'line');
        dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('r', '3');
        this.svg.appendChild(line);
        this.svg.appendChild(dot);
      }
      it = { el, line, dot, anchor, offset, maxDist, priority, visible: true, html: null };
      this.items.set(id, it);
      if (pop) el.classList.add('pop');
    }
    it.anchor = anchor;
    it.offset = offset;
    it.maxDist = maxDist;
    it.priority = priority;
    if (html !== it.html) { it.el.innerHTML = html; it.html = html; }
    return it;
  }
  set(id, html) {
    const it = this.items.get(id);
    if (it && html !== it.html) { it.el.innerHTML = html; it.html = html; }
  }
  setClass(id, cls, on) { this.items.get(id)?.el.classList.toggle(cls, on); }
  has(id) { return this.items.has(id); }
  remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    it.el.remove();
    it.line?.remove();
    it.dot?.remove();
    this.items.delete(id);
  }
  removeWhere(fn) { for (const id of [...this.items.keys()]) if (fn(id)) this.remove(id); }
  clear() { for (const id of [...this.items.keys()]) this.remove(id); }

  update(camera, w, h) {
    const z = this.zoom;
    const list = [];
    for (const [id, it] of this.items) {
      const a = typeof it.anchor === 'function' ? it.anchor() : it.anchor;
      if (!a) { this._hide(it); continue; }
      this._v.copy(a).project(camera);
      const behind = this._v.z > 1;
      const x = (this._v.x * 0.5 + 0.5) * w, y = (-this._v.y * 0.5 + 0.5) * h;
      const dist = camera.position.distanceTo(a);
      const on = !behind && x > -80 && x < w + 80 && y > -40 && y < h + 40 && dist < it.maxDist;
      if (!on) { this._hide(it); continue; }
      list.push({ it, x, y, dist });
    }
    list.sort((p, q) => q.it.priority - p.it.priority || p.dist - q.dist);
    list.forEach((e, i) => {
      const { it, x, y } = e;
      if (i >= this.maxVisible) { this._hide(it); return; }
      it.el.style.opacity = 1;
      it.el.style.display = '';
      const ox = it.offset[0] * z, oy = it.offset[1] * z;
      const ew = it.el.offsetWidth, eh = it.el.offsetHeight;
      const lx = x + ox - ew / 2, ly = y + oy - eh;
      it.el.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px) scale(${z})`;
      if (it.line) {
        it.line.style.opacity = 1;
        it.dot.style.opacity = 1;
        it.line.setAttribute('x1', x + ox);
        it.line.setAttribute('y1', ly + eh);
        it.line.setAttribute('x2', x);
        it.line.setAttribute('y2', y);
        it.dot.setAttribute('cx', x);
        it.dot.setAttribute('cy', y);
      }
    });
  }
  _hide(it) {
    if (it.el.style.display !== 'none') it.el.style.display = 'none';
    if (it.line) { it.line.style.opacity = 0; it.dot.style.opacity = 0; }
  }
}
