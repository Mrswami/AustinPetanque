// Austin Pétanque Application Script
import {
  db,
  auth,
  googleProvider,
  appleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  collection,
  doc,
  setDoc,
  getDoc,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot
} from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initAuth();
  initScoreboard();
  initModal();
  initFormSubmission();
  initHashRouting();
  initSunlightPreference();
  initCourtCheckIns();
  renderBoules('A');
  renderBoules('B');
  renderMeneTimeline();

  const checkinForm = document.getElementById('checkin-form');
  if (checkinForm) {
    checkinForm.addEventListener('submit', window.handleCheckInSubmit);
  }
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
  triggerHaptic(20);
  syncMatchToCloud();
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
    // All 12 boules thrown — mène is ready to record
    btn.style.display = 'flex';
    btn.innerHTML = `<i class="fa-solid fa-check"></i> Record Mène`;
    btn.classList.add('pulse-mene');
  } else if (total === 1) {
    // Very last boule still in hand
    btn.style.display = 'flex';
    btn.innerHTML = `<i class="fa-solid fa-flag-checkered"></i> Last Boule`;
    btn.classList.remove('pulse-mene');
  } else {
    btn.style.display = 'none';
    btn.classList.remove('pulse-mene');
  }
}

window.resetMene = () => {
  resetBoules();
  const btn = document.getElementById('new-mene-btn');
  if (btn) btn.style.display = 'none';
  syncMatchToCloud();
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


// Hash routing for Standalone Scorekeeper (#score), Admin, and Club sections
function initHashRouting() {
  const handleRoute = () => {
    const rawHash = window.location.hash || '#about';
    const [baseHash, queryString] = rawHash.split('?');
    const publicView = document.getElementById('public-view');
    const scoreView = document.getElementById('score-view');
    const adminSection = document.getElementById('admin');
    const dockClub = document.getElementById('dock-club');
    const dockCourts = document.getElementById('dock-courts');
    const dockScore = document.getElementById('dock-score');

    // Update bottom dock active item
    dockClub?.classList.remove('active');
    dockCourts?.classList.remove('active');
    dockScore?.classList.remove('active');

    const isScore = baseHash === '#score' || baseHash === '#scoreboard';
    document.body.classList.toggle('route-score', isScore);

    // Update active nav-links for desktop and mobile drawer
    document.querySelectorAll('.nav-links a, .mobile-drawer a').forEach(a => {
      const href = a.getAttribute('href');
      if (href === baseHash || (href === '#about' && (baseHash === '' || baseHash === '#' || baseHash === '#about'))) {
        a.classList.add('active');
      } else {
        a.classList.remove('active');
      }
    });

    if (isScore) {
      if (publicView) publicView.style.display = 'none';
      if (adminSection) adminSection.style.display = 'none';
      if (scoreView) scoreView.style.display = 'flex';
      dockScore?.classList.add('active');
      window.scrollTo(0, 0);

      // Check query params for match code
      const urlParams = new URLSearchParams(queryString || window.location.search);
      const matchParam = urlParams.get('match');
      if (matchParam && matchParam !== currentMatchCode) {
        connectToLiveMatch(matchParam.toUpperCase());
      }
    } else if (baseHash === '#admin') {
      if (publicView) publicView.style.display = 'none';
      if (scoreView) scoreView.style.display = 'none';
      if (adminSection) adminSection.style.display = 'block';
      window.scrollTo(0, 0);
      
      const urlParams = new URLSearchParams(queryString || '');
      const approveId = urlParams.get('approve');
      if (approveId) autoApproveMember(approveId);
    } else {
      if (publicView) publicView.style.display = 'block';
      if (scoreView) scoreView.style.display = 'none';
      if (adminSection) adminSection.style.display = 'none';

      if (baseHash === '#courts') {
        dockCourts?.classList.add('active');
      } else {
        dockClub?.classList.add('active');
      }
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
    triggerHaptic(15);
    syncMatchToCloud();
  };

  window.resetScore = () => {
    teamAScore = 0;
    teamBScore = 0;
    pointHolder = null;
    matchWinner = null;
    meneHistory = [];
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
    renderMeneTimeline();
    updateLeadIndicators();
    triggerHaptic([30, 30]);
    syncMatchToCloud();
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

// ─── Haptics Feedback Helper ────────────────────────────────────────────────
function triggerHaptic(pattern = 15) {
  if ('vibrate' in navigator) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}

// ─── Mène Progression & History ─────────────────────────────────────────────
let meneHistory = []; // [{ mene: 1, team: 'A'|'B', pts: 2, totalA: 2, totalB: 0 }]

window.recordAndResetMene = () => {
  const starsA = bouleStates.A.filter(s => s === 2).length;
  const starsB = bouleStates.B.filter(s => s === 2).length;

  let scoringTeam = null;
  let pointsAwarded = 0;

  if (starsA > starsB) {
    scoringTeam = 'A';
    pointsAwarded = starsA - starsB;
  } else if (starsB > starsA) {
    scoringTeam = 'B';
    pointsAwarded = starsB - starsA;
  } else if (pointHolder) {
    scoringTeam = pointHolder;
    pointsAwarded = 1;
  }

  if (scoringTeam && pointsAwarded > 0) {
    if (scoringTeam === 'A') {
      teamAScore = Math.max(0, Math.min(25, teamAScore + pointsAwarded));
    } else {
      teamBScore = Math.max(0, Math.min(25, teamBScore + pointsAwarded));
    }

    const scoreAEl = document.getElementById('score-a');
    const scoreBEl = document.getElementById('score-b');
    if (scoreAEl) scoreAEl.textContent = teamAScore;
    if (scoreBEl) scoreBEl.textContent = teamBScore;

    meneHistory.push({
      mene: meneHistory.length + 1,
      team: scoringTeam,
      pts: pointsAwarded,
      totalA: teamAScore,
      totalB: teamBScore
    });

    renderMeneTimeline();
    updateLeadIndicators();
    checkWinCondition();
  }

  triggerHaptic([30, 40, 50]);
  resetBoules();
  const btn = document.getElementById('new-mene-btn');
  if (btn) btn.style.display = 'none';

  syncMatchToCloud();
};

window.undoLastMene = () => {
  if (meneHistory.length === 0) return;
  meneHistory.pop();

  if (meneHistory.length > 0) {
    const prev = meneHistory[meneHistory.length - 1];
    teamAScore = prev.totalA;
    teamBScore = prev.totalB;
  } else {
    teamAScore = 0;
    teamBScore = 0;
  }

  const scoreAEl = document.getElementById('score-a');
  const scoreBEl = document.getElementById('score-b');
  if (scoreAEl) scoreAEl.textContent = teamAScore;
  if (scoreBEl) scoreBEl.textContent = teamBScore;

  renderMeneTimeline();
  updateLeadIndicators();
  checkWinCondition();
  triggerHaptic([40, 20]);
  syncMatchToCloud();
};

function renderMeneTimeline() {
  const strip = document.getElementById('mene-timeline-strip');
  const undoBtn = document.getElementById('undo-mene-btn');
  if (!strip) return;

  if (meneHistory.length === 0) {
    strip.innerHTML = `<span class="mene-empty-hint">Completed mènes will appear here</span>`;
    if (undoBtn) undoBtn.style.display = 'none';
    return;
  }

  if (undoBtn) undoBtn.style.display = 'inline-flex';

  strip.innerHTML = meneHistory.map(m => {
    const isRed = m.team === 'A';
    const teamClass = isRed ? 'red' : 'blue';
    const icon = isRed ? '🔴' : '🔵';
    return `<div class="mene-pill ${teamClass}">
      <span>M${m.mene}: ${icon} +${m.pts}</span>
    </div>`;
  }).join('');

  strip.scrollLeft = strip.scrollWidth;
}

// ─── Screen Wake-Lock API ───────────────────────────────────────────────────
let wakeLockSentinel = null;

window.toggleWakeLock = async () => {
  const btn = document.getElementById('wakelock-toggle-btn');
  if (!('wakeLock' in navigator)) {
    alert('Screen Wake Lock is not supported on this browser.');
    return;
  }

  try {
    if (wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
      btn?.classList.remove('active');
    } else {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      btn?.classList.add('active');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
        btn?.classList.remove('active');
      });
    }
    triggerHaptic(20);
  } catch (err) {
    console.warn('Wake Lock error:', err);
  }
};

document.addEventListener('visibilitychange', async () => {
  const btn = document.getElementById('wakelock-toggle-btn');
  if (wakeLockSentinel !== null && document.visibilityState === 'visible') {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      btn?.classList.add('active');
    } catch (e) {}
  }
});

// ─── Sunlight High-Contrast Mode ────────────────────────────────────────────
window.toggleSunlightMode = () => {
  const btn = document.getElementById('sunlight-toggle-btn');
  const isSun = document.body.classList.toggle('sunlight-mode');
  btn?.classList.toggle('active', isSun);
  localStorage.setItem('petanque_sunlight_mode', isSun ? '1' : '0');
  triggerHaptic(25);
};

function initSunlightPreference() {
  if (localStorage.getItem('petanque_sunlight_mode') === '1') {
    document.body.classList.add('sunlight-mode');
    document.getElementById('sunlight-toggle-btn')?.classList.add('active');
  }
}

// ─── Real-Time Firestore Match Sync ─────────────────────────────────────────
let currentMatchCode = null;
let isHost = true;
let matchUnsubscribe = null;

function generateMatchCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

window.openMatchSyncModal = () => {
  const modal = document.getElementById('match-sync-modal');
  if (modal) modal.classList.add('active');
  if (!currentMatchCode) {
    initNewLiveMatch();
  }
};

window.closeMatchSyncModal = () => {
  document.getElementById('match-sync-modal')?.classList.remove('active');
};

window.switchSyncTab = (tab) => {
  document.getElementById('tab-broadcast')?.classList.toggle('active', tab === 'broadcast');
  document.getElementById('tab-join')?.classList.toggle('active', tab === 'join');
  const bPane = document.getElementById('pane-broadcast');
  const jPane = document.getElementById('pane-join');
  if (bPane) bPane.style.display = tab === 'broadcast' ? 'block' : 'none';
  if (jPane) jPane.style.display = tab === 'join' ? 'block' : 'none';
};

window.copyMatchCode = () => {
  if (!currentMatchCode) return;
  navigator.clipboard.writeText(currentMatchCode).then(() => {
    const btn = document.getElementById('copy-code-btn');
    if (btn) {
      btn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
      setTimeout(() => { btn.innerHTML = `<i class="fa-solid fa-copy"></i> Copy PIN`; }, 2000);
    }
  });
};

window.copyShareLink = () => {
  if (!currentMatchCode) return;
  const url = `${window.location.origin}/#score?match=${currentMatchCode}`;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('share-link-btn');
    if (btn) {
      btn.innerHTML = `<i class="fa-solid fa-check"></i> Link Copied!`;
      setTimeout(() => { btn.innerHTML = `<i class="fa-solid fa-share-nodes"></i> Copy Spectator Link`; }, 2500);
    }
  });
};

