#!/usr/bin/env python3
"""
Inviting Events — Full Site Patch
1. Fix toggleNav scroll lock
2. Add admin link to footers
3. Inject AI chat widget on all pages
Run from: ~/Downloads/Inviting Events /ie-site
"""
import os, re

ADMIN_LINK = '<a href="/admin/" style="opacity:0.3;display:inline-flex;align-items:center;gap:5px;margin-top:4px"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>Admin</a>'

CHAT_SCRIPT = '<script src="/assets/js/chat.js"></script>'
NAV_OPEN = "document.body.classList.toggle('nav-open');"

def find_html():
    files = []
    for root, dirs, fnames in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in ['workers','node_modules','.git','.wrangler']]
        for f in fnames:
            if f.endswith('.html'):
                files.append(os.path.join(root, f))
    return files

def patch_file(filepath, content):
    changes = []
    
    # 1. toggleNav scroll lock
    if 'toggleNav' in content and 'nav-open' not in content:
        fn = re.search(r'function\s+toggleNav\s*\(\)\s*\{', content)
        if fn:
            # Find the closing brace
            start = fn.end()
            depth, pos = 1, start
            while pos < len(content) and depth > 0:
                if content[pos] == '{': depth += 1
                elif content[pos] == '}': depth -= 1
                pos += 1
            content = content[:pos-1] + NAV_OPEN + content[pos-1:]
            changes.append('toggleNav scroll lock')
    
    # 2. Admin footer link — inside the Info column, after Contact
    # First, clean up old standalone admin column if it exists
    old_admin_col = re.search(r'<div class="footer-col"><h5>&nbsp;</h5><a href="/admin/"[^<]*<svg[^>]*>.*?</svg>Admin</a></div>', content, re.DOTALL)
    if old_admin_col:
        content = content[:old_admin_col.start()] + content[old_admin_col.end():]
        changes.append('removed old admin column')
    
    # Now add inline admin link after Contact if not already there
    if 'href="/admin/"' not in content and 'footer-col' in content:
        m = re.search(r'(<a\s+href=["\']/contact/["\']>Contact</a>)', content)
        if m:
            content = content[:m.end()] + '\n        ' + ADMIN_LINK + content[m.end():]
            changes.append('footer admin link')
    
    # 3. Chat widget (skip admin and live portal)
    skip_chat = '/admin/' in filepath or '/live/' in filepath
    if not skip_chat and CHAT_SCRIPT not in content and '</body>' in content:
        content = content.replace('</body>', CHAT_SCRIPT + '\n</body>')
        changes.append('chat widget')
    
    return content, changes

def main():
    print("🔧 Inviting Events — Full Site Patch\n")
    files = find_html()
    print(f"Scanning {len(files)} HTML files...\n")
    
    total = 0
    for f in files:
        with open(f, 'r') as fh:
            content = fh.read()
        new_content, changes = patch_file(f, content)
        if changes:
            with open(f, 'w') as fh:
                fh.write(new_content)
            print(f"  ✓ {f} — {', '.join(changes)}")
            total += len(changes)
        else:
            print(f"  · {f} — no changes needed")
    
    print(f"\n✅ {total} changes applied")
    print("\nNext steps:")
    print("  1. Review: git diff")
    print("  2. Commit: git add -A && git commit -m 'Site-wide: nav fix + admin link + AI chat' && git push origin main")

if __name__ == '__main__':
    main()
