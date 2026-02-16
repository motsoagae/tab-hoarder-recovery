// Popup.js - Main UI Controller
import TabArchiveDB from '../lib/db.js';
import TabCategorizationAI from '../lib/ai-categorizer.js';

let db = null;
let ai = null;
let currentView = 'archived';
let currentCategory = 'all';
let searchQuery = '';

async function init() {
  db = new TabArchiveDB();
  await db.init();
  
  ai = new TabCategorizationAI();
  await ai.init();
  
  setupEventListeners();
  await updateUI();
  updateTabCount();
}

function setupEventListeners() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentView = btn.dataset.view;
      switchView(currentView);
    });
  });
  
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCategory = btn.dataset.category;
      document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadArchivedTabs();
    });
  });
  
  const searchInput = document.getElementById('searchInput');
  const clearSearch = document.getElementById('clearSearch');
  
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    clearSearch.classList.toggle('visible', searchQuery.length > 0);
    loadArchivedTabs();
  });
  
  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearch.classList.remove('visible');
    loadArchivedTabs();
  });
  
  document.getElementById('checkNowBtn').addEventListener('click', checkNow);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('saveSessionBtn').addEventListener('click', saveSession);
}

function switchView(view) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
  });
  document.getElementById(`${view}View`).classList.add('active');
  
  const categoryFilter = document.getElementById('categoryFilter');
  categoryFilter.style.display = view === 'archived' ? 'flex' : 'none';
  
  if (view === 'archived') {
    loadArchivedTabs();
  } else if (view === 'sessions') {
    loadSessions();
  } else if (view === 'analytics') {
    loadAnalytics();
  }
}

async function updateUI() {
  await loadArchivedTabs();
  await updateStats();
}

async function updateTabCount() {
  const tabs = await chrome.tabs.query({});
  const archivedTabs = await db.getArchivedTabs();
  
  document.querySelector('#tabCount .stat-value').textContent = tabs.length;
  document.querySelector('#archivedCount .stat-value').textContent = archivedTabs.length;
}

async function updateStats() {
  await updateTabCount();
}

async function loadArchivedTabs() {
  const container = document.getElementById('archivedTabs');
  container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>LOADING...</p></div>';
  
  try {
    const options = {
      search: searchQuery,
      category: currentCategory === 'all' ? null : currentCategory
    };
    
    const tabs = await db.getArchivedTabs(options);
    
    if (tabs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <div class="empty-state-text">
            ${searchQuery ? 'NO TABS FOUND' : 'NO ARCHIVED TABS YET'}
          </div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = '';
    
    tabs.forEach((tab, index) => {
      const tabEl = createTabElement(tab, index);
      container.appendChild(tabEl);
    });
  } catch (error) {
    console.error('Error loading tabs:', error);
    showToast('Error loading tabs');
  }
}

function createTabElement(tab, index) {
  const div = document.createElement('div');
  div.className = 'tab-item';
  div.style.animationDelay = `${index * 0.05}s`;
  
  const categoryInfo = ai.getCategoryInfo(tab.category);
  const timeAgo = getTimeAgo(tab.archivedAt);
  
  div.innerHTML = `
    <img 
      src="${tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="20" font-size="20">🌐</text></svg>'}" 
      class="tab-favicon"
      onerror="this.src='data:image/svg+xml,<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 24 24\\"><text y=\\"20\\" font-size=\\"20\\">🌐</text></svg>'"
    >
    <div class="tab-info">
      <div class="tab-title">${escapeHtml(tab.title)}</div>
      <div class="tab-meta">
        <span class="tab-category" style="border-color: ${categoryInfo.color}">
          ${categoryInfo.icon} ${tab.category.toUpperCase()}
        </span>
        <span>${timeAgo}</span>
        <span>${tab.domain}</span>
      </div>
    </div>
    <div class="tab-actions">
      <button class="tab-action-btn" data-action="restore" data-id="${tab.id}">
        ↩️ RESTORE
      </button>
      <button class="tab-action-btn" data-action="delete" data-id="${tab.id}">
        🗑️ DELETE
      </button>
    </div>
  `;
  
  div.querySelector('[data-action="restore"]').addEventListener('click', (e) => {
    e.stopPropagation();
    restoreTab(tab.id);
  });
  
  div.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTab(tab.id);
  });
  
  div.addEventListener('click', () => {
    restoreTab(tab.id);
  });
  
  return div;
}

async function restoreTab(tabId) {
  try {
    const tabs = await db.getArchivedTabs();
    const tab = tabs.find(t => t.id === tabId);
    
    if (!tab) return;
    
    await chrome.tabs.create({
      url: tab.url,
      active: false
    });
    
    await db.deleteArchivedTab(tabId);
    
    const stats = await db.getStats();
    await db.updateStats({
      totalRestored: (stats.totalRestored || 0) + 1
    });
    
    showToast('✅ Tab restored!');
    await updateUI();
  } catch (error) {
    console.error('Error restoring tab:', error);
    showToast('❌ Error restoring tab');
  }
}