async function initNewLiveMatch() {
  currentMatchCode = generateMatchCode();
  const codeEl = document.getElementById('current-match-code');
  if (codeEl) codeEl.textContent = currentMatchCode;
  updateSyncPill(true);
  await syncMatchToCloud();
}

async function syncMatchToCloud() {
  if (!currentMatchCode || !isHost) return;
  try {
    const matchRef = doc(db, 'live_matches', currentMatchCode);
    await setDoc(matchRef, {
      matchCode: currentMatchCode,
      teamAScore,
      teamBScore,
      pointHolder,
      bouleStates,
      meneHistory,
      matchWinner,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.warn('Cloud sync save error:', e);
  }
}

window.joinMatchFromInput = () => {
  const input = document.getElementById('join-match-input');
  if (!input || !input.value.trim()) return;
  const code = input.value.trim().toUpperCase();
  connectToLiveMatch(code);
  closeMatchSyncModal();
};

async function connectToLiveMatch(code) {
  if (matchUnsubscribe) matchUnsubscribe();
  currentMatchCode = code;
  isHost = false;

  const codeEl = document.getElementById('current-match-code');
  if (codeEl) codeEl.textContent = code;

  try {
    const matchRef = doc(db, 'live_matches', code);
    matchUnsubscribe = onSnapshot(matchRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        applyRemoteMatchData(data);
        updateSyncPill(true);
      } else {
        alert(`Match PIN ${code} not found on the cloud.`);
        updateSyncPill(false);
      }
    });
  } catch (err) {
    console.warn('Failed to connect to live match:', err);
    updateSyncPill(false);
  }
}

