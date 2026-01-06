// Content script for Toledo Course Auto Downloader
// This script runs on Toledo course pages and handles file discovery and downloading

console.log('Toledo Course Auto Downloader: Content script loaded');

// Log storage for debugging
const extensionLogs = [];
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, level, message, data };
  extensionLogs.push(logEntry);
  console.log(`[Toledo ${level.toUpperCase()}] ${message}`, data || '');
}

log('INFO', 'Content script initialized', { url: window.location.href });

// Extract course ID from URL
function getCourseId() {
  const match = window.location.pathname.match(/\/courses\/(_\d+_\d+)/);
  log('INFO', 'Course ID extraction', { pathname: window.location.pathname, match: match ? match[1] : null });
  return match ? match[1] : null;
}

// Fetch course content from Toledo API
async function fetchCourseContent(courseId, contentId = null, expand = false) {
  const baseUrl = 'https://ultra.edu.kuleuven.cloud/learn/api/v1';
  let url;
  
  if (contentId) {
    url = `${baseUrl}/courses/${courseId}/contents/${contentId}/children`;
  } else {
    url = `${baseUrl}/courses/${courseId}/contents`;
  }
  
  const params = {
    '@view': 'Summary',
    'includeInActivityTracking': 'true',
    'limit': '100'
  };
  
  // Only add expand parameter if needed
  if (expand) {
    params.expand = 'assignedGroups,selfEnrollmentGroups.group,gradebookCategory';
  }
  
  const searchParams = new URLSearchParams(params);

  try {
    const fullUrl = `${url}?${searchParams}`;
    log('INFO', 'Fetching from API', { url: fullUrl });
    
    const response = await fetch(fullUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    log('INFO', 'API response received', { 
      status: response.status, 
      ok: response.ok,
      contentType: response.headers.get('content-type')
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      log('ERROR', 'API request failed', { 
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const jsonData = await response.json();
    log('INFO', 'JSON parsed successfully', { 
      hasResults: !!jsonData.results,
      resultCount: jsonData.results?.length || 0
    });
    
    return jsonData;
  } catch (error) {
    log('ERROR', 'Error fetching course content', { 
      error: error.message,
      stack: error.stack
    });
    console.error('Error fetching course content:', error);
    throw error;
  }
}

// Recursively scan all folders and collect files
async function scanAllContent(courseId, contentId = null, path = '', allFiles = []) {
  try {
    log('INFO', 'Scanning content', { courseId, contentId, path, currentFileCount: allFiles.length });
    const data = await fetchCourseContent(courseId, contentId);
    
    if (!data.results) {
      log('WARN', 'No results in API response', { data });
      return allFiles;
    }

    log('INFO', 'Processing items', { itemCount: data.results.length });

    for (const item of data.results) {
      const itemPath = path ? `${path}/${item.title}` : item.title;
      
      log('INFO', 'Item details', {
        id: item.id,
        title: item.title,
        contentHandler: item.contentHandler?.id,
        hasChildren: item.hasChildren,
        hasAttachments: item.hasAttachments,
        hasGradebookColumns: item.hasGradebookColumns,
        availability: item.availability?.available,
        fullItem: item  // Log the complete item to see all fields
      });
      
      // Check if it's a file
      // contentHandler can be a string or an object with id property
      const contentHandlerType = typeof item.contentHandler === 'string' 
        ? item.contentHandler 
        : item.contentHandler?.id;
      
      if (contentHandlerType === 'resource/x-bb-file') {
        // This is a file
        log('INFO', 'Found file', { title: item.title, path: itemPath });
        
        // Extract file info from contentDetail
        const fileDetail = item.contentDetail?.['resource/x-bb-file']?.file;
        
        const fileInfo = {
          id: item.id,
          name: item.title,
          path: itemPath,
          contentId: item.id,
          hasAssociatedFiles: item.hasAssociatedFiles,
          contentHandler: item.contentHandler
        };
        
        // Get the download URL from the API response
        if (fileDetail) {
          fileInfo.fileName = fileDetail.fileName;
          fileInfo.mimeType = fileDetail.mimeType;
          fileInfo.downloadUrl = 'https://ultra.edu.kuleuven.cloud' + fileDetail.permanentUrl;
          fileInfo.fileSize = fileDetail.fileSize;
          
          log('INFO', 'File download URL', { 
            fileName: fileInfo.fileName,
            url: fileInfo.downloadUrl,
            size: fileInfo.fileSize
          });
        }
        
        allFiles.push(fileInfo);
        console.log('Found file:', fileInfo.name);
      }
      
      // Check if it's a folder (has children) OR if it's a folder content type
      // Some Toledo items may not have hasChildren field, so also check contentHandler
      // contentHandler can be a string "resource/x-bb-folder" or an object {id: "resource/x-bb-folder"}
      const isFolder = item.hasChildren || 
                       contentHandlerType === 'resource/x-bb-folder' ||
                       contentHandlerType === 'resource/x-bb-document' ||
                       (item.contentDetail && item.contentDetail['resource/x-bb-folder']?.isFolder);
      
      if (isFolder && item.id !== contentId) {  // Don't scan the same item twice
        const reason = item.hasChildren ? 'hasChildren' : 
                      contentHandlerType === 'resource/x-bb-folder' ? 'folder contentHandler' :
                      item.contentDetail?.['resource/x-bb-folder']?.isFolder ? 'contentDetail.isFolder' : 'unknown';
        log('INFO', 'Scanning subfolder', { title: item.title, id: item.id, reason });
        console.log('Scanning folder:', item.title);
        await scanAllContent(courseId, item.id, itemPath, allFiles);
      }
    }
    
    return allFiles;
  } catch (error) {
    console.error('Error scanning content:', error);
    return allFiles;
  }
}

// Download a single file
async function downloadFile(file, organizeByFolder, courseTitle) {
  try {
    log('INFO', 'Downloading file', { name: file.name, url: file.downloadUrl });
    
    if (!file.downloadUrl) {
      log('ERROR', 'No download URL for file', { name: file.name });
      console.error('Could not get download URL for:', file.name);
      return false;
    }

    // Determine the download filename and path
    let filename = file.fileName || file.name;
    
    // Clean the filename to remove invalid characters
    filename = filename.replace(/[<>:"|?*\\]/g, '_');
    
    if (organizeByFolder && file.path) {
      // Clean the path for filesystem - keep forward slashes as path separators
      // But remove other invalid characters
      const cleanPath = file.path.replace(/[<>:"|?*\\]/g, '_');
      filename = `${courseTitle}/${cleanPath}`;
    } else if (courseTitle) {
      filename = `${courseTitle}/${filename}`;
    }

    log('INFO', 'Initiating download', { filename, url: file.downloadUrl });

    // Trigger download using Chrome downloads API
    const response = await chrome.runtime.sendMessage({
      action: 'download',
      url: file.downloadUrl,
      filename: filename
    });
    
    log('INFO', 'Download response', { success: response?.success, filename });

    return response?.success || false;
  } catch (error) {
    log('ERROR', 'Download failed', { error: error.message, file: file.name });
    console.error('Error downloading file:', error);
    return false;
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getLogs') {
    log('INFO', 'Logs requested', { logCount: extensionLogs.length });
    sendResponse({ success: true, logs: extensionLogs });
    return true;
  }
  
  if (request.action === 'scanCourse') {
    log('INFO', 'Scan course requested');
    const courseId = getCourseId();
    
    if (!courseId) {
      log('ERROR', 'Could not extract course ID from URL', { url: window.location.href });
      sendResponse({ success: false, error: 'Could not extract course ID' });
      return true;
    }

    scanAllContent(courseId)
      .then(files => {
        log('INFO', 'Scan complete', { fileCount: files.length });
        sendResponse({ success: true, files: files });
      })
      .catch(error => {
        log('ERROR', 'Scan failed', { error: error.message });
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Will respond asynchronously
  }
  
  if (request.action === 'downloadFiles') {
    const courseId = getCourseId();
    // Clean course title - remove invalid filesystem characters including forward slash
    const courseTitle = document.title.replace(/[<>:"|?*\/]/g, '_').trim();
    
    (async () => {
      let successCount = 0;
      const files = request.files;
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Send progress update
        chrome.runtime.sendMessage({
          action: 'downloadProgress',
          current: i + 1,
          total: files.length,
          fileName: file.name
        });
        
        const success = await downloadFile(file, request.organizeByFolder, courseTitle);
        if (success) {
          successCount++;
        }
        
        // Small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      sendResponse({ success: true, count: successCount });
    })();
    
    return true; // Will respond asynchronously
  }
});

// Auto-download on page load if enabled
chrome.storage.local.get(['autoDownload'], async (result) => {
  if (result.autoDownload) {
    console.log('Auto-download enabled, scanning course...');
    const courseId = getCourseId();
    
    if (courseId) {
      const files = await scanAllContent(courseId);
      console.log(`Found ${files.length} files, starting auto-download...`);
      
      // Notify user
      chrome.runtime.sendMessage({
        action: 'showNotification',
        title: 'Toledo Auto Downloader',
        message: `Auto-downloading ${files.length} files from course`
      });
    }
  }
});
