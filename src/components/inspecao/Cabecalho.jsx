import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Campo, NativeSelect, Valor } from "@/components/comum";

const ListaPessoas = ({ pessoas, vazio }) => (
  <div className="max-h-24 min-h-9 overflow-y-auto rounded-md border bg-white px-3 py-2 text-xs">
    {pessoas.length ? pessoas.map((p) => <div key={p.Email}>{p.Nome} <span className="text-muted-foreground">({p.Email})</span></div>) : <span className="text-muted-foreground">{vazio}</span>}
  </div>
);

// Equipe entrevistada (SGI): nomes e/ou e-mails separados por ";" (no app original: busca no Office 365).
// Aceita qualquer texto — o que estiver digitado é incluído ao pressionar Enter/";" ou ao sair do campo.
function PessoasInput({ valor, onChange }) {
  const [texto, setTexto] = useState("");
  const lista = String(valor || "").split(";").map((s) => s.trim()).filter(Boolean);
  const adicionar = () => {
    const novos = texto.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (novos.length) onChange([...new Set([...lista, ...novos])].join(";"));
    setTexto("");
  };
  return (
    <div className="space-y-1.5">
      {lista.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {lista.map((e) => (
            <span key={e} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
              {e}
              <button type="button" onClick={() => onChange(lista.filter((x) => x !== e).join(";"))} aria-label={`Remover ${e}`}><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === ";") && (e.preventDefault(), adicionar())}
        onBlur={adicionar}
        placeholder="Nome ou e-mail (Enter para adicionar)"
        maxLength={300}
      />
    </div>
  );
}

export default function Cabecalho({ programa, dados, cab, setCab }) {
  const set = (k) => (v) => setCab((c) => ({ ...c, [k]: v }));
  const nomes = (lista) => lista.map((p) => ({ value: p.Nome, label: p.Nome }));
  const l = dados.local;

  if (programa === "SGI") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Valor rotulo="Unidade" valor={l.NomeUnidade} />
        <Valor rotulo="Área" valor={l.NomeArea} />
        <Campo rotulo="Data" obrigatorio><Input type="date" value={cab.Data} onChange={(e) => set("Data")(e.target.value)} /></Campo>
        <Campo rotulo="Auditor" obrigatorio><NativeSelect value={cab.Auditor} onChange={set("Auditor")} options={nomes(dados.auditores)} placeholder="Adicionar Auditor" /></Campo>
        <Campo rotulo="Equipe Entrevistada" obrigatorio className="sm:col-span-2"><PessoasInput valor={cab.EquipeEntrevistada} onChange={set("EquipeEntrevistada")} /></Campo>
        <Valor rotulo="Normas/Disciplinas" valor={dados.normas.join("; ")} className="sm:col-span-2" />
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Valor rotulo="Unidade" valor={l.NomeUnidade} />
      <Valor rotulo="Área" valor={l.NomeArea} />
      <Valor rotulo="Processo" valor={l.NomeProcesso} />
      <Campo rotulo="Data" obrigatorio><Input type="date" value={cab.Data} onChange={(e) => set("Data")(e.target.value)} /></Campo>
      {programa === "GRD" && <Valor rotulo="Tipo de Avaliação" valor={dados.tipoInspecao} />}
      <Campo rotulo={programa === "GRD" ? "Res. Acompanhamento" : "Resp. Acompanhamento"} obrigatorio>
        <Input value={cab.RespAcompanhamento} onChange={(e) => set("RespAcompanhamento")(e.target.value)} placeholder="Nome" maxLength={200} />
      </Campo>
      <Campo rotulo="Cargo" obrigatorio><Input value={cab.Cargo} onChange={(e) => set("Cargo")(e.target.value)} placeholder="Nome do Cargo" maxLength={200} /></Campo>
      {programa === "SOL" && (
        <>
          <Campo rotulo="Inspetor 1" obrigatorio><NativeSelect value={cab.Inspetor1} onChange={set("Inspetor1")} options={nomes(dados.inspetores)} placeholder="Selecionar Inspetor 1" /></Campo>
          <Campo rotulo="Inspetor 2" obrigatorio><NativeSelect value={cab.Inspetor2} onChange={set("Inspetor2")} options={nomes(dados.inspetores)} placeholder="Selecionar Inspetor 2" /></Campo>
          <Campo rotulo="Responsáveis pela Área" className="sm:col-span-2"><ListaPessoas pessoas={dados.responsaveis} vazio="Nenhum responsável vinculado" /></Campo>
        </>
      )}
      {programa === "GRD" && (
        <>
          <Campo rotulo="Avaliador" obrigatorio><NativeSelect value={cab.Avaliador} onChange={set("Avaliador")} options={nomes(dados.inspetores)} placeholder="Selecionar Avaliador" /></Campo>
          <Campo rotulo="Líderes"><ListaPessoas pessoas={dados.lideres} vazio="Nenhum líder vinculado" /></Campo>
          <Campo rotulo="Gestores"><ListaPessoas pessoas={dados.gestores} vazio="Nenhum gestor vinculado" /></Campo>
        </>
      )}
      <Campo rotulo="Observações" className="sm:col-span-2">
        <Textarea rows={2} value={cab.Observacao} onChange={(e) => set("Observacao")(e.target.value)} placeholder="Observações..." maxLength={4000} />
      </Campo>
      {programa === "SOL" && (
        <Campo rotulo="Legenda" className="sm:col-span-2">
          <div className="flex justify-center gap-6 rounded-md border bg-white px-3 py-2 text-xs">
            <span><b>S</b> Segurança</span><span><b>E</b> Empresa</span><span><b>C</b> Colaborador</span>
          </div>
        </Campo>
      )}
    </div>
  );
}
