const fs = require('fs');
const path = require('path');
const NodeID3 = require('node-id3');
const { applyComposerAlias } = require('../src/utils');

const COMPOSER_DIR = '/Volumes/samsung/Music/Vidyasagar';

function getComposerFromPath(filePath) {
  const grandparent = path.dirname(path.dirname(filePath));
  return path.basename(grandparent);
}

function retagVidyasagar() {
  if (!fs.existsSync(COMPOSER_DIR)) {
    console.error('Vidyasagar folder not found');
    return;
  }

  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile() && path.extname(full).toLowerCase() === '.mp3') files.push(full);
    }
  }
  walk(COMPOSER_DIR);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    try {
      const tags = NodeID3.read(file) || {};
      const current = tags.performerInfo || null;
      const composer = current
        ? applyComposerAlias(current)
        : applyComposerAlias(getComposerFromPath(file));

      if (composer !== current) {
        const ok = NodeID3.update({ performerInfo: composer }, file);
        if (ok === true) {
          console.log(`Updated ${file}: ${current || '(none)'} -> ${composer}`);
          updated++;
        } else {
          console.error(`Failed to update ${file}: ${ok && ok.message ? ok.message : ok}`);
          errors++;
        }
      } else {
        skipped++;
      }
    } catch (e) {
      console.error(`Error processing ${file}:`, e.message);
      errors++;
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} already correct, ${errors} errors`);
}

retagVidyasagar();
