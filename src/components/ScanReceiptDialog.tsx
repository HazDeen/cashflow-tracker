import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, ScanLine, Check, X } from "lucide-react";
import { extractTransactionsFromImage, type ExtractedItem } from "@/lib/extract-transactions.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

export function ScanReceiptDialog({ userId, open, onOpenChange }: {
  userId: string; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const extractFn = useServerFn(extractTransactionsFromImage);
  const qc = useQueryClient();

  const extract = useMutation({
    mutationFn: async (file: File) => {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      return extractFn({ data: { imageBase64: dataUrl } });
    },
    onSuccess: (r) => {
      if (r.error) { toast.error(r.error); return; }
      if (!r.items.length) { toast.info("Операции не найдены"); return; }
      setItems(r.items);
      setSelected(Object.fromEntries(r.items.map((_, i) => [i, true])));
    },
    onError: (e: any) => toast.error(e?.message || "Ошибка распознавания"),
  });

  const save = useMutation({
    mutationFn: async () => {
      const rows = items
        .filter((_, i) => selected[i])
        .map((i) => ({ ...i, user_id: userId }));
      if (!rows.length) return;
      const { error } = await supabase.from("transactions").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Операции добавлены");
      qc.invalidateQueries({ queryKey: ["transactions", userId] });
      qc.invalidateQueries({ queryKey: ["dashboard", userId] });
      setItems([]); setSelected({}); onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Ошибка сохранения"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine size={20} /> Сканировать чек
          </DialogTitle>
        </DialogHeader>

        {!items.length ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Загрузи фото чека или скриншот выписки — AI распознает операции.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) extract.mutate(f);
              }}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={extract.isPending}
              className="w-full"
            >
              {extract.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
              {extract.isPending ? "Распознаю…" : "Выбрать файл"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Найдено: {items.length}. Сними галочки с лишних.
            </p>
            <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
              {items.map((it, i) => (
                <li key={i}
                  onClick={() => setSelected(s => ({ ...s, [i]: !s[i] }))}
                  className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer ${
                    selected[i] ? "bg-card border-primary" : "bg-muted/30 opacity-60"
                  }`}>
                  <span className={`w-5 h-5 rounded grid place-items-center ${
                    selected[i] ? "bg-primary text-primary-foreground" : "border"
                  }`}>
                    {selected[i] && <Check size={14} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.category}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {it.occurred_on} · {it.comment || "—"}
                    </p>
                  </div>
                  <span className={`font-mono text-sm ${
                    it.type === "income" ? "text-income" : "text-expense"
                  }`}>
                    {it.type === "income" ? "+" : "−"}{fmt.format(it.amount)} ₽
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setItems([]); setSelected({}); }} className="flex-1">
                <X /> Отмена
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending} className="flex-1">
                {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                Добавить
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
