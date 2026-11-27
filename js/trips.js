/*
 * Trips and approvals (trips.html).
 */
(function () {
  const { store, ui, actions } = RMS;
  const { esc } = ui;

  ui.header('trips');

  function swap(id, html) {
    const el = document.getElementById(id);
    if (el.dataset.html === html) return;
    el.innerHTML = html;
    el.dataset.html = html;
    ui.icons();
  }

  function render() {
    const state = store.get();
    const liveRecs = RMS.live(state);

    const pend = RMS.trips.pending(state);
    swap('approvals', pend.map((x) => `
      <div class="approval">
        <span class="pfp driver">${ui.initials(x.driver.name)}</span>
        <span class="grow" style="flex:1">
          <b>${esc(x.driver.name)} · ${esc(x.trip.vehicle)}</b>
          <small class="muted" style="display:block">${esc(x.trip.id)} · ${esc(x.phase.label)} at ${esc(x.site.name)} · checked in ${ui.ago(x.phase.arrivedAt)}</small>
        </span>
        <button class="btn btn-soft-red btn-sm" data-reject="${x.trip.id}" data-index="${x.index}"><i data-lucide="x"></i>Reject</button>
        <button class="btn btn-sm" data-approve="${x.trip.id}" data-index="${x.index}"><i data-lucide="check"></i>Approve</button>
      </div>`).join('') || '<div class="empty">Nothing waiting. When a driver checks in at a gate it shows up here and on the guard\'s phone.</div>');

    swap('trips', state.trips.map((t) => {
      const driver = state.people.find((p) => p.id === t.driverId);
      const st = RMS.trips.tripStatus(t);
      const dl = liveRecs.find((r) => r.id === t.driverId);
      return `
        <section class="card trip-card">
          <div class="card-head">
            <h2><i data-lucide="route"></i>${esc(t.id)}</h2>
            ${ui.badge(st.label, st.tone)}
          </div>
          <div class="meta">
            <span><i data-lucide="user"></i>${esc(driver?.name)}</span>
            <span><i data-lucide="truck"></i>${esc(t.vehicle)}</span>
            <span><i data-lucide="package"></i>${esc(t.cargo)}</span>
          </div>
          <div class="card-body">${ui.stepper(t, state, dl)}</div>
        </section>`;
    }).join(''));
  }

  document.getElementById('approvals').addEventListener('click', (e) => {
    const a = e.target.closest('[data-approve]');
    const r = e.target.closest('[data-reject]');
    if (a) actions.approve(a.dataset.approve, +a.dataset.index, `${ui.roleLabel()} (desktop)`);
    if (r) {
      const reason = prompt('Reason for rejecting (shown to the driver):', 'Documents incomplete');
      if (reason !== null) actions.reject(r.dataset.reject, +r.dataset.index, `${ui.roleLabel()} (desktop)`, reason);
    }
  });

  ui.icons();
  store.subscribe(render);
  setInterval(render, 1000);
})();
