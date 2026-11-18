import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { adminFns } from "@/lib/fns";
import { cn } from "@/lib/utils";

// Configuração dos e-mails (Admin › Programação › Configurar e-mails)
export const useConfigEmail = () => useQuery({ queryKey: ["admin", "configEmail"], queryFn: () => adminFns.obterConfigEmail(), staleTime: 30_000 });

// Faixa de aviso exibida onde há envio de e-mail, quando o modo teste está ligado
export default function AvisoModoTeste({ className }) {
  const { data } = useConfigEmail();
  if (!data?.ModoTeste) return null;
  return (
    <div role="status" data-modo-teste="" className={cn("flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900", className)}>
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <p>
        <b>Modo teste de e-mails ativo.</b> Os e-mails irão somente para {data.DestinatariosTeste.join(", ")} — os responsáveis das áreas não receberão.{" "}
        <Link to="/admin/configurar-emails" className="font-medium underline underline-offset-2 hover:text-amber-950">Alterar</Link>
      </p>
    </div>
  );
}
