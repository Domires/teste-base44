import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

// Assinatura digital (PenInput do Power Apps). onChange recebe um dataURL PNG ou null.
export default function SignaturePad({ onChange, height = 180 }) {
  const canvas = useRef(null);
  const desenhando = useRef(false);
  const [vazio, setVazio] = useState(true);

  useEffect(() => {
    const c = canvas.current;
    const ajustar = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = r.width * dpr;
      c.height = height * dpr;
      const ctx = c.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#032a47";
      setVazio(true);
      onChange?.(null);
    };
    ajustar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  const pos = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const inicio = (e) => {
    e.preventDefault();
    canvas.current.setPointerCapture(e.pointerId);
    desenhando.current = true;
    const ctx = canvas.current.getContext("2d");
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const mover = (e) => {
    if (!desenhando.current) return;
    const ctx = canvas.current.getContext("2d");
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (vazio) setVazio(false);
  };
  const fim = () => {
    if (!desenhando.current) return;
    desenhando.current = false;
    if (!vazio) onChange?.(canvas.current.toDataURL("image/png"));
  };
  const limpar = () => {
    const c = canvas.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setVazio(true);
    onChange?.(null);
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-md border-2 border-dashed border-primary/40 bg-white">
        <canvas
          ref={canvas}
          style={{ height, touchAction: "none" }}
          className="block w-full cursor-crosshair"
          onPointerDown={inicio}
          onPointerMove={mover}
          onPointerUp={fim}
          onPointerLeave={fim}
        />
        {vazio && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Assine aqui</span>}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={limpar}>
        <Eraser className="h-4 w-4" /> Limpar assinatura
      </Button>
    </div>
  );
}
