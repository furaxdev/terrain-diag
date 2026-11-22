/* ============================================================
   Terrain Diag — application terrain pour diagnostiqueurs
   Vanilla JS. Données en localStorage, photos en IndexedDB.
   ============================================================ */
(function () {
  'use strict';

  /* ─────────────── catalogue ─────────────── */
  var DIAGS = [
    { k: 'dpe',      l: 'DPE' },
    { k: 'amiante',  l: 'Amiante' },
    { k: 'plomb',    l: 'Plomb' },
    { k: 'gaz',      l: 'Gaz' },
    { k: 'elec',     l: 'Électricité' },
    { k: 'termites', l: 'Termites' },
    { k: 'carrez',   l: 'Carrez' },
    { k: 'erp',      l: 'ERP' },
    { k: 'bruit',    l: 'Bruit' }
  ];
  var DIAG_LABEL = {};
  DIAGS.forEach(function (d) { DIAG_LABEL[d.k] = d.l; });

  var KEY = 'td.state.v1';
  var MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  var DAYS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

  /* ─────────────── état ─────────────── */
  var DEFAULT_TARIFS = { dpe: 90, amiante: 120, plomb: 110, gaz: 90, elec: 90, termites: 130, carrez: 40, erp: 80, bruit: 60 };

  function blankState() {
    return {
      cabinet: { name: '', phone: '', email: '' },
      tarifs: Object.assign({}, DEFAULT_TARIFS),
      visits: [],
      seq: 1
    };
  }

  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return blankState();
      var s = JSON.parse(raw);
      return Object.assign(blankState(), s, {
        cabinet: Object.assign({ name: '', phone: '', email: '' }, s.cabinet || {}),
        tarifs: Object.assign({}, DEFAULT_TARIFS, s.tarifs || {}),
        visits: Array.isArray(s.visits) ? s.visits : []
      });
    } catch (e) {
      console.warn('état illisible, réinitialisé', e);
      return blankState();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      toast('Stockage plein — fais une sauvegarde dans les réglages.');
      return false;
    }
  }

  /* ─────────────── utilitaires ─────────────── */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function eur(n) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: 'EUR', maximumFractionDigits: 0
    }).format(Number(n) || 0);
  }
  function num(n) { return Number(n) || 0; }
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function todayISO() { return iso(new Date()); }
  function parseISO(s) {
    var p = String(s || '').split('-').map(Number);
    if (p.length !== 3 || !p[0]) return new Date();
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function frDay(isoStr) {
    var d = parseISO(isoStr);
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }
  function frMonth(ym) {
    var p = String(ym).split('-').map(Number);
    return MONTHS[(p[1] || 1) - 1] + ' ' + p[0];
  }
  function addDays(isoStr, n) {
    var d = parseISO(isoStr);
    d.setDate(d.getDate() + n);
    return iso(d);
  }
  function daysBetween(a, b) {
    return Math.round((parseISO(b) - parseISO(a)) / 86400000);
  }
  function monthOf(isoStr) { return String(isoStr).slice(0, 7); }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ─────────────── photos (IndexedDB) ─────────────── */
  var DB = null;
  function db() {
    if (DB) return Promise.resolve(DB);
    return new Promise(function (res, rej) {
      var r = indexedDB.open('td-photos', 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos');
      };
      r.onsuccess = function () { DB = r.result; res(DB); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function putPhoto(key, blob) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction('photos', 'readwrite');
        tx.objectStore('photos').put(blob, key);
        tx.oncomplete = res;
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function getPhoto(key) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction('photos', 'readonly');
        var q = tx.objectStore('photos').get(key);
        q.onsuccess = function () { res(q.result || null); };
        q.onerror = function () { rej(q.error); };
      });
    });
  }
  function dropPhoto(key) {
    return db().then(function (d) {
      return new Promise(function (res) {
        var tx = d.transaction('photos', 'readwrite');
        tx.objectStore('photos').delete(key);
        tx.oncomplete = res;
      });
    });
  }
  function compressImage(file, maxSide, quality) {
    return new Promise(function (res, rej) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.width, h = img.height;
        var scale = Math.min(1, maxSide / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * scale);
        c.height = Math.round(h * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('compression')); }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('lecture image')); };
      img.src = url;
    });
  }

  /* ─────────────── navigation ─────────────── */
  var view = { tab: 'day', date: todayISO(), month: monthOf(todayISO()), visitId: null };

  var screens = { day: 's-day', visit: 's-visit', bill: 's-bill', set: 's-set' };
  var tabs = { day: 't-day', bill: 't-bill', set: 't-set' };

  function go(tab) {
    view.tab = tab;
    Object.keys(screens).forEach(function (k) {
      document.getElementById(screens[k]).classList.toggle('on', k === tab);
    });
    Object.keys(tabs).forEach(function (k) {
      var b = document.getElementById(tabs[k]);
      if (b) b.classList.toggle('on', k === tab);
    });
    document.getElementById('h-title').textContent =
      tab === 'day' ? 'Ma journée' : tab === 'bill' ? 'Facturation' : tab === 'set' ? 'Réglages' : 'Fiche de mission';
    render();
    document.getElementById(screens[tab]).scrollTop = 0;
  }

  /* ─────────────── accès données ─────────────── */
  function visitsOf(isoStr) {
    return state.visits
      .filter(function (v) { return v.date === isoStr; })
      .sort(function (a, b) { return (a.heure || '').localeCompare(b.heure || ''); });
  }
  function visitsOfMonth(ym) {
    return state.visits
      .filter(function (v) { return monthOf(v.date) === ym; })
      .sort(function (a, b) { return (a.date + (a.heure || '')).localeCompare(b.date + (b.heure || '')); });
  }
  function findVisit(id) {
    return state.visits.filter(function (v) { return v.id === id; })[0] || null;
  }
  function priceOf(diags) {
    return (diags || []).reduce(function (s, k) { return s + num(state.tarifs[k]); }, 0);
  }
  function billState(v) {
    /* 'retard' | 'a_facturer' | 'facture' | 'encaisse' | null */
    if (v.statut !== 'done') return null;
    if (v.facture === 'encaisse') return 'encaisse';
    if (v.facture === 'facture') return 'facture';
    var ref = v.doneAt || v.date;
    if (daysBetween(ref, todayISO()) > 30) return 'retard';
    return 'a_facturer';
  }

  /* ─────────────── rendu général ─────────────── */
  function render() {
    if (view.tab === 'day') renderDay();
    else if (view.tab === 'visit') renderVisit();
    else if (view.tab === 'bill') renderBill();
    else if (view.tab === 'set') renderSettings();
  }

  function sub(txt) { document.getElementById('h-sub').textContent = txt; }

  /* ─────────────── écran journée ─────────────── */
  function renderDay() {
    var list = visitsOf(view.date);
    var done = list.filter(function (v) { return v.statut === 'done'; }).length;
    var total = list.reduce(function (s, v) { return s + num(v.montant); }, 0);
    var toBill = list.filter(function (v) { return v.statut === 'done' && billState(v) !== 'facture' && billState(v) !== 'encaisse'; })
      .reduce(function (s, v) { return s + num(v.montant); }, 0);

    sub(frDay(view.date) + (view.date === todayISO() ? ' · aujourd\u2019hui' : ''));

    document.getElementById('dayKpis').innerHTML =
      '<div class="kpi"><i>Visites</i><b>' + list.length + '</b></div>' +
      '<div class="kpi ' + (done === list.length && list.length ? 'ok' : '') + '"><i>Terminées</i><b>' + done + '/' + list.length + '</b></div>' +
      '<div class="kpi"><i>Prévu</i><b>' + eur(total) + '</b></div>' +
      '<div class="kpi ' + (toBill ? 'amber' : '') + '"><i>À facturer</i><b>' + eur(toBill) + '</b></div>';

    /* navigation de date */
    var navLabel = view.date === todayISO() ? 'Aujourd\u2019hui'
      : view.date === addDays(todayISO(), 1) ? 'Demain'
      : view.date === addDays(todayISO(), -1) ? 'Hier'
      : frDay(view.date);
    var nav =
      '<div style="display:flex;align-items:center;gap:8px;margin:2px 0 12px">' +
      '<button class="btn ghost sm" data-nav="-1">‹</button>' +
      '<div style="flex:1;text-align:center;font-size:13px;color:var(--soft)">' + esc(navLabel) + '</div>' +
      '<button class="btn ghost sm" data-nav="1">›</button>' +
      '</div>';

    if (!list.length) {
      document.getElementById('dayList').innerHTML = nav +
        '<div class="empty"><b>Aucune visite ce jour</b>' +
        (state.visits.length ? 'Appuie sur + pour ajouter une mission.' :
          'Appuie sur + pour enregistrer ta première visite.<br>Tu peux aussi compléter ton cabinet dans les réglages.') +
        '</div>';
      return;
    }

    var html = nav;
    list.forEach(function (v) {
      var st = billState(v);
      var dotCls = v.statut === 'done' ? (st === 'retard' ? 'late' : 'done') : '';
      html +=
        '<div class="visit" data-open="' + v.id + '">' +
        '<div class="hour">' + esc(v.heure || '--:--') + '<span>' + (v.duree ? v.duree + ' min' : '') + '</span></div>' +
        '<div class="vinfo"><b>' + esc(v.client || 'Sans nom') + '</b>' +
        '<div class="addr">' + esc([v.addr, v.cp, v.ville].filter(Boolean).join(' · ') || 'Adresse à compléter') + '</div>' +
        '<div class="tags">' + (v.diags || []).slice(0, 4).map(function (k) {
          return '<span class="tag blue">' + esc(DIAG_LABEL[k] || k) + '</span>';
        }).join('') + ((v.diags || []).length > 4 ? '<span class="tag">+' + ((v.diags || []).length - 4) + '</span>' : '') + '</div>' +
        '<div class="money">' + eur(v.montant) + (v.photos && v.photos.length ? ' · ' + v.photos.length + ' photo' + (v.photos.length > 1 ? 's' : '') : '') + '</div>' +
        '</div><div class="dot ' + dotCls + '"></div></div>';
    });
    document.getElementById('dayList').innerHTML = html;
  }

  /* ─────────────── fiche de visite ─────────────── */
  var draft = null;

  function newVisit(defaults) {
    return Object.assign({
      id: uid(), date: view.date, heure: '', duree: 30,
      client: '', tel: '', addr: '', ville: '', cp: '',
      type: 'Maison', annee: '', surface: '',
      diags: [], montant: 0, notes: '', reserves: '',
      statut: 'todo', facture: 'none', numFacture: '',
      photos: [], signature: null, createdAt: Date.now()
    }, defaults || {});
  }

  function openVisit(id) {
    var v = findVisit(id);
    if (!v) { toast('Visite introuvable'); return; }
    draft = JSON.parse(JSON.stringify(v));
    view.visitId = id;
    go('visit');
  }

  function openNew() {
    draft = newVisit();
    view.visitId = null;
    go('visit');
  }

  function renderVisit() {
    if (!draft) { go('day'); return; }
    sub(draft.client || 'Nouvelle visite');

    var isNew = !findVisit(draft.id);
    var st = draft.statut === 'done';

    var html = '';

    if (!isNew) {
      html += '<button class="btn ghost sm" id="backToDay" style="margin-bottom:10px">‹ Retour à la journée</button>';
    }

    /* statut */
    html += '<div class="card" style="display:flex;align-items:center;gap:10px">' +
      '<div style="flex:1"><b style="font-size:14px">' + (st ? 'Visite terminée' : 'Visite à faire') + '</b>' +
      '<div class="hint" style="margin:2px 0 0">' + (st ? 'Facturation : ' + factureLabel(draft) : 'Coche quand tu as fini sur place') + '</div></div>' +
      '<button class="btn ' + (st ? 'ghost' : '') + ' sm" id="toggleDone">' + (st ? 'Rouvrir' : 'Terminer') + '</button>' +
      '</div>';

    /* client + adresse */
    html += '<div class="card"><h2>Client et bien</h2>' +
      field('client', 'Client', draft.client, 'Mme Benali, Agence Rivage…') +
      '<div class="row2">' +
      field('tel', 'Téléphone', draft.tel, '06…', 'tel') +
      field('heure', 'Heure', draft.heure, '08:15', 'time') +
      '</div>' +
      field('addr', 'Adresse', draft.addr, '12 rue des Lilas') +
      '<div class="row2">' +
      field('cp', 'Code postal', draft.cp, '69003') +
      field('ville', 'Ville', draft.ville, 'Lyon') +
      '</div>' +
      '<div class="row3">' +
      field('type', 'Type', draft.type, 'Maison') +
      field('annee', 'Année', draft.annee, '1978', 'number') +
      field('surface', 'Surface m²', draft.surface, '118', 'number') +
      '</div></div>';

    /* diagnostics */
    html += '<div class="card"><h2>Diagnostics</h2><div class="chips" id="diagChips">' +
      DIAGS.map(function (d) {
        var on = (draft.diags || []).indexOf(d.k) >= 0;
        return '<span class="chip' + (on ? ' on' : '') + '" data-diag="' + d.k + '">' + esc(d.l) +
          '<span style="opacity:.55;font-size:11px"> ' + num(state.tarifs[d.k]) + '€</span></span>';
      }).join('') +
      '</div>' +
      '<div class="field" style="margin:12px 0 0"><label>Montant de la mission (€)</label>' +
      '<input id="f-montant" type="number" inputmode="decimal" value="' + num(draft.montant) + '">' +
      '<div class="hint">Calculé automatiquement selon tes tarifs — tu peux le corriger.</div></div></div>';

    /* photos */
    html += '<div class="card"><h2>Photos <span class="count">(' + (draft.photos || []).length + ')</span></h2>' +
      '<div class="photos" id="photoGrid"></div>' +
      '<div class="hint">Les photos restent sur ton téléphone. Une photo de chaque élément constaté suffit.</div></div>';

    /* constats / réserves */
    html += '<div class="card"><h2>Constat et réserves</h2>' +
      '<div class="field"><label>Constat</label><textarea id="f-notes" placeholder="Traces d\u2019humidité en sous-sol, tableau électrique vétuste…">' + esc(draft.notes) + '</textarea></div>' +
      '<div class="field" style="margin-bottom:0"><label>Réserves / accès impossible</label><textarea id="f-reserves" placeholder="Grenier non accessible, occupant absent…">' + esc(draft.reserves) + '</textarea></div>' +
      '</div>';

    /* signature */
    html += '<div class="card"><h2>Signature du client</h2>' +
      '<div class="sigwrap"><canvas id="sigCanvas"></canvas>' +
      '<div class="sigempty' + (draft.signature ? ' hide' : '') + '" id="sigEmpty">Faire signer ici</div></div>' +
      '<div class="btn-row" style="margin-top:9px">' +
      '<button class="btn ghost sm" id="sigClear">Effacer</button>' +
      '</div></div>';

    /* actions */
    html += '<div class="card" style="border:0;background:none;padding:0">' +
      '<button class="btn block" id="saveVisit">Enregistrer</button>' +
      (isNew ? '' : '<div class="btn-row" style="margin-top:8px"><button class="btn danger sm" id="delVisit">Supprimer la visite</button></div>') +
      '</div>';

    document.getElementById('visitBody').innerHTML = html;

    /* événements */
    document.querySelectorAll('#visitBody [data-diag]').forEach(function (c) {
      c.addEventListener('click', function () {
        var k = c.getAttribute('data-diag');
        var i = draft.diags.indexOf(k);
        if (i >= 0) draft.diags.splice(i, 1); else draft.diags.push(k);
        c.classList.toggle('on', i < 0);
        syncMontant(true);
      });
    });

    var bt = document.getElementById('backToDay');
    if (bt) bt.addEventListener('click', function () { go('day'); });

    document.getElementById('toggleDone').addEventListener('click', function () {
      draft.statut = draft.statut === 'done' ? 'todo' : 'done';
      if (draft.statut === 'done') {
        draft.doneAt = todayISO();
        if (!draft.facture || draft.facture === 'none') draft.facture = 'a_facturer';
      }
      persistDraft();
      renderVisit();
    });

    document.getElementById('saveVisit').addEventListener('click', function () {
      if (persistDraft()) {
        toast('Visite enregistrée');
        go('day');
      }
    });

    var dv = document.getElementById('delVisit');
    if (dv) dv.addEventListener('click', function () {
      confirmModal('Supprimer cette visite ?', 'Les photos associées seront perdues.', function () {
        (draft.photos || []).forEach(function (p) { dropPhoto(p.id); });
        state.visits = state.visits.filter(function (v) { return v.id !== draft.id; });
        save();
        draft = null;
        go('day');
        toast('Visite supprimée');
      });
    });

    document.getElementById('sigClear').addEventListener('click', function () {
      draft.signature = null;
      initSignature();
      document.getElementById('sigEmpty').classList.remove('hide');
    });

    renderPhotos();
    initSignature();
    syncMontant(false);
  }

  function field(name, label, value, ph, type) {
    return '<div class="field"><label>' + esc(label) + '</label>' +
      '<input id="f-' + name + '" type="' + (type || 'text') + '" value="' + esc(value || '') + '" placeholder="' + esc(ph || '') + '"></div>';
  }

  function factureLabel(v) {
    var st = billState(v);
    if (st === 'encaisse') return 'encaissé';
    if (st === 'facture') return 'facturé' + (v.numFacture ? ' · n° ' + v.numFacture : '');
    if (st === 'retard') return 'en retard';
    if (st === 'a_facturer') return 'à facturer';
    return 'aucune';
  }

  function syncMontant(auto) {
    var inp = document.getElementById('f-montant');
    if (!inp) return;
    var computed = priceOf(draft.diags);
    if (auto || !num(draft.montant)) {
      inp.value = computed;
      draft.montant = computed;
    }
  }

  function persistDraft() {
    var g = function (id, key) {
      var el = document.getElementById(id);
      if (el) draft[key] = el.value;
    };
    g('f-client', 'client'); g('f-tel', 'tel'); g('f-heure', 'heure');
    g('f-addr', 'addr'); g('f-cp', 'cp'); g('f-ville', 'ville');
    g('f-type', 'type'); g('f-annee', 'annee'); g('f-surface', 'surface');
    g('f-notes', 'notes'); g('f-reserves', 'reserves');
    var m = document.getElementById('f-montant');
    if (m) draft.montant = num(m.value);
    /* si le montant est resté vide, on le déduit des tarifs */
    if (!num(draft.montant) && (draft.diags || []).length) draft.montant = priceOf(draft.diags);

    if (!draft.client && !draft.addr) {
      toast('Ajoute au moins un client ou une adresse');
      return false;
    }

    draft.updatedAt = Date.now();
    var i = state.visits.findIndex(function (v) { return v.id === draft.id; });
    /* numéro de mission attribué une seule fois, à la première sauvegarde */
    if (!draft.missionNum) {
      draft.missionNum = String(draft.date || todayISO()).slice(0, 4) + '-' + String(state.seq++).padStart(3, '0');
    }
    if (i >= 0) state.visits[i] = JSON.parse(JSON.stringify(draft));
    else state.visits.push(JSON.parse(JSON.stringify(draft)));
    if (!save()) return false;
    view.date = draft.date;
    return true;
  }

  /* ─────────────── photos ─────────────── */
  function renderPhotos() {
    var grid = document.getElementById('photoGrid');
    if (!grid) return;
    var html = '';
    (draft.photos || []).forEach(function (p) {
      html += '<button class="photo" data-photo="' + esc(p.id) + '"><img alt="" data-src="' + esc(p.id) + '"><span class="del" data-del="' + esc(p.id) + '">×</span></button>';
    });
    if ((draft.photos || []).length < 24) {
      html += '<button class="photo add" id="addPhoto">+</button>';
    }
    grid.innerHTML = html;

    grid.querySelectorAll('[data-src]').forEach(function (img) {
      var key = img.getAttribute('data-src');
      getPhoto(key).then(function (blob) {
        if (blob) img.src = URL.createObjectURL(blob);
      });
    });

    grid.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var key = b.getAttribute('data-del');
        draft.photos = (draft.photos || []).filter(function (p) { return p.id !== key; });
        dropPhoto(key);
        renderPhotos();
      });
    });

    grid.querySelectorAll('[data-photo]').forEach(function (ph) {
      ph.addEventListener('click', function () {
        var key = ph.getAttribute('data-photo');
        getPhoto(key).then(function (blob) {
          if (!blob) return;
          var url = URL.createObjectURL(blob);
          openModal('<h3>Photo</h3><img src="' + url + '" style="width:100%;border-radius:10px;display:block">' +
            '<div class="btn-row" style="margin-top:12px"><button class="btn ghost" id="ph-close">Fermer</button></div>');
          document.getElementById('ph-close').addEventListener('click', function () {
            closeModal();
            setTimeout(function () { URL.revokeObjectURL(url); }, 400);
          });
        });
      });
    });

    var add = document.getElementById('addPhoto');
    if (add) add.addEventListener('click', function () { document.getElementById('filePicker').click(); });
  }

  function handleFile(file) {
    if (!file || !draft) return;
    compressImage(file, 1280, 0.72).then(function (blob) {
      var key = 'p_' + uid();
      return putPhoto(key, blob).then(function () {
        draft.photos = draft.photos || [];
        draft.photos.push({ id: key, ts: Date.now() });
        renderPhotos();
        toast('Photo ajoutée');
      });
    }).catch(function (e) {
      toast('Photo impossible à lire');
      console.warn(e);
    });
  }

  /* ─────────────── signature ─────────────── */
  var sigCtx = null, sigDrawing = false, sigCanvasEl = null;

  function initSignature() {
    var cv = document.getElementById('sigCanvas');
    if (!cv) return;
    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth || 320, h = 130;
    cv.width = w * dpr; cv.height = h * dpr;
    sigCtx = cv.getContext('2d');
    sigCtx.scale(dpr, dpr);
    sigCtx.lineWidth = 2.1;
    sigCtx.lineCap = 'round';
    sigCtx.lineJoin = 'round';
    sigCtx.strokeStyle = '#131309';

    if (draft && draft.signature) {
      var img = new Image();
      img.onload = function () { sigCtx.drawImage(img, 0, 0, w, h); };
      img.src = draft.signature;
    }

    if (cv !== sigCanvasEl) {
      sigCanvasEl = cv;
      var pos = function (e) {
        var r = cv.getBoundingClientRect();
        var t = e.touches ? e.touches[0] : e;
        return { x: t.clientX - r.left, y: t.clientY - r.top };
      };
      var start = function (e) {
        e.preventDefault();
        sigDrawing = true;
        var p = pos(e);
        sigCtx.beginPath();
        sigCtx.moveTo(p.x, p.y);
        document.getElementById('sigEmpty').classList.add('hide');
      };
      var move = function (e) {
        if (!sigDrawing) return;
        e.preventDefault();
        var p = pos(e);
        sigCtx.lineTo(p.x, p.y);
        sigCtx.stroke();
      };
      var end = function () {
        if (!sigDrawing) return;
        sigDrawing = false;
        try { draft.signature = cv.toDataURL('image/png'); } catch (err) { /* ignore */ }
      };
      cv.addEventListener('mousedown', start);
      cv.addEventListener('mousemove', move);
      cv.addEventListener('mouseup', end);
      cv.addEventListener('mouseleave', end);
      cv.addEventListener('touchstart', start, { passive: false });
      cv.addEventListener('touchmove', move, { passive: false });
      cv.addEventListener('touchend', end);
    }
  }

  /* ─────────────── facturation ─────────────── */
  function renderBill() {
    sub(frMonth(view.month));
    var list = visitsOfMonth(view.month);
    var done = list.filter(function (v) { return v.statut === 'done'; });

    var facture = 0, encaisse = 0, reste = 0, retard = 0, retardN = 0;
    done.forEach(function (v) {
      var st = billState(v);
      if (st === 'encaisse') { encaisse += num(v.montant); facture += num(v.montant); }
      else if (st === 'facture') { facture += num(v.montant); }
      else if (st === 'retard') { reste += num(v.montant); retard += num(v.montant); retardN++; }
      else if (st === 'a_facturer') { reste += num(v.montant); }
    });

    var html =
      '<div style="display:flex;align-items:center;gap:8px;margin:0 0 12px">' +
      '<button class="btn ghost sm" data-mon="-1">‹</button>' +
      '<div style="flex:1;text-align:center;font-size:14px;font-weight:600">' + esc(frMonth(view.month)) + '</div>' +
      '<button class="btn ghost sm" data-mon="1">›</button>' +
      '</div>' +

      '<div class="kpis">' +
      '<div class="kpi"><i>Missions</i><b>' + done.length + '</b></div>' +
      '<div class="kpi ok"><i>Facturé</i><b>' + eur(facture) + '</b></div>' +
      '<div class="kpi"><i>Encaissé</i><b>' + eur(encaisse) + '</b></div>' +
      '<div class="kpi ' + (reste ? 'bad' : '') + '"><i>Reste à facturer</i><b>' + eur(reste) + '</b></div>' +
      '</div>';

    /* action globale */
    if (reste > 0) {
      html += '<div class="card" style="border-color:#f2c2c2;background:#fdf7f7">' +
        '<b style="font-size:14px">' + eur(reste) + ' à réclamer</b>' +
        '<div class="hint" style="margin:3px 0 10px">Des missions terminées dont la facture n\u2019est pas partie. C\u2019est ton argent, il ne se verse pas tout seul.</div>' +
        '<button class="btn sm" id="markAllBill">Marquer tout comme facturé</button>' +
        '</div>';
    }

    var groups = [
      { key: 'retard', title: 'En retard (' + retardN + ' · ' + eur(retard) + ')' },
      { key: 'a_facturer', title: 'À facturer' },
      { key: 'facture', title: 'Facturé, en attente d\u2019encaissement' },
      { key: 'encaisse', title: 'Encaissé' }
    ];

    groups.forEach(function (g) {
      var items = done.filter(function (v) { return billState(v) === g.key; });
      if (!items.length) return;
      html += '<div class="sect-title">' + esc(g.title) + '</div>';
      items.forEach(function (v) {
        html += '<div class="bill-row">' +
          '<div class="bmain"><b>' + esc(v.client || 'Sans nom') + '</b>' +
          '<span>' + esc(frDay(v.date)) + ' · n° ' + esc(v.missionNum || v.id.slice(-4)) + '</span></div>' +
          '<span class="amt">' + eur(v.montant) + '</span>' +
          '<span class="pill ' + pillClass(g.key) + '" data-bill="' + v.id + '">' + pillText(g.key) + '</span>' +
          '</div>';
      });
    });

    if (!done.length) {
      html += '<div class="empty"><b>Aucune mission terminée ce mois</b>Termine une visite dans la journée pour la voir apparaître ici.</div>';
    }

    html += '<div style="margin-top:18px"><button class="btn ghost block sm" id="csvMonth">Exporter ce mois en CSV (Excel)</button></div>';

    document.getElementById('billBody').innerHTML = html;

    document.querySelectorAll('[data-mon]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = view.month.split('-').map(Number);
        var d = new Date(p[0], p[1] - 1 + Number(b.getAttribute('data-mon')), 1);
        view.month = iso(d).slice(0, 7);
        renderBill();
      });
    });

    document.querySelectorAll('[data-bill]').forEach(function (p) {
      p.addEventListener('click', function () {
        var v = findVisit(p.getAttribute('data-bill'));
        if (!v) return;
        var st = billState(v);
        if (st === 'retard' || st === 'a_facturer') {
          askInvoiceNumber(v, function (numF) {
            v.facture = 'facture';
            v.numFacture = numF;
            v.dateFacture = todayISO();
            save(); renderBill(); toast('Facture enregistrée');
          });
        } else if (st === 'facture') {
          v.facture = 'encaisse';
          v.dateEncaissement = todayISO();
          save(); renderBill(); toast('Encaissement noté');
        }
      });
    });

    var allBtn = document.getElementById('markAllBill');
    if (allBtn) allBtn.addEventListener('click', function () {
      var n = 0;
      done.forEach(function (v) {
        var st = billState(v);
        if (st === 'a_facturer' || st === 'retard') { v.facture = 'facture'; v.dateFacture = todayISO(); n++; }
      });
      save(); renderBill(); toast(n + ' mission' + (n > 1 ? 's' : '') + ' marquée' + (n > 1 ? 's' : '') + ' facturée' + (n > 1 ? 's' : ''));
    });

    var csv = document.getElementById('csvMonth');
    if (csv) csv.addEventListener('click', function () { exportCSV(view.month); });
  }

  function pillClass(k) {
    return k === 'retard' ? 'r' : k === 'a_facturer' ? 'a' : k === 'facture' ? 'e' : 'f';
  }
  function pillText(k) {
    return k === 'retard' ? 'en retard ›' : k === 'a_facturer' ? 'facturer ›' : k === 'facture' ? 'encaissé ?' : 'encaissé';
  }

  function askInvoiceNumber(v, cb) {
    openModal(
      '<h3>Facture envoyée</h3>' +
      '<p style="color:var(--soft);font-size:13.5px;margin:0 0 12px">' + esc(v.client || 'Client') + ' · ' + eur(v.montant) + '</p>' +
      '<div class="field"><label>Numéro de facture</label><input id="m-num" value="' + esc(v.numFacture || '') + '" placeholder="2026-114"></div>' +
      '<div class="btn-row"><button class="btn ghost" id="m-cancel">Annuler</button><button class="btn" id="m-ok">Valider</button></div>'
    );
    document.getElementById('m-cancel').addEventListener('click', closeModal);
    document.getElementById('m-ok').addEventListener('click', function () {
      var n = document.getElementById('m-num').value.trim();
      closeModal();
      cb(n);
    });
  }

  function exportCSV(ym) {
    var list = visitsOfMonth(ym).filter(function (v) { return v.statut === 'done'; });
    if (!list.length) { toast('Rien à exporter ce mois'); return; }
    var head = ['Date', 'Heure', 'Client', 'Adresse', 'CP', 'Ville', 'Diagnostics', 'Montant', 'Statut', 'N° facture'];
    var rows = list.map(function (v) {
      var st = billState(v);
      var statut = st === 'encaisse' ? 'Encaissé' : st === 'facture' ? 'Facturé' : st === 'retard' ? 'En retard' : 'À facturer';
      return [
        frDay(v.date), v.heure || '', v.client || '',
        [v.addr, v.cp, v.ville].filter(Boolean).join(' '),
        v.cp || '', v.ville || '',
        (v.diags || []).map(function (k) { return DIAG_LABEL[k] || k; }).join(' + '),
        String(num(v.montant)).replace('.', ','),
        statut, v.numFacture || ''
      ];
    });
    var csv = '\ufeff' + [head].concat(rows).map(function (r) {
      return r.map(function (c) {
        var s = String(c == null ? '' : c);
        return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';');
    }).join('\r\n');

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    download(blob, 'facturation-' + ym + '.csv');
    toast('Export CSV prêt');
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
  }

  /* ─────────────── réglages ─────────────── */
  function renderSettings() {
    sub(state.cabinet.name || 'Ton cabinet');
    var html = '';

    html += '<div class="card"><h2>Cabinet</h2>' +
      '<div class="field"><label>Nom</label><input id="s-name" value="' + esc(state.cabinet.name) + '" placeholder="Diag Lyon Sud"></div>' +
      '<div class="row2">' +
      '<div class="field"><label>Téléphone</label><input id="s-phone" value="' + esc(state.cabinet.phone) + '" placeholder="06…"></div>' +
      '<div class="field" style="margin-bottom:0"><label>Email</label><input id="s-email" value="' + esc(state.cabinet.email) + '" placeholder="contact@…"></div>' +
      '</div></div>';

    html += '<div class="card"><h2>Tarifs par diagnostic</h2><div class="row3">';
    DIAGS.forEach(function (d) {
      html += '<div class="field" style="margin-bottom:9px"><label style="font-size:10px">' + esc(d.l) + '</label>' +
        '<input id="s-t-' + d.k + '" type="number" inputmode="decimal" value="' + num(state.tarifs[d.k]) + '"></div>';
    });
    html += '</div><div class="hint">Sert à calculer le montant d\u2019une mission. Tu peux toujours le modifier à la main.</div></div>';

    var all = state.visits.length;
    var photos = state.visits.reduce(function (s, v) { return s + (v.photos || []).length; }, 0);

    html += '<div class="card"><h2>Tes données</h2>' +
      '<div class="hint" style="margin:0 0 10px">' + all + ' visite' + (all > 1 ? 's' : '') + ' · ' + photos + ' photo' + (photos > 1 ? 's' : '') +
      '. Tout reste sur cet appareil : aucun serveur, aucun compte.</div>' +
      '<div class="btn-row"><button class="btn ghost sm" id="s-backup">Sauvegarde</button>' +
      '<button class="btn ghost sm" id="s-restore">Restaurer</button></div>' +
      '</div>';

    html += '<div class="card"><h2>Zones à risque</h2>' +
      '<button class="btn danger block sm" id="s-reset">Effacer toutes les données</button></div>';

    html += '<p class="hint" style="text-align:center;padding:8px 0 0">Terrain Diag · v1 — application de terrain, sans compte ni serveur.<br>' +
      'Les rapports réglementaires restent produits par ton logiciel actuel.</p>';

    document.getElementById('setBody').innerHTML = html;

    ['name', 'phone', 'email'].forEach(function (k) {
      var el = document.getElementById('s-' + k);
      el.addEventListener('change', function () { state.cabinet[k] = el.value; save(); sub(state.cabinet.name || 'Ton cabinet'); });
    });
    DIAGS.forEach(function (d) {
      var el = document.getElementById('s-t-' + d.k);
      el.addEventListener('change', function () { state.tarifs[d.k] = num(el.value); save(); });
    });

    document.getElementById('s-backup').addEventListener('click', backupJSON);
    document.getElementById('s-restore').addEventListener('click', function () { document.getElementById('jsonPicker').click(); });
    document.getElementById('s-reset').addEventListener('click', function () {
      confirmModal('Tout effacer ?', 'Les ' + all + ' visites et les photos seront supprimées définitivement.', function () {
        state.visits.forEach(function (v) { (v.photos || []).forEach(function (p) { dropPhoto(p.id); }); });
        state = blankState();
        save();
        go('day');
        toast('Données effacées');
      });
    });
  }

  function backupJSON() {
    var data = { app: 'terrain-diag', version: 1, exportedAt: new Date().toISOString(), state: state };
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'terrain-diag-sauvegarde.json');
    toast('Sauvegarde téléchargée');
  }

  function restoreJSON(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var d = JSON.parse(String(fr.result));
        var s = d.state || d;
        if (!s || !Array.isArray(s.visits)) throw new Error('format');
        state = Object.assign(blankState(), s, {
          cabinet: Object.assign({ name: '', phone: '', email: '' }, s.cabinet || {}),
          tarifs: Object.assign({}, DEFAULT_TARIFS, s.tarifs || {})
        });
        save();
        go('day');
        toast(state.visits.length + ' visites restaurées');
      } catch (e) {
        toast('Fichier de sauvegarde illisible');
      }
    };
    fr.readAsText(file);
  }

  /* ─────────────── modale / toast ─────────────── */
  function openModal(html) {
    var m = document.getElementById('modal');
    document.getElementById('modalSheet').innerHTML = html;
    m.classList.add('on');
  }
  function closeModal() { document.getElementById('modal').classList.remove('on'); }

  function confirmModal(title, text, onOk) {
    openModal('<h3>' + esc(title) + '</h3><p style="color:var(--soft);font-size:13.5px;margin:0 0 14px">' + esc(text) + '</p>' +
      '<div class="btn-row"><button class="btn ghost" id="c-no">Annuler</button><button class="btn danger" id="c-yes">Confirmer</button></div>');
    document.getElementById('c-no').addEventListener('click', closeModal);
    document.getElementById('c-yes').addEventListener('click', function () { closeModal(); onOk(); });
  }

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2300);
  }

  /* ─────────────── événements globaux ─────────────── */
  document.getElementById('t-day').addEventListener('click', function () { go('day'); });
  document.getElementById('t-bill').addEventListener('click', function () { go('bill'); });
  document.getElementById('t-set').addEventListener('click', function () { go('set'); });
  document.getElementById('fabAdd').addEventListener('click', openNew);
  document.getElementById('btnToday').addEventListener('click', function () {
    view.date = todayISO();
    if (view.tab === 'day') renderDay();
    toast('Aujourd\u2019hui');
  });

  document.getElementById('dayList').addEventListener('click', function (e) {
    var nav = e.target.closest('[data-nav]');
    if (nav) { view.date = addDays(view.date, Number(nav.getAttribute('data-nav'))); renderDay(); return; }
    var row = e.target.closest('[data-open]');
    if (row) openVisit(row.getAttribute('data-open'));
  });

  document.getElementById('filePicker').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
    e.target.value = '';
  });
  document.getElementById('jsonPicker').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) restoreJSON(f);
    e.target.value = '';
  });
  document.getElementById('modal').addEventListener('click', function (e) {
    if (e.target.id === 'modal') closeModal();
  });

  /* ─────────────── démarrage ─────────────── */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch(function () { /* hors ligne indisponible */ });
  }

  view.date = todayISO();
  view.month = monthOf(todayISO());
  go('day');

  /* API minimale pour les tests */
  window.__td = {
    state: function () { return state; },
    reload: function () { state = load(); render(); },
    addVisit: function (o) {
      var v = newVisit(o);
      if (!num(v.montant)) v.montant = priceOf(v.diags);
      if (!v.missionNum) v.missionNum = String(v.date).slice(0, 4) + '-' + String(state.seq++).padStart(3, '0');
      state.visits.push(v);
      save();
      render();
      return v.id;
    }
  };
})();
