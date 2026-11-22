import { useState } from "react";
import type { FormEvent } from "react";
import { Bot, Send, X, Sparkles } from "lucide-react";

type Message = { role: "user" | "assistant"; text: string };

export default function AIAssistant({ lang }: { lang: "ar" | "fr" }) {
  const ar = lang === "ar";
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setMessages(old => [...old, { role: "user", text: message }]);
    setInput("");
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (ar ? "تعذر الاتصال بالمساعد." : "Assistant indisponible."));
      setMessages(old => [...old, { role: "assistant", text: data.answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "حدث خطأ." : "Une erreur est survenue."));
    } finally {
      setBusy(false);
    }
  };

  return <>
    {open && <section dir={ar ? "rtl" : "ltr"} style={{ position: "fixed", zIndex: 1000, right: 18, bottom: 88, width: "min(370px, calc(100vw - 28px))", height: 470, maxHeight: "70vh", background: "#fff", border: "1px solid #dfe5eb", borderRadius: 16, boxShadow: "0 12px 40px #10243b30", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <header style={{ padding: 14, background: "#15283d", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 9 }}><Bot size={21}/><b>{ar ? "مساعد Store Market الذكي" : "Assistant intelligent Store Market"}</b></span>
        <button aria-label="Close" onClick={() => setOpen(false)} style={{ color: "#fff" }}><X size={20}/></button>
      </header>
      <div style={{ padding: 12, flex: 1, overflowY: "auto", background: "#f6f8fa" }}>
        {!messages.length && <p style={{ color: "#536273", lineHeight: 1.8 }}>{ar ? "مرحباً! اسألني عن التسوق أو المنتجات أو البيع في Store Market." : "Bonjour ! Posez vos questions sur les produits, les achats ou la vente."}</p>}
        {messages.map((m, i) => <div key={i} style={{ margin: "9px 0", display: "flex", justifyContent: m.role === "user" ? "flex-start" : "flex-end" }}><div style={{ maxWidth: "88%", padding: "10px 12px", borderRadius: 12, background: m.role === "user" ? "#e5edf5" : "#15283d", color: m.role === "user" ? "#182a3e" : "#fff", whiteSpace: "pre-wrap", lineHeight: 1.65, fontSize: 14 }}>{m.text}</div></div>)}
        {busy && <p style={{ color: "#536273" }}>{ar ? "يفكر..." : "Réflexion..."}</p>}
        {error && <p role="alert" style={{ color: "#a32626", fontSize: 13 }}>{error}</p>}
      </div>
      <form onSubmit={send} style={{ display: "flex", gap: 7, padding: 10, borderTop: "1px solid #e5eaf0" }}>
        <input value={input} onChange={e => setInput(e.target.value)} maxLength={2000} placeholder={ar ? "اكتب سؤالك..." : "Votre question..."} style={{ flex: 1, minWidth: 0, border: "1px solid #dfe5eb", borderRadius: 9, padding: 11 }} />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send" style={{ background: "#15283d", color: "#fff", borderRadius: 9, padding: "0 13px", opacity: busy || !input.trim() ? .5 : 1 }}><Send size={18}/></button>
      </form>
      <small style={{ padding: "0 12px 9px", color: "#718096" }}>{ar ? "المساعد يقدم معلومات فقط ولا ينفذ عمليات شراء أو تغييرات." : "L’assistant informe uniquement et n’effectue aucune action."}</small>
    </section>}
    <button onClick={() => setOpen(v => !v)} aria-label={ar ? "فتح المساعد الذكي" : "Ouvrir l’assistant"} style={{ position: "fixed", zIndex: 1001, right: 18, bottom: 18, display: "flex", alignItems: "center", gap: 8, padding: "13px 16px", borderRadius: 30, background: "#15283d", color: "#fff", boxShadow: "0 5px 20px #10243b40", fontWeight: 700 }}>
      {open ? <X size={19}/> : <Sparkles size={19}/>} {ar ? "المساعد الذكي" : "Assistant IA"}
    </button>
  </>;
}
