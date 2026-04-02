/*
 * Atlas Pronostics — app.js (Version avec Moteur de Matching)
 * Vanilla JS pur, aucune dépendance.
 */

(function () {
  'use strict';

  /* ─── État ───────────────────────────────────────────────── */
  var tree       = null;   // Racine de l'arbre
  var baseEtudes = null;   // Données des études et mapping
  var current    = null;   // Nœud en cours
  var history    = [];     // Pile : [{node, label, question}, …]
  var maxDepth   = 1;      // Pour la barre de progression

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
    var v = '?_v=' + Date.now(); // Anti-cache GitHub Pages
    
    // On charge les deux fichiers en même temps
    Promise.all([
      fetch('arbre_dynamique.json' + v).then(function(r) { 
          if (!r.ok) throw new Error('Arbre HTTP ' + r.status); return r.json(); 
      }),
      fetch('base_etudes.json' + v).then(function(r) { 
          if (!r.ok) { console.warn('Base études introuvable, suite sans études.'); return null; }
          return r.json(); 
      }).catch(function() { return null; }) // Fallback si le JSON études n'est pas encore là
    ])
    .then(function (results) {
      tree       = results[0];
      baseEtudes = results[1];
      maxDepth   = depth(tree, 0) || 1;

      /* Activer les boutons d'accueil */
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

  function render(node) {
    if (node.type === 'resultat') {
      renderResults(node.donnees);
      return;
    }

    var questionTitre = node.titre || '(Question)';
    $('quiz-question').textContent = questionTitre;

    /* Progression */
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
      txt.textContent = label;
      btn.appendChild(txt);

      var arr = document.createElement('span');
      arr.className = 'arrow';
      arr.textContent = '→';
      btn.appendChild(arr);

      btn.addEventListener('click', (function (l, n, q) {
        return function () {
          // On sauvegarde la question ET la réponse pour le profil
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
      // Ex: profil["T1b"] = "1"
      profil[etape.question] = String(etape.label).trim();
    });
    return profil;
  }

  function calculerScoreEtude(etude, profilPatient, mapping) {
    var score = 0;
    var criteresEvalues = 0;

    for (var questionArbre in profilPatient) {
      var reponsePatient = profilPatient[questionArbre].toLowerCase();
      
      // Trouver la colonne d'étude qui correspond à cette question (grâce au mapping Feuil3)
      var colonneEtude = null;
      for (var colEtude in mapping) {
        if (mapping[colEtude].includes(questionArbre)) {
          colonneEtude = colEtude;
          break;
        }
      }

      if (colonneEtude && etude.criteres.hasOwnProperty(colonneEtude)) {
        criteresEvalues++;
        var valeurEtude = String(etude.criteres[colonneEtude]).trim().toLowerCase();

        // "-1" ou "nan" signifie que l'étude n'a pas filtré sur ce critère = Match automatique
        if (valeurEtude === "-1" || valeurEtude === "nan") {
          score++;
        } else {
          // Match simple : si le patient a "1" ou "oui", on vérifie si l'étude l'inclut textuellement
          var qBase = questionArbre.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (reponsePatient === "1" || reponsePatient === "oui" || reponsePatient === "positif") {
            if (valeurEtude.indexOf(qBase) !== -1 || valeurEtude.indexOf(qBase.substring(0,2)) !== -1 || valeurEtude === "positif" || valeurEtude === "1") {
              score++;
            }
          } 
          // Si le patient a "0" ou "non"
          else if (reponsePatient === "0" || reponsePatient === "non" || reponsePatient === "négatif") {
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

    /* Parcours */
    var pathEl = $('results-path');
    pathEl.innerHTML = '';
    history.forEach(function (h, i) {
      if (i > 0) {
        var sep = document.createElement('span');
        sep.className = 'path-sep'; sep.textContent = '›';
        pathEl.appendChild(sep);
      }
      var s = document.createElement('span');
      s.className = 'path-step'; s.textContent = h.label;
      pathEl.appendChild(s);
    });

    /* Grille Traitements SENORIF */
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

    /* Injection des Études Statistiques */
    renderEtudes();

    show('screen-results');
  }

  function renderEtudes() {
    var container = $('etudes-container');
    // Si la zone n'existe pas dans le HTML ou que base_etudes a raté, on annule silencieusement
    if (!container || !baseEtudes || !baseEtudes.etudes) return; 
    
    container.innerHTML = '';
    var profilPatient = construireProfilPatient();
    var etudesPertinentes = [];

    // Calcul du score pour chaque étude
    baseEtudes.etudes.forEach(function(etude) {
      var score = calculerScoreEtude(etude, profilPatient, baseEtudes.mapping);
      if (score >= 50) { // On ne garde que les études à 50% de match minimum
        etude.scoreMatch = score;
        etudesPertinentes.push(etude);
      }
    });

    // Tri par score décroissant
    etudesPertinentes.sort(function(a, b) { return b.scoreMatch - a.scoreMatch; });

    if (etudesPertinentes.length === 0) {
      container.innerHTML = '<p class="muted" style="text-align:center; padding:20px;">Aucune étude spécifique correspondant exactement à ce profil n\'est disponible dans la base actuelle.</p>';
      return;
    }

    // Affichage des cartes d'études
    etudesPertinentes.forEach(function(etude) {
      var card = document.createElement('div');
      card.className = 'etude-card';
      card.innerHTML = `
        <div class="etude-header">
            <span class="etude-score">${etude.scoreMatch}% Match</span>
            <span class="etude-preuve">Preuve: Niveau ${etude.niveau_preuve}</span>
        </div>
        <h4 class="etude-title">${etude.objectif !== 'NC' ? etude.objectif : 'Étude clinique'}</h4>
        <div class="etude-stats">
            <div><strong>Survie globale (10A) :</strong> ${etude.outcomes.OS_10A}</div>
            <div><strong>Récidive locale (10A) :</strong> ${etude.outcomes.LR_10A}</div>
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

  /* Fonctions globales pour le HTML */
  window.demarrer    = demarrer;
  window.reculer     = reculer;
  window.recommencer = recommencer;
  window.accueil     = recommencer;

  /* ─── Lancement ─── */
  load();
}());
