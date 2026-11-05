/**
 * Runs every migration in an in-memory Postgres (PGlite) and exercises the order,
 * kitchen, QR, staff, payroll, discount and payment flows end to end.
 * Usage: pnpm db:smoke
 */
import { createDatabase, actAs } from "./harness.mjs";

const db = await createDatabase();
let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) passed += 1;
  else failures.push(`${name} ${detail}`);
}

async function rpc(name, args) {
  const keys = Object.keys(args);
  const isIdList = (key) => Array.isArray(args[key]) && key.endsWith("_ids");
  const values = keys.map((key) => {
    const value = args[key];
    if (isIdList(key)) return `{${value.join(",")}}`;
    return value !== null && typeof value === "object" ? JSON.stringify(value) : value;
  });
  const typed = keys.map((key, index) => {
    if (isIdList(key)) return `$${index + 1}::uuid[]`;
    return typeof args[key] === "object" && args[key] !== null ? `$${index + 1}::jsonb` : `$${index + 1}`;
  });
  const sql = `select public.${name}(${keys.map((key, index) => `${key} => ${typed[index]}`).join(", ")}) as result`;
  const result = await db.query(sql, values);
  return result.rows[0].result;
}

async function expectError(name, args, fragment, label) {
  try {
    await rpc(name, args);
    failures.push(`${label}: expected error "${fragment}" but call succeeded`);
  } catch (error) {
    if (String(error.message).includes(fragment)) passed += 1;
    else failures.push(`${label}: expected "${fragment}" got "${error.message}"`);
  }
}

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (sql, params = []) => (await db.query(sql, params)).rows;
const key = () => crypto.randomUUID();

// --- users ----------------------------------------------------------------
const OWNER = "10000000-0000-4000-8000-000000000001";
const WAITER = "10000000-0000-4000-8000-000000000002";
const MANAGER = "10000000-0000-4000-8000-000000000003";
const CASHIER = "10000000-0000-4000-8000-000000000004";
for (const [id, name] of [[OWNER, "Ayşe Sahip"], [WAITER, "Ece Garson"], [MANAGER, "Mert Müdür"], [CASHIER, "Kemal Kasa"]]) {
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, `${id}@t.test`, JSON.stringify({ full_name: name })]);
  await db.query("insert into public.profiles (id, full_name) values ($1, $2) on conflict do nothing", [id, name]);
}

await actAs(db, OWNER);
await rpc("create_my_tenant", { target_name: "Test Lokanta", target_branch_name: "Merkez" });
const tenant = (await one("select id from public.tenants limit 1")).id;
const branch = (await one("select id from public.branches where tenant_id = $1", [tenant])).id;
const roleId = async (code) => (await one("select id from public.roles where tenant_id = $1 and code = $2", [tenant, code])).id;

async function addMember(userId, roleCode) {
  const membership = await one(
    "insert into public.tenant_memberships (tenant_id, user_id, status) values ($1, $2, 'active') returning id",
    [tenant, userId],
  );
  await db.query("insert into public.membership_roles (tenant_id, membership_id, role_id) values ($1, $2, $3)", [tenant, membership.id, await roleId(roleCode)]);
  await db.query("insert into public.membership_branches (tenant_id, membership_id, branch_id) values ($1, $2, $3)", [tenant, membership.id, branch]);
  return membership.id;
}
const ownerMembership = (await one("select id from public.tenant_memberships where user_id = $1", [OWNER])).id;
const waiterMembership = await addMember(WAITER, "waiter");
await addMember(MANAGER, "manager");
await addMember(CASHIER, "cashier");
check("staff card auto-created for new members", (await one("select count(*)::int n from public.staff_profiles where tenant_id = $1", [tenant])).n === 4);

// --- catalogue --------------------------------------------------------------
const station = (await one("select id from public.kitchen_stations where tenant_id = $1 and branch_id = $2", [tenant, branch])).id;
const foodCat = (await one("insert into public.menu_categories (tenant_id, branch_id, name) values ($1,$2,'Yemek') returning id", [tenant, branch])).id;
const drinkCat = (await one("insert into public.menu_categories (tenant_id, branch_id, name, fulfillment) values ($1,$2,'Soğuk İçecek','direct') returning id", [tenant, branch])).id;
const kebab = (await one("insert into public.products (tenant_id, branch_id, category_id, name, price_minor, tax_rate) values ($1,$2,$3,'Kebap',36550,10) returning id", [tenant, branch, foodCat])).id;
const cola = (await one("insert into public.products (tenant_id, branch_id, category_id, name, price_minor, tax_rate) values ($1,$2,$3,'Kola',4000,20) returning id", [tenant, branch, drinkCat])).id;
check("direct product gets no station", (await one("select kitchen_station_id from public.products where id = $1", [cola])).kitchen_station_id === null);
check("kitchen product gets default station", (await one("select kitchen_station_id from public.products where id = $1", [kebab])).kitchen_station_id === station);
const area = (await one("insert into public.dining_areas (tenant_id, branch_id, name) values ($1,$2,'Salon') returning id", [tenant, branch])).id;
const table = async (label) => (await one("insert into public.restaurant_tables (tenant_id, branch_id, area_id, label) values ($1,$2,$3,$4) returning id", [tenant, branch, area, label])).id;
const t1 = await table("Masa 1");
const t2 = await table("Masa 2");
const t3 = await table("Masa 3");

// --- fulfillment (phase B) --------------------------------------------------
await actAs(db, WAITER);
const open1 = await rpc("open_order", { target_tenant_id: tenant, target_branch_id: branch, target_table_id: t1, target_guest_count: 2, target_items: [{ productId: kebab, quantity: 2 }, { productId: cola, quantity: 2 }], target_idempotency_key: key() });
const submit1 = await rpc("submit_order", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open1.orderId, target_expected_version: open1.version, target_idempotency_key: key() });
check("mixed order creates exactly one kitchen ticket", submit1.ticketCount === 1, JSON.stringify(submit1));
const ticketItems = await all("select oi.product_name from public.kitchen_ticket_items ti join public.order_items oi on oi.id = ti.order_item_id where ti.tenant_id = $1", [tenant]);
check("kitchen ticket holds only the food", ticketItems.length === 1 && ticketItems[0].product_name === "Kebap", JSON.stringify(ticketItems));
check("mixed order waits for the kitchen", submit1.status === "submitted");

const open2 = await rpc("open_order", { target_tenant_id: tenant, target_branch_id: branch, target_table_id: t2, target_guest_count: 1, target_items: [{ productId: cola, quantity: 3 }], target_idempotency_key: key() });
const submit2 = await rpc("submit_order", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open2.orderId, target_expected_version: open2.version, target_idempotency_key: key() });
check("direct-only order creates no ticket", submit2.ticketCount === 0, JSON.stringify(submit2));
check("direct-only order is served at once", submit2.status === "served", JSON.stringify(submit2));
check("direct items count as sent", (await one("select bool_and(sent_quantity = quantity) ok from public.order_items where order_id = $1", [open2.orderId])).ok === true);

