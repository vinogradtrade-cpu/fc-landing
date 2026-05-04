// Reveal on scroll (IntersectionObserver)
(() => {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
  );
  els.forEach((el) => io.observe(el));
})();

// Modal
(() => {
  const modal = document.getElementById('modal');
  if (!modal) return;
  const formWrap = modal.querySelector('[data-modal-form]');
  const successWrap = modal.querySelector('[data-modal-success]');
  const form = document.getElementById('lead-form');
  let lastFocused = null;

  const open = () => {
    lastFocused = document.activeElement;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    formWrap?.classList.remove('hidden');
    successWrap?.classList.add('hidden');
    form?.reset();
    setTimeout(() => modal.querySelector('input,select,button')?.focus(), 50);
  };
  const close = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  };

  document.querySelectorAll('[data-open-modal]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      open();
    })
  );
  document.querySelectorAll('[data-close-modal]').forEach((btn) =>
    btn.addEventListener('click', close)
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });

  // Submit handler — на этапе скелета просто эмулируем успех.
  // На проде заменить на webhook (Telegram-бот / Formspree).
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const consent = form.querySelector('#lf-consent');
    if (!data.name || !data.contact || !data.category || !consent?.checked) {
      form.querySelectorAll('[required]').forEach((el) => {
        const invalid = el.type === 'checkbox' ? !el.checked : !el.value;
        if (invalid) el.classList.add('!border-red-400');
        else el.classList.remove('!border-red-400');
      });
      return;
    }
    // TODO: replace with real webhook
    // fetch('https://example.com/webhook', { method: 'POST', body: JSON.stringify(data) })
    console.log('Lead submitted (stub):', data);

    formWrap?.classList.add('hidden');
    successWrap?.classList.remove('hidden');
  });
})();
