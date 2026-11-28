import { useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Activity } from "lucide-react";
import { storeApi } from "./api";

type Status = Awaited<ReturnType<typeof storeApi.brainSystemStatus>>;
export default function BrainStatusCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true); setError("");
    try { setStatus(await storeApi.brainSystemStatus()); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر جلب الحالة"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const mark = (ok: boolean) => ok ? <CheckCircle2 size={18} color="#15803d"/> : <XCircle size={18} color="#b91c1c"/>;
  return <section style={{border:"1px solid #dbe5ee",borderRadius:16,padding:16,margin:"18px 0",background:"#f7fafc",color:"#142337"}}>
    <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}><Activity/><strong>فحص نظام Store Brain</strong></div>
      <button type="button" onClick={refresh} disabled={loading} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 12px",borderRadius:9,border:"1px solid #cbd5e1",background:"#fff",cursor:"pointer"}}><RefreshCw size={16}/>{loading?"جارٍ الفحص…":"تحديث الحالة"}</button>
    </header>
    {error?<p role="alert" style={{color:"#b91c1c"}}>{error}</p>:!status?<p>جارٍ التحقق من الاتصال والبنية…</p>:<>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginTop:14}}>
        <div style={{background:"#fff",borderRadius:10,padding:12}}>{mark(status.schema==="ready")}<b style={{marginInlineStart:8}}>قاعدة البيانات</b><p style={{margin:"8px 0 0"}}>{status.schema_tables_found}/{status.schema_tables_required} جداول Brain</p></div>
        <div style={{background:"#fff",borderRadius:10,padding:12}}>{mark(status.ai_configured)}<b style={{marginInlineStart:8}}>محرك الذكاء الاصطناعي</b><p style={{margin:"8px 0 0"}}>{status.ai_configured?status.ai_provider_setting:"غير مضبوط"}</p></div>
        <div style={{background:"#fff",borderRadius:10,padding:12}}><ShieldCheck size={18} color="#2563eb"/><b style={{marginInlineStart:8}}>الموافقات المعلقة</b><p style={{margin:"8px 0 0"}}>{status.pending_approvals}</p></div>
        <div style={{background:"#fff",borderRadius:10,padding:12}}><Activity size={18} color="#2563eb"/><b style={{marginInlineStart:8}}>المسودات</b><p style={{margin:"8px 0 0"}}>{status.draft_count}</p></div><div style={{background:"#fff",borderRadius:10,padding:12}}><Activity size={18} color="#2563eb"/><b style={{marginInlineStart:8}}>الاتصالات الاجتماعية</b><p style={{margin:"8px 0 0"}}>{status.social_connections_ready} اتصال متحقق</p></div>
      </div>
      <p style={{display:"flex",gap:8,alignItems:"center",marginTop:14,padding:10,background:"#fff7ed",borderRadius:10}}><AlertTriangle size={18} color="#c2410c"/><span>وضع التنفيذ الحالي: <b>مسودات فقط — لا يوجد نشر أو إجراء خارجي تلقائي</b></span></p>
    </>}
  </section>;
}
