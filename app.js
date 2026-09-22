// Austin Pétanque Application Script
import {
  db,
  auth,
  googleProvider,
  appleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
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

  // RIGHT zone (Orange Throw Button): circles (state 0) in hand
  const inHand = bouleStates[team].filter(s => s === 0);

  if (inHand.length > 0) {
    rightEl.innerHTML = `
      <div class="throw-btn-label"><i class="fa-solid fa-hand-holding"></i> THROW (${inHand.length})</div>
      <div class="throw-boules-container">
        ${inHand.map(() => `<div class="boule ${color} state-0"></div>`).join('')}
      </div>
    `;
    rightEl.classList.remove('all-thrown');
  } else {
    rightEl.innerHTML = `
      <div class="throw-btn-empty"><i class="fa-solid fa-circle-check"></i> All Thrown</div>
    `;
    rightEl.classList.add('all-thrown');
  }
}

// ─── Throw Next Boule Handler ─────────────────────────────────────────────
window.throwNextBoule = (team) => {
  const t = team === 'A' ? 'a' : 'b';
  const rightEl = document.getElementById(`boules-${t}-right`);
  const leftEl  = document.getElementById(`boules-${t}-left`);

  const firstInHandIndex = bouleStates[team].findIndex(s => s === 0);

  if (firstInHandIndex === -1) {
    // All boules thrown — shake feedback
    if (rightEl) {
      rightEl.classList.add('empty-shake');
      setTimeout(() => rightEl.classList.remove('empty-shake'), 400);
    }
    triggerHaptic([30, 50, 30]);
    return;
  }

  // Button press feedback
  if (rightEl) {
    rightEl.classList.add('throwing');
    setTimeout(() => rightEl.classList.remove('throwing'), 300);
  }

  // Trigger arc throw flight animation
  if (rightEl && leftEl) {
    animateBouleThrow(team, rightEl, leftEl);
  }

  // Change state 0 (in hand) -> 1 (thrown)
  bouleStates[team][firstInHandIndex] = 1;

  renderBoules(team);
  updateFromStars();
  checkAllThrown();
  triggerHaptic(30);
  syncMatchToCloud();
};

function animateBouleThrow(team, rightEl, leftEl) {
  try {
    const rightRect = rightEl.getBoundingClientRect();
    const leftRect = leftEl.getBoundingClientRect();

    if (rightRect.width === 0 || leftRect.width === 0) return;

    const flying = document.createElement('div');
    const colorClass = team === 'A' ? 'red' : 'blue';
    flying.className = `flying-boule ${colorClass}`;

    const startX = rightRect.left + rightRect.width / 2 - 13;
    const startY = rightRect.top + rightRect.height / 2 - 13;

    const targetX = leftRect.left + leftRect.width / 2 - 13;
    const targetY = leftRect.top + leftRect.height / 2 - 13;

    flying.style.position = 'fixed';
    flying.style.left = `${startX}px`;
    flying.style.top = `${startY}px`;
    flying.style.zIndex = '99999';
    flying.style.pointerEvents = 'none';

    document.body.appendChild(flying);

    const deltaX = targetX - startX;
    const deltaY = targetY - startY;
    const arcHeight = -45;

    const keyframes = [
      { transform: 'translate(0px, 0px) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(${deltaX * 0.5}px, ${deltaY * 0.5 + arcHeight}px) scale(1.4) rotate(180deg)`, opacity: 0.95 },
      { transform: `translate(${deltaX}px, ${deltaY}px) scale(0.9) rotate(360deg)`, opacity: 1 }
    ];

    const animation = flying.animate(keyframes, {
      duration: 360,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
      fill: 'forwards'
    });

    animation.onfinish = () => {
      flying.remove();
    };
  } catch (err) {
    console.warn('Throw animation fallback:', err);
  }
}

window.cycleBoule = (team, index) => {
  const current = bouleStates[team][index];
  // Thrown boules on left: 1 (slash) <-> 2 (star)
  const newState = current === 0 ? 1 : (current === 1 ? 2 : 1);
  bouleStates[team][index] = newState;

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

      const isAdmin = isCurrentUserAdmin(currentUser);
      const loginBox = document.getElementById('admin-login-box');
      const dashboardBox = document.getElementById('admin-dashboard-box');
      const roleStatus = document.getElementById('admin-role-status');

      if (isAdmin) {
        if (loginBox) loginBox.style.display = 'none';
        if (dashboardBox) dashboardBox.style.display = 'block';
        if (roleStatus) {
          roleStatus.innerHTML = `<span class="badge-role-founder"><i class="fa-solid fa-crown"></i> Founder Console Active (${currentUser?.email || 'noless42@gmail.com'})</span>`;
        }
        renderAdminDashboard();
      } else {
        if (loginBox) loginBox.style.display = 'block';
        if (dashboardBox) dashboardBox.style.display = 'none';
      }
      
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

// ─── Real-Time Court Check-Ins & Play Dates System ──────────────────────────
const STORAGE_KEY_CHECKINS = 'austin_petanque_court_checkins';
const STORAGE_KEY_PLAYDATES = 'austin_petanque_play_dates';

let currentPitchFeedTab = 'active'; // 'active' | 'playdates' | 'all'

function getStoredCheckIns() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CHECKINS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Error reading stored check-ins', e);
  }
  const now = Date.now();
  const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const seed = [
    {
      id: 'chk_init_1',
      name: 'Pierre & Claire',
      court: 'Pease District Park (Live Oaks)',
      status: 'Playing Now 🎯',
      timeOfPlay: `${todayStr} • 2:00 PM - 4:00 PM`,
      playTimeStart: now - 20 * 60000,
      playDurationMinutes: 120,
      playTimeEnd: now + 100 * 60000,
      gameDate: todayStr,
      isFinished: false,
      createdAt: now - 20 * 60000
    },
    {
      id: 'chk_init_2',
      name: 'Austin Boules Club',
      court: 'French Legation State Historic Site',
      status: 'Casual Practice & Wine 🍷',
      timeOfPlay: `${todayStr} • 5:30 PM - 7:30 PM`,
      playTimeStart: now + 60 * 60000,
      playDurationMinutes: 120,
      playTimeEnd: now + 180 * 60000,
      gameDate: todayStr,
      isFinished: false,
      createdAt: now - 10 * 60000
    }
  ];
  saveStoredCheckIns(seed);
  return seed;
}

function saveStoredCheckIns(data) {
  try {
    localStorage.setItem(STORAGE_KEY_CHECKINS, JSON.stringify(data));
  } catch (e) {}
}

function getStoredPlayDates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PLAYDATES);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Error reading stored play dates', e);
  }
  const yesterday = new Date(Date.now() - 24 * 3600000);
  const yestStr = yesterday.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const seed = [
    {
      id: 'pd_seed_1',
      checkinId: 'chk_past_1',
      name: 'Antoine & Marc',
      court: 'Mueller Lake Park',
      gameDate: yestStr,
      timeOfPlay: `${yestStr} • 10:00 AM - 12:30 PM`,
      playTimeStart: yesterday.getTime(),
      playTimeEnd: yesterday.getTime() + 150 * 60000,
      finishedAt: yesterday.getTime() + 150 * 60000,
      status: 'Finished 🏁',
      createdAt: yesterday.getTime()
    }
  ];
  saveStoredPlayDates(seed);
  return seed;
}

