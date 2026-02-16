// IndexedDB Wrapper for Tab Archive Storage
class TabArchiveDB {
  constructor() {
    this.dbName = 'TabHoarderDB';
    this.version = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('archivedTabs')) {
          const tabStore = db.createObjectStore('archivedTabs', { keyPath: 'id', autoIncrement: true });
          tabStore.createIndex('url', 'url', { unique: false });
          tabStore.createIndex('title', 'title', { unique: false });
          tabStore.createIndex('category', 'category', { unique: false });
          tabStore.createIndex('archivedAt', 'archivedAt', { unique: false });
          tabStore.createIndex('domain', 'domain', { unique: false });
        }

        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
          sessionStore.createIndex('name', 'name', { unique: false });
          sessionStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('stats')) {
          db.createObjectStore('stats', { keyPath: 'id' });
        }
      };
    });
  }

  async addArchivedTab(tabData) {
    const tx = this.db.transaction(['archivedTabs'], 'readwrite');
    const store = tx.objectStore('archivedTabs');
    
    const tabRecord = {
      ...tabData,
      archivedAt: Date.now(),
      domain: new URL(tabData.url).hostname
    };
    
    return new Promise((resolve, reject) => {
      const request = store.add(tabRecord);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getArchivedTabs(options = {}) {
    const tx = this.db.transaction(['archivedTabs'], 'readonly');
    const store = tx.objectStore('archivedTabs');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        let tabs = request.result;
        
        if (options.category) {
          tabs = tabs.filter(tab => tab.category === options.category);
        }
        
        if (options.search) {
          const searchLower = options.search.toLowerCase();
          tabs = tabs.filter(tab => 
            tab.title?.toLowerCase().includes(searchLower) ||
            tab.url?.toLowerCase().includes(searchLower)
          );
        }
        
        if (options.domain) {
          tabs = tabs.filter(tab => tab.domain === options.domain);
        }
        
        tabs.sort((a, b) => b.archivedAt - a.archivedAt);
        
        if (options.limit) {
          tabs = tabs.slice(0, options.limit);
        }
        
        resolve(tabs);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteArchivedTab(id) {
    const tx = this.db.transaction(['archivedTabs'], 'readwrite');
    const store = tx.objectStore('archivedTabs');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearOldTabs(daysOld) {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    const tabs = await this.getArchivedTabs();
    const tx = this.db.transaction(['archivedTabs'], 'readwrite');
    const store = tx.objectStore('archivedTabs');
    
    const deletePromises = tabs
      .filter(tab => tab.archivedAt < cutoffTime)
      .map(tab => new Promise((resolve, reject) => {
        const request = store.delete(tab.id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }));
    
    return Promise.all(deletePromises);
  }

  async saveSession(name, tabs) {
    const tx = this.db.transaction(['sessions'], 'readwrite');
    const store = tx.objectStore('sessions');
    
    const session = {
      name,
      tabs,
      createdAt: Date.now(),
      tabCount: tabs.length
    };
    
    return new Promise((resolve, reject) => {
      const request = store.add(session);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getSessions() {
    const tx = this.db.transaction(['sessions'], 'readonly');
    const store = tx.objectStore('sessions');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const sessions = request.result;
        sessions.sort((a, b) => b.createdAt - a.createdAt);
        resolve(sessions);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSession(id) {
    const tx = this.db.transaction(['sessions'], 'readwrite');
    const store = tx.objectStore('sessions');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getStats() {
    const tx = this.db.transaction(['stats'], 'readonly');
    const store = tx.objectStore('stats');
    
    return new Promise((resolve, reject) => {
      const request = store.get('global');
      request.onsuccess = () => resolve(request.result || {
        id: 'global',
        totalArchived: 0,
        totalRestored: 0,
        sessionsSaved: 0
      });
      request.onerror = () => reject(request.error);
    });
  }

  async updateStats(updates) {
    const stats = await this.getStats();
    const tx = this.db.transaction(['stats'], 'readwrite');
    const store = tx.objectStore('stats');
    
    const newStats = { ...stats, ...updates };
    
    return new Promise((resolve, reject) => {
      const request = store.put(newStats);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getCategoryCounts() {
    const tabs = await this.getArchivedTabs();
    const counts = {};
    
    tabs.forEach(tab => {
      const category = tab.category || 'uncategorized';
      counts[category] = (counts[category] || 0) + 1;
    });
    
    return counts;
  }

  async getTopDomains(limit = 10) {
    const tabs = await this.getArchivedTabs();
    const domainCounts = {};
    
    tabs.forEach(tab => {
      domainCounts[tab.domain] = (domainCounts[tab.domain] || 0) + 1;
    });
    
    return Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([domain, count]) => ({ domain, count }));
  }
}

export default TabArchiveDB;
