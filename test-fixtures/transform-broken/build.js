const fs = require('fs');
const path = require('path');

// If the config.ts has been transformed (contains process.env/import.meta.env), fail the build!
const configContent = fs.readFileSync(path.join(__dirname, 'src/config.ts'), 'utf-8');
if (configContent.includes('process.env') || configContent.includes('import.meta.env')) {
  console.error("Build failed: transformed config is not allowed!");
  process.exit(1);
}
console.log("Build succeeded!");
process.exit(0);