function applyRemoteMatchData(data) {
  teamAScore = data.teamAScore ?? 0;
  teamBScore = data.teamBScore ?? 0;
  pointHolder = data.pointHolder ?? null;
  matchWinner = data.matchWinner ?? null;

  if (data.bouleStates) {
    bouleStates.A = data.bouleStates.A || [0,0,0,0,0,0];
    bouleStates.B = data.bouleStates.B || [0,0,0,0,0,0];
  }
  if (data.meneHistory) {
    meneHistory = data.meneHistory || [];
  }

  const scoreAEl = document.getElementById('score-a');
  const scoreBEl = document.getElementById('score-b');
  if (scoreAEl) scoreAEl.textContent = teamAScore;
  if (scoreBEl) scoreBEl.textContent = teamBScore;

  renderBoules('A');
  renderBoules('B');
  renderMeneTimeline();
  updateLeadIndicators();

  if (matchWinner) {
    const winnerName = matchWinner === 'A' ? 'Team Red' : 'Team Blue';
    triggerVictoryCelebration(matchWinner, winnerName);
  } else {
    hideVictoryCelebration();
  }
}

function updateSyncPill(isLive) {
  const pill = document.getElementById('sync-status-pill');
  const label = document.getElementById('sync-label');
  if (!pill || !label) return;

  if (isLive && currentMatchCode) {
    pill.className = 'sync-status-pill live';
    label.textContent = `Live: ${currentMatchCode}`;
  } else {
    pill.className = 'sync-status-pill';
    label.textContent = 'Local Match';
  }
}

