// Background service worker for Toledo Course Auto Downloader

console.log('Toledo Course Auto Downloader: Background service worker loaded');

// Network request logging
const networkLogs = [];
function logNetwork(type, details) {
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    details
  };
  networkLogs.push(entry);
  console.log(`[Network ${type}]`, details);
}

// Handle download requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download') {
    logNetwork('DOWNLOAD_REQUEST', {
      url: request.url,
      filename: request.filename
    });
    
    chrome.downloads.download({
      url: request.url,
      filename: request.filename,
      conflictAction: 'uniquify',
      saveAs: false
    })
    .then(downloadId => {
      logNetwork('DOWNLOAD_STARTED', { downloadId, filename: request.filename });
      console.log('Download started:', downloadId, request.filename);
      sendResponse({ success: true, downloadId: downloadId });
    })
    .catch(error => {
      logNetwork('DOWNLOAD_ERROR', { error: error.message, filename: request.filename });
      console.error('Download failed:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Will respond asynchronously
  }

  if (request.action === 'showNotification') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: request.title,
      message: request.message
    });
  }

  if (request.action === 'downloadProgress') {
    // Forward progress updates to popup if it's open
    chrome.runtime.sendMessage(request);
  }
});

// Monitor download progress
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === 'complete') {
    logNetwork('DOWNLOAD_COMPLETE', { id: delta.id });
    console.log('Download completed:', delta.id);
  }
  
  if (delta.error) {
    logNetwork('DOWNLOAD_FAILED', { id: delta.id, error: delta.error.current });
    console.error('Download error:', delta.error.current);
  }
});
