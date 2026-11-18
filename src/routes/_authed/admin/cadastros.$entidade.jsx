import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import CadastroDialog from "@/components/admin/CadastroDialog";
import ImportarExcelDialog from "@/components/admin/ImportarExcelDialog";
import { colunasExcel, instrucoesExcel, interpretarPlanilha, linhasExportacao } from "@/components/admin/excelCadastros";
import { baixarExcel, dataArquivo } from "@/lib/excel";
import { CADASTROS, ROTULO_COLUNA } from "@/components/admin/cadastros";
import { Confirmar, PageHeader } from "@/components/comum";
import { Carregando, Erro, NotFound, Vazio } from "@/components/Estados";
import { adminFns } from "@/lib/fns";
import { errMsg } from "@/lib/format";

export const Route = createFileRoute("/_authed/admin/cadastros/$entidade")({
  component: Cadastro,
});

function Cadastro() {
  const { entidade } = Route.useParams();
  const cfg = CADASTROS[entidade];
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState(undefined); // undefined = fechado, null = novo, obj = edição
  const [removendo, setRemovendo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [importando, setImportando] = useState(false);

  const q = useQuery({ queryKey: ["cad", entidade], queryFn: () => base44.entities[entidade].list(cfg?.ordenar), enabled: !!cfg });
  const fontesNecessarias = [...new Set((cfg?.campos || []).map((c) => c.fonte).filter(Boolean))];
  const fontes = useQuery({
    queryKey: ["cad", "fontes", fontesNecessarias],
    queryFn: async () => Object.fromEntries(await Promise.all(fontesNecessarias.map(async (e) => [e, await base44.entities[e].list("Nome")]))),
    enabled: fontesNecessarias.length > 0,
  });

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (q.data || []).filter((r) => !t || cfg.busca.some((k) => String(r[k] ?? "").toLowerCase().includes(t)));
  }, [q.data, busca, cfg]);

  if (!cfg) return <NotFound />;

  const mostrar = (r, col) => {
    const campo = cfg.campos.find((c) => c.nome === col);
    const v = r[col];
    if (campo?.tipo === "bool") return v === false ? "Não" : "Sim";
    if (campo?.fonte && !campo.valor) return (fontes.data?.[campo.fonte] || []).find((x) => x.id === v)?.Nome || "—";
    return v ?? "";
  };

  async function salvar(dados) {
    setSalvando(true);
    try {
      await adminFns.salvarCadastro({ entidade, id: editando?.id || null, dados });
      toast.success(`${editando ? "Atualizado" : "Inserido"} com sucesso!`);
      setEditando(undefined);
      qc.invalidateQueries({ queryKey: ["cad"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSalvando(false);
    }
  }

  async function exportar(registros) {
    try {
      await baixarExcel({
        arquivo: `${registros.length ? "cadastro" : "modelo"}-${entidade.toLowerCase()}-${dataArquivo()}.xlsx`,
        colunas: colunasExcel(cfg),
        linhas: linhasExportacao(cfg, registros, fontes.data),
        instrucoes: instrucoesExcel(cfg),
      });
    } catch (e) {
      toast.error(`Não foi possível gerar o Excel: ${errMsg(e)}`);
    }
  }

  async function remover() {
    try {
      await adminFns.removerCadastro({ entidade, id: removendo.id });
      toast.success("Removido com sucesso!");
      qc.invalidateQueries({ queryKey: ["cad"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRemovendo(null);
    }
  }

  return (
    <div>
      <PageHeader
        titulo={cfg.titulo}
        subtitulo={cfg.descricao}
        acoes={
          <>
            <Button variant="outline" onClick={() => exportar(lista)} disabled={!q.data}><Download className="h-4 w-4" /> Exportar Excel</Button>
            <Button variant="outline" onClick={() => setImportando(true)} disabled={!q.data}><Upload className="h-4 w-4" /> Importar Excel</Button>
            <Button onClick={() => setEditando(null)}><Plus className="h-4 w-4" /> Adicionar</Button>
          </>
        }
      />
      <ImportarExcelDialog
        aberto={importando}
        onClose={() => setImportando(false)}
        titulo={`Importar ${cfg.titulo} do Excel`}
        descricao="Inclui e atualiza registros em massa. Nada é removido pela importação."
        regra={`Cada linha é identificada por ${[].concat(cfg.unico || []).map((u) => cfg.campos.find((c) => c.nome === u)?.rotulo || u).join(" + ")}: se já existir, o registro é atualizado; se não, é criado.`}
        onModelo={() => exportar([])}
        interpretar={(planilha) => interpretarPlanilha(cfg, planilha, q.data || [], fontes.data)}
        enviar={async (itens) => {
          const r = await adminFns.importarCadastro({ entidade, linhas: itens.map((i) => ({ linha: i.linha, id: i.id, dados: i.dados })) });
          qc.invalidateQueries({ queryKey: ["cad"] });
          return { mensagens: [`${r.criados} registro(s) criado(s).`, `${r.atualizados} registro(s) atualizado(s).`], erros: r.erros };
        }}
      />
      <div className="relative mb-3 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Pesquisar..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} onRetry={q.refetch} /> : !lista.length ? <Vazio /> : (
        <div className="overflow-hidden superficie">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {cfg.colunas.map((c) => <TableHead key={c} className="">{ROTULO_COLUNA[c] || c}</TableHead>)}
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((r) => (
                <TableRow key={r.id}>
                  {cfg.colunas.map((c) => <TableCell key={c} className="max-w-md align-middle">{mostrar(r, c)}</TableCell>)}
                  <TableCell className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Editar" className="text-muted-foreground" onClick={() => setEditando(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Remover" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={() => setRemovendo(r)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <CadastroDialog
        aberto={editando !== undefined}
        onClose={() => setEditando(undefined)}
        titulo={editando ? `Editar — ${cfg.titulo}` : `Adicionar — ${cfg.titulo}`}
        campos={cfg.campos}
        registro={editando}
        fontes={fontes.data}
        onSalvar={salvar}
        salvando={salvando}
      />
      <Confirmar
        aberto={!!removendo}
        onOpenChange={(o) => !o && setRemovendo(null)}
        titulo="Remover registro?"
        descricao={removendo && `"${removendo.Nome || removendo.Tipo || removendo.Requisito || removendo.Questao}" será removido. Vínculos desta pessoa com áreas também serão removidos.`}
        textoConfirmar="Remover"
        destrutivo
        onConfirmar={remover}
      />
    </div>
  );
}