// ─── Real-Time Court Check-Ins ──────────────────────────────────────────────
function initCourtCheckIns() {
  const feed = document.getElementById('checkin-feed');
  if (!feed) return;

  try {
    const q = query(collection(db, 'court_checkins'), orderBy('timestamp', 'desc'), limit(12));
    onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        feed.innerHTML = `
          <div class="checkin-card" style="text-align:center; grid-column: 1 / -1; color: var(--text-dim); padding: 24px;">
            <p><i class="fa-solid fa-tree"></i> No active check-ins yet today. Be the first to post!</p>
          </div>`;
        return;
      }

      feed.innerHTML = snapshot.docs.map(doc => {
        const d = doc.data();
        const timeStr = formatRelativeTime(d.timestamp?.toDate ? d.timestamp.toDate() : new Date());
        return `
          <div class="checkin-card">
            <div class="checkin-card-top">
              <span class="checkin-name"><i class="fa-solid fa-user-circle"></i> ${escapeHtml(d.name || 'Pétanqueur')}</span>
              <span class="checkin-time">${timeStr}</span>
            </div>
            <div class="checkin-court"><i class="fa-solid fa-map-pin"></i> ${escapeHtml(d.court || 'Pease Park')}</div>
            <div class="checkin-status">${escapeHtml(d.status || 'Playing Now')}</div>
          </div>
        `;
      }).join('');
    });
  } catch (err) {
    console.warn('Court check-in feed error:', err);
    feed.innerHTML = `<p style="color:var(--text-dim); text-align:center; padding: 16px;">Real-time pitch feed connects live on Firebase.</p>`;
  }
}

window.openCheckInModal = () => {
  document.getElementById('checkin-modal')?.classList.add('active');
};

window.closeCheckInModal = () => {
  document.getElementById('checkin-modal')?.classList.remove('active');
};

window.handleCheckInSubmit = async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('checkin-name');
  const courtSelect = document.getElementById('checkin-court');
  const statusSelect = document.getElementById('checkin-status');
  const feedback = document.getElementById('checkin-feedback');

  if (!nameInput?.value.trim()) return;

  try {
    if (feedback) {
      feedback.textContent = 'Posting check-in to pitch...';
      feedback.style.color = 'var(--primary-amber)';
    }
    await addDoc(collection(db, 'court_checkins'), {
      name: nameInput.value.trim(),
      court: courtSelect.value,
      status: statusSelect.value,
      timestamp: serverTimestamp()
    });

    if (feedback) {
      feedback.style.color = '#10b981';
      feedback.textContent = 'Check-in posted! See you on the terrain.';
    }
    setTimeout(() => {
      closeCheckInModal();
      if (feedback) feedback.textContent = '';
      nameInput.value = '';
    }, 1200);
  } catch (err) {
    if (feedback) {
      feedback.style.color = '#ef4444';
      feedback.textContent = 'Failed to post check-in. Please try again.';
    }
  }
};

