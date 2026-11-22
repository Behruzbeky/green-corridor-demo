const groups = document.querySelectorAll(
  '.stats, .cards, .road, .map-steps, .steps, .rules, .shots, .shots > div, .feat, .facts, .truth, .deploy'
);
for (const group of groups) {
  group.classList.add('motion-group');
  for (const child of group.children) {
    if (child.matches('div:has(> .shot)')) continue;
    child.classList.add('motion-card');
  }
}

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const enter = new IntersectionObserver((entries, observer) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    observer.unobserve(entry.target);
    if (!reduceMotion.matches) entry.target.classList.add('scroll-enter');
  }
}, { threshold: 0.12 });

for (const element of document.querySelectorAll('main > section:not(.hero) .sec-head, .result-summary, .final .box, .chart, .formula, .video, .sources, .motion-card, #pilot .road')) {
  const bounds = element.getBoundingClientRect();
  if (bounds.top >= innerHeight || bounds.bottom <= 0) enter.observe(element);
}

const header = document.querySelector('header.top');
const page = document.scrollingElement;
let progressFrame = 0;
function updateProgress() {
  progressFrame = 0;
  const distance = page.scrollHeight - page.clientHeight;
  const progress = distance > 0 ? Math.min(1, Math.max(0, page.scrollTop / distance)) : 0;
  header.style.setProperty('--reading-progress', progress);
}
function scheduleProgress() {
  if (!progressFrame) progressFrame = requestAnimationFrame(updateProgress);
}
addEventListener('scroll', scheduleProgress, { passive: true });
addEventListener('resize', scheduleProgress);
updateProgress();
