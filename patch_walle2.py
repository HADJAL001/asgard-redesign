import sys
p = 'a:/HADJAL/Рабочий стол/asgard-redesign/components/eternity-landing.tsx'
with open(p, 'r', encoding='utf-8') as f:
    c = f.read()

# Find the broken style block and replace it with dangerouslySetInnerHTML approach
old = r"""      <style>{\`
        .wm-scene {
          position: fixed;
          bottom: 40px;
          right: 5vw;
          z-index: 10;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          animation: wmIn 0.8s cubic-bezier(0.2,0.8,0.2,1) 0.3s both;
        }
        @keyframes wmIn {
          from { opacity:0; transform:translateY(40px) scale(0.8); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        .wm-svg {
          width: 120px;
          height: 180px;
          filter: drop-shadow(0 4px 16px rgba(200,134,26,0.5)) drop-shadow(0 0 8px rgba(0,0,0,0.8));
          animation: wmBob 4s ease-in-out infinite;
          will-change: transform;
        }
        @keyframes wmBob {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }
        .wm-bubble {
          margin-top: 8px;
          background: rgba(10,14,26,0.95);
          border: 1px solid rgba(255,215,0,0.5);
          border-radius: 12px;
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 500;
          color: #FFD700;
          white-space: nowrap;
          letter-spacing: 0.02em;
          box-shadow: 0 2px 16px rgba(0,0,0,0.6);
          animation: wmIn 0.5s cubic-bezier(0.2,0.8,0.2,1) 1s both;
        }
        @media (max-width: 600px) {
          .wm-scene { right: 2vw; bottom: 20px; }
          .wm-svg { width: 90px; height: 135px; }
          .wm-bubble { font-size: 11px; }
        }
      \`}</style>"""

new = """      <style dangerouslySetInnerHTML={{__html: WM_CSS}} />"""

if old not in c:
    print('ERROR: old block not found')
    # Try to find approximate location
    idx = c.find('<style>{`')
    print('style backtick at:', idx)
    sys.exit(1)

c2 = c.replace(old, new, 1)

# Now insert WM_CSS constant before the function
const_def = '''const WM_CSS = `.wm-scene{position:fixed;bottom:40px;right:5vw;z-index:10;pointer-events:none;display:flex;flex-direction:column;align-items:center;animation:wmIn 0.8s cubic-bezier(0.2,0.8,0.2,1) 0.3s both}@keyframes wmIn{from{opacity:0;transform:translateY(40px) scale(0.8)}to{opacity:1;transform:translateY(0) scale(1)}}.wm-svg{width:120px;height:180px;filter:drop-shadow(0 4px 16px rgba(200,134,26,0.5)) drop-shadow(0 0 8px rgba(0,0,0,0.8));animation:wmBob 4s ease-in-out infinite;will-change:transform}@keyframes wmBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}.wm-bubble{margin-top:8px;background:rgba(10,14,26,0.95);border:1px solid rgba(255,215,0,0.5);border-radius:12px;padding:8px 14px;font-size:12px;font-weight:500;color:#FFD700;white-space:nowrap;letter-spacing:0.02em;box-shadow:0 2px 16px rgba(0,0,0,0.6);animation:wmIn 0.5s cubic-bezier(0.2,0.8,0.2,1) 1s both}@media(max-width:600px){.wm-scene{right:2vw;bottom:20px}.wm-svg{width:90px;height:135px}.wm-bubble{font-size:11px}}`

'''

marker = '// \u2500\u2500\u2500 \u0412\u0410\u041b\u041b\u0418 \u043c\u0438\u043d\u0438\u043c\u0430\u043b\u0438\u0441\u0442\u0438\u0447\u043d\u044b\u0439'
idx = c2.find(marker)
if idx == -1:
    print('ERROR: function marker not found')
    sys.exit(1)

c3 = c2[:idx] + const_def + c2[idx:]

with open(p, 'w', encoding='utf-8') as f:
    f.write(c3)
print('Done. Length:', len(c3))
