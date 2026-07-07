cd "c:\Users\btovar\OneDrive - Cotecmar\Escritorio\CODIGOS\MCDM\frontend"

Write-Host "Installing Tailwind CSS dependencies..." -ForegroundColor Green
npm install -D tailwindcss postcss autoprefixer

Write-Host "Initializing Tailwind config..." -ForegroundColor Green
npx tailwindcss init -p

Write-Host "Uninstalling Material-UI packages..." -ForegroundColor Green
npm uninstall @mui/material @emotion/react @emotion/styled @mui/icons-material

Write-Host "Done!" -ForegroundColor Green
