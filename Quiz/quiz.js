/**
 * BIAS-QUIZ – The Biased Mind (PWA)
 * Datenquelle: globales Array `biases` aus ../script.js (gemeinsam mit der Website).
 *
 * Zwei Fragetypen:
 *  - "term":     Begriff gegeben  → richtige Bedeutung (desc) aus 4 Optionen wählen
 *  - "scenario": Beispiel gegeben → richtigen Begriff (name) aus 4 Optionen wählen
 *
 * Falsche Antworten (Distraktoren) stammen bevorzugt aus derselben Kategorie,
 * damit die Optionen plausibel sind und nicht durch Ausschluss erraten werden können.
 */

document.addEventListener('DOMContentLoaded', () => {

    const CAT_LABELS = {
        entscheidung: 'Entscheidung',
        sozial: 'Sozial',
        gedaechtnis: 'Gedächtnis',
        methodik: 'Methodik/Statistik',
        wahrnehmung: 'Wahrnehmung',
        logik: 'Logik',
        technik: 'Technik/Algorithmus',
        'anti-bias': 'Anti-Bias',
        heuristik: 'Heuristik'
    };

    const $ = id => document.getElementById(id);
    const panels = {
        start: $('quiz-start'), question: $('quiz-question'),
        result: $('quiz-result'), error: $('quiz-error')
    };

    function showPanel(name) {
        Object.entries(panels).forEach(([key, panel]) => { panel.hidden = key !== name; });
        window.scrollTo(0, 0);
    }

    // --- Daten prüfen (z. B. falls ../script.js offline nicht im Cache ist) ---
    if (typeof biases === 'undefined' || !Array.isArray(biases)) {
        showPanel('error');
        registerServiceWorker();
        return;
    }

    // Nur vollständige Einträge mit gültiger Kategorie verwenden
    const pool = biases.filter(b => CAT_LABELS[b.cat] && b.name && b.desc && b.example);

    const el = {
        progress: $('q-progress'), bar: $('q-bar'), category: $('q-category'), type: $('q-type'),
        prompt: $('q-prompt'), options: $('q-options'), feedback: $('q-feedback'),
        next: $('next-btn'), end: $('end-btn'), start: $('start-btn'),
        restart: $('restart-btn'), home: $('home-btn'),
        summary: $('r-summary'), review: $('r-review'), poolInfo: $('pool-info')
    };

    el.poolInfo.textContent = `${pool.length} Denkfallen in ${Object.keys(CAT_LABELS).length} Kategorien – wie viele erkennst du?`;

    // --- Einstellungen (werden lokal gemerkt, falls der Browser das erlaubt) ---
    const SETTINGS_KEY = 'bias-quiz-settings';
    const settings = { mode: 'mixed', cat: 'all', length: 10 };

    try {
        Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {});
    } catch (e) { /* kein Speicher verfügbar – Standardwerte nutzen */ }

    function saveSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* egal */ }
    }

    // Gespeicherte Auswahl in den Buttons sichtbar machen
    document.querySelectorAll('.option-group').forEach(group => {
        const value = String(settings[group.dataset.setting]);
        const match = group.querySelector(`[data-value="${value}"]`);
        if (!match) return;
        group.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === match));
    });

    // --- Zustand ---
    let queue = [];      // gemischte Liste der Ziel-Biases dieser Runde
    let current = null;  // { bias, type, options, correctIndex }
    let answered = false;
    let stats = { asked: 0, correct: 0, missed: [] };

    // --- Hilfsfunktionen ---
    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function candidates() {
        return settings.cat === 'all' ? pool : pool.filter(b => b.cat === settings.cat);
    }

    // 2 Distraktoren aus derselben Kategorie + 1 aus einer anderen (falls möglich)
    function pickDistractors(target) {
        const same = shuffle(pool.filter(b => b !== target && b.cat === target.cat));
        const other = shuffle(pool.filter(b => b.cat !== target.cat));
        const picked = same.slice(0, 2);
        picked.push(...other.slice(0, 3 - picked.length));
        if (picked.length < 3) picked.push(...same.slice(2, 2 + 3 - picked.length));
        return picked;
    }

    function buildQuestion(bias) {
        const type = settings.mode === 'mixed'
            ? (Math.random() < 0.5 ? 'term' : 'scenario')
            : settings.mode;
        const options = shuffle([bias, ...pickDistractors(bias)]);
        return { bias, type, options, correctIndex: options.indexOf(bias) };
    }

    // --- Ablauf ---
    function startQuiz() {
        queue = shuffle(candidates());
        stats = { asked: 0, correct: 0, missed: [] };
        showPanel('question');
        nextQuestion();
    }

    function nextQuestion() {
        const limit = settings.length;
        if (limit && stats.asked >= limit) return showResult();

        // Endlos-Modus: Liste neu mischen, wenn alle Biases einmal dran waren
        if (queue.length === 0) queue = shuffle(candidates());

        current = buildQuestion(queue.pop());
        answered = false;
        renderQuestion();
        window.scrollTo(0, 0);
    }

    function renderQuestion() {
        const { bias, type, options } = current;
        const limit = settings.length;

        el.progress.textContent = limit
            ? `Frage ${stats.asked + 1} von ${limit}`
            : `Frage ${stats.asked + 1} · ${stats.correct} richtig`;
        el.bar.style.width = limit ? `${(stats.asked / limit) * 100}%` : '100%';
        el.category.textContent = CAT_LABELS[bias.cat];
        panels.question.dataset.category = bias.cat;

        if (type === 'term') {
            el.type.textContent = 'Was bedeutet …';
            el.prompt.textContent = bias.name;
            el.prompt.classList.remove('scenario');
        } else {
            el.type.textContent = 'Welche Denkfalle steckt dahinter?';
            el.prompt.textContent = `„${bias.example}“`;
            el.prompt.classList.add('scenario');
        }

        el.options.innerHTML = '';
        options.forEach((opt, i) => {
            const btn = document.createElement('button');
            btn.className = 'q-option';
            const key = document.createElement('span');
            key.className = 'key';
            key.textContent = i + 1;
            const text = document.createElement('span');
            text.textContent = type === 'term' ? opt.desc : opt.name;
            btn.append(key, text);
            btn.onclick = () => answer(i);
            el.options.appendChild(btn);
        });

        el.feedback.hidden = true;
        el.next.hidden = true;
    }

    function answer(index) {
        if (answered) return;
        answered = true;

        const { bias, correctIndex, type } = current;
        const isCorrect = index === correctIndex;
        stats.asked++;
        if (isCorrect) stats.correct++;
        else stats.missed.push(bias);

        if (settings.length) el.bar.style.width = `${(stats.asked / settings.length) * 100}%`;

        [...el.options.children].forEach((btn, i) => {
            btn.disabled = true;
            if (i === correctIndex) btn.classList.add('correct');
            else if (i === index) btn.classList.add('wrong');
            else btn.classList.add('dimmed');
        });

        // Feedback: nur ergänzen, was nicht ohnehin schon auf dem Bildschirm steht.
        // Begriff-Frage → Beschreibung ist als Option markiert, also das Beispiel zeigen.
        // Szenario-Frage → Beispiel steht oben, also die Beschreibung zeigen.
        el.feedback.innerHTML = '';
        const h = document.createElement('h3');
        h.className = isCorrect ? 'is-correct' : 'is-wrong';
        h.textContent = (isCorrect ? '✓ Richtig: ' : '✗ Richtig wäre: ') + bias.name;
        el.feedback.appendChild(h);

        const p = document.createElement('p');
        if (type === 'term') {
            const label = document.createElement('strong');
            label.textContent = 'Beispiel: ';
            const em = document.createElement('em');
            em.textContent = bias.example;
            p.append(label, em);
        } else {
            p.textContent = bias.desc;
        }
        el.feedback.appendChild(p);
        el.feedback.hidden = false;

        const isLast = settings.length && stats.asked >= settings.length;
        el.next.textContent = isLast ? 'Zur Auswertung' : 'Weiter';
        el.next.hidden = false;
        el.next.focus({ preventScroll: true });
        el.feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function showResult() {
        showPanel('result');
        delete panels.question.dataset.category;

        if (stats.asked === 0) {
            el.summary.textContent = 'Keine Fragen beantwortet.';
        } else {
            el.summary.innerHTML = `Du hast <strong>${stats.correct} von ${stats.asked}</strong> Fragen richtig beantwortet.`;
        }

        el.review.innerHTML = '';
        if (stats.missed.length) {
            const h = document.createElement('h3');
            h.textContent = 'Zum Wiederholen';
            el.review.appendChild(h);
            stats.missed.forEach(b => {
                const item = document.createElement('div');
                item.className = 'review-item';
                const name = document.createElement('h4');
                name.textContent = b.name;
                const desc = document.createElement('p');
                desc.textContent = b.desc;
                item.append(name, desc);
                el.review.appendChild(item);
            });
        }
        el.restart.focus({ preventScroll: true });
    }

    // --- Events ---
    document.querySelectorAll('.option-group').forEach(group => {
        group.onclick = e => {
            const btn = e.target.closest('button');
            if (!btn) return;
            group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const key = group.dataset.setting;
            settings[key] = key === 'length' ? Number(btn.dataset.value) : btn.dataset.value;
            saveSettings();
        };
    });

    el.start.onclick = startQuiz;
    el.next.onclick = nextQuestion;
    el.end.onclick = showResult;
    el.restart.onclick = startQuiz;           // gleiche Einstellungen, neue Fragen
    el.home.onclick = () => showPanel('start');

    document.addEventListener('keydown', e => {
        if (panels.question.hidden) return;
        if (!answered && ['1', '2', '3', '4'].includes(e.key)) {
            answer(Number(e.key) - 1);
        } else if (answered && e.key === 'Enter') {
            e.preventDefault(); // verhindert Doppel-Auslösung über den fokussierten Button
            nextQuestion();
        }
    });

    registerServiceWorker();
    setupInstall();
});

/* ================= PWA: Offline & Installation ================= */

function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service Worker:', err));
    }
}

function setupInstall() {
    const box = document.getElementById('install-box');
    const btn = document.getElementById('install-btn');
    const text = document.getElementById('install-text');

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (isStandalone) return; // läuft bereits als App

    // Chrome, Edge, Android: eigener Installations-Button
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        box.hidden = false;
        btn.hidden = false;
    });

    btn.onclick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        box.hidden = true;
    };

    window.addEventListener('appinstalled', () => { box.hidden = true; });

    // iPhone/iPad: Safari kennt keinen Installations-Dialog → Anleitung zeigen
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
        text.textContent = 'Als App nutzen: In Safari auf „Teilen“ tippen und „Zum Home-Bildschirm“ wählen.';
        box.hidden = false;
    }
}
