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
    
    // Start listening for acceptance
    // listenForQueueAcceptance(matchCode, playerUid);
    
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
  // Render a toast in the DOM
  const container = document.getElementById('host-toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = 'host-toast glass-panel';
  toast.id = `toast-${requestId}`;
  toast.innerHTML = `
    <div><strong>${playerName}</strong> wants to join!</div>
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
    // open chat
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
