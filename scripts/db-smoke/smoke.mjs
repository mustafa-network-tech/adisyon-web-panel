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

// --- table operations (phase F) ---------------------------------------------
await actAs(db, WAITER);
const t4 = await table("Masa 4");
const orderVersion = async (id) => Number((await one("select version from public.orders where id = $1", [id])).version);
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

// --- result ------------------------------------------------------------------
console.log(`passed: ${passed}`);
if (failures.length) {
  console.log("FAILURES:");
  for (const failure of failures) console.log(" -", failure);
  process.exit(1);
}
console.log("ALL OK");