// --- QR ordering ------------------------------------------------------------
await actAs(db, OWNER);
const t3Token = (await one("select qr_token from public.restaurant_tables where id = $1", [t3])).qr_token;
await rpc("set_branch_qr_settings", { target_tenant_id: tenant, target_branch_id: branch, target_ordering_enabled: true });
const publicMenu = await rpc("get_public_menu", { target_token: t3Token });
const colaMenu = publicMenu.categories.flatMap((c) => c.products).find((p) => p.name === "Kola");
check("QR menu lists direct product as orderable", colaMenu?.orderable === true);
const qr = await rpc("place_customer_order", { target_token: t3Token, target_items: [{ productId: cola, quantity: 1 }], target_idempotency_key: key() });
check("QR direct-only order has no ticket", qr.ticketCount === 0, JSON.stringify(qr));
const qrOrder = await one("select status, source from public.orders where table_id = $1", [t3]);
check("QR direct-only order is served", qrOrder.status === "served" && qrOrder.source === "qr", JSON.stringify(qrOrder));
check("QR lines are marked as customer lines", (await one("select bool_and(oi.source = 'qr') ok from public.order_items oi join public.orders o on o.id = oi.order_id where o.table_id = $1", [t3])).ok === true);

// --- staff, shifts, attendance, payroll (phases D/E) ------------------------
await actAs(db, MANAGER);
const today = (await one("select (now() at time zone 'Europe/Istanbul')::date::text d")).d;
const addDays = async (days) => (await one("select ($1::date + $2::int)::text d", [today, days])).d;
const yesterday = await addDays(-1);
const tomorrow = await addDays(1);
const shiftArgs = (over = {}) => ({ target_tenant_id: tenant, target_branch_id: branch, target_shift_id: null, target_membership_id: waiterMembership, target_date: yesterday, target_kind: "work", target_start: "09:00", target_end: "17:00", target_notes: null, target_template_id: null, ...over });
const shift = await rpc("save_shift", shiftArgs());
check("manager can plan a shift", Boolean(shift.id));
await expectError("save_shift", shiftArgs({ target_start: "16:00", target_end: "20:00" }), "shift_overlap", "overlapping shift rejected");
await expectError("save_shift", shiftArgs({ target_kind: "leave", target_start: null, target_end: null }), "leave_conflicts_with_shift", "leave over a shift rejected");
const overnight = await rpc("save_shift", shiftArgs({ target_date: today, target_start: "22:00", target_end: "06:00" }));
check("overnight shift saved", Boolean(overnight.id));
await expectError("save_shift", shiftArgs({ target_date: tomorrow, target_start: "05:00", target_end: "07:00" }), "shift_overlap", "shift overlapping a previous-day overnight shift rejected");
const tomorrowShift = await rpc("save_shift", shiftArgs({ target_date: await addDays(2), target_start: "09:00", target_end: "10:00" }));
check("non-overlapping shift saved", Boolean(tomorrowShift.id));

const roster = await rpc("list_branch_staff", { target_tenant_id: tenant, target_branch_id: branch });
check("manager sees the branch roster", roster.length === 4);
check("manager does not see private staff fields", roster.every((p) => p.notes === null && p.emergencyName === null));

await expectError("approve_shift_attendance", { target_tenant_id: tenant, target_branch_id: branch, target_shift_id: shift.id, target_status: "worked", target_minutes: null, target_note: null }, "attendance_denied", "manager without attendance.manage cannot approve");
await expectError("set_staff_pay", { target_tenant_id: tenant, target_membership_id: waiterMembership, target_pay_type: "monthly", target_amount_minor: 3000000 }, "payroll_denied", "manager cannot set pay");

await actAs(db, WAITER);
await expectError("save_shift", shiftArgs({ target_date: await addDays(3) }), "shifts_manage_denied", "waiter cannot plan shifts");
check("waiter sees only own shifts through RLS-free query helper", (await all("select id from public.shifts where membership_id = $1", [waiterMembership])).length === 3);

await actAs(db, OWNER);
const approval = await rpc("approve_shift_attendance", { target_tenant_id: tenant, target_branch_id: branch, target_shift_id: shift.id, target_status: "worked", target_minutes: 450, target_note: "geç çıktı" });
check("owner approves worked minutes", approval.minutes === 450, JSON.stringify(approval));
await expectError("approve_shift_attendance", { target_tenant_id: tenant, target_branch_id: branch, target_shift_id: tomorrowShift.id, target_status: "worked", target_minutes: null, target_note: null }, "attendance_in_future", "future shift cannot be approved");
const bulk = await rpc("approve_attendance_as_planned", { target_tenant_id: tenant, target_branch_id: branch, range_start: yesterday, range_end: today });
check("bulk approval approves the finished overnight shift", bulk.approved === 1, JSON.stringify(bulk));
check("bulk approval computes overnight length", (await one("select approved_minutes from public.shift_attendance where shift_id = $1", [overnight.id])).approved_minutes === 480);
await rpc("set_staff_pay", { target_tenant_id: tenant, target_membership_id: waiterMembership, target_pay_type: "hourly", target_amount_minor: 15000 });
const bonus = await rpc("add_payroll_entry", { target_tenant_id: tenant, target_membership_id: waiterMembership, target_period: today, target_kind: "bonus", target_amount_minor: 50000, target_note: "isteğe bağlı" });
check("owner adds an optional bonus", Boolean(bonus.id));
check("audit log keeps amounts out", (await all("select metadata::text m from public.audit_logs where action like 'payroll.%'")).every((r) => !r.m.includes("50000") && !r.m.includes("15000")));
await expectError("update_tenant_member_access", { target_tenant_id: tenant, target_membership_id: ownerMembership, target_status: "active", target_branch_ids: [branch], target_role_ids: [await roleId("tenant_admin")] }, "cannot_change_own_roles", "nobody changes own roles");

// --- discounts (phase F) -----------------------------------------------------
await actAs(db, WAITER);
const o1 = await one("select version, total_minor, tax_minor from public.orders where id = $1", [open1.orderId]);
check("order without discount: total is gross", Number(o1.total_minor) === 2 * 36550 + 2 * 4000, JSON.stringify(o1));
await expectError("apply_order_discount", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open1.orderId, target_expected_version: o1.version, target_type: "percent", target_value: 1000, target_reason: "müşteri memnuniyeti" }, "discount_denied", "waiter cannot discount");

