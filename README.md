# Austin Pétanque Club & Courtside Scorekeeper (v3.0.0)

[![Firebase Hosting](https://img.shields.io/badge/Hosting-Firebase-orange?logo=firebase)](https://austinpetanque.web.app)
[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](https://github.com/Mrswami/AustinPetanque)
[![PWA](https://img.shields.io/badge/PWA-Ready-green.svg)](https://austinpetanque.web.app/#score)

Premier Boules Club portal and real-time courtside scorekeeper web app for Austin, Texas.

**Live URL**: [https://austinpetanque.web.app](https://austinpetanque.web.app)  
**Direct Scorekeeper App**: [https://austinpetanque.web.app/#score](https://austinpetanque.web.app/#score)

---

## 🚀 What's New in Version 3.0.0

- **Google & Apple Authentication**:
  - Full OAuth sign-in with Firebase Auth (`GoogleAuthProvider` and `OAuthProvider('apple.com')`).
  - Branded Apple and Google modal triggers with platform-compliant SVG assets.
  - Active user profiles synced to Firestore (`users/{uid}`).
  - Dynamic user avatar and profile pill in the header and mobile drawer.
  - Automatic form auto-fill for pitch check-ins and club membership applications.
- **Dedicated Standalone Scorekeeper App (`#score`)**:
  - Distraction-free full-screen layout designed for outdoor play.
  - Persistent bottom dock navigation respecting iPhone safe-area insets.
- **Boule Permanence Tracking**:
  - 6 boules per team with a two-zone state flow:
    - Right zone: In-hand `◯`
    - Tap &rarr; Left zone: Thrown `/`
    - Tap on left &rarr; Star `★` (closest ball / holding point)
    - 3rd tap &rarr; Toggles back to `/`
    - Boules remain on the thrown side permanently until a mène reset or match restart.
- **Mène Timeline Strip & Undo**:
  - Visual history showing each mène outcome (e.g., `M1: 🔴 +2 pts`).
  - One-tap "Undo Last Mène" for quick mistake recovery courtside.
- **Real-Time Match Synchronization**:
  - 4-digit match PINs stored in Cloud Firestore for live spectator streaming.
- **Live Austin Pitch Check-Ins**:
  - Real-time community presence feed for Pease Park, French Legation, Mueller, and South Congress.
- **Courtside Accessibility Tools**:
  - **Sunlight Mode (`☀️`)**: High-contrast, thickened borders and deep black surfaces for bright direct Texas sunlight.
  - **Screen Wake-Lock API (`💡`)**: Keeps device screens illuminated throughout matches without dimming.
  - **Audio Celebrations**: 13-point win-by-two fanfare with brass horn chords, crowd cheering, speech synthesis, and confetti cannon.
  - **Haptic Vibration Feedback**: Tactile pulses on touch actions.
- **Offline PWA Capabilities**:
  - Service Worker (`sw.js` cache `austin-petanque-v3`) with stale-while-revalidate offline caching and OAuth bypass rules.
  - Web App Manifest configured for standalone mobile homescreen installation.

---

## 🛠 Tech Stack

- **Frontend**: Vanilla JavaScript (ES Modules), HTML5, Vanilla CSS3 (HSL color tokens, Glassmorphism, Safe-area insets)
- **Backend & Cloud Services**: Firebase Authentication, Cloud Firestore, Firebase Hosting
- **Audio & Synthesis**: Web Audio API (synthesized brass fanfare, referee whistles, crowd cheers), Web Speech API (Synthesis)
- **APIs**: Screen Wake-Lock API, Vibration API, Canvas Confetti

---

## 📱 Mobile Support

Optimized for mobile touchscreens and flagship phone models from iPhone 13 through iPhone 16 Pro Max, Pixel, and Galaxy:
- `viewport-fit=cover` with `env(safe-area-inset-*)` padding.
- 44px+ touch targets for thumb navigation.
- Responsive slide-out hamburger drawer.

---

## 👥 Engineering Squad

Architected and maintained by the Austin Pétanque 5-Agent Engineering Squad:
- **GM-Lead**: General Manager & Architecture
- **UI-Craft**: Frontend & Responsive Design
- **Cloud-Sync**: Firebase Auth & Firestore Real-Time Sync
- **Test-Guard**: Automated QA & Viewport Inspection
- **Ops-Ship**: PWA, Service Worker & CI/CD Deployment
