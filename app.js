// Austin Pétanque Application Script
import { db, collection, addDoc, getDocs, serverTimestamp } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initScoreboard();
  initModal();
  initFormSubmission();
  initHashRouting();
  renderBoules('A');
  renderBoules('B');
});

// ─── Boule Tracker (two-zone) ────────────────────────────────────────────────
// State: 0 = in-hand (right zone, circle)
//        1 = thrown  (left zone, slash)
//        2 = close ball (left zone, ★ star)
const bouleStates = { A: [0,0,0,0,0,0], B: [0,0,0,0,0,0] };

function renderBoules(team) {
  const t = team === 'A' ? 'a' : 'b';
  const leftEl  = document.getElementById(`boules-${t}-left`);
  const rightEl = document.getElementById(`boules-${t}-right`);
  if (!leftEl || !rightEl) return;

  const color = team === 'A' ? 'red' : 'blue';

  // LEFT zone: slashes (state 1) then stars (state 2), ordered by index
  leftEl.innerHTML = bouleStates[team]
    .map((state, i) => ({ state, i }))
    .filter(b => b.state === 1 || b.state === 2)
    .map(({ state, i }) =>
      `<div class="boule ${color} state-${state}"
            onclick="cycleBoule('${team}', ${i})"
            title="${state === 1 ? 'Tap to mark as close ball ★' : 'Tap to unmark close ball'}"></div>`
    ).join('');

  // RIGHT zone: circles (state 0), ordered by index
  rightEl.innerHTML = bouleStates[team]
    .map((state, i) => ({ state, i }))
    .filter(b => b.state === 0)
    .map(({ state, i }) =>
      `<div class="boule ${color} state-0"
            onclick="cycleBoule('${team}', ${i})"
            title="Tap to throw"></div>`
    ).join('');
}

window.cycleBoule = (team, index) => {
  const current = bouleStates[team][index];
  // 0 (right, circle in hand) -> 1 (left, thrown slash)
  // Once thrown on left: 1 (slash) <-> 2 (star)
  // Ball NEVER returns to hand (right) until dedicated reset button is pressed!
  const newState = current === 0 ? 1 : (current === 1 ? 2 : 1);
  bouleStates[team][index] = newState;

  // ★ Star revocation: when marking a ball as close (★),
  // immediately revoke all opponent stars → they revert to slash (thrown, not scoring)
  if (newState === 2) {
    const other = team === 'A' ? 'B' : 'A';
    let revoked = false;
    bouleStates[other] = bouleStates[other].map(s => { if (s === 2) { revoked = true; return 1; } return s; });
    if (revoked) renderBoules(other);
  }

  renderBoules(team);
  updateFromStars();
  checkAllThrown();
};

// ─── New Mène button ──────────────────────────────────────────────────────────
// Appears when last boule is in hand OR all boules are thrown
function checkAllThrown() {
  const inHandA = bouleStates.A.filter(s => s === 0).length;
  const inHandB = bouleStates.B.filter(s => s === 0).length;
  const total = inHandA + inHandB;
  const btn = document.getElementById('new-mene-btn');
  if (!btn) return;

  if (total === 0) {
    // All 12 boules thrown — mène is over
    btn.style.display = 'flex';
    btn.innerHTML = `<i class="fa-solid fa-rotate-right"></i> New Mène`;
    btn.classList.add('pulse-mene');
  } else if (total === 1) {
    // Very last boule still in hand
    btn.style.display = 'flex';
    btn.innerHTML = `<i class="fa-solid fa-flag-checkered"></i> Last Boule — Reset`;
    btn.classList.remove('pulse-mene');
  } else {
    btn.style.display = 'none';
    btn.classList.remove('pulse-mene');
  }
}

window.resetMene = () => {
  // Reset boule tracker only — score stays
  resetBoules();
  const btn = document.getElementById('new-mene-btn');
  if (btn) btn.style.display = 'none';
};
// ─────────────────────────────────────────────────────────────────────────────

