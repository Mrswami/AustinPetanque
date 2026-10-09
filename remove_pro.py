import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Remove the .mode-tab-group
html = re.sub(r'<div class="mode-tab-group".*?</div>\s*(?=<!-- Mode Switcher Pill directly above Reset Match -->|<div style="display: flex)', '', html, flags=re.DOTALL)
html = re.sub(r'<!-- Mode Switcher Pill directly above Reset Match -->\s*<div class="mode-tab-group".*?</div>', '', html, flags=re.DOTALL)

# Let's manually replace since regex can be finicky with nested divs.
old_mode_tabs = '''            <!-- Mode Switcher Pill directly above Reset Match -->
            <div class="mode-tab-group" style="display: inline-flex; background: rgba(255, 255, 255, 0.08); padding: 3px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.12); box-shadow: inset 0 1px 3px rgba(0,0,0,0.3);">
              <button type="button" class="mode-tab-btn active" id="mode-btn-classic" onclick="switchScoreboardMode('classic')" title="Classic 3D-Printed Handheld Points Counter (Picture 4)">
                <i class="fa-solid fa-calculator"></i> Classic Mode
              </button>
              <button type="button" class="mode-tab-btn" id="mode-btn-modern" onclick="switchScoreboardMode('modern')" title="Throw Animations Interactive Match Board">
                <i class="fa-solid fa-bowling-ball"></i> Pro Match (OG)
              </button>
            </div>'''
html = html.replace(old_mode_tabs, '')

# 2. Remove the lead banner
old_lead = '''        <!-- Lead banner -->
        <div id="lead-banner" class="lead-banner" style="display:none;"></div>'''
html = html.replace(old_lead, '')

# 3. Remove scoreboard-body and mene-timeline
start_body = html.find('<div class="scoreboard-body" id="scoreboard-body"')
end_body = html.find('<!-- Founder Admin Section -->')
if start_body != -1 and end_body != -1:
    # We want to keep the closing divs for score-court-container, score-standalone-view, etc.
    # Actually, let's just find the exact block.
    pass

import bs4
soup = bs4.BeautifulSoup(html, 'html.parser')
mode_group = soup.find('div', class_='mode-tab-group')
if mode_group:
    mode_group.decompose()

lead_banner = soup.find(id='lead-banner')
if lead_banner:
    lead_banner.decompose()

score_body = soup.find(id='scoreboard-body')
if score_body:
    score_body.decompose()

mene = soup.find('div', class_='mene-timeline-container')
if mene:
    mene.decompose()

reset_btn = soup.find(id='reset-match-btn')
if reset_btn:
    reset_btn.decompose() # It's hidden in classic mode anyway. Actually, classic mode has its own "Zero Both Dials" button.

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(str(soup))
