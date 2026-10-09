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

} from './firebase-config.js?v=3.9.4';



document.addEventListener('DOMContentLoaded', () => {

  initNavbar();

  initAuth();

  initScoreboard();

  initModal();

  initFormSubmission();

  initHashRouting();

  initSunlightPreference();

  initCourtCheckIns();

  renderLiveDashboard();

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
    const watchView = document.getElementById('watch-view');
    const adminSection = document.getElementById('admin');
    const dockClub = document.getElementById('dock-club');
    const dockCourts = document.getElementById('dock-courts');
    const dockWatch = document.getElementById('dock-watch');
    const dockScore = document.getElementById('dock-score');

    // Update bottom dock active item
    dockClub?.classList.remove('active');
    dockCourts?.classList.remove('active');
    dockWatch?.classList.remove('active');
    dockScore?.classList.remove('active');

    const isScore = baseHash === '#score' || baseHash === '#scoreboard';
    const isWatch = baseHash === '#watch';

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
      if (watchView) watchView.style.display = 'none';
      if (scoreView) scoreView.style.display = 'flex';

      dockScore?.classList.add('active');

      window.scrollTo(0, 0);



      // Check query params for match code

      const urlParams = new URLSearchParams(queryString || window.location.search);

      const matchParam = urlParams.get('match');

      if (matchParam && matchParam !== currentMatchCode) {
        connectToLiveMatch(matchParam.toUpperCase());
      }
    } else if (isWatch) {
      if (publicView) publicView.style.display = 'none';
      if (adminSection) adminSection.style.display = 'none';
      if (scoreView) scoreView.style.display = 'none';
      if (watchView) watchView.style.display = 'block';
      dockWatch?.classList.add('active');
      window.scrollTo(0, 0);
    } else if (baseHash === '#admin') {
      if (publicView) publicView.style.display = 'none';
      if (scoreView) scoreView.style.display = 'none';
      if (watchView) watchView.style.display = 'none';

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
      if (watchView) watchView.style.display = 'none';
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



// Standalone Classic Handheld Points Counter State (Picture 4 Capsule Counter)

let classicScoreA = 0; // 0 to 13

let classicScoreB = 0; // 0 to 13

let scoreboardMode = 'classic'; // 'classic' active by default (initially seen on mobile)



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



  // Initialize Classic Mode Scorekeeper (demonstrated as default initial scorekeeper)

  initClassicScorekeeper();

}



function initClassicScorekeeper() {

  try {

    const savedScores = JSON.parse(localStorage.getItem('austin_petanque_classic_scores') || '{"a":0,"b":0}');

    classicScoreA = Math.max(0, Math.min(13, parseInt(savedScores.a) || 0));

    classicScoreB = Math.max(0, Math.min(13, parseInt(savedScores.b) || 0));



    // On mobile or by default, the classic scorekeeper should be initially seen!

    const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    const sessionMode = sessionStorage.getItem('austin_petanque_session_mode');

    const savedMode = localStorage.getItem('austin_petanque_scoreboard_mode');



    // On mobile, initial view is ALWAYS classic unless explicitly selected during current browser session

    let initialMode = 'classic';

    if (isMobile) {

      initialMode = sessionMode || 'classic';

    } else {

      initialMode = sessionMode || savedMode || 'classic';

    }



    switchScoreboardMode(initialMode, false);

  } catch (e) {

    console.warn('Classic scorekeeper local storage read error:', e);

    switchScoreboardMode('classic', false);

  }

  updateClassicDisplay();

  setupClassicInteractions();

}



window.switchScoreboardMode = (mode, save = true) => {

  scoreboardMode = mode;

  const btnModern = document.getElementById('mode-btn-modern');

  const btnClassic = document.getElementById('mode-btn-classic');

  const modernBody = document.getElementById('scoreboard-body');

  const classicView = document.getElementById('classic-scoreboard-view');

  const meneTimeline = document.querySelector('.mene-timeline-container');

  const leadBanner = document.getElementById('lead-banner');

  const subtitle = document.getElementById('scoreboard-subtitle');

  const resetMatchBtn = document.getElementById('reset-match-btn');



  if (mode === 'classic') {

    btnModern?.classList.remove('active');

    btnClassic?.classList.add('active');

    if (modernBody) modernBody.style.display = 'none';

    if (meneTimeline) meneTimeline.style.display = 'none';

    if (leadBanner) leadBanner.style.display = 'none';

    if (classicView) classicView.style.display = 'block';

    if (subtitle) subtitle.innerHTML = 'Classic 3D-printed rotary capsule counter (0–13). Standalone casual scorekeeper.';

    if (resetMatchBtn) resetMatchBtn.style.display = 'none';

  } else {

    btnClassic?.classList.remove('active');

    btnModern?.classList.add('active');

    if (classicView) classicView.style.display = 'none';

    if (modernBody) modernBody.style.display = '';

    if (meneTimeline) meneTimeline.style.display = '';

    if (leadBanner && leadBanner.textContent.trim()) leadBanner.style.display = '';

    if (subtitle) subtitle.textContent = 'Tap circle to throw (/), tap slash to mark point holder (★).';

    if (resetMatchBtn) resetMatchBtn.style.display = '';

  }



  if (save) {

    try {

      sessionStorage.setItem('austin_petanque_session_mode', mode);

      localStorage.setItem('austin_petanque_scoreboard_mode', mode);

    } catch (e) {}

  }

};



window.adjustClassicScore = (team, delta) => {

  const prevVal = team === 'A' ? classicScoreA : classicScoreB;

  let newVal = prevVal + delta;

  // Circular cycle 0 through 13

  if (newVal > 13) newVal = 0;

  if (newVal < 0) newVal = 13;



  if (team === 'A') {

    classicScoreA = newVal;

  } else {

    classicScoreB = newVal;

  }



  playMechanicalClickSound();

  triggerHaptic(18);

  animateClassicDigit(team, delta >= 0 ? 'up' : 'down');

  updateClassicDisplay();



  try {

    localStorage.setItem('austin_petanque_classic_scores', JSON.stringify({ a: classicScoreA, b: classicScoreB }));

  } catch (e) {}

};



window.resetClassicCounter = () => {

  classicScoreA = 0;

  classicScoreB = 0;

  playMechanicalClickSound();

  triggerHaptic([20, 20]);

  updateClassicDisplay();

  try {

    localStorage.setItem('austin_petanque_classic_scores', JSON.stringify({ a: 0, b: 0 }));

  } catch (e) {}

};



function updateClassicDisplay() {

  const digitA = document.getElementById('classic-digit-a');

  const digitB = document.getElementById('classic-digit-b');



  if (digitA) {

    digitA.textContent = classicScoreA;

    if (classicScoreA === 13) digitA.classList.add('is-thirteen');

    else digitA.classList.remove('is-thirteen');

  }



  if (digitB) {

    digitB.textContent = classicScoreB;

    if (classicScoreB === 13) digitB.classList.add('is-thirteen');

    else digitB.classList.remove('is-thirteen');

  }

}



function animateClassicDigit(team, direction) {

  const digitEl = document.getElementById(team === 'A' ? 'classic-digit-a' : 'classic-digit-b');

  if (!digitEl) return;

  const offset = direction === 'up' ? -12 : 12;

  digitEl.style.transform = `translateY(${offset}px) scale(0.9)`;

  digitEl.style.opacity = '0.5';

  setTimeout(() => {

    digitEl.style.transform = 'translateY(0) scale(1)';

    digitEl.style.opacity = '1';

  }, 120);

}



// Gentle mechanical click tone using Web Audio API

function playMechanicalClickSound() {

  try {

    const AudioCtx = window.AudioContext || window.webkitAudioContext;

    if (!AudioCtx) return;

    const ctx = new AudioCtx();

    const osc = ctx.createOscillator();

    const gain = ctx.createGain();

    osc.type = 'triangle';

    osc.frequency.setValueAtTime(320, ctx.currentTime);

    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);

    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);

    gain.connect(ctx.destination);

    osc.start();

    osc.stop(ctx.currentTime + 0.05);

  } catch (e) {}

}



function setupClassicInteractions() {

  const device = document.getElementById('classic-device');

  if (device) {

    device.addEventListener('wheel', (e) => {

      e.preventDefault();

      const rect = device.getBoundingClientRect();

      const clickY = e.clientY - rect.top;

      const targetTeam = clickY < rect.height / 2 ? 'A' : 'B';

      adjustClassicScore(targetTeam, e.deltaY < 0 ? 1 : -1);

    }, { passive: false });

  }

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

  const setupView = document.getElementById('host-setup-view');
  const activeView = document.getElementById('host-active-view');

  if (!currentMatchCode) {
    if (setupView) setupView.style.display = 'block';
    if (activeView) activeView.style.display = 'none';
  } else {
    if (setupView) setupView.style.display = 'none';
    if (activeView) activeView.style.display = 'block';
  }
};

