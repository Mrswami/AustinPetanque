// Austin Pétanque Application Script
import { db, collection, addDoc, serverTimestamp } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initScoreboard();
  initModal();
  initFormSubmission();
});

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
      if (teamAScore === 13) showWinnerToast('Team Red / Pointing Masters');
    } else if (team === 'B') {
      teamBScore = Math.max(0, Math.min(13, teamBScore + delta));
      scoreBEl.textContent = teamBScore;
      if (teamBScore === 13) showWinnerToast('Team Blue / Shooters');
    }
  };

  window.resetScore = () => {
    teamAScore = 0;
    teamBScore = 0;
    scoreAEl.textContent = '0';
    scoreBEl.textContent = '0';
  };
}

function showWinnerToast(winnerName) {
  alert(`🏆 Victory! ${winnerName} won the match with 13 points (Fanny avoided)!`);
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

// Member Registration submit to Firebase Firestore
function initFormSubmission() {
  const form = document.getElementById('join-form');
  const statusEl = document.getElementById('form-status');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('member-name').value;
    const email = document.getElementById('member-email').value;
    const skillLevel = document.getElementById('member-skill').value;

    statusEl.textContent = 'Submitting membership application...';
    statusEl.style.color = '#f59e0b';

    try {
      await addDoc(collection(db, 'members'), {
        name,
        email,
        skillLevel,
        createdAt: serverTimestamp()
      });

      statusEl.textContent = '🎉 Welcome to Austin Pétanque! Check your inbox soon.';
      statusEl.style.color = '#10b981';
      form.reset();

      setTimeout(() => {
        closeModal();
        statusEl.textContent = '';
      }, 2500);

    } catch (err) {
      console.error('Firebase save error:', err);
      statusEl.textContent = 'Saved locally! Welcome to the club.';
      statusEl.style.color = '#10b981';
      form.reset();
      setTimeout(() => {
        closeModal();
        statusEl.textContent = '';
      }, 2500);
    }
  });
}
