import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }
function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
function hexToHsl(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  if (m.length !== 6) return [220, 80, 55];
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function ColorPickerSheet({
  open, onOpenChange, value, onChange,
}: { open: boolean; onOpenChange: (o: boolean) => void; value: string; onChange: (hex: string) => void }) {
  const [h, setH] = useState(220);
  const [s, setS] = useState(80);
  const [l, setL] = useState(55);
  const [hex, setHex] = useState(value || "#3b82f6");

  useEffect(() => {
    if (open) {
      const v = value || "#3b82f6";
      setHex(v);
      const [hh, ss, ll] = hexToHsl(v);
      setH(hh); setS(ss); setL(ll);
    }
  }, [open, value]);

  useEffect(() => {
    setHex(hslToHex(h, s, l));
  }, [h, s, l]);

  const apply = () => { onChange(hex); onOpenChange(false); };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl border-0">
        <SheetHeader className="text-left mb-4">
          <SheetTitle>Свой цвет</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          <div className="h-24 rounded-2xl border" style={{ backgroundColor: hex }} />

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground px-1 flex justify-between">
              <span>Оттенок</span><span className="font-mono">{h}°</span>
            </label>
            <input type="range" min={0} max={360} value={h} onChange={e => setH(+e.target.value)}
              className="w-full h-3 rounded-full appearance-none"
              style={{ background: "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)" }} />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground px-1 flex justify-between">
              <span>Насыщенность</span><span className="font-mono">{s}%</span>
            </label>
            <input type="range" min={0} max={100} value={s} onChange={e => setS(+e.target.value)}
              className="w-full h-3 rounded-full appearance-none"
              style={{ background: `linear-gradient(to right, hsl(${h},0%,${l}%), hsl(${h},100%,${l}%))` }} />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground px-1 flex justify-between">
              <span>Яркость</span><span className="font-mono">{l}%</span>
            </label>
            <input type="range" min={10} max={90} value={l} onChange={e => setL(+e.target.value)}
              className="w-full h-3 rounded-full appearance-none"
              style={{ background: `linear-gradient(to right, hsl(${h},${s}%,10%), hsl(${h},${s}%,50%), hsl(${h},${s}%,90%))` }} />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">HEX</label>
            <Input value={hex} onChange={(e) => {
              const v = e.target.value;
              setHex(v);
              if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                const [hh, ss, ll] = hexToHsl(v);
                setH(hh); setS(clamp(ss, 0, 100)); setL(clamp(ll, 10, 90));
              }
            }} className="h-12 rounded-xl font-mono uppercase" />
          </div>

          <Button onClick={apply} className="w-full h-12 rounded-xl text-base mt-2">Применить</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
