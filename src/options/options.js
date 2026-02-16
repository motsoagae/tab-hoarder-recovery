// Options.js - Settings Page Controller

let settings = {};

const defaultSettings = {
  autoArchiveEnabled: true,
  autoArchiveDays: 7,
  archiveOnStartup: false,
  maxOpenTabs: 50,
  notificationsEnabled: true,
  archiveExcludedDomains: ['localhost', 'chrome://']
};

async function init() {
  await loadSettings();
  setupEventListeners();
  populateUI();
}

async function loadSettings() {
  const result = await chrome.storage.sync.get('settings');
  settings = result.settings || defaultSettings;
}

async function saveSettings() {
  await chrome.storage.sync.set({ settings });
  
  chrome.runtime.sendMessage({ 
    action: 'updateSettings', 
    settings 
  });
  
  showToast('✅ Settings saved!');
}

async function resetSettings() {
  if (!confirm('Reset all settings to defaults?')) return;
  
  settings = { ...defaultSettings };
  await saveSettings();
  populateUI();
  showToast('🔄 Settings reset to defaults');
}

function setupEventListeners() {
  document.getElementById('autoArchiveEnabled').addEventListener('change', (e) => {
    settings.autoArchiveEnabled = e.target.checked;
  });
  
  document.getElementById('archiveOnStartup').addEventListener('change', (e) => {
    settings.archiveOnStartup = e.target.checked;
  });
  
  document.getElementById('notificationsEnabled').addEventListener('change', (e) => {
    settings.notificationsEnabled = e.target.checked;
  });
  
  const autoArchiveDaysSlider = document.getElementById('autoArchiveDays');
  const autoArchiveDaysValue = document.getElementById('autoArchiveDaysValue');
  
  autoArchiveDaysSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    settings.autoArchiveDays = value;
    autoArchiveDaysValue.textContent = value;
  });
  
  const maxOpenTabsSlider = document.getElementById('maxOpenTabs');
  const maxOpenTabsValue = document.getElementById('maxOpenTabsValue');
  
  maxOpenTabsSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    settings.maxOpenTabs = value;
    maxOpenTabsValue.textContent = value;
  });
  
  document.getElementById('excludedDomains').addEventListener('input', (e) => {
    const domains = e.target.value
      .split('\n')
      .map(d => d.trim())
      .filter(d => d.length > 0);
    settings.archiveExcludedDomains = domains;
  });
  
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('resetBtn').addEventListener('click', resetSettings);
  document.getElementById('clearArchiveBtn').addEventListener('click', clearArchive);
  document.getElementById('clearAllBtn').addEventListener('click', clearAllData);
}

function populateUI() {
  document.getElementById('autoArchiveEnabled').checked = settings.autoArchiveEnabled;
  document.getElementById('archiveOnStartup').checked = settings.archiveOnStartup;
  document.getElementById('notificationsEnabled').checked = settings.notificationsEnabled;
  
  document.getElementById('autoArchiveDays').value = settings.autoArchiveDays;
  document.getElementById('autoArchiveDaysValue').textContent = settings.autoArchiveDays;
  
  document.getElementById('maxOpenTabs').value = settings.maxOpenTabs;
  document.getElementById('maxOpenTabsValue').textContent = settings.maxOpenTabs;
  
  document.getElementById('excludedDomains').value = 
    (settings.archiveExcludedDomains || []).join('\n');
}

async function clearArchive() {
  if (!confirm('This will permanently delete ALL archived tabs. Continue?')) return;
  
  try {
    const db = await openDB();
    
    const tx = db.transaction(['archivedTabs'], 'readwrite');
    const store = tx.objectStore('archivedTabs');
    await new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    showToast('🗑️ Archive cleared!');
  } catch (error) {
    console.error('Error clearing archive:', error);
    showToast('❌ Error clearing archive');
  }
}

async function clearAllData() {
  if (!confirm('This will delete EVERYTHING (tabs, sessions, stats). Continue?')) return;
  if (!confirm('Are you absolutely sure? This cannot be undone!')) return;
  
  try {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase('TabHoarderDB');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    settings = { ...defaultSettings };
    await chrome.storage.sync.set({ settings });
    
    showToast('💣 All data cleared!');
    
    setTimeout(() => {
      location.reload();
    }, 2000);
  } catch (error) {
    console.error('Error clearing data:', error);
    showToast('❌ Error clearing data');
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('TabHoarderDB', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

document.addEventListener('DOMContentLoaded', init);