await actAs(db, MANAGER);
const d1 = await rpc("apply_order_discount", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open1.orderId, target_expected_version: Number(o1.version), target_type: "percent", target_value: 1000, target_reason: "müşteri memnuniyeti" });
const o2 = await one("select total_minor, tax_minor, subtotal_minor, discount_minor from public.orders where id = $1", [open1.orderId]);
const gross = 2 * 36550 + 2 * 4000; // 81100
check("10% order discount applied", Number(o2.discount_minor) === 8110 && Number(o2.total_minor) === gross - 8110, JSON.stringify(o2));
check("VAT is computed on the discounted amount (7181)", Number(o2.tax_minor) === 7181, JSON.stringify(o2));
check("subtotal + tax = total with a discount", Number(o2.subtotal_minor) + Number(o2.tax_minor) === Number(o2.total_minor), JSON.stringify(o2));
await expectError("apply_order_discount", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open1.orderId, target_expected_version: d1.version, target_type: "percent", target_value: 1000, target_reason: "x" }, "invalid_discount", "reason is required");
const kebabItem = (await one("select id from public.order_items where order_id = $1 and product_name = 'Kebap'", [open1.orderId])).id;
const d2 = await rpc("apply_item_discount", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open1.orderId, target_order_item_id: kebabItem, target_expected_version: d1.version, target_type: "percent", target_value: 5000, target_reason: "ikram yarım porsiyon" });
check("item discount halves the unit price", d2.unitPriceMinor === 18275, JSON.stringify(d2));
const item = await one("select list_unit_price_minor, unit_price_minor, line_total_minor from public.order_items where id = $1", [kebabItem]);
check("item keeps list price for reports", Number(item.list_unit_price_minor) === 36550 && Number(item.line_total_minor) === 36550, JSON.stringify(item));
const o3 = await one("select total_minor, discount_minor from public.orders where id = $1", [open1.orderId]);
check("order discount recomputes after the item discount", Number(o3.total_minor) + Number(o3.discount_minor) === 36550 + 8000, JSON.stringify(o3));
const v3 = (await one("select version from public.orders where id = $1", [open1.orderId])).version;
const d3 = await rpc("apply_order_discount", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open1.orderId, target_expected_version: v3, target_type: "none", target_value: null, target_reason: null });
const o4 = await one("select total_minor, discount_minor, discount_type from public.orders where id = $1", [open1.orderId]);
check("removing the order discount restores totals", Number(o4.discount_minor) === 0 && o4.discount_type === null && Number(o4.total_minor) === 36550 + 8000, JSON.stringify(o4));
const d4 = await rpc("apply_item_discount", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open1.orderId, target_order_item_id: kebabItem, target_expected_version: d3.version, target_type: "none", target_value: null, target_reason: null });
check("removing the item discount restores the price", d4.unitPriceMinor === 36550);

// --- payments with a discount -----------------------------------------------
await actAs(db, OWNER);
const register = (await one("select id from public.cash_registers where tenant_id = $1 and branch_id = $2", [tenant, branch])).id;
const cash = await rpc("open_cash_session", { target_tenant_id: tenant, target_branch_id: branch, target_cash_register_id: register, target_opening_minor: 0, target_idempotency_key: key() });
const cashSession = cash.sessionId || cash.id || cash.cashSessionId;
check("cash session opened", Boolean(cashSession), JSON.stringify(cash));

await actAs(db, MANAGER);
const v2 = Number((await one("select version from public.orders where id = $1", [open2.orderId])).version);
await rpc("apply_order_discount", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open2.orderId, target_expected_version: v2, target_type: "amount", target_value: 2000, target_reason: "sadakat indirimi" });
await actAs(db, OWNER);
const discounted = await one("select total_minor from public.orders where id = $1", [open2.orderId]);
check("amount discount reduces the total", Number(discounted.total_minor) === 3 * 4000 - 2000, JSON.stringify(discounted));
const colaItem = (await one("select id from public.order_items where order_id = $1", [open2.orderId])).id;
await expectError("record_order_payments", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open2.orderId, target_cash_session_id: cashSession, target_payments: [{ method: "cash", amountMinor: 4000, allocations: [{ orderItemId: colaItem, quantity: 1 }] }], target_idempotency_key: key() }, "allocation_not_allowed_with_discount", "item split blocked with a discount");
const paid = await rpc("record_order_payments", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open2.orderId, target_cash_session_id: cashSession, target_payments: [{ method: "cash", amountMinor: 10000 }], target_idempotency_key: key() });
check("paying the discounted total closes the order", paid.orderClosed === true, JSON.stringify(paid));

// --- sales report (phase F) --------------------------------------------------
const reportArgs = (over = {}) => ({ target_tenant_id: tenant, target_branch_id: branch, range_start: today, range_end: today, ...over });
await actAs(db, MANAGER);
const report = await rpc("sales_report", reportArgs());
check("report counts the closed order", report.summary.orderCount === 1, JSON.stringify(report.summary));
check("report separates gross, discount and net", report.summary.grossMinor === 12000 && report.summary.discountMinor === 2000 && report.summary.netMinor === 10000, JSON.stringify(report.summary));
check("report ignores merged adisyons in cancellations", report.summary.cancelledCount === 0, JSON.stringify(report.summary));
check("report lists payments by method", report.payments.cashMinor === 10000 && report.payments.cardMinor === 0, JSON.stringify(report.payments));
check("report ranks products", report.products[0].name === "Kola" && report.products[0].quantity === 3 && report.products[0].revenueMinor === 12000, JSON.stringify(report.products));
check("report groups by category and staff", report.categories[0].name === "Soğuk İçecek" && report.staff[0].name === "Ece Garson", JSON.stringify([report.categories, report.staff]));
check("report shows the open cash session", report.sessions.length === 1 && report.sessions[0].countedMinor === null, JSON.stringify(report.sessions));
check("report has a day and an hour bucket", report.byDay.length === 1 && report.byHour.length === 1);
await rpc("sales_report", reportArgs({ range_start: yesterday }));
check("manager may read past days", true);
await actAs(db, CASHIER);
await rpc("sales_report", reportArgs());
check("cashier may read today", true);
await expectError("sales_report", reportArgs({ range_start: yesterday }), "report_history_denied", "cashier cannot read past days");
await actAs(db, WAITER);
await expectError("sales_report", reportArgs(), "report_denied", "waiter has no reports");
await actAs(db, MANAGER);
await expectError("sales_report", reportArgs({ range_start: await addDays(-200) }), "invalid_report_range", "range is capped");

// --- waiter calls (phase F) --------------------------------------------------
const t2Token = (await one("select qr_token from public.restaurant_tables where id = $1", [t2])).qr_token;
await actAs(db, null);
const call1 = await rpc("call_waiter", { target_token: t2Token, target_kind: "waiter" });
check("customer can call the waiter without logging in", call1.status === "sent", JSON.stringify(call1));
check("a second call for the same need is not duplicated", (await rpc("call_waiter", { target_token: t2Token, target_kind: "waiter" })).status === "already_pending");
check("asking for the bill is a separate call", (await rpc("call_waiter", { target_token: t2Token, target_kind: "bill" })).status === "sent");
await expectError("call_waiter", { target_token: "0".repeat(64), target_kind: "waiter" }, "qr_not_found", "unknown QR code rejected");
await expectError("call_waiter", { target_token: t2Token, target_kind: "pizza" }, "invalid_call", "unknown call kind rejected");
await actAs(db, WAITER);
const pending = await all("select id from public.waiter_calls where acknowledged_at is null");
check("two calls are pending", pending.length === 2);
await rpc("acknowledge_waiter_call", { target_tenant_id: tenant, target_branch_id: branch, target_call_id: pending[0].id });
check("staff can acknowledge a call", (await all("select id from public.waiter_calls where acknowledged_at is null")).length === 1);
await actAs(db, "99999999-9999-4999-8999-999999999999");
await expectError("acknowledge_waiter_call", { target_tenant_id: tenant, target_branch_id: branch, target_call_id: pending[1].id }, "call_denied", "outsiders cannot acknowledge");
await actAs(db, null);
for (let i = 0; i < 4; i += 1) {
  await db.query("update public.waiter_calls set acknowledged_at = now() where acknowledged_at is null");
  await rpc("call_waiter", { target_token: t2Token, target_kind: "waiter" });
}
await db.query("update public.waiter_calls set acknowledged_at = now() where acknowledged_at is null");
await expectError("call_waiter", { target_token: t2Token, target_kind: "waiter" }, "call_rate_limited", "call spam is rate limited");

