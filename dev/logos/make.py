import json, os
OUT = os.path.dirname(os.path.abspath(__file__))
INK = '#16202e'

def badge(bg, inner, ring='#ffffff'):
    return (f'<circle cx="100" cy="100" r="97" fill="{INK}"/>'
            f'<circle cx="100" cy="100" r="90" fill="{ring}"/>'
            f'<circle cx="100" cy="100" r="84" fill="{bg}"/>'
            f'<g clip-path="url(#c)">{inner}</g>')

def svg(body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">'
            '<defs><clipPath id="c"><circle cx="100" cy="100" r="84"/></clipPath></defs>'
            f'{body}</svg>')

def stone(x, y, s=1.0, handle='#d6262b', body='#9aa1ad', top='#c3c8d0'):
    return (f'<g transform="translate({x},{y}) scale({s})" stroke="{INK}" stroke-width="4" stroke-linejoin="round">'
            f'<path d="M-44,-8 L-44,10 Q-44,30 0,30 Q44,30 44,10 L44,-8 Z" fill="{body}"/>'
            f'<path d="M-44,4 Q-44,16 0,16 Q44,16 44,4" fill="none" stroke-width="3"/>'
            f'<ellipse cx="0" cy="-8" rx="44" ry="15" fill="{top}"/>'
            + (f'<path d="M-8,-12 L-8,-30 Q-8,-36 -2,-36 L30,-36" fill="none" stroke="{INK}" stroke-width="13" stroke-linecap="round"/>'
            f'<path d="M-8,-12 L-8,-30 Q-8,-36 -2,-36 L30,-36" fill="none" stroke="{handle}" stroke-width="7" stroke-linecap="round"/>' if handle else '')
            + '</g>')

def broom(x, y, ang, length=110, head='#1f6fd1', stick='#7a4a22'):
    return (f'<g transform="translate({x},{y}) rotate({ang})">'
            f'<line x1="0" y1="0" x2="0" y2="{-length}" stroke="{INK}" stroke-width="10" stroke-linecap="round"/>'
            f'<line x1="0" y1="0" x2="0" y2="{-length}" stroke="{stick}" stroke-width="5" stroke-linecap="round"/>'
            f'<rect x="-20" y="-4" width="40" height="16" rx="5" fill="{head}" stroke="{INK}" stroke-width="4"/>'
            '</g>')

def eyes(x1, x2, y, r=7, look=0):
    return ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" stroke="{INK}" stroke-width="3"/>'
                   f'<circle cx="{x+look}" cy="{y}" r="{r*0.45}" fill="{INK}"/>' for x in (x1, x2))

def house(x, y, r):
    return (f'<circle cx="{x}" cy="{y}" r="{r}" fill="#1f6fd1" stroke="{INK}" stroke-width="4"/>'
            f'<circle cx="{x}" cy="{y}" r="{r*0.74}" fill="#fff"/>'
            f'<circle cx="{x}" cy="{y}" r="{r*0.5}" fill="#d6262b"/>'
            f'<circle cx="{x}" cy="{y}" r="{r*0.22}" fill="#fff"/>')

def stars(pts, c='#ffe27a'):
    return ''.join(f'<path transform="translate({x},{y}) scale({s})" d="M0,-10 L3,-3 L10,0 L3,3 L0,10 L-3,3 L-10,0 L-3,-3 Z" fill="{c}"/>' for x, y, s in pts)

L = {}

