import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Botão do plano de ação de um item, colorido pela situação:
// sem plano (vermelho) · em andamento (âmbar) · finalizado (verde)
export default function BotaoPA({ plano, onClick, disabled, children = "Plano de Ação", className }) {
  const tom = !plano
    ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
    : plano.Status === "Finalizado"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
      : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100";
  const ponto = !plano ? "bg-destructive" : plano.Status === "Finalizado" ? "bg-success" : "bg-warning";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-situacao={!plano ? "nao-preenchido" : plano.Status === "Finalizado" ? "finalizado" : "andamento"}
      className={cn(
        "inline-flex h-8 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 text-[13px] font-medium shadow-xs transition sm:w-auto disabled:cursor-default disabled:shadow-none disabled:hover:bg-red-50",
        tom,
        className,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", ponto)} />
      {children}
      {!disabled && <ChevronRight className="-mr-1 h-3.5 w-3.5 opacity-60" />}
    </button>
  );
}
