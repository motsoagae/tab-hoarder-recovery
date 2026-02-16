// AI-Powered Tab Categorization
class TabCategorizationAI {
  constructor() {
    this.categories = {
      reading: {
        keywords: ['blog', 'article', 'news', 'medium', 'post', 'read', 'wiki', 'tutorial', 'guide', 'documentation', 'docs'],
        domains: ['medium.com', 'dev.to', 'reddit.com', 'wikipedia.org', 'stackoverflow.com', 'github.com']
      },
      shopping: {
        keywords: ['shop', 'buy', 'cart', 'product', 'price', 'store', 'amazon', 'checkout', 'order', 'purchase'],
        domains: ['amazon.com', 'ebay.com', 'walmart.com', 'etsy.com', 'shopify.com', 'aliexpress.com']
      },
      reference: {
        keywords: ['documentation', 'api', 'reference', 'spec', 'manual', 'docs', 'help', 'support', 'faq'],
        domains: ['docs.', 'developer.', 'api.', 'reference.']
      },
      entertainment: {
        keywords: ['video', 'watch', 'youtube', 'stream', 'movie', 'music', 'game', 'play', 'twitch', 'spotify'],
        domains: ['youtube.com', 'netflix.com', 'twitch.tv', 'spotify.com', 'hulu.com', 'vimeo.com']
      },
      social: {
        keywords: ['social', 'twitter', 'facebook', 'instagram', 'linkedin', 'post', 'tweet', 'profile'],
        domains: ['twitter.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'tiktok.com']
      },
      work: {
        keywords: ['dashboard', 'admin', 'analytics', 'manage', 'console', 'workspace', 'project', 'task'],
        domains: ['slack.com', 'notion.so', 'trello.com', 'asana.com', 'monday.com', 'jira.']
      },
      research: {
        keywords: ['research', 'paper', 'study', 'academic', 'journal', 'scholar', 'publication', 'thesis'],
        domains: ['scholar.google.com', 'arxiv.org', 'researchgate.net', 'jstor.org', 'pubmed.']
      }
    };
    this.initialized = false;
  }

  async init() {
    this.initialized = true;
    return true;
  }

  async categorize(tab) {
    if (!this.initialized) await this.init();

    const url = (tab.url || '').toLowerCase();
    const title = (tab.title || '').toLowerCase();
    const scores = {};
    
    for (const [category, rules] of Object.entries(this.categories)) {
      let score = 0;
      
      for (const keyword of rules.keywords) {
        if (url.includes(keyword)) score += 2;
        if (title.includes(keyword)) score += 3;
      }
      
      for (const domain of rules.domains) {
        if (url.includes(domain)) score += 5;
      }
      
      scores[category] = score;
    }

    const bestCategory = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    
    if (bestCategory[1] < 2) {
      return { category: 'uncategorized', confidence: 0, scores };
    }

    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? bestCategory[1] / totalScore : 0;

    return {
      category: bestCategory[0],
      confidence: Math.min(confidence, 1),
      scores
    };
  }

  getCategoryInfo(category) {
    const info = {
      reading: { icon: '📚', color: '#4CAF50', description: 'Articles, blogs, tutorials' },
      shopping: { icon: '🛒', color: '#FF9800', description: 'E-commerce and shopping' },
      reference: { icon: '📖', color: '#2196F3', description: 'Documentation and references' },
      entertainment: { icon: '🎬', color: '#E91E63', description: 'Videos, music, games' },
      social: { icon: '💬', color: '#9C27B0', description: 'Social media' },
      work: { icon: '💼', color: '#607D8B', description: 'Work and productivity' },
      research: { icon: '🔬', color: '#00BCD4', description: 'Academic and research' },
      uncategorized: { icon: '📋', color: '#757575', description: 'Uncategorized' }
    };
    return info[category] || info.uncategorized;
  }
}

export default TabCategorizationAI;