// --- sold out for today ----------------------------------------------------------
const t5 = await table("Masa 5");
const t5Token = (await one("select qr_token from public.restaurant_tables where id = $1", [t5])).qr_token;
await actAs(db, WAITER);
await expectError("set_product_availability", { target_tenant_id: tenant, target_branch_id: branch, target_product_id: cola, target_sold_out: true }, "availability_denied", "waiter cannot mark sold out");
await actAs(db, MANAGER);
await rpc("set_product_availability", { target_tenant_id: tenant, target_branch_id: branch, target_product_id: cola, target_sold_out: true });
await actAs(db, WAITER);
await expectError("open_order", { target_tenant_id: tenant, target_branch_id: branch, target_table_id: t5, target_guest_count: 1, target_items: [{ productId: cola, quantity: 1 }], target_idempotency_key: key() }, "product_sold_out", "sold out product cannot be ordered");
await actAs(db, null);
const soldOutMenu = await rpc("get_public_menu", { target_token: t5Token });
const soldOutCola = soldOutMenu.categories.flatMap((c) => c.products).find((p) => p.name === "Kola");
check("QR menu shows the product as sold out and not orderable", soldOutCola.soldOut === true && soldOutCola.orderable === false, JSON.stringify(soldOutCola));
await expectError("place_customer_order", { target_token: t5Token, target_items: [{ productId: cola, quantity: 1 }], target_idempotency_key: key() }, "product_sold_out", "customers cannot order a sold out product");
await db.query("update public.products set sold_out_on = (now() at time zone 'Europe/Istanbul')::date - 1 where id = $1", [cola]);
const nextDayMenu = await rpc("get_public_menu", { target_token: t5Token });
check("a sold out mark expires the next day", nextDayMenu.categories.flatMap((c) => c.products).find((p) => p.name === "Kola").orderable === true);

const orderVersion = async (id) => Number((await one("select version from public.orders where id = $1", [id])).version);
// --- product options ----------------------------------------------------------------
await actAs(db, OWNER);
const saveGroup = (over) => rpc("save_option_group", { target_tenant_id: tenant, target_branch_id: branch, target_group_id: null, target_name: "Porsiyon", target_kind: "variant", target_required: true, target_max_select: null, target_is_active: true, target_choices: [], target_product_ids: [kebab], ...over });
const portion = await saveGroup({ target_choices: [{ name: "Yarım", priceDeltaMinor: -10000 }, { name: "Tam", priceDeltaMinor: 0 }, { name: "Büyük", priceDeltaMinor: 8000 }] });
const extras = await saveGroup({ target_name: "Ekstralar", target_kind: "extra", target_required: false, target_max_select: 2, target_choices: [{ name: "Peynir", priceDeltaMinor: 1500 }, { name: "Sos", priceDeltaMinor: 1000 }, { name: "Mantar", priceDeltaMinor: 2000 }] });
const removals = await saveGroup({ target_name: "Çıkar", target_kind: "removal", target_required: false, target_choices: [{ name: "Soğan", priceDeltaMinor: 0 }, { name: "Turşu", priceDeltaMinor: 0 }] });
await expectError("save_option_group", { target_tenant_id: tenant, target_branch_id: branch, target_group_id: null, target_name: "Ücretli çıkar", target_kind: "removal", target_required: false, target_max_select: null, target_is_active: true, target_choices: [{ name: "Domates", priceDeltaMinor: 500 }], target_product_ids: [kebab] }, "removal_must_be_free", "a removal cannot cost money");
await expectError("save_option_group", { target_tenant_id: tenant, target_branch_id: branch, target_group_id: null, target_name: "Boş", target_kind: "extra", target_required: false, target_max_select: null, target_is_active: true, target_choices: [], target_product_ids: [] }, "invalid_option_group", "a group needs at least one choice");
await actAs(db, WAITER);
await expectError("save_option_group", { target_tenant_id: tenant, target_branch_id: branch, target_group_id: null, target_name: "Hile", target_kind: "extra", target_required: false, target_max_select: null, target_is_active: true, target_choices: [{ name: "X", priceDeltaMinor: 0 }], target_product_ids: [] }, "catalog_manage_denied", "waiters cannot edit options");

const choiceId = async (groupId, name) => (await one("select id from public.option_choices where group_id = $1 and name = $2", [groupId, name])).id;
const big = await choiceId(portion.id, "Büyük");
const half = await choiceId(portion.id, "Yarım");
const full = await choiceId(portion.id, "Tam");
const cheese = await choiceId(extras.id, "Peynir");
const sauce = await choiceId(extras.id, "Sos");
const mushroom = await choiceId(extras.id, "Mantar");
const onion = await choiceId(removals.id, "Soğan");
const t6 = await table("Masa 6");
const t7 = await table("Masa 7");
const openOn = (tableId, items) => rpc("open_order", { target_tenant_id: tenant, target_branch_id: branch, target_table_id: tableId, target_guest_count: 1, target_items: items, target_idempotency_key: key() });

await expectError("open_order", { target_tenant_id: tenant, target_branch_id: branch, target_table_id: t6, target_guest_count: 1, target_items: [{ productId: kebab, quantity: 1 }], target_idempotency_key: key() }, "option_required", "a required portion must be chosen");
await expectError("open_order", { target_tenant_id: tenant, target_branch_id: branch, target_table_id: t6, target_guest_count: 1, target_items: [{ productId: kebab, quantity: 1, options: [big, half] }], target_idempotency_key: key() }, "option_limit", "only one portion can be chosen");
await expectError("open_order", { target_tenant_id: tenant, target_branch_id: branch, target_table_id: t6, target_guest_count: 1, target_items: [{ productId: kebab, quantity: 1, options: [full, cheese, sauce, mushroom] }], target_idempotency_key: key() }, "option_limit", "extras are capped");
await expectError("open_order", { target_tenant_id: tenant, target_branch_id: branch, target_table_id: t6, target_guest_count: 1, target_items: [{ productId: cola, quantity: 1, options: [cheese] }], target_idempotency_key: key() }, "invalid_option", "options of another product are refused");
await expectError("open_order", { target_tenant_id: tenant, target_branch_id: branch, target_table_id: t6, target_guest_count: 1, target_items: [{ productId: kebab, quantity: 1, options: ["not-a-uuid"] }], target_idempotency_key: key() }, "invalid_option", "garbage option ids are refused");