# 1 Turkey Dinner
L['Turkey Dinner'] = badge('#e8862a',
    broom(100, 150, -38, 120, '#1f6fd1') +
    f'<g transform="translate(100,150) rotate(38)"><line x1="0" y1="0" x2="0" y2="-120" stroke="{INK}" stroke-width="10" stroke-linecap="round"/><line x1="0" y1="0" x2="0" y2="-120" stroke="#dfe3e8" stroke-width="5" stroke-linecap="round"/>'
    f'<path d="M-12,-118 L-12,-98 Q0,-88 12,-98 L12,-118 M0,-118 L0,-96" fill="none" stroke="{INK}" stroke-width="8" stroke-linecap="round"/><path d="M-12,-118 L-12,-98 Q0,-88 12,-98 L12,-118 M0,-118 L0,-96" fill="none" stroke="#dfe3e8" stroke-width="4" stroke-linecap="round"/></g>' +
    f'<ellipse cx="100" cy="132" rx="66" ry="22" fill="#fff" stroke="{INK}" stroke-width="4"/>'
    f'<ellipse cx="100" cy="132" rx="54" ry="16" fill="#1f6fd1"/><ellipse cx="100" cy="132" rx="38" ry="11" fill="#fff"/><ellipse cx="100" cy="132" rx="24" ry="7" fill="#d6262b"/>'
    f'<path d="M52,120 Q50,78 100,74 Q150,78 148,120 Q100,138 52,120 Z" fill="#b8642a" stroke="{INK}" stroke-width="4"/>'
    f'<path d="M70,90 Q90,80 112,86" fill="none" stroke="#e9a35c" stroke-width="6" stroke-linecap="round"/>'
    f'<path d="M58,104 Q36,96 32,80" stroke="{INK}" stroke-width="16" stroke-linecap="round" fill="none"/><path d="M58,104 Q36,96 32,80" stroke="#c97535" stroke-width="9" stroke-linecap="round" fill="none"/>'
    f'<circle cx="31" cy="76" r="7" fill="#fff" stroke="{INK}" stroke-width="3"/>'
    f'<path d="M142,104 Q164,96 168,80" stroke="{INK}" stroke-width="16" stroke-linecap="round" fill="none"/><path d="M142,104 Q164,96 168,80" stroke="#c97535" stroke-width="9" stroke-linecap="round" fill="none"/>'
    f'<circle cx="169" cy="76" r="7" fill="#fff" stroke="{INK}" stroke-width="3"/>')

# 2 Broom Raiders
L['Broom Raiders'] = badge('#232a36',
    broom(52, 162, 40, 140, '#d6262b') + broom(148, 162, -40, 140, '#d6262b') +
    f'<path d="M62,98 Q62,56 100,56 Q138,56 138,98 Q138,118 126,124 L126,140 L74,140 L74,124 Q62,118 62,98 Z" fill="#f1ede2" stroke="{INK}" stroke-width="4"/>'
    f'<ellipse cx="84" cy="102" rx="11" ry="12" fill="{INK}"/><ellipse cx="116" cy="102" rx="11" ry="12" fill="{INK}"/>'
    f'<path d="M100,112 L94,124 L106,124 Z" fill="{INK}"/>'
    f'<path d="M84,132 L84,140 M94,132 L94,140 M106,132 L106,140 M116,132 L116,140" stroke="{INK}" stroke-width="3"/>'
    f'<path d="M58,82 Q60,36 100,34 Q140,36 142,82 Z" fill="#d6262b" stroke="{INK}" stroke-width="4"/>'
    f'<rect x="54" y="74" width="92" height="16" rx="6" fill="#fff" stroke="{INK}" stroke-width="4"/>'
    f'<circle cx="100" cy="30" r="11" fill="#fff" stroke="{INK}" stroke-width="4"/>')

# 3 Tinsel Takeout
L['Tinsel Takeout'] = badge('#1e7a46',
    '<g stroke="#ffe27a" stroke-width="5" stroke-linecap="round"><line x1="128" y1="70" x2="146" y2="52"/><line x1="140" y1="88" x2="166" y2="84"/><line x1="122" y1="60" x2="122" y2="38"/></g>' +
    stone(150, 76, 0.55, '#f2c230') +
    stone(84, 122, 0.95, '#d6262b') +
    '<path d="M42,116 L54,106 L64,116 L76,104 L88,116 L100,104 L112,116 L124,104" fill="none" stroke="#16202e" stroke-width="10" stroke-linejoin="round" stroke-linecap="round" transform="translate(0,4)"/>'
    '<path d="M42,116 L54,106 L64,116 L76,104 L88,116 L100,104 L112,116 L124,104" fill="none" stroke="#ffd23f" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" transform="translate(0,4)"/>' +
    stars([(56, 60, 1.1), (40, 92, 0.7), (168, 120, 0.8)], '#fff'))