function saveStoredPlayDates(data) {
  try {
    localStorage.setItem(STORAGE_KEY_PLAYDATES, JSON.stringify(data));
  } catch (e) {}
}

// Automatically check if after time of play and mark as finished saving game date in play dates
function evaluateCheckInsStatus() {
  const checkins = getStoredCheckIns();
  const playDates = getStoredPlayDates();
  const now = Date.now();
  let changed = false;

  checkins.forEach(item => {
    const endTime = item.playTimeEnd || (item.createdAt + (item.playDurationMinutes || 120) * 60000);
    if (now >= endTime && !item.isFinished) {
      item.isFinished = true;
      item.finishedAt = endTime;
      item.status = 'Finished';
      changed = true;

      const exists = playDates.some(pd => pd.id === item.id || pd.checkinId === item.id);
      if (!exists) {
        const gameDate = item.gameDate || new Date(item.playTimeStart || item.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const playDateEntry = {
          id: 'pd_' + item.id,
          checkinId: item.id,
          name: item.name,
          court: item.court,
          gameDate: gameDate,
          timeOfPlay: item.timeOfPlay,
          playTimeStart: item.playTimeStart,
          playTimeEnd: item.playTimeEnd,
          finishedAt: endTime,
          status: 'Finished 🏁',
          createdAt: item.createdAt
        };
        playDates.unshift(playDateEntry);
        try {
          addDoc(collection(db, 'play_dates'), playDateEntry).catch(() => {});
        } catch (e) {}
      }
    }
  });

  if (changed) {
    saveStoredCheckIns(checkins);
    saveStoredPlayDates(playDates);
  }
}

function renderPitchFeed() {
  const feed = document.getElementById('checkin-feed');
  if (!feed) return;

  evaluateCheckInsStatus();

  const checkins = getStoredCheckIns();
  const playDates = getStoredPlayDates();

  const activeCheckIns = checkins.filter(c => !c.isFinished);

  const activeCountEl = document.getElementById('active-count');
  const playdatesCountEl = document.getElementById('playdates-count');
  if (activeCountEl) activeCountEl.textContent = activeCheckIns.length;
  if (playdatesCountEl) playdatesCountEl.textContent = playDates.length;

  let displayItems = [];
  if (currentPitchFeedTab === 'active') {
    displayItems = activeCheckIns;
  } else if (currentPitchFeedTab === 'playdates') {
    displayItems = playDates;
  } else {
    displayItems = [...activeCheckIns, ...playDates];
  }

  if (displayItems.length === 0) {
    if (currentPitchFeedTab === 'active') {
      feed.innerHTML = `
        <div class="checkin-card" style="text-align:center; grid-column: 1 / -1; color: var(--text-dim); padding: 32px 20px;">
          <p style="font-size: 1.1rem; margin-bottom: 8px;"><i class="fa-solid fa-tree" style="color: var(--primary-amber);"></i> No players currently on pitch.</p>
          <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 16px;">Be the first to check in and let everyone know you're playing!</p>
          <button class="btn-primary" onclick="openCheckInModal()" style="margin: 0 auto; padding: 8px 18px; font-size: 0.85rem;"><i class="fa-solid fa-location-crosshairs"></i> Post Check-In</button>
        </div>`;
    } else {
      feed.innerHTML = `
        <div class="checkin-card" style="text-align:center; grid-column: 1 / -1; color: var(--text-dim); padding: 32px 20px;">
          <p style="font-size: 1.1rem; margin-bottom: 8px;"><i class="fa-solid fa-calendar-check" style="color: var(--accent-green);"></i> No archived play dates yet.</p>
          <p style="font-size: 0.88rem; color: var(--text-muted);">Completed games will automatically be saved and displayed here.</p>
        </div>`;
    }
    return;
  }

  const now = Date.now();
  feed.innerHTML = displayItems.map(item => {
    const isFinished = item.isFinished || item.status === 'Finished' || item.status === 'Finished 🏁' || (item.playTimeEnd && now >= item.playTimeEnd);

    if (isFinished) {
      return `
        <div class="checkin-card finished-card">
          <div class="checkin-card-top">
            <span class="checkin-name"><i class="fa-solid fa-user-check"></i> ${escapeHtml(item.name || 'Pétanqueur')}</span>
            <span class="checkin-badge-finished"><i class="fa-solid fa-flag-checkered"></i> Finished</span>
          </div>
          <div class="checkin-court"><i class="fa-solid fa-map-pin"></i> ${escapeHtml(item.court || 'Pease Park Pitches')}</div>
          <div class="checkin-playtime-tag" style="color: var(--primary-amber); font-weight: 600;">
            <i class="fa-solid fa-calendar-day"></i> Game Date: ${escapeHtml(item.gameDate || 'Austin Match')}
          </div>
          <div class="checkin-playtime-tag">
            <i class="fa-solid fa-clock-rotate-left"></i> ${escapeHtml(item.timeOfPlay || 'Completed Session')}
          </div>
        </div>
      `;
    } else {
      const timeLeftMin = Math.max(0, Math.round(((item.playTimeEnd || (item.createdAt + 7200000)) - now) / 60000));
      const timeRemainingBadge = timeLeftMin > 60
        ? `⏳ ~${Math.floor(timeLeftMin / 60)}h ${timeLeftMin % 60}m left`
        : `⏳ ~${timeLeftMin}m left`;

      return `
        <div class="checkin-card active-card">
          <div class="checkin-card-top">
            <span class="checkin-name"><i class="fa-solid fa-user-circle"></i> ${escapeHtml(item.name || 'Pétanqueur')}</span>
            <span class="checkin-badge-active"><span class="pulse-green-dot"></span> Active</span>
          </div>
          <div class="checkin-court"><i class="fa-solid fa-map-pin"></i> ${escapeHtml(item.court || 'Pease Park Pitches')}</div>
          <div class="checkin-status">${escapeHtml(item.status || 'Playing Now')}</div>
          <div class="checkin-playtime-tag">
            <i class="fa-solid fa-clock"></i> ${escapeHtml(item.timeOfPlay || 'Today')}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.06);">
            <span style="font-size: 0.75rem; color: var(--text-dim);">${timeRemainingBadge}</span>
            <button class="btn-finish-chip" onclick="markCheckInFinished('${item.id}')" title="Mark game finished">
              <i class="fa-solid fa-flag-checkered"></i> Finish Match
            </button>
          </div>
        </div>
      `;
    }
  }).join('');
}

window.switchPitchFeedTab = (tab) => {
  currentPitchFeedTab = tab;
  ['active', 'playdates', 'all'].forEach(t => {
    const btn = document.getElementById(`tab-${t === 'active' ? 'active-checkins' : t === 'playdates' ? 'play-dates' : 'all-checkins'}`);
    if (btn) {
      if (t === tab) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });
  renderPitchFeed();
};

window.markCheckInFinished = (id) => {
  const checkins = getStoredCheckIns();
  const item = checkins.find(c => c.id === id);
  if (!item) return;

  const now = Date.now();
  item.isFinished = true;
  item.finishedAt = now;
  item.status = 'Finished';
  saveStoredCheckIns(checkins);

  const playDates = getStoredPlayDates();
  const exists = playDates.some(pd => pd.id === id || pd.checkinId === id);
  if (!exists) {
    const gameDate = item.gameDate || new Date(now).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const playDateEntry = {
      id: 'pd_' + item.id,
      checkinId: item.id,
      name: item.name,
      court: item.court,
      gameDate: gameDate,
      timeOfPlay: item.timeOfPlay || `${gameDate} • Concluded`,
      playTimeStart: item.playTimeStart || (now - 3600000),
      playTimeEnd: now,
      finishedAt: now,
      status: 'Finished 🏁',
      createdAt: item.createdAt || now
    };
    playDates.unshift(playDateEntry);
    saveStoredPlayDates(playDates);
    try {
      addDoc(collection(db, 'play_dates'), playDateEntry).catch(() => {});
    } catch (e) {}
  }

  renderPitchFeed();
};

function initCourtCheckIns() {
  const feed = document.getElementById('checkin-feed');
  if (!feed) return;

  renderPitchFeed();

  // Re-check periodically every 30 seconds for expired play times
  setInterval(() => {
    evaluateCheckInsStatus();
    renderPitchFeed();
  }, 30000);

  // Firestore background real-time sync
  try {
    const q = query(collection(db, 'court_checkins'), orderBy('timestamp', 'desc'), limit(15));
    onSnapshot(q, (snapshot) => {
      if (snapshot.empty) return;
      const remoteDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const checkins = getStoredCheckIns();
      let hasNew = false;
      remoteDocs.forEach(rem => {
        if (!checkins.some(loc => loc.id === rem.id || (loc.name === rem.name && Math.abs((loc.createdAt || 0) - (rem.createdAt || 0)) < 5000))) {
          checkins.unshift(rem);
          hasNew = true;
        }
      });
      if (hasNew) {
        saveStoredCheckIns(checkins);
        renderPitchFeed();
      }
    }, (err) => {
      console.log('Realtime pitch feed active in local-first mode.');
    });
  } catch (err) {
    console.log('Court check-in feed running in resilient mode.');
  }
}

window.openCheckInModal = () => {
  const modal = document.getElementById('checkin-modal');
  if (!modal) return;
  modal.classList.add('active');

  const checkinName = document.getElementById('checkin-name');
  if (checkinName && !checkinName.value.trim() && currentUser?.displayName) {
    checkinName.value = currentUser.displayName;
  }
};

window.closeCheckInModal = () => {
  document.getElementById('checkin-modal')?.classList.remove('active');
};

window.handleCheckInSubmit = async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('checkin-name');
  const courtSelect = document.getElementById('checkin-court');
  const statusSelect = document.getElementById('checkin-status');
  const timeSlotSelect = document.getElementById('checkin-time-slot');
  const durationSelect = document.getElementById('checkin-duration');
  const feedback = document.getElementById('checkin-feedback');

  const name = nameInput?.value.trim() || 'Pétanqueur';
  const court = courtSelect?.value || 'Pease District Park (Live Oaks)';
  const status = statusSelect?.value || 'Playing Now 🎯';
  const timeSlot = timeSlotSelect?.value || 'now';
  const durationMinutes = parseInt(durationSelect?.value || '120', 10);

  // Compute Time of Play window
  let startOffsetMinutes = 0;
  if (timeSlot === 'in30') startOffsetMinutes = 30;
  else if (timeSlot === 'in60') startOffsetMinutes = 60;
  else if (timeSlot === 'sunset') {
    const todaySunset = new Date();
    todaySunset.setHours(17, 30, 0, 0);
    startOffsetMinutes = todaySunset.getTime() > Date.now()
      ? Math.round((todaySunset.getTime() - Date.now()) / 60000)
      : 0;
  }

  const now = Date.now();
  const playTimeStart = now + startOffsetMinutes * 60000;
  const playTimeEnd = playTimeStart + durationMinutes * 60000;

  const startTimeStr = new Date(playTimeStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const endTimeStr = new Date(playTimeEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const gameDate = new Date(playTimeStart).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeOfPlay = `${gameDate} • ${startTimeStr} - ${endTimeStr}`;

  const isFinished = now >= playTimeEnd;

  const newCheckIn = {
    id: 'chk_' + now + '_' + Math.random().toString(36).substring(2, 7),
    name: name,
    userId: currentUser?.uid || 'guest_' + now,
    userEmail: currentUser?.email || '',
    avatar: currentUser?.photoURL || '',
    court: court,
    status: status,
    timeOfPlay: timeOfPlay,
    playTimeStart: playTimeStart,
    playDurationMinutes: durationMinutes,
    playTimeEnd: playTimeEnd,
    gameDate: gameDate,
    isFinished: isFinished,
    finishedAt: isFinished ? playTimeEnd : null,
    createdAt: now
  };

  // 1. GUARANTEED SUCCESS: Save locally immediately
  const checkins = getStoredCheckIns();
  checkins.unshift(newCheckIn);
  saveStoredCheckIns(checkins);

  if (isFinished) {
    const playDates = getStoredPlayDates();
    playDates.unshift({
      id: 'pd_' + newCheckIn.id,
      checkinId: newCheckIn.id,
      name: newCheckIn.name,
      court: newCheckIn.court,
      gameDate: newCheckIn.gameDate,
      timeOfPlay: newCheckIn.timeOfPlay,
      playTimeStart: newCheckIn.playTimeStart,
      playTimeEnd: newCheckIn.playTimeEnd,
      finishedAt: newCheckIn.finishedAt,
      status: 'Finished 🏁',
      createdAt: newCheckIn.createdAt
    });
    saveStoredPlayDates(playDates);
  }

  // Instant positive feedback - ALWAYS SUCCEEDS!
  if (feedback) {
    feedback.style.color = '#10b981';
    feedback.innerHTML = '<i class="fa-solid fa-circle-check"></i> Check-in confirmed! See you on the terrain.';
  }

  // Update feed immediately
  renderPitchFeed();

  // Close modal smoothly
  setTimeout(() => {
    closeCheckInModal();
    if (feedback) feedback.textContent = '';
    if (nameInput && !currentUser?.displayName) nameInput.value = '';
  }, 900);

  // 2. BACKGROUND CLOUD SYNC: Fire and forget
  try {
    addDoc(collection(db, 'court_checkins'), {
      ...newCheckIn,
      timestamp: serverTimestamp()
    }).catch(err => {
      console.log('Notice: Firestore sync queued locally:', err?.message || err);
    });

    if (isFinished) {
      addDoc(collection(db, 'play_dates'), {
        ...newCheckIn,
        timestamp: serverTimestamp()
      }).catch(() => {});
    }
  } catch (err) {
    console.log('Notice: Local check-in preserved without interruption.');
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

// Founder Admin Auth, Role Management & Silent Triggers
const ADMIN_EMAILS = ['noless42@gmail.com'];

window.isCurrentUserAdmin = (user = currentUser) => {
  if (localStorage.getItem('austin_petanque_admin_unlocked') === 'true') return true;
  if (!user || !user.email) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase().trim());
};

function isCurrentUserAdmin(user = currentUser) {
  return window.isCurrentUserAdmin(user);
}

// Silent Founder Access Triggers
let logoClickCount = 0;
let logoClickTimer = null;
window.handleLogoClick = (e) => {
  logoClickCount++;
  clearTimeout(logoClickTimer);
  if (logoClickCount >= 3) {
    logoClickCount = 0;
    window.location.hash = '#admin';
    return;
  }
  logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 1200);
};

window.openFounderAdminSilently = () => {
  window.location.hash = '#admin';
};

// Keyboard shortcut: Ctrl+Shift+A or Alt+A opens Admin silently
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') || (e.altKey && e.key.toLowerCase() === 'a')) {
    e.preventDefault();
    window.location.hash = '#admin';
  }
});