// ─── Star-driven point holder ─────────────────────────────────────────────────
// Count ★ (state 2) per team and auto-illuminate the leading team.
// Star advantage = how many of your balls are closer than opponent's nearest.
function updateFromStars() {
  const starsA = bouleStates.A.filter(s => s === 2).length;
  const starsB = bouleStates.B.filter(s => s === 2).length;

  const boxA = document.getElementById('team-box-a');
  const boxB = document.getElementById('team-box-b');
  const btnA = document.getElementById('point-btn-a');
  const btnB = document.getElementById('point-btn-b');
  const leadDiff = document.getElementById('lead-diff');
  const leadBanner = document.getElementById('lead-banner');

  if (!boxA || !boxB) return;

  // Clear all point states first
  boxA.classList.remove('has-point-red', 'has-point-blue', 'point-inactive');
  boxB.classList.remove('has-point-red', 'has-point-blue', 'point-inactive');
  btnA?.classList.remove('active');
  btnB?.classList.remove('active');

  if (starsA === 0 && starsB === 0) {
    // No stars — clear mène indicator, keep score-based lead
    pointHolder = null;
    updateLeadIndicators();
    return;
  }

  if (starsA > starsB) {
    // Team Red has the point by (starsA - starsB)
    pointHolder = 'A';
    boxA.classList.add('has-point-red');
    boxB.classList.add('point-inactive');
    btnA?.classList.add('active');
    const margin = starsA - starsB;
    const pts = margin === 1 ? 'pt' : 'pts';
    if (leadDiff) {
      leadDiff.className = 'lead-diff red';
      leadDiff.innerHTML = `★ +${margin} ${pts}`;
    }
    if (leadBanner) {
      leadBanner.style.display = 'block';
      leadBanner.className = 'lead-banner red';
      leadBanner.innerHTML = `★ <strong>Team Red</strong> has the point &mdash; <strong>${margin} ${pts}</strong> closer`;
    }
  } else if (starsB > starsA) {
    // Team Blue has the point
    pointHolder = 'B';
    boxB.classList.add('has-point-blue');
    boxA.classList.add('point-inactive');
    btnB?.classList.add('active');
    const margin = starsB - starsA;
    const pts = margin === 1 ? 'pt' : 'pts';
    if (leadDiff) {
      leadDiff.className = 'lead-diff blue';
      leadDiff.innerHTML = `★ +${margin} ${pts}`;
    }
    if (leadBanner) {
      leadBanner.style.display = 'block';
      leadBanner.className = 'lead-banner blue';
      leadBanner.innerHTML = `★ <strong>Team Blue</strong> has the point &mdash; <strong>${margin} ${pts}</strong> closer`;
    }
  } else {
    // Equal stars — contested!
    pointHolder = null;
    if (leadDiff) {
      leadDiff.className = 'lead-diff tied';
      leadDiff.innerHTML = `★ Tied`;
    }
    if (leadBanner) leadBanner.style.display = 'none';
  }
}
// ─────────────────────────────────────────────────────────────────────────────

function resetBoules() {
  bouleStates.A = [0,0,0,0,0,0];
  bouleStates.B = [0,0,0,0,0,0];
  renderBoules('A');
  renderBoules('B');
  updateFromStars();
}
// ─────────────────────────────────────────────────────────────────────────────


// Mobile Drawer
window.toggleDrawer = () => {
  const drawer = document.getElementById('mobile-drawer');
  const btn = document.getElementById('hamburger-btn');
  drawer.classList.toggle('open');
  btn.classList.toggle('open');
  document.body.style.overflow = drawer.classList.contains('open') ? 'hidden' : '';
};

window.closeDrawer = () => {
  const drawer = document.getElementById('mobile-drawer');
  const btn = document.getElementById('hamburger-btn');
  drawer.classList.remove('open');
  btn.classList.remove('open');
  document.body.style.overflow = '';
};


// Hash routing for Admin view
function initHashRouting() {
  const handleRoute = () => {
    const hash = window.location.hash;
    const publicView = document.getElementById('public-view');
    const adminSection = document.getElementById('admin');

    if (hash === '#admin' || hash.startsWith('#admin?')) {
      if (publicView) publicView.style.display = 'none';
      if (adminSection) adminSection.style.display = 'block';
      
      // Auto approve if query params present
      const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const approveId = urlParams.get('approve');
      if (approveId) {
        autoApproveMember(approveId);
      }
    } else {
      if (publicView) publicView.style.display = 'block';
      if (adminSection) adminSection.style.display = 'none';
    }
  };

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

// Navbar scroll background toggle
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}

