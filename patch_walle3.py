import sys
p = 'a:/HADJAL/Рабочий стол/asgard-redesign/components/eternity-landing.tsx'
with open(p, 'r', encoding='utf-8') as f:
    c = f.read()

# Replace WM_CSS constant (remove all animations)
old_css_start = 'const WM_CSS = `'
old_css_end = '`\n\n'
idx_start = c.find(old_css_start)
idx_end = c.find(old_css_end, idx_start) + len(old_css_end)
if idx_start == -1:
    print('WM_CSS not found')
    sys.exit(1)

new_css = '''const WM_CSS = `.wm-scene{position:fixed;bottom:40px;right:5vw;z-index:10;pointer-events:none;display:flex;flex-direction:column;align-items:center}.wm-svg{width:140px;height:195px;filter:drop-shadow(0 6px 20px rgba(212,160,23,0.6)) drop-shadow(0 2px 8px rgba(0,0,0,0.9))}.wm-bubble{margin-top:10px;background:rgba(8,12,22,0.97);border:1.5px solid #F5C842;border-radius:12px;padding:9px 16px;font-size:12px;font-weight:600;color:#F5C842;white-space:nowrap;letter-spacing:0.03em;box-shadow:0 2px 20px rgba(245,200,66,0.15)}@media(max-width:600px){.wm-scene{right:2vw;bottom:20px}.wm-svg{width:110px;height:154px}.wm-bubble{font-size:11px;padding:7px 12px}}`

'''

c2 = c[:idx_start] + new_css + c[idx_end:]

# Now replace the SVG block - find WalleOnGlobe function body
fn_start = c2.find('function WalleOnGlobe()')
fn_end = c2.find('\nconst CSS = `', fn_start)
if fn_start == -1 or fn_end == -1:
    print('function not found', fn_start, fn_end)
    sys.exit(1)