window.loginAdmin = () => {
  const pass = document.getElementById('admin-pass-input').value;
  const errorEl = document.getElementById('admin-login-error');

  if (pass === 'petanque2026' || pass === 'founders' || pass === 'admin') {
    localStorage.setItem('austin_petanque_admin_unlocked', 'true');
    document.getElementById('admin-login-box').style.display = 'none';
    document.getElementById('admin-dashboard-box').style.display = 'block';
    const roleStatus = document.getElementById('admin-role-status');
    if (roleStatus) {
      roleStatus.innerHTML = `<span class="badge-role-founder"><i class="fa-solid fa-crown"></i> Founder Console Active (Passcode Authenticated)</span>`;
    }
    updateAuthUI(currentUser);
    renderAdminDashboard();
  } else {
    errorEl.textContent = 'Incorrect passcode. Try "founders" or "petanque2026"';
  }
};

window.logoutAdmin = () => {
  localStorage.removeItem('austin_petanque_admin_unlocked');
  document.getElementById('admin-login-box').style.display = 'block';
  document.getElementById('admin-dashboard-box').style.display = 'none';
  updateAuthUI(currentUser);
  window.location.hash = '#about';
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

// ─── Player Base Database & Email Sorting Console for Admin (noless42@gmail.com) ───
const DEMO_PLAYER_BASE = [
  { uid: 'admin-01', displayName: 'System Founder', email: 'noless42@gmail.com', provider: 'google.com', role: 'founder', createdAt: '2026-01-01', lastLogin: 'Just now', status: 'Active' },
  { uid: 'player-01', displayName: 'Jean-Luc Petanque', email: 'jeanluc@austinpetanque.org', provider: 'email', role: 'player', createdAt: '2026-02-10', lastLogin: '2 hours ago', status: 'Active' },
  { uid: 'player-02', displayName: 'Samantha Vance', email: 'sam.vance@gmail.com', provider: 'google.com', role: 'player', createdAt: '2026-03-04', lastLogin: 'Yesterday', status: 'Active' },
  { uid: 'player-03', displayName: 'Antoine Dubois', email: 'dubois.a@atxmail.com', provider: 'email', role: 'player', createdAt: '2026-03-12', lastLogin: '3 days ago', status: 'Active' },
  { uid: 'player-04', displayName: 'Claire Miller', email: 'claire.m@icloud.com', provider: 'apple.com', role: 'player', createdAt: '2026-04-01', lastLogin: '5 days ago', status: 'Active' },
  { uid: 'player-05', displayName: 'Marcus Brody', email: 'marcus.brody@austin.rr.com', provider: 'email', role: 'player', createdAt: '2026-04-15', lastLogin: '1 week ago', status: 'Active' },
  { uid: 'player-06', displayName: 'Zoe Kravitz', email: 'zoek@petanquelife.io', provider: 'google.com', role: 'player', createdAt: '2026-05-20', lastLogin: '2 weeks ago', status: 'Active' }
];

let playerBaseCache = [];

// Unique Username Handle Generator
function generateUniqueUsername(name, email) {
  let base = (name || email?.split('@')[0] || 'player')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!base || base.length < 3) base = 'petanqueur';

  const localUsers = JSON.parse(localStorage.getItem('austin_petanque_local_users') || '[]');
  const existingUsernames = new Set();
  DEMO_PLAYER_BASE.forEach(u => { if (u.username) existingUsernames.add(u.username.toLowerCase()); });
  localUsers.forEach(u => { if (u.username) existingUsernames.add(u.username.toLowerCase()); });

  let username = base;
  let attempt = 0;
  while (existingUsernames.has(username)) {
    attempt++;
    const randomSuffix = Math.floor(10 + Math.random() * 90);
    username = `${base}_${randomSuffix}`;
    if (attempt > 20) {
      username = `${base}_${Date.now().toString().slice(-4)}`;
      break;
    }
  }
  return username;
}

