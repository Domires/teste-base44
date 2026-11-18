import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Etiqueta, NativeSelect, PageHeader } from "@/components/comum";
import { Carregando, Erro, Vazio } from "@/components/Estados";
import { fmtDataHora } from "@/lib/format";

// ScreenLogs (LogAuditoria)
export const Route = createFileRoute("/_authed/admin/logs")({
  component: Logs,
});

function Logs() {
  const q = useQuery({ queryKey: ["admin", "logs"], queryFn: () => base44.entities.LogAuditoria.list("-Data", 1000) });
  const [busca, setBusca] = useState("");
  const [app, setApp] = useState("");
  const [sel, setSel] = useState(null);
  const lista = useMemo(() => {
    const t = busca.toLowerCase();
    return (q.data || []).filter((l) => (!app || l.Aplicacao === app) && (!t || [l.UserName, l.UserEmail, l.Acao, l.Descricao].some((v) => String(v || "").toLowerCase().includes(t))));
  }, [q.data, busca, app]);

  return (
    <div>
      <PageHeader titulo="Logs do Sistema" subtitulo="Últimas 1000 atividades registradas" />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Usuário, ação..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="w-48"><NativeSelect value={app} onChange={setApp} options={["Admin", "Inspeção", "Plano de Ação"]} placeholder="Todas aplicações" /></div>
      </div>
      {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} onRetry={q.refetch} /> : !lista.length ? <Vazio /> : (
        <div className="overflow-x-auto superficie">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {["Data", "Aplicação", "Usuário", "Ação", "Função", "SO", "Status"].map((h) => <TableHead key={h} >{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((l) => (
                <TableRow key={l.id} className="cursor-pointer" onClick={() => setSel(l)}>
                  <TableCell className="whitespace-nowrap">{fmtDataHora(l.Data)}</TableCell>
                  <TableCell>{l.Aplicacao}</TableCell>
                  <TableCell><div>{l.UserName}</div><div className="text-xs text-muted-foreground">{l.UserEmail}</div></TableCell>
                  <TableCell>{l.Acao}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.Funcao}</TableCell>
                  <TableCell>{l.SistemaOperacional}</TableCell>
                  <TableCell>{l.Status ? <Etiqueta tom="sucesso" ponto>Sucesso</Etiqueta> : <Etiqueta tom="perigo" ponto title={l.Descricao}>Erro</Etiqueta>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Dados — {sel?.Acao}</DialogTitle></DialogHeader>
          {sel && (
            <div className="space-y-2 text-sm">
              <p><b>Descrição:</b> {sel.Descricao}</p>
              <p className="break-all text-xs text-muted-foreground"><b>User agent:</b> {sel.UserAgent}</p>
              <pre className="max-h-96 overflow-auto rounded-lg border bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">{(() => { try { return JSON.stringify(JSON.parse(sel.Modelo || "{}"), null, 2); } catch { return sel.Modelo; } })()}</pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
