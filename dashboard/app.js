// Token Radar's dashboard (model radar-2). It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board with search and filters, a per-protocol detail drawer with
// the full implied-value breakdown and the protocol's farm plan, a live-token view set aside from
// the ranking, and the methodology. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var M = DATA.model;
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, wlOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + Number(n).toFixed(n >= 1 ? 2 : 3); }
  // The model in one function: the page recomputes a row from the snapshot figures and the category
  // multiple the board carries, and checks the number board.json carries, so the page's code and the
  // board's data are visibly the same arithmetic.
  function partsOf(row) {
    var growth = Math.min(M.growth_cap, Math.max(M.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * M.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? M.unknown_age_days : row.age_days;
    var maturity = M.maturity_floor + (Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
    var extra = Math.min(Math.max((row.chains ? row.chains.length : 1) - 1, 0), M.breadth_max_chains);
    var breadth = 1 + extra * M.breadth_per_chain;
    var base = row.tvl_usd * row.category_multiple;
    return { base: base, growthMult: growthMult, maturity: maturity, breadth: breadth, implied: Math.max(1, Math.round(base * growthMult * maturity * breadth)) };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json (lib/model.ts farmSteps):
  // the category family decides the core action, the depth action and the weekly cadence; chains,
  // TVL and age decide the rest. No name is special-cased. Keep the two in step.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function secondChainOf(p) { return p.chains && p.chains.length > 1 ? p.chains[1] : null; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function familyOf(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('bridge') >= 0) return 'bridge';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('credit') >= 0) return 'lending';
    if (c.indexOf('dex') >= 0 || c.indexOf('swap') >= 0) return 'dex';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'staking';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('options') >= 0 || c.indexOf('interest rate') >= 0) return 'derivatives';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('vault') >= 0 || c.indexOf('liquidity manager') >= 0 || c.indexOf('index') >= 0) return 'vault';
    if (c.indexOf('rwa') >= 0) return 'rwa';
    if (c.indexOf('stable') >= 0 || c.indexOf('basis') >= 0) return 'stable';
    if (c.indexOf('prediction') >= 0) return 'prediction';
    if (c.indexOf('insurance') >= 0) return 'insurance';
    if (c.indexOf('chain') >= 0) return 'chain';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'payments';
    return 'other';
  }
  function actionFor(p, capital, chain) {
    var name = p.name;
    switch (familyOf(p)) {
      case 'lending': return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
      case 'dex': return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
      case 'bridge': return 'Bridge $' + capital + ' of USDC from ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
      case 'staking': return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token in the same wallet.';
      case 'derivatives': return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged trade.';
      case 'vault': return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares in the wallet.';
      case 'rwa': return 'Mint $' + capital + ' of ' + name + "'s yield asset on " + chain + ' through its own app and hold it.';
      case 'stable': return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
      case 'prediction': return 'Fund $' + capital + ' and place one market position on ' + name + '.';
      case 'insurance': return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy to expiry.';
      case 'chain': return 'Move $' + capital + ' onto ' + name + ' and make real transactions in two of its native apps.';
      case 'payments': return 'Load $' + capital + ' onto ' + name + ' and make one real payment or transfer with it.';
      default: return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
    }
  }
  function depthFor(p, capital, chain) {
    var name = p.name;
    var second = secondChainOf(p);
    switch (familyOf(p)) {
      case 'lending': return 'Borrow about 30% against the supply once, hold it a few days, then repay in full: a borrow and a repay are the two actions lending points systems weigh most.';
      case 'dex': return 'Swap about $' + Math.max(25, capital) + ' through ' + name + "'s main pair as well as providing liquidity: volume and liquidity are counted separately.";
      case 'bridge': return second !== null
        ? 'Bridge a smaller amount onward to ' + second + ", the protocol's second chain, so the wallet has routed volume on more than one path."
        : 'Make one return bridge a week later, so the wallet shows a round trip rather than a single crossing.';
      case 'staking': return 'Claim rewards once and restake them, so the wallet shows a claim and a second stake, not one passive deposit.';
      case 'derivatives': return 'Trade small, regular volume: aim for about $' + (capital * 10) + ' of cumulative volume across the hold, in trades you can hedge, never one large punt.';
      case 'vault': return 'Split a second, smaller deposit into a different ' + name + ' vault or strategy on ' + chain + ', so the wallet holds two distinct positions.';
      case 'rwa': return "Read the asset's attestation or reserve page inside " + name + "'s app and make one small second mint on a later date.";
      case 'stable': return "Use the stable asset once inside " + name + "'s own app (a swap, a payment or a second deposit), not only as a balance.";
      case 'prediction': return 'Place positions in two different markets on ' + name + ', so the wallet is a participant and not a single bet.';
      case 'insurance': return 'Quote a second cover on ' + name + ' for a different asset, and keep whichever policy is cheaper to hold.';
      case 'chain': return 'Pay gas on ' + name + ' on at least three separate days, so the wallet has a transaction history and not a single burst.';
      case 'payments': return 'Make a second payment of a different size, so the wallet shows repeated use rather than one transfer.';
      default: return 'Make one second deposit on a different day, so the wallet shows repeat use of ' + name + ' and not a single visit.';
    }
  }
  function weeklyFor(p) {
    switch (familyOf(p)) {
      case 'lending': return "Check the position's health factor once a week and top up or repay a little if it drifts: an active, managed supply is what lending programs snapshot.";
      case 'dex': return 'Add or remove a small slice of liquidity once a week and make one swap, so every weekly snapshot catches the wallet mid-use.';
      case 'bridge': return 'Bridge a small amount once a week, alternating direction, so each week\'s snapshot catches fresh routed volume.';
      case 'staking': return 'Restake or claim once a week, whichever the protocol offers, so the wallet\'s stake is never idle for a whole snapshot window.';
      case 'derivatives': return 'Open and close one small hedged trade a week, so the wallet\'s volume grows steadily instead of in one day.';
      case 'vault': return "Check the vault's share price and your shares once a week, and top up by a small amount in at least two of the weeks.";
      case 'prediction': return 'Place one small position a week in a live market, so the wallet appears in every weekly snapshot of participants.';
      case 'chain': return 'Make two or three real transactions a week in ' + p.name + "'s apps, so the wallet's activity spans the whole hold.";
      default: return 'Make one qualifying action each week, such as a deposit, a swap or a claim, so the activity is spread across snapshots.';
    }
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: depthFor(p, capital, chain), cost: 'about $2 of gas, plus the capital already in the position', time: '10 minutes' },
      { text: weeklyFor(p), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Open " + p.name + "'s own points, rewards or governance page from inside its app: take part once if it runs one (a vote, a quest or a claim check), and never pay a third party to claim for you.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('min')) state.minTvl = Number(params.get('min')) || 0;
    if (params.get('wl')) state.wlOnly = params.get('wl') === '1';
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl > 0) params.set('min', String(state.minTvl));
    if (state.wlOnly) params.set('wl', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wlOnly && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'mult') { av = a.category_multiple; bv = b.category_multiple; }
      else if (key === 'chains') { av = (a.chains || []).length; bv = (b.chains || []).length; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'TOKEN RADAR' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: 'Model ' + DATA.model_version }),
        el('span', { class: 'pill', text: 'offline build' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Pre-token protocols, ranked by what a launch could be worth' }),
        el('p', { text: 'Every protocol on the board records no token yet. Each is valued the way the market already values its launched peers: TVL times the market-cap-to-TVL ratio of comparable token-bearing protocols in the same category, adjusted for momentum, maturity and chain breadth. The ' + DATA.watchlist_size + '-protocol watchlist (TVL at or above ' + fmtUsd(DATA.floor_usd) + ', no token) is the floor, never the ceiling: the early radar adds ' + DATA.early_size + ' more below it. Implied value is a scenario, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Board rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Comparables used' }), el('b', { text: String(DATA.global_ratio.comparables) })),
        el('div', { class: 'fact' }, el('span', { text: 'Global median mcap / TVL' }), el('b', { text: fmtMult(DATA.global_ratio.median_ratio) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  var TVL_STEPS = [[0, 'Any TVL'], [1e7, '$10M+'], [5e7, '$50M+'], [1e8, '$100M+'], [5e8, '$500M+'], [1e9, '$1B+']];
  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var minSelect = el('select', { id: 'mintvl', 'aria-label': 'Minimum TVL' },
      TVL_STEPS.map(function (s) { return el('option', { value: String(s[0]), text: s[1], selected: state.minTvl === s[0] ? 'selected' : null }); })
    );
    minSelect.addEventListener('change', function () { state.minTvl = Number(minSelect.value) || 0; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'wlonly', checked: state.wlOnly ? 'checked' : null });
    wl.addEventListener('change', function () { state.wlOnly = wl.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'mintvl', text: 'Min TVL' }), minSelect),
      el('label', { class: 'check' }, wl, el('span', { text: 'Watchlist only' })),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or loosen a filter to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.wlOnly = false; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.category_multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: r.watchlist ? 'badge wl' : 'badge early', text: r.watchlist ? 'watchlist' : 'early' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its valuation breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('mult', 'Cat. x'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Set' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', { class: 'static' },
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'badge live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Live token: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking; the full set of them is the comparables evidence behind the model.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function ratioTable() {
    var tbody = el('tbody');
    DATA.ratios.filter(function (r) { return r.comparables >= 2; }).forEach(function (r) {
      tbody.appendChild(el('tr', { class: 'static' },
        el('td', { text: r.category }),
        el('td', { class: 'num', text: String(r.comparables) }),
        el('td', { class: 'num', text: fmtMult(r.median_ratio) }),
        el('td', { class: 'num', text: fmtMult(r.ratio) })
      ));
    });
    tbody.appendChild(el('tr', { class: 'static total' },
      el('td', { text: 'All categories (fallback)' }),
      el('td', { class: 'num', text: String(DATA.global_ratio.comparables) }),
      el('td', { class: 'num', text: fmtMult(DATA.global_ratio.median_ratio) }),
      el('td', { class: 'num', text: fmtMult(DATA.global_ratio.ratio) })
    ));
    return el('div', { class: 'table-wrap' },
      el('table', { class: 'ratios' },
        el('caption', { class: 'sub', text: 'Comparable evidence from the snapshot itself: token-bearing protocols with a recorded market cap. Categories with a single comparable are shrunk hardest and are not listed individually.' }),
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Comparables' }), el('th', { scope: 'col', text: 'Median mcap/TVL' }), el('th', { scope: 'col', text: 'Ratio used' }))),
        tbody
      )
    );
  }

  function modelPanel() {
    return el('section', { class: 'panel model' },
      el('h2', { text: 'Methodology: how implied value is computed' }),
      el('p', { text: 'One function scores every row, from snapshot fields only. No protocol name is special-cased and no row is hand-picked. The evidence is the market itself: the ' + DATA.global_ratio.comparables + ' token-bearing protocols in the same snapshot that carry a market cap. For each, the ratio mcap / TVL is winsorised to [' + M.ratio_winsor_lo + ', ' + M.ratio_winsor_hi + '] so a single absurd print cannot move a median. A category\'s multiple is its comparables\' median, shrunk toward the global median by sample size: (n x median + ' + M.shrink_k + ' x global) / (n + ' + M.shrink_k + '), clamped to [' + M.ratio_floor + ', ' + M.ratio_cap + ']. Thin categories are pulled hardest to the global figure; a category with no comparables uses it directly.' }),
      el('div', { class: 'formula' },
        'implied = round( TVL x category_multiple x (1 + clamp(7d change, ' + M.growth_floor + ', ' + M.growth_cap + ') / 100 x ' + M.growth_weight + ') x (' + M.maturity_floor + ' + min(age_days, ' + M.maturity_days + ') / ' + M.maturity_days + ' x ' + M.maturity_range + ') x (1 + min(chains - 1, ' + M.breadth_max_chains + ') x ' + M.breadth_per_chain + ') )'
      ),
      ratioTable(),
      el('h3', { text: 'Limits, stated plainly' }),
      el('ul', { class: 'limits' },
        el('li', { text: 'A comparable is a survivor: it launched and kept a market cap. Protocols that never launch, or launch and fail, are not in the evidence, so every implied value is optimistic by construction.' }),
        el('li', { text: 'TVL is not revenue, users or supply. The snapshot carries no token supply, float or vesting, so this is a market-cap scenario at today\'s TVL, not a launch price and not FDV at a future supply.' }),
        el('li', { text: 'Ratios are noisy where comparables are few: the detail view shows each row\'s comparable count, and shrinkage only softens the problem, it does not remove it.' }),
        el('li', { text: 'Momentum is one week of TVL change and maturity is listing age; both are proxies. A farm plan is a way to be a real user early, not a guarantee of an allocation: most protocols on this board may never issue a token.' })
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });

  function statRow(label, value) {
    return el('div', null, el('span', { text: label }), el('b', { class: 'num', text: value }));
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var parts = partsOf(row);
    var ratioInfo = DATA.ratios.filter(function (r) { return r.category === (row.category || ''); })[0];
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + (row.watchlist ? 'watchlist' : 'early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Snapshot figures' }),
      el('div', { class: 'equation' },
        statRow('TVL', fmtUsd(row.tvl_usd)),
        statRow('Seven-day TVL change', fmtPct(row.change_7d)),
        statRow('Age since first listing', fmtAge(row.age_days) + (row.listed_at ? ' (listed ' + row.listed_at + ')' : '')),
        statRow('Chains', String((row.chains || []).length) + ((row.chains || []).length ? ': ' + row.chains.join(', ') : '')),
        statRow('Token', 'none on record')
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied-value breakdown' }),
      el('div', { class: 'equation' },
        statRow('Category multiple (' + (row.category || 'uncategorised') + ')', fmtMult(row.category_multiple)),
        statRow('Comparables behind it', row.comparables > 0 ? String(row.comparables) + ' token-bearing protocols' + (ratioInfo ? ', median ' + fmtMult(ratioInfo.median_ratio) : '') : 'none in category: global fallback ' + fmtMult(DATA.global_ratio.ratio) + ' (global median ' + fmtMult(DATA.global_ratio.median_ratio) + ', n=' + DATA.global_ratio.comparables + ')'),
        statRow('Base value (TVL x multiple)', fmtUsd(Math.round(parts.base))),
        statRow('Growth multiplier (7d momentum)', 'x' + parts.growthMult.toFixed(3)),
        statRow('Maturity multiplier (age)', 'x' + parts.maturity.toFixed(3)),
        statRow('Breadth multiplier (chains)', 'x' + parts.breadth.toFixed(3)),
        statRow('Implied launch market cap', fmtUsd(row.implied_value_usd))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(parts.implied) + (parts.implied === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' A scenario from today\'s TVL and peer ratios, not a price prediction.' })
    ));
    var steps = farmSteps(row);
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();