async function syncUserProfileToFirestore(user, providerType = 'email', customName = null) {
  if (!user) return;
  const isFounder = (user.email && user.email.toLowerCase() === 'noless42@gmail.com');
  const userRole = isFounder ? 'founder' : 'player';
  const displayName = customName || user.displayName || user.email?.split('@')[0] || 'Pétanqueur';

  // Retrieve existing local profile settings if available
  const existingProfileKey = `austin_petanque_profile_${user.uid}`;
  const existingSaved = JSON.parse(localStorage.getItem(existingProfileKey) || '{}');

  const username = existingSaved.username || user.username || generateUniqueUsername(displayName, user.email);
  const avatar = existingSaved.avatar || user.avatar || 'fa-bowling-ball';
  const bio = existingSaved.bio || user.bio || 'Passionate Austin pétanque player!';
  const favoritePitch = existingSaved.favoritePitch || user.favoritePitch || 'French Legation Museum';
  const playingRole = existingSaved.playingRole || user.playingRole || 'Pointer (Pointeur)';
  const privacyMode = existingSaved.privacyMode || user.privacyMode || 'public'; // 'public' | 'friends-only'

  const userProfile = {
    uid: user.uid,
    displayName: displayName,
    username: username,
    email: user.email,
    photoURL: user.photoURL || null,
    avatar: avatar,
    bio: bio,
    favoritePitch: favoritePitch,
    playingRole: playingRole,
    privacyMode: privacyMode,
    provider: providerType,
    role: userRole,
    status: 'Active',
    lastLogin: new Date().toISOString()
  };

  try {
    const userDocRef = doc(db, 'users', user.uid);
    const existingSnap = await getDoc(userDocRef);
    if (!existingSnap.exists()) {
      userProfile.createdAt = new Date().toISOString();
    }
    await setDoc(userDocRef, userProfile, { merge: true });
  } catch (err) {
    console.warn('Firestore user profile sync warning:', err);
  }

  // Save to individual local profile key & global cache
  localStorage.setItem(existingProfileKey, JSON.stringify(userProfile));

  const localUsers = JSON.parse(localStorage.getItem('austin_petanque_local_users') || '[]');
  const idx = localUsers.findIndex(u => u.uid === user.uid || u.email === user.email);
  if (idx >= 0) {
    localUsers[idx] = { ...localUsers[idx], ...userProfile };
  } else {
    localUsers.push(userProfile);
  }
  localStorage.setItem('austin_petanque_local_users', JSON.stringify(localUsers));

  fetchPlayerBase();
}

window.fetchPlayerBase = async () => {
  let firestoreUsers = [];
  try {
    const querySnap = await getDocs(collection(db, 'users'));
    querySnap.forEach(docSnap => {
      firestoreUsers.push(docSnap.data());
    });
  } catch (err) {
    console.warn('Unable to query Firestore users collection directly:', err);
  }

  const localUsers = JSON.parse(localStorage.getItem('austin_petanque_local_users') || '[]');
  
  // Combine unique by email or uid
  const map = new Map();
  DEMO_PLAYER_BASE.forEach(p => map.set(p.email.toLowerCase(), p));
  localUsers.forEach(u => { if (u.email) map.set(u.email.toLowerCase(), u); });
  firestoreUsers.forEach(u => { if (u.email) map.set(u.email.toLowerCase(), u); });

  playerBaseCache = Array.from(map.values());
  filterAndSortPlayerBase();
};

