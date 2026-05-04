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

  // Submit handler — отправляет лид на /api/lead, который пересылает в Telegram-группу.
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const consent = form.querySelector('#lf-consent');
    const errEl = form.querySelector('[data-form-error]');
    errEl?.classList.add('hidden');

    if (!data.name || !data.contact || !data.category || !consent?.checked) {
      form.querySelectorAll('[required]').forEach((el) => {
        const invalid = el.type === 'checkbox' ? !el.checked : !el.value;
        if (invalid) el.classList.add('!border-red-400');
        else el.classList.remove('!border-red-400');
      });
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn?.textContent;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Отправляем…';
    }

    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          contact: data.contact,
          category: data.category,
          revenue: data.revenue || '',
          consent: true,
          page: location.href,
          website: data.website || '',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        const code = json.error || `http_${res.status}`;
        throw new Error(code);
      }

      if (typeof window.ym === 'function') {
        window.ym(109036934, 'reachGoal', 'lead_submitted', {
          category: data.category,
          revenue: data.revenue || 'не указано',
        });
      }

      formWrap?.classList.add('hidden');
      successWrap?.classList.remove('hidden');
    } catch (err) {
      const msg = String(err.message || err);
      const human = msg === 'rate_limited'
        ? 'Слишком много заявок с этого IP. Попробуй через минуту.'
        : 'Не удалось отправить заявку. Попробуй ещё раз или напиши на vinogradtrade@gmail.com';
      if (errEl) {
        errEl.textContent = human;
        errEl.classList.remove('hidden');
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText || 'Отправить';
      }
    }
  });
})();
