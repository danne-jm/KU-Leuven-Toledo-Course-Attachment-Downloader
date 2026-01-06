// Popup script for Toledo Course Auto Downloader
let currentTab;
let fileList = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // Check if we're on a Toledo course page
  if (!tab.url.includes('ultra.edu.kuleuven.cloud/ultra/courses/')) {
    updateStatus('Please navigate to a Toledo course page', 'warning');
    document.getElementById('downloadBtn').disabled = true;
    document.getElementById('scanBtn').disabled = true;
    return;
  }

  // Add event listeners
  document.getElementById('downloadBtn').addEventListener('click', downloadAllFiles);
  document.getElementById('scanBtn').addEventListener('click', scanCourse);

  // Auto-scan on popup open
  scanCourse();
});

async function scanCourse() {
  updateStatus('Scanning course for files...', 'info');
  document.getElementById('scanBtn').disabled = true;

  try {
    // Send message to content script to scan the course
    const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'scanCourse' });
    
    if (response.success) {
      fileList = response.files;
      updateStatus(`Found ${fileList.length} files`, 'success');
      displayFileList(fileList);
    } else {
      updateStatus('Error scanning course: ' + response.error, 'error');
    }
  } catch (error) {
    updateStatus('Error: ' + error.message, 'error');
  } finally {
    document.getElementById('scanBtn').disabled = false;
  }
}

async function downloadAllFiles() {
  if (fileList.length === 0) {
    await scanCourse();
    if (fileList.length === 0) {
      updateStatus('No files found to download', 'warning');
      return;
    }
  }

  updateStatus('Downloading files...', 'info');
  document.getElementById('downloadBtn').disabled = true;
  document.getElementById('progress').style.display = 'block';

  try {
    // Send message to content script to start downloading
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      action: 'downloadFiles',
      files: fileList,
      organizeByFolder: true  // Always organize by folder
    });

    if (response.success) {
      updateStatus(`Successfully downloaded ${response.count} files!`, 'success');
    } else {
      updateStatus('Some files failed to download', 'warning');
    }
  } catch (error) {
    updateStatus('Error downloading files: ' + error.message, 'error');
  } finally {
    document.getElementById('downloadBtn').disabled = false;
  }
}

function updateStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
}

function displayFileList(files) {
  const fileListDiv = document.getElementById('fileList');
  fileListDiv.innerHTML = '';
  fileListDiv.style.display = 'block';

  // Organize files by folder structure
  const fileTree = {};
  
  files.forEach(file => {
    const pathParts = file.path.split('/');
    const fileName = pathParts[pathParts.length - 1];
    const folderPath = pathParts.slice(0, -1);
    
    // Build nested structure
    let current = fileTree;
    folderPath.forEach(folder => {
      if (!current[folder]) {
        current[folder] = {};
      }
      current = current[folder];
    });
    
    // Add file to the deepest folder
    if (!current._files) {
      current._files = [];
    }
    current._files.push(fileName);
  });
  
  // Render the tree
  function renderTree(tree, indent = 0) {
    const folders = Object.keys(tree).filter(k => k !== '_files').sort();
    const files = tree._files || [];
    
    // Render folders first
    folders.forEach(folder => {
      const folderDiv = document.createElement('div');
      folderDiv.className = `folder-heading indent-${indent}`;
      folderDiv.textContent = `📁 ${folder}`;
      fileListDiv.appendChild(folderDiv);
      
      renderTree(tree[folder], indent + 1);
    });
    
    // Then render files
    files.forEach(fileName => {
      const fileDiv = document.createElement('div');
      fileDiv.className = `file-item indent-${indent}`;
      fileDiv.textContent = `📄 ${fileName}`;
      fileListDiv.appendChild(fileDiv);
    });
  }
  
  renderTree(fileTree);
}

async function copyLogs() {
  updateStatus('Collecting logs...', 'info');
  
  try {
    // Get logs from content script
    const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'getLogs' });
    
    if (response && response.success) {
      const logs = response.logs;
      
      // Format logs
      const logText = [
        '=== TOLEDO AUTO-DOWNLOAD EXTENSION LOGS ===',
        `Generated: ${new Date().toISOString()}`,
        `Page URL: ${currentTab.url}`,
        `Total log entries: ${logs.length}`,
        '',
        '=== DETAILED LOGS ===',
        ...logs.map(log => {
          let entry = `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`;
          if (log.data) {
            entry += '\n  Data: ' + JSON.stringify(log.data, null, 2).split('\n').join('\n  ');
          }
          return entry;
        })
      ].join('\n');
      
      // Copy to clipboard
      await navigator.clipboard.writeText(logText);
      updateStatus(`✅ Copied ${logs.length} log entries to clipboard!`, 'success');
      
      // Also log to console for easy viewing
      console.log(logText);
      console.log('Raw logs object:', logs);
      
    } else {
      updateStatus('❌ No logs available. Try scanning first.', 'error');
    }
  } catch (error) {
    console.error('Error copying logs:', error);
    updateStatus(`❌ Error copying logs: ${error.message}`, 'error');
  }
}

// Listen for progress updates
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadProgress') {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    const percent = (message.current / message.total) * 100;
    progressFill.style.width = percent + '%';
    progressText.textContent = `${message.current} / ${message.total} files`;
    
    updateStatus(`Downloading: ${message.fileName}`, 'info');
  }
});
