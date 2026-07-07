const fs = require('fs');
const path = require('path');

const baseDir = 'c:\\Users\\btovar\\OneDrive - Cotecmar\\Escritorio\\CODIGOS\\MCDM\\frontend\\src';

const dirs = [
  path.join(baseDir, 'context'),
  path.join(baseDir, 'pages'),
  path.join(baseDir, 'components', 'Common'),
  path.join(baseDir, 'components', 'Alternativas'),
  path.join(baseDir, 'components', 'Documentos'),
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created: ${dir}`);
  }
});

console.log('All directories created successfully');