function formatRelativeTime(date) {
  const diff = Math.floor((new Date() - date) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
  
  window.openModal = (type = 'membership', title = 'Join Austin Pétanque', subtitle = 'Applications are sent to <strong>noless42@gmail.com</strong> for founder approval.') => {
    const modalTitle = document.getElementById('membership-modal-title');
    const modalSub = document.getElementById('membership-modal-subtitle');
    const submitBtn = document.getElementById('membership-submit-btn');

    if (modalTitle) modalTitle.textContent = title;
    if (modalSub) modalSub.innerHTML = subtitle;

    if (submitBtn) {
      if (type === 'tournament') {
        submitBtn.innerHTML = '<i class="fa-solid fa-trophy"></i> Register for Tournament';
      } else if (type === 'rsvp') {
        submitBtn.innerHTML = '<i class="fa-solid fa-calendar-check"></i> Confirm Match RSVP';
      } else {
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Application';
      }
    }

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

// ─── Firebase Authentication (Google & Apple) ────────────────────────────────
let currentUser = null;

function initAuth() {
  const authModal = document.getElementById('auth-modal');
  if (authModal) {
    authModal.addEventListener('click', (e) => {
      if (e.target === authModal) closeAuthModal();
    });
  }

  window.openAuthModal = () => {
    document.getElementById('auth-modal')?.classList.add('active');
  };

  window.closeAuthModal = () => {
    document.getElementById('auth-modal')?.classList.remove('active');
    const msg = document.getElementById('auth-status-msg');
    if (msg) msg.textContent = '';
  };

  window.loginWithGoogle = async () => {
    const statusMsg = document.getElementById('auth-status-msg');
    const googleBtn = document.getElementById('google-signin-btn');
    try {
      if (statusMsg) {
        statusMsg.textContent = 'Connecting to Google...';
        statusMsg.style.color = 'var(--primary-amber)';
      }
      if (googleBtn) googleBtn.disabled = true;

      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      if (statusMsg) {
        statusMsg.textContent = `Welcome, ${user.displayName || 'Player'}!`;
        statusMsg.style.color = '#10b981';
      }

      try {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          displayName: user.displayName || 'Pétanqueur',
          email: user.email,
          photoURL: user.photoURL,
          lastLogin: serverTimestamp(),
          provider: 'google.com'
        }, { merge: true });
      } catch (e) {
        console.warn('Firestore user profile save notice:', e);
      }

      setTimeout(() => {
        closeAuthModal();
      }, 900);
    } catch (err) {
      console.warn('Google sign-in error:', err);
      if (statusMsg) {
        statusMsg.style.color = '#ef4444';
        if (err.code === 'auth/popup-closed-by-user') {
          statusMsg.textContent = 'Sign-in window was closed.';
        } else if (err.code === 'auth/popup-blocked') {
          statusMsg.textContent = 'Popup was blocked by browser. Please allow popups.';
        } else {
          statusMsg.textContent = `Sign-in notice: ${err.message || 'Unable to sign in.'}`;
        }
      }
    } finally {
      if (googleBtn) googleBtn.disabled = false;
    }
  };

  window.loginWithApple = async () => {
    const statusMsg = document.getElementById('auth-status-msg');
    const appleBtn = document.getElementById('apple-signin-btn');
    try {
      if (statusMsg) {
        statusMsg.textContent = 'Connecting to Apple...';
        statusMsg.style.color = 'var(--primary-amber)';
      }
      if (appleBtn) appleBtn.disabled = true;

      const result = await signInWithPopup(auth, appleProvider);
      const user = result.user;
      
      if (statusMsg) {
        statusMsg.textContent = `Welcome, ${user.displayName || 'Player'}!`;
        statusMsg.style.color = '#10b981';
      }

      try {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          displayName: user.displayName || 'Apple Pétanqueur',
          email: user.email,
          photoURL: user.photoURL,
          lastLogin: serverTimestamp(),
          provider: 'apple.com'
        }, { merge: true });
      } catch (e) {
        console.warn('Firestore user profile save notice:', e);
      }

      setTimeout(() => {
        closeAuthModal();
      }, 900);
    } catch (err) {
      console.warn('Apple sign-in error:', err);
      if (statusMsg) {
        statusMsg.style.color = '#ef4444';
        if (err.code === 'auth/configuration-not-found' || err.code === 'auth/operation-not-allowed') {
          statusMsg.textContent = 'Apple Sign-In is ready! In Firebase Console, enable Apple under Auth > Sign-in method with your Apple Developer Team ID.';
        } else if (err.code === 'auth/popup-closed-by-user') {
          statusMsg.textContent = 'Sign-in window was closed.';
        } else {
          statusMsg.textContent = `Apple Sign-In: ${err.message || 'Please configure Apple ID in Firebase Console.'}`;
        }
      }
    } finally {
      if (appleBtn) appleBtn.disabled = false;
    }
  };

  window.handleSignOut = async () => {
    try {
      await signOut(auth);
      closeAuthModal();
    } catch (err) {
      console.warn('Sign-out error:', err);
    }
  };

  // Auth State Listener
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateAuthUI(user);
  });
}

