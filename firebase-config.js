// Firebase Configuration for Austin Pétanque
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc, addDoc, getDocs, query, where, orderBy, limit, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

const firebaseConfig = {
  projectId: "kimboocherly-app",
  appId: "1:932445023744:web:18b85f288d0e17985d72e5",
  storageBucket: "kimboocherly-app.firebasestorage.app",
  apiKey: "AIzaSyAGRi2agpJxb766aZ_-8Gz9gOkiNho34dY",
  authDomain: "kimboocherly-app.firebaseapp.com",
  messagingSenderId: "932445023744",
  projectNumber: "932445023744"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let analytics;
try {
  analytics = getAnalytics(app);
} catch (e) {
  console.log("Analytics not available in local context");
}

export { app, db, analytics, collection, doc, setDoc, getDoc, addDoc, getDocs, query, where, orderBy, limit, serverTimestamp, onSnapshot };