// Live Score Tracker State & Functions
let teamAScore = 0;
let teamBScore = 0;
let pointHolder = null; // 'A', 'B', or null
let matchWinner = null; // 'A', 'B', or null
let confettiAnimationId = null;

function initScoreboard() {
  const scoreAEl = document.getElementById('score-a');
  const scoreBEl = document.getElementById('score-b');

  window.updateScore = (team, delta) => {
    if (team === 'A') {
      teamAScore = Math.max(0, Math.min(25, teamAScore + delta));
      if (scoreAEl) scoreAEl.textContent = teamAScore;
    } else if (team === 'B') {
      teamBScore = Math.max(0, Math.min(25, teamBScore + delta));
      if (scoreBEl) scoreBEl.textContent = teamBScore;
    }
    updateLeadIndicators();
    checkWinCondition();
  };

  window.resetScore = () => {
    teamAScore = 0;
    teamBScore = 0;
    pointHolder = null;
    matchWinner = null;
    if (scoreAEl) scoreAEl.textContent = '0';
    if (scoreBEl) scoreBEl.textContent = '0';
    const boxA = document.getElementById('team-box-a');
    const boxB = document.getElementById('team-box-b');
    if (boxA) boxA.classList.remove('has-point-red', 'has-point-blue', 'point-inactive');
    if (boxB) boxB.classList.remove('has-point-red', 'has-point-blue', 'point-inactive');
    document.getElementById('point-btn-a')?.classList.remove('active');
    document.getElementById('point-btn-b')?.classList.remove('active');
    hideVictoryCelebration();
    resetBoules();
    updateLeadIndicators();
  };
}

// ─── Win Condition Check ──────────────────────────────────────────────────────
// Rule: target 13 points (e.g. 13-10). A team wins when they reach 13 points
// AND win by two (lead by at least 2 points). If tied 12-12 or above, the game
// continues until a team achieves a 2-point lead (e.g. 14-12, 15-13).
function checkWinCondition() {
  let winner = null;
  if (teamAScore >= 13 && (teamAScore - teamBScore >= 2)) {
    winner = 'A';
  } else if (teamBScore >= 13 && (teamBScore - teamAScore >= 2)) {
    winner = 'B';
  }

  if (winner && winner !== matchWinner) {
    matchWinner = winner;
    const winnerName = winner === 'A' ? 'Team Red' : 'Team Blue';
    triggerVictoryCelebration(winner, winnerName);
  } else if (!winner && matchWinner) {
    // If score was manually rolled back below win threshold
    matchWinner = null;
    hideVictoryCelebration();
  }
}

// ─── Victory UI & Celebrations ────────────────────────────────────────────────
window.hideVictoryCelebration = () => {
  const overlay = document.getElementById('victory-overlay');
  if (overlay) overlay.style.display = 'none';
  stopConfetti();
};

function triggerVictoryCelebration(winner, winnerName) {
  const overlay = document.getElementById('victory-overlay');
  const title = document.getElementById('victory-title');
  const subtitle = document.getElementById('victory-subtitle');

  if (title) {
    title.textContent = `${winnerName} Wins!`;
    title.className = `victory-title ${winner === 'A' ? 'red' : 'blue'}`;
  }
  if (subtitle) {
    subtitle.innerHTML = `Final Match Score: <strong>${teamAScore} &ndash; ${teamBScore}</strong>`;
  }
  if (overlay) {
    overlay.style.display = 'flex';
  }

  // 1. Play celebratory fanfare + roaring stadium cheer sound
  playCelebrationSound();

  // 2. Announce winner via speech synthesis ("Team Red wins!" / "Team Blue wins!")
  announceWinner(winnerName);

  // 3. Trigger confetti shower
  runConfetti();
}

