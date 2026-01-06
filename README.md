# Toledo Course Auto Downloader

A Chrome extension that automatically downloads all files from Toledo courses for offline access.

## Features

- 🚀 **One-Click Download**: Download all course files with a single click
- 📁 **Folder Organization**: Maintains the original folder structure from Toledo
- 📊 **Progress Tracking**: Visual progress bar showing download status
- 💾 **Offline Access**: Keep all your study materials available offline

## Installation

### Chrome/Edge

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the root folder of this repo

## Usage

1. Navigate to any Toledo course pag.
2. Click the extension icon in your browser toolbar
3. Click "Download All Files" to download all files from the course - (Sometimes a download button isn't available. The extension can nonetheless download the document for you.)
4. Files will be organized in folders matching the course structure

## How It Works

The extension:
1. Uses Toledo's REST API to scan the course structure
2. Recursively finds all files in folders and subfolders
3. Downloads each file with its original filename
4. Organizes files in folders matching the course structure

## File Format Support

The extension downloads files in their original format:
- PDF documents (`.pdf`)
- PowerPoint presentations (`.pptx`, `.ppt`)
- Word documents (`.docx`, `.doc`)
- Excel spreadsheets (`.xlsx`, `.xls`)
- Images, videos, and other media files
- Any other file type available in Toledo

## Privacy & Security

- ✅ All processing happens locally in your browser
- ✅ No data is sent to external servers
- ✅ Only accesses Toledo when you initiate a download
- ✅ Uses your existing Toledo session/cookies

### API Endpoints Used

- `GET /learn/api/v1/courses/{courseId}/contents` - List course contents
- `GET /learn/api/v1/courses/{courseId}/contents/{contentId}/children` - List folder contents
- `GET /learn/api/v1/courses/{courseId}/contents/{contentId}` - Get file details
- `GET /bbcswebdav/pid-{contentId}-dt-content-rid-{fileId}/xid-{fileId}` - Download file

## Disclaimer

This extension isn't affiliated with KU Leuven or Blackboard. Use at your own discretion.