const optionOrder = await openOn(t6, [{ productId: kebab, quantity: 2, options: [big, cheese, onion] }, { productId: kebab, quantity: 1, options: [half] }]);
const optionLines = await all("select id, quantity, unit_price_minor, line_total_minor from public.order_items where order_id = $1 order by unit_price_minor desc", [optionOrder.orderId]);
check("price = base + chosen price changes", Number(optionLines[0].unit_price_minor) === 36550 + 8000 + 1500 && Number(optionLines[1].unit_price_minor) === 36550 - 10000, JSON.stringify(optionLines));
check("line total uses the option price", Number(optionLines[0].line_total_minor) === 2 * 46050);
const copied = await all("select group_name, kind, choice_name, price_delta_minor from public.order_item_options where order_item_id = $1 order by kind", [optionLines[0].id]);
check("the chosen options are copied onto the line", copied.length === 3 && copied.some((row) => row.kind === "removal" && row.choice_name === "Soğan"), JSON.stringify(copied));

await actAs(db, OWNER);
await saveGroup({ target_group_id: extras.id, target_name: "Ekstralar", target_kind: "extra", target_required: false, target_max_select: 2, target_choices: [{ id: cheese, name: "Peynir", priceDeltaMinor: 2500 }, { id: sauce, name: "Sos", priceDeltaMinor: 1000 }] });
check("editing a group keeps the lines already ordered", Number((await one("select price_delta_minor from public.order_item_options where order_item_id = $1 and choice_name = 'Peynir'", [optionLines[0].id])).price_delta_minor) === 1500);
check("a choice left out is removed from the group", (await one("select count(*)::int n from public.option_choices where group_id = $1", [extras.id])).n === 2);

await actAs(db, MANAGER);
await rpc("set_option_choice_availability", { target_tenant_id: tenant, target_branch_id: branch, target_choice_id: sauce, target_sold_out: true });
await actAs(db, WAITER);
await expectError("append_order_items", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: optionOrder.orderId, target_expected_version: await orderVersion(optionOrder.orderId), target_items: [{ productId: kebab, quantity: 1, options: [full, sauce] }], target_idempotency_key: key() }, "option_sold_out", "a sold out extra cannot be chosen");

await actAs(db, MANAGER);
const optionVersion = await orderVersion(optionOrder.orderId);
const discountedOption = await rpc("apply_item_discount", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: optionOrder.orderId, target_order_item_id: optionLines[0].id, target_expected_version: optionVersion, target_type: "percent", target_value: 5000, target_reason: "ikram yarısı" });
check("an item discount starts from the option price", discountedOption.unitPriceMinor === 23025, JSON.stringify(discountedOption));

await actAs(db, null);
const optionMenu = await rpc("get_public_menu", { target_token: t5Token });
const kebabMenu = optionMenu.categories.flatMap((c) => c.products).find((p) => p.name === "Kebap");
check("the public menu lists the option groups", kebabMenu.optionGroups.length === 3 && kebabMenu.optionGroups[0].choices.length >= 2, JSON.stringify(kebabMenu.optionGroups.map((g) => g.name)));
const sauceInMenu = kebabMenu.optionGroups.flatMap((g) => g.choices).find((c) => c.name === "Sos");
check("the public menu marks a sold out choice", sauceInMenu.soldOut === true);
const t7Token = (await one("select qr_token from public.restaurant_tables where id = $1", [t7])).qr_token;
await expectError("place_customer_order", { target_token: t7Token, target_items: [{ productId: kebab, quantity: 1 }], target_idempotency_key: key() }, "option_required", "QR orders must choose the required portion");
const qrOption = await rpc("place_customer_order", { target_token: t7Token, target_items: [{ productId: kebab, quantity: 1, options: [full, cheese] }], target_idempotency_key: key() });
check("a guest can order with options", qrOption.ticketCount === 1, JSON.stringify(qrOption));
check("the kitchen ticket line keeps its options", (await one("select count(*)::int n from public.order_item_options o join public.order_items i on i.id = o.order_item_id join public.orders ord on ord.id = i.order_id where ord.table_id = $1", [t7])).n === 2);

// --- cancel or comp an item that was already sent ---------------------------------
await actAs(db, WAITER);
const t8 = await table("Masa 8");
const voidOrder = await openOn(t8, [{ productId: kebab, quantity: 3, options: [full] }, { productId: cola, quantity: 2 }]);
const voidSubmit = await rpc("submit_order", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: voidOrder.orderId, target_expected_version: voidOrder.version, target_idempotency_key: key() });
check("the order was sent to the kitchen", voidSubmit.ticketCount === 1);
const itemOf = async (orderId, name) => (await one("select id, quantity, sent_quantity, unit_price_minor from public.order_items where order_id = $1 and product_name = $2 order by unit_price_minor desc limit 1", [orderId, name]));
const voidArgs = (orderId, itemId, over = {}) => ({ target_tenant_id: tenant, target_branch_id: branch, target_order_id: orderId, target_order_item_id: itemId, target_expected_version: 0, target_quantity: 1, target_mode: "void", target_reason: "müşteri vazgeçti", ...over });
const kebabLine = await itemOf(voidOrder.orderId, "Kebap");
const ticketQuantity = async () => Number((await one("select coalesce(sum(quantity), 0)::int n from public.kitchen_ticket_items where order_item_id = $1", [kebabLine.id])).n);
check("the kitchen ticket holds all three kebabs", (await ticketQuantity()) === 3);

await expectError("void_order_item", voidArgs(voidOrder.orderId, kebabLine.id, { target_expected_version: await orderVersion(voidOrder.orderId), target_reason: "x" }), "invalid_void", "a reason is required");
await expectError("void_order_item", voidArgs(voidOrder.orderId, kebabLine.id, { target_expected_version: await orderVersion(voidOrder.orderId), target_quantity: 4 }), "void_exceeds_sent", "cannot take back more than was sent");
await expectError("void_order_item", voidArgs(voidOrder.orderId, kebabLine.id, { target_expected_version: 999 }), "order_version_conflict", "stale version rejected");
await actAs(db, CASHIER);
await expectError("void_order_item", voidArgs(voidOrder.orderId, kebabLine.id, { target_expected_version: await orderVersion(voidOrder.orderId) }), "void_denied", "the cashier cannot cancel items");
await actAs(db, WAITER);

