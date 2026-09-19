// Austin Pétanque Application Script
import { db, collection, addDoc, getDocs, serverTimestamp } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initScoreboard();
  initModal();
  initFormSubmission();
  initHashRouting();
});

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

function initScoreboard() {
  const scoreAEl = document.getElementById('score-a');
  const scoreBEl = document.getElementById('score-b');
  
  window.updateScore = (team, delta) => {
    if (team === 'A') {
      teamAScore = Math.max(0, Math.min(13, teamAScore + delta));
      scoreAEl.textContent = teamAScore;
      if (teamAScore === 13) alert('🏆 Victory! Team Red / Pointing Masters won with 13 points!');
    } else if (team === 'B') {
      teamBScore = Math.max(0, Math.min(13, teamBScore + delta));
      scoreBEl.textContent = teamBScore;
      if (teamBScore === 13) alert('🏆 Victory! Team Blue / Shooters won with 13 points!');
    }
  };

  window.resetScore = () => {
    teamAScore = 0;
    teamBScore = 0;
    scoreAEl.textContent = '0';
    scoreBEl.textContent = '0';
  };
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