# New function: static, no animations, wider viewBox, both arms visible, bright Pixar colors
new_fn = '''function WalleOnGlobe() {
  return (
    <div className="wm-scene" aria-label="\u0412\u0410\u041b\u041b\u0418 \u043d\u0430 \u0433\u043b\u043e\u0431\u0443\u0441\u0435">
      <svg className="wm-svg" viewBox="-10 0 120 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {/* \u0410\u043d\u0442\u0435\u043d\u043d\u0430 */}
        <line x1="50" y1="10" x2="50" y2="2" stroke="#F5C842" strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx="50" cy="1" r="3.5" fill="#F5C842"/>
        <circle cx="50" cy="1" r="1.5" fill="#fff"/>

        {/* \u0413\u043e\u043b\u043e\u0432\u0430 — \u0431\u0438\u043d\u043e\u043a\u043b\u044c */}
        <rect x="20" y="10" width="60" height="30" rx="5" fill="#D4A017" stroke="#5C3A21" strokeWidth="1.5"/>
        {/* \u041f\u043e\u0434\u0441\u0432\u0435\u0442\u043a\u0430 \u0433\u043e\u043b\u043e\u0432\u044b */}
        <rect x="22" y="12" width="56" height="8" rx="3" fill="#F5C842" opacity="0.25"/>

        {/* \u0413\u043b\u0430\u0437 \u043b\u0435\u0432\u044b\u0439 */}
        <circle cx="34" cy="25" r="10" fill="#1A1A2E" stroke="#F5C842" strokeWidth="2"/>
        <circle cx="34" cy="25" r="6" fill="#1A4A8A"/>
        <circle cx="34" cy="25" r="3" fill="#0A2A5A"/>
        <circle cx="36" cy="22" r="2" fill="#4A9AFF" opacity="0.8"/>
        <circle cx="37" cy="21" r="1" fill="#fff" opacity="0.9"/>

        {/* \u0413\u043b\u0430\u0437 \u043f\u0440\u0430\u0432\u044b\u0439 */}
        <circle cx="66" cy="25" r="10" fill="#1A1A2E" stroke="#F5C842" strokeWidth="2"/>
        <circle cx="66" cy="25" r="6" fill="#1A4A8A"/>
        <circle cx="66" cy="25" r="3" fill="#0A2A5A"/>
        <circle cx="68" cy="22" r="2" fill="#4A9AFF" opacity="0.8"/>
        <circle cx="69" cy="21" r="1" fill="#fff" opacity="0.9"/>

        {/* \u0428\u0435\u044f */}
        <rect x="43" y="40" width="14" height="12" rx="3" fill="#B8860B" stroke="#5C3A21" strokeWidth="1"/>
        <rect x="44" y="42" width="12" height="4" rx="1" fill="#F5C842" opacity="0.3"/>

        {/* \u0422\u0435\u043b\u043e */}
        <rect x="18" y="52" width="64" height="42" rx="5" fill="#D4A017" stroke="#5C3A21" strokeWidth="2"/>
        {/* \u0411\u043e\u043a\u043e\u0432\u044b\u0435 \u0442\u0435\u043d\u0438 */}
        <rect x="18" y="52" width="8" height="42" rx="0" fill="#5C3A21" opacity="0.4"/>
        <rect x="74" y="52" width="8" height="42" rx="0" fill="#5C3A21" opacity="0.4"/>
        {/* \u0412\u0435\u0440\u0445\u043d\u044f\u044f \u043f\u043e\u043b\u043e\u0441\u0430 (светлая) */}
        <rect x="20" y="54" width="60" height="6" rx="2" fill="#F5C842" opacity="0.2"/>

        {/* WALL\u00b7E \u043d\u0430\u0434\u043f\u0438\u0441\u044c */}
        <text x="50" y="72" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="7" fill="#F5C842" letterSpacing="1">WALL\u00b7E</text>
        <text x="50" y="71.5" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="7" fill="#5C3A21" opacity="0.5" letterSpacing="1">WALL\u00b7E</text>

        {/* LED \u043f\u043e\u043b\u043e\u0441\u0430 (\u0437\u0435\u043b\u0451\u043d\u0430\u044f) */}
        <rect x="68" y="76" width="8" height="14" rx="2" fill="#0A0F0A" stroke="#1A2A1A" strokeWidth="0.5"/>
        <rect x="69.5" y="77.5" width="5" height="2" rx="0.5" fill="#00FF44"/>
        <rect x="69.5" y="81" width="5" height="2" rx="0.5" fill="#00FF44"/>
        <rect x="69.5" y="84.5" width="5" height="2" rx="0.5" fill="#00CC33"/>
        <rect x="69.5" y="88" width="5" height="2" rx="0.5" fill="#005A15" opacity="0.6"/>

        {/* \u0414\u0432\u0435\u0440\u0446\u0430 \u043a\u043e\u043c\u043f\u0440\u0435\u0441\u0441\u043e\u0440\u0430 */}
        <rect x="24" y="76" width="40" height="16" rx="2" fill="#5C3A21" stroke="#3A2010" strokeWidth="1"/>
        <rect x="26" y="78" width="36" height="8" rx="1" fill="#3A2010"/>
        <rect x="28" y="80" width="32" height="3" rx="1" fill="#B8860B" opacity="0.5"/>

        {/* \u0420\u0443\u043a\u0430 \u041b\u0415\u0412\u0410\u042f — \u0448\u0438\u0440\u043e\u043a\u0438\u0439 \u043e\u0442\u0441\u0442\u0443\u043f */}
        <rect x="-2" y="56" width="22" height="8" rx="4" fill="#D4A017" stroke="#5C3A21" strokeWidth="1.5"/>
        {/* \u041a\u0443\u0431\u0438\u043a */}
        <rect x="-8" y="60" width="14" height="14" rx="2" fill="#8A7050" stroke="#F5C842" strokeWidth="1.5"/>
        <rect x="-7" y="61" width="12" height="4" rx="1" fill="#F5C842" opacity="0.25"/>
        <rect x="-6" y="66" width="4" height="4" rx="1" fill="#5C3A21" opacity="0.6"/>
        <rect x="0" y="65" width="3" height="5" rx="1" fill="#7A6040" opacity="0.7"/>

        {/* \u0420\u0443\u043a\u0430 \u041f\u0420\u0410\u0412\u0410\u042f — \u0448\u0438\u0440\u043e\u043a\u0438\u0439 \u043e\u0442\u0441\u0442\u0443\u043f, \u044f\u0440\u043a\u0438\u0439 \u0446\u0432\u0435\u0442 */}
        <rect x="80" y="56" width="22" height="8" rx="4" fill="#D4A017" stroke="#F5C842" strokeWidth="2"/>
        {/* \u041a\u043b\u0435\u0448\u043d\u044f — \u0432\u0438\u0434\u043d\u0430\u044f */}
        <line x1="102" y1="58" x2="108" y2="52" stroke="#F5C842" strokeWidth="3" strokeLinecap="round"/>
        <line x1="102" y1="62" x2="108" y2="68" stroke="#F5C842" strokeWidth="3" strokeLinecap="round"/>
        <circle cx="109" cy="51" r="2.5" fill="#F5C842"/>
        <circle cx="109" cy="69" r="2.5" fill="#F5C842"/>

        {/* \u0413\u0443\u0441\u0435\u043d\u0438\u0446\u0430 \u043b\u0435\u0432\u0430\u044f */}
        <rect x="12" y="94" width="28" height="14" rx="7" fill="#2A2A2A" stroke="#444" strokeWidth="1.5"/>
        <rect x="14" y="101" width="5" height="5" rx="1" fill="#555"/>
        <rect x="21" y="101" width="5" height="5" rx="1" fill="#555"/>
        <rect x="28" y="101" width="5" height="5" rx="1" fill="#555"/>
        <ellipse cx="14" cy="101" rx="5" ry="6" fill="#383838"/>
        <ellipse cx="38" cy="101" rx="5" ry="6" fill="#383838"/>

        {/* \u0413\u0443\u0441\u0435\u043d\u0438\u0446\u0430 \u043f\u0440\u0430\u0432\u0430\u044f */}
        <rect x="60" y="94" width="28" height="14" rx="7" fill="#2A2A2A" stroke="#444" strokeWidth="1.5"/>
        <rect x="62" y="101" width="5" height="5" rx="1" fill="#555"/>
        <rect x="69" y="101" width="5" height="5" rx="1" fill="#555"/>
        <rect x="76" y="101" width="5" height="5" rx="1" fill="#555"/>
        <ellipse cx="62" cy="101" rx="5" ry="6" fill="#383838"/>
        <ellipse cx="86" cy="101" rx="5" ry="6" fill="#383838"/>

        {/* \u0422\u0435\u043d\u044c */}
        <ellipse cx="50" cy="118" rx="40" ry="4" fill="rgba(0,0,0,0.35)"/>
      </svg>
      <div className="wm-bubble" role="status">
        \u041f\u0440\u0438\u0432\u0435\u0442, \u0430\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u043e\u0440! \u042f \u2014 \u0412\u0410\u041b\u041b\u0418.
      </div>
      <style dangerouslySetInnerHTML={{__html: WM_CSS}} />
    </div>
  )
}

'''

c3 = c2[:fn_start] + new_fn + c2[fn_end:]

with open(p, 'w', encoding='utf-8') as f:
    f.write(c3)
print('Done. Length:', len(c3))