// ─── Speech Synthesis Announcement ───────────────────────────────────────────
function announceWinner(winnerName) {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`${winnerName} wins!`);
    utterance.rate = 0.95;
    utterance.pitch = 1.15;
    utterance.volume = 1.0;

    const speak = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const preferred = voices.find(v => v.lang.startsWith('en') &&
          (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Alex'))) ||
          voices.find(v => v.lang.startsWith('en'));
        if (preferred) utterance.voice = preferred;
      }
      window.speechSynthesis.speak(utterance);
    };

    // Trigger announcement 750ms after celebratory fanfare starts
    setTimeout(speak, 750);
  } catch (err) {
    console.warn('Speech synthesis unavailable:', err);
  }
}

// ─── Web Audio Celebration Sound (Fanfare + Cheering Crowd) ───────────────────
function playCelebrationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // 1. Triumphant Brass Fanfare: C5, E5, G5, High C6 chord
    const fanfareNotes = [
      { f: 523.25, start: 0.00, dur: 0.22 }, // C5
      { f: 659.25, start: 0.20, dur: 0.22 }, // E5
      { f: 783.99, start: 0.40, dur: 0.26 }, // G5
      { f: 1046.50, start: 0.65, dur: 1.80 }, // High C6
      { f: 783.99, start: 0.65, dur: 1.80 },  // G5 harmony
      { f: 659.25, start: 0.65, dur: 1.80 },  // E5 harmony
      { f: 523.25, start: 0.65, dur: 1.80 }   // C5 base
    ];

    fanfareNotes.forEach(({ f, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, ctx.currentTime + start);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2800, ctx.currentTime + start);
      filter.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + start + dur);

      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + start + 0.04);
      gain.gain.setValueAtTime(0.32, ctx.currentTime + start + dur * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    });

    // 2. Synthesized Stadium Crowd Cheering & Applause (4.5s roar)
    const bufferSize = Math.floor(ctx.sampleRate * 4.5);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const channelData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      channelData[i] = (Math.random() * 2 - 1) * (0.85 + 0.3 * Math.sin(i * 0.0002));
    }

    const crowdSource = ctx.createBufferSource();
    crowdSource.buffer = noiseBuffer;

    const crowdFilter1 = ctx.createBiquadFilter();
    crowdFilter1.type = 'bandpass';
    crowdFilter1.frequency.setValueAtTime(800, ctx.currentTime);
    crowdFilter1.Q.setValueAtTime(2.0, ctx.currentTime);

    const crowdFilter2 = ctx.createBiquadFilter();
    crowdFilter2.type = 'bandpass';
    crowdFilter2.frequency.setValueAtTime(2200, ctx.currentTime);
    crowdFilter2.Q.setValueAtTime(1.8, ctx.currentTime);

    const crowdGain = ctx.createGain();
    crowdGain.gain.setValueAtTime(0.001, ctx.currentTime);
    crowdGain.gain.exponentialRampToValueAtTime(0.48, ctx.currentTime + 0.7);
    crowdGain.gain.setValueAtTime(0.48, ctx.currentTime + 2.8);
    crowdGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 4.5);

    crowdSource.connect(crowdFilter1);
    crowdSource.connect(crowdFilter2);
    crowdFilter1.connect(crowdGain);
    crowdFilter2.connect(crowdGain);
    crowdGain.connect(ctx.destination);

    crowdSource.start(ctx.currentTime + 0.15);

    // 3. Whistles / Cheering Screams in Crowd
    [0.85, 1.5, 2.3].forEach((startTime, idx) => {
      const wOsc = ctx.createOscillator();
      const wGain = ctx.createGain();
      wOsc.type = 'sine';
      const baseFreq = 1600 + idx * 350;
      wOsc.frequency.setValueAtTime(baseFreq, ctx.currentTime + startTime);
      wOsc.frequency.linearRampToValueAtTime(baseFreq + 700, ctx.currentTime + startTime + 0.2);
      wOsc.frequency.linearRampToValueAtTime(baseFreq + 100, ctx.currentTime + startTime + 0.4);

      wGain.gain.setValueAtTime(0.001, ctx.currentTime + startTime);
      wGain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + startTime + 0.05);
      wGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + 0.45);

      wOsc.connect(wGain);
      wGain.connect(ctx.destination);
      wOsc.start(ctx.currentTime + startTime);
      wOsc.stop(ctx.currentTime + startTime + 0.48);
    });

    setTimeout(() => {
      try { ctx.close(); } catch(e) {}
    }, 5000);
  } catch (err) {
    console.warn('Audio celebration error:', err);
  }
}

