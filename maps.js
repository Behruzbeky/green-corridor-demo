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

  const stage = element.dataset.stage;
  const scale = w / 900;
  const points = stage ? route.filter(([x, y]) => x >= 120 && x <= 850 && y >= 0 && y <= h) : route;
  const path = points.map((point) => point.join(',')).join(' ');
  add(svg, 'polyline', { points: path, class: 'route-outline', 'stroke-width': 12 * scale });
  const line = add(svg, 'polyline', { points: path, class: 'route-line', 'stroke-width': 6 * scale });
  const distance = line.getTotalLength();
  let traveled = 0;
  const vertices = points.map(([x, y], index) => {
    if (index) traveled += Math.hypot(x - points[index - 1][0], y - points[index - 1][1]);
    return { x, y, traveled };
  });
  const lights = junctions.map(([x, y]) => {
    const point = vertices.reduce((best, p) =>
      Math.hypot(x - p.x, y - p.y) < Math.hypot(x - best.x, y - best.y) ? p : best);
    if (stage) return { at: point.traveled };
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

  const animate = element.hasAttribute('data-animate');
  const traffic = animate ? ['#c8ced3', '#8799a1', '#e3d7bc'].map((fill) => {
    const car = add(svg, 'g', { class: 'map-car' });
    add(car, 'rect', { x: -10, y: -5, width: 20, height: 10, rx: 3, fill, stroke: '#223a39' });
    add(car, 'path', { d: 'M3 -4h3v8H3z', fill: '#384f54' });
    return car;
  }) : [];
  svg.append(ambulance);
  const start = distance * 0.06;
  function placeVehicle(vehicle, at, size) {
    const p = line.getPointAtLength(at);
    const from = line.getPointAtLength(Math.max(0, at - 5));
    const to = line.getPointAtLength(Math.min(distance, at + 5));
    const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
    vehicle.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${angle}) scale(${scale * size})`);
  }
  function render(position, elapsed = 0) {
    placeVehicle(ambulance, position, 1);
    traffic.forEach((car, index) => {
      const fraction = (0.25 + index * 0.24 + elapsed / 29000) % 1;
      placeVehicle(car, distance * fraction, 1);
      const nearAmbulance = Math.abs(distance * fraction - position) < 40 * scale;
      car.setAttribute('opacity', nearAmbulance ? '0' : String(Math.min(1, fraction * 30, (1 - fraction) * 30)));
    });
    for (const { pixel, at } of lights) {
      const delta = (at - position) / distance;
      const state = delta > 0.24 ? 'idle' : delta > 0.16 ? 'ready' : delta > 0 ? 'go' :
        delta > -0.32 ? 'recover' : 'idle';
      pixel.setAttribute('fill', palette[state]);
    }
  }

  if (stage) {
    const [x, y] = junctions[0];
    const { at } = lights[0];
    const passing = stage === 'pass';
    const planning = stage === 'plan';
    let draw;
    if (planning) {
      const end = points[points.length - 1];
      const clip = add(add(svg, 'defs', {}), 'clipPath', { id: 'planned-route' });
      const reveal = add(clip, 'rect', { width: w, height: h });
      for (const routeStroke of svg.querySelectorAll('polyline')) {
        routeStroke.setAttribute('clip-path', 'url(#planned-route)');
      }
      const pin = add(svg, 'g', { transform: `translate(${end[0]} ${end[1]})` });
      add(pin, 'path', { d: 'M0 0C-10-12-22-22-22-36a22 22 0 0 1 44 0C22-22 10-12 0 0Z', fill: 'var(--map-route)', stroke: 'var(--map-outline)', 'stroke-width': 4 });
      add(pin, 'circle', { cx: 0, cy: -36, r: 7, fill: 'var(--map-outline)' });
      draw = (progress) => {
        reveal.setAttribute('width', points[0][0] + (w - points[0][0]) * progress);
        pin.setAttribute('opacity', Math.max(0, (progress - 0.8) * 5));
        placeVehicle(ambulance, 34, 1.85);
      };
    } else {
      const signals = [
        [x - 67, y - 56],
        [x + 58, y + 60]
      ].map(([sx, sy]) => {
        const box = add(svg, 'g', { transform: `translate(${sx} ${sy})` });
        add(box, 'rect', { x: -14, y: -28, width: 28, height: 56, rx: 6, fill: '#172c34', stroke: '#fff', 'stroke-width': 2 });
        const red = add(box, 'circle', { cy: -14, r: 8 });
        add(box, 'circle', { cy: 0, r: 6, fill: '#625748' });
        const green = add(box, 'circle', { cy: 14, r: 8 });
        return (open) => {
          red.setAttribute('fill', open ? '#533e41' : '#ff706e');
          green.setAttribute('fill', open ? '#52de93' : '#2b5645');
        };
      });
      const cross = passing ? null : add(svg, 'path', {
        d: `M${x + 14} ${y - 152}l-20 310m-12 -22l12 22 15-20`, class: 'route-line', 'stroke-width': 9
      });
      draw = (progress) => {
        const through = passing ? progress >= .24 : progress < .62;
        const across = !passing && progress >= .78;
        signals[0](through);
        signals[1](across);
        if (cross) cross.setAttribute('opacity', Math.max(0, (progress - .78) / .22));
        const travel = passing ? Math.max(0, (progress - .24) / .76) : Math.min(progress / .62, 1);
        placeVehicle(ambulance, passing ? at - 190 + travel * 205 : at + 15 + travel * 205, 1.85);
      };
    }
    svg.append(ambulance);
    draw(1);
    animateMapStage(element, draw);
    return;
  }
  render(start);
  if (!animate) return;
  let visible = false;
  let elapsed = 0;
  let previous = null;
  let frame;
  function tick(now) {
    if (previous !== null) elapsed += now - previous;
    previous = now;
    render(distance * ((start / distance + elapsed / 21000) % 1), elapsed);
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

function animateMapStage(element, draw) {
  if (motion.matches) return;
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting || entry.intersectionRatio < .35) return;
    observer.disconnect();
    if (motion.matches) return;
    const desktop = matchMedia('(min-width: 621px)').matches;
    const delay = desktop ? { plan: 0, pass: 350, return: 700 }[element.dataset.stage] : 0;
    const start = performance.now() + delay;
    const duration = 1700;
    draw(0);
    function frame(now) {
      const progress = motion.matches ? 1 : Math.min(1, Math.max(0, (now - start) / duration));
      draw(progress);
      element.style.setProperty('--map-progress', progress);
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, { threshold: .35 });
  observer.observe(element);
}