# 4 Sheet Happens
L['Sheet Happens'] = badge('#8fd0f0',
    '<path d="M16,150 L184,150" stroke="#fff" stroke-width="22"/>'
    '<g stroke="#5aa6cf" stroke-width="5" stroke-linecap="round"><line x1="22" y1="128" x2="56" y2="128"/><line x1="30" y1="142" x2="58" y2="142"/><line x1="26" y1="114" x2="50" y2="114"/></g>' +
    stone(112, 118, 1.15, '#d6262b') +
    eyes(96, 128, 108, 9, 3) +
    f'<ellipse cx="112" cy="132" rx="7" ry="9" fill="{INK}"/>'
    f'<path d="M150,62 Q160,78 150,84 Q140,78 150,62 Z" fill="#fff" stroke="{INK}" stroke-width="3"/>'
    f'<path d="M158,92 Q170,100 174,90" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>')

# 5 Button Bandits
L['Button Bandits'] = badge('#6b3fa0',
    f'<path d="M56,74 L62,40 L84,62 Z M144,74 L138,40 L116,62 Z" fill="#7d838d" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>'
    f'<path d="M50,96 Q50,54 100,54 Q150,54 150,96 Q150,120 100,136 Q50,120 50,96 Z" fill="#9aa1ad" stroke="{INK}" stroke-width="4"/>'
    f'<path d="M70,128 Q100,148 130,128 Q120,112 100,112 Q80,112 70,128 Z" fill="#eef0f2" stroke="{INK}" stroke-width="3"/>'
    f'<path d="M46,84 Q100,70 154,84 L150,104 Q100,94 50,104 Z" fill="{INK}"/>' +
    eyes(80, 120, 90, 8, 2) +
    f'<ellipse cx="100" cy="116" rx="8" ry="6" fill="{INK}"/>' +
    house(100, 160, 30) +
    f'<path d="M66,148 Q74,136 84,146 M134,148 Q126,136 116,146" fill="#9aa1ad" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>')

# 6 Miss Your Toe (mistletoe over a curling shoe, with a stone just missing the toe)
def leaf(x, y, ang):
    return (f'<g transform="translate({x},{y}) rotate({ang})">'
            f'<path d="M0,0 Q10,-10 0,-34 Q-10,-10 0,0 Z" fill="#3f9b4a" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>'
            '<path d="M0,-4 L0,-28" stroke="#2c7436" stroke-width="2"/></g>')
L['Miss Your Toe'] = badge('#7a1f5c',
    f'<line x1="100" y1="14" x2="100" y2="44" stroke="{INK}" stroke-width="3"/>' +
    leaf(96, 50, -125) + leaf(97, 52, -160) + leaf(103, 52, 160) + leaf(104, 50, 125) +
    ''.join(f'<circle cx="{x}" cy="{y}" r="5.5" fill="#fff" stroke="{INK}" stroke-width="2.5"/>' for x, y in ((91, 62), (100, 67), (109, 62))) +
    f'<path d="M100,48 L82,38 L82,58 Z M100,48 L118,38 L118,58 Z" fill="#d6262b" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>'
    f'<circle cx="100" cy="48" r="6" fill="#d6262b" stroke="{INK}" stroke-width="3"/>'
    '<ellipse cx="100" cy="162" rx="76" ry="12" fill="#ffe9a8" opacity="0.35"/>'
    f'<path d="M34,154 L34,124 Q34,112 46,112 L62,112 Q68,128 92,134 Q108,138 108,154 Z" fill="#f4f4f4" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>'
    '<path d="M48,124 L64,124" stroke="#d6262b" stroke-width="5" stroke-linecap="round"/>'
    f'<rect x="30" y="152" width="82" height="10" rx="5" fill="{INK}"/>' +
    stone(140, 140, 0.6, '#f2c230') +
    '<g stroke="#ffe9a8" stroke-width="4" stroke-linecap="round"><line x1="170" y1="128" x2="182" y2="128"/><line x1="172" y1="142" x2="184" y2="142"/></g>' +
    stars([(112, 118, 0.9), (118, 102, 0.55)], '#ffe27a'))

# 7 Naughty Sweepers
def horns(x, y, ang):
    return (f'<g transform="translate({x},{y}) rotate({ang})">'
            f'<path d="M-16,0 Q-26,-14 -20,-28 Q-12,-14 -6,-4 Z M16,0 Q26,-14 20,-28 Q12,-14 6,-4 Z" fill="#ffd23f" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/></g>')