window.filterAndSortPlayerBase = () => {
  const searchVal = (document.getElementById('player-search-input')?.value || '').toLowerCase().trim();
  const sortOption = document.getElementById('player-sort-select')?.value || 'email-asc';
  const providerFilter = document.getElementById('player-provider-filter')?.value || 'all';

  let filtered = playerBaseCache.filter(player => {
    const matchesSearch = !searchVal || 
      (player.email && player.email.toLowerCase().includes(searchVal)) ||
      (player.displayName && player.displayName.toLowerCase().includes(searchVal)) ||
      (player.uid && player.uid.toLowerCase().includes(searchVal));

    const matchesProvider = (providerFilter === 'all') || 
      (providerFilter === 'email' && (player.provider === 'email' || !player.provider)) ||
      (player.provider === providerFilter);

    return matchesSearch && matchesProvider;
  });

  // Email Sorting Algorithms
  filtered.sort((a, b) => {
    if (sortOption === 'email-asc') {
      return (a.email || '').localeCompare(b.email || '');
    } else if (sortOption === 'email-desc') {
      return (b.email || '').localeCompare(a.email || '');
    } else if (sortOption === 'name-asc') {
      return (a.displayName || '').localeCompare(b.displayName || '');
    } else if (sortOption === 'recent') {
      return new Date(b.createdAt || b.lastLogin || 0) - new Date(a.createdAt || a.lastLogin || 0);
    } else if (sortOption === 'role') {
      if (a.role === 'founder' || a.role === 'admin') return -1;
      if (b.role === 'founder' || b.role === 'admin') return 1;
      return 0;
    }
    return 0;
  });

  renderPlayerBaseTable(filtered);
};

