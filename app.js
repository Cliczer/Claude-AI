/*
 * Atlas Pronostics — app.js (Version avec Moteur de Matching)
 * Vanilla JS pur, aucune dépendance.
 */

(function () {
  'use strict';

  /* ─── État ───────────────────────────────────────────────── */
  var tree       = null;
  var baseEtudes = null;
  var current    = null;
  var history    = [];
  var maxDepth   = 1;

  /* ─── Raccourci ──────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }

  /* ════════════════════════════════════════════════════════════
     1. CHARGEMENT SIMULTANÉ DES DEUX JSON
  ════════════════════════════════════════════════════════════ */

  function depth(node, d) {
    if (!node || node.type === 'resultat' || !node.choix) return d;
    var keys = Object.keys(node.choix);
    var max  = d;
    for (var i = 0; i < keys.length; i++) {
      var sub = depth(node.choix[keys[i]], d + 1);
      if (sub > max) max = sub;
    }
    return max;
  }

  function load() {
    var v = '?_v=' + Date.now();
    Promise.all([
      fetch('arbre_dynamique.json' + v).then(function(r) {
          if (!r.ok) throw new Error('Arbre HTTP ' + r.status); return r.json();
      }),
      fetch('base_etudes.json' + v).then(function(r) {
          if (!r.ok) { console.warn('Base études introuvable, suite sans études.'); return null; }
          return r.json();
      }).catch(function() { return null; })
    ])
    .then(function (results) {
      tree       = results[0];
      baseEtudes = results[1];
      maxDepth   = depth(tree, 0) || 1;
      var bs = $('btn-start'), bh = $('btn-start-hero');
      if (bs) { bs.disabled = false; bs.textContent = 'Commencer →'; }
      if (bh) { bh.disabled = false; bh.textContent = 'Commencer l\'évaluation →'; }
    })
    .catch(function (err) {
      console.error('[Atlas] Erreur fatale au chargement :', err);
      alert('Erreur lors du chargement des données. Vérifiez que arbre_dynamique.json est présent.\n' + err.message);
    });
  }

  /* ════════════════════════════════════════════════════════════
     2. NAVIGATION & VUES
  ════════════════════════════════════════════════════════════ */

  function show(id) {
    ['screen-home', 'screen-quiz', 'screen-results'].forEach(function (sid) {
      var el = $(sid);
      if (!el) return;
      el.classList.toggle('active', sid === id);
    });
    window.scrollTo(0, 0);
  }

  function demarrer() {
    if (!tree) {
      alert('Chargement en cours... Réessayez dans une seconde.');
      return;
    }
    history = [];
    current = tree;
    show('screen-quiz');
    render(current);
  }

  /* ════════════════════════════════════════════════════════════
     3. AFFICHER LE QUESTIONNAIRE ET TRACER LE PROFIL
  ════════════════════════════════════════════════════════════ */

  /* Traduit une valeur brute de l'arbre en texte lisible */
  function humaniserLabel(val) {
    var v = String(val || '').trim();
    if (v === '1.0')  v = '1';
    if (v === '0.0')  v = '0';
    if (v === '-1.0') v = '-1';
    if (v === '-1') return 'Non renseigné';
    if (v === '0')  return 'Non';
    if (v === '1')  return 'Oui';
    return v;
  }

  function render(node) {
    if (node.type === 'resultat') {
      renderResults(node.donnees);
      return;
    }

    var questionTitre = node.titre || '(Question)';
    $('quiz-question').textContent = questionTitre;

    var step  = history.length + 1;
    var total = maxDepth || step;
    var pct   = Math.round(Math.max(0, (step - 1) / total) * 100);

    $('quiz-step-label').textContent   = 'Étape ' + step + ' / ' + total;
    $('quiz-pct-label').textContent    = pct + ' %';
    $('quiz-progress-bar').style.width = pct + '%';
    $('btn-back').style.display = history.length > 0 ? 'inline-flex' : 'none';

    var container = $('quiz-choices');
    container.innerHTML = '';
    var keys = Object.keys(node.choix || {});

    if (keys.length === 0) {
      container.innerHTML = '<p class="muted">Aucune option disponible.</p>';
      return;
    }

    keys.forEach(function (label) {
      var next = node.choix[label];
      var btn = document.createElement('button');
      btn.className = 'choice-btn';

      var txt = document.createElement('span');
      txt.textContent = humaniserLabel(label);  // ← CORRECTION labels
      btn.appendChild(txt);

      var arr = document.createElement('span');
      arr.className = 'arrow';
      arr.textContent = '→';
      btn.appendChild(arr);

      btn.addEventListener('click', (function (l, n, q) {
        return function () {
          history.push({ node: current, label: l, question: q });
          current = n;
          render(current);
        };
      }(label, next, questionTitre)));

      container.appendChild(btn);
    });
  }

  function reculer() {
    if (history.length === 0) return;
    var prev = history.pop();
    current  = prev.node;
    render(current);
  }

  /* ════════════════════════════════════════════════════════════
     4. MOTEUR DE MATCHING DES ÉTUDES (100% Dynamique)
  ════════════════════════════════════════════════════════════ */

  function construireProfilPatient() {
    var profil = {};
    history.forEach(function(etape) {
      profil[etape.question] = String(etape.label).trim();
    });
    return profil;
  }

  function calculerScoreEtude(etude, profilPatient, mapping) {
    var score = 0;
    var criteresEvalues = 0;

    for (var questionArbre in profilPatient) {
      var reponsePatient = profilPatient[questionArbre].toLowerCase();

      var colonneEtude = null;
      for (var colEtude in mapping) {
        if (mapping[colEtude].includes(questionArbre)) {
          colonneEtude = colEtude;
          break;
        }
      }

      if (colonneEtude && etude.criteres.hasOwnProperty(colonneEtude)) {
        // Critère non renseigné côté patient → ignoré (ne pénalise pas)
        if (reponsePatient === "-1" || reponsePatient === "-1.0") continue;

        criteresEvalues++;
        var valeurEtude = String(etude.criteres[colonneEtude]).trim().toLowerCase();

        // "nc" = Non Communiqué → match automatique, comme "-1" et "nan"
        if (valeurEtude === "-1" || valeurEtude === "nan" || valeurEtude === "nc") {
          score++;
        } else {
          var qBase = questionArbre.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (reponsePatient === "1" || reponsePatient === "1.0" || reponsePatient === "oui" || reponsePatient === "positif") {
            if (valeurEtude.indexOf(qBase) !== -1 || valeurEtude === "positif" || valeurEtude === "1") {
              score++;
            }
          } else if (reponsePatient === "0" || reponsePatient === "0.0" || reponsePatient === "non" || reponsePatient === "négatif") {
            if (valeurEtude === "négatif" || valeurEtude === "non" || valeurEtude === "0") {
              score++;
            }
          }
        }
      }
    }
    return criteresEvalues > 0 ? Math.round((score / criteresEvalues) * 100) : 0;
  }

  /* ════════════════════════════════════════════════════════════
     5. AFFICHAGE DES RÉSULTATS ET DES ÉTUDES
  ════════════════════════════════════════════════════════════ */

  function cls(val) {
    var v = String(val || '').trim();
    if (v === '1' || v === '1.0') return 'rec';
    if (v === '0' || v === '0.0') return 'nrec';
    return 'ns';
  }

  function badge(val) {
    var v = String(val || '').trim();
    if (v === '1' || v === '1.0') return '✓ Recommandé';
    if (v === '0' || v === '0.0') return '✗ Non recommandé';
    return 'Non spécifié';
  }

  function renderResults(donnees) {
    $('quiz-progress-bar').style.width = '100%';
    $('quiz-pct-label').textContent    = '100 %';
    $('quiz-step-label').textContent   = 'Terminé';

    var pathEl = $('results-path');
    pathEl.innerHTML = '';
    history.forEach(function (h, i) {
      if (i > 0) {
        var sep = document.createElement('span');
        sep.className = 'path-sep'; sep.textContent = '›';
        pathEl.appendChild(sep);
      }
      var s = document.createElement('span');
      s.className = 'path-step'; s.textContent = humaniserLabel(h.label);  // ← CORRECTION parcours
      pathEl.appendChild(s);
    });

    var grid = $('results-grid');
    grid.innerHTML = '';
    var entries = Object.keys(donnees || {}).map(function (k) {
      return { name: k.replace(/^OUT_/i, ''), val: donnees[k], cls: cls(donnees[k]) };
    });

    var order = { rec: 0, nrec: 1, ns: 2 };
    entries.sort(function (a, b) { return order[a.cls] - order[b.cls]; });

    if (entries.length === 0) {
      grid.innerHTML = '<p class="muted">Aucune recommandation disponible.</p>';
    } else {
      entries.forEach(function (e) {
        var card = document.createElement('div');
        card.className = 'result-card ' + e.cls;
        var h4 = document.createElement('h4'); h4.textContent = e.name;
        var b = document.createElement('span');
        b.className = 'badge ' + e.cls; b.textContent = badge(e.val);
        card.appendChild(h4); card.appendChild(b);
        grid.appendChild(card);
      });
    }

    renderEtudes();
    show('screen-results');
  }

  function renderEtudes() {
    var container = $('etudes-container');
    if (!container || !baseEtudes || !baseEtudes.etudes) return;

    container.innerHTML = '';
    var profilPatient = construireProfilPatient();
    var etudesPertinentes = [];

    baseEtudes.etudes.forEach(function(etude) {
      var score = calculerScoreEtude(etude, profilPatient, baseEtudes.mapping);
      if (score >= 50) {
        etude.scoreMatch = score;
        etudesPertinentes.push(etude);
      }
    });

    etudesPertinentes.sort(function(a, b) { return b.scoreMatch - a.scoreMatch; });

    if (etudesPertinentes.length === 0) {
      container.innerHTML = '<p class="muted" style="text-align:center; padding:20px;">Aucune étude spécifique correspondant à ce profil n\'est disponible.</p>';
      return;
    }

    etudesPertinentes.forEach(function(etude) {
      var card = document.createElement('div');
      card.className = 'etude-card';

      var statsHtml = '';
      var clesStats = Object.keys(etude.outcomes || {});

      if (clesStats.length > 0) {
        clesStats.forEach(function(nomStat) {
          statsHtml += '<div style="margin-bottom: 4px;"><strong>' + nomStat + ' :</strong> ' + etude.outcomes[nomStat] + '</div>';
        });
      } else {
        statsHtml = '<div style="color: #999; font-style: italic;">Pas de données chiffrées standardisées pour cette étude.</div>';
      }

      card.innerHTML = `
        <div class="etude-header">
            <span class="etude-score">${etude.scoreMatch}% Match</span>
            <span class="etude-preuve">Preuve: Niveau ${etude.niveau_preuve}</span>
        </div>
        <h4 class="etude-title">${etude.objectif !== 'NC' ? etude.objectif : 'Étude clinique'}</h4>
        <div class="etude-stats">
            ${statsHtml}
        </div>
        <a href="${etude.reference}" target="_blank" class="etude-link">Voir l'étude (DOI) ↗</a>
      `;
      container.appendChild(card);
    });
  }

  /* ════════════════════════════════════════════════════════════
     6. RECOMMENCER
  ════════════════════════════════════════════════════════════ */
  function recommencer() {
    history = [];
    current = null;
    $('quiz-choices').innerHTML  = '';
    $('results-grid').innerHTML  = '';
    $('results-path').innerHTML  = '';
    var ec = $('etudes-container'); if(ec) ec.innerHTML = '';
    show('screen-home');
  }

  window.demarrer    = demarrer;
  window.reculer     = reculer;
  window.recommencer = recommencer;
  window.accueil     = recommencer;

  load();
}());