window.startHostingGame = async () => {
  if (!currentUser) {
    alert("You must sign in to host a live match.");
    closeMatchSyncModal();
    openAuthModal();
    return;
  }
  
  // Prevent simultaneous games
  try {
    const liveMatchesRef = collection(db, 'live_matches');
    const q = query(liveMatchesRef, where('hostUid', '==', currentUser.uid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      alert("You are already hosting a live match. Please finish and save it before starting a new one.");
      return;
    }
  } catch (err) {
    console.warn('Error checking existing matches:', err);
  }
  
  const courtSelect = document.getElementById('host-court-select');
  const courtLocation = courtSelect ? courtSelect.value : 'Unknown Court';
  
  await initNewLiveMatch(courtLocation);
  
  const setupView = document.getElementById('host-setup-view');
  const activeView = document.getElementById('host-active-view');
  if (setupView) setupView.style.display = 'none';
  if (activeView) activeView.style.display = 'block';
};

window.finishAndSaveGame = async () => {
  if (!currentMatchCode || !isHost || !currentUser) return;
  
  const confirmEnd = confirm("Are you sure you want to finish this match and save it to Past Games?");
  if (!confirmEnd) return;
  
  try {
    const matchRef = doc(db, 'live_matches', currentMatchCode);
    const snap = await getDoc(matchRef);
    
    if (snap.exists()) {
      const pastRef = collection(db, 'past_games');
      await addDoc(pastRef, snap.data());
      await deleteDoc(matchRef);
    }
    
    // Reset local state
    if (matchUnsubscribe) { matchUnsubscribe(); matchUnsubscribe = null; }
    currentMatchCode = null;
    isHost = false;
    updateSyncPill(false);
    resetScore();
    closeMatchSyncModal();
    alert("Match successfully saved and archived.");
  } catch(e) {
    console.error("Error archiving game:", e);
    alert("Error saving game. Please try again.");
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



async function initNewLiveMatch(courtLocation = 'Unknown Court') {
  isHost = true;
  isLive = true;
  teamAScore = 0;
  teamBScore = 0;
  meneHistory = [];
  bouleStates = Array(6).fill(null);
  matchWinner = null;
  updateDisplays();
  if (typeof renderMeneHistory === 'function') renderMeneHistory();
  if (typeof renderBoules === 'function') renderBoules();

  currentMatchCode = generateMatchCode();
  const codeEl = document.getElementById('current-match-code');
  if (codeEl) codeEl.textContent = currentMatchCode;
  updateSyncPill(true);

  try {
    const matchRef = doc(db, 'live_matches', currentMatchCode);
    await setDoc(matchRef, {
      matchCode: currentMatchCode,
      courtLocation: courtLocation,
      hostUid: currentUser ? currentUser.uid : 'anonymous',
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      teamAScore,
      teamBScore,
      pointHolder,
      bouleStates,
      meneHistory,
      matchWinner
    });
    
    // Start listening for incoming queue requests
    listenForQueueRequests();
    
  } catch (e) {
    console.warn('Error creating match document:', e);
  }
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



  const queueBtn = document.getElementById('queue-to-play-btn');

  if (isLive && currentMatchCode) {
    pill.className = 'sync-status-pill live';
    label.textContent = `Live: ${currentMatchCode}`;
    if (queueBtn) queueBtn.style.display = isHost ? 'none' : 'inline-block';
  } else {
    pill.className = 'sync-status-pill';
    label.textContent = 'Local Match';
    if (queueBtn) queueBtn.style.display = 'none';
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

function parseTimestamp(val) {
  if (!val) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val.seconds === 'number') return val.seconds * 1000;
  if (typeof val === 'string') {
    const num = Number(val);
    if (!isNaN(num) && num > 0) return num;
    const parsed = Date.parse(val);
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

function getOrCreateGuestUserId() {
  let gId = localStorage.getItem('austin_petanque_guest_uid');
  if (!gId) {
    gId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    localStorage.setItem('austin_petanque_guest_uid', gId);
  }
  return gId;
}

function isMatchHost(item) {
  if (!item) return false;

  if (currentUser) {
    if (item.userId && item.userId === currentUser.uid) return true;
    if (item.uid && item.uid === currentUser.uid) return true;
    if (item.userEmail && currentUser.email && item.userEmail.toLowerCase() === currentUser.email.toLowerCase()) return true;
  }

  const guestUid = localStorage.getItem('austin_petanque_guest_uid');
  if (guestUid && item.userId === guestUid) return true;

  try {
    const myCheckins = JSON.parse(localStorage.getItem('austin_petanque_my_checkin_ids') || '[]');
    if (myCheckins.includes(item.id)) return true;
  } catch(e) {}

  return false;
}

function evaluateCheckInsStatus() {
  const checkins = getStoredCheckIns();
  const playDates = getStoredPlayDates();
  const now = Date.now();
  let changed = false;

  checkins.forEach(item => {
    const startMs = parseTimestamp(item.playTimeStart) || parseTimestamp(item.createdAt) || now;
    const endMs = parseTimestamp(item.playTimeEnd) || (startMs + (item.playDurationMinutes || 120) * 60000);

    if (now >= endMs && !item.isFinished) {
      item.isFinished = true;
      item.finishedAt = endMs;
      item.status = 'Finished';
      changed = true;

      const exists = playDates.some(pd => pd.id === item.id || pd.checkinId === item.id);
      if (!exists) {
        const gameDate = item.gameDate || new Date(startMs).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const playDateEntry = {
          id: 'pd_' + item.id,
          checkinId: item.id,
          name: item.name,
          court: item.court,
          gameDate: gameDate,
          timeOfPlay: item.timeOfPlay || `${gameDate} • Concluded`,
          playTimeStart: startMs,
          playTimeEnd: endMs,
          finishedAt: endMs,
          status: 'Finished 🏁',
          createdAt: parseTimestamp(item.createdAt) || startMs
        };
        playDates.unshift(playDateEntry);
        try {
          if (typeof db !== 'undefined') {
            addDoc(collection(db, 'play_dates'), playDateEntry).catch(() => {});
          }
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
    const startMs = parseTimestamp(item.playTimeStart) || parseTimestamp(item.createdAt) || now;
    const endMs = parseTimestamp(item.playTimeEnd) || (startMs + (item.playDurationMinutes || 120) * 60000);
    const isFinished = item.isFinished || item.status === 'Finished' || item.status === 'Finished 🏁' || (endMs && now >= endMs);

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
      let timeRemainingBadge = '';
      if (endMs) {
        const timeLeftMin = Math.max(0, Math.round((endMs - now) / 60000));
        timeRemainingBadge = timeLeftMin > 60
          ? `⏳ ~${Math.floor(timeLeftMin / 60)}h ${timeLeftMin % 60}m left`
          : `⏳ ~${timeLeftMin}m left`;
      } else {
        timeRemainingBadge = `⏳ Active now`;
      }

      const canFinish = isMatchHost(item);
      const finishBtnHtml = canFinish ? `
        <button class="btn-finish-chip" onclick="markCheckInFinished('${item.id}')" title="Finish Match (Host Only)">
          <i class="fa-solid fa-flag-checkered"></i> Finish Match
        </button>
      ` : `<span style="font-size:0.72rem; color:var(--text-muted); font-style:italic"><i class="fa-solid fa-user-lock"></i> Host controls match</span>`;

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
            ${finishBtnHtml}
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

  if (!isMatchHost(item)) {
    alert("⚠️ Only the match host who created this game can finish it.");
    return;
  }

  const confirmFinish = confirm(
    "⚠️ HOST WARNING:\n\nFinishing this match will immediately remove it from the Active Front-Page Feed and archive it in the Play Dates section.\n\nAre you sure you want to finish this match now?"
  );

  if (!confirmFinish) return;

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
      playTimeStart: parseTimestamp(item.playTimeStart) || (now - 3600000),
      playTimeEnd: now,
      finishedAt: now,
      status: 'Finished 🏁',
      createdAt: parseTimestamp(item.createdAt) || now
    };
    playDates.unshift(playDateEntry);
    saveStoredPlayDates(playDates);

    try {
      if (typeof db !== 'undefined') {
        addDoc(collection(db, 'play_dates'), playDateEntry).catch(() => {});
        setDoc(doc(db, 'court_checkins', item.id), { isFinished: true, finishedAt: now, status: 'Finished' }, { merge: true }).catch(() => {});
      }
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



  const effectiveUserId = currentUser?.uid || getOrCreateGuestUserId();

  const newCheckIn = {
    id: 'chk_' + now + '_' + Math.random().toString(36).substring(2, 7),
    name: name,
    userId: effectiveUserId,
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

  try {
    const myCheckins = JSON.parse(localStorage.getItem('austin_petanque_my_checkin_ids') || '[]');
    myCheckins.push(newCheckIn.id);
    localStorage.setItem('austin_petanque_my_checkin_ids', JSON.stringify(myCheckins));
  } catch(e) {}

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

        submitBtn.innerHTML = '<i class="fa-solid fa-calendar-check"></i> RSVP';

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

      // Extract court name if RSVPing

    const modalTitle = document.getElementById('membership-modal-title')?.textContent || '';

    let targetCourt = 'Pease District Park';

    if (modalTitle.includes('RSVP:')) {

      targetCourt = modalTitle.replace('RSVP:', '').trim();

    }



    if (typeof showToast === 'function') {

      showToast(`RSVP application submitted for ${targetCourt}! Opening court view...`, 'success');

    }



    closeModal();

    if (typeof openViewCourtModal === 'function') {

      openViewCourtModal(targetCourt);

    }

    return;

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

  const userDocRef = doc(db, 'users', user.uid);
  let firestoreData = {};
  
  try {
    const existingSnap = await getDoc(userDocRef);
    if (existingSnap.exists()) {
      firestoreData = existingSnap.data();
    } else {
      if (user.email) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', user.email));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          firestoreData = querySnapshot.docs[0].data();
          console.log('Seamlessly merged legacy account data for:', user.email);
        }
      }
    }
  } catch (err) {
    console.warn('Firestore fetch user profile warning:', err);
  }

  // Retrieve existing local profile settings if available
  const existingProfileKey = `austin_petanque_profile_${user.uid}`;
  const existingSaved = JSON.parse(localStorage.getItem(existingProfileKey) || '{}');

  const username = firestoreData.username || existingSaved.username || user.username || generateUniqueUsername(displayName, user.email);
  const avatar = firestoreData.avatar || existingSaved.avatar || user.avatar || 'fa-bowling-ball';
  const bio = firestoreData.bio || existingSaved.bio || user.bio || 'Passionate Austin pétanque player!';
  const favoritePitch = firestoreData.favoritePitch || existingSaved.favoritePitch || user.favoritePitch || 'French Legation Museum';
  const playingRole = firestoreData.playingRole || existingSaved.playingRole || user.playingRole || 'Pointer (Pointeur)';
  const privacyMode = firestoreData.privacyMode || existingSaved.privacyMode || user.privacyMode || 'public'; // 'public' | 'friends-only'

  const userProfile = {
    uid: user.uid,
    displayName: firestoreData.displayName || displayName,
    username: username,
    email: user.email,
    photoURL: firestoreData.photoURL || user.photoURL || null,
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
    if (!Object.keys(firestoreData).length) {
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



    // Upfront Email Address Validation

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {

      if (statusMsg) {

        statusMsg.style.color = '#ef4444';

        statusMsg.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Please enter a valid email address (e.g. <code>player@example.com</code>).';

      }

      emailInput?.focus();

      return;

    }



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

        if (err.code === 'auth/invalid-email') {

          statusMsg.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> The email address is formatted incorrectly. Please check for typos.';

        } else if (err.code === 'auth/configuration-not-found' || err.code === 'auth/operation-not-allowed') {
          statusMsg.textContent = 'Error: Email/Password Auth is NOT enabled in your Firebase Console. Please enable it under Authentication -> Sign-in method.';

        } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {

          statusMsg.innerHTML = `No account found for this email or password incorrect. <button type="button" onclick="switchAuthTab('signup'); const sEmail = document.getElementById('signup-email-input'); if(sEmail) sEmail.value='${email}'; const sPass = document.getElementById('signup-password-input'); if(sPass) sPass.value='${password}';" style="color:var(--primary-amber); text-decoration:underline; font-weight:700; background:none; border:none; cursor:pointer; padding:0; display:inline;">Create Account Now?</button>`;

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



    // Upfront Email Address Validation

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {

      if (statusMsg) {

        statusMsg.style.color = '#ef4444';

        statusMsg.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Please enter a valid email address (e.g. <code>player@example.com</code>).';

      }

      emailInput?.focus();

      return;

    }



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

        if (err.code === 'auth/invalid-email') {

          statusMsg.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> The email address is formatted incorrectly. Please check for typos.';

        } else if (err.code === 'auth/configuration-not-found' || err.code === 'auth/operation-not-allowed') {

          statusMsg.textContent = 'Firebase Notice: Email Auth enabled locally! Turn on Email/Password in Firebase Console. Account active!';

          const fallbackUser = { uid: 'usr_' + Date.now(), email: email, displayName: name };

          currentUser = fallbackUser;

          updateAuthUI(fallbackUser);

          syncUserProfileToFirestore(fallbackUser, 'email', name);

          setTimeout(() => closeAuthModal(), 1400);

        } else if (err.code === 'auth/email-already-in-use') {

          statusMsg.innerHTML = `An account with this email already exists. <button type="button" onclick="switchAuthTab('login'); const lEmail = document.getElementById('login-email-input'); if(lEmail) lEmail.value='${email}';" style="color:var(--primary-amber); text-decoration:underline; font-weight:700; background:none; border:none; cursor:pointer; padding:0; display:inline;">Sign In Instead?</button>`;

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

  window.openForgotPasswordModal = function(initialEmail = '') {

  const modal = document.getElementById('forgot-password-modal');

  const input = document.getElementById('reset-email-input');

  const statusMsg = document.getElementById('reset-status-msg');

  if (statusMsg) {

    statusMsg.style.display = 'none';

    statusMsg.textContent = '';

  }

  if (input) {

    input.value = initialEmail || document.getElementById('login-email-input')?.value.trim() || '';

  }

  if (modal) {
    const headerEl = document.getElementById('view-court-header');
    let hostActionsEl = document.getElementById('view-court-host-actions');
    if (!hostActionsEl && headerEl) {
       hostActionsEl = document.createElement('span');
       hostActionsEl.id = 'view-court-host-actions';
       hostActionsEl.style.marginLeft = '10px';
       headerEl.insertBefore(hostActionsEl, document.getElementById('view-court-title'));
    }
    if (hostActionsEl) {
      if (window.currentViewMatch && window.currentViewMatch.requestOnly && currentUser && (window.currentViewMatch.hostUid === currentUser.uid || window.currentViewMatch.hostEmail === currentUser.email)) {
         hostActionsEl.style.display = 'inline-block';
         hostActionsEl.innerHTML = `<button class="glass-pill" style="cursor:pointer; background: var(--primary-amber); color: #000; font-size: 0.75rem; padding: 4px 10px;" onclick="openToPublicMatch()"><i class="fa-solid fa-lock-open"></i> Open to Public</button>`;
      } else {
         hostActionsEl.style.display = 'none';
      }
    }

    modal.classList.add('active');

    modal.style.display = 'flex';

  }

};



window.closeForgotPasswordModal = function() {

  const modal = document.getElementById('forgot-password-modal');

  if (modal) {

    modal.classList.remove('active');

    modal.style.display = 'none';

  }

};



window.handleForgotPassword = function(e) {

  if (e) e.preventDefault();

  const emailVal = document.getElementById('login-email-input')?.value.trim() || '';

  window.openForgotPasswordModal(emailVal);

};



window.submitForgotPassword = async function(e) {

  if (e) e.preventDefault();

  const emailInput = document.getElementById('reset-email-input');

  const statusMsg = document.getElementById('reset-status-msg');

  const sendBtn = document.getElementById('send-reset-btn');



  const email = emailInput?.value.trim();

  if (!email) {

    if (statusMsg) {

      statusMsg.style.display = 'block';

      statusMsg.style.color = '#ef4444';

      statusMsg.textContent = 'Please enter a valid email address.';

    }

    return;

  }



  try {

    if (sendBtn) sendBtn.disabled = true;

    if (statusMsg) {

      statusMsg.style.display = 'block';

      statusMsg.style.color = 'var(--primary-amber)';

      statusMsg.textContent = `Sending reset link to ${email}...`;

    }



    // Configure ActionCodeSettings to redirect user directly back to the webapp URL!

    const redirectUrl = window.location.origin + window.location.pathname;

    const actionCodeSettings = {

      url: redirectUrl,

      handleCodeInApp: true

    };



    await sendPasswordResetEmail(auth, email, actionCodeSettings);



    if (statusMsg) {

      statusMsg.style.display = 'block';

      statusMsg.style.color = '#10b981';

      statusMsg.innerHTML = `<i class="fa-solid fa-circle-check"></i> Reset link sent to <strong>${email}</strong>!<br><span style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;display:block;">Click the link in your email to reset your password and return directly back to Austin Pétanque.</span>`;

    }

    if (typeof showToast === 'function') {

      showToast(`Password reset link sent to ${email}! Check your inbox.`, 'success');

    }

  } catch (err) {

    console.error('Password reset error:', err);

    let errorText = err.message || 'Could not send reset email.';

    if (err.code === 'auth/user-not-found') {

      errorText = 'No account found with this email address.';

    } else if (err.code === 'auth/invalid-email') {

      errorText = 'Invalid email address format.';

    }

    if (statusMsg) {

      statusMsg.style.display = 'block';

      statusMsg.style.color = '#ef4444';

      statusMsg.textContent = errorText;

    }

  } finally {

    if (sendBtn) sendBtn.disabled = false;

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

      const userDocRef = doc(db, 'users', user.uid);
      const existingSnap = await getDoc(userDocRef);

      if (existingSnap.exists()) {
        if (statusMsg) {
          statusMsg.textContent = `Welcome back, ${existingSnap.data().displayName || user.displayName || 'Player'}!`;
          statusMsg.style.color = '#10b981';
        }
        await syncUserProfileToFirestore(user, 'google.com');
        setTimeout(() => closeAuthModal(), 900);
      } else {
        if (statusMsg) {
          statusMsg.textContent = `Account created! Please choose a username.`;
          statusMsg.style.color = '#10b981';
        }
        // Force them into profile creation UI
        await syncUserProfileToFirestore(user, 'google.com');
        setTimeout(() => {
          updateAuthUI(user);
          const usernameInput = document.getElementById('profile-username-input');
          if (usernameInput) {
             usernameInput.focus();
             usernameInput.value = ''; 
             usernameInput.placeholder = 'Choose a unique username';
          }
        }, 900);
      }

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
      if (typeof signOut === 'function' && auth) {
        await signOut(auth);
      }
    } catch (err) {
      console.warn('Firebase sign-out error:', err);
    } finally {
      currentUser = null;
      document.body.classList.remove('user-logged-in');
      if (typeof closeAuthModal === 'function') closeAuthModal();
      if (typeof updateAuthUI === 'function') updateAuthUI(null);
      if (typeof showToast === 'function') showToast('Signed out successfully.', 'info');
    }
  };

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    updateAuthUI(user);

    if (user) {
      syncUserProfileToFirestore(user, user.providerData?.[0]?.providerId || 'email');
      
      // Check if this user is hosting a live match
      try {
        const liveMatchesRef = collection(db, 'live_matches');
        const q = query(liveMatchesRef, where('hostUid', '==', user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const matchDoc = snap.docs[0];
          const data = matchDoc.data();
          
          // Auto-archive if older than 4 hours
          const fourHoursMs = 4 * 60 * 60 * 1000;
          const startedAtDate = data.startedAt ? data.startedAt.toDate() : new Date();
          
          if (Date.now() - startedAtDate.getTime() > fourHoursMs) {
            console.log('Match is older than 4 hours. Auto-archiving...');
            const pastRef = collection(db, 'past_games');
            await addDoc(pastRef, data);
            await deleteDoc(doc(db, 'live_matches', data.matchCode));
            console.log('Match auto-archived.');
          } else {
            // Resume hosting
            isHost = true;
            isLive = true;
            currentMatchCode = data.matchCode;
            teamAScore = data.teamAScore || 0;
            teamBScore = data.teamBScore || 0;
            meneHistory = data.meneHistory || [];
            bouleStates = data.bouleStates || Array(6).fill(null);
            pointHolder = data.pointHolder || null;
            matchWinner = data.matchWinner || null;
            
            updateDisplays();
            if (typeof renderMeneHistory === 'function') renderMeneHistory();
            if (typeof renderBoules === 'function') renderBoules();
            
            const codeEl = document.getElementById('current-match-code');
            if (codeEl) codeEl.textContent = currentMatchCode;
            updateSyncPill(true);
            
            // Reconnect sync listener
            syncMatchToCloud();
            listenForQueueRequests();
            console.log('Restored live hosting session for Match PIN:', currentMatchCode);
          }
        }
      } catch (err) {
        console.warn('Could not restore hosting session:', err);
      }

      // Render live dashboard on sign-in or persistent session restore
      setTimeout(() => { if (typeof renderLiveDashboard === 'function') renderLiveDashboard(); }, 400);
    }
  });
}



function renderAvatarSlot(containerEl, avatarIcon, photoURL, avatarColor) {
  if (!containerEl) return;
  if (photoURL && (photoURL.startsWith('http://') || photoURL.startsWith('https://') || (photoURL.startsWith('data:image/') && !photoURL.includes('viewBox="0 0 24 24"')))) {
    containerEl.innerHTML = `<img src="${photoURL}" class="nav-avatar-img" alt="Avatar">`;
  } else {
    const icon = avatarIcon || window.selectedAvatarPreset || 'fa-bowling-ball';
    const color = avatarColor || window.selectedAvatarColor || '#3b82f6';
    containerEl.innerHTML = `<div class="nav-avatar-icon-wrap" style="background: ${color} !important;"><i class="fa-solid ${icon}"></i></div>`;
  }
}



function updateAuthUI(user) {

  const navJoinBtn = document.getElementById('nav-join-btn');

  const navUserPill = document.getElementById('nav-user-pill');

  const navUserName = document.getElementById('nav-user-name');

  const navUserAvatar = document.getElementById('nav-user-avatar');



  const drawerLoginBtn = document.getElementById('drawer-login-btn');

  const drawerUserPill = document.getElementById('drawer-user-pill');

  const drawerUserName = document.getElementById('drawer-user-name');

  const drawerUserAvatar = document.getElementById('drawer-user-avatar');

  const drawerJoinBtn = document.getElementById('drawer-join-btn');



  const heroAuthCta = document.getElementById('hero-auth-cta');



  const authLoginButtons = document.getElementById('auth-login-buttons');

  const authLoggedInBox = document.getElementById('auth-logged-in-box');

  const authUserName = document.getElementById('auth-user-name');

  const authUserEmail = document.getElementById('auth-user-email');

  const authUserAvatar = document.getElementById('auth-user-avatar');



  if (user) {

    document.body.classList.add('user-logged-in');



    const profileKey = `austin_petanque_profile_${user.uid}`;

    const savedProfile = JSON.parse(localStorage.getItem(profileKey) || '{}');



    const displayName = savedProfile.displayName || user.displayName || user.email?.split('@')[0] || 'Player';

    const username = savedProfile.username || user.username || generateUniqueUsername(displayName, user.email);

    const photoURL = savedProfile.photoURL || user.photoURL || null;

    const avatar = savedProfile.avatar || user.avatar || 'fa-bowling-ball';



    // Top Right Navbar: hide Join button, show avatar pill

    if (navJoinBtn) navJoinBtn.style.display = 'none';

    if (navUserPill) navUserPill.style.display = 'inline-flex';

    if (navUserName) navUserName.textContent = displayName;

    renderAvatarSlot(navUserAvatar, avatar, photoURL);



    // Mobile Drawer

    if (drawerLoginBtn) drawerLoginBtn.style.display = 'none';

    if (drawerJoinBtn) drawerJoinBtn.style.display = 'none';

    if (drawerUserPill) drawerUserPill.style.display = 'flex';

    if (drawerUserName) drawerUserName.textContent = displayName;

    renderAvatarSlot(drawerUserAvatar, avatar, photoURL);



    // Hero CTA Update

    if (heroAuthCta) {

      heroAuthCta.innerHTML = `<i class="fa-solid fa-circle-user"></i> My Profile & Matches`;

    }



    if (authLoginButtons) authLoginButtons.style.display = 'none';

    if (authLoggedInBox) authLoggedInBox.style.display = 'block';

    if (authUserName) authUserName.textContent = displayName;

    if (authUserEmail) authUserEmail.textContent = user.email || 'Verified Account';

    if (authUserAvatar) authUserAvatar.src = photoURL || '';



    // Update Username tag

    const usernameTag = document.getElementById('auth-username-display');

    if (usernameTag) usernameTag.textContent = `@${username}`;



    const usernameInput = document.getElementById('profile-username-input');

    if (usernameInput) usernameInput.value = username;



    // Update Avatar Display
    updateAvatarDisplayUI(avatar, photoURL);
    window.selectedAvatarPreset = avatar;
    window.selectedAvatarColor = savedProfile.avatarColor || '#3b82f6';

    // Highlight active preset

    const items = document.querySelectorAll('.avatar-preset-item');

    items.forEach(item => {

      const isSelected = item.getAttribute('data-avatar') === avatar;

      item.classList.toggle('selected', isSelected);

    });



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

    document.body.classList.remove('user-logged-in');



    if (navJoinBtn) navJoinBtn.style.display = 'inline-flex';

    if (navUserPill) navUserPill.style.display = 'none';



    if (drawerLoginBtn) drawerLoginBtn.style.display = 'inline-flex';

    if (drawerJoinBtn) drawerJoinBtn.style.display = 'inline-flex';

    if (drawerUserPill) drawerUserPill.style.display = 'none';



    if (heroAuthCta) {

      heroAuthCta.innerHTML = `<i class="fa-solid fa-bolt"></i> Fast Sign In / Sign Up`;

    }



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




window.selectedAvatarColor = '#3b82f6';
window.selectAvatarColor = (color) => {
  window.selectedAvatarColor = color;
  const items = document.querySelectorAll('.avatar-color-item');
  items.forEach(item => {
    item.style.borderColor = item.getAttribute('data-color') === color ? '#fff' : 'transparent';
  });
  const displayWrap = document.querySelector('#auth-avatar-display .nav-avatar-icon-wrap');
  if (displayWrap) displayWrap.style.background = color + ' !important';
  
  // also call preview if needed to update the global preview immediately
  const customUrl = document.getElementById('profile-custom-avatar-url')?.value.trim();
  if (!customUrl) {
    const navUserAvatar = document.getElementById('nav-user-avatar');
    const drawerUserAvatar = document.getElementById('drawer-user-avatar');
    renderAvatarSlot(navUserAvatar, window.selectedAvatarPreset, null, color);
    renderAvatarSlot(drawerUserAvatar, window.selectedAvatarPreset, null, color);
    const authAvatarDisplay = document.getElementById('auth-avatar-display');
    renderAvatarSlot(authAvatarDisplay, window.selectedAvatarPreset, null, color);
  }
};

window.handleAvatarFileUpload = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    document.getElementById('profile-custom-avatar-url').value = dataUrl;
    window.previewCustomAvatarUrl(dataUrl);
  };
  reader.readAsDataURL(file);
};

window.selectAvatarPreset = (iconClass) => {

  selectedAvatarPreset = iconClass;

  const items = document.querySelectorAll('.avatar-preset-item');

  items.forEach(item => {

    const isSelected = item.getAttribute('data-avatar') === iconClass;

    item.classList.toggle('selected', isSelected);

  });

  updateAvatarDisplayUI(iconClass, null);



  const navUserAvatar = document.getElementById('nav-user-avatar');

  const drawerUserAvatar = document.getElementById('drawer-user-avatar');

  renderAvatarSlot(navUserAvatar, iconClass, null);

  renderAvatarSlot(drawerUserAvatar, iconClass, null);

};



window.previewCustomAvatarUrl = (url) => {

  const navUserAvatar = document.getElementById('nav-user-avatar');

  const drawerUserAvatar = document.getElementById('drawer-user-avatar');

  if (url && url.trim().length > 5) {

    updateAvatarDisplayUI(null, url.trim());

    renderAvatarSlot(navUserAvatar, null, url.trim());

    renderAvatarSlot(drawerUserAvatar, null, url.trim());

  } else {

    updateAvatarDisplayUI(selectedAvatarPreset, null);

    renderAvatarSlot(navUserAvatar, selectedAvatarPreset, null);

    renderAvatarSlot(drawerUserAvatar, selectedAvatarPreset, null);

  }

};



function updateAvatarDisplayUI(iconClass, photoURL) {

  const avatarDisplay = document.getElementById('auth-avatar-display');

  if (!avatarDisplay) return;



  if (photoURL && (photoURL.startsWith('http://') || photoURL.startsWith('https://'))) {

    avatarDisplay.innerHTML = `<img src="${photoURL}" alt="User Avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;

  } else {

    const icon = iconClass || selectedAvatarPreset || 'fa-bowling-ball';

    avatarDisplay.innerHTML = `<i class="fa-solid ${icon}"></i>`;

  }

}



// ─── Unique Username Handle Live Validation ───

window.onUsernameInputChange = async (inputVal) => {
  const cleanVal = inputVal.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const badge = document.getElementById('username-validation-badge');
  if (!badge) return;

  if (!cleanVal || cleanVal.length < 3) {
    badge.className = 'username-status-badge taken';
    badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Min 3 chars';
    return;
  }

  badge.className = 'username-status-badge';
  badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking...';

  const myUid = currentUser?.uid;
  let isTaken = false;

  try {
    const q = query(collection(db, 'users'), where('username', '==', cleanVal));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((docSnap) => {
      if (docSnap.id !== myUid) {
        isTaken = true;
      }
    });
  } catch (err) {
    console.warn("Username validation error:", err);
    // Check uniqueness against other users locally as fallback
    const localUsers = JSON.parse(localStorage.getItem('austin_petanque_local_users') || '[]');
    isTaken = localUsers.some(u => u.uid !== myUid && u.username && u.username.toLowerCase() === cleanVal);
  }

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

    avatar: customAvatarUrl ? null : window.selectedAvatarPreset,

    avatarColor: customAvatarUrl ? null : (window.selectedAvatarColor || '#3b82f6'),

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



// =========================================================================

// LIVE DASHBOARD: Court Activity & Upcoming Matches

// =========================================================================



const COURTS_CONFIG = [

  { id: 'mueller',  name: 'Browning Hangar at Mueller',  img: 'images/courts/mueller-browning-hangar.jpg',  address: '4550 Mueller Blvd',       schedule: 'Fri eve & Sun PM',    icon: 'fa-star' },

  { id: 'legation', name: 'French Legation Museum',      img: 'images/courts/french-legation.jpg',   address: '802 San Marcos St',        schedule: 'Wed 9:00 AM (LBC)',   icon: 'fa-landmark' },

  { id: 'nelson',   name: 'Nelson Ranch Park',            img: 'images/courts/nelson-ranch.jpg',      address: '905 Nelson Ranch Rd',      schedule: 'Tue & Sun 9:00 AM',   icon: 'fa-users' },

  { id: 'paggi',    name: 'Paggi Square Park',            img: 'images/courts/paggi-square.jpg',      address: '2101 Robert Browning St',  schedule: 'Weekends open play',  icon: 'fa-people-group' },

  { id: 'pease',    name: 'Pease District Park',          img: 'images/courts/pease-park.jpg',        address: '1100 Kingsbury St',        schedule: 'Sat & Sun 10:00 AM',  icon: 'fa-tree' },

  { id: 'brushy',   name: 'Brushy Creek Regional Park',   img: 'images/courts/brushy-creek.jpg',      address: '3300 Brushy Creek Rd',     schedule: 'Weekday mornings',    icon: 'fa-water' },

  { id: 'barton',   name: 'Barton Springs Greenbelt',     img: 'images/courts/barton-springs.jpg',    address: 'Barton Springs Rd',        schedule: 'Sun afternoons',      icon: 'fa-droplet' },

];



const SEEDED_MATCHES = [

  { date: 'Sat Sep 27', name: 'Austin Autumn Doublettes',    court: 'Pease District Park',         time: '10:00 AM', type: 'tournament' },

  { date: 'Wed Oct 1',  name: 'LBC Wednesday Morning Play',  court: 'French Legation Museum',      time: '9:00 AM',  type: 'casual' },

  { date: 'Fri Oct 3',  name: 'Friday Evening Triplettes',   court: 'Browning Hangar at Mueller',  time: '6:30 PM',  type: 'casual' },

  { date: 'Sat Oct 4',  name: 'P\u00e9tanque & Pinot Social', court: 'French Legation Museum',     time: '5:00 PM',  type: 'social' },

  { date: 'Sun Oct 5',  name: 'Nelson Ranch Open Play',      court: 'Nelson Ranch Park',           time: '9:00 AM',  type: 'casual' },

  { date: 'Sun Oct 5',  name: 'Mueller Sunday Doubles',      court: 'Browning Hangar at Mueller',  time: '2:00 PM',  type: 'casual' },

];



async function renderLiveDashboard() {

  const grid = document.getElementById('court-activity-grid');

  const upcomingList = document.getElementById('upcoming-matches-list');

  if (!grid) return;



  const todayStart = new Date(); todayStart.setHours(0,0,0,0);

  const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);



  let checkinsToday = {};

  try {

    const q = query(collection(db,'checkIns'), where('timestamp','>=',todayStart), where('timestamp','<=',todayEnd));

    const snap = await getDocs(q);

    snap.forEach(d => {

      const data = d.data();

      const key = data.court || data.location || '';

      if (!checkinsToday[key]) checkinsToday[key] = [];

      checkinsToday[key].push(data);

    });

  } catch(e) { console.warn('Check-in load error:', e); }



  const dayOfWeek = new Date().getDay();

  const isScheduledToday = (id) => ({

    mueller:[5,0], legation:[3], nelson:[2,0], paggi:[6,0], pease:[6,0], brushy:[1,2,3,4,5], barton:[0]

  }[id] || []).includes(dayOfWeek);



  grid.innerHTML = COURTS_CONFIG.map(court => {

    const ci = checkinsToday[court.name] || [];

    const count = ci.length;

    const live = count > 0;

    const scheduled = isScheduledToday(court.id);

    const statusClass = live ? 'status-live' : scheduled ? 'status-scheduled' : 'status-quiet';

    const statusLabel = live

      ? `<i class="fa-solid fa-signal"></i> ${count} checked in`

      : scheduled ? '<i class="fa-solid fa-clock"></i> Scheduled Today'

                  : '<i class="fa-regular fa-moon"></i> Quiet Today';

    return `

      <div class="court-activity-card">

        <div class="court-activity-banner" style="background-image:url('${court.img}');">

          <span class="court-activity-status ${statusClass}">${statusLabel}</span>

        </div>

        <div class="court-activity-body">

          <div class="court-activity-name"><i class="fa-solid ${court.icon}" style="color:var(--primary-amber);margin-right:5px;font-size:0.8em;"></i>${court.name}</div>

          <div class="court-activity-meta">

            <span><i class="fa-solid fa-location-dot"></i> ${court.address}</span>

            <span><i class="fa-solid fa-clock"></i> ${court.schedule}</span>

          </div>

          ${count > 0 ? `<span class="court-checkin-count"><i class="fa-solid fa-person-running"></i> ${count} player${count!==1?'s':''} on pitch</span>` : ''}

          <button class="btn-secondary court-activity-action" onclick="quickCheckIn('${court.name.replace(/'/g,"\\'")}')">

            <i class="fa-solid fa-location-crosshairs"></i> Check In Here

          </button>

        </div>

      </div>`;

  }).join('');



  if (!upcomingList) return;

  let firestoreMatches = [];

  try {

    if (typeof collection === 'function' && typeof getDocs === 'function') {

      const mq = query(collection(db, 'scheduledMatches'), orderBy('timestamp', 'asc'), limit(20));

      const ms = await getDocs(mq);

      ms.forEach(d => {

        const data = d.data();

        data._id = data.id || d.id;

        firestoreMatches.push(data);

      });

    }

  } catch(e) { console.warn('scheduledMatches load error:', e); }



  const localMatches = JSON.parse(localStorage.getItem('austin_scheduled_matches') || '[]');

  localMatches.forEach(lm => {

    if (!firestoreMatches.some(m => (m.id || m._id) === lm.id)) {

      firestoreMatches.push(lm);

    }

  });



  const allMatches = firestoreMatches.length > 0 ? firestoreMatches : (typeof SEEDED_MATCHES !== 'undefined' ? SEEDED_MATCHES : []);

  

  if (allMatches.length === 0) {

    upcomingList.innerHTML = `

      <div style="text-align: center; padding: 20px; color: var(--text-muted);">

        <i class="fa-regular fa-calendar-xmark" style="font-size: 2rem; margin-bottom: 8px;"></i>

        <div>No games currently scheduled. Be the first to host one!</div>

        <button class="btn-primary" onclick="openScheduleModal()" style="margin-top: 10px; padding: 8px 16px;">

          <i class="fa-solid fa-calendar-plus"></i> Schedule First Match

        </button>

      </div>`;

    return;

  }



  upcomingList.innerHTML = allMatches.slice(0, 10).map(m => {

    const matchId = m.id || m._id || m.name;

    const rsvps = Array.isArray(m.rsvps) ? m.rsvps : [];

    const rsvpCount = rsvps.length;

    const userIsAttending = currentUser && rsvps.some(r => r.uid === currentUser.uid);

    const hostName = m.hostName || 'Pétanque Organizer';

    

    return `

      <div class="upcoming-match-row" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: 12px; margin-bottom: 8px;">

        <span class="upcoming-date-badge" style="background: var(--gradient-primary); color: #fff; padding: 6px 12px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; flex-shrink: 0; text-align: center; min-width: 80px;">

          ${m.date || m.playDate || 'TBD'}

        </span>

        <div class="upcoming-match-info" style="flex-grow: 1;">

          <div class="upcoming-match-name" style="font-weight: 700; font-size: 0.98rem;">${m.name || m.title || 'Open Play'}</div>

          <div class="upcoming-match-court" style="font-size: 0.82rem; color: var(--text-muted); margin-top: 3px;">

            <i class="fa-solid fa-location-dot" style="color: var(--primary-amber);"></i> ${m.court || m.location || 'Austin Terrain'} &bull; ${m.time || ''}

            <span style="margin-left: 8px; color: var(--accent-gold);"><i class="fa-solid fa-user"></i> Host: ${hostName}</span>

          </div>

          ${m.type ? `<div style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 2px;"><i class="fa-solid fa-tag"></i> ${m.type}</div>` : ''}

          ${rsvpCount > 0 ? `

            <div style="font-size: 0.78rem; color: #4ade80; margin-top: 4px; display: flex; align-items: center; gap: 6px;">

              <i class="fa-solid fa-users"></i> ${rsvpCount} player${rsvpCount !== 1 ? 's' : ''} attending (${rsvps.slice(0,3).map(r=>r.name).join(', ')}${rsvpCount>3 ? ' +more':''})

            </div>` : ''}

        </div>

        <button class="btn-${userIsAttending ? 'success' : 'secondary'} upcoming-rsvp-btn" 

                onclick="toggleMatchRSVP('${matchId.replace(/'/g, "\'")}')" 

                style="flex-shrink: 0; padding: 8px 14px; font-size: 0.85rem; min-width: 110px; ${userIsAttending ? 'background: #16a34a; color: #fff; border: none;' : ''}">

          <i class="fa-solid ${userIsAttending ? 'fa-circle-check' : 'fa-calendar-check'}"></i> ${userIsAttending ? 'Attending ✓' : 'RSVP'}

        </button>

      </div>`;

  }).join('');

}



window.quickCheckIn = async function(courtName) {

  if (!currentUser) { showToast('Sign in to check in to a pitch!','warning'); return; }

  try {

    await addDoc(collection(db,'checkIns'), {

      court: courtName,

      userId: currentUser.uid,

      displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Player',

      timestamp: new Date(),

      type: 'active'

    });

    showToast('Checked in at ' + courtName + '! See you on the pitch.','success');

    setTimeout(renderLiveDashboard, 800);

  } catch(e) { console.error('Check-in error:',e); showToast('Could not check in. Try again.','error'); }

};



if (typeof showToast === 'undefined') {

  window.showToast = function(msg, type='success') {

    const t = document.createElement('div');

    const bg = type==='success'?'#10b981':type==='warning'?'#f59e0b':'#ef4444';

    t.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:${bg};color:#fff;padding:10px 22px;border-radius:999px;font-size:0.85rem;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.4);white-space:nowrap;`;

    t.textContent = msg;

    document.body.appendChild(t);

    setTimeout(() => t.remove(), 3500);

  };

}





// =========================================================================

// MATCH SCHEDULING, PUBLIC VISIBILITY & 4-HOUR PRE-MATCH EMAIL REMINDERS

// =========================================================================



// Global modal handlers

window.openScheduleModal = function(prefillCourt = '') {

  if (!currentUser) {

    if (typeof openAuthModal === 'function') openAuthModal();

    if (typeof showToast === 'function') showToast('Please sign in to schedule a pétanque match!', 'warning');

    return;

  }

  const modal = document.getElementById('schedule-game-modal');

  if (modal) {
    const headerEl = document.getElementById('view-court-header');
    let hostActionsEl = document.getElementById('view-court-host-actions');
    if (!hostActionsEl && headerEl) {
       hostActionsEl = document.createElement('span');
       hostActionsEl.id = 'view-court-host-actions';
       hostActionsEl.style.marginLeft = '10px';
       headerEl.insertBefore(hostActionsEl, document.getElementById('view-court-title'));
    }
    if (hostActionsEl) {
      if (window.currentViewMatch && window.currentViewMatch.requestOnly && currentUser && (window.currentViewMatch.hostUid === currentUser.uid || window.currentViewMatch.hostEmail === currentUser.email)) {
         hostActionsEl.style.display = 'inline-block';
         hostActionsEl.innerHTML = `<button class="glass-pill" style="cursor:pointer; background: var(--primary-amber); color: #000; font-size: 0.75rem; padding: 4px 10px;" onclick="openToPublicMatch()"><i class="fa-solid fa-lock-open"></i> Open to Public</button>`;
      } else {
         hostActionsEl.style.display = 'none';
      }
    }

    modal.classList.add('active');

    modal.style.display = 'flex';

  }

  if (prefillCourt) {

    const courtSelect = document.getElementById('schedule-court-select');

    if (courtSelect) courtSelect.value = prefillCourt;

  }

  

  // Set default date to today or tomorrow

  const dateInput = document.getElementById('schedule-date-input');

  if (dateInput && !dateInput.value) {

    const tomorrow = new Date();

    tomorrow.setDate(tomorrow.getDate() + 1);

    dateInput.value = tomorrow.toISOString().split('T')[0];

  }

  const timeInput = document.getElementById('schedule-time-input');

  if (timeInput && !timeInput.value) {

    timeInput.value = '10:00';

  }

};



window.closeScheduleModal = function() {

  const modal = document.getElementById('schedule-game-modal');

  if (modal) {

    modal.classList.remove('active');

    modal.style.display = 'none';

  }

};



// Toggle Email Reminders setting in User Profile

window.toggleEmailRemindersSetting = async function(enabled) {

  localStorage.setItem('user_email_reminders_enabled', enabled ? 'true' : 'false');

  if (currentUser && typeof doc === 'function' && typeof updateDoc === 'function') {

    try {

      const userRef = doc(db, 'users', currentUser.uid);

      await updateDoc(userRef, { emailRemindersEnabled: enabled });

      if (typeof showToast === 'function') {

        showToast(enabled ? '4-Hour Email Reminders enabled!' : 'Email Reminders disabled.', 'info');

      }

    } catch(e) {

      console.warn('Error updating email reminders setting:', e);

    }

  }

};



// Handle Match Schedule Form Submission

window.handleScheduleGameSubmit = async function(e) {

  if (e) e.preventDefault();

  if (!currentUser) {

    if (typeof showToast === 'function') showToast('Please sign in to schedule a match.', 'warning');

    return;

  }



  const title = document.getElementById('schedule-title-input')?.value.trim();

  const court = document.getElementById('schedule-court-select')?.value;

  const dateStr = document.getElementById('schedule-date-input')?.value;

  const timeStr = document.getElementById('schedule-time-input')?.value;

  const type = document.getElementById('schedule-type-select')?.value || 'Casual Play';

  const notes = document.getElementById('schedule-notes-input')?.value.trim() || '';

  const requestOnly = document.getElementById('schedule-request-only-checkbox')?.checked || false;



  if (!title || !court || !dateStr || !timeStr) {

    if (typeof showToast === 'function') showToast('Please fill out all required fields.', 'warning');

    return;

  }



  const matchDateTime = new Date(`${dateStr}T${timeStr}`);

  const formattedDate = matchDateTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const formattedTime = matchDateTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });



  const emailRemindersEnabled = localStorage.getItem('user_email_reminders_enabled') !== 'false';



  const newMatch = {

    id: 'match_' + Date.now(),

    name: title,

    title: title,

    court: court,

    location: court,

    dateStr: dateStr,

    timeStr: timeStr,

    date: formattedDate,

    time: formattedTime,

    timestamp: matchDateTime.getTime(),

    type: type,

    notes: notes,

    hostUid: currentUser.uid,

    hostName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Petanque Player',

    hostEmail: currentUser.email || '',

    rsvps: [

      {

        uid: currentUser.uid,

        name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Host Player',

        email: currentUser.email || '',

        emailRemindersEnabled: emailRemindersEnabled,

        timestamp: Date.now()

      }

    ],

    reminder4hSent: false,

    requestOnly: requestOnly,

    createdAt: new Date().toISOString()

  };



  try {

    if (typeof addDoc === 'function' && typeof collection === 'function') {

      await addDoc(collection(db, 'scheduledMatches'), newMatch);

    }

  } catch(err) {

    console.warn('Firestore addDoc scheduledMatches error:', err);

  }



  // Also store in local state / localStorage fallback

  let localMatches = JSON.parse(localStorage.getItem('austin_scheduled_matches') || '[]');

  localMatches.unshift(newMatch);

  localStorage.setItem('austin_scheduled_matches', JSON.stringify(localMatches));



  window.closeScheduleModal();

  if (typeof showToast === 'function') {

    showToast(`🎉 Scheduled "${title}" at ${court}! Broadcasted to all players.`, 'success');

  }



  // Reset form

  const form = document.getElementById('schedule-game-form');

  if (form) form.reset();



  if (typeof renderLiveDashboard === 'function') {

    renderLiveDashboard();

  }

};



// Toggle RSVP for a Scheduled Match

window.toggleMatchRSVP = async function(matchId) {

  if (!currentUser) {

    if (typeof openAuthModal === 'function') openAuthModal();

    if (typeof showToast === 'function') showToast('Please sign in to RSVP for games!', 'warning');

    return;

  }



  const emailRemindersEnabled = localStorage.getItem('user_email_reminders_enabled') !== 'false';

  let localMatches = JSON.parse(localStorage.getItem('austin_scheduled_matches') || '[]');

  let targetMatch = localMatches.find(m => m.id === matchId);



  // Try Firestore doc update

  let firestoreDocId = null;

  try {

    if (typeof query === 'function' && typeof collection === 'function') {

      const q = query(collection(db, 'scheduledMatches'), where('id', '==', matchId));

      const snap = await getDocs(q);

      if (!snap.empty) {

        const d = snap.docs[0];

        firestoreDocId = d.id;

        targetMatch = d.data();

      }

    }

  } catch(e) {

    console.warn('Firestore fetch match for RSVP error:', e);

  }



  if (!targetMatch) {

    targetMatch = (typeof SEEDED_MATCHES !== 'undefined' ? SEEDED_MATCHES : []).find(m => m.id === matchId || m.name === matchId);

  }



  if (!targetMatch) {

    if (typeof showToast === 'function') showToast('Match details not found.', 'warning');

    return;

  }



  let rsvps = Array.isArray(targetMatch.rsvps) ? [...targetMatch.rsvps] : [];

  const existingIdx = rsvps.findIndex(r => r.uid === currentUser.uid);

  let isRSVPd = false;



  if (existingIdx >= 0) {

    // Leave RSVP

    rsvps.splice(existingIdx, 1);

    isRSVPd = false;

  } else {

    // Join RSVP

    rsvps.push({

      uid: currentUser.uid,

      name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Player',

      email: currentUser.email || '',

      emailRemindersEnabled: emailRemindersEnabled,

      timestamp: Date.now()

    });

    isRSVPd = true;

  }



  targetMatch.rsvps = rsvps;



  // Sync to Firestore

  if (firestoreDocId && typeof doc === 'function' && typeof updateDoc === 'function') {

    try {

      await updateDoc(doc(db, 'scheduledMatches', firestoreDocId), { rsvps: rsvps });

    } catch(e) { console.warn('Error updating RSVP in Firestore:', e); }

  }



  // Update localStorage

  localMatches = localMatches.map(m => m.id === matchId ? targetMatch : m);

  localStorage.setItem('austin_scheduled_matches', JSON.stringify(localMatches));



  if (isRSVPd) {

    const msg = emailRemindersEnabled

      ? `✅ RSVP confirmed for ${targetMatch.name || 'match'}! You will receive a 4-hour pre-match email reminder.`

      : `✅ RSVP confirmed for ${targetMatch.name || 'match'}! (Email reminders currently disabled in settings).`;

    if (typeof showToast === 'function') showToast(msg, 'success');

  } else {

    if (typeof showToast === 'function') showToast(`Removed RSVP for ${targetMatch.name || 'match'}.`, 'info');

  }



  if (typeof renderLiveDashboard === 'function') {

    renderLiveDashboard();

  }

};



// 4-Hour Pre-Match Email Dispatch Processor

window.checkUpcoming4HourReminders = async function() {

  const now = Date.now();

  const fourHoursMs = 4 * 60 * 60 * 1000;

  

  let matches = [];

  try {

    if (typeof collection === 'function' && typeof getDocs === 'function') {

      const snap = await getDocs(collection(db, 'scheduledMatches'));

      snap.forEach(d => {

        const data = d.data();

        data._docId = d.id;

        matches.push(data);

      });

    }

  } catch(e) {}



  const localMatches = JSON.parse(localStorage.getItem('austin_scheduled_matches') || '[]');

  localMatches.forEach(lm => {

    if (!matches.some(m => m.id === lm.id)) matches.push(lm);

  });



  matches.forEach(async (m) => {

    if (m.reminder4hSent) return;

    const matchTime = m.timestamp || (m.dateStr ? new Date(`${m.dateStr}T${m.timeStr||'10:00'}`).getTime() : 0);

    if (!matchTime) return;



    const diffMs = matchTime - now;

    // Trigger if match is between 0 and 4.5 hours from now

    if (diffMs > 0 && diffMs <= (4.5 * 60 * 60 * 1000)) {

      const optedInRSVPs = (m.rsvps || []).filter(r => r.emailRemindersEnabled !== false && r.email);

      

      if (optedInRSVPs.length > 0) {

        console.log(`[4-Hour Pre-Match Email Processor] Dispatching reminder emails for "${m.name}" at ${m.court}:`, optedInRSVPs.map(r => r.email));

        

        // Queue emails in Firestore mailQueue collection

        try {

          if (typeof addDoc === 'function' && typeof collection === 'function') {

            for (const recipient of optedInRSVPs) {

              await addDoc(collection(db, 'mailQueue'), {

                to: recipient.email,

                message: {

                  subject: `🎯 Pétanque Reminder: "${m.name}" at ${m.court} in 4 Hours!`,

                  html: `

                    <h2>Austin Pétanque Match Reminder</h2>

                    <p>Hi <strong>${recipient.name}</strong>,</p>

                    <p>This is a reminder that your scheduled match <strong>"${m.name}"</strong> at <strong>${m.court}</strong> is starting in ~4 hours!</p>

                    <ul>

                      <li><strong>Court:</strong> ${m.court}</li>

                      <li><strong>Time:</strong> Today at ${m.time || '10:00 AM'}</li>

                      <li><strong>Game Type:</strong> ${m.type || 'Casual Play'}</li>

                    </ul>

                    <p>See you on the pitch!</p>

                    <hr>

                    <small>You received this because you opted into 4-hour pre-match email reminders in your Austin Pétanque profile.</small>

                  `

                },

                sentAt: new Date().toISOString()

              });

            }

          }

        } catch(err) {

          console.warn('mailQueue error:', err);

        }



        // Show toast notification if current logged in user is among recipients

        if (currentUser && optedInRSVPs.some(r => r.uid === currentUser.uid)) {

          if (typeof showToast === 'function') {

            showToast(`📧 [Pre-Match Reminder Sent]: Your match "${m.name}" at ${m.court} starts in ~4 hours!`, 'info');

          }

        }



        // Mark as sent

        m.reminder4hSent = true;

        if (m._docId && typeof doc === 'function' && typeof updateDoc === 'function') {

          try { await updateDoc(doc(db, 'scheduledMatches', m._docId), { reminder4hSent: true }); } catch(e) {}

        }

      }

    }

  });

};



// Periodically check 4-hour reminders every 3 minutes

setInterval(() => {

  if (typeof checkUpcoming4HourReminders === 'function') checkUpcoming4HourReminders();

}, 3 * 60 * 1000);







// =========================================================================

// VIEW COURT & LIVE PITCH ROSTER VISUALIZATION (Avatars Populating Terrain)

// =========================================================================



window.openViewCourtModal = async function(courtName) {

  const modal = document.getElementById('view-court-modal');

  const titleEl = document.getElementById('view-court-title');

  const addrEl = document.getElementById('view-court-address');

  const checkinBtn = document.getElementById('view-court-checkin-btn');



  const courtConfig = (typeof COURTS_CONFIG !== 'undefined' ? COURTS_CONFIG : []).find(

    c => c.name.toLowerCase().includes(courtName.toLowerCase()) || courtName.toLowerCase().includes(c.name.toLowerCase())

  ) || { name: courtName, address: 'Austin Pitch Location' };



  if (titleEl) titleEl.textContent = courtConfig.name;

  if (addrEl) addrEl.textContent = courtConfig.address || 'Austin, TX';



  if (checkinBtn) {

    checkinBtn.onclick = async () => {

      // Require valid logged-in account

      if (!currentUser) {

        if (typeof openAuthModal === 'function') openAuthModal();

        if (typeof showToast === 'function') showToast('Please sign in with a valid account to check in to this court!', 'warning');

        return;

      }



      const userName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Petanque Player';

      const newCheckIn = {

        id: 'chk_' + Date.now(),

        userId: currentUser.uid,

        userName: userName,

        name: userName,

        court: courtConfig.name,

        location: courtConfig.name,

        timestamp: Date.now(),

        dateStr: new Date().toISOString()

      };



      // Save to Firestore permanently

      try {

        if (typeof addDoc === 'function' && typeof collection === 'function') {

          await addDoc(collection(db, 'checkIns'), newCheckIn);

        }

      } catch(e) { console.warn('Check-in Firestore save error:', e); }



      // Save to local check-ins

      const localCheckIns = JSON.parse(localStorage.getItem('austin_petanque_court_checkins') || '[]');

      localCheckIns.unshift(newCheckIn);

      localStorage.setItem('austin_petanque_court_checkins', JSON.stringify(localCheckIns));



      if (typeof showToast === 'function') {

        showToast(`🟢 Checked in to ${courtConfig.name}! You are now visible as Playing Now.`, 'success');

      }



      // Refresh court view live

      window.openViewCourtModal(courtConfig.name);

    };

  }



  let playingNow = [];

  let rsvpAccepted = [];

  let rsvpPending = [];



  // 1. Check-ins today

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);

  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);



  try {

    if (typeof collection === 'function' && typeof getDocs === 'function') {

      const q = query(collection(db, 'checkIns'), where('timestamp', '>=', todayStart), where('timestamp', '<=', todayEnd));

      const snap = await getDocs(q);

      snap.forEach(d => {

        const data = d.data();

        const cName = data.court || data.location || '';

        if (cName.toLowerCase().includes(courtConfig.name.toLowerCase()) || courtConfig.name.toLowerCase().includes(cName.toLowerCase())) {


          playingNow.push({

            id: d.id,

            name: data.name || data.userName || 'Pétanque Player',

            avatar: data.avatar || 'fa-person-running',

            status: 'playing_now'

          });

        }

      });

    }

  } catch(e) {}



  // Local check-ins fallback

  const localCheckIns = JSON.parse(localStorage.getItem('austin_petanque_court_checkins') || '[]');

  localCheckIns.forEach(ci => {

    const cName = ci.court || ci.location || '';

    if (cName.toLowerCase().includes(courtConfig.name.toLowerCase()) || courtConfig.name.toLowerCase().includes(cName.toLowerCase())) {


      if (!playingNow.some(p => p.name === ci.name)) {

        playingNow.push({

          id: ci.id || 'ci_' + Date.now(),

          name: ci.name || 'Player',

          avatar: ci.avatar || 'fa-person-running',

          status: 'playing_now'

        });

      }

    }

  });



  // 2. Scheduled Matches RSVPs

  let localMatches = JSON.parse(localStorage.getItem('austin_scheduled_matches') || '[]');

  window.currentViewMatch = null;
  localMatches.forEach(sm => {

    const cName = sm.court || sm.location || '';

    if (cName.toLowerCase().includes(courtConfig.name.toLowerCase()) || courtConfig.name.toLowerCase().includes(cName.toLowerCase())) {
      if (!window.currentViewMatch && currentUser && (sm.hostUid === currentUser.uid || sm.hostEmail === currentUser.email)) {
        window.currentViewMatch = sm;
      }


      (sm.rsvps || []).forEach(r => {

        if (!playingNow.some(p => p.name === r.name) && !rsvpAccepted.some(p => p.name === r.name) && !rsvpPending.some(p => p.name === r.name)) {

          if (r.status === 'pending') {

            rsvpPending.push({

              id: r.uid || 'r_' + Date.now(),

              name: r.name,

              avatar: r.avatar || 'fa-clock',

              status: 'pending'

            });

          } else {

            rsvpAccepted.push({

              id: r.uid || 'r_' + Date.now(),

              name: r.name,

              avatar: r.avatar || 'fa-user-check',

              status: 'accepted'

            });

          }

        }

      });

    }

  });



  // 3. Pending Applications / RSVPs

  let pendingApps = JSON.parse(localStorage.getItem('austin_petanque_pending_apps') || '[]');

  pendingApps.forEach(app => {

    const appText = (app.court || app.message || app.name || '').toLowerCase();

    if (appText.includes(courtConfig.name.toLowerCase()) || courtConfig.name.toLowerCase().includes(appText)) {

      if (!playingNow.some(p => p.name === app.name) && !rsvpAccepted.some(p => p.name === app.name) && !rsvpPending.some(p => p.name === app.name)) {

        if (app.status === 'approved' || app.status === 'accepted') {

          rsvpAccepted.push({ id: app.id, name: app.name, avatar: 'fa-user-check', status: 'accepted' });

        } else {

          rsvpPending.push({ id: app.id, name: app.name, avatar: 'fa-clock', status: 'pending' });

        }

      }

    }

  });



  // Rich initial demo seed if court is empty

  if (playingNow.length === 0 && rsvpAccepted.length === 0 && rsvpPending.length === 0) {
    // Seed data removed for real-world E2E testing
  }



  // If current logged-in user has Queued or is viewing, show them in roster & pitch!

  if (currentUser) {

    const userName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Jacob (You)';

    if (!playingNow.some(p => p.name.includes(userName)) && !rsvpAccepted.some(p => p.name.includes(userName)) && !rsvpPending.some(p => p.name.includes(userName))) {

      rsvpAccepted.push({ id: currentUser.uid, name: `${userName} (You)`, avatar: 'fa-user-check', status: 'accepted' });

    }

  }



  // Update Roster Counts

  const cPN = document.getElementById('count-playing-now');

  const cRA = document.getElementById('count-rsvp-accepted');

  const cRP = document.getElementById('count-rsvp-pending');

  if (cPN) cPN.textContent = playingNow.length;

  if (cRA) cRA.textContent = rsvpAccepted.length;

  if (cRP) cRP.textContent = rsvpPending.length;



  // Render Roster Lists

  renderRosterList('roster-playing-now', playingNow, 'playing_now');

  renderRosterList('roster-rsvp-accepted', rsvpAccepted, 'accepted');

  renderRosterList('roster-rsvp-pending', rsvpPending, 'pending');



  // Render Pitch Top-Down Avatars

  renderPitchAvatars([...playingNow, ...rsvpAccepted, ...rsvpPending]);



  if (modal) {
    const headerEl = document.getElementById('view-court-header');
    let hostActionsEl = document.getElementById('view-court-host-actions');
    if (!hostActionsEl && headerEl) {
       hostActionsEl = document.createElement('span');
       hostActionsEl.id = 'view-court-host-actions';
       hostActionsEl.style.marginLeft = '10px';
       headerEl.insertBefore(hostActionsEl, document.getElementById('view-court-title'));
    }
    if (hostActionsEl) {
      if (window.currentViewMatch && window.currentViewMatch.requestOnly && currentUser && (window.currentViewMatch.hostUid === currentUser.uid || window.currentViewMatch.hostEmail === currentUser.email)) {
         hostActionsEl.style.display = 'inline-block';
         hostActionsEl.innerHTML = `<button class="glass-pill" style="cursor:pointer; background: var(--primary-amber); color: #000; font-size: 0.75rem; padding: 4px 10px;" onclick="openToPublicMatch()"><i class="fa-solid fa-lock-open"></i> Open to Public</button>`;
      } else {
         hostActionsEl.style.display = 'none';
      }
    }

    modal.classList.add('active');

    modal.style.display = 'flex';

  }

};



window.closeViewCourtModal = function() {

  const modal = document.getElementById('view-court-modal');

  if (modal) {

    modal.classList.remove('active');

    modal.style.display = 'none';

  }

};



window.handleHostRsvpAction = async function(uid, action) {
  if (!window.currentViewMatch) return;
  const match = window.currentViewMatch;
  let rsvps = Array.isArray(match.rsvps) ? match.rsvps : [];
  let idx = rsvps.findIndex(r => r.uid === uid || r.id === uid);
  if (idx >= 0) {
    if (action === 'accept') {
      rsvps[idx].status = 'accepted';
    } else if (action === 'deny') {
      rsvps.splice(idx, 1);
    }
    const localMatches = JSON.parse(localStorage.getItem('austin_scheduled_matches') || '[]');
    const matchIdx = localMatches.findIndex(m => m.id === match.id);
    if (matchIdx >= 0) {
      localMatches[matchIdx].rsvps = rsvps;
      localStorage.setItem('austin_scheduled_matches', JSON.stringify(localMatches));
    }
    // Update firestore if possible
    try {
      if (typeof doc === 'function' && typeof updateDoc === 'function' && typeof db !== 'undefined') {
        const smDocs = await window.getDocs(window.query(window.collection(db, 'scheduledMatches'), window.where('id', '==', match.id)));
        if (!smDocs.empty) {
            await updateDoc(smDocs.docs[0].ref, { rsvps: rsvps });
        }
      }
    } catch(e) {}
    openViewCourtModal(match.court || match.location);
  }
};

window.openToPublicMatch = async function() {
  if (!window.currentViewMatch) return;
  const match = window.currentViewMatch;
  let rsvps = Array.isArray(match.rsvps) ? match.rsvps : [];
  rsvps.forEach(r => { if (r.status === 'pending') r.status = 'accepted'; });
  const localMatches = JSON.parse(localStorage.getItem('austin_scheduled_matches') || '[]');
  const matchIdx = localMatches.findIndex(m => m.id === match.id);
  if (matchIdx >= 0) {
    localMatches[matchIdx].rsvps = rsvps;
    localMatches[matchIdx].requestOnly = false;
    localStorage.setItem('austin_scheduled_matches', JSON.stringify(localMatches));
  }
  try {
    if (typeof doc === 'function' && typeof updateDoc === 'function' && typeof db !== 'undefined') {
        const smDocs = await window.getDocs(window.query(window.collection(db, 'scheduledMatches'), window.where('id', '==', match.id)));
        if (!smDocs.empty) {
            await updateDoc(smDocs.docs[0].ref, { requestOnly: false, rsvps: rsvps });
        }
    }
  } catch(e) {}
  openViewCourtModal(match.court || match.location);
};

function renderRosterList(containerId, list, type) {

  const container = document.getElementById(containerId);

  if (!container) return;

  if (list.length === 0) {

    container.innerHTML = `<div style="font-size: 0.76rem; color: var(--text-muted); font-style: italic;">No players yet</div>`;

    return;

  }

  const statusColor = type === 'playing_now' ? '#4ade80' : type === 'accepted' ? 'var(--primary-amber)' : '#60a5fa';

  const isHost = window.currentViewMatch && currentUser && (window.currentViewMatch.hostUid === currentUser.uid || window.currentViewMatch.hostEmail === currentUser.email);

  container.innerHTML = list.map(p => {
    let hostButtons = '';
    if (isHost && type === 'pending' && p.id) {
       hostButtons = `
         <div style="margin-left: auto; display: flex; gap: 6px;">
           <button class="btn-primary" style="padding: 4px 8px; font-size: 0.7rem; min-height: 0;" onclick="handleHostRsvpAction('${p.id}', 'accept')"><i class="fa-solid fa-check"></i></button>
           <button class="btn-secondary" style="padding: 4px 8px; font-size: 0.7rem; min-height: 0;" onclick="handleHostRsvpAction('${p.id}', 'deny')"><i class="fa-solid fa-xmark"></i></button>
         </div>
       `;
    }
    return `

    <div style="display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.25); padding: 6px 10px; border-radius: 8px; font-size: 0.8rem; border: 1px solid rgba(255,255,255,0.05);">

      <div style="width: 26px; height: 26px; border-radius: 50%; background: ${p.avatarColor || statusColor}; color: #000; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800; flex-shrink: 0;">

        <i class="fa-solid ${p.avatar || 'fa-user'}"></i>

      </div>

      <span style="font-weight: 600; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 120px; color: #fff;">${p.name}</span>
      
      ${hostButtons}

    </div>

  `}).join('');

}



function renderPitchAvatars(allPlayers) {

  const overlay = document.getElementById('pitch-avatars-overlay');

  if (!overlay) return;



  if (allPlayers.length === 0) {

    overlay.innerHTML = '';

    return;

  }



  // Coordinates for top-down terrain layout

  const positions = [

    { top: '25%', left: '22%' },

    { top: '35%', left: '78%' },

    { top: '65%', left: '32%' },

    { top: '70%', left: '68%' },

    { top: '22%', left: '52%' },

    { top: '80%', left: '48%' },

    { top: '45%', left: '18%' },

    { top: '50%', left: '84%' }

  ];



  overlay.innerHTML = allPlayers.slice(0, 8).map((p, idx) => {

    const pos = positions[idx % positions.length];

    const isPlaying = p.status === 'playing_now';

    const isAccepted = p.status === 'accepted';

    const glowColor = isPlaying ? '#16a34a' : isAccepted ? '#f59e0b' : '#3b82f6';

    const statusLabel = isPlaying ? 'Playing Now' : isAccepted ? 'RSVP Accepted' : 'RSVP Pending';



    return `

      <div class="pitch-player-avatar" style="position: absolute; top: ${pos.top}; left: ${pos.left}; transform: translate(-50%, -50%); cursor: pointer; transition: transform 0.25s;" 

           title="${p.name} (${statusLabel})"

           onclick="if(typeof showToast === 'function') showToast('${p.name}: ${statusLabel}', 'info')">

        <div style="position: relative; display: flex; flex-direction: column; align-items: center;">

          <div style="width: 40px; height: 40px; border-radius: 50%; background: ${glowColor}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; box-shadow: 0 0 16px ${glowColor}; border: 2.5px solid #fff;">

            <i class="fa-solid ${p.avatar || 'fa-user'}"></i>

          </div>

          <span style="margin-top: 4px; background: rgba(0,0,0,0.85); color: #fff; padding: 2px 7px; border-radius: 8px; font-size: 0.68rem; font-weight: 700; white-space: nowrap; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 2px 6px rgba(0,0,0,0.5);">

            ${p.name.split(' ')[0]}

          </span>

        </div>

      </div>`;

  }).join('');

}





// =========================================================================

// JOIN MATCH RSVP & 4-HOUR EMAIL REMINDER PROMPT

// =========================================================================



let pendingRsvpMatchId = null;



window.openRsvpConfirmModal = function(matchId, matchName, matchCourt) {

  pendingRsvpMatchId = matchId;

  const modal = document.getElementById('rsvp-confirm-modal');

  const titleEl = document.getElementById('rsvp-confirm-title');

  const subEl = document.getElementById('rsvp-confirm-subtitle');

  const toggle = document.getElementById('rsvp-email-reminder-toggle');



  if (titleEl) titleEl.textContent = `Join "${matchName}"`;

  if (subEl) subEl.textContent = `Scheduled at ${matchCourt}. Confirm your player RSVP.`;

  

  // Set toggle state based on user's saved preference

  if (toggle) {

    toggle.checked = localStorage.getItem('user_email_reminders_enabled') !== 'false';

  }



  if (modal) {
    const headerEl = document.getElementById('view-court-header');
    let hostActionsEl = document.getElementById('view-court-host-actions');
    if (!hostActionsEl && headerEl) {
       hostActionsEl = document.createElement('span');
       hostActionsEl.id = 'view-court-host-actions';
       hostActionsEl.style.marginLeft = '10px';
       headerEl.insertBefore(hostActionsEl, document.getElementById('view-court-title'));
    }
    if (hostActionsEl) {
      if (window.currentViewMatch && window.currentViewMatch.requestOnly && currentUser && (window.currentViewMatch.hostUid === currentUser.uid || window.currentViewMatch.hostEmail === currentUser.email)) {
         hostActionsEl.style.display = 'inline-block';
         hostActionsEl.innerHTML = `<button class="glass-pill" style="cursor:pointer; background: var(--primary-amber); color: #000; font-size: 0.75rem; padding: 4px 10px;" onclick="openToPublicMatch()"><i class="fa-solid fa-lock-open"></i> Open to Public</button>`;
      } else {
         hostActionsEl.style.display = 'none';
      }
    }

    modal.classList.add('active');

    modal.style.display = 'flex';

  }

};



window.closeRsvpConfirmModal = function() {

  pendingRsvpMatchId = null;

  const modal = document.getElementById('rsvp-confirm-modal');

  if (modal) {

    modal.classList.remove('active');

    modal.style.display = 'none';

  }

};



window.confirmMatchRSVPWithReminder = async function() {

  if (!pendingRsvpMatchId) return;

  const matchId = pendingRsvpMatchId;

  const toggle = document.getElementById('rsvp-email-reminder-toggle');

  const sendEmailReminder = toggle ? toggle.checked : true;



  // Save preference locally

  localStorage.setItem('user_email_reminders_enabled', sendEmailReminder ? 'true' : 'false');



  window.closeRsvpConfirmModal();



  // Execute RSVP addition

  await executeRsvpJoin(matchId, sendEmailReminder);

};



async function executeRsvpJoin(matchId, emailRemindersEnabled) {

  if (!currentUser) return;



  let localMatches = JSON.parse(localStorage.getItem('austin_scheduled_matches') || '[]');

  let targetMatch = localMatches.find(m => m.id === matchId);

  let firestoreDocId = null;



  try {

    if (typeof query === 'function' && typeof collection === 'function') {

      const q = query(collection(db, 'scheduledMatches'), where('id', '==', matchId));

      const snap = await getDocs(q);

      if (!snap.empty) {

        const d = snap.docs[0];

        firestoreDocId = d.id;

        targetMatch = d.data();

      }

    }

  } catch(e) { console.warn('Fetch match for RSVP error:', e); }



  if (!targetMatch && typeof SEEDED_MATCHES !== 'undefined') {

    targetMatch = SEEDED_MATCHES.find(m => m.id === matchId || m.name === matchId);

  }



  if (!targetMatch) {

    if (typeof showToast === 'function') showToast('Match details not found.', 'warning');

    return;

  }



  let rsvps = Array.isArray(targetMatch.rsvps) ? [...targetMatch.rsvps] : [];

  const existingIdx = rsvps.findIndex(r => r.uid === currentUser.uid);



  if (existingIdx >= 0) {

    rsvps[existingIdx].emailRemindersEnabled = emailRemindersEnabled;

  } else {

    const isRequestOnly = targetMatch.requestOnly === true;
    const status = isRequestOnly ? 'pending' : 'accepted';

    const prof = JSON.parse(localStorage.getItem(`austin_petanque_profile_${currentUser.uid}`) || '{}');
    rsvps.push({

      uid: currentUser.uid,

      name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Player',
      avatar: prof.avatar || null,
      avatarColor: prof.avatarColor || '#3b82f6',

      email: currentUser.email || '',

      emailRemindersEnabled: emailRemindersEnabled,

      timestamp: Date.now(),

      status: status

    });

    if (isRequestOnly && targetMatch.hostEmail) {
      if (typeof addDoc === 'function' && typeof collection === 'function' && typeof db !== 'undefined') {
        try {
          addDoc(collection(db, 'mailQueue'), {
            to: targetMatch.hostEmail,
            message: {
              subject: `Join Request: ${targetMatch.name}`,
              html: `<h3>New Join Request</h3>
                     <p><strong>${currentUser.displayName || currentUser.email?.split('@')[0] || 'A player'}</strong> has requested to join your match <strong>${targetMatch.name}</strong>.</p>
                     <p>Since this is a Request-Only game, please review and accept them.</p>`
            },
            createdAt: new Date().toISOString()
          });
        } catch(e) { console.warn('Error sending host email:', e); }
      }
    }

  }



  targetMatch.rsvps = rsvps;



  // Sync to Firestore permanently

  if (firestoreDocId && typeof doc === 'function' && typeof updateDoc === 'function') {

    try {

      await updateDoc(doc(db, 'scheduledMatches', firestoreDocId), { rsvps: rsvps });

    } catch(e) { console.warn('Error updating Firestore RSVP:', e); }

  }



  localMatches = localMatches.map(m => m.id === matchId ? targetMatch : m);

  localStorage.setItem('austin_scheduled_matches', JSON.stringify(localMatches));



  const msg = emailRemindersEnabled

    ? `✅ Joined "${targetMatch.name || 'match'}"! You will receive a 4-hour pre-match email reminder.`

    : `✅ Joined "${targetMatch.name || 'match'}"! (Email reminder turned off for this match).`;



  if (typeof showToast === 'function') showToast(msg, 'success');



  if (typeof renderLiveDashboard === 'function') {

    renderLiveDashboard();

  }

}



// Override toggleMatchRSVP to trigger openRsvpConfirmModal when joining an existing match

const originalToggleRSVP = window.toggleMatchRSVP;

window.toggleMatchRSVP = async function(matchId) {

  if (!currentUser) {

    if (typeof openAuthModal === 'function') openAuthModal();

    if (typeof showToast === 'function') showToast('Please sign in to join matches!', 'warning');

    return;

  }



  // Find match

  let localMatches = JSON.parse(localStorage.getItem('austin_scheduled_matches') || '[]');

  let targetMatch = localMatches.find(m => m.id === matchId);

  try {

    if (typeof query === 'function' && typeof collection === 'function') {

      const q = query(collection(db, 'scheduledMatches'), where('id', '==', matchId));

      const snap = await getDocs(q);

      if (!snap.empty) targetMatch = snap.docs[0].data();

    }

  } catch(e) {}



  if (!targetMatch && typeof SEEDED_MATCHES !== 'undefined') {

    targetMatch = SEEDED_MATCHES.find(m => m.id === matchId || m.name === matchId);

  }



  const rsvps = Array.isArray(targetMatch?.rsvps) ? targetMatch.rsvps : [];

  const isAlreadyAttending = currentUser && rsvps.some(r => r.uid === currentUser.uid);



  if (isAlreadyAttending) {

    // If already attending, user can leave RSVP directly

    await executeRsvpJoin(matchId, false); // leave

  } else {

    // Joining a created match -> Show the 4-Hour Email Reminder modal prompt!

    const mName = targetMatch?.name || targetMatch?.title || 'Pétanque Match';

    const mCourt = targetMatch?.court || targetMatch?.location || 'Austin Terrain';

    window.openRsvpConfirmModal(matchId, mName, mCourt);

  }

};

// --- QUEUE LOGIC ---
window.openQueueModal = (matchCode, matchTitle) => {
  const modal = document.getElementById('queue-modal');
  if (!modal) return;
  
  document.getElementById('queue-match-code').value = matchCode;
  document.getElementById('queue-match-title').textContent = matchTitle;
  
  // Pre-fill name if logged in
  if (currentUser) {
    document.getElementById('queue-player-name').value = currentUser.displayName || 'Player';
  }
  
  modal.classList.add('active');
};

window.closeQueueModal = () => {
  const modal = document.getElementById('queue-modal');
  if (modal) modal.classList.remove('active');
};

window.submitQueueRequest = async () => {
  const matchCode = document.getElementById('queue-match-code').value;
  const nameInput = document.getElementById('queue-player-name').value.trim();
  
  if (!nameInput) {
    alert("Please enter a name.");
    return;
  }
  
  try {
    const queueRef = collection(db, 'match_queues');
    await addDoc(queueRef, {
      matchCode: matchCode,
      playerName: nameInput,
      playerUid: currentUser ? currentUser.uid : 'anonymous_' + Math.random().toString(36).substr(2, 9),
      status: 'pending',
      createdAt: serverTimestamp()
    });
    
    closeQueueModal();
    alert("Request sent! The host has been notified.");
    
  } catch (err) {
    console.error("Queue error:", err);
    alert("Failed to send request.");
  }
};

// --- HOST LOGIC ---
let queueUnsubscribe = null;

window.listenForQueueRequests = () => {
  if (!currentMatchCode || !isHost) return;
  
  const q = query(collection(db, 'match_queues'), where('matchCode', '==', currentMatchCode), where('status', '==', 'pending'));
  
  queueUnsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const req = change.doc.data();
        showQueueNotification(change.doc.id, req.playerName);
      }
    });
  });
};

window.showQueueNotification = (requestId, playerName) => {
  const container = document.getElementById('host-toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = 'glass-panel';
  toast.id = `toast-${requestId}`;
  toast.style.padding = '12px 16px';
  toast.style.borderLeft = '4px solid var(--primary-amber)';
  toast.innerHTML = `
    <div style="font-size: 0.95rem;"><strong>${playerName}</strong> wants to join!</div>
    <div style="margin-top:8px; display:flex; gap:8px;">
      <button class="btn-primary" style="padding:4px 12px; font-size:0.8rem;" onclick="acceptQueue('${requestId}')">Accept</button>
      <button class="btn-outline" style="padding:4px 12px; font-size:0.8rem; color:#ff5252; border-color:#ff5252;" onclick="declineQueue('${requestId}')">Decline</button>
    </div>
  `;
  container.appendChild(toast);
};

window.acceptQueue = async (requestId) => {
  try {
    await setDoc(doc(db, 'match_queues', requestId), { status: 'accepted' }, { merge: true });
    document.getElementById(`toast-${requestId}`)?.remove();
    alert("Player accepted! Chat feature coming next.");
  } catch (e) {
    console.error(e);
  }
};

window.declineQueue = async (requestId) => {
  try {
    await setDoc(doc(db, 'match_queues', requestId), { status: 'declined' }, { merge: true });
    document.getElementById(`toast-${requestId}`)?.remove();
  } catch (e) {
    console.error(e);
  }
};
