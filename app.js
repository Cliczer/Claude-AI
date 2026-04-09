/*
 * Atlas Pronostics — app.js (Version Complète avec Moteur Avancé)
 */

(function () {
  'use strict';

  var tree       = null;
  var baseEtudes = null;
  window.baseEtudes = null; // Permet l'accès depuis la console
  var current    = null;
  var history    = [];
  var maxDepth   = 1;

  function $(id) { return document.getElementById(id); }

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
          if (!r.ok) { console.warn('Base études introuvable.'); return null; }
          return r.json();
      }).catch(function() { return null; })
    ])
    .then(function (results) {
      tree       = results[0];
      baseEtudes = results[1];
      window.baseEtudes = results[1];
      maxDepth   = depth(tree, 0) || 1;
      var bs = $('btn-start'), bh = $('btn-start-hero');
      if (bs) { bs.disabled = false; bs.textContent = 'Commencer →'; }
      if (bh) { bh.disabled = false; bh.textContent = 'Commencer l\'évaluation →'; }
    })
    .catch(function (err) {
      console.error('[Atlas] Erreur fatale:', err);
      alert('Erreur lors du chargement des données.\n' + err.message);
    });
  }

  function show(id) {
    ['screen-home', 'screen-quiz', 'screen-results'].forEach(function (sid) {
      var el = $(sid);
      if (el) el.classList.toggle('active', sid === id);
    });
    window.scrollTo(0, 0);
  }

  function demarrer() {
    if (!tree) return alert('Chargement en cours...');
    history = [];
    current = tree;
    show('screen-quiz');
    render(current);
  }

  /* ─── FORMATAGE TEXTE (Arbre) ─── */
  function humaniserLabel(val) {
    var v = String(val || '').trim();
    if (v === '1.0' || v === '1') return 'Oui / Positif';
    if (v === '0.0' || v === '0') return 'Non / Négatif';
    if (v === '-1.0' || v === '-1') return 'Non renseigné';
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
      txt.textContent = humaniserLabel(label); 
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

  /* ─── CALCULETTE NUMÉRIQUE ─── */
  function matchNumerique(valeurPatient, critereEtude) {
    if (!critereEtude || critereEtude === "-1" || critereEtude === "NC" || critereEtude === "nan") return true;
    var val = parseFloat(valeurPatient);
    if (isNaN(val)) return false;
    
    var crit = String(critereEtude).trim();
    
    // Intervalles (ex: "40-75")
    if (crit.indexOf('-') > 0 && !crit.startsWith('-')) {
      var parts = crit.split('-');
      if (parts.length === 2) return (val >= parseFloat(parts[0]) && val <= parseFloat(parts[1]));
    }
    // Symboles
    if (crit.startsWith('<=')) return val <= parseFloat(crit.substring(2));
    if (crit.startsWith('>=')) return val >= parseFloat(crit.substring(2));
    if (crit.startsWith('<'))  return val < parseFloat(crit.substring(1));
    if (crit.startsWith('>'))  return val > parseFloat(crit.substring(1));
    
    // Valeur exacte
    if (val === parseFloat(crit)) return true;
    
    return false;
  }

  /* ─── MOTEUR DE MATCHING AVANCÉ ─── */
  function construireProfilPatient() {
    var profil = {};
    history.forEach(function(etape) {
      profil[etape.question] = String(etape.label).trim();
    });
    return profil;
  }

  function calculerScoreEtude(etude, profilPatient, mapping, traitementsRecommandes) {
    // 1. FILTRE DU TRAITEMENT (L'étude teste-t-elle ce qu'on recommande ?)
    var traitementsEtude = etude.traitements_evalues || [];
    var matchTraitement = false;
    
    if (traitementsEtude.length === 0 || traitementsRecommandes.length === 0) {
        matchTraitement = true; // Tolérance si données absentes
    } else {
        for (var i = 0; i < traitementsRecommandes.length; i++) {
            if (traitementsEtude.includes(traitementsRecommandes[i])) {
                matchTraitement = true;
                break;
            }
        }
    }
    
    if (!matchTraitement) return 0; // Si le traitement ne correspond pas, score 0 direct.

    // 2. FILTRE DU PROFIL CLINIQUE
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
        if (reponsePatient === "-1" || reponsePatient === "-1.0") continue;

        criteresEvalues++;
        var valeurEtude = String(etude.criteres[colonneEtude]).trim().toLowerCase();

        if (valeurEtude === "-1" || valeurEtude === "nan" || valeurEtude === "nc") {
          score++;
        } 
        else if (colonneEtude === "Age" || colonneEtude === "Ki67 (%)" || colonneEtude === "Marges (mm)") {
          if (matchNumerique(reponsePatient, valeurEtude)) score++;
        }
        else {
          var qBase = questionArbre.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (reponsePatient === "1" || reponsePatient === "1.0" || reponsePatient === "oui" || reponsePatient === "positif") {
            if (valeurEtude.indexOf(qBase) !== -1 || valeurEtude === "positif" || valeurEtude === "1") score++;
          } else if (reponsePatient === "0" || reponsePatient === "0.0" || reponsePatient === "non" || reponsePatient === "négatif") {
            if (valeurEtude === "négatif" || valeurEtude === "non" || valeurEtude === "0") score++;
          } else if (valeurEtude.indexOf(reponsePatient) !== -1 || valeurEtude.indexOf(reponsePatient.replace('.0', '')) !== -1) {
            score++;
          }
        }
      }
    }
    return criteresEvalues > 0 ? Math.round((score / criteresEvalues) * 100) : 0;
  }

  /* ─── AFFICHAGE RÉSULTATS (Avec gestion du 0.5) ─── */
  function cls(val) {
    var v = String(val || '').trim();
    if (v === '1' || v === '1.0') return 'rec';
    if (v === '0' || v === '0.0') return 'nrec';
    if (v === '0.5') return 'alt';
    return 'ns';
  }

  function badge(val) {
    var v = String(val || '').trim();
    if (v === '1' || v === '1.0') return '✓ Recommandé';
    if (v === '0' || v === '0.0') return '✗ Non recommandé';
    if (v === '0.5') return '↹ Alternative (OU)';
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
      s.className = 'path-step'; s.textContent = humaniserLabel(h.label); 
      pathEl.appendChild(s);
    });

    var grid = $('results-grid');
    grid.innerHTML = '';
    var entries = Object.keys(donnees || {}).map(function (k) {
      return { name: k.replace(/^OUT_/i, ''), val: donnees[k], cls: cls(donnees[k]) };
    });

    // Tri : Recommandé (0), Alternative (1), Non rec (2), Non spécifié (3)
    var order = { rec: 0, alt: 1, nrec: 2, ns: 3 };
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

    renderEtudes(donnees); // On passe les recommandations pour le filtre
    show('screen-results');
  }

  function renderEtudes(donneesResultats) {
    var container = $('etudes-container');
    if (!container || !baseEtudes || !baseEtudes.etudes) return;

    container.innerHTML = '';
    var profilPatient = construireProfilPatient();
    var etudesPertinentes = [];

    // Extraction des traitements pertinents (1.0 ou 0.5)
    var traitementsRecommandes = [];
    if (donneesResultats) {
      Object.keys(donneesResultats).forEach(function(key) {
        var val = String(donneesResultats[key]);
        if (val === "1.0" || val === "1" || val === "0.5") {
          traitementsRecommandes.push(key.replace(/^OUT_/i, '').trim());
        }
      });
    }

    baseEtudes.etudes.forEach(function(etude) {
      var score = calculerScoreEtude(etude, profilPatient, baseEtudes.mapping, traitementsRecommandes);
      if (score >= 50) { // Limite de pertinence fixée à 50%
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
        statsHtml = '<div style="color: #999; font-style: italic;">Pas de données chiffrées pour cette étude.</div>';
      }

      card.innerHTML = `
        <div class="etude-header">
            <span class="etude-score">${etude.scoreMatch}% Match</span>
            <span class="etude-preuve">Preuve: Niveau ${etude.niveau_preuve}</span>
        </div>
        <h4 class="etude-title">${etude.objectif !== '-1' ? etude.objectif : 'Étude clinique'}</h4>
        <div style="font-size: 12px; color: #666; margin-bottom: 12px;">
            <strong>Testé:</strong> ${etude.traitements_evalues.join(', ') || 'NC'}
        </div>
        <div class="etude-stats">
            ${statsHtml}
        </div>
        <a href="${etude.reference}" target="_blank" class="etude-link">Voir l'étude ↗</a>
      `;
      container.appendChild(card);
    });
  }

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
