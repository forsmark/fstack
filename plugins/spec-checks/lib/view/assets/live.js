// Reloads the page when a spec or a coverage map changes, and after the viewer
// comes back from a stop, at the same scroll position. Filters the index as the
// reader types.
(() => {
  const key = `spec-view-scroll:${location.pathname}`;
  try {
    const saved = sessionStorage.getItem(key);
    if (saved !== null) {
      sessionStorage.removeItem(key);
      window.scrollTo(0, Number(saved));
    }
  } catch {
    // Without session storage, a reload starts at the top.
  }

  const status = document.getElementById('live');
  const show = (state, text) => {
    if (!status) return;
    status.dataset.state = state;
    status.textContent = text;
  };
  const reload = () => {
    try {
      sessionStorage.setItem(key, String(window.scrollY));
    } catch {
      // The reload still happens.
    }
    location.reload();
  };
  if ('EventSource' in window) {
    const source = new EventSource('/events');
    // The files may have changed while the viewer was stopped, and no change event tells of that.
    let lost = false;
    source.addEventListener('open', () => (lost ? reload() : show('live', 'Live')));
    source.addEventListener('error', () => {
      lost = true;
      show('off', 'Reconnecting');
    });
    source.addEventListener('change', reload);
  } else show('off', 'No live reload');

  const filter = document.getElementById('filter');
  if (filter) {
    filter.addEventListener('input', () => {
      const words = filter.value.toLowerCase().split(/\s+/).filter(Boolean);
      for (const item of document.querySelectorAll('[data-text]')) {
        item.hidden = !words.every((word) => item.dataset.text.includes(word));
      }
    });
  }
})();