const beforeTotal = Number((await one("select total_minor from public.orders where id = $1", [voidOrder.orderId])).total_minor);
await rpc("void_order_item", voidArgs(voidOrder.orderId, kebabLine.id, { target_expected_version: await orderVersion(voidOrder.orderId) }));
const afterVoid = await one("select total_minor from public.orders where id = $1", [voidOrder.orderId]);
check("voiding one kebab lowers the total by its price", beforeTotal - Number(afterVoid.total_minor) === 36550, JSON.stringify({ beforeTotal, afterVoid }));
check("the kitchen ticket now shows two kebabs", (await ticketQuantity()) === 2);
const voidRecord = await one("select mode, quantity, reason, amount_minor, actor_name, table_label from public.order_item_voids where order_id = $1", [voidOrder.orderId]);
check("the cancellation is recorded with who, where and why", voidRecord.mode === "void" && voidRecord.quantity === 1 && voidRecord.actor_name === "Ece Garson" && voidRecord.table_label === "Masa 8" && Number(voidRecord.amount_minor) === 36550, JSON.stringify(voidRecord));

const colaLine = await itemOf(voidOrder.orderId, "Kola");
await rpc("void_order_item", voidArgs(voidOrder.orderId, colaLine.id, { target_expected_version: await orderVersion(voidOrder.orderId), target_mode: "comp", target_reason: "müşteri şikayeti" }));
const colaRows = await all("select quantity, sent_quantity, unit_price_minor, list_unit_price_minor, line_total_minor from public.order_items where order_id = $1 and product_name = 'Kola' order by unit_price_minor desc", [voidOrder.orderId]);
check("comping one cola splits the line", colaRows.length === 2 && Number(colaRows[0].unit_price_minor) === 4000 && colaRows[0].quantity === 1 && Number(colaRows[1].unit_price_minor) === 0 && Number(colaRows[1].list_unit_price_minor) === 4000, JSON.stringify(colaRows));
const afterComp = await one("select total_minor from public.orders where id = $1", [voidOrder.orderId]);
check("a comp lowers the total by the list price", Number(afterVoid.total_minor) - Number(afterComp.total_minor) === 4000, JSON.stringify(afterComp));
await expectError("void_order_item", voidArgs(voidOrder.orderId, (await one("select id from public.order_items where order_id = $1 and unit_price_minor = 0", [voidOrder.orderId])).id, { target_expected_version: await orderVersion(voidOrder.orderId), target_mode: "comp" }), "already_free", "a free item cannot be comped again");

// everything taken back: the adisyon closes as cancelled and the ticket disappears from the kitchen
const remainingKebab = await itemOf(voidOrder.orderId, "Kebap");
await rpc("void_order_item", voidArgs(voidOrder.orderId, remainingKebab.id, { target_expected_version: await orderVersion(voidOrder.orderId), target_quantity: 2 }));
const soloOrder = await openOn(await table("Masa 9"), [{ productId: kebab, quantity: 1, options: [full] }]);
await rpc("submit_order", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: soloOrder.orderId, target_expected_version: soloOrder.version, target_idempotency_key: key() });
const soloLine = await itemOf(soloOrder.orderId, "Kebap");
const soloResult = await rpc("void_order_item", voidArgs(soloOrder.orderId, soloLine.id, { target_expected_version: await orderVersion(soloOrder.orderId) }));
check("voiding the last item cancels the adisyon", soloResult.orderCancelled === true && (await one("select status from public.orders where id = $1", [soloOrder.orderId])).status === "cancelled", JSON.stringify(soloResult));
check("its kitchen ticket is cancelled", (await one("select count(*)::int n from public.kitchen_tickets where order_id = $1 and status = 'cancelled'", [soloOrder.orderId])).n === 1);

// payments keep the adisyon honest
const t10 = await table("Masa 10");
const paidOrder = await openOn(t10, [{ productId: cola, quantity: 2 }]);
await rpc("submit_order", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: paidOrder.orderId, target_expected_version: paidOrder.version, target_idempotency_key: key() });
const paidLine = await itemOf(paidOrder.orderId, "Kola");
await actAs(db, OWNER);
await rpc("record_order_payments", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: paidOrder.orderId, target_cash_session_id: cashSession, target_payments: [{ method: "cash", amountMinor: 4000, allocations: [{ orderItemId: paidLine.id, quantity: 1 }] }], target_idempotency_key: key() });
await actAs(db, WAITER);
await expectError("void_order_item", voidArgs(paidOrder.orderId, paidLine.id, { target_expected_version: await orderVersion(paidOrder.orderId), target_quantity: 2 }), "void_item_paid", "a paid unit cannot be taken back");
await rpc("void_order_item", voidArgs(paidOrder.orderId, paidLine.id, { target_expected_version: await orderVersion(paidOrder.orderId), target_quantity: 1 }));
check("the unpaid unit could be taken back", (await one("select total_minor from public.orders where id = $1", [paidOrder.orderId])).total_minor == 4000);

const t11 = await table("Masa 11");
const partialOrder = await openOn(t11, [{ productId: cola, quantity: 2 }]);
await rpc("submit_order", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: partialOrder.orderId, target_expected_version: partialOrder.version, target_idempotency_key: key() });
await actAs(db, OWNER);
await rpc("record_order_payments", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: partialOrder.orderId, target_cash_session_id: cashSession, target_payments: [{ method: "card", amountMinor: 6000 }], target_idempotency_key: key() });
await actAs(db, WAITER);
await expectError("void_order_item", voidArgs(partialOrder.orderId, (await itemOf(partialOrder.orderId, "Kola")).id, { target_expected_version: await orderVersion(partialOrder.orderId) }), "void_below_paid", "the total may not fall below what was collected");
check("the failed void left no record behind", (await one("select count(*)::int n from public.order_item_voids where order_id = $1", [partialOrder.orderId])).n === 0);

// managers see the numbers in the report
await actAs(db, MANAGER);
const voidReport = await rpc("sales_report", reportArgs());
check("the report counts cancellations and comps", voidReport.summary.voidCount >= 5 && voidReport.summary.compMinor === 4000 && voidReport.summary.voidMinor > 0, JSON.stringify(voidReport.summary));

// --- table operations (phase F) ---------------------------------------------
await actAs(db, WAITER);
const t4 = await table("Masa 4");
await expectError("move_order_to_table", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open1.orderId, target_expected_version: await orderVersion(open1.orderId), target_table_id: t3 }, "table_has_active_order", "cannot move onto an occupied table");
await expectError("move_order_to_table", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open1.orderId, target_expected_version: await orderVersion(open1.orderId), target_table_id: t1 }, "same_table", "cannot move to the same table");
await expectError("move_order_to_table", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open1.orderId, target_expected_version: 999, target_table_id: t4 }, "order_version_conflict", "stale version rejected");
const moved = await rpc("move_order_to_table", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open1.orderId, target_expected_version: await orderVersion(open1.orderId), target_table_id: t4 });
check("order moved to a free table", (await one("select table_id from public.orders where id = $1", [open1.orderId])).table_id === t4 && moved.version > 0);

