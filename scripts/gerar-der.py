# Gera docs/DER.svg a partir de base44/entities/*.jsonc.
# Uso: python scripts/gerar-der.py base44/entities docs/DER.svg  (depois abra o .svg no navegador ou converta para PNG)
import json, os, sys, re
ENT = sys.argv[1]; OUT = sys.argv[2]

def load(n):
    return json.load(open(os.path.join(ENT, n + ".jsonc"), encoding="utf-8"))

FK = {
    "UnidadeAreaProcesso": {"UnidadeId": "FK Unidade", "AreaId": "FK Area", "ProcessoId": "FK Processo"},
    "Inspetor": {"AreaId": "FK Area"},
    "Vinculo": {"UnidadeAreaProcessoId": "FK UnidadeAreaProc.", "PessoaId": "FK pessoa (por Papel)"},
    "Agendamento": {"TipoDeInspecaoId": "FK TipoDeInspecao"},
    "ItemGrd": {"PilarId": "FK Pilar"},
    "Inspecao": {"UnidadeAreaProcessoId": "FK UnidadeAreaProc.", "TipoDeInspecaoId": "FK TipoDeInspecao", "Checklist": "json [ ] (embutido)", "Metricas": "json [ ] (embutido)"},
    "PlanoDeAcao": {"InspecaoId": "FK Inspecao", "ItemRef": "ref Checklist[].Id"},
}

def tipo(p):
    if "enum" in p: return "enum"
    t = p.get("type"); f = p.get("format")
    if t == "string" and f == "date": return "date"
    if t == "string" and f == "date-time": return "datetime"
    return {"string": "text", "number": "number", "boolean": "bool", "array": "json [ ]"}.get(t, t)

def campos(n):
    s = load(n)
    rows = [("id", "PK uuid")]
    for k, p in s["properties"].items():
        rows.append((k, FK.get(n, {}).get(k, tipo(p))))
    if n != "User":
        rows.append(("created_date / updated_date", "auto"))
    else:
        rows = [("id", "PK uuid"), ("email", "text"), ("full_name", "text"), ("role", "enum admin|user")]
    return rows

checklist_rows = [("Id", "ref ItemSol/ItemGrd/ItemSgi"), ("indice", "number"), ("Requisito | Questao", "text"),
    ("Categoria, Subcategoria", "text (SOL)"), ("NmrRequisito, NmrSubReq.", "text (GRD)"), ("PilarId, PilarNome, PilarDesc.", "text (GRD)"),
    ("Procedimento, ISO9001..CAPA", "text (SGI)"), ("Resposta", "text"), ("ItemObservacao", "text"),
    ("DescricaoApontamento", "text (SGI)"), ("ReferenciaNormativa", "text (SGI)"), ("EvidenciasObjetivas", "text (SGI)"),
    ("SugestaoDeAdequacao", "text (SGI)"), ("Fotos", "json [ ] url")]
metricas_rows = [("Pilar", "text"), ("Descricao", "text"), ("Conforme", "number"), ("NaoConforme", "number"), ("Atendimento", "number %")]

TW, RH, HH = 400, 25, 32
C1 = 215  # largura da 1ª coluna
LANES = [("SOL", 20, 480, "#fcfcca", "#ffe342"), ("BASE", 500, 1940, "#f4d9ff", "#eec4ff"),
         ("GRD", 1960, 2420, "#cfe4ff", "#b5d6ff"), ("SGI", 2440, 2900, "#d7f5e1", "#9fdcb4")]
COL = {"SOL": 50, "A": 530, "B": 1020, "C": 1510, "GRD": 1990, "SGI": 2470}
LAYOUT = {
    "SOL": ["Inspetor", "Responsavel", "Facilitador", "ItemSol"],
    "A": ["Processo", "Vinculo", "TipoDeInspecao", "Agendamento", "LogAuditoria"],
    "B": ["Area", "UnidadeAreaProcesso", "Inspecao", "PlanoDeAcao"],
    "C": ["Unidade", "Inspecao.Checklist[ ]", "Inspecao.Metricas[ ]", "User"],
    "GRD": ["Lider", "Gestor", "Pilar", "ItemGrd"],
    "SGI": ["Auditor", "ResponsavelSgi", "ItemSgi"],
}
GAP = {"A": 70, "B": 70, "C": 70}
START = {"C": 150, "A": 150}
tabs = {}
for col, names in LAYOUT.items():
    y = START.get(col, 150)
    for n in names:
        rows = checklist_rows if n.startswith("Inspecao.Checklist") else metricas_rows if n.startswith("Inspecao.Metricas") else campos(n)
        if n == "Inspecao.Checklist[ ]": y = max(y, 0)
        h = HH + RH * len(rows)
        tabs[n] = {"x": COL[col], "y": y, "w": TW, "h": h, "rows": rows}
        y += h + GAP.get(col, 60)