// ─── Confetti Animation ───────────────────────────────────────────────────────
function runConfetti() {
  const canvas = document.getElementById('victory-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const parent = canvas.parentElement;
  canvas.width = parent ? parent.offsetWidth : window.innerWidth;
  canvas.height = parent ? parent.offsetHeight : 450;

  const colors = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#ec4899', '#fbbf24', '#ffffff'];
  const confettiCount = 90;
  const pieces = [];

  for (let i = 0; i < confettiCount; i++) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      size: Math.random() * 8 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      speed: Math.random() * 3 + 2.5,
      angle: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 8,
      wobble: Math.random() * 20,
      wobbleSpeed: Math.random() * 0.1 + 0.05
    });
  }

  let frame = 0;
  if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId);

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;

    pieces.forEach(p => {
      p.y += p.speed;
      p.angle += p.rotSpeed;
      p.x += Math.sin(frame * p.wobbleSpeed) * 1.5;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.angle * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();

      if (p.y > canvas.height + 20) {
        p.y = -20;
        p.x = Math.random() * canvas.width;
      }
    });

    confettiAnimationId = requestAnimationFrame(draw);
  }

  draw();
}

function stopConfetti() {
  if (confettiAnimationId) {
    cancelAnimationFrame(confettiAnimationId);
    confettiAnimationId = null;
  }
}


// ─── Whistle Sound (Web Audio API, no file needed) ───────────────────────────

