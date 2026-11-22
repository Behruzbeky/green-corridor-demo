const maps = document.querySelectorAll('[data-map]');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const palette = { idle: '#68716c', ready: '#a86605', go: '#08783e', recover: '#387087' };

fetch('media/maps.json')
  .then((response) => {
    if (!response.ok) throw new Error(`Map data: HTTP ${response.status}`);
    return response.json();
  })
  .then((data) => maps.forEach((element) => drawMap(element, data[element.dataset.map])))
  .catch((error) => console.warn(error));

function drawMap(element, { w, h, route, junctions }) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('aria-hidden', 'true');
  element.append(svg);
  function add(parent, name, attributes) {
    const child = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attributes)) child.setAttribute(key, value);
    parent.append(child);
    return child;
  }

  const scale = w / 900;
  const path = route.map((point) => point.join(',')).join(' ');
  add(svg, 'polyline', { points: path, class: 'route-outline', 'stroke-width': 12 * scale });
  const line = add(svg, 'polyline', { points: path, class: 'route-line', 'stroke-width': 6 * scale });
  const distance = line.getTotalLength();
  let traveled = 0;
  const vertices = route.map(([x, y], index) => {
    if (index) traveled += Math.hypot(x - route[index - 1][0], y - route[index - 1][1]);
    return { x, y, traveled };
  });
  const lights = junctions.map(([x, y]) => {
    const point = vertices.reduce((best, p) =>
      Math.hypot(x - p.x, y - p.y) < Math.hypot(x - best.x, y - best.y) ? p : best);
    const marker = add(svg, 'g', { transform: `translate(${x} ${y}) scale(${scale})` });
    add(marker, 'rect', { x: -12, y: -12, width: 24, height: 24, rx: 3, fill: '#fff', stroke: '#939b95' });
    const pixel = add(marker, 'path', {
      d: 'M-2 -8h4v4h-4z M-2 -2h4v4h-4z M-2 4h4v4h-4z M-8 -5h4v4h-4z M-8 1h4v4h-4z M4 -5h4v4H4z M4 1h4v4H4z'
    });
    return { pixel, at: point.traveled };
  });
  const ambulance = add(svg, 'g', { class: 'ambulance' });
  add(ambulance, 'rect', { x: -21, y: -10, width: 42, height: 20, rx: 5, fill: '#fff', stroke: '#172c34' });
  add(ambulance, 'path', { d: 'M9 -9h5l3 4V5l-3 4H9z', fill: '#172c34' });
  add(ambulance, 'path', { d: 'M-11 -2h4v-4h4v4h4v4h-4v4h-4V2h-4z', fill: '#c52e34' });
  add(ambulance, 'rect', { x: 4, y: -7, width: 3, height: 14, rx: 1, fill: '#4486a6' });

  const phase = element.dataset.phase;
  const center = lights[0]?.at ?? distance / 2;
  const start = phase === 'request' ? center - 170 : phase === 'priority' ? center - 55 :
    phase === 'recovery' ? center + 125 : distance * 0.06;
  function render(position) {
    const p = line.getPointAtLength(position);
    const from = line.getPointAtLength(Math.max(0, position - 5));
    const to = line.getPointAtLength(Math.min(distance, position + 5));
    const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
    ambulance.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${angle}) scale(${scale})`);
    for (const { pixel, at } of lights) {
      const delta = (at - position) / (phase ? 450 : distance);
      const state = delta > 0.24 ? 'idle' : delta > 0.16 ? 'ready' : delta > 0 ? 'go' :
        delta > -0.32 ? 'recover' : 'idle';
      pixel.setAttribute('fill', palette[state]);
    }
  }

  render(Math.max(0, Math.min(start, distance)));
  if (!element.hasAttribute('data-animate')) return;
  let visible = false;
  let elapsed = 0;
  let previous = null;
  let frame;
  function tick(now) {
    if (previous !== null) elapsed += now - previous;
    previous = now;
    render(distance * ((start / distance + elapsed / 21000) % 1));
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame);
    previous = null;
    if (visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(tick);
  }
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(element);
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
}