# alinhar tabelas embutidas ao lado da Inspecao
ins = tabs["Inspecao"]
tabs["Inspecao.Checklist[ ]"]["y"] = ins["y"] + 40
tabs["Inspecao.Metricas[ ]"]["y"] = tabs["Inspecao.Checklist[ ]"]["y"] + tabs["Inspecao.Checklist[ ]"]["h"] + 70
u = tabs["User"]; u["y"] = tabs["Inspecao.Metricas[ ]"]["y"] + tabs["Inspecao.Metricas[ ]"]["h"] + 90

H = max(t["y"] + t["h"] for t in tabs.values()) + 230
W = 2920

def rowy(n, field):
    t = tabs[n]
    for i, (k, _) in enumerate(t["rows"]):
        if k == field: return t["y"] + HH + RH * i + RH / 2
    return t["y"] + HH + RH / 2

esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
out = []
A = out.append
A(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Liberation Sans, Arial, Helvetica, sans-serif">')
A(f'<rect width="{W}" height="{H}" fill="#fff"/>')
for name, x1, x2, fill, stroke in LANES:
    A(f'<rect x="{x1}" y="20" width="{x2-x1}" height="{H-40}" rx="6" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
    A(f'<text x="{x1+30}" y="70" font-size="22" fill="#222">{name}</text>')

LINE = 'stroke="#5e5e5e" stroke-width="1.8" fill="none"'
def poly(pts, dash=False):
    d = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    A(f'<polyline points="{d}" {LINE}{" stroke-dasharray=\"8 6\"" if dash else ""}/>')

def end_marker(p, q, kind):
    # p = ponta na tabela, q = ponto anterior (direção)
    (x, y), (qx, qy) = p, q
    dx, dy = x - qx, y - qy
    L = (dx * dx + dy * dy) ** 0.5 or 1
    ux, uy = dx / L, dy / L; nx, ny = -uy, ux
    if kind == "many":
        bx, by = x - ux * 16, y - uy * 16
        for s in (-1, 0, 1):
            A(f'<line x1="{bx:.1f}" y1="{by:.1f}" x2="{x + nx*9*s:.1f}" y2="{y + ny*9*s:.1f}" {LINE}/>')
        cx, cy = x - ux * 22, y - uy * 22
        A(f'<line x1="{cx+nx*9:.1f}" y1="{cy+ny*9:.1f}" x2="{cx-nx*9:.1f}" y2="{cy-ny*9:.1f}" {LINE}/>')
    else:
        for off in (12, 18):
            cx, cy = x - ux * off, y - uy * off
            A(f'<line x1="{cx+nx*9:.1f}" y1="{cy+ny*9:.1f}" x2="{cx-nx*9:.1f}" y2="{cy-ny*9:.1f}" {LINE}/>')

def side(n, s, field=None, one=False):
    t = tabs[n]
    y = rowy(n, field) if field else t["y"] + HH + RH / 2
    return (t["x"] if s == "L" else t["x"] + t["w"], y)

def link(many, mfield, one, pts_mid, ms, os_, dash=False):
    a = side(many, ms, mfield); b = side(one, os_)
    pts = [a] + pts_mid(a, b) + [b]
    poly(pts, dash)
    end_marker(pts[0], pts[1], "many"); end_marker(pts[-1], pts[-2], "one")

def vert(many, mfield, one):
    tm, to = tabs[many], tabs[one]
    x = to["x"] + to["w"] / 2
    a = (x, tm["y"]); b = (x, to["y"] + to["h"])
    poly([a, b]); end_marker(a, b, "many"); end_marker(b, a, "one")

def hmid(xm):
    return lambda a, b: [(xm, a[1]), (xm, b[1])]

# Locais
vert("UnidadeAreaProcesso", "AreaId", "Area")
link("UnidadeAreaProcesso", "UnidadeId", "Unidade", hmid(1460), "R", "L")
link("UnidadeAreaProcesso", "ProcessoId", "Processo", hmid(975), "L", "R")
# Inspetor -> Area (SOL -> BASE B, por cima)
link("Inspetor", "AreaId", "Area", lambda a, b: [(492, a[1]), (492, 118), (990, 118), (990, b[1])], "R", "L")
# Vínculo
link("Vinculo", "UnidadeAreaProcessoId", "UnidadeAreaProcesso", hmid(955), "R", "L")
for pessoa in ["Responsavel", "Facilitador"]:
    link("Vinculo", "PessoaId", pessoa, hmid(505), "L", "R", dash=True)
vy = rowy("Vinculo", "PessoaId")
for i, (pessoa, gx) in enumerate([("Lider", 1950), ("Gestor", 1950), ("ResponsavelSgi", 2430)]):
    xr = 515 + i * 6
    link("Vinculo", "PessoaId", pessoa, lambda a, b, xr=xr, gx=gx, i=i: [(xr, a[1]), (xr, 100 + i * 6), (gx + i * 3, 100 + i * 6), (gx + i * 3, b[1])], "L", "L", dash=True)
# Inspeção
vert("Inspecao", "UnidadeAreaProcessoId", "UnidadeAreaProcesso")
link("Inspecao", "TipoDeInspecaoId", "TipoDeInspecao", hmid(965), "L", "R")
vert("Agendamento", "TipoDeInspecaoId", "TipoDeInspecao")
vert("PlanoDeAcao", "InspecaoId", "Inspecao")
for emb, fld in [("Inspecao.Checklist[ ]", "Checklist"), ("Inspecao.Metricas[ ]", "Metricas")]:
    a = side("Inspecao", "R", fld); t = tabs[emb]; b = (t["x"], t["y"] + HH / 2)
    pts = [a, (1465 if fld == "Checklist" else 1475, a[1]), (1465 if fld == "Checklist" else 1475, b[1]), b]
    poly(pts); end_marker(pts[0], pts[1], "one"); end_marker(pts[-1], pts[-2], "many")
# GRD
vert("ItemGrd", "PilarId", "Pilar")

# tabelas
for n, t in tabs.items():
    x, y, w, h = t["x"], t["y"], t["w"], t["h"]
    emb = n.startswith("Inspecao.")
    A(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="5" fill="#fff" stroke="#5e5e5e" stroke-width="2.5"{" stroke-dasharray=\"7 4\"" if emb else ""}/>')
    A(f'<path d="M{x} {y+HH} V{y+5} a5 5 0 0 1 5 -5 H{x+w-5} a5 5 0 0 1 5 5 V{y+HH} Z" fill="{"#e6e6e6" if emb else "#ccc"}" stroke="#5e5e5e" stroke-width="2.5"/>')
    A(f'<text x="{x+10}" y="{y+22}" font-size="16" font-style="italic" fill="#222">{esc(n)}{" (JSON)" if emb else ""}</text>')
    A(f'<line x1="{x+C1}" y1="{y+HH}" x2="{x+C1}" y2="{y+h}" stroke="#5e5e5e" stroke-width="1.5"/>')
    for i, (k, v) in enumerate(t["rows"]):
        ry = y + HH + RH * i + 17
        A(f'<text x="{x+7}" y="{ry}" font-size="14" font-style="italic" fill="#111">{esc(k)}</text>')
        A(f'<text x="{x+C1+7}" y="{ry}" font-size="14" font-style="italic" fill="#111">{esc(v)}</text>')

# legenda
lx, ly = 530, H - 190
A(f'<rect x="{lx}" y="{ly}" width="1395" height="150" rx="6" fill="#fff" stroke="#5e5e5e" stroke-width="1.5"/>')
leg = [
    "Banco atual da aplicação (entidades em base44/entities/*.jsonc). Toda entidade tem id (uuid), created_date, updated_date e created_by gerados automaticamente.",
    "Linha cheia = chave estrangeira (pé-de-galinha = lado \"muitos\"). Linha tracejada = Vinculo.PessoaId aponta para Responsavel/Facilitador (SOL), Lider/Gestor (GRD) ou ResponsavelSgi (SGI), conforme o Papel.",
    "Tabelas tracejadas = estruturas JSON embutidas na Inspecao (antes: tabelas Checklist, Score, MetricasGrd, Evidencia e Assinatura). Fotos e assinatura são URLs de arquivos.",
    "Ligações lógicas por e-mail: User.email = Inspetor.Email / Auditor.Email (acesso à Inspeção) e = Vinculo.Email (acesso ao Plano de Ação). PlanoDeAcao.ItemRef = Inspecao.Checklist[].Id.",
]
for i, s in enumerate(leg):
    A(f'<text x="{lx+16}" y="{ly+32+i*32}" font-size="13.5" fill="#222">{esc(s)}</text>')
A('</svg>')
open(OUT, "w", encoding="utf-8").write("\n".join(out))
print(W, H)
