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

async function runAI(env, user, prompt) {
  const provider = String(env.AI_PROVIDER || "auto").toLowerCase();
  const system = "أنت مساعد Store Market، سوق إلكتروني جزائري. أجب بلغة المستخدم (العربية أو الفرنسية)، بوضوح واختصار. ساعد في التسوق، فهم المنتجات، البيع وخدمة العملاء. لا تدّعِ توفر منتج أو سعر أو شحن أو دفع غير مثبت في البيانات. لا تطلب كلمات المرور أو رموز التحقق أو بيانات البطاقات. لا تنفذ أي شراء أو نشر أو تغيير سعر أو إجراء إداري؛ أنت تقدم معلومات واقتراحات فقط، وأي إجراء حساس يحتاج موافقة المالك. إذا لم تعرف معلومة فقل ذلك بوضوح.";
  const roleContext = user.role === "owner" ? "المستخدم هو مالك المنصة." : user.role === "seller" ? "المستخدم بائع." : "المستخدم عميل.";
  if ((provider === "auto" || provider === "cloudflare") && env.AI) {
    const result = await env.AI.run(env.CF_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [
        { role: "system", content: system + " " + roleContext },
        { role: "user", content: prompt }
      ],
      max_tokens: 500
    });
    const answer = typeof result?.response === "string" ? result.response
      : typeof result?.result?.response === "string" ? result.result.response
      : typeof result?.output_text === "string" ? result.output_text : "";
    if (!answer) throw new Error("تعذر قراءة استجابة محرك Cloudflare AI.");
    return { answer, provider: "cloudflare" };
  }
  if ((provider === "auto" || provider === "anthropic" || provider === "claude") && env.ANTHROPIC_API_KEY) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: 500,
        system: system + " " + roleContext,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("تعذر الاتصال بمحرك Claude AI (" + response.status + ").");
    const answer = Array.isArray(data.content) ? data.content.filter(x => x.type === "text").map(x => x.text).join("\n") : "";
    if (!answer) throw new Error("لم يرجع Claude AI إجابة نصية.");
    return { answer, provider: "claude" };
  }
  throw new Error("لم يتم إعداد محرك ذكاء اصطناعي. أضف ربط Workers AI أو مفتاح Claude في Cloudflare.");
}

export async function onRequest({ request, env }) {
  if (!env.DB) return fail("قاعدة البيانات غير مربوطة بعد. راجع إعداد Cloudflare D1.", 503);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  const method = request.method.toUpperCase();

  try {
    if (path === "health" && method === "GET") {
      await env.DB.prepare("SELECT 1").first();
      return json({ ok: true, service: "Store Market API", database: "connected" });
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