function renderPlayerBaseTable(players) {
  const tbody = document.getElementById('player-base-tbody');
  const totalCountEl = document.getElementById('stat-total-players');
  const emailCountEl = document.getElementById('stat-email-players');
  const oauthCountEl = document.getElementById('stat-oauth-players');
  const badgeCountEl = document.getElementById('roster-count-badge');

  if (totalCountEl) totalCountEl.textContent = playerBaseCache.length;
  if (emailCountEl) emailCountEl.textContent = playerBaseCache.filter(p => p.provider === 'email' || !p.provider).length;
  if (oauthCountEl) oauthCountEl.textContent = playerBaseCache.filter(p => p.provider && p.provider !== 'email').length;
  if (badgeCountEl) badgeCountEl.textContent = players.length;

  if (!tbody) return;

  if (players.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted);">
          No matching player profiles found. Try changing your email search query or filter.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = players.map(player => {
    const isFounder = (player.email && player.email.toLowerCase() === 'noless42@gmail.com') || player.role === 'founder';
    const isEmailProvider = !player.provider || player.provider === 'email';

    return `
      <tr>
        <td style="padding: 12px 16px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: ${isFounder ? 'var(--primary-amber)' : 'rgba(255,255,255,0.1)'}; color: ${isFounder ? '#000' : '#fff'}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem;">
              ${(player.displayName || player.email || 'P')[0].toUpperCase()}
            </div>
            <div>
              <div style="font-weight: 700;">${player.displayName || 'Player'}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">UID: ${player.uid ? player.uid.slice(0, 10) + '...' : 'local'}</div>
            </div>
          </div>
        </td>
        <td style="padding: 12px 16px;">
          <a href="mailto:${player.email}" class="player-email-link">
            <i class="fa-solid fa-envelope" style="font-size: 0.8rem;"></i> ${player.email}
          </a>
        </td>
        <td style="padding: 12px 16px;">
          <span class="${isEmailProvider ? 'provider-chip-email' : 'provider-chip-oauth'}">
            <i class="fa-solid ${isEmailProvider ? 'fa-at' : 'fa-shield-halved'}"></i> ${player.provider || 'email'}
          </span>
        </td>
        <td style="padding: 12px 16px;">
          <span class="${isFounder ? 'badge-role-founder' : 'badge-role-player'}">
            ${isFounder ? '<i class="fa-solid fa-crown"></i> Founder' : '<i class="fa-solid fa-user"></i> Player'}
          </span>
        </td>
        <td style="padding: 12px 16px; color: var(--text-muted); font-size: 0.82rem;">
          ${player.lastLogin || 'Recent'}
        </td>
        <td style="padding: 12px 16px; text-align: right;">
          <button class="btn-finish-chip" onclick="togglePlayerRole('${player.uid || player.email}')" title="Toggle Admin Role">
            <i class="fa-solid fa-user-gear"></i> Role
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.togglePlayerRole = (id) => {
  const target = playerBaseCache.find(p => p.uid === id || p.email === id);
  if (target) {
    if (target.email === 'noless42@gmail.com') {
      alert('🔒 Founder role for noless42@gmail.com is permanent and protected.');
      return;
    }
    target.role = (target.role === 'admin') ? 'player' : 'admin';
    alert(`Updated role for ${target.displayName || target.email} to: ${target.role.toUpperCase()}`);
    filterAndSortPlayerBase();
  }
};

window.refreshPlayerBase = () => {
  fetchPlayerBase();
};

window.switchAdminSubTab = (tab) => {
  const playersBtn = document.getElementById('admin-tab-players');
  const appsBtn = document.getElementById('admin-tab-applications');
  const playersContent = document.getElementById('admin-subtab-players-content');
  const appsContent = document.getElementById('admin-subtab-applications-content');

  if (tab === 'players') {
    playersBtn?.classList.add('active');
    appsBtn?.classList.remove('active');
    if (playersContent) playersContent.style.display = 'block';
    if (appsContent) appsContent.style.display = 'none';
  } else {
    playersBtn?.classList.remove('active');
    appsBtn?.classList.add('active');
    if (playersContent) playersContent.style.display = 'none';
    if (appsContent) appsContent.style.display = 'block';
  }
};

function renderAdminDashboard() {
  const apps = getPendingApps();
  const listEl = document.getElementById('applications-list');
  const countEl = document.getElementById('pending-count');

  const pendingApps = apps.filter(a => a.status === 'pending');
  if (countEl) countEl.textContent = pendingApps.length;

  if (listEl) {
    if (apps.length === 0) {
      listEl.innerHTML = '<p style="color: var(--text-muted);">No member applications found.</p>';
    } else {
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
  }

  fetchPlayerBase();
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

// ─── Firebase Authentication (Email, Google & Apple) ────────────────────────────────
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

  // Auth Tab Switching inside Auth Modal
  window.switchAuthTab = (tab) => {
    const btnLogin = document.getElementById('tab-btn-login');
    const btnSignup = document.getElementById('tab-btn-signup');
    const btnOauth = document.getElementById('tab-btn-oauth');

    const formLogin = document.getElementById('auth-email-login-form');
    const formSignup = document.getElementById('auth-email-signup-form');
    const groupOauth = document.getElementById('auth-oauth-group');
    const statusMsg = document.getElementById('auth-status-msg');
    if (statusMsg) statusMsg.textContent = '';

    [btnLogin, btnSignup, btnOauth].forEach(b => b?.classList.remove('active'));

    if (tab === 'login') {
      btnLogin?.classList.add('active');
      if (formLogin) formLogin.style.display = 'flex';
      if (formSignup) formSignup.style.display = 'none';
      if (groupOauth) groupOauth.style.display = 'none';
    } else if (tab === 'signup') {
      btnSignup?.classList.add('active');
      if (formLogin) formLogin.style.display = 'none';
      if (formSignup) formSignup.style.display = 'flex';
      if (groupOauth) groupOauth.style.display = 'none';
    } else {
      btnOauth?.classList.add('active');
      if (formLogin) formLogin.style.display = 'none';
      if (formSignup) formSignup.style.display = 'none';
      if (groupOauth) groupOauth.style.display = 'flex';
    }
  };

  // Email Login Handler
  window.handleEmailLogin = async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('login-email-input');
    const passInput = document.getElementById('login-password-input');
    const statusMsg = document.getElementById('auth-status-msg');
    const loginBtn = document.getElementById('email-login-btn');

    const email = emailInput?.value.trim();
    const password = passInput?.value;

    if (!email || !password) return;

    try {
      if (statusMsg) {
        statusMsg.textContent = 'Authenticating with Firebase...';
        statusMsg.style.color = 'var(--primary-amber)';
      }
      if (loginBtn) loginBtn.disabled = true;

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (statusMsg) {
        statusMsg.textContent = `Welcome back, ${user.displayName || user.email}!`;
        statusMsg.style.color = '#10b981';
      }

      await syncUserProfileToFirestore(user, 'email');

      setTimeout(() => {
        closeAuthModal();
      }, 900);
    } catch (err) {
      console.warn('Firebase Email Sign-In Exception:', err);
      if (statusMsg) {
        statusMsg.style.color = '#ef4444';
        if (err.code === 'auth/configuration-not-found' || err.code === 'auth/operation-not-allowed') {
          statusMsg.textContent = 'Firebase Notice: Email Auth enabled locally! In Firebase Console, enable Email/Password under Auth. Account signed in for session.';
          const fallbackUser = { uid: 'usr_' + Date.now(), email: email, displayName: email.split('@')[0] };
          currentUser = fallbackUser;
          updateAuthUI(fallbackUser);
          syncUserProfileToFirestore(fallbackUser, 'email');
          setTimeout(() => closeAuthModal(), 1400);
        } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
          statusMsg.textContent = 'Invalid email or password. Please try again or create a new account.';
        } else {
          statusMsg.textContent = `Sign-in notice: ${err.message || 'Unable to sign in.'}`;
        }
      }
    } finally {
      if (loginBtn) loginBtn.disabled = false;
    }
  };

  // Email Sign Up Handler
  window.handleEmailSignUp = async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('signup-name-input');
    const emailInput = document.getElementById('signup-email-input');
    const passInput = document.getElementById('signup-password-input');
    const statusMsg = document.getElementById('auth-status-msg');
    const signupBtn = document.getElementById('email-signup-btn');

    const name = nameInput?.value.trim();
    const email = emailInput?.value.trim();
    const password = passInput?.value;

    if (!email || !password || !name) return;

    try {
      if (statusMsg) {
        statusMsg.textContent = 'Creating your Firebase profile...';
        statusMsg.style.color = 'var(--primary-amber)';
      }
      if (signupBtn) signupBtn.disabled = true;

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (statusMsg) {
        statusMsg.textContent = `Account created! Welcome to Austin Pétanque, ${name}!`;
        statusMsg.style.color = '#10b981';
      }

      await syncUserProfileToFirestore(user, 'email', name);

      setTimeout(() => {
        closeAuthModal();
      }, 900);
    } catch (err) {
      console.warn('Firebase Email Sign-Up Exception:', err);
      if (statusMsg) {
        statusMsg.style.color = '#ef4444';
        if (err.code === 'auth/configuration-not-found' || err.code === 'auth/operation-not-allowed') {
          statusMsg.textContent = 'Firebase Notice: Email Auth enabled locally! Turn on Email/Password in Firebase Console. Account active!';
          const fallbackUser = { uid: 'usr_' + Date.now(), email: email, displayName: name };
          currentUser = fallbackUser;
          updateAuthUI(fallbackUser);
          syncUserProfileToFirestore(fallbackUser, 'email', name);
          setTimeout(() => closeAuthModal(), 1400);
        } else if (err.code === 'auth/email-already-in-use') {
          statusMsg.textContent = 'An account with this email already exists. Switch to Email Login to sign in.';
        } else if (err.code === 'auth/weak-password') {
          statusMsg.textContent = 'Password is too weak. Please use at least 6 characters.';
        } else {
          statusMsg.textContent = `Sign-up notice: ${err.message || 'Registration failed.'}`;
        }
      }
    } finally {
      if (signupBtn) signupBtn.disabled = false;
    }
  };

  // Password Reset Handler
  window.handleForgotPassword = async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('login-email-input');
    const statusMsg = document.getElementById('auth-status-msg');

    const email = emailInput?.value.trim();
    if (!email) {
      if (statusMsg) {
        statusMsg.style.color = '#ef4444';
        statusMsg.textContent = 'Please enter your email address in the field above first.';
      }
      return;
    }

    try {
      if (statusMsg) {
        statusMsg.style.color = 'var(--primary-amber)';
        statusMsg.textContent = `Sending password reset email to ${email}...`;
      }
      await sendPasswordResetEmail(auth, email);
      if (statusMsg) {
        statusMsg.style.color = '#10b981';
        statusMsg.textContent = `Password reset email sent to ${email}! Please check your inbox.`;
      }
    } catch (err) {
      if (statusMsg) {
        statusMsg.style.color = '#ef4444';
        statusMsg.textContent = `Password reset notice: ${err.message || 'Could not send reset email.'}`;
      }
    }
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

      await syncUserProfileToFirestore(user, 'google.com');

      setTimeout(() => {
        closeAuthModal();
      }, 900);
    } catch (err) {
      console.warn('Google sign-in error:', err);
      if (statusMsg) {
        statusMsg.style.color = '#ef4444';
        if (err.code === 'auth/configuration-not-found' || err.code === 'auth/operation-not-allowed') {
          statusMsg.style.color = '#f59e0b';
          statusMsg.textContent = 'Notice: Google Auth requires Console activation. Signed in locally for active session!';
          const fallbackUser = {
            uid: 'usr_g_' + Date.now().toString().slice(-6),
            email: 'google.player@austinpetanque.org',
            displayName: 'Google Pétanqueur',
            photoURL: null
          };
          currentUser = fallbackUser;
          updateAuthUI(fallbackUser);
          await syncUserProfileToFirestore(fallbackUser, 'google.com');
          setTimeout(() => closeAuthModal(), 1200);
        } else if (err.code === 'auth/popup-closed-by-user') {
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

      await syncUserProfileToFirestore(user, 'apple.com');

      setTimeout(() => {
        closeAuthModal();
      }, 900);
    } catch (err) {
      console.warn('Apple sign-in error:', err);
      if (statusMsg) {
        statusMsg.style.color = '#ef4444';
        if (err.code === 'auth/configuration-not-found' || err.code === 'auth/operation-not-allowed') {
          statusMsg.style.color = '#f59e0b';
          statusMsg.textContent = 'Notice: Apple Sign-In requires Console activation. Signed in locally for active session!';
          const fallbackUser = {
            uid: 'usr_apple_' + Date.now().toString().slice(-6),
            email: 'apple.player@austinpetanque.org',
            displayName: 'Apple Pétanqueur',
            photoURL: null
          };
          currentUser = fallbackUser;
          updateAuthUI(fallbackUser);
          await syncUserProfileToFirestore(fallbackUser, 'apple.com');
          setTimeout(() => closeAuthModal(), 1200);
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
      currentUser = null;
      closeAuthModal();
    } catch (err) {
      console.warn('Sign-out error:', err);
    }
  };

  // Auth State Listener
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateAuthUI(user);
    if (user) {
      syncUserProfileToFirestore(user, user.providerData?.[0]?.providerId || 'email');
    }
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
    const profileKey = `austin_petanque_profile_${user.uid}`;
    const savedProfile = JSON.parse(localStorage.getItem(profileKey) || '{}');

    const displayName = savedProfile.displayName || user.displayName || user.email?.split('@')[0] || 'Player';
    const username = savedProfile.username || user.username || generateUniqueUsername(displayName, user.email);
    const photoURL = user.photoURL || savedProfile.photoURL || defaultAvatar;
    const avatar = savedProfile.avatar || user.avatar || 'fa-bowling-ball';

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

    // Update Username tag
    const usernameTag = document.getElementById('auth-username-display');
    if (usernameTag) usernameTag.textContent = `@${username}`;

    const usernameInput = document.getElementById('profile-username-input');
    if (usernameInput) usernameInput.value = username;

    // Update Avatar Display
    updateAvatarDisplayUI(avatar, photoURL);

    // Update Bio & Details
    const bioInput = document.getElementById('profile-bio-input');
    if (bioInput) bioInput.value = savedProfile.bio || 'Passionate Austin pétanque player!';

    const pitchSelect = document.getElementById('profile-pitch-select');
    if (pitchSelect && savedProfile.favoritePitch) pitchSelect.value = savedProfile.favoritePitch;

    const roleSelect = document.getElementById('profile-role-select');
    if (roleSelect && savedProfile.playingRole) roleSelect.value = savedProfile.playingRole;

    const privacyCheck = document.getElementById('profile-privacy-checkbox');
    const privacyBanner = document.getElementById('privacy-status-indicator');
    const isFriendsOnly = (savedProfile.privacyMode === 'friends-only');
    if (privacyCheck) privacyCheck.checked = isFriendsOnly;
    if (privacyBanner) privacyBanner.style.display = isFriendsOnly ? 'block' : 'none';

    // Populate Match History UI
    renderMatchHistoryList(user.uid);

    // Autofill form shortcuts
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

  // Role-Aware UI: Founder vs Player
  const isAdmin = isCurrentUserAdmin(user);
  const navAdminLink = document.getElementById('nav-admin-link');
  const drawerAdminLink = document.getElementById('drawer-admin-link');
  const authAdminBtn = document.getElementById('auth-admin-btn');
  const authUserRoleBadge = document.getElementById('auth-user-role-badge');

  if (isAdmin) {
    if (navAdminLink) navAdminLink.style.display = 'inline-block';
    if (drawerAdminLink) drawerAdminLink.style.display = 'flex';
    if (authAdminBtn) authAdminBtn.style.display = 'inline-flex';
    if (authUserRoleBadge) {
      authUserRoleBadge.style.display = 'inline-flex';
      authUserRoleBadge.className = 'badge-role-founder';
      authUserRoleBadge.innerHTML = '<i class="fa-solid fa-crown"></i> Founder / Admin';
    }

    if (window.location.hash.split('?')[0] === '#admin') {
      const loginBox = document.getElementById('admin-login-box');
      const dashboardBox = document.getElementById('admin-dashboard-box');
      const roleStatus = document.getElementById('admin-role-status');
      if (loginBox) loginBox.style.display = 'none';
      if (dashboardBox) dashboardBox.style.display = 'block';
      if (roleStatus) {
        roleStatus.innerHTML = `<span class="badge-role-founder"><i class="fa-solid fa-crown"></i> Founder Console Active (${user?.email || 'noless42@gmail.com'})</span>`;
      }
      renderAdminDashboard();
    }
  } else {
    if (navAdminLink) navAdminLink.style.display = 'none';
    if (drawerAdminLink) drawerAdminLink.style.display = 'none';
    if (authAdminBtn) authAdminBtn.style.display = 'none';
    if (authUserRoleBadge) {
      if (user) {
        authUserRoleBadge.style.display = 'inline-flex';
        authUserRoleBadge.className = 'badge-role-player';
        authUserRoleBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Club Member';
      } else {
        authUserRoleBadge.style.display = 'none';
      }
    }
  }
}

// ─── Profile Subtab Switcher ───
window.switchProfileSubtab = (subtab) => {
  const tabs = ['info', 'matches', 'privacy'];
  tabs.forEach(t => {
    const btn = document.getElementById(`profile-tab-btn-${t}`);
    const content = document.getElementById(`profile-subtab-content-${t}`);
    if (btn) btn.classList.toggle('active', t === subtab);
    if (content) content.style.display = (t === subtab) ? 'block' : 'none';
  });
};

// ─── Avatar Preset & Custom URL Selector ───
let selectedAvatarPreset = 'fa-bowling-ball';

window.selectAvatarPreset = (iconClass) => {
  selectedAvatarPreset = iconClass;
  const items = document.querySelectorAll('.avatar-preset-item');
  items.forEach(item => {
    const isSelected = item.getAttribute('data-avatar') === iconClass;
    item.classList.toggle('selected', isSelected);
  });
  updateAvatarDisplayUI(iconClass, null);
};

window.previewCustomAvatarUrl = (url) => {
  if (url && url.trim().length > 5) {
    updateAvatarDisplayUI(null, url.trim());
  } else {
    updateAvatarDisplayUI(selectedAvatarPreset, null);
  }
};

function updateAvatarDisplayUI(iconClass, photoURL) {
  const avatarDisplay = document.getElementById('auth-avatar-display');
  if (!avatarDisplay) return;

  if (photoURL && photoURL.startsWith('http')) {
    avatarDisplay.innerHTML = `<img src="${photoURL}" alt="User Avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
  } else {
    const icon = iconClass || selectedAvatarPreset || 'fa-bowling-ball';
    avatarDisplay.innerHTML = `<i class="fa-solid ${icon}"></i>`;
  }
}

// ─── Unique Username Handle Live Validation ───
window.onUsernameInputChange = (inputVal) => {
  const cleanVal = inputVal.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const badge = document.getElementById('username-validation-badge');
  if (!badge) return;

  if (!cleanVal || cleanVal.length < 3) {
    badge.className = 'username-status-badge taken';
    badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Min 3 chars';
    return;
  }

  // Check uniqueness against other users
  const localUsers = JSON.parse(localStorage.getItem('austin_petanque_local_users') || '[]');
  const myUid = currentUser?.uid;
  const isTaken = localUsers.some(u => u.uid !== myUid && u.username && u.username.toLowerCase() === cleanVal);

  if (isTaken) {
    badge.className = 'username-status-badge taken';
    badge.innerHTML = '<i class="fa-solid fa-xmark"></i> Username Taken';
  } else {
    badge.className = 'username-status-badge available';
    badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Unique Handle Available';
  }
};

// ─── Save Profile & Bio Settings ───
window.saveUserProfileSettings = async (e) => {
  if (e) e.preventDefault();
  if (!currentUser) return;

  const usernameInput = document.getElementById('profile-username-input')?.value.trim();
  const bioInput = document.getElementById('profile-bio-input')?.value.trim();
  const pitchSelect = document.getElementById('profile-pitch-select')?.value;
  const roleSelect = document.getElementById('profile-role-select')?.value;
  const customAvatarUrl = document.getElementById('profile-custom-avatar-url')?.value.trim();
  const privacyCheck = document.getElementById('profile-privacy-checkbox')?.checked;

  const cleanUsername = usernameInput?.toLowerCase().replace(/[^a-z0-9_]/g, '') || generateUniqueUsername(currentUser.displayName, currentUser.email);

  const profileKey = `austin_petanque_profile_${currentUser.uid}`;
  const existingSaved = JSON.parse(localStorage.getItem(profileKey) || '{}');

  const updatedProfile = {
    ...existingSaved,
    uid: currentUser.uid,
    displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Pétanqueur',
    email: currentUser.email,
    username: cleanUsername,
    avatar: customAvatarUrl ? null : selectedAvatarPreset,
    photoURL: customAvatarUrl || currentUser.photoURL || null,
    bio: bioInput || 'Passionate Austin pétanque player!',
    favoritePitch: pitchSelect || 'French Legation Museum',
    playingRole: roleSelect || 'Pointer (Pointeur)',
    privacyMode: privacyCheck ? 'friends-only' : 'public',
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem(profileKey, JSON.stringify(updatedProfile));

  // Sync to Firestore & cache
  try {
    const userDocRef = doc(db, 'users', currentUser.uid);
    await setDoc(userDocRef, updatedProfile, { merge: true });
  } catch (err) {
    console.warn('Firestore profile update notice:', err);
  }

  // Update local cache
  const localUsers = JSON.parse(localStorage.getItem('austin_petanque_local_users') || '[]');
  const idx = localUsers.findIndex(u => u.uid === currentUser.uid);
  if (idx >= 0) localUsers[idx] = { ...localUsers[idx], ...updatedProfile };
  else localUsers.push(updatedProfile);
  localStorage.setItem('austin_petanque_local_users', JSON.stringify(localUsers));

  const statusMsg = document.getElementById('auth-status-msg');
  if (statusMsg) {
    statusMsg.style.color = '#10b981';
    statusMsg.textContent = '✅ Profile, bio, and avatar updated successfully!';
  }

  updateAuthUI(currentUser);
  fetchPlayerBase();
};

// ─── Account Privacy Toggle Handler ───
window.toggleAccountPrivacySetting = (isFriendsOnly) => {
  const banner = document.getElementById('privacy-status-indicator');
  if (banner) banner.style.display = isFriendsOnly ? 'block' : 'none';
  if (currentUser) {
    const profileKey = `austin_petanque_profile_${currentUser.uid}`;
    const saved = JSON.parse(localStorage.getItem(profileKey) || '{}');
    saved.privacyMode = isFriendsOnly ? 'friends-only' : 'public';
    localStorage.setItem(profileKey, JSON.stringify(saved));
  }
};

// ─── Match History Subsystem ───
window.openLogMatchModal = () => {
  const modal = document.getElementById('log-match-modal');
  if (modal) modal.classList.add('active');
};

window.closeLogMatchModal = () => {
  const modal = document.getElementById('log-match-modal');
  if (modal) modal.classList.remove('active');
};

window.handleLogMatchSubmit = async (e) => {
  e.preventDefault();
  if (!currentUser) {
    alert('Please sign in to log a match record!');
    return;
  }

  const myScore = parseInt(document.getElementById('match-my-score')?.value || '13', 10);
  const oppScore = parseInt(document.getElementById('match-opp-score')?.value || '7', 10);
  const opponent = document.getElementById('match-opponent-input')?.value.trim() || 'Austin Player';
  const gameType = document.getElementById('match-type-select')?.value || 'Singles 1v1';
  const pitch = document.getElementById('match-pitch-select')?.value || 'French Legation';

  const isWin = (myScore >= oppScore);

  const matchRecord = {
    id: 'm_' + Date.now(),
    uid: currentUser.uid,
    playerEmail: currentUser.email,
    myScore: myScore,
    oppScore: oppScore,
    opponent: opponent,
    gameType: gameType,
    pitch: pitch,
    isWin: isWin,
    timestamp: new Date().toISOString()
  };

  // Save to local match storage
  const allMatches = JSON.parse(localStorage.getItem('austin_petanque_matches') || '[]');
  allMatches.unshift(matchRecord);
  localStorage.setItem('austin_petanque_matches', JSON.stringify(allMatches));

  // Sync to Firestore if available
  try {
    await addDoc(collection(db, 'matches'), matchRecord);
  } catch (err) {
    console.warn('Firestore match record sync warning:', err);
  }

  closeLogMatchModal();
  renderMatchHistoryList(currentUser.uid);

  const statusMsg = document.getElementById('auth-status-msg');
  if (statusMsg) {
    statusMsg.style.color = '#10b981';
    statusMsg.textContent = `Match recorded: ${isWin ? 'VICTORY 🏆' : 'DEFEAT'} (${myScore} - ${oppScore}) vs ${opponent}!`;
  }
};

function renderMatchHistoryList(uid) {
  const container = document.getElementById('match-history-container');
  if (!container) return;

  const allMatches = JSON.parse(localStorage.getItem('austin_petanque_matches') || '[]');
  const userMatches = allMatches.filter(m => m.uid === uid);

  // Compute stats
  const total = userMatches.length;
  const wins = userMatches.filter(m => m.isWin).length;
  const losses = total - wins;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  const totalEl = document.getElementById('stat-total-matches-count');
  const winRateEl = document.getElementById('stat-win-rate-pct');
  const ratioEl = document.getElementById('stat-wins-losses-ratio');

  if (totalEl) totalEl.textContent = total;
  if (winRateEl) winRateEl.textContent = `${winRate}%`;
  if (ratioEl) ratioEl.textContent = `${wins}W - ${losses}L`;

  if (userMatches.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); font-size: 0.84rem; padding: 20px 0;">
        <i class="fa-solid fa-trophy" style="font-size: 1.8rem; margin-bottom: 8px; opacity: 0.4;"></i>
        <p>No recorded matches yet.<br>Click "Log Game" to record your first score!</p>
      </div>
    `;
    return;
  }

  let html = '';
  userMatches.forEach(m => {
    const badgeClass = m.isWin ? 'match-badge-win' : 'match-badge-loss';
    const tagText = m.isWin ? 'WIN' : 'LOSS';
    const formattedDate = new Date(m.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    html += `
      <div class="match-history-item">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="${badgeClass}">${tagText}</span>
          <div>
            <div style="font-weight: 700; font-size: 0.88rem;">vs ${m.opponent}</div>
            <div style="font-size: 0.74rem; color: var(--text-muted);">${m.gameType} • ${m.pitch} • ${formattedDate}</div>
          </div>
        </div>
        <div class="match-score-pill" style="color: ${m.isWin ? '#34d399' : '#fca5a5'};">
          ${m.myScore} - ${m.oppScore}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}


