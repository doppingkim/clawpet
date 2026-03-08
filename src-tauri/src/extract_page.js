(() => {
  const host = location.hostname;
  const path = location.pathname;
  const isX = host === 'x.com' || host === 'twitter.com'
    || host.endsWith('.x.com') || host.endsWith('.twitter.com');

  const r = {
    pageType: 'web',
    url: location.href,
    title: document.title,
    author: '',
    authorHandle: '',
    date: '',
    content: '',
    images: [],
    textHints: '',
    clipDate: new Date().toLocaleDateString('sv-SE')
  };

  // Simple DOM-to-Markdown converter for articles/web pages
  // Images encountered inline are added to r.images with {{IMG:N}} placeholders
  function toMd(el) {
    if (!el) return '';
    let md = '';
    for (const node of el.childNodes) {
      if (node.nodeType === 3) {
        md += node.textContent;
        continue;
      }
      if (node.nodeType !== 1) continue;
      const tag = node.tagName.toLowerCase();
      if (['script','style','nav','footer','iframe','svg','noscript'].includes(tag)) continue;

      // Handle img inline - insert placeholder at the exact position
      if (tag === 'img') {
        const src = node.src || '';
        if (!src || !src.startsWith('http')) continue;
        // Skip tiny images (icons, emoji, avatars)
        const isXMedia = src.includes('pbs.twimg.com/media');
        const isBigEnough = node.naturalWidth > 100 && node.naturalHeight > 100;
        if (!isXMedia && !isBigEnough) continue;
        if (src.includes('emoji') || src.includes('profile_images') || src.includes('hashflag')) continue;

        let imgUrl = src;
        if (isXMedia) {
          try { const u = new URL(src); u.searchParams.set('name', 'large'); imgUrl = u.toString(); } catch {}
        }
        let idx = r.images.indexOf(imgUrl);
        if (idx === -1) { r.images.push(imgUrl); idx = r.images.length - 1; }
        md += '\n\n{{IMG:' + idx + '}}\n\n';
        continue;
      }

      // Skip X engagement metrics (views, likes, retweets, replies, analytics)
      const testId = node.getAttribute ? (node.getAttribute('data-testid') || '') : '';
      if (testId === 'app-text-transition-container') continue;
      if (testId === 'like' || testId === 'retweet' || testId === 'reply' || testId === 'bookmark') continue;
      if (node.getAttribute && node.getAttribute('role') === 'group') continue;
      if (node.href && typeof node.href === 'string' && node.href.includes('/analytics')) continue;

      const inner = toMd(node);
      if (!inner.trim()) continue;
      switch (tag) {
        case 'h1': md += '\n# ' + inner.trim() + '\n\n'; break;
        case 'h2': md += '\n## ' + inner.trim() + '\n\n'; break;
        case 'h3': md += '\n### ' + inner.trim() + '\n\n'; break;
        case 'h4': md += '\n#### ' + inner.trim() + '\n\n'; break;
        case 'p': md += inner.trim() + '\n\n'; break;
        case 'br': md += '\n'; break;
        case 'strong': case 'b': md += '**' + inner + '**'; break;
        case 'em': case 'i': md += '*' + inner + '*'; break;
        case 'mark': md += '<mark style="background: #FFB8EBA6;">' + inner + '</mark>'; break;
        case 'hr': md += '\n---\n\n'; break;
        case 'blockquote': md += '\n> ' + inner.trim().replace(/\n/g, '\n> ') + '\n\n'; break;
        case 'li': md += '- ' + inner.trim() + '\n'; break;
        case 'ul': case 'ol': md += '\n' + inner + '\n'; break;
        case 'a': {
          const href = node.href || '';
          // Skip analytics and engagement links
          if (href.includes('/analytics') || href.includes('/likes') || href.includes('/retweets') || href.includes('/quotes')) break;
          // Media links wrap images - extract only image placeholders, drop link text
          if (href.includes('/media/') || href.includes('/photo/')) {
            const imgMatches = inner.match(/\{\{IMG:\d+\}\}/g);
            if (imgMatches) {
              md += '\n\n' + imgMatches.join('\n\n') + '\n\n';
            }
            break;
          }
          if (href && !/^\s*javascript\s*:/i.test(href)) {
            md += '[' + inner.trim() + '](' + href + ')';
          } else {
            md += inner;
          }
          break;
        }
        case 'code': md += '`' + inner + '`'; break;
        case 'pre': md += '\n```\n' + node.textContent + '\n```\n\n'; break;
        default: md += inner; break;
      }
    }
    return md;
  }

  function getXImageUrl(img) {
    let src = img.src;
    try {
      const u = new URL(src);
      u.searchParams.set('name', 'large');
      src = u.toString();
    } catch {}
    return src;
  }

  if (isX) {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');

    // Detect X Article by DOM elements (not just URL - articles use /status/ URLs too)
    const isArticlePage = path.includes('/article/')
      || !!document.querySelector('[data-testid="twitterArticleRichTextView"]')
      || !!document.querySelector('[data-testid="longformRichTextComponent"]')
      || !!document.querySelector('[data-testid="twitterArticleReadView"]');

    // Extract author from first tweet
    if (articles.length > 0) {
      const nameEl = articles[0].querySelector('[data-testid="User-Name"]');
      if (nameEl) {
        const links = nameEl.querySelectorAll('a[role="link"]');
        if (links[0]) r.author = links[0].textContent.trim();
        if (links[1]) r.authorHandle = links[1].textContent.trim();
      }
      const timeEl = articles[0].querySelector('time');
      if (timeEl) r.date = timeEl.getAttribute('datetime') || '';
    }

    if (isArticlePage) {
      r.pageType = 'x_article';

      // Get article title
      const titleEl = document.querySelector('[data-testid="twitter-article-title"]');
      if (titleEl) {
        r.title = titleEl.innerText.trim();
      }

      // Try multiple article body selectors (X changes these)
      const articleBody = document.querySelector(
        '[data-testid="twitterArticleRichTextView"]'
        + ', [data-testid="longformRichTextComponent"]'
        + ', [data-testid="twitterArticleReadView"]'
        + ', [data-testid="TextModule"]'
        + ', [data-testid="noteText"]'
        + ', [data-testid="richTextBlock"]'
      );
      if (articleBody) {
        r.content = toMd(articleBody);
      } else {
        // Fallback: collect all tweet texts
        r.content = Array.from(articles)
          .map(a => {
            const txt = a.querySelector('[data-testid="tweetText"]');
            return txt ? txt.innerText : '';
          })
          .filter(Boolean)
          .join('\n\n---\n\n');
      }
      // Images for articles are collected inline by toMd via {{IMG:N}} placeholders

    } else if (articles.length > 0) {
      // Single post or thread
      const mainHandle = r.authorHandle;

      // Check for thread: multiple tweets by the same author on a status page
      if (path.includes('/status/') && articles.length > 1) {
        const threadParts = [];
        for (const article of articles) {
          // Check if same author
          const nameEl = article.querySelector('[data-testid="User-Name"]');
          let handle = '';
          if (nameEl) {
            const links = nameEl.querySelectorAll('a[role="link"]');
            if (links[1]) handle = links[1].textContent.trim();
          }
          if (handle === mainHandle || !mainHandle) {
            const txt = article.querySelector('[data-testid="tweetText"]');
            if (txt) threadParts.push(txt.innerText);
          }
        }
        if (threadParts.length > 1) {
          r.pageType = 'x_thread';
          r.content = threadParts.join('\n\n---\n\n');
        } else {
          r.pageType = 'x_post';
          const textEl = articles[0].querySelector('[data-testid="tweetText"]');
          if (textEl) r.content = textEl.innerText;
        }
      } else {
        r.pageType = 'x_post';
        const textEl = articles[0].querySelector('[data-testid="tweetText"]');
        if (textEl) r.content = textEl.innerText;
      }

      // Collect images from same-author tweets
      const seenImgs = new Set();
      for (const article of articles) {
        // Only include images from same author's tweets
        const nameEl = article.querySelector('[data-testid="User-Name"]');
        let handle = '';
        if (nameEl) {
          const links = nameEl.querySelectorAll('a[role="link"]');
          if (links[1]) handle = links[1].textContent.trim();
        }
        if (handle === mainHandle || !mainHandle) {
          article.querySelectorAll('img[src*="pbs.twimg.com/media"]').forEach(img => {
            const src = getXImageUrl(img);
            if (!seenImgs.has(src)) { seenImgs.add(src); r.images.push(src); }
          });
        }
      }
    }

  } else {
    // General web page
    r.pageType = 'web';
    const selectors = [
      'article', '[role="main"]', 'main',
      '.post-content', '.article-body', '.entry-content', '#content'
    ];
    let mainEl = null;
    for (const s of selectors) {
      mainEl = document.querySelector(s);
      if (mainEl) break;
    }
    if (!mainEl) mainEl = document.body;

    r.content = toMd(mainEl).substring(0, 50000);

    // Collect significant images
    const seenSrc = new Set();
    mainEl.querySelectorAll('img').forEach(img => {
      if (
        img.naturalWidth > 200 &&
        img.naturalHeight > 200 &&
        img.src &&
        img.src.startsWith('http') &&
        !seenSrc.has(img.src)
      ) {
        seenSrc.add(img.src);
        r.images.push(img.src);
      }
    });
  }

  // Limit images to 30
  r.images = r.images.slice(0, 30);

  // Clean up content: collapse excessive newlines
  r.content = r.content.replace(/\n{3,}/g, '\n\n').trim();

  // Category hints
  r.textHints = (r.title + ' ' + r.content).substring(0, 3000).toLowerCase();

  return JSON.stringify(r);
})()
