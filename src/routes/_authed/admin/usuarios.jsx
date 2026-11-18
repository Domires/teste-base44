import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Pencil, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import CadastroDialog from "@/components/admin/CadastroDialog";
import ImportarExcelDialog from "@/components/admin/ImportarExcelDialog";
import { exportarUsuarios, interpretarUsuarios } from "@/components/admin/excelUsuarios";
import { useAuth } from "@/lib/AuthContext";
import { Confirmar, Etiqueta, PageHeader } from "@/components/comum";
import { Carregando, Erro } from "@/components/Estados";
import { adminFns } from "@/lib/fns";
import { errMsg } from "@/lib/format";

// Usuários e perfis de acesso. No Base44 isto é feito pelo painel da plataforma (convites e papéis admin/user).
export const Route = createFileRoute("/_authed/admin/usuarios")({
  component: Usuarios,
});

const CAMPOS = [
  { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true },
  { nome: "full_name", rotulo: "Nome" },
  { nome: "role", rotulo: "Perfil", tipo: "select", opcoes: [{ value: "user", label: "Usuário (Inspetor / Preenchedor)" }, { value: "admin", label: "Administrador" }], obrigatorio: true },
];

function Usuarios() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "usuarios"], queryFn: () => adminFns.listarUsuarios() });
  const [edit, setEdit] = useState(undefined);
  const [rm, setRm] = useState(null);
  const [importando, setImportando] = useState(false);
  const { user } = useAuth();

  async function salvar(d) {
    try {
      await adminFns.salvarUsuario({ id: edit?.id || null, ...d, role: d.role || "user" });
      toast.success("Usuário salvo.");
      setEdit(undefined);
      qc.invalidateQueries({ queryKey: ["admin", "usuarios"] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  async function remover() {
    try {
      await adminFns.removerUsuario({ id: rm.id });
      toast.success("Usuário removido.");
      qc.invalidateQueries({ queryKey: ["admin", "usuarios"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRm(null);
    }
  }

  if (q.isLoading) return <Carregando />;
  if (q.error) return <Erro erro={q.error} onRetry={q.refetch} />;
  return (
    <div>
      <PageHeader
        titulo="Usuários e acessos"
        subtitulo="O perfil Administrador dá acesso ao Admin. Inspetores, auditores e responsáveis recebem acesso pelos cadastros e vínculos (a conta é criada automaticamente ao cadastrá-los)."
        acoes={
          <>
            <Button variant="outline" onClick={() => exportarUsuarios(q.data).catch((e) => toast.error(errMsg(e)))}><Download className="h-4 w-4" /> Exportar Excel</Button>
            <Button variant="outline" onClick={() => setImportando(true)}><Upload className="h-4 w-4" /> Importar Excel</Button>
            <Button onClick={() => setEdit(null)}><Plus className="h-4 w-4" /> Adicionar</Button>
          </>
        }
      />
      <ImportarExcelDialog
        aberto={importando}
        onClose={() => setImportando(false)}
        titulo="Importar Usuários do Excel"
        descricao="Cria ou atualiza usuários e perfis de acesso em massa. Nenhum usuário é removido pela importação."
        regra="O usuário é identificado pelo e-mail: se já existir, é atualizado; senão, é criado. Nome ou Perfil em branco mantêm o valor atual."
        onModelo={() => exportarUsuarios([], true).catch((e) => toast.error(errMsg(e)))}
        interpretar={(planilha) => interpretarUsuarios(planilha, q.data, user?.email)}
        enviar={async (itens) => {
          const r = await adminFns.importarUsuarios({ linhas: itens.map((i) => ({ linha: i.linha, ...i.dados })) });
          qc.invalidateQueries({ queryKey: ["admin", "usuarios"] });
          return { mensagens: [`${r.criados} usuário(s) criado(s).`, `${r.atualizados} usuário(s) atualizado(s).`], erros: r.erros };
        }}
      />
      <div className="overflow-hidden superficie">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {["E-mail", "Nome", "Perfil"].map((h) => <TableHead key={h} className="">{h}</TableHead>)}
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.email}</TableCell>
                <TableCell>{u.full_name}</TableCell>
                <TableCell>{u.role === "admin" ? <Etiqueta tom="primario"><ShieldCheck className="h-3 w-3" />Administrador</Etiqueta> : <span className="text-muted-foreground">Usuário</span>}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" title="Editar" aria-label="Editar" className="text-muted-foreground" onClick={() => setEdit(u)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" title="Remover" aria-label="Remover" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={() => setRm(u)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <CadastroDialog aberto={edit !== undefined} onClose={() => setEdit(undefined)} titulo={edit ? "Editar usuário" : "Adicionar usuário"} campos={CAMPOS} registro={edit || { role: "user" }} onSalvar={salvar} />
      <Confirmar aberto={!!rm} onOpenChange={(o) => !o && setRm(null)} titulo={`Remover ${rm?.email}?`} textoConfirmar="Remover" destrutivo onConfirmar={remover} />
    </div>
  );
}
