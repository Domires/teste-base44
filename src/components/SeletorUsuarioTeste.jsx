import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { devUser } from "@/api/base44Client";

// SOMENTE NO AMBIENTE LOCAL — simula quem está logado para testar os perfis (admin, inspetor, preenchedor).
// No Base44 o usuário vem da plataforma: REMOVER este componente ao portar.
export default function SeletorUsuarioTeste({ atual }) {
  const [usuarios, setUsuarios] = useState([]);
  useEffect(() => {
    fetch("/api/dev/usuarios").then((r) => r.json()).then(setUsuarios).catch(() => {});
  }, []);
  if (!usuarios.length) return null;
  return (
    <label className="block rounded-xl border border-dashed border-amber-300 bg-amber-50/70 p-3" title="Somente no ambiente local: simula o usuário logado no Base44">
      <span className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-800">
        <FlaskConical className="h-3.5 w-3.5" /> Usuário de teste (somente local)
      </span>
      <select
        value={atual}
        onChange={(e) => {
          devUser.set(e.target.value);
          window.location.href = "/";
        }}
        className="select-nativo h-9 w-full rounded-lg border border-amber-200 bg-white px-3 text-sm shadow-xs focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-200/50"
      >
        {usuarios.map((u) => (
          <option key={u.id} value={u.email}>
            {u.email}{u.role === "admin" ? " (admin)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
