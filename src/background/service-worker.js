// Background Service Worker - Tab Monitoring & Auto-Archive
import TabArchiveDB from '../lib/db.js';
import TabCategorizationAI from '../lib/ai-categorizer.js';

let db = null;
let ai = null;
let settings = null;

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Tab Hoarder Recovery installed');
  
  // Set default settings
  const defaultSettings = {
    autoArchiveEnabled: true,
    autoArchiveDays: 7,
    archiveOnStartup: false,
    maxOpenTabs: 50,
    notificationsEnabled: true,
    archiveExcludedDomains: ['localhost', 'chrome://'],
    categories: ['reading', 'shopping', 'reference', 'entertainment', 'social', 'work', 'research']
  };
  
  await chrome.storage.sync.set({ settings: defaultSettings });
  
  // Set up periodic check alarm
  chrome.alarms.create('checkOldTabs', {
    periodInMinutes: 60 // Check every hour
  });
  
  // Set up daily cleanup
  chrome.alarms.create('dailyCleanup', {
    periodInMinutes: 1440 // Once per day
  });
});

// Initialize DB and AI
async function initialize() {
  if (!db) {
    db = new TabArchiveDB();
    await db.init();
  }
  
  if (!ai) {
    ai = new TabCategorizationAI();
    await ai.init();
  }
  
  if (!settings) {
    const result = await chrome.storage.sync.get('settings');
    settings = result.settings;
  }
}

// Get tab age in days
function getTabAge(tab) {
  if (!tab.lastAccessed) return 0;
  const now = Date.now();
  const ageMs = now - tab.lastAccessed;
  return ageMs / (1000 * 60 * 60 * 24);
}

// Check if tab should be excluded from archiving
function shouldExcludeTab(tab) {
  if (!tab.url) return true;
  
  const url = tab.url.toLowerCase();
  
  // Exclude system pages
  if (url.startsWith('chrome://') || 
      url.startsWith('chrome-extension://') ||
      url.startsWith('edge://') ||
      url.startsWith('about:')) {
    return true;
  }
  
  // Exclude pinned tabs
  if (tab.pinned) return true;
  
  // Exclude active tab
  if (tab.active) return true;
  
  // Check excluded domains
  if (settings?.archiveExcludedDomains) {
    for (const domain of settings.archiveExcludedDomains) {
      if (url.includes(domain)) return true;
    }
  }
  
  return false;
}

// Archive a tab
async function archiveTab(tab, reason = 'manual') {
  await initialize();
  
  // Categorize the tab
  const categorization = await ai.categorize(tab);
  
  // Save to archive
  const tabData = {
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    category: categorization.category,
    categoryConfidence: categorization.confidence,
    reason,
    lastAccessed: tab.lastAccessed || Date.now()
  };
  
  await db.addArchivedTab(tabData);
  
  // Update stats
  const stats = await db.getStats();
  await db.updateStats({
    totalArchived: (stats.totalArchived || 0) + 1
  });
  
  // Close the tab
  await chrome.tabs.remove(tab.id);
  
  // Show notification
  if (settings?.notificationsEnabled) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../icons/icon128.png',
      title: 'Tab Archived',
      message: `"${tab.title}" has been archived to ${categorization.category}`
    });
  }
  
  return categorization;
}

// Check for old tabs and archive them
async function checkOldTabs() {
  await initialize();
  
  if (!settings?.autoArchiveEnabled) return;
  
  const allTabs = await chrome.tabs.query({});
  const oldTabs = [];
  
  for (const tab of allTabs) {
    const age = getTabAge(tab);
    
    if (age >= settings.autoArchiveDays && !shouldExcludeTab(tab)) {
      oldTabs.push(tab);
    }
  }
  
  // Archive old tabs
  for (const tab of oldTabs) {
    await archiveTab(tab, 'auto-archive-old');
  }
  
  if (oldTabs.length > 0) {
    console.log(`Auto-archived ${oldTabs.length} old tabs`);
  }
}

