"""Re-flow a generated report as continuous A4 pages. The app's packer runs in a
browser and cannot run here, so this measures the same content and the same
stylesheet under real pagination: how much paper the content actually needs."""
import re, sys, weasyprint

def reflow(path, out):
    html = open(path, encoding='utf-8').read()
    css = ''.join(re.findall(r'<style>(.*?)</style>', html, re.S))
    body = re.sub(r'<style>.*?</style>', '', html, flags=re.S)
    body = re.sub(r'<script.*?</script>', '', body, flags=re.S)
    # running header and footer are furniture the page box supplies; drop them
    # so what is measured is the content itself.
    body = re.sub(r'<div class="rh">.*?</div>\s*</div>', '', body, flags=re.S)
    body = re.sub(r'<div class="rfw">.*?</div>\s*</div>\s*</div>', '', body, flags=re.S)
    m = re.search(r'<body[^>]*>(.*)</body>', body, flags=re.S)
    if m: body = m.group(1)
    # The app seeds far more page shells than it needs and its packer deletes
    # the empty ones. Nothing here runs that packer, so the empty shells are
    # dropped by hand or the page count is just the seed count.
    kept = []
    for chunk in re.split(r'(?=<div class="page")', body):
        if 'class="page"' in chunk and not re.search(r'class="(sec|sc-blk|ir-lead|toc)', chunk):
            continue
        kept.append(chunk)
    body = ''.join(kept)
    # let the seeded shells flow instead of clipping at a fixed height
    css = re.sub(r'height:297mm;', '', css)
    css = re.sub(r'overflow:hidden;', '', css)
    doc = ('<!doctype html><html><head><meta charset="utf-8"><style>' + css
           + '\n@page{size:A4;margin:13mm 14mm 15mm;}'
           + '\n.page{width:auto;margin:0;padding:0;background:#fff;display:block;}'
           + '\n.body{padding:0;display:block;}'
           + '\n.rh,.rfw,.rf{display:none;}\n</style></head><body>' + body + '</body></html>')
    weasyprint.HTML(string=doc).write_pdf(out)

for name in sys.argv[1:]:
    reflow('/tmp/%s-new.html' % name, '/tmp/%s-new.pdf' % name)
    print('rendered', name)