const qrOrderId = (await one("select id from public.orders where table_id = $1", [t3])).id;
const mergeResult = await rpc("merge_orders", { target_tenant_id: tenant, target_branch_id: branch, target_source_order_id: qrOrderId, target_source_version: await orderVersion(qrOrderId), target_destination_order_id: open1.orderId, target_destination_version: await orderVersion(open1.orderId) });
check("merge moves the items", mergeResult.movedItems === 1, JSON.stringify(mergeResult));
check("merged source is cancelled and empty", (await one("select status, total_minor from public.orders where id = $1", [qrOrderId])).status === "cancelled");
const mergedTotals = await one("select total_minor from public.orders where id = $1", [open1.orderId]);
check("destination total includes the merged items", Number(mergedTotals.total_minor) === 2 * 36550 + 2 * 4000 + 4000, JSON.stringify(mergedTotals));
check("merged customer line keeps its QR mark", (await one("select count(*)::int n from public.order_items where order_id = $1 and source = 'qr'", [open1.orderId])).n === 1);
check("the freed table can take a new order", (await one("select count(*)::int n from public.orders where table_id = $1 and status not in ('closed','cancelled')", [t3])).n === 0);
await expectError("merge_orders", { target_tenant_id: tenant, target_branch_id: branch, target_source_order_id: open1.orderId, target_source_version: await orderVersion(open1.orderId), target_destination_order_id: open1.orderId, target_destination_version: await orderVersion(open1.orderId) }, "same_order", "cannot merge an order into itself");

// --- audit log access (phase F) ----------------------------------------------
async function auditRowsAs(userId) {
  await actAs(db, userId);
  await db.exec("set role authenticated");
  try {
    return (await one("select count(*)::int n from public.audit_logs")).n;
  } finally {
    await db.exec("reset role");
  }
}
check("company owner reads the audit trail", (await auditRowsAs(OWNER)) > 0);
check("cashier cannot read the audit trail", (await auditRowsAs(CASHIER)) === 0);
check("waiter cannot read the audit trail", (await auditRowsAs(WAITER)) === 0);
check("manager without settings access cannot read the audit trail", (await auditRowsAs(MANAGER)) === 0);

// --- every helper used by an RLS policy must be callable by signed-in users ----
const policyText = (await all("select coalesce(qual, '') || ' ' || coalesce(with_check, '') as t from pg_policies where schemaname = 'public'")).map((row) => row.t).join(" ");
const helpers = [...new Set([...policyText.matchAll(/private\.([a-z_]+)\(/g)].map((match) => match[1]))];
check("policies reference private helpers", helpers.length > 5, String(helpers.length));
for (const helper of helpers) {
  const row = await one("select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) as ok from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = $1", [helper]);
  check("authenticated may execute private." + helper, row.ok === true);
}

// --- row level security on sensitive tables -------------------------------------
async function countAs(userId, table) {
  await actAs(db, userId);
  await db.exec("set role authenticated");
  try {
    return (await one("select count(*)::int n from public." + table)).n;
  } finally {
    await db.exec("reset role");
  }
}
check("owner sees pay records", (await countAs(OWNER, "staff_pay")) === 1);
check("the person sees their own pay", (await countAs(WAITER, "staff_pay")) === 1);
check("manager without payroll access sees no pay", (await countAs(MANAGER, "staff_pay")) === 0);
check("cashier sees no pay", (await countAs(CASHIER, "staff_pay")) === 0);
check("owner sees bonus lines", (await countAs(OWNER, "payroll_entries")) === 1);
check("manager without payroll access sees no bonus lines", (await countAs(MANAGER, "payroll_entries")) === 0);
check("the person sees their own bonus line", (await countAs(WAITER, "payroll_entries")) === 1);
check("waiter sees only their own shifts", (await countAs(WAITER, "shifts")) === 3);
check("cashier sees no shifts", (await countAs(CASHIER, "shifts")) === 0);
check("manager plans with sight of all shifts", (await countAs(MANAGER, "shifts")) === 3);
check("manager without attendance access sees no attendance rows", (await countAs(MANAGER, "shift_attendance")) === 0);
check("owner sees attendance rows", (await countAs(OWNER, "shift_attendance")) >= 1);
check("waiter sees their own attendance rows", (await countAs(WAITER, "shift_attendance")) >= 1);
check("cashier sees no attendance rows", (await countAs(CASHIER, "shift_attendance")) === 0);
check("a planning manager reads the staff cards of the branch", (await countAs(MANAGER, "staff_profiles")) === 4);
check("the cashier reads only their own staff card", (await countAs(CASHIER, "staff_profiles")) === 1);
check("only company admins read private staff notes", (await countAs(MANAGER, "staff_private")) === 0);

// --- plan limits, kitchen stations, themes, 7 day trial ------------------------------
await actAs(db, OWNER);
const trial = await one("select plan_code, status, ends_at - starts_at as span, user_limit, branch_limit, table_limit, station_limit from public.subscriptions where tenant_id = $1", [tenant]);
check("the self-service trial lasts 7 days", String(trial.span).startsWith("7 days"), JSON.stringify(trial));
check("the trial starts with small plan limits", trial.table_limit === 15 && trial.station_limit === 3 && trial.user_limit === 5 && trial.branch_limit === 1, JSON.stringify(trial));

const usage = await rpc("get_plan_usage", { target_tenant_id: tenant, target_branch_id: branch });
check("any member can read the plan usage", usage.tableLimit === 15 && usage.tablesUsed === 11 && usage.stationsUsed === 1 && usage.status === "trial", JSON.stringify(usage));
await actAs(db, "99999999-9999-4999-8999-999999999999");
await expectError("get_plan_usage", { target_tenant_id: tenant, target_branch_id: branch }, "plan_usage_denied", "outsiders cannot read the plan usage");
await actAs(db, OWNER);

// table limit: the 15th table works, the 16th is refused
for (let i = 12; i <= 15; i += 1) await table("Masa " + i);
let tableLimitHit = false;
try {
  await table("Masa 16");
} catch (error) {
  tableLimitHit = String(error.message).includes("table_limit_reached");
}
check("the table limit of the plan is enforced", tableLimitHit);
await db.query("insert into public.subscriptions (tenant_id, plan_code, status, starts_at, user_limit, branch_limit, table_limit, station_limit) values ($1, 'PRO', 'active', now(), 15, 1, null, null)", [tenant]);
await table("Masa 16");
check("an unlimited plan has no table limit", (await one("select count(*)::int n from public.restaurant_tables where tenant_id = $1", [tenant])).n === 16);
await db.query("insert into public.subscriptions (tenant_id, plan_code, status, starts_at, user_limit, branch_limit, table_limit, station_limit) values ($1, 'START', 'active', now(), 5, 1, 16, 1)", [tenant]);

// kitchen stations
const stationArgs = (over = {}) => ({ target_tenant_id: tenant, target_branch_id: branch, target_station_id: null, target_name: "Izgara", target_color: "#e8623a", target_is_active: true, target_product_ids: [], ...over });
await actAs(db, WAITER);
await expectError("save_kitchen_station", stationArgs(), "catalog_manage_denied", "waiters cannot manage stations");
await actAs(db, OWNER);
await expectError("save_kitchen_station", stationArgs(), "station_limit_reached", "a one-station plan cannot add a second station");
await db.query("insert into public.subscriptions (tenant_id, plan_code, status, starts_at, user_limit, branch_limit, table_limit, station_limit) values ($1, 'PRO', 'active', now(), 15, 1, null, null)", [tenant]);
const grill = await rpc("save_kitchen_station", stationArgs({ target_product_ids: [kebab] }));
check("a business can add a station and send products to it", (await one("select kitchen_station_id from public.products where id = $1", [kebab])).kitchen_station_id === grill.id);
const oven = await rpc("save_kitchen_station", stationArgs({ target_name: "Fırın", target_color: "#285e9f" }));
await expectError("save_kitchen_station", stationArgs({ target_name: "izgara" }), "station_name_taken", "station names are unique per branch");

// an order routes each product to its own station
await actAs(db, WAITER);
const t17 = await table("Masa 17");
const stationOrder = await openOn(t17, [{ productId: kebab, quantity: 1, options: [full] }]);
await rpc("submit_order", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: stationOrder.orderId, target_expected_version: stationOrder.version, target_idempotency_key: key() });
check("the ticket goes to the grill station", (await one("select kitchen_station_id from public.kitchen_tickets where order_id = $1", [stationOrder.orderId])).kitchen_station_id === grill.id);

