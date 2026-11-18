import { useRef, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { lerExcel } from "@/lib/excel";
import { errMsg } from "@/lib/format";
import { cn } from "@/lib/utils";

const ESTILO = {
  novo: ["Novo", "bg-success/15 text-success"],
  atualizar: ["Atualizar", "bg-sky-100 text-sky-800"],
  vincular: ["Vincular", "bg-success/15 text-success"],
  erro: ["Erro", "bg-destructive/15 text-destructive"],
};

/**
 * Importação de planilha em 3 passos: arquivo → prévia (validação linha a linha) → resultado.
 * interpretar(planilha) => [{ linha, acao, resumo, erros }]; enviar(itensValidos) => { mensagens: [texto], erros: [{ linha, mensagem }] }
 */
export default function ImportarExcelDialog({ aberto, onClose, titulo, descricao, regra, onModelo, interpretar, enviar }) {
  const input = useRef(null);
  const [itens, setItens] = useState(null);
  const [arquivo, setArquivo] = useState("");
  const [erro, setErro] = useState("");
  const [etapa, setEtapa] = useState("arquivo"); // arquivo | previa | enviando | resultado
  const [resultado, setResultado] = useState(null);
  const [soErros, setSoErros] = useState(false);

  const fechar = () => {
    setItens(null); setArquivo(""); setErro(""); setEtapa("arquivo"); setResultado(null); setSoErros(false);
    onClose();
  };

  async function escolher(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErro("");
    try {
      const planilha = await lerExcel(f);
      if (!planilha.linhas.length) throw new Error("A planilha não tem linhas de dados (só o cabeçalho).");
      setItens(interpretar(planilha));
      setArquivo(f.name);
      setEtapa("previa");
    } catch (er) {
      setErro(errMsg(er));
    }
  }

  async function importar() {
    setEtapa("enviando");
    try {
      setResultado(await enviar(itens.filter((i) => i.acao !== "erro")));
      setEtapa("resultado");
    } catch (er) {
      setErro(errMsg(er));
      setEtapa("previa");
    }
  }

  const validos = itens?.filter((i) => i.acao !== "erro").length || 0;
  const contagem = itens ? Object.entries(itens.reduce((m, i) => ({ ...m, [i.acao]: (m[i.acao] || 0) + 1 }), {})) : [];
  const visiveis = (itens || []).filter((i) => !soErros || i.acao === "erro");

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && etapa !== "enviando" && fechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-success" /> {titulo}</DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>

        {etapa === "arquivo" && (
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Baixe o modelo (ou exporte os dados atuais) e preencha no Excel, mantendo os títulos das colunas.</li>
              <li>{regra || "Linhas de registros que já existem atualizam o cadastro; as demais criam registros novos."}</li>
              <li>Envie o arquivo .xlsx: você verá uma prévia antes de gravar.</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onModelo}><Download className="h-4 w-4" /> Baixar modelo</Button>
              <Button onClick={() => input.current?.click()}><Upload className="h-4 w-4" /> Escolher arquivo .xlsx</Button>
              <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={escolher} data-teste="arquivo-excel" />
            </div>
          </div>
        )}

        {(etapa === "previa" || etapa === "enviando") && itens && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{arquivo}:</span>
              {contagem.map(([acao, n]) => (
                <span key={acao} className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", ESTILO[acao]?.[1])}>{n} {ESTILO[acao]?.[0].toLowerCase() || acao}</span>
              ))}
              {itens.some((i) => i.acao === "erro") && (
                <label className="ml-auto flex items-center gap-1 text-xs"><input type="checkbox" checked={soErros} onChange={(e) => setSoErros(e.target.checked)} /> mostrar só erros</label>
              )}
            </div>
            <div className="max-h-[45vh] overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs">
                  <tr><th className="w-14 px-2 py-1.5">Linha</th><th className="w-24 px-2">Ação</th><th className="px-2">Dados / problema</th></tr>
                </thead>
                <tbody>
                  {visiveis.map((i) => (
                    <tr key={i.linha} className="border-t align-top">
                      <td className="px-2 py-1.5 text-muted-foreground">{i.linha}</td>
                      <td className="px-2 py-1.5"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", ESTILO[i.acao]?.[1])}>{ESTILO[i.acao]?.[0] || i.acao}</span></td>
                      <td className="px-2 py-1.5">
                        <div className="text-xs">{i.resumo}</div>
                        {i.erros?.map((e) => <div key={e} className="text-xs font-medium text-destructive">• {e}</div>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {itens.some((i) => i.acao === "erro") && <p className="text-xs text-muted-foreground">Linhas com erro serão ignoradas. Corrija a planilha e envie de novo para incluí-las.</p>}
          </div>
        )}

        {etapa === "resultado" && resultado && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-md bg-success/10 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div>{resultado.mensagens.map((m) => <div key={m}>{m}</div>)}</div>
            </div>
            {!!resultado.erros?.length && (
              <div className="rounded-md border border-destructive/30 p-3 text-sm">
                <div className="mb-1 font-semibold text-destructive">{resultado.erros.length} linha(s) não gravada(s):</div>
                {resultado.erros.map((e) => <div key={e.linha} className="text-xs">Linha {e.linha}: {e.mensagem}</div>)}
              </div>
            )}
          </div>
        )}

        {erro && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}

        <DialogFooter className="gap-2">
          {etapa === "previa" && <Button variant="outline" onClick={() => { setEtapa("arquivo"); setItens(null); }}>Trocar arquivo</Button>}
          {etapa === "previa" && <Button onClick={importar} disabled={!validos}>Importar {validos} linha(s)</Button>}
          {etapa === "enviando" && <Button disabled><Loader2 className="h-4 w-4 animate-spin" /> Importando...</Button>}
          {(etapa === "arquivo" || etapa === "resultado") && <Button variant="outline" onClick={fechar}>Fechar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
