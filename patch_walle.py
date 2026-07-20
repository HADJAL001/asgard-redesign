import sys
p = 'a:/HADJAL/Рабочий стол/asgard-redesign/components/eternity-landing.tsx'
with open(p, 'r', encoding='utf-8') as f:
    c = f.read()

start = c.find('// \u2500\u2500\u2500 \u0412\u0410\u041b\u041b\u0418 \u043d\u0430 \u0433\u043b\u043e\u0431\u0443\u0441\u0435')
end = c.find('const CSS = `')
if start == -1 or end == -1:
    print('ERROR: markers not found', start, end)
    sys.exit(1)

before = c[:start]
after = c[end:]

new_block = '''// \u2500\u2500\u2500 \u0412\u0410\u041b\u041b\u0418 \u043c\u0438\u043d\u0438\u043c\u0430\u043b\u0438\u0441\u0442\u0438\u0447\u043d\u044b\u0439 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function WalleOnGlobe() {
  return (
    <div className="wm-scene" aria-label="\u0412\u0410\u041b\u041b\u0418 \u043d\u0430 \u0433\u043b\u043e\u0431\u0443\u0441\u0435">
      <svg className="wm-svg" viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <line x1="40" y1="8" x2="40" y2="0" stroke="#FFD700" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="40" cy="0" r="3" fill="#FFD700"/>
        <rect x="20" y="10" width="40" height="28" rx="4" fill="#C8861A" stroke="#FFD700" strokeWidth="1.5"/>
        <circle cx="32" cy="24" r="8" fill="#0A1A2A" stroke="#FFD700" strokeWidth="1.5"/>
        <circle cx="32" cy="24" r="4" fill="#1A5A9A"/>
        <circle cx="34" cy="22" r="1.5" fill="#fff" opacity="0.9"/>
        <circle cx="48" cy="24" r="8" fill="#0A1A2A" stroke="#FFD700" strokeWidth="1.5"/>
        <circle cx="48" cy="24" r="4" fill="#1A5A9A"/>
        <circle cx="50" cy="22" r="1.5" fill="#fff" opacity="0.9"/>
        <rect x="36" y="38" width="8" height="10" rx="2" fill="#A06010"/>
        <rect x="18" y="48" width="44" height="36" rx="4" fill="#C8861A" stroke="#FFD700" strokeWidth="1.5"/>
        <text x="40" y="63" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="6" fill="#FFD700" letterSpacing="0.5">WALL\u00b7E</text>
        <rect x="50" y="68" width="6" height="12" rx="1" fill="#0A1A0A"/>
        <rect x="51" y="69" width="4" height="2" rx="0.5" fill="#00FF44"/>
        <rect x="51" y="72" width="4" height="2" rx="0.5" fill="#00FF44"/>
        <rect x="51" y="75" width="4" height="2" rx="0.5" fill="#00FF44"/>
        <rect x="4" y="52" width="14" height="6" rx="3" fill="#A06010"/>
        <rect x="0" y="54" width="10" height="10" rx="1.5" fill="#8A7050" stroke="#5A4030" strokeWidth="1"/>
        <rect x="62" y="52" width="14" height="6" rx="3" fill="#A06010"/>
        <line x1="76" y1="55" x2="80" y2="50" stroke="#7A5008" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="76" y1="55" x2="80" y2="60" stroke="#7A5008" strokeWidth="2.5" strokeLinecap="round"/>
        <rect x="10" y="84" width="24" height="12" rx="6" fill="#2A1A08"/>
        <rect x="12" y="91" width="4" height="4" rx="1" fill="#1A0A04"/>
        <rect x="18" y="91" width="4" height="4" rx="1" fill="#1A0A04"/>
        <rect x="24" y="91" width="4" height="4" rx="1" fill="#1A0A04"/>
        <rect x="46" y="84" width="24" height="12" rx="6" fill="#2A1A08"/>
        <rect x="48" y="91" width="4" height="4" rx="1" fill="#1A0A04"/>
        <rect x="54" y="91" width="4" height="4" rx="1" fill="#1A0A04"/>
        <rect x="60" y="91" width="4" height="4" rx="1" fill="#1A0A04"/>
      </svg>
      <div className="wm-bubble" role="status">
        \u041f\u0440\u0438\u0432\u0435\u0442, \u0430\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u043e\u0440! \u042f \u2014 \u0412\u0410\u041b\u041b\u0418.
      </div>
      <style>{\`
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
      \`}</style>
    </div>
  )
}

'''

result = before + new_block + after
with open(p, 'w', encoding='utf-8') as f:
    f.write(result)
print('Done. Length:', len(result))