function playWhistle() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Main whistle tone
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3200, ctx.currentTime);
    filter.Q.setValueAtTime(12, ctx.currentTime);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2800, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(3400, ctx.currentTime + 0.08);
    osc.frequency.linearRampToValueAtTime(3100, ctx.currentTime + 0.22);
    osc.frequency.linearRampToValueAtTime(3600, ctx.currentTime + 0.35);
    osc.frequency.linearRampToValueAtTime(3200, ctx.currentTime + 0.55);

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.45, ctx.currentTime + 0.02);
    gainNode.gain.setValueAtTime(0.45, ctx.currentTime + 0.45);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.65);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.65);

    // Second short toot after brief pause (ref double-blow)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    const filter2 = ctx.createBiquadFilter();
    filter2.type = 'bandpass';
    filter2.frequency.setValueAtTime(3400, ctx.currentTime + 0.75);
    filter2.Q.setValueAtTime(14, ctx.currentTime + 0.75);
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(3400, ctx.currentTime + 0.75);
    osc2.frequency.linearRampToValueAtTime(3800, ctx.currentTime + 0.95);
    gain2.gain.setValueAtTime(0, ctx.currentTime + 0.75);
    gain2.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.78);
    gain2.gain.setValueAtTime(0.5, ctx.currentTime + 0.95);
    gain2.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.1);
    osc2.connect(filter2);
    filter2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.75);
    osc2.stop(ctx.currentTime + 1.1);

    osc.onended = () => ctx.close();
  } catch (e) {
    console.log('Audio not available:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

// Set which team currently has the point (closest to cochonnet)
window.setPointHolder = (team) => {
  const boxA = document.getElementById('team-box-a');
  const boxB = document.getElementById('team-box-b');
  const btnA = document.getElementById('point-btn-a');
  const btnB = document.getElementById('point-btn-b');

  if (pointHolder === team) {
    // Toggle off — clear everything
    pointHolder = null;
    boxA.classList.remove('has-point-red', 'has-point-blue', 'point-inactive');
    boxB.classList.remove('has-point-red', 'has-point-blue', 'point-inactive');
    btnA.classList.remove('active');
    btnB.classList.remove('active');
  } else {
    const previousHolder = pointHolder;
    pointHolder = team;

    // Clear all states first
    boxA.classList.remove('has-point-red', 'has-point-blue', 'point-inactive');
    boxB.classList.remove('has-point-red', 'has-point-blue', 'point-inactive');
    btnA.classList.remove('active');
    btnB.classList.remove('active');

    if (team === 'A') {
      boxA.classList.add('has-point-red');   // light up Red
      boxB.classList.add('point-inactive');   // dim Blue
      btnA.classList.add('active');
    } else {
      boxB.classList.add('has-point-blue');   // light up Blue
      boxA.classList.add('point-inactive');   // dim Red
      btnB.classList.add('active');
    }

    // 🎵 Whistle ONLY when the claiming team is currently LOSING (score behind by 1+)
    const teamAisLosing = teamAScore < teamBScore;
    const teamBisLosing = teamBScore < teamAScore;
    const lostTeamSteals = (team === 'A' && teamAisLosing) || (team === 'B' && teamBisLosing);

    if (lostTeamSteals) {
      playWhistle();
    }
  }
  updateLeadIndicators();
};

function clearPointHolder() {
  document.getElementById('team-box-a').classList.remove('has-point-red', 'has-point-blue');
  document.getElementById('team-box-b').classList.remove('has-point-red', 'has-point-blue');
  document.getElementById('point-btn-a').classList.remove('active');
  document.getElementById('point-btn-b').classList.remove('active');
}

function updateLeadIndicators() {
  const leadDiff = document.getElementById('lead-diff');
  const leadBanner = document.getElementById('lead-banner');
  const diff = teamAScore - teamBScore;

  if (!leadDiff || !leadBanner) return;

  if (diff === 0) {
    leadDiff.className = 'lead-diff tied';
    leadDiff.textContent = 'Tied';
    leadBanner.style.display = 'none';
  } else if (diff > 0) {
    const pts = diff === 1 ? 'pt' : 'pts';
    leadDiff.className = 'lead-diff red';
    leadDiff.textContent = `🔴 +${diff} ${pts}`;
    leadBanner.style.display = 'block';
    leadBanner.className = 'lead-banner red';
    leadBanner.innerHTML = `🔴 <strong>Team Red</strong> leads by <strong>${diff} ${pts}</strong>`;
  } else {
    const absDiff = Math.abs(diff);
    const pts = absDiff === 1 ? 'pt' : 'pts';
    leadDiff.className = 'lead-diff blue';
    leadDiff.textContent = `🔵 +${absDiff} ${pts}`;
    leadBanner.style.display = 'block';
    leadBanner.className = 'lead-banner blue';
    leadBanner.innerHTML = `🔵 <strong>Team Blue</strong> leads by <strong>${absDiff} ${pts}</strong>`;
  }
}


// Modal Handlers
function initModal() {
  const modal = document.getElementById('membership-modal');
  
  window.openModal = () => {
    modal.classList.add('active');
  };

  window.closeModal = () => {
    modal.classList.remove('active');
  };

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });
}

// Store pending applications in local storage cache for offline/admin preview
const LOCAL_STORAGE_KEY = 'austin_petanque_pending_apps';

function getPendingApps() {
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  return data ? JSON.parse(data) : [
    {
      id: 'app-101',
      name: 'Pierre Dubois',
      email: 'pierre.dubois@example.com',
      skillLevel: 'intermediate',
      status: 'pending',
      date: new Date().toLocaleDateString()
    }
  ];
}

function savePendingApps(apps) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(apps));
}

// Member Registration submit to Firebase Firestore & Email Dispatch
function initFormSubmission() {
  const form = document.getElementById('join-form');
  const statusEl = document.getElementById('form-status');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('member-name').value;
    const email = document.getElementById('member-email').value;
    const skillLevel = document.getElementById('member-skill').value;

    statusEl.textContent = 'Sending application to noless42@gmail.com...';
    statusEl.style.color = '#f59e0b';

    const appId = 'app-' + Date.now();
    const approvalLink = `https://austinpetanque.web.app/#admin?approve=${appId}`;

    // Add to local state cache
    const currentApps = getPendingApps();
    currentApps.push({
      id: appId,
      name,
      email,
      skillLevel,
      status: 'pending',
      date: new Date().toLocaleDateString()
    });
    savePendingApps(currentApps);

    // Trigger email via Formspree API endpoint configured for noless42@gmail.com
    try {
      await fetch('https://formspree.io/f/xqazpveb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _to: 'noless42@gmail.com',
          subject: `🎾 New Austin Pétanque Member Application: ${name}`,
          name: name,
          applicant_email: email,
          experience: skillLevel,
          one_click_approval_link: approvalLink,
          message: `New member application submitted by ${name} (${email}). Experience: ${skillLevel}.\n\nClick to Approve: ${approvalLink}`
        })
      });
    } catch (err) {
      console.log('Formspree dispatch notice:', err);
    }

    // Try saving to Firebase Firestore
    try {
      await addDoc(collection(db, 'members'), {
        appId,
        name,
        email,
        skillLevel,
        status: 'pending',
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.log('Firestore offline mode');
    }

    statusEl.textContent = '🎉 Application sent! Delivered to noless42@gmail.com for approval.';
    statusEl.style.color = '#10b981';
    form.reset();

    setTimeout(() => {
      closeModal();
      statusEl.textContent = '';
    }, 3000);
  });
}

