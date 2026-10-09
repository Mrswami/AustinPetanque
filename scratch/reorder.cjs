const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const extractSection = (id) => {
  const regex = new RegExp(`(<section[^>]*id="${id}"[^>]*>[\\s\\S]*?</section>)`, 'i');
  const match = html.match(regex);
  return match ? match[1] : '';
};

const aboutHtml = extractSection('about');
const liveHtml = extractSection('live-dashboard');
const courtsHtml = extractSection('courts');
const eventsHtml = extractSection('events');
const scoreboardHtml = extractSection('scoreboard');
const rulesHtml = extractSection('rules');

const startMarker = '<div id="public-view">';
const endMarker = '  <div id="score-view"';

const startIndex = html.indexOf(startMarker) + startMarker.length;
const endIndex = html.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find boundaries", startIndex, endIndex);
  process.exit(1);
}

// Ensure we don't accidentally duplicate code. We should replace the content strictly.
// But watch out for any other small divs in public-view before the sections. There are none.

const newPublicView = `
${aboutHtml}
${courtsHtml}
${liveHtml}
${eventsHtml}
${scoreboardHtml}
${rulesHtml}
</div>
`; // we add the closing div for public-view

const newHtml = html.substring(0, startIndex) + newPublicView + '\n' + html.substring(endIndex);

fs.writeFileSync('index.html', newHtml, 'utf8');
console.log('Reordered successfully');
