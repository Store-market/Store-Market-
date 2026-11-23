const SESSION_DAYS = 7;
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
});
const fail = (message, status = 400) => json({ error: message }, status);
const uid = () => crypto.randomUUID();
const encoder = new TextEncoder();
const bytesToHex = (bytes) => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
const hexToBytes = (hex) => new Uint8Array((hex.match(/.{1,2}/g) || []).map(x => parseInt(x, 16)));
async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, key, 256);
  return { hash: bytesToHex(bits), salt: bytesToHex(salt) };
}
async function digest(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
function cookie(value, maxAge) {
  return `sm_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function getCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const part = raw.split(";").map(x => x.trim()).find(x => x.startsWith(name + "="));
  return part ? part.slice(name.length + 1) : "";
}
async function body(request) {
  try { return await request.json(); } catch { return null; }
}
async function currentUser(request, env) {
  const token = getCookie(request, "sm_session");
  if (!token) return null;
  const tokenHash = await digest(token);
  const row = await env.DB.prepare(
    "SELECT u.id,u.email,u.name,u.role,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>? AND u.status='active'"
  ).bind(tokenHash, Date.now()).first();
  return row || null;
}
function requireFields(data, fields) {
  return data && fields.every(key => typeof data[key] === "string" && data[key].trim().length);
}

function isComplexPrompt(prompt) {
  const text = prompt.toLowerCase();
  const complexSignals = [
    "حلل", "حلّل", "قارن", "خطة", "استراتيجية", "استراتيجي", "تقرير", "دراسة",
    "برمج", "كود", "خطأ", "تصميم نظام", "متطلبات", "قانوني", "تحليل", "تفصيلي",
    "analyse", "analyser", "compare", "stratégie", "plan détaillé", "rapport",
    "architecture", "programmer", "code", "déboguer", "complex", "detailed",
    "analyze", "strategy", "design a system", "debug", "research"
  ];
  return prompt.length > 650 || complexSignals.some(signal => text.includes(signal));
}

async function runCloudflareAI(env, system, prompt) {
  if (!env.AI) throw new Error("Workers AI غير مربوط.");
  const result = await env.AI.run(env.CF_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct-fast", {
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt }
    ],
    max_tokens: 700
  });
  const answer = typeof result?.response === "string" ? result.response
    : typeof result?.result?.response === "string" ? result.result.response
    : typeof result?.output_text === "string" ? result.output_text : "";
  if (!answer) throw new Error("تعذر قراءة استجابة Cloudflare AI.");
  return { answer, provider: "cloudflare" };
}

async function runClaudeAI(env, system, prompt) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("مفتاح Claude غير مضبوط.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: 900,
      system,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("تعذر الاتصال بمحرك Claude AI (" + response.status + ").");
  const answer = Array.isArray(data.content) ? data.content.filter(x => x.type === "text").map(x => x.text).join("\n") : "";
  if (!answer) throw new Error("لم يرجع Claude AI إجابة نصية.");
  return { answer, provider: "claude" };
}

async function runAI(env, user, prompt) {
  const provider = String(env.AI_PROVIDER || "auto").toLowerCase();
  const system = "أنت مساعد Store Market، سوق إلكتروني جزائري. أجب بلغة المستخدم (العربية أو الفرنسية)، بوضوح واختصار. ساعد في التسوق، فهم المنتجات، البيع وخدمة العملاء. لا تدّعِ توفر منتج أو سعر أو شحن أو دفع غير مثبت في البيانات. لا تطلب كلمات المرور أو رموز التحقق أو بيانات البطاقات. لا تنفذ أي شراء أو نشر أو تغيير سعر أو إجراء إداري؛ أنت تقدم معلومات واقتراحات فقط، وأي إجراء حساس يحتاج موافقة المالك. إذا لم تعرف معلومة فقل ذلك بوضوح.";
  const roleContext = user.role === "owner" ? "المستخدم هو مالك المنصة." : user.role === "seller" ? "المستخدم بائع." : "المستخدم عميل.";
  const fullSystem = system + " " + roleContext;
  if (provider === "cloudflare") return runCloudflareAI(env, fullSystem, prompt);
  if (provider === "claude" || provider === "anthropic") return runClaudeAI(env, fullSystem, prompt);
  if (provider !== "auto") throw new Error("قيمة AI_PROVIDER غير معروفة. استخدم auto أو cloudflare أو claude.");

  // Auto routing: quick everyday requests go to Cloudflare; complex work goes to Claude.
  const complex = isComplexPrompt(prompt);
  const primary = complex ? "claude" : "cloudflare";
  const secondary = complex ? "cloudflare" : "claude";
  const available = {
    claude: !!env.ANTHROPIC_API_KEY,
    cloudflare: !!env.AI
  };
  const run = primary === "claude" ? runClaudeAI : runCloudflareAI;
  const fallback = secondary === "claude" ? runClaudeAI : runCloudflareAI;
  if (available[primary]) {
    try {
      return await run(env, fullSystem, prompt);
    } catch (error) {
      if (!available[secondary]) throw error;
      return fallback(env, fullSystem, prompt);
    }
  }
  if (available[secondary]) return fallback(env, fullSystem, prompt);
  throw new Error("لم يتم إعداد أي محرك. اربط Workers AI أو أضف ANTHROPIC_API_KEY في Cloudflare.");
}


const BRAIN_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS brain_tasks (id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',agent TEXT NOT NULL CHECK(agent IN ('manager','catalog','social_discovery','content_studio','approval','support','analytics','security')),status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','assigned','running','needs_approval','approved','completed','rejected','failed','cancelled')),priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),input_json TEXT NOT NULL DEFAULT '{}',output_json TEXT,source_url TEXT,created_by TEXT NOT NULL REFERENCES users(id),assigned_to TEXT,attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),max_attempts INTEGER NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 5),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_brain_tasks_status_created ON brain_tasks(status,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_brain_tasks_agent_status ON brain_tasks(agent,status)`,
  `CREATE TABLE IF NOT EXISTS brain_agent_runs (id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES brain_tasks(id) ON DELETE CASCADE,agent TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('started','succeeded','failed','cancelled')),provider TEXT,input_summary TEXT NOT NULL DEFAULT '',output_summary TEXT NOT NULL DEFAULT '',error_code TEXT,started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,finished_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_brain_runs_task ON brain_agent_runs(task_id,started_at)`,
  `CREATE TABLE IF NOT EXISTS brain_approvals (id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES brain_tasks(id) ON DELETE CASCADE,action_type TEXT NOT NULL CHECK(action_type IN ('publish_post','send_reply','send_message','change_price','change_stock','delete_content','launch_ad','other')),destination TEXT NOT NULL DEFAULT '',payload_json TEXT NOT NULL,payload_sha256 TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','expired','executed','failed')),requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_by TEXT REFERENCES users(id),reviewed_at TEXT,expires_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_brain_approvals_status ON brain_approvals(status,requested_at)`,
  `CREATE TABLE IF NOT EXISTS brain_social_sources (id TEXT PRIMARY KEY,platform TEXT NOT NULL,source_url TEXT NOT NULL,creator_name TEXT NOT NULL DEFAULT '',rights_status TEXT NOT NULL DEFAULT 'unknown' CHECK(rights_status IN ('unknown','licensed','permission_granted','reference_only','blocked')),rights_evidence TEXT NOT NULL DEFAULT '',discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,created_by TEXT NOT NULL REFERENCES users(id))`,
  `CREATE INDEX IF NOT EXISTS idx_brain_sources_platform ON brain_social_sources(platform)`,
  `CREATE TABLE IF NOT EXISTS brain_content_drafts (id TEXT PRIMARY KEY,task_id TEXT REFERENCES brain_tasks(id) ON DELETE SET NULL,platform TEXT NOT NULL,title TEXT NOT NULL DEFAULT '',body TEXT NOT NULL,media_reference TEXT NOT NULL DEFAULT '',rights_status TEXT NOT NULL DEFAULT 'original' CHECK(rights_status IN ('original','licensed','permission_granted','reference_only','unknown')),status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_approval','approved','published','rejected')),scheduled_at TEXT,created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_brain_drafts_status ON brain_content_drafts(status,created_at)`,
  `CREATE TABLE IF NOT EXISTS brain_audit_events (id TEXT PRIMARY KEY,actor_user_id TEXT REFERENCES users(id),actor_type TEXT NOT NULL CHECK(actor_type IN ('owner','agent','system')),event_type TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,details_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_brain_audit_entity ON brain_audit_events(entity_type,entity_id,created_at)`,
  `CREATE TABLE IF NOT EXISTS brain_social_connections (id TEXT PRIMARY KEY,platform TEXT NOT NULL,account_label TEXT NOT NULL DEFAULT '',external_account_id TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'not_connected' CHECK(status IN ('not_connected','connected','expired','revoked','error')),granted_scopes TEXT NOT NULL DEFAULT '',connected_at TEXT,last_checked_at TEXT,created_by TEXT NOT NULL REFERENCES users(id))`,
  `CREATE INDEX IF NOT EXISTS idx_brain_social_connections_platform ON brain_social_connections(platform,status)`
];
async function ensureBrainSchema(DB) {
  for (const statement of BRAIN_SCHEMA) await DB.prepare(statement).run();
}

export async function onRequest({ request, env }) {
  if (!env.DB) return fail("قاعدة البيانات غير مربوطة بعد. راجع إعداد Cloudflare D1.", 503);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  const method = request.method.toUpperCase();

  try {
    if (path === "health" && method === "GET") {
      await env.DB.prepare("SELECT 1").first();
      await ensureBrainSchema(env.DB);
      const brain = await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'brain_%'").first();
      return json({ ok: true, service: "Store Market API", database: "connected", brain: brain?.n === 7 ? "ready" : "schema_incomplete", brain_tables: brain?.n || 0 });
    }

    if (path === "setup-owner" && method === "POST") {
      if (!env.OWNER_SETUP_KEY || !env.OWNER_EMAIL || request.headers.get("x-owner-setup-key") !== env.OWNER_SETUP_KEY)
        return fail("إعداد المالك غير مصرح به.", 403);
      const existing = await env.DB.prepare("SELECT id FROM users WHERE role='owner' LIMIT 1").first();
      if (existing) return fail("تم إعداد حساب المالك مسبقاً.", 409);
      const data = await body(request);
      if (!requireFields(data, ["name", "password"]) || data.password.length < 12)
        return fail("أدخل اسماً وكلمة مرور لا تقل عن 12 حرفاً.");
      const email = String(env.OWNER_EMAIL).toLowerCase();
      const { hash, salt } = await hashPassword(data.password);
      await env.DB.prepare("INSERT INTO users (id,email,name,password_hash,password_salt,role,status) VALUES (?,?,?,?,?,'owner','active')")
        .bind(uid(), email, data.name.trim().slice(0,100), hash, salt).run();
      return json({ ok: true, message: "تم إنشاء حساب المالك. احذف OWNER_SETUP_KEY بعد ذلك." }, 201);
    }

    if (path === "auth/register" && method === "POST") {
      const data = await body(request);
      if (!requireFields(data, ["name", "email", "password", "role"])) return fail("البيانات المطلوبة ناقصة.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.password.length < 10) return fail("تحقق من البريد وكلمة المرور (10 أحرف على الأقل).");
      if (!["customer", "seller"].includes(data.role)) return fail("نوع الحساب غير صالح.");
      const { hash, salt } = await hashPassword(data.password);
      const id = uid();
      try {
        await env.DB.prepare("INSERT INTO users (id,email,name,password_hash,password_salt,role,status) VALUES (?,?,?,?,?,?,?)")
          .bind(id, data.email.trim().toLowerCase(), data.name.trim().slice(0,100), hash, salt, data.role, data.role === "seller" ? "pending" : "active").run();
      } catch { return fail("هذا البريد مسجل مسبقاً أو البيانات غير صالحة.", 409); }
      return json({ ok: true, message: data.role === "seller" ? "تم استلام طلب البائع للمراجعة." : "تم إنشاء الحساب." }, 201);
    }

    if (path === "auth/login" && method === "POST") {
      const data = await body(request);
      if (!requireFields(data, ["email", "password"])) return fail("أدخل البريد وكلمة المرور.");
      const user = await env.DB.prepare("SELECT id,email,name,password_hash,password_salt,role,status FROM users WHERE email=?")
        .bind(data.email.trim().toLowerCase()).first();
      if (!user || user.status !== "active") return fail("بيانات الدخول غير صحيحة أو الحساب قيد المراجعة.", 401);
      const computed = await hashPassword(data.password, user.password_salt);
      if (computed.hash !== user.password_hash) return fail("بيانات الدخول غير صحيحة.", 401);
      const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
      const expires = Date.now() + SESSION_DAYS * 86400000;
      await env.DB.prepare("INSERT INTO sessions (id,user_id,expires_at) VALUES (?,?,?)").bind(await digest(token), user.id, expires).run();
      return json({ user: { id:user.id,email:user.email,name:user.name,role:user.role } }, 200, { "set-cookie": cookie(token, SESSION_DAYS * 86400) });
    }

    if (path === "auth/logout" && method === "POST") {
      const token = getCookie(request, "sm_session");
      if (token) await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(await digest(token)).run();
      return json({ ok: true }, 200, { "set-cookie": cookie("", 0) });
    }

    if (path === "auth/me" && method === "GET") {
      const user = await currentUser(request, env);
      return user ? json({ user }) : fail("يلزم تسجيل الدخول.", 401);
    }

    if (path === "products" && method === "GET") {
      const rows = await env.DB.prepare("SELECT id,name,description,category,price_dzd,stock,image_url,seller_id FROM products WHERE status='active' ORDER BY created_at DESC LIMIT 100").all();
      return json({ products: rows.results || [] });
    }

    const user = await currentUser(request, env);
    if (!user) return fail("يلزم تسجيل الدخول.", 401);



    if (path.startsWith("brain/")) {
      if (user.role !== "owner") return fail("هذه الخدمة للمالك فقط.", 403);
      await ensureBrainSchema(env.DB);
      if (path === "brain/overview" && method === "GET") {
        const [tasks, pending, drafts, connections] = await Promise.all([
          env.DB.prepare("SELECT COUNT(*) AS n FROM brain_tasks").first(),
          env.DB.prepare("SELECT COUNT(*) AS n FROM brain_approvals WHERE status='pending'").first(),
          env.DB.prepare("SELECT COUNT(*) AS n FROM brain_content_drafts WHERE status IN ('draft','pending_approval')").first(),
          env.DB.prepare("SELECT COUNT(*) AS n FROM brain_social_connections WHERE status='connected'").first()
        ]);
        return json({ tasks:tasks.n, pending_approvals:pending.n, drafts:drafts.n, connected_social_accounts:connections.n, ai_configured:!!env.AI||!!env.ANTHROPIC_API_KEY });
      }
      if (path === "brain/tasks" && method === "GET") {
        const rows = await env.DB.prepare("SELECT id,title,description,agent,status,priority,source_url,attempts,created_at,updated_at FROM brain_tasks ORDER BY created_at DESC LIMIT 100").all();
        return json({ tasks:rows.results||[] });
      }
      if (path === "brain/tasks" && method === "POST") {
        const data = await body(request);
        const agents = ["manager","catalog","social_discovery","content_studio","approval","support","analytics","security"];
        if (!requireFields(data,["title"]) || (data.agent && !agents.includes(data.agent))) return fail("عنوان المهمة أو الوكيل غير صالح.");
        const id=uid(), agent=data.agent||"manager", priority=Number.isInteger(data.priority)?Math.max(1,Math.min(5,data.priority)):3;
        await env.DB.prepare("INSERT INTO brain_tasks (id,title,description,agent,priority,input_json,source_url,created_by) VALUES (?,?,?,?,?,?,?,?)")
          .bind(id,data.title.trim().slice(0,180),String(data.description||"").slice(0,4000),agent,priority,JSON.stringify(data.input||{}),String(data.source_url||"").slice(0,1000),user.id).run();
        await env.DB.prepare("INSERT INTO brain_audit_events (id,actor_user_id,actor_type,event_type,entity_type,entity_id,details_json) VALUES (?,?, 'owner','task_created','brain_task',?,?)")
          .bind(uid(),user.id,id,JSON.stringify({agent,priority})).run();
        return json({ok:true,id,status:"queued"},201);
      }

      if (path.startsWith("brain/tasks/") && path.endsWith("/run") && method === "POST") {
        const id=path.slice("brain/tasks/".length,-4);
        const task=await env.DB.prepare("SELECT id,title,description,agent,input_json,status,attempts,max_attempts FROM brain_tasks WHERE id=?").bind(id).first();
        if(!task) return fail("المهمة غير موجودة.",404);
        if(["completed","rejected","cancelled"].includes(task.status)) return fail("لا يمكن تشغيل مهمة منتهية.",409);
        if(task.attempts>=task.max_attempts) return fail("تم بلوغ الحد الأقصى لمحاولات المهمة.",409);
        await env.DB.prepare("UPDATE brain_tasks SET status='running',attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
        const runId=uid();
        await env.DB.prepare("INSERT INTO brain_agent_runs (id,task_id,agent,status,provider,input_summary) VALUES (?,?,?,'started',NULL,?)")
          .bind(runId,id,task.agent,String(task.description||task.title).slice(0,500)).run();
        try {
          const prompt="نفّذ المهمة التالية لمتجر إلكتروني جزائري. أعد نتيجة عملية ومنظمة، وميّز بوضوح بين الحقائق والاقتراحات. لا تدّع الوصول إلى الإنترنت أو حسابات التواصل أو بيانات غير موجودة. لا تنشر ولا ترسل رسائل ولا تغيّر أسعاراً أو مخزوناً. إذا كانت المهمة تتطلب إجراءً خارجياً فأنشئ توصية ومسودة فقط.\n\nالوكيل: "+task.agent+"\nالعنوان: "+task.title+"\nالوصف: "+task.description+"\nمدخلات: "+task.input_json;
          const result=await runAI(env,{role:"owner"},prompt);
          await env.DB.prepare("UPDATE brain_tasks SET status='completed',output_json=?,updated_at=CURRENT_TIMESTAMP,completed_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(JSON.stringify({answer:result.answer,provider:result.provider}),id).run();
          await env.DB.prepare("UPDATE brain_agent_runs SET status='succeeded',provider=?,output_summary=?,finished_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(result.provider,result.answer.slice(0,3000),runId).run();
          await env.DB.prepare("INSERT INTO brain_audit_events (id,actor_user_id,actor_type,event_type,entity_type,entity_id,details_json) VALUES (?,?, 'owner','task_run_completed','brain_task',?,?)")
            .bind(uid(),user.id,id,JSON.stringify({provider:result.provider})).run();
          return json({ok:true,id,status:"completed",provider:result.provider,output:result.answer});
        } catch(error) {
          await env.DB.prepare("UPDATE brain_tasks SET status='failed',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
          await env.DB.prepare("UPDATE brain_agent_runs SET status='failed',error_code=?,finished_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(error instanceof Error?error.message.slice(0,300):"ai_error",runId).run();
          return fail(error instanceof Error?error.message:"تعذر تشغيل الوكيل الذكي.",503);
        }
      }
      if (path === "brain/approvals" && method === "GET") {
        const rows=await env.DB.prepare("SELECT id,task_id,action_type,destination,payload_json,status,requested_at,expires_at FROM brain_approvals ORDER BY requested_at DESC LIMIT 100").all();
        return json({approvals:rows.results||[]});
      }
      if (path === "brain/approvals" && method === "POST") {
        const data=await body(request);
        const allowed=["publish_post","send_reply","send_message","change_price","change_stock","delete_content","launch_ad","other"];
        if(!requireFields(data,["task_id","action_type","payload_json"])||!allowed.includes(data.action_type)) return fail("بيانات الموافقة غير مكتملة.");
        const task=await env.DB.prepare("SELECT id FROM brain_tasks WHERE id=?").bind(data.task_id).first();
        if(!task) return fail("المهمة غير موجودة.",404);
        const payload=typeof data.payload_json==="string"?data.payload_json:JSON.stringify(data.payload_json);
        const id=uid(), hash=await digest(payload);
        await env.DB.prepare("INSERT INTO brain_approvals (id,task_id,action_type,destination,payload_json,payload_sha256,expires_at) VALUES (?,?,?,?,?,?,?)")
          .bind(id,data.task_id,data.action_type,String(data.destination||"").slice(0,300),payload,hash,new Date(Date.now()+7*86400000).toISOString()).run();
        await env.DB.prepare("UPDATE brain_tasks SET status='needs_approval',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(data.task_id).run();
        return json({ok:true,id,status:"pending"},201);
      }
      if (path.startsWith("brain/approvals/") && method === "PATCH") {
        const id=path.slice("brain/approvals/".length), data=await body(request);
        if(!["approved","rejected"].includes(data?.status)) return fail("قرار الموافقة غير صالح.");
        const row=await env.DB.prepare("SELECT task_id,status FROM brain_approvals WHERE id=?").bind(id).first();
        if(!row||row.status!=="pending") return fail("طلب الموافقة غير موجود أو تمت مراجعته.",404);
        await env.DB.prepare("UPDATE brain_approvals SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'")
          .bind(data.status,user.id,id).run();
        await env.DB.prepare("UPDATE brain_tasks SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(data.status==="approved"?"approved":"rejected",row.task_id).run();
        await env.DB.prepare("INSERT INTO brain_audit_events (id,actor_user_id,actor_type,event_type,entity_type,entity_id,details_json) VALUES (?,?, 'owner',?,?,?,?)")
          .bind(uid(),user.id,"approval_"+data.status,"brain_approval",id,"{}").run();
        return json({ok:true,status:data.status,execution:"not_configured"});
      }
      if (path === "brain/drafts" && method === "GET") {
        const rows=await env.DB.prepare("SELECT id,task_id,platform,title,body,media_reference,rights_status,status,scheduled_at,created_at FROM brain_content_drafts ORDER BY created_at DESC LIMIT 100").all();
        return json({drafts:rows.results||[]});
      }
      if (path === "brain/drafts" && method === "POST") {
        const data=await body(request);
        if(!requireFields(data,["platform","body"])) return fail("المنصة ونص المسودة مطلوبان.");
        const rights=["original","licensed","permission_granted","reference_only","unknown"];
        const rightsStatus=rights.includes(data.rights_status)?data.rights_status:"original";
        const id=uid();
        await env.DB.prepare("INSERT INTO brain_content_drafts (id,task_id,platform,title,body,media_reference,rights_status,created_by) VALUES (?,?,?,?,?,?,?,?)")
          .bind(id,data.task_id||null,String(data.platform).slice(0,40),String(data.title||"").slice(0,180),String(data.body).slice(0,5000),String(data.media_reference||"").slice(0,1000),rightsStatus,user.id).run();
        return json({ok:true,id,status:"draft"},201);
      }
      if (path === "brain/social" && method === "GET") {
        const rows=await env.DB.prepare("SELECT platform,account_label,status,granted_scopes,last_checked_at FROM brain_social_connections ORDER BY platform").all();
        return json({connections:rows.results||[]});
      }
    }

    if (path === "ai/status" && method === "GET") {
      return json({ configured: !!env.AI || !!env.ANTHROPIC_API_KEY, provider: env.AI_PROVIDER || "auto" });
    }

    if (path === "ai/chat" && method === "POST") {
      const data = await body(request);
      if (!data || typeof data.message !== "string" || !data.message.trim()) return fail("اكتب سؤالك أولاً.");
      if (data.message.length > 2000) return fail("الرسالة طويلة جداً؛ الحد الأقصى 2000 حرف.");
      try {
        const result = await runAI(env, user, data.message.trim());
        return json({ ok: true, answer: result.answer, provider: result.provider });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "تعذر تشغيل المساعد الذكي.", 503);
      }
    }

    if (path === "seller/products" && method === "POST") {
      if (user.role !== "seller") return fail("هذه الخدمة للبائعين فقط.", 403);
      const data = await body(request);
      if (!requireFields(data, ["name", "category"]) || !Number.isInteger(data.price_dzd) || data.price_dzd < 0 || !Number.isInteger(data.stock) || data.stock < 0)
        return fail("تحقق من اسم المنتج والتصنيف والسعر والمخزون.");
      const id = uid();
      await env.DB.prepare("INSERT INTO products (id,seller_id,name,description,category,price_dzd,stock,image_url,status) VALUES (?,?,?,?,?,?,?,?, 'pending')")
        .bind(id,user.id,data.name.trim().slice(0,160),String(data.description||"").slice(0,3000),data.category.trim().slice(0,80),data.price_dzd,data.stock,String(data.image_url||"").slice(0,1000)).run();
      return json({ ok:true,id,message:"أُرسل المنتج للمراجعة قبل النشر." },201);
    }

    if (path === "orders" && method === "POST") {
      if (user.role !== "customer") return fail("إنشاء الطلبات متاح لحساب العميل فقط.",403);
      const data = await body(request);
      if (!requireFields(data, ["customer_name","phone","wilaya","address"]) || !Array.isArray(data.items) || data.items.length < 1 || data.items.length > 30)
        return fail("بيانات الطلب غير مكتملة.");
      const ids = [...new Set(data.items.map(x => x && x.product_id).filter(x => typeof x === "string"))];
      if (ids.length !== data.items.length) return fail("قائمة المنتجات غير صالحة.");
      const placeholders = ids.map(() => "?").join(",");
      const found = await env.DB.prepare(`SELECT id,name,price_dzd,stock,seller_id FROM products WHERE status='active' AND id IN (${placeholders})`).bind(...ids).all();
      const byId = new Map((found.results||[]).map(x => [x.id,x]));
      let total = 0; const lines = [];
      for (const item of data.items) {
        const p = byId.get(item.product_id);
        if (!p || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20 || p.stock < item.quantity) return fail("أحد المنتجات غير متاح بالكمية المطلوبة.",409);
        total += p.price_dzd * item.quantity;
        if (!Number.isSafeInteger(total) || total > 1000000000) return fail("إجمالي الطلب غير صالح.");
        lines.push({p,qty:item.quantity});
      }
      const orderId = uid();
      const statements = [
        env.DB.prepare("INSERT INTO orders (id,customer_id,customer_name,phone,wilaya,address,payment_method,status,total_dzd) VALUES (?,?,?,?,?,?,'cod_demo','pending',?)")
          .bind(orderId,user.id,data.customer_name.trim().slice(0,100),data.phone.trim().slice(0,30),data.wilaya.trim().slice(0,100),data.address.trim().slice(0,500),total),
        ...lines.map(({p,qty}) => env.DB.prepare("INSERT INTO order_items (id,order_id,product_id,seller_id,product_name,unit_price_dzd,quantity) VALUES (?,?,?,?,?,?,?)")
          .bind(uid(),orderId,p.id,p.seller_id,p.name,p.price_dzd,qty)),
      ];
      await env.DB.batch(statements);
      return json({ ok:true,order_id:orderId,total_dzd:total,payment_method:"cod_demo",message:"طلب تجريبي مسجل؛ لا يوجد تحصيل مالي." },201);
    }

    if (path === "seller/orders" && method === "GET") {
      if (user.role !== "seller") return fail("هذه الخدمة للبائعين فقط.",403);
      const rows = await env.DB.prepare("SELECT o.id,o.status,o.total_dzd,o.created_at,oi.product_name,oi.quantity FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.seller_id=? ORDER BY o.created_at DESC LIMIT 100").bind(user.id).all();
      return json({ orders: rows.results || [] });
    }

    if (path === "customer/orders" && method === "GET") {
      if (user.role !== "customer") return fail("هذه الخدمة للعملاء فقط.",403);
      const rows = await env.DB.prepare("SELECT id,status,total_dzd,wilaya,created_at FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all();
      return json({ orders: rows.results || [] });
    }

    if (path === "admin/orders" && method === "GET") {
      if (user.role !== "owner") return fail("هذه الخدمة للمالك فقط.",403);
      const rows = await env.DB.prepare("SELECT id,customer_name,phone,wilaya,address,status,total_dzd,created_at FROM orders ORDER BY created_at DESC LIMIT 300").all();
      return json({ orders: rows.results || [] });
    }

    if (path.startsWith("admin/orders/") && method === "PATCH") {
      if (user.role !== "owner") return fail("هذه الخدمة للمالك فقط.",403);
      const id = path.slice("admin/orders/".length);
      const data = await body(request);
      if (!["pending","confirmed","shipped","delivered","cancelled"].includes(data?.status)) return fail("حالة الطلب غير صالحة.");
      await env.DB.prepare("UPDATE orders SET status=? WHERE id=?").bind(data.status,id).run();
      return json({ ok:true });
    }

    if (path === "admin/overview" && method === "GET") {
      if (user.role !== "owner") return fail("هذه الخدمة للمالك فقط.",403);
      const [users, sellers, products, orders] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) AS n FROM users").first(),
        env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role='seller'").first(),
        env.DB.prepare("SELECT COUNT(*) AS n FROM products").first(),
        env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first()
      ]);
      return json({ users:users.n,sellers:sellers.n,products:products.n,orders:orders.n });
    }

    if (path === "admin/sellers" && method === "GET") {
      if (user.role !== "owner") return fail("هذه الخدمة للمالك فقط.",403);
      const rows = await env.DB.prepare("SELECT id,name,email,status,created_at FROM users WHERE role='seller' ORDER BY created_at DESC LIMIT 200").all();
      return json({ sellers:rows.results||[] });
    }

    if (path.startsWith("admin/sellers/") && method === "PATCH") {
      if (user.role !== "owner") return fail("هذه الخدمة للمالك فقط.",403);
      const id = path.slice("admin/sellers/".length);
      const data = await body(request);
      if (!["active","pending","suspended"].includes(data?.status)) return fail("الحالة غير صالحة.");
      await env.DB.prepare("UPDATE users SET status=? WHERE id=? AND role='seller'").bind(data.status,id).run();
      return json({ ok:true });
    }

    if (path === "admin/products" && method === "GET") {
      if (user.role !== "owner") return fail("هذه الخدمة للمالك فقط.",403);
      const rows = await env.DB.prepare("SELECT p.*,u.name AS seller_name FROM products p JOIN users u ON u.id=p.seller_id ORDER BY p.created_at DESC LIMIT 200").all();
      return json({ products:rows.results||[] });
    }

    if (path.startsWith("admin/products/") && method === "PATCH") {
      if (user.role !== "owner") return fail("هذه الخدمة للمالك فقط.",403);
      const id = path.slice("admin/products/".length);
      const data = await body(request);
      if (!["active","pending","rejected"].includes(data?.status)) return fail("الحالة غير صالحة.");
      await env.DB.prepare("UPDATE products SET status=? WHERE id=?").bind(data.status,id).run();
      return json({ ok:true });
    }

    return fail("المسار غير موجود.",404);
  } catch (error) {
    return json({ error: "حدث خطأ داخلي. راجع سجلات Cloudflare." },500);
  }
}