L['Naughty Sweepers'] = badge('#c8202a',
    broom(64, 74, 150, 120, '#16202e') + broom(136, 74, -150, 120, '#16202e') +
    horns(60, 66, -30) + horns(140, 66, 30) +
    f'<path d="M72,134 L128,134 L128,170 L100,160 L72,170 Z" fill="#fff" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>'
    f'<path d="M80,144 L120,144 M80,152 L110,152" stroke="{INK}" stroke-width="3"/>'
    + stars([(100, 40, 1.0)], '#ffd23f'))

# 8 Game of Stones
L['Game of Stones'] = badge('#2b3445',
    broom(46, 168, 38, 150, '#c9a227', '#c9cdd4') + broom(154, 168, -38, 150, '#c9a227', '#c9cdd4') +
    stone(100, 130, 1.15, '#c9a227', '#7d8592', '#a9b0bb') +
    f'<path d="M66,92 L60,48 L80,66 L100,40 L120,66 L140,48 L134,92 Z" fill="#f2c230" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>'
    '<circle cx="100" cy="76" r="7" fill="#d6262b"/><circle cx="78" cy="80" r="5" fill="#1f6fd1"/><circle cx="122" cy="80" r="5" fill="#1f6fd1"/>')

# 9 Hogline Heroes
L['Hogline Heroes'] = badge('#1f6fd1',
    f'<path d="M58,90 L30,176 L170,176 L142,90 Z" fill="#d6262b" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>'
    '<rect x="16" y="150" width="168" height="10" fill="#d6262b" stroke="#fff" stroke-width="3"/>'
    f'<path d="M62,64 L58,36 L84,54 Z M138,64 L142,36 L116,54 Z" fill="#f4a3b8" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>'
    f'<circle cx="100" cy="94" r="46" fill="#f7b6c6" stroke="{INK}" stroke-width="4"/>'
    f'<path d="M56,82 Q100,66 144,82 L140,100 Q120,92 100,100 Q80,92 60,100 Z" fill="#f2c230" stroke="{INK}" stroke-width="3"/>' +
    eyes(82, 118, 88, 6, 0) +
    f'<ellipse cx="100" cy="116" rx="18" ry="13" fill="#f48aa6" stroke="{INK}" stroke-width="3"/>'
    f'<ellipse cx="94" cy="116" rx="3" ry="5" fill="{INK}"/><ellipse cx="106" cy="116" rx="3" ry="5" fill="{INK}"/>'
    f'<path d="M90,134 Q100,140 110,134" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>')

# 10 Sweep Dreams
L['Sweep Dreams'] = badge('#1b2a55',
    '<circle cx="150" cy="56" r="20" fill="#ffe27a"/><circle cx="160" cy="50" r="18" fill="#1b2a55"/>' +
    stars([(40, 70, 0.8), (64, 40, 0.6), (124, 34, 0.5), (170, 100, 0.6)]) +
    f'<path d="M30,160 Q30,138 52,140 Q58,124 78,130 Q92,116 112,128 Q132,120 142,136 Q170,134 170,156 Q170,172 150,172 L48,172 Q30,172 30,160 Z" fill="#e6ecf7" stroke="{INK}" stroke-width="4"/>' +
    stone(98, 132, 0.95, None) +
    f'<path d="M80,124 Q86,130 92,124 M104,124 Q110,130 116,124" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
    f'<path d="M58,104 Q70,64 122,90 Q100,96 58,104 Z" fill="#4c7be0" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>'
    f'<path d="M64,104 Q52,108 42,96" fill="none" stroke="{INK}" stroke-width="4"/><circle cx="40" cy="94" r="7" fill="#fff" stroke="{INK}" stroke-width="3"/>'
    '<text x="128" y="96" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="18" fill="#fff">z</text>'
    '<text x="140" y="80" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="24" fill="#fff">Z</text>')