// switching a station off moves its products to another one; the last one cannot be switched off
await actAs(db, OWNER);
await rpc("save_kitchen_station", stationArgs({ target_station_id: grill.id, target_is_active: false }));
check("products move off a station that is switched off", (await one("select kitchen_station_id from public.products where id = $1", [kebab])).kitchen_station_id === station);
await rpc("save_kitchen_station", stationArgs({ target_station_id: oven.id, target_name: "Fırın", target_color: "#285e9f", target_is_active: false }));
await expectError("save_kitchen_station", stationArgs({ target_station_id: station, target_name: "Mutfak", target_is_active: false }), "last_station", "the last active station cannot be switched off");

// themes
await expectError("set_tenant_theme", { target_tenant_id: tenant, target_branch_id: branch, target_theme: "neon" }, "invalid_theme", "unknown themes are refused");
await rpc("set_tenant_theme", { target_tenant_id: tenant, target_branch_id: branch, target_theme: "ocean" });
check("the owner can choose a theme", (await one("select theme from public.tenant_settings where tenant_id = $1", [tenant])).theme === "ocean");
await actAs(db, null);
check("the QR menu carries the business theme", (await rpc("get_public_menu", { target_token: t5Token })).theme === "ocean");
await actAs(db, OWNER);
await actAs(db, WAITER);
await expectError("set_tenant_theme", { target_tenant_id: tenant, target_branch_id: branch, target_theme: "classic" }, "settings_manage_denied", "waiters cannot change the theme");

// --- two businesses never see each other's QR menu or orders -----------------------------
const OWNER_B = "20000000-0000-4000-8000-0000000000b1";
await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [OWNER_B, "b@t.test", JSON.stringify({ full_name: "Bora Sahip" })]);
await db.query("insert into public.profiles (id, full_name) values ($1, 'Bora Sahip') on conflict do nothing", [OWNER_B]);
await actAs(db, OWNER_B);
await rpc("create_my_tenant", { target_name: "Ikinci Lokanta", target_branch_name: "Sube" });
const tenantB = (await one("select id from public.tenants where id <> $1", [tenant])).id;
const branchB = (await one("select id from public.branches where tenant_id = $1", [tenantB])).id;
const categoryB = (await one("insert into public.menu_categories (tenant_id, branch_id, name) values ($1,$2,'B Yemek') returning id", [tenantB, branchB])).id;
const productB = (await one("insert into public.products (tenant_id, branch_id, category_id, name, price_minor, tax_rate) values ($1,$2,$3,'B Corba',5000,10) returning id", [tenantB, branchB, categoryB])).id;
const areaB = (await one("insert into public.dining_areas (tenant_id, branch_id, name) values ($1,$2,'B Salon') returning id", [tenantB, branchB])).id;
const tableB = (await one("insert into public.restaurant_tables (tenant_id, branch_id, area_id, label) values ($1,$2,$3,'B Masa 1') returning id", [tenantB, branchB, areaB])).id;
await rpc("set_branch_qr_settings", { target_tenant_id: tenantB, target_branch_id: branchB, target_ordering_enabled: true });
const tokenB = (await one("select qr_token from public.restaurant_tables where id = $1", [tableB])).qr_token;
const tokenA = (await one("select qr_token from public.restaurant_tables where id = $1", [t5])).qr_token;

check("every table of every business has its own QR token", (await one("select count(*)::int n, count(distinct qr_token)::int d from public.restaurant_tables")).n === (await one("select count(distinct qr_token)::int d from public.restaurant_tables")).d && tokenA !== tokenB);
await actAs(db, null);
const menuA = await rpc("get_public_menu", { target_token: tokenA });
const menuB = await rpc("get_public_menu", { target_token: tokenB });
const namesA = menuA.categories.flatMap((c) => c.products).map((p) => p.name);
const namesB = menuB.categories.flatMap((c) => c.products).map((p) => p.name);
check("the QR menu of business A shows only A's products", namesA.includes("Kebap") && !namesA.includes("B Corba"), JSON.stringify(namesA));
check("the QR menu of business B shows only B's products", namesB.length === 1 && namesB[0] === "B Corba", JSON.stringify(namesB));
check("each menu belongs to its own business and table", menuA.brandName !== menuB.brandName && menuB.tableLabel === "B Masa 1");
await expectError("place_customer_order", { target_token: tokenA, target_items: [{ productId: productB, quantity: 1 }], target_idempotency_key: key() }, "product_not_available", "a QR code of A cannot order B's product");
await expectError("place_customer_order", { target_token: tokenB, target_items: [{ productId: kebab, quantity: 1, options: [full] }], target_idempotency_key: key() }, "product_not_available", "a QR code of B cannot order A's product");
const orderB = await rpc("place_customer_order", { target_token: tokenB, target_items: [{ productId: productB, quantity: 2 }], target_idempotency_key: key() });
check("B's own QR order works", orderB.ticketCount === 1);
check("the order landed in B's tenant only", (await one("select count(*)::int n from public.orders where tenant_id = $1 and table_id = $2", [tenantB, tableB])).n === 1 && (await one("select count(*)::int n from public.orders where tenant_id = $1 and id in (select order_id from public.order_items where product_name = 'B Corba')", [tenant])).n === 0);
check("waiter calls of B do not reach A", (await rpc("call_waiter", { target_token: tokenB, target_kind: "waiter" })).status === "sent" && (await one("select count(*)::int n from public.waiter_calls where tenant_id = $1 and table_id = $2", [tenant, tableB])).n === 0);

// --- result ------------------------------------------------------------------
console.log(`passed: ${passed}`);
if (failures.length) {
  console.log("FAILURES:");
  for (const failure of failures) console.log(" -", failure);
  process.exit(1);
}
console.log("ALL OK");