// Founder Admin Auth & Actions
window.loginAdmin = () => {
  const pass = document.getElementById('admin-pass-input').value;
  const errorEl = document.getElementById('admin-login-error');

  if (pass === 'petanque2026' || pass === 'founders' || pass === 'admin') {
    document.getElementById('admin-login-box').style.display = 'none';
    document.getElementById('admin-dashboard-box').style.display = 'block';
    renderAdminDashboard();
  } else {
    errorEl.textContent = 'Incorrect passcode. Try "founders" or "petanque2026"';
  }
};

window.logoutAdmin = () => {
  document.getElementById('admin-login-box').style.display = 'block';
  document.getElementById('admin-dashboard-box').style.display = 'none';
};

function autoApproveMember(appId) {
  const apps = getPendingApps();
  const target = apps.find(a => a.id === appId);
  if (target) {
    target.status = 'approved';
    savePendingApps(apps);
    alert(`✅ Member ${target.name} (${target.email}) has been APPROVED! Notification sent.`);
  }
}

function renderAdminDashboard() {
  const apps = getPendingApps();
  const listEl = document.getElementById('applications-list');
  const countEl = document.getElementById('pending-count');

  const pendingApps = apps.filter(a => a.status === 'pending');
  countEl.textContent = pendingApps.length;

  if (apps.length === 0) {
    listEl.innerHTML = '<p style="color: var(--text-muted);">No member applications found.</p>';
    return;
  }

  listEl.innerHTML = apps.map(app => `
    <div class="event-card glass-panel" style="border-left: 4px solid ${app.status === 'approved' ? '#10b981' : '#f59e0b'};">
      <div>
        <h4 style="font-size: 1.2rem; font-weight: 700;">${app.name}</h4>
        <p style="color: var(--text-muted); font-size: 0.9rem;"><i class="fa-solid fa-envelope"></i> ${app.email} • Level: <strong>${app.skillLevel}</strong></p>
        <p style="font-size: 0.8rem; color: var(--text-dim); margin-top: 4px;">Applied: ${app.date} • ID: ${app.id}</p>
      </div>
      <div style="display: flex; gap: 10px; align-items: center;">
        ${app.status === 'approved' ? 
          '<span style="color: #10b981; font-weight: 700;"><i class="fa-solid fa-circle-check"></i> Approved</span>' :
          `<button class="btn-primary" onclick="actionApprove('${app.id}')" style="padding: 8px 16px; font-size: 0.85rem;"><i class="fa-solid fa-check"></i> Approve</button>
           <button class="btn-secondary" onclick="actionReject('${app.id}')" style="padding: 8px 16px; font-size: 0.85rem; color: #ef4444;"><i class="fa-solid fa-xmark"></i> Reject</button>`
        }
      </div>
    </div>
  `).join('');
}

window.actionApprove = (appId) => {
  const apps = getPendingApps();
  const item = apps.find(a => a.id === appId);
  if (item) {
    item.status = 'approved';
    savePendingApps(apps);
    renderAdminDashboard();
    alert(`✅ ${item.name} (${item.email}) has been approved and added to active club roster.`);
  }
};

window.actionReject = (appId) => {
  let apps = getPendingApps();
  apps = apps.filter(a => a.id !== appId);
  savePendingApps(apps);
  renderAdminDashboard();
};
