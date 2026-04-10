#!/usr/bin/env python3
"""
Inviting Events — Surgical Site Update
Fixes: toggleNav scroll lock + footer admin link
Run from: ~/Downloads/Inviting Events /ie-site
Usage: python3 patch-site.py
"""
import os, re, glob

ADMIN_LINK = '''<div class="footer-col"><h5>&nbsp;</h5><a href="/admin/" style="display:inline-flex;align-items:center;gap:6px;opacity:0.4"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>Admin</a></div>'''

SCROLL_LOCK_LINE = "document.body.classList.toggle('nav-open');"

def find_html_files():
    """Find all HTML files except admin, live, and workers"""
    files = []
    for root, dirs, filenames in os.walk('.'):
        # Skip dirs we don't want to touch
        dirs[:] = [d for d in dirs if d not in ['workers', 'node_modules', '.git', '.wrangler']]
        for f in filenames:
            if f.endswith('.html'):
                files.append(os.path.join(root, f))
    return files

def patch_toggle_nav(content, filepath):
    """Add body scroll lock to toggleNav function"""
    if 'toggleNav' not in content:
        return content, False
    
    if 'nav-open' in content:
        print(f"  ⊘ {filepath} — already has nav-open")
        return content, False
    
    # Pattern: find toggleNav function and add scroll lock
    # Handle various formats of the function
    patterns = [
        # Single-line minified
        (r"(function\s+toggleNav\s*\(\)\s*\{)(.*?)(\.classList\.toggle\(['\"]open['\"]\);?\s*\})",
         lambda m: m.group(1) + m.group(2) + m.group(3)[:-1] + SCROLL_LOCK_LINE + '}'),
        # Multi-line with querySelector
        (r"(function\s+toggleNav\s*\(\)\s*\{[^}]*\.classList\.toggle\(['\"]open['\"]\);?)\s*(\})",
         lambda m: m.group(1) + '\n  ' + SCROLL_LOCK_LINE + '\n' + m.group(2)),
    ]
    
    for pattern, replacement in patterns:
        new_content = re.sub(pattern, replacement, content, count=1, flags=re.DOTALL)
        if new_content != content:
            print(f"  ✓ {filepath} — toggleNav patched")
            return new_content, True
    
    # Fallback: just insert after the last classList.toggle('open') in the function
    # Find the function body
    fn_match = re.search(r"function\s+toggleNav\s*\(\)\s*\{", content)
    if fn_match:
        # Find the closing brace of the function
        start = fn_match.end()
        brace_count = 1
        pos = start
        while pos < len(content) and brace_count > 0:
            if content[pos] == '{': brace_count += 1
            elif content[pos] == '}': brace_count -= 1
            pos += 1
        # Insert before the closing brace
        insert_pos = pos - 1
        new_content = content[:insert_pos] + '\n  ' + SCROLL_LOCK_LINE + '\n' + content[insert_pos:]
        print(f"  ✓ {filepath} — toggleNav patched (fallback)")
        return new_content, True
    
    print(f"  ⚠ {filepath} — toggleNav found but couldn't patch")
    return content, False

def patch_footer(content, filepath):
    """Add admin link to footer"""
    if '/admin/' in content:
        print(f"  ⊘ {filepath} — already has admin link")
        return content, False
    
    if 'footer-col' not in content:
        print(f"  ⊘ {filepath} — no footer found")
        return content, False
    
    # Find the last footer-col closing tag before footer-bottom or footer-inner closing
    # Strategy: find the Info column (contains "Contact" link) and add admin col after it
    
    # Look for the pattern: </div> that closes the Info footer-col
    # The Info col has links to Pricing, Gallery, About, Contact
    contact_pattern = r'(<a\s+href="/contact/">Contact</a>\s*</div>)'
    match = re.search(contact_pattern, content)
    
    if match:
        insert_after = match.end()
        new_content = content[:insert_after] + '\n      ' + ADMIN_LINK + content[insert_after:]
        print(f"  ✓ {filepath} — admin link added to footer")
        return new_content, True
    
    print(f"  ⚠ {filepath} — footer found but couldn't locate insertion point")
    return content, False

def main():
    print("🔧 Inviting Events — Surgical Site Update\n")
    
    files = find_html_files()
    print(f"Found {len(files)} HTML files\n")
    
    total_changes = 0
    
    print("── toggleNav scroll lock ──")
    for f in files:
        with open(f, 'r') as fh:
            content = fh.read()
        new_content, changed = patch_toggle_nav(content, f)
        if changed:
            with open(f, 'w') as fh:
                fh.write(new_content)
            total_changes += 1
    
    print("\n── Footer admin link ──")
    for f in files:
        with open(f, 'r') as fh:
            content = fh.read()
        new_content, changed = patch_footer(content, f)
        if changed:
            with open(f, 'w') as fh:
                fh.write(new_content)
            total_changes += 1
    
    print(f"\n✅ Done — {total_changes} changes across {len(files)} files")
    print("   Review: git diff")
    print("   Commit: git add -A && git commit -m 'Site-wide: nav scroll lock + footer admin link' && git push origin main")

if __name__ == '__main__':
    main()