// Check if too many tabs are open
async function checkTabLimit() {
  await initialize();
  
  if (!settings?.maxOpenTabs) return;
  
  const allTabs = await chrome.tabs.query({});
  const nonExcludedTabs = allTabs.filter(tab => !shouldExcludeTab(tab));
  
  if (nonExcludedTabs.length > settings.maxOpenTabs) {
    // Sort by last accessed, archive oldest
    nonExcludedTabs.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));
    
    const toArchive = nonExcludedTabs.slice(0, nonExcludedTabs.length - settings.maxOpenTabs);
    
    for (const tab of toArchive) {
      await archiveTab(tab, 'auto-archive-limit');
    }
    
    console.log(`Archived ${toArchive.length} tabs due to limit`);
  }
}

// Save current session
async function saveCurrentSession(sessionName) {
  await initialize();
  
  const allTabs = await chrome.tabs.query({});
  const tabsData = allTabs.map(tab => ({
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    pinned: tab.pinned
  }));
  
  await db.saveSession(sessionName, tabsData);
  
  const stats = await db.getStats();
  await db.updateStats({
    sessionsSaved: (stats.sessionsSaved || 0) + 1
  });
  
  return tabsData.length;
}

// Restore session
async function restoreSession(sessionId) {
  await initialize();
  
  const sessions = await db.getSessions();
  const session = sessions.find(s => s.id === sessionId);
  
  if (!session) return;
  
  // Open all tabs from session
  for (const tabData of session.tabs) {
    await chrome.tabs.create({
      url: tabData.url,
      pinned: tabData.pinned || false,
      active: false
    });
  }
  
  return session.tabs.length;
}

// Restore archived tab
async function restoreTab(tabId) {
  await initialize();
  
  const tabs = await db.getArchivedTabs();
  const tab = tabs.find(t => t.id === tabId);
  
  if (!tab) return;
  
  // Open the tab
  await chrome.tabs.create({
    url: tab.url,
    active: true
  });
  
  // Remove from archive
  await db.deleteArchivedTab(tabId);
  
  // Update stats
  const stats = await db.getStats();
  await db.updateStats({
    totalRestored: (stats.totalRestored || 0) + 1
  });
}

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkOldTabs') {
    await checkOldTabs();
    await checkTabLimit();
  } else if (alarm.name === 'dailyCleanup') {
    await initialize();
    // Clean up archived tabs older than 90 days
    await db.clearOldTabs(90);
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'archive-current-tab') {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && !shouldExcludeTab(activeTab)) {
      await archiveTab(activeTab, 'keyboard-shortcut');
    }
  } else if (command === 'save-session') {
    const timestamp = new Date().toLocaleString();
    await saveCurrentSession(`Session ${timestamp}`);
    
    if (settings?.notificationsEnabled) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '../icons/icon128.png',
        title: 'Session Saved',
        message: 'Current tab session has been saved'
      });
    }
  }
});

// Message handler for popup communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    await initialize();
    
    switch (request.action) {
      case 'archiveTab':
        const result = await archiveTab(request.tab, 'manual');
        sendResponse({ success: true, categorization: result });
        break;
        
      case 'restoreTab':
        await restoreTab(request.tabId);
        sendResponse({ success: true });
        break;
        
      case 'saveSession':
        const count = await saveCurrentSession(request.name);
        sendResponse({ success: true, count });
        break;
        
      case 'restoreSession':
        const restored = await restoreSession(request.sessionId);
        sendResponse({ success: true, count: restored });
        break;
        
      case 'getStats':
        const stats = await db.getStats();
        const categoryCounts = await db.getCategoryCounts();
        const topDomains = await db.getTopDomains();
        sendResponse({ stats, categoryCounts, topDomains });
        break;
        
      case 'updateSettings':
        settings = request.settings;
        await chrome.storage.sync.set({ settings });
        sendResponse({ success: true });
        break;
        
      case 'checkNow':
        await checkOldTabs();
        await checkTabLimit();
        sendResponse({ success: true });
        break;
    }
  })();
  
  return true; // Keep message channel open for async response
});

// Initialize on startup
initialize();
