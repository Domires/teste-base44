import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/comum";

// Formulário de inclusão/edição gerado a partir de components/admin/cadastros.js
export default function CadastroDialog({ aberto, onClose, titulo, campos, registro, fontes = {}, onSalvar, salvando }) {
  const [f, setF] = useState({});
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!aberto) return;
    const base = {};
    for (const c of campos) base[c.nome] = registro?.[c.nome] ?? (c.tipo === "bool" ? true : "");
    setF(base);
    setErro("");
  }, [aberto, registro, campos]);

  function salvar() {
    const falt = campos.filter((c) => c.obrigatorio && (f[c.nome] === "" || f[c.nome] == null)).map((c) => c.rotulo);
    if (falt.length) return setErro(`Campo(s) não preenchido(s): ${falt.join(", ")}.`);
    const out = { ...f };
    for (const c of campos) if (c.tipo === "number" && out[c.nome] !== "") out[c.nome] = Number(out[c.nome]);
    onSalvar(out);
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {campos.map((c) => (
            <div key={c.nome} className="space-y-1">
              <Label>{c.rotulo}{c.obrigatorio && <span className="text-destructive"> *</span>}</Label>
              {c.tipo === "textarea" ? (
                <Textarea rows={3} value={f[c.nome] ?? ""} onChange={(e) => setF((s) => ({ ...s, [c.nome]: e.target.value }))} />
              ) : c.tipo === "select" ? (
                <NativeSelect
                  value={f[c.nome]}
                  onChange={(v) => setF((s) => ({ ...s, [c.nome]: v }))}
                  options={c.opcoes || (fontes[c.fonte] || []).map((r) => ({ value: c.valor ? r[c.valor] : r.id, label: r.Nome || r.Tipo }))}
                  placeholder={c.obrigatorio ? "Selecionar" : "—"}
                />
              ) : c.tipo === "bool" ? (
                <div><Switch checked={!!f[c.nome]} onCheckedChange={(v) => setF((s) => ({ ...s, [c.nome]: v }))} /></div>
              ) : (
                <Input type={c.tipo === "number" ? "number" : c.tipo === "email" ? "email" : "text"} value={f[c.nome] ?? ""} onChange={(e) => setF((s) => ({ ...s, [c.nome]: e.target.value }))} />
              )}
              {c.ajuda && <p className="text-xs text-muted-foreground">{c.ajuda}</p>}
            </div>
          ))}
          {erro && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{registro ? "Salvar" : "Adicionar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