async function deleteTab(tabId) {
  try {
    await db.deleteArchivedTab(tabId);
    showToast('🗑️ Tab deleted');
    await updateUI();
  } catch (error) {
    console.error('Error deleting tab:', error);
    showToast('❌ Error deleting tab');
  }
}

async function loadSessions() {
  const container = document.getElementById('sessionsList');
  container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>LOADING...</p></div>';
  
  try {
    const sessions = await db.getSessions();
    
    if (sessions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💾</div>
          <div class="empty-state-text">NO SAVED SESSIONS YET</div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = '';
    
    sessions.forEach((session, index) => {
      const sessionEl = createSessionElement(session, index);
      container.appendChild(sessionEl);
    });
  } catch (error) {
    console.error('Error loading sessions:', error);
    showToast('Error loading sessions');
  }
}

function createSessionElement(session, index) {
  const div = document.createElement('div');
  div.className = 'session-item';
  div.style.animationDelay = `${index * 0.05}s`;
  
  const date = new Date(session.createdAt).toLocaleString();
  
  div.innerHTML = `
    <div class="session-header">
      <div class="session-name">${escapeHtml(session.name)}</div>
      <div class="session-actions">
        <button class="tab-action-btn" data-action="restore" data-id="${session.id}">
          ↩️ RESTORE
        </button>
        <button class="tab-action-btn btn-danger" data-action="delete" data-id="${session.id}">
          🗑️
        </button>
      </div>
    </div>
    <div class="session-info">
      ${session.tabCount} TABS • ${date}
    </div>
  `;
  
  div.querySelector('[data-action="restore"]').addEventListener('click', async () => {
    await restoreSession(session.id);
  });
  
  div.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    await deleteSession(session.id);
  });
  
  return div;
}

async function saveSession() {
  const sessionName = prompt('Enter session name:', `Session ${new Date().toLocaleString()}`);
  
  if (!sessionName) return;
  
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tabsData = tabs.map(tab => ({
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
    
    showToast('💾 Session saved!');
    
    if (currentView === 'sessions') {
      await loadSessions();
    }
  } catch (error) {
    console.error('Error saving session:', error);
    showToast('❌ Error saving session');
  }
}

async function restoreSession(sessionId) {
  try {
    const sessions = await db.getSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) return;
    
    for (const tabData of session.tabs) {
      await chrome.tabs.create({
        url: tabData.url,
        pinned: tabData.pinned || false,
        active: false
      });
    }
    
    showToast(`✅ Restored ${session.tabs.length} tabs!`);
  } catch (error) {
    console.error('Error restoring session:', error);
    showToast('❌ Error restoring session');
  }
}

async function deleteSession(sessionId) {
  if (!confirm('Delete this session?')) return;
  
  try {
    await db.deleteSession(sessionId);
    showToast('🗑️ Session deleted');
    await loadSessions();
  } catch (error) {
    console.error('Error deleting session:', error);
    showToast('❌ Error deleting session');
  }
}

async function loadAnalytics() {
  try {
    const stats = await db.getStats();
    const categoryCounts = await db.getCategoryCounts();
    const topDomains = await db.getTopDomains();
    
    document.getElementById('totalArchivedStat').textContent = stats.totalArchived || 0;
    document.getElementById('totalRestoredStat').textContent = stats.totalRestored || 0;
    document.getElementById('totalSessionsStat').textContent = stats.sessionsSaved || 0;
    
    const categoryChart = document.getElementById('categoryChart');
    categoryChart.innerHTML = '';
    
    const totalTabs = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
    
    Object.entries(categoryCounts).forEach(([category, count]) => {
      const percentage = totalTabs > 0 ? (count / totalTabs * 100) : 0;
      const categoryInfo = ai.getCategoryInfo(category);
      
      const bar = document.createElement('div');
      bar.className = 'category-bar';
      bar.innerHTML = `
        <div class="category-bar-label">${categoryInfo.icon} ${category.toUpperCase()}</div>
        <div class="category-bar-track">
          <div class="category-bar-fill" style="width: ${percentage}%; background: ${categoryInfo.color}">
            ${count}
          </div>
        </div>
      `;
      
      categoryChart.appendChild(bar);
    });
    
    const domainList = document.getElementById('domainList');
    domainList.innerHTML = '';
    
    topDomains.forEach(({ domain, count }) => {
      const item = document.createElement('div');
      item.className = 'domain-item';
      item.innerHTML = `
        <span class="domain-name">${domain}</span>
        <span class="domain-count">${count}</span>
      `;
      domainList.appendChild(item);
    });
    
  } catch (error) {
    console.error('Error loading analytics:', error);
    showToast('Error loading analytics');
  }
}

async function checkNow() {
  try {
    chrome.runtime.sendMessage({ action: 'checkNow' }, (response) => {
      if (response?.success) {
        showToast('✅ Check completed!');
        updateUI();
      }
    });
  } catch (error) {
    console.error('Error checking now:', error);
    showToast('❌ Error running check');
  }
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'JUST NOW';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}M AGO`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}H AGO`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}D AGO`;
  
  return new Date(timestamp).toLocaleDateString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
