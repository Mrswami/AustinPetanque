with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re

# 1. Remove Mode Switcher
html = re.sub(r'<!-- Mode Switcher Pill directly above Reset Match -->.*?</div>\s*</div>\s*<div style="display: flex;', '<div style="display: flex;', html, flags=re.DOTALL)

# 2. Remove Reset Match btn
html = re.sub(r'<button class="btn-secondary" id="reset-match-btn".*?</button>', '', html, flags=re.DOTALL)

# 3. Remove lead banner
html = re.sub(r'<!-- Lead banner -->\s*<div id="lead-banner".*?</div>', '', html, flags=re.DOTALL)

# 4. Remove scoreboard-body
html = re.sub(r'<div class="scoreboard-body" id="scoreboard-body" style="display: none;">.*?(?=<!-- Visual M&egrave;ne Timeline Strip -->)', '', html, flags=re.DOTALL)

# 5. Remove mene-timeline
html = re.sub(r'<!-- Visual M&egrave;ne Timeline Strip -->.*?</div>\s*</div>\s*</div>', '</div>\s*</div>\s*</div>', html, flags=re.DOTALL)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
