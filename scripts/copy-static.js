import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Create directories if they don't exist
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

// Copy directory recursively
function copyDirectory(src, dest) {
  ensureDirectoryExists(dest);
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied: ${srcPath} -> ${destPath}`);
    }
  }
}

// Main function
function main() {
  console.log('Starting static file copy...');
  
  // Create dist/public directory
  const publicDir = path.join(projectRoot, 'dist', 'public');
  ensureDirectoryExists(publicDir);
  
  // Copy public files
  const srcPublicDir = path.join(projectRoot, 'src', 'public');
  if (fs.existsSync(srcPublicDir)) {
    copyDirectory(srcPublicDir, publicDir);
  } else {
    console.log(`Warning: Source public directory not found: ${srcPublicDir}`);
  }
  
  // Create js/types and js/utils directories
  const jsTypesDir = path.join(publicDir, 'js', 'types');
  const jsUtilsDir = path.join(publicDir, 'js', 'utils');
  ensureDirectoryExists(jsTypesDir);
  ensureDirectoryExists(jsUtilsDir);
  
  // Copy types and utils
  const srcTypesDir = path.join(projectRoot, 'src', 'types');
  const srcUtilsDir = path.join(projectRoot, 'src', 'utils');
  const srcDataDir = path.join(projectRoot, 'src', 'data');
  
  if (fs.existsSync(srcTypesDir)) {
    copyDirectory(srcTypesDir, jsTypesDir);
  } else {
    console.log(`Warning: Source types directory not found: ${srcTypesDir}`);
  }
  
  if (fs.existsSync(srcUtilsDir)) {
    copyDirectory(srcUtilsDir, jsUtilsDir);
  } else {
    console.log(`Warning: Source utils directory not found: ${srcUtilsDir}`);
  }

  // Copy data directory
  const distDataDir = path.join(projectRoot, 'dist', 'src', 'data');
  ensureDirectoryExists(distDataDir);
  if (fs.existsSync(srcDataDir)) {
    copyDirectory(srcDataDir, distDataDir);
  } else {
    console.log(`Warning: Source data directory not found: ${srcDataDir}`);
  }
  
  console.log('Static file copy completed successfully!');
}

main(); 