# 11 Runny Rudolph (a stone with antlers, a glowing red nose and a drip)
L['Runny Rudolph'] = badge('#9fdcf2',
    '<path d="M16,156 L184,156" stroke="#fff" stroke-width="26"/>'
    f'<g fill="none" stroke="{INK}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"><path d="M76,104 Q64,72 54,52 M66,82 L44,78 M60,66 L68,46"/><path d="M124,104 Q136,72 146,52 M134,82 L156,78 M140,66 L132,46"/></g>'
    '<g fill="none" stroke="#a8763e" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M76,104 Q64,72 54,52 M66,82 L44,78 M60,66 L68,46"/><path d="M124,104 Q136,72 146,52 M134,82 L156,78 M140,66 L132,46"/></g>' +
    stone(100, 132, 1.2, None) +
    eyes(84, 116, 116, 8, 0) +
    f'<path d="M74,104 Q84,98 94,104 M106,104 Q116,98 126,104" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
    '<circle cx="100" cy="134" r="22" fill="#ff5a5f" opacity="0.35"/>'
    f'<circle cx="100" cy="134" r="13" fill="#e0242b" stroke="{INK}" stroke-width="3"/>'
    '<circle cx="95" cy="129" r="4" fill="#ffb3b5"/>'
    f'<path d="M110,144 Q118,158 112,166 Q104,170 102,162 Q102,154 110,144 Z" fill="#7fd3ff" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>'
    '<circle cx="107" cy="160" r="2.5" fill="#fff"/>')

# 12 Reindeer Rebels
L['Reindeer Rebels'] = badge('#17565a',
    f'<g fill="none" stroke="{INK}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"><path d="M80,66 Q66,40 56,24 M68,46 L46,44 M62,34 L70,18"/><path d="M120,66 Q134,40 144,24 M132,46 L154,44 M138,34 L130,18"/></g>'
    f'<g fill="none" stroke="#c99a5b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M80,66 Q66,40 56,24 M68,46 L46,44 M62,34 L70,18"/><path d="M120,66 Q134,40 144,24 M132,46 L154,44 M138,34 L130,18"/></g>'
    f'<path d="M30,180 Q40,150 100,148 Q160,150 170,180 Z" fill="{INK}"/>'
    '<path d="M86,150 L100,172 L114,150" fill="none" stroke="#3a4558" stroke-width="5"/>'
    f'<path d="M56,80 L40,68 L50,92 Z M144,80 L160,68 L150,92 Z" fill="#8b5a2b" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>'
    f'<path d="M64,92 Q64,62 100,62 Q136,62 136,92 L126,140 Q100,156 74,140 Z" fill="#8b5a2b" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>'
    f'<ellipse cx="100" cy="130" rx="22" ry="16" fill="#c99a5b" stroke="{INK}" stroke-width="3"/>'
    f'<circle cx="100" cy="122" r="9" fill="#d6262b" stroke="{INK}" stroke-width="3"/>'
    f'<path d="M62,88 L138,88 L136,96 Q132,110 116,108 Q104,106 102,96 L98,96 Q96,106 84,108 Q68,110 64,96 Z" fill="{INK}"/>'
    '<path d="M70,92 L82,92" stroke="#7fd3ff" stroke-width="3" stroke-linecap="round"/><path d="M108,92 L120,92" stroke="#7fd3ff" stroke-width="3" stroke-linecap="round"/>')

# 13 Sleezy Sliders
L['Sleezy Sliders'] = badge('#4a2a7a',
    '<rect x="16" y="150" width="168" height="8" fill="#d6262b"/>' +
    stone(100, 120, 1.25, None) +
    f'<path d="M62,104 L138,104 L136,112 Q132,124 116,122 Q104,120 102,112 L98,112 Q96,120 84,122 Q68,124 64,112 Z" fill="{INK}"/>'
    '<path d="M70,108 L82,108" stroke="#c9a7ff" stroke-width="3" stroke-linecap="round"/>'
    f'<path d="M90,134 Q108,140 118,128" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>'
    '<path d="M58,140 Q100,176 142,140" fill="none" stroke="#16202e" stroke-width="10" stroke-dasharray="7 4"/>'
    '<path d="M58,140 Q100,176 142,140" fill="none" stroke="#f2c230" stroke-width="6" stroke-dasharray="7 4"/>'
    f'<circle cx="100" cy="164" r="10" fill="#f2c230" stroke="{INK}" stroke-width="3"/>'
    + stars([(156, 60, 0.9), (44, 70, 0.6)], '#fff'))

