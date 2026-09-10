import re, subprocess, glob, collections
from PIL import Image

def audit(path, label):
    info = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
    pages = int(re.search(r'Pages:\s+(\d+)', info).group(1))
    out = subprocess.run(['pdftotext','-bbox','-f','1','-l',str(min(pages,8)),path,'-'],
                         capture_output=True, text=True).stdout
    hs = [round(float(b)-float(a),1) for a,b in
          re.findall(r'yMin="([\d.]+)" xMax="[\d.]+" yMax="([\d.]+)"', out)]
    c = collections.Counter(hs)
    body = c.most_common(1)[0][0] if hs else 0
    inks = []
    for p in range(1, min(pages,6)+1):
        subprocess.run(['pdftoppm','-f',str(p),'-l',str(p),'-r','50','-png',path,'/tmp/ap'],check=True)
        g = sorted(glob.glob('/tmp/ap*.png'))[-1]
        im = Image.open(g).convert('L'); wd,ht = im.size; px = im.load()
        nw = sum(1 for y in range(0,ht,2) for x in range(0,wd,2) if px[x,y] < 245)
        inks.append(nw / (len(range(0,ht,2))*len(range(0,wd,2))) * 100)
        subprocess.run('rm -f /tmp/ap*.png', shell=True)
    print('%-28s pages %3d | body type %.1fpt | ink %.1f%% (range %.1f–%.1f)'
          % (label, pages, body, sum(inks)/len(inks), min(inks), max(inks)))

for p,l in [('/mnt/user-data/uploads/Banking_Sector_Research_Report_EN.pdf','sector  BEFORE'),
            ('/tmp/sector-new.pdf','sector  AFTER'),
            ('/mnt/user-data/uploads/State_Bank_of_India_Company_Research_Report_EN.pdf','company BEFORE'),
            ('/tmp/company-new.pdf','company AFTER'),
            ('/mnt/user-data/uploads/Banking_Executive_Summary_EN.pdf','exec    BEFORE'),
            ('/tmp/exec-new.pdf','exec    AFTER')]:
    audit(p,l)