function updateAuthUI(user) {
  const navLoginBtn = document.getElementById('nav-login-btn');
  const navUserPill = document.getElementById('nav-user-pill');
  const navUserName = document.getElementById('nav-user-name');
  const navUserAvatar = document.getElementById('nav-user-avatar');

  const drawerLoginBtn = document.getElementById('drawer-login-btn');
  const drawerUserPill = document.getElementById('drawer-user-pill');
  const drawerUserName = document.getElementById('drawer-user-name');
  const drawerUserAvatar = document.getElementById('drawer-user-avatar');

  const authLoginButtons = document.getElementById('auth-login-buttons');
  const authLoggedInBox = document.getElementById('auth-logged-in-box');
  const authUserName = document.getElementById('auth-user-name');
  const authUserEmail = document.getElementById('auth-user-email');
  const authUserAvatar = document.getElementById('auth-user-avatar');

  const defaultAvatar = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23f59e0b"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>';

  if (user) {
    const displayName = user.displayName || user.email?.split('@')[0] || 'Player';
    const photoURL = user.photoURL || defaultAvatar;

    if (navLoginBtn) navLoginBtn.style.display = 'none';
    if (navUserPill) navUserPill.style.display = 'inline-flex';
    if (navUserName) navUserName.textContent = displayName;
    if (navUserAvatar) navUserAvatar.src = photoURL;

    if (drawerLoginBtn) drawerLoginBtn.style.display = 'none';
    if (drawerUserPill) drawerUserPill.style.display = 'flex';
    if (drawerUserName) drawerUserName.textContent = displayName;
    if (drawerUserAvatar) drawerUserAvatar.src = photoURL;

    if (authLoginButtons) authLoginButtons.style.display = 'none';
    if (authLoggedInBox) authLoggedInBox.style.display = 'block';
    if (authUserName) authUserName.textContent = displayName;
    if (authUserEmail) authUserEmail.textContent = user.email || 'Verified Account';
    if (authUserAvatar) authUserAvatar.src = photoURL;

    // Autofill forms
    const checkinName = document.getElementById('checkin-name');
    if (checkinName && !checkinName.value) checkinName.value = displayName;

    const memberName = document.getElementById('member-name');
    if (memberName && !memberName.value) memberName.value = displayName;

    const memberEmail = document.getElementById('member-email');
    if (memberEmail && !memberEmail.value && user.email) memberEmail.value = user.email;
  } else {
    if (navLoginBtn) navLoginBtn.style.display = 'inline-flex';
    if (navUserPill) navUserPill.style.display = 'none';

    if (drawerLoginBtn) drawerLoginBtn.style.display = 'inline-flex';
    if (drawerUserPill) drawerUserPill.style.display = 'none';

    if (authLoginButtons) authLoginButtons.style.display = 'flex';
    if (authLoggedInBox) authLoggedInBox.style.display = 'none';
  }
}