# 14 Grinch Squad (original grumpy stone)
L['Grinch Squad'] = badge('#c8202a',
    stone(124, 86, 0.5, '#f2c230') + stone(160, 88, 0.5, '#1f6fd1') + stone(142, 70, 0.5, '#d6262b') +
    f'<path d="M108,92 Q100,148 116,166 Q146,180 174,164 Q188,136 176,92 Q142,102 108,92 Z" fill="#a8763e" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>'
    f'<path d="M110,100 Q142,110 174,100" fill="none" stroke="#f2e2b6" stroke-width="6" stroke-linecap="round"/>'
    f'<path d="M128,130 Q140,124 154,132 M134,146 Q146,140 160,148" fill="none" stroke="#7a5428" stroke-width="3" stroke-linecap="round"/>' +
    stone(76, 136, 1.0, None, '#4f9a3c', '#7cc35a') +
    f'<path d="M52,112 Q60,106 70,114 M84,114 Q94,106 102,110" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>'
    f'<ellipse cx="62" cy="121" rx="7" ry="5" fill="#fff" stroke="{INK}" stroke-width="2.5"/><ellipse cx="92" cy="121" rx="7" ry="5" fill="#fff" stroke="{INK}" stroke-width="2.5"/>'
    f'<circle cx="66" cy="122" r="3" fill="{INK}"/><circle cx="96" cy="122" r="3" fill="{INK}"/>'
    f'<path d="M58,132 Q78,142 102,130" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>'
    f'<path d="M98,128 L105,134" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
    f'<path d="M44,96 Q52,50 102,44 Q96,66 110,96 Z" fill="#d6262b" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>'
    f'<rect x="36" y="92" width="80" height="14" rx="7" fill="#fff" stroke="{INK}" stroke-width="4"/>'
    f'<circle cx="104" cy="44" r="9" fill="#fff" stroke="{INK}" stroke-width="4"/>')

# 15 Hack Attack
L['Hack Attack'] = badge('#123a6b',
    '<rect x="16" y="120" width="168" height="80" fill="#cdeaf7"/>'
    f'<rect x="62" y="122" width="76" height="22" rx="6" fill="{INK}"/>'
    f'<path d="M72,124 Q90,40 140,34 Q118,70 132,124 Z" fill="#7d8ea3" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>'
    '<path d="M86,118 Q98,72 126,52" fill="none" stroke="#a8b7c8" stroke-width="5" stroke-linecap="round"/>'
    '<g fill="#fff" stroke="#16202e" stroke-width="3"><path d="M40,124 Q50,100 62,122 Z"/><path d="M138,122 Q152,98 162,124 Z"/></g>'
    '<g stroke="#7fb8d6" stroke-width="4" stroke-linecap="round"><line x1="30" y1="150" x2="70" y2="150"/><line x1="120" y1="162" x2="170" y2="162"/><line x1="50" y1="174" x2="96" y2="174"/></g>')

# 16 The Stoners
L['The Stoners'] = badge('#16202e',
    '<path d="M112,20 L72,104 L98,104 L80,180 L136,84 L108,84 L128,20 Z" fill="#f2c230" opacity="0.9"/>' +
    stone(56, 112, 0.55, '#d6262b') + stone(144, 112, 0.55, '#1f6fd1') +
    stone(76, 154, 0.55, '#f2c230') + stone(124, 154, 0.55, '#1e7a46') +
    stars([(36, 70, 0.8), (168, 64, 0.8)], '#fff'), ring='#f2c230')

os.makedirs(f'{OUT}/svg', exist_ok=True)
data = {}
for name, body in L.items():
    s = svg(body)
    data[name] = s
    open(f'{OUT}/svg/{name.replace(" ", "_")}.svg', 'w').write(s)
json.dump(data, open(f'{OUT}/logos.json', 'w'))
cells = ''.join(f'<div><img src="svg/{n.replace(" ", "_")}.svg" width="160"><img src="svg/{n.replace(" ", "_")}.svg" width="40"><p>{n}</p></div>' for n in L)
open(f'{OUT}/sheet.html', 'w').write(f'<html><body style="background:#0f1726;color:#fff;font:14px sans-serif;display:grid;grid-template-columns:repeat(4,220px);gap:12px;padding:12px">{cells}</body></html>')
print(len(L), sum(len(v) for v in data.values()))
