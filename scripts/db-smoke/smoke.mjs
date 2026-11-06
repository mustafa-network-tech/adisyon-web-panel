/**
 * Runs every migration in an in-memory Postgres (PGlite) and exercises the order,
 * kitchen, QR, staff, payroll, discount and payment flows end to end.
 * Usage: pnpm db:smoke
 */
import fs from "node:fs";
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

// --- setup phase, 4 steps and the 7 day trial (tenant A, self setup) -----------------------
{
  const sub = await one("select plan_code, status, ends_at from public.subscriptions where tenant_id = $1", [tenant]);
  check("the business starts in setup: trial row without end date", sub.plan_code === "START" && sub.status === "trial" && sub.ends_at === null, JSON.stringify(sub));
  const onboarding = await one("select selected_plan, status, trial_started_at from public.tenant_onboarding where tenant_id = $1", [tenant]);
  check("onboarding row stores the validated package", onboarding.selected_plan === "START" && onboarding.status === "method_pending" && onboarding.trial_started_at === null, JSON.stringify(onboarding));
  const tokens = await all("select qr_token from public.restaurant_tables where tenant_id = $1", [tenant]);
  check("every new table gets its own random QR token automatically", tokens.length === 3 && new Set(tokens.map((x) => x.qr_token)).size === 3 && tokens.every((x) => /^[0-9a-f]{64}$/.test(x.qr_token)));
  await actAs(db, WAITER);
  await expectError("open_order", { target_tenant_id: tenant, target_branch_id: branch, target_table_id: t1, target_guest_count: 2, target_items: [{ productId: kebab, quantity: 1 }], target_idempotency_key: key() }, "tenant_setup_pending", "orders are blocked before the trial starts");
  await actAs(db, MANAGER);
  await expectError("set_setup_method", { target_tenant_id: tenant, target_method: "self" }, "owner_required", "only the owner manages setup");
  await actAs(db, OWNER);
  await expectError("start_trial", { target_tenant_id: tenant }, "trial_not_ready", "trial cannot start before setup is complete");
  await expectError("complete_setup_step", { target_tenant_id: tenant, target_step: "areas" }, "setup_step_not_allowed", "steps need a chosen method");
  await rpc("set_setup_method", { target_tenant_id: tenant, target_method: "self" });
  await expectError("complete_setup_step", { target_tenant_id: tenant, target_step: "bogus" }, "invalid_setup_step", "unknown step refused");
  for (const step of ["areas", "tables", "stations"]) await rpc("complete_setup_step", { target_tenant_id: tenant, target_step: step });
  check("trial is not ready after three steps", (await one("select status from public.tenant_onboarding where tenant_id = $1", [tenant])).status === "self_in_progress");
  await expectError("start_trial", { target_tenant_id: tenant }, "trial_not_ready", "three steps are not enough");
  const done = await rpc("complete_setup_step", { target_tenant_id: tenant, target_step: "menu" });
  check("four steps make the business ready for the trial", done.status === "trial_ready" && done.completedSteps.length === 4, JSON.stringify(done));
  await rpc("set_setup_step", { target_tenant_id: tenant, target_step: 2 });
  check("the owner can go back to an earlier step without losing progress", (await one("select array_length(completed_steps,1) n from public.tenant_onboarding where tenant_id = $1", [tenant])).n === 4);
  await rpc("complete_setup_step", { target_tenant_id: tenant, target_step: "tables" });
  const started = await rpc("start_trial", { target_tenant_id: tenant });
  const span = await one("select ends_at - starts_at as span, starts_at <= now() ok from public.subscriptions where tenant_id = $1", [tenant]);
  check("the trial lasts exactly 7 days from the start moment", String(span.span).startsWith("7 days") && span.ok === true && Boolean(started.endsAt), JSON.stringify(span));
  await expectError("start_trial", { target_tenant_id: tenant }, "trial_already_started", "the trial starts only once");
  await expectError("set_setup_method", { target_tenant_id: tenant, target_method: "self" }, "setup_method_locked", "method locked after trial start");
}

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

// --- QR menu: view only (0039 removed customer ordering) -----------------------
await actAs(db, OWNER);
const t3Token = (await one("select qr_token from public.restaurant_tables where id = $1", [t3])).qr_token;
const publicMenu = await rpc("get_public_menu", { target_token: t3Token });
const colaMenu = publicMenu.categories.flatMap((c) => c.products).find((p) => p.name === "Kola");
check("QR menu still lists the products", Boolean(colaMenu));
await expectError("place_customer_order", { target_token: t3Token, target_items: [{ productId: cola, quantity: 1 }], target_idempotency_key: key() }, "does not exist", "customers cannot create orders through the QR code any more");
await expectError("set_branch_qr_settings", { target_tenant_id: tenant, target_branch_id: branch, target_ordering_enabled: true }, "does not exist", "the QR ordering switch is gone");
// the waiter takes the order of table 3 (used by the merge test below)
await actAs(db, WAITER);
const open3 = await rpc("open_order", { target_tenant_id: tenant, target_branch_id: branch, target_table_id: t3, target_guest_count: 1, target_items: [{ productId: cola, quantity: 1 }], target_idempotency_key: key() });
const submit3 = await rpc("submit_order", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open3.orderId, target_expected_version: open3.version, target_idempotency_key: key() });
check("a waiter order without kitchen items is served at once", submit3.status === "served" && submit3.ticketCount === 0, JSON.stringify(submit3));

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

// --- prices include KDV; discounts only at the cash desk (0039) ---------------
await actAs(db, WAITER);
const o1 = await one("select version, subtotal_minor, total_minor, tax_minor, discount_minor from public.orders where id = $1", [open1.orderId]);
const gross = 2 * 36550 + 2 * 4000; // 81100: the menu prices are the final prices
check("the order total is the plain sum of the KDV-included prices", Number(o1.total_minor) === gross && Number(o1.discount_minor) === 0, JSON.stringify(o1));
check("the KDV is taken out of the price, never added on top", Number(o1.subtotal_minor) + Number(o1.tax_minor) === gross && Number(o1.tax_minor) > 0 && Number(o1.tax_minor) < gross, JSON.stringify(o1));
await expectError("apply_order_discount", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open1.orderId, target_expected_version: o1.version, target_type: "percent", target_value: 1000, target_reason: "x" }, "does not exist", "no order level discount");
await expectError("apply_item_discount", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: open1.orderId, target_order_item_id: open1.orderId, target_expected_version: o1.version, target_type: "percent", target_value: 1000, target_reason: "x" }, "does not exist", "no item level discount");
const kebabItem = (await one("select id from public.order_items where order_id = $1 and product_name = 'Kebap'", [open1.orderId])).id;

// --- payments with a cash-desk discount ------------------------------------------
await actAs(db, OWNER);
const register = (await one("select id from public.cash_registers where tenant_id = $1 and branch_id = $2", [tenant, branch])).id;
const cash = await rpc("open_cash_session", { target_tenant_id: tenant, target_branch_id: branch, target_cash_register_id: register, target_opening_minor: 0, target_idempotency_key: key() });
const cashSession = cash.sessionId || cash.id || cash.cashSessionId;
check("cash session opened", Boolean(cashSession), JSON.stringify(cash));
const colaItem = (await one("select id from public.order_items where order_id = $1", [open2.orderId])).id;
const payArgs = (over = {}) => ({ target_tenant_id: tenant, target_branch_id: branch, target_order_id: open2.orderId, target_cash_session_id: cashSession, target_payments: [{ method: "cash", amountMinor: 7000 }], target_idempotency_key: key(), ...over });
await actAs(db, WAITER);
await expectError("record_order_payments", payArgs(), "payment_create_denied", "a waiter cannot take payments or give discounts");
await actAs(db, CASHIER);
await expectError("record_order_payments", payArgs({ target_adjustment: { amountMinor: 5000 } }), "invalid_adjustment", "the cashier must choose discount or promotion explicitly");
await expectError("record_order_payments", payArgs({ target_adjustment: { kind: "discount", amountMinor: 12001 } }), "discount_exceeds_outstanding", "a discount cannot exceed the remaining debt");
await expectError("record_order_payments", payArgs({ target_adjustment: { kind: "promotion", amountMinor: 5000 }, target_payments: [{ method: "cash", amountMinor: 7001 }] }), "payment_exceeds_outstanding", "collected money plus adjustment cannot exceed the debt");
await expectError("record_order_payments", payArgs({ target_adjustment: { kind: "discount", amountMinor: 5000 }, target_payments: [{ method: "cash", amountMinor: 4000, allocations: [{ orderItemId: colaItem, quantity: 1 }] }] }), "allocation_not_allowed_with_discount", "item payments and a discount do not mix");
const partial = await rpc("record_order_payments", payArgs({ target_payments: [{ method: "cash", amountMinor: 1000 }] }));
check("a short payment is not a discount: the order stays open", partial.orderClosed === false && partial.outstandingMinor === 11000, JSON.stringify(partial));
const adjKey = key();
const paid = await rpc("record_order_payments", payArgs({ target_idempotency_key: adjKey, target_payments: [{ method: "cash", amountMinor: 6000 }], target_adjustment: { kind: "discount", amountMinor: 5000, reason: "müşteri memnuniyeti" } }));
check("cash + discount settle the order", paid.orderClosed === true && paid.adjustmentMinor === 5000 && paid.outstandingMinor === 0, JSON.stringify(paid));
const replay = await rpc("record_order_payments", payArgs({ target_idempotency_key: adjKey, target_payments: [{ method: "cash", amountMinor: 6000 }], target_adjustment: { kind: "discount", amountMinor: 5000, reason: "müşteri memnuniyeti" } }));
check("a repeated request is answered from the stored result", JSON.stringify(replay) === JSON.stringify(paid));
const adjustments = await all("select kind, amount_minor, reason from public.order_adjustments where order_id = $1", [open2.orderId]);
check("exactly one adjustment row, never booked as a payment", adjustments.length === 1 && adjustments[0].kind === "discount" && Number(adjustments[0].amount_minor) === 5000 && adjustments[0].reason === "müşteri memnuniyeti", JSON.stringify(adjustments));
check("the payments hold only the real money (1000 + 6000)", Number((await one("select sum(amount_minor) s from public.payments where order_id = $1", [open2.orderId])).s) === 7000);
check("the original order total is kept", Number((await one("select total_minor from public.orders where id = $1", [open2.orderId])).total_minor) === 12000);
let immutable = "";
try { await db.query("update public.order_adjustments set amount_minor = 1"); } catch (error) { immutable = String(error.message); }
check("a discount record cannot be changed afterwards", immutable.includes("order_adjustments_are_immutable"), immutable);
immutable = "";
try { await db.query("delete from public.order_adjustments"); } catch (error) { immutable = String(error.message); }
check("a discount record cannot be deleted", immutable.includes("order_adjustments_are_immutable"), immutable);

// --- sales report (phase F) --------------------------------------------------
const reportArgs = (over = {}) => ({ target_tenant_id: tenant, target_branch_id: branch, range_start: today, range_end: today, ...over });
await actAs(db, MANAGER);
const report = await rpc("sales_report", reportArgs());
check("report counts the closed order", report.summary.orderCount === 1, JSON.stringify(report.summary));
check("report separates gross, discount, promotion, refund and net", report.summary.grossMinor === 12000 && report.summary.discountMinor === 5000 && report.summary.promotionMinor === 0 && report.summary.refundMinor === 0 && report.summary.netMinor === 7000, JSON.stringify(report.summary));
check("report ignores merged adisyons in cancellations", report.summary.cancelledCount === 0, JSON.stringify(report.summary));
check("report lists real payments by method (the discount is not money)", report.payments.cashMinor === 7000 && report.payments.cardMinor === 0, JSON.stringify(report.payments));
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
check("QR menu shows the product as sold out", soldOutCola.soldOut === true, JSON.stringify(soldOutCola));
await db.query("update public.products set sold_out_on = (now() at time zone 'Europe/Istanbul')::date - 1 where id = $1", [cola]);
const nextDayMenu = await rpc("get_public_menu", { target_token: t5Token });
check("a sold out mark expires the next day", nextDayMenu.categories.flatMap((c) => c.products).find((p) => p.name === "Kola").soldOut === false);

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

await actAs(db, null);
const optionMenu = await rpc("get_public_menu", { target_token: t5Token });
const kebabMenu = optionMenu.categories.flatMap((c) => c.products).find((p) => p.name === "Kebap");
check("the public menu lists the option groups", kebabMenu.optionGroups.length === 3 && kebabMenu.optionGroups[0].choices.length >= 2, JSON.stringify(kebabMenu.optionGroups.map((g) => g.name)));
const sauceInMenu = kebabMenu.optionGroups.flatMap((g) => g.choices).find((c) => c.name === "Sos");
check("the public menu marks a sold out choice", sauceInMenu.soldOut === true);
const t7Token = (await one("select qr_token from public.restaurant_tables where id = $1", [t7])).qr_token;
await actAs(db, WAITER);
const qrOption = await openOn(t7, [{ productId: kebab, quantity: 1, options: [full, cheese] }]);
const qrOptionSubmit = await rpc("submit_order", { target_tenant_id: tenant, target_branch_id: branch, target_order_id: qrOption.orderId, target_expected_version: qrOption.version, target_idempotency_key: key() });
check("a waiter order with options reaches the kitchen", qrOptionSubmit.ticketCount === 1, JSON.stringify(qrOptionSubmit));
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
check("the limits come from the chosen package", trial.table_limit === 15 && trial.station_limit === 1 && trial.user_limit === 5 && trial.branch_limit === 1, JSON.stringify(trial));

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
await rpc("set_setup_method", { target_tenant_id: tenantB, target_method: "self" });
for (const step of ["areas", "tables", "stations", "menu"]) await rpc("complete_setup_step", { target_tenant_id: tenantB, target_step: step });
await rpc("start_trial", { target_tenant_id: tenantB });
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
await actAs(db, OWNER_B);
const orderB = await rpc("open_order", { target_tenant_id: tenantB, target_branch_id: branchB, target_table_id: tableB, target_guest_count: 1, target_items: [{ productId: productB, quantity: 2 }], target_idempotency_key: key() });
await actAs(db, null);
check("B's owner can take an order in his own business", Boolean(orderB.orderId));
check("the order landed in B's tenant only", (await one("select count(*)::int n from public.orders where tenant_id = $1 and table_id = $2", [tenantB, tableB])).n === 1 && (await one("select count(*)::int n from public.orders where tenant_id = $1 and id in (select order_id from public.order_items where product_name = 'B Corba')", [tenant])).n === 0);
check("waiter calls of B do not reach A", (await rpc("call_waiter", { target_token: tokenB, target_kind: "waiter" })).status === "sent" && (await one("select count(*)::int n from public.waiter_calls where tenant_id = $1 and table_id = $2", [tenant, tableB])).n === 0);

// --- read-only mode after the trial or subscription ends -------------------------------
const PLATFORM = "90000000-0000-4000-8000-0000000000a1";
await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'platform@t.test', '{}'::jsonb)", [PLATFORM]);
await db.query("insert into public.profiles (id, full_name) values ($1, 'Platform') on conflict do nothing", [PLATFORM]);
await db.query("insert into public.platform_admins (user_id) values ($1)", [PLATFORM]);

// --- finance tables: reading needs a finance permission (migration 0035) ---------
{
  const KITCHEN = "10000000-0000-4000-8000-000000000009";
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'kitchen@t.test', '{}'::jsonb)", [KITCHEN]);
  await db.query("insert into public.profiles (id, full_name) values ($1, 'Mutfak Kullanici') on conflict do nothing", [KITCHEN]);
  await actAs(db, OWNER);
  const kitchenMembership = await addMember(KITCHEN, "kitchen");

  // Seed one complete set of finance rows per business (superuser, triggers off).
  const financeTables = ["cash_sessions", "payments", "payment_refunds", "payment_allocations", "cash_movements"];
  async function seedFinance(tenantId, branchId, userId, orderNo) {
    await db.exec("set session_replication_role = replica");
    const existing = await one("select id from public.cash_sessions where tenant_id = $1 and branch_id = $2 limit 1", [tenantId, branchId]);
    let sessionId = existing?.id;
    if (!sessionId) {
      const reg = (await one("select id from public.cash_registers where tenant_id = $1 and branch_id = $2", [tenantId, branchId])).id;
      sessionId = (await one("insert into public.cash_sessions (tenant_id, branch_id, cash_register_id, opened_by) values ($1,$2,$3,$4) returning id", [tenantId, branchId, reg, userId])).id;
    }
    const orderId = (await one("insert into public.orders (tenant_id, branch_id, order_number, status, created_by) values ($1,$2,$3,'served',$4) returning id", [tenantId, branchId, orderNo, userId])).id;
    const itemId = (await one("insert into public.order_items (tenant_id, branch_id, order_id, product_name, quantity, unit_price_minor, tax_rate, line_total_minor) values ($1,$2,$3,'Test',1,1000,10,1000) returning id", [tenantId, branchId, orderId])).id;
    const paymentId = (await one("insert into public.payments (tenant_id, branch_id, order_id, cash_session_id, method, amount_minor, idempotency_key, created_by) values ($1,$2,$3,$4,'cash',1000,$5,$6) returning id", [tenantId, branchId, orderId, sessionId, `f1-${orderNo}-0000000000`, userId])).id;
    await db.query("insert into public.payment_allocations (tenant_id, branch_id, payment_id, order_id, order_item_id, quantity, amount_minor) values ($1,$2,$3,$4,$5,1,1000)", [tenantId, branchId, paymentId, orderId, itemId]);
    await db.query("insert into public.payment_refunds (tenant_id, branch_id, payment_id, cash_session_id, amount_minor, reason, idempotency_key, created_by) values ($1,$2,$3,$4,100,'f1 test',$5,$6)", [tenantId, branchId, paymentId, sessionId, `f1r-${orderNo}-000000000`, userId]);
    await db.query("insert into public.cash_movements (tenant_id, cash_session_id, movement_type, amount_minor, reason, created_by) values ($1,$2,'expense',100,'f1 test',$3)", [tenantId, sessionId, userId]);
    await db.exec("set session_replication_role = origin");
  }
  await seedFinance(tenant, branch, OWNER, 910001);
  await seedFinance(tenantB, branchB, OWNER_B, 910002);

  const total = async (table, tenantId) => (await one(`select count(*)::int n from public.${table} where tenant_id = $1`, [tenantId])).n;
  const expectA = {};
  const expectB = {};
  for (const table of financeTables) { expectA[table] = await total(table, tenant); expectB[table] = await total(table, tenantB); }
  check("finance test data exists in both businesses", financeTables.every((table) => expectA[table] > 0 && expectB[table] > 0), JSON.stringify({ expectA, expectB }));

  // Plain authenticated SELECTs, exactly what a REST call with the user's JWT does.
  for (const table of financeTables) {
    check(`waiter reads no ${table}`, (await countAs(WAITER, table)) === 0);
    check(`kitchen user reads no ${table}`, (await countAs(KITCHEN, table)) === 0);
    check(`manager reads ${table}`, (await countAs(MANAGER, table)) === expectA[table], `${await countAs(MANAGER, table)} vs ${expectA[table]}`);
    check(`cashier reads ${table}`, (await countAs(CASHIER, table)) === expectA[table], `${await countAs(CASHIER, table)} vs ${expectA[table]}`);
    check(`owner A reads only A's ${table}`, (await countAs(OWNER, table)) === expectA[table], `${await countAs(OWNER, table)} vs ${expectA[table]}`);
    check(`owner B reads only B's ${table}`, (await countAs(OWNER_B, table)) === expectB[table], `${await countAs(OWNER_B, table)} vs ${expectB[table]}`);
  }

  // Tenant isolation: the other business's rows never show up.
  async function foreignRows(userId, table, otherTenant) {
    await actAs(db, userId);
    await db.exec("set role authenticated");
    try { return (await one(`select count(*)::int n from public.${table} where tenant_id = $1`, [otherTenant])).n; } finally { await db.exec("reset role"); }
  }
  for (const table of financeTables) {
    check(`A's owner sees none of B's ${table}`, (await foreignRows(OWNER, table, tenantB)) === 0);
    check(`B's owner sees none of A's ${table}`, (await foreignRows(OWNER_B, table, tenant)) === 0);
  }

  // Narrow roles: cash.open alone sees the shift but not the sales inside it.
  async function withRolePermissions(codes, userId, table) {
    const role = (await one("insert into public.roles (tenant_id, code, name, scope) values ($1, $2, 'F1 test', 'branch') returning id", [tenant, `f1_${codes.join("_").replace(/\./g, "")}`])).id;
    for (const code of codes) {
      await db.query("insert into public.role_permissions (tenant_id, role_id, permission_id) select $1, $2, id from public.permissions where code = $3", [tenant, role, code]);
    }
    const membership = (await one("select id from public.tenant_memberships where tenant_id = $1 and user_id = $2", [tenant, userId])).id;
    await db.query("delete from public.membership_roles where tenant_id = $1 and membership_id = $2", [tenant, membership]);
    await db.query("insert into public.membership_roles (tenant_id, membership_id, role_id) values ($1,$2,$3)", [tenant, membership, role]);
    return countAs(userId, table);
  }
  const keepKitchenRole = await roleId("kitchen");
  check("cash.open alone reads the cash session", (await withRolePermissions(["cash.open"], KITCHEN, "cash_sessions")) === expectA.cash_sessions);
  check("cash.open alone reads no payments", (await countAs(KITCHEN, "payments")) === 0);
  check("cash.open alone reads the cash movements", (await countAs(KITCHEN, "cash_movements")) === expectA.cash_movements);
  check("cash.close reads payments", (await withRolePermissions(["cash.close"], KITCHEN, "payments")) === expectA.payments);
  check("reports.read alone reads no payments directly", (await withRolePermissions(["reports.read"], KITCHEN, "payments")) === 0);
  await db.query("delete from public.membership_roles where tenant_id = $1 and membership_id = $2", [tenant, kitchenMembership]);
  await db.query("insert into public.membership_roles (tenant_id, membership_id, role_id) values ($1,$2,$3)", [tenant, kitchenMembership, keepKitchenRole]);

  // Security definer paths are unaffected by the new policies.
  await actAs(db, CASHIER);
  const reportDay = new Date().toISOString().slice(0, 10);
  const reportResult = await rpc("sales_report", { target_tenant_id: tenant, target_branch_id: branch, range_start: reportDay, range_end: reportDay });
  check("the sales report still works for the cashier", reportResult !== null && typeof reportResult === "object");

  // Platform support session keeps its read access; without a session there is none.
  check("platform admin without a support session reads no payments", (await countAs(PLATFORM, "payments")) === 0);
  await actAs(db, PLATFORM);
  const supportSession = await rpc("open_platform_support_session", { target_tenant_id: tenant, target_branch_id: branch, support_reason: "finance read regression", duration_minutes: 15 });
  for (const table of financeTables) check(`support session still reads ${table}`, (await countAs(PLATFORM, table)) === expectA[table], `${await countAs(PLATFORM, table)} vs ${expectA[table]}`);
  await rpc("close_platform_support_session", { target_session_id: supportSession });
  check("closed support session reads no payments again", (await countAs(PLATFORM, "payments")) === 0);

  // ---- second branch of the same business: finance data stays separated per branch ----
  const CASHIER2 = "10000000-0000-4000-8000-000000000011";
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'cashier2@t.test', '{}'::jsonb)", [CASHIER2]);
  await db.query("insert into public.profiles (id, full_name) values ($1, 'Kasiyer Teras') on conflict do nothing", [CASHIER2]);
  await db.exec("set session_replication_role = replica");
  const branch2 = (await one("insert into public.branches (tenant_id, name, slug, timezone, currency_code) values ($1, 'Teras Test', 'teras-test', 'Europe/Istanbul', 'TRY') returning id", [tenant])).id;
  await db.query("insert into public.cash_registers (tenant_id, branch_id, name) values ($1, $2, 'Kasa Teras')", [tenant, branch2]);
  const cashier2Membership = (await one("insert into public.tenant_memberships (tenant_id, user_id, status) values ($1, $2, 'active') returning id", [tenant, CASHIER2])).id;
  await db.query("insert into public.membership_roles (tenant_id, membership_id, role_id) values ($1, $2, $3)", [tenant, cashier2Membership, await roleId("cashier")]);
  await db.query("insert into public.membership_branches (tenant_id, membership_id, branch_id) values ($1, $2, $3)", [tenant, cashier2Membership, branch2]);
  await db.exec("set session_replication_role = origin");
  await seedFinance(tenant, branch2, OWNER, 910003);

  const branchFilter = (table, branchId) => table === "cash_movements"
    ? { sql: "cash_session_id in (select id from public.cash_sessions where branch_id = $1)", params: [branchId] }
    : { sql: "branch_id = $1", params: [branchId] };
  const seededIn = async (table, branchId) => { const f = branchFilter(table, branchId); return (await one(`select count(*)::int n from public.${table} where ${f.sql}`, f.params)).n; };
  async function visibleIn(userId, table, branchId) {
    await actAs(db, userId);
    await db.exec("set role authenticated");
    try {
      // cash_movements has no branch column: return the sessions of the rows the user sees
      if (table === "cash_movements") return (await all("select cash_session_id from public.cash_movements where tenant_id = $1", [tenant])).map((row) => row.cash_session_id);
      const f = branchFilter(table, branchId);
      return (await one(`select count(*)::int n from public.${table} where ${f.sql}`, f.params)).n;
    } finally { await db.exec("reset role"); }
  }
  // Superuser view of which session belongs to which branch, to judge cash_movements rows seen by a user.
  const sessionBranch = Object.fromEntries((await all("select id, branch_id from public.cash_sessions where tenant_id = $1", [tenant])).map((row) => [row.id, row.branch_id]));
  async function seenCount(userId, table, branchId) {
    const result = await visibleIn(userId, table, branchId);
    if (table === "cash_movements") return result.filter((sessionId) => sessionBranch[sessionId] === branchId).length;
    return result;
  }
  const ownSeeded = {};
  for (const table of financeTables) ownSeeded[table] = { b1: await seededIn(table, branch), b2: await seededIn(table, branch2) };
  check("both branches of the business have finance rows", financeTables.every((table) => ownSeeded[table].b1 > 0 && ownSeeded[table].b2 > 0), JSON.stringify(ownSeeded));

  for (const table of financeTables) {
    check(`branch 1 cashier reads branch 1 ${table}`, (await seenCount(CASHIER, table, branch)) === ownSeeded[table].b1);
    check(`branch 1 cashier reads no branch 2 ${table}`, (await seenCount(CASHIER, table, branch2)) === 0);
    check(`branch 2 cashier reads branch 2 ${table}`, (await seenCount(CASHIER2, table, branch2)) === ownSeeded[table].b2);
    check(`branch 2 cashier reads no branch 1 ${table}`, (await seenCount(CASHIER2, table, branch)) === 0);
    check(`branch 1 manager reads no branch 2 ${table}`, (await seenCount(MANAGER, table, branch2)) === 0);
    check(`business owner reads both branches of ${table}`, (await seenCount(OWNER, table, branch)) === ownSeeded[table].b1 && (await seenCount(OWNER, table, branch2)) === ownSeeded[table].b2);
    check(`branch 1 waiter reads nothing of ${table} in either branch`, (await seenCount(WAITER, table, branch)) === 0 && (await seenCount(WAITER, table, branch2)) === 0);
  }
  // the support session of branch 1 does not open branch 2
  await actAs(db, PLATFORM);
  const supportBranch1 = await rpc("open_platform_support_session", { target_tenant_id: tenant, target_branch_id: branch, support_reason: "branch scope regression", duration_minutes: 15 });
  for (const table of financeTables) check(`support session of branch 1 reads no branch 2 ${table}`, (await seenCount(PLATFORM, table, branch2)) === 0);
  check("support session of branch 1 still reads branch 1 payments", (await seenCount(PLATFORM, "payments", branch)) === ownSeeded.payments.b1);
  await rpc("close_platform_support_session", { target_session_id: supportBranch1 });

  // ---- single-permission roles, one by one (each plays the kitchen user's seat in branch 1) ----
  let narrowCounter = 0;
  async function narrowRoleView(codes) {
    narrowCounter += 1;
    const role = (await one("insert into public.roles (tenant_id, code, name, scope) values ($1, $2, 'F1 narrow', 'branch') returning id", [tenant, `f1_narrow_${narrowCounter}`])).id;
    for (const code of codes) await db.query("insert into public.role_permissions (tenant_id, role_id, permission_id) select $1, $2, id from public.permissions where code = $3", [tenant, role, code]);
    await db.query("delete from public.membership_roles where tenant_id = $1 and membership_id = $2", [tenant, kitchenMembership]);
    await db.query("insert into public.membership_roles (tenant_id, membership_id, role_id) values ($1,$2,$3)", [tenant, kitchenMembership, role]);
    const view = {};
    for (const table of financeTables) view[table] = (await seenCount(KITCHEN, table, branch)) > 0;
    return view;
  }
  const narrowCases = [
    ["payments.create", { cash_sessions: true, payments: true, payment_refunds: true, payment_allocations: true, cash_movements: true }],
    ["cash.open", { cash_sessions: true, payments: false, payment_refunds: false, payment_allocations: false, cash_movements: true }],
    ["cash.close", { cash_sessions: true, payments: true, payment_refunds: true, payment_allocations: true, cash_movements: true }],
    ["reports.read", { cash_sessions: false, payments: false, payment_refunds: false, payment_allocations: false, cash_movements: false }],
  ];
  for (const [code, expected] of narrowCases) {
    const view = await narrowRoleView([code]);
    for (const table of financeTables) check(`${code}-only role: ${table} ${expected[table] ? "readable" : "hidden"}`, view[table] === expected[table], JSON.stringify(view));
  }
  await db.query("delete from public.membership_roles where tenant_id = $1 and membership_id = $2", [tenant, kitchenMembership]);
  await db.query("insert into public.membership_roles (tenant_id, membership_id, role_id) values ($1,$2,$3)", [tenant, kitchenMembership, keepKitchenRole]);

  // ---- the manual rollback script restores the old behaviour and 0035 can be re-applied ----
  const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);
  const rollbackSql = fs.readFileSync(new URL("../../supabase/rollback/0035_finance_read_permissions_down.sql", import.meta.url), "utf8");
  const migrationSql = fs.readFileSync(new URL("0035_finance_read_permissions.sql", migrationsDir), "utf8");
  const policyCount = async () => (await one("select count(*)::int n from pg_policies where schemaname = 'public' and policyname like '%_finance_read_restrict'")).n;
  check("five finance read policies exist before the rollback", (await policyCount()) === 5);
  await db.exec(rollbackSql);
  check("rollback removes all five policies", (await policyCount()) === 0);
  check("after the rollback the waiter reads payments again (old behaviour)", (await countAs(WAITER, "payments")) > 0);
  await db.exec(rollbackSql);
  check("the rollback script can run twice", (await policyCount()) === 0);
  check("the rollback keeps the branch access policies", (await countAs(OWNER_B, "payments")) === expectB.payments);
  await db.exec(migrationSql);
  check("0035 can be applied again after a rollback", (await policyCount()) === 5);
  check("and the waiter is locked out again", (await countAs(WAITER, "payments")) === 0);

  // ---- clean up the extra branch so the following tests see the same business as before ----
  await db.exec("set session_replication_role = replica");
  await db.query("delete from public.cash_movements where cash_session_id in (select id from public.cash_sessions where branch_id = $1)", [branch2]);
  for (const table of ["payment_refunds", "payment_allocations", "payments", "order_items", "orders", "cash_sessions", "cash_registers"]) {
    await db.query(`delete from public.${table} where branch_id = $1`, [branch2]);
  }
  await db.exec("set session_replication_role = origin");
  await db.query("delete from public.tenant_memberships where id = $1", [cashier2Membership]);
  await db.query("delete from public.branches where id = $1", [branch2]);

  // Direct writes stay closed.
  await actAs(db, CASHIER);
  await db.exec("set role authenticated");
  try {
    await db.query("insert into public.payments (tenant_id, branch_id, order_id, cash_session_id, method, amount_minor, idempotency_key, created_by) values ($1,$2,$3,$4,'cash',1,'direct-write-forbidden-1',$5)", [tenant, branch, open2.orderId, cashSession, CASHIER]);
    failures.push("direct payment insert should stay closed");
  } catch (error) {
    if (String(error.message).includes("permission denied")) passed += 1;
    else failures.push(`direct payment insert: ${error.message}`);
  }
  await db.exec("reset role");
}


// --- assisted setup by MK Digital Systems (tenant C) and isolation ---------------------------
{
  const OWNER_C = "30000000-0000-4000-8000-0000000000c1";
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'c@t.test', $2)", [OWNER_C, JSON.stringify({ full_name: "Cem Sahip" })]);
  await db.query("insert into public.profiles (id, full_name) values ($1, 'Cem Sahip') on conflict do nothing", [OWNER_C]);
  await actAs(db, OWNER_C);
  await expectError("create_my_tenant", { target_name: "Ucuncu Lokanta", target_branch_name: "Sube", target_plan_code: "HACK" }, "invalid_plan", "an unknown package is refused by the server");
  await rpc("create_my_tenant", { target_name: "Ucuncu Lokanta", target_branch_name: "Sube", target_plan_code: "pro" });
  const tenantC = (await one("select id from public.tenants where name = 'Ucuncu Lokanta'")).id;
  const branchC = (await one("select id from public.branches where tenant_id = $1", [tenantC])).id;
  const planC = await one("select plan_code, table_limit, user_limit from public.subscriptions where tenant_id = $1", [tenantC]);
  check("the chosen package sets the plan and limits", planC.plan_code === "PRO" && planC.table_limit === null && planC.user_limit === 15, JSON.stringify(planC));

  const request = { areas: "Salon\nTeras", tables: "Salon: Masa 1-3\nTeras: T1, T2", stations: "Mutfak\nBar: Icecek", menu: "Yemek | Kebap | 365 | Odun atesi | Mutfak\nIcecek | Cay | 25 | | Bar", notes: "" };
  await expectError("set_setup_method", { target_tenant_id: tenantC, target_method: "assisted", target_payload: { ...request, menu: "" } }, "invalid_setup_request", "assisted request needs all four areas");
  await rpc("set_setup_method", { target_tenant_id: tenantC, target_method: "assisted", target_payload: { ...request, payrollRoles: "kurulsun", branches: "kurulsun" } });
  const stored = (await one("select request_payload from public.tenant_onboarding where tenant_id = $1", [tenantC])).request_payload;
  check("only the four setup areas are stored in the request", Object.keys(stored).sort().join(",") === "areas,details,menu,notes,stations,tables", Object.keys(stored).join(","));
  check("assisted request is queued", (await one("select status from public.tenant_onboarding where tenant_id = $1", [tenantC])).status === "assisted_requested");
  await expectError("complete_setup_step", { target_tenant_id: tenantC, target_step: "areas" }, "setup_step_not_allowed", "self wizard is closed while MK prepares");

  // isolation: another owner cannot touch or read this setup
  await actAs(db, OWNER_B);
  await expectError("set_setup_method", { target_tenant_id: tenantC, target_method: "self" }, "owner_required", "tenant B owner cannot change tenant C setup");
  await expectError("start_trial", { target_tenant_id: tenantC }, "owner_required", "tenant B owner cannot start tenant C trial");
  await expectError("get_setup_readiness", { target_tenant_id: tenantC }, "setup_access_denied", "tenant B owner cannot read tenant C readiness");
  check("an owner sees only their own onboarding row", (await countAs(OWNER_B, "tenant_onboarding")) === 1);
  check("a waiter sees no onboarding rows", (await countAs(WAITER, "tenant_onboarding")) === 0);
  await expectError("platform_setup_apply_areas", { target_tenant_id: tenantC, target_names: ["Salon"] }, "platform_admin_required", "only platform admins apply setup");
  await expectError("platform_set_setup_status", { target_tenant_id: tenantC, target_status: "assisted_in_progress", target_note: null }, "platform_admin_required", "only platform admins change the setup status");
  await actAs(db, OWNER_C);
  await expectError("platform_setup_apply_areas", { target_tenant_id: tenantC, target_names: ["Salon"] }, "platform_admin_required", "the owner cannot use platform setup either");

  // platform side
  await actAs(db, PLATFORM);
  check("the platform sees every onboarding row", (await countAs(PLATFORM, "tenant_onboarding")) === 3);
  await expectError("platform_set_setup_status", { target_tenant_id: tenantC, target_status: "trial_ready", target_note: null }, "invalid_status_transition", "requested cannot jump to ready");
  await rpc("platform_set_setup_status", { target_tenant_id: tenantC, target_status: "assisted_in_progress", target_note: null });
  await expectError("platform_set_setup_status", { target_tenant_id: tenantC, target_status: "info_needed", target_note: "" }, "info_note_required", "a missing-info request needs a note");
  await rpc("platform_set_setup_status", { target_tenant_id: tenantC, target_status: "info_needed", target_note: "Masa kapasiteleri eksik." });
  check("the business sees the information request", (await one("select admin_note from public.tenant_onboarding where tenant_id = $1", [tenantC])).admin_note === "Masa kapasiteleri eksik.");
  await actAs(db, OWNER_C);
  await rpc("answer_setup_info_request", { target_tenant_id: tenantC, target_payload: request });
  check("answering returns the request to the queue", (await one("select status from public.tenant_onboarding where tenant_id = $1", [tenantC])).status === "assisted_requested");
  await actAs(db, PLATFORM);
  await rpc("platform_set_setup_status", { target_tenant_id: tenantC, target_status: "assisted_in_progress", target_note: null });
  await rpc("platform_set_setup_status", { target_tenant_id: tenantC, target_status: "setup_completed", target_note: null });
  await expectError("platform_set_setup_status", { target_tenant_id: tenantC, target_status: "trial_ready", target_note: null }, "setup_incomplete", "ready needs real data in all four areas");
  await rpc("platform_set_setup_status", { target_tenant_id: tenantC, target_status: "assisted_in_progress", target_note: null });

  await expectError("platform_setup_apply_tables", { target_tenant_id: tenantC, target_items: [{ area: "Salon", label: "Masa 1", capacity: 4 }] }, "setup_area_not_found", "tables need an existing hall");
  check("platform creates halls", (await rpc("platform_setup_apply_areas", { target_tenant_id: tenantC, target_names: ["Salon", "Teras", "salon"] })).created === 2);
  const tablesDone = await rpc("platform_setup_apply_tables", { target_tenant_id: tenantC, target_items: [{ area: "Salon", label: "Masa 1", capacity: 4 }, { area: "Salon", label: "Masa 2", capacity: 4 }, { area: "teras", label: "T1", capacity: 2 }] });
  check("platform creates tables", tablesDone.created === 3);
  const tokensC = await all("select qr_token from public.restaurant_tables where tenant_id = $1", [tenantC]);
  check("platform-created tables get QR tokens automatically", tokensC.length === 3 && tokensC.every((x) => /^[0-9a-f]{64}$/.test(x.qr_token)));
  check("platform creates stations", (await rpc("platform_setup_apply_stations", { target_tenant_id: tenantC, target_items: [{ name: "Bar", categories: [] }] })).created === 1);
  await expectError("platform_setup_apply_menu", { target_tenant_id: tenantC, target_items: [{ category: "Icecek", name: "Cay", price_minor: 2500, station: "Yok" }] }, "setup_station_not_found", "menu needs a known station");
  const menuDone = await rpc("platform_setup_apply_menu", { target_tenant_id: tenantC, target_items: [{ category: "Yemek", name: "Kebap", price_minor: 36500, description: "Odun atesi" }, { category: "Icecek", name: "Cay", price_minor: 2500, station: "Bar" }, { category: "Icecek", name: "Cay", price_minor: 2500, station: "Bar" }] });
  check("platform creates the menu (duplicates skipped)", menuDone.created === 2, JSON.stringify(menuDone));
  await expectError("platform_setup_apply_menu", { target_tenant_id: tenantC, target_items: [{ category: "X", name: "Y", price_minor: -1 }] }, "invalid_setup_items", "negative prices refused");
  await rpc("platform_set_setup_status", { target_tenant_id: tenantC, target_status: "setup_completed", target_note: null });
  await expectError("start_trial", { target_tenant_id: tenantC }, "owner_required", "the platform cannot start the trial for the owner");
  await rpc("platform_set_setup_status", { target_tenant_id: tenantC, target_status: "trial_ready", target_note: null });
  check("the platform stops at ready-for-trial; the trial has not started", (await one("select trial_started_at from public.tenant_onboarding where tenant_id = $1", [tenantC])).trial_started_at === null);
  check("the business is still in setup before the owner starts", (await one("select ends_at from public.subscriptions where tenant_id = $1", [tenantC])).ends_at === null);
  const audit = await all("select action, tenant_id from public.audit_logs where tenant_id = $1 and action like 'platform.setup.%'", [tenantC]);
  check("platform actions are audited with the tenant", audit.length >= 8 && audit.every((row) => row.tenant_id === tenantC), String(audit.length));
  check("platform actions did not touch tenant A", (await one("select count(*)::int n from public.dining_areas where tenant_id = $1", [tenant])).n === 1);

  await actAs(db, OWNER_C);
  const startedC = await rpc("start_trial", { target_tenant_id: tenantC });
  check("the owner starts the trial after the platform marked it ready", Boolean(startedC.endsAt));
  await actAs(db, PLATFORM);
  check("platform can still adjust the four areas after the trial started", (await rpc("platform_setup_apply_areas", { target_tenant_id: tenantC, target_names: ["Yeni"] })).created === 1);

  // an ended trial keeps all data and turns read-only
  const counts = async () => one("select (select count(*) from public.dining_areas where tenant_id = $1)::int a, (select count(*) from public.restaurant_tables where tenant_id = $1)::int t, (select count(*) from public.products where tenant_id = $1)::int p", [tenantC]);
  const countsBefore = await counts();
  await db.query("update public.subscriptions set ends_at = now() - interval '1 day' where tenant_id = $1", [tenantC]);
  const countsAfter = await counts();
  check("no data is deleted when the trial ends", JSON.stringify(countsBefore) === JSON.stringify(countsAfter) && countsAfter.a === 3 && countsAfter.t === 3 && countsAfter.p === 2, JSON.stringify(countsAfter));
  await actAs(db, OWNER_C);
  check("an ended trial is read-only", (await rpc("get_plan_usage", { target_tenant_id: tenantC, target_branch_id: branchC })).writable === false);
}

// --- free-text request, WhatsApp/e-mail takeover, businesses without a setup record --------------
{
  const mkUser = async (id, name) => {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, name + "@t.test", JSON.stringify({ full_name: name })]);
    await db.query("insert into public.profiles (id, full_name) values ($1, $2) on conflict do nothing", [id, name]);
  };
  const OWNER_D = "40000000-0000-4000-8000-0000000000d1";
  const OWNER_E = "50000000-0000-4000-8000-0000000000e1";
  await mkUser(OWNER_D, "Deniz Sahip");
  await mkUser(OWNER_E, "Ela Sahip");

  await actAs(db, OWNER_D);
  await rpc("create_my_tenant", { target_name: "Dorduncu Lokanta", target_branch_name: "Sube", target_plan_code: "START" });
  const tenantD = (await one("select id from public.tenants where name = 'Dorduncu Lokanta'")).id;
  await expectError("set_setup_method", { target_tenant_id: tenantD, target_method: "assisted", target_payload: { details: "x" } }, "invalid_setup_request", "an empty or tiny request is refused");
  await rpc("set_setup_method", { target_tenant_id: tenantD, target_method: "assisted", target_payload: { details: "Salon 8 masa, bahce 3 masa. Kola 25 lira, cacik 30 lira", notes: "" } });
  const requestD = await one("select status, request_payload from public.tenant_onboarding where tenant_id = $1", [tenantD]);
  check("a free-text request is enough and lands in the queue", requestD.status === "assisted_requested" && requestD.request_payload.details.startsWith("Salon 8 masa"), JSON.stringify(requestD));

  // a business that never asked: the message came by WhatsApp, MK takes over
  await actAs(db, OWNER_E);
  await rpc("create_my_tenant", { target_name: "Besinci Lokanta", target_branch_name: "Sube", target_plan_code: "PRO" });
  const tenantE = (await one("select id from public.tenants where name = 'Besinci Lokanta'")).id;
  await actAs(db, PLATFORM);
  await expectError("platform_set_setup_status", { target_tenant_id: tenantE, target_status: "trial_ready", target_note: null }, "invalid_status_transition", "takeover goes through preparation first");
  await rpc("platform_set_setup_status", { target_tenant_id: tenantE, target_status: "assisted_in_progress", target_note: null });
  const takeover = await one("select status, setup_method from public.tenant_onboarding where tenant_id = $1", [tenantE]);
  check("MK can take over a business that has not asked for setup", takeover.status === "assisted_in_progress" && takeover.setup_method === "assisted", JSON.stringify(takeover));
  check("the takeover is audited", (await one("select count(*)::int n from public.audit_logs where tenant_id = $1 and action = 'platform.setup.status_changed' and (metadata ->> 'takeover')::boolean", [tenantE])).n === 1);
  check("MK creates halls for it", (await rpc("platform_setup_apply_areas", { target_tenant_id: tenantE, target_names: ["Salon", "Bahce"] })).created === 2);
  await actAs(db, OWNER_D);
  await expectError("platform_setup_apply_areas", { target_tenant_id: tenantE, target_names: ["Hack"] }, "platform_admin_required", "another owner cannot set up business E");

  // a business created before the setup flow (no setup record at all)
  await db.query("delete from public.tenant_onboarding where tenant_id = $1", [tenant]);
  const areasBefore = (await one("select count(*)::int n from public.dining_areas where tenant_id = $1", [tenant])).n;
  await actAs(db, PLATFORM);
  check("platform can set up a business without a setup record", (await rpc("platform_setup_apply_areas", { target_tenant_id: tenant, target_names: ["Bahce"] })).created === 1);
  check("it lands in that business only", (await one("select count(*)::int n from public.dining_areas where tenant_id = $1", [tenant])).n === areasBefore + 1 && (await one("select count(*)::int n from public.dining_areas where tenant_id = $1 and name = 'Bahce'", [tenantB])).n === 0);
  await expectError("platform_setup_apply_areas", { target_tenant_id: "00000000-0000-4000-8000-000000000000", target_names: ["X"] }, "tenant_not_found", "unknown business refused");
}

// --- extra branches (Cok Subeli) ---------------------------------------------------------------
{
  await actAs(db, OWNER);
  await expectError("create_branch", { target_tenant_id: tenant, target_name: "Ikinci Sube" }, "branch_limit_reached", "a one-branch plan cannot open a second branch");
  await actAs(db, WAITER);
  await expectError("create_branch", { target_tenant_id: tenant, target_name: "Garson Subesi" }, "branch_manage_denied", "a waiter cannot open branches");
  await actAs(db, OWNER_B);
  await expectError("create_branch", { target_tenant_id: tenant, target_name: "Yabanci" }, "branch_manage_denied", "another business owner cannot open branches here");
  // the platform assigns the Cok Subeli plan
  await actAs(db, PLATFORM);
  await rpc("update_tenant_subscription", { target_tenant_id: tenant, target_plan_code: "MULTI", target_status: "active", target_starts_at: new Date().toISOString(), target_ends_at: null, target_notes: null, target_user_limit: 40, target_branch_limit: 3, target_table_limit: null, target_station_limit: null });
  await actAs(db, OWNER);
  await expectError("create_branch", { target_tenant_id: tenant, target_name: "x" }, "invalid_branch_name", "a one-letter branch name is refused");
  const second = await rpc("create_branch", { target_tenant_id: tenant, target_name: "Kadıköy Şube" });
  check("the owner opens a second branch on the Cok Subeli plan", second.branchSlug === "kadikoy-sube", JSON.stringify(second));
  const third = await rpc("create_branch", { target_tenant_id: tenant, target_name: "Kadıköy Şube" });
  check("a repeated name gets its own slug", third.branchSlug.startsWith("kadikoy-sube-") && third.branchSlug !== second.branchSlug, JSON.stringify(third));
  await expectError("create_branch", { target_tenant_id: tenant, target_name: "Dorduncu Sube" }, "branch_limit_reached", "the third branch is the last one");
  check("the new branch gets its default kitchen station", (await one("select count(*)::int n from public.kitchen_stations where branch_id = $1", [second.branchId])).n === 1);
  const usageSecond = await rpc("get_plan_usage", { target_tenant_id: tenant, target_branch_id: second.branchId });
  check("the owner reaches the new branch", usageSecond.branchLimit === 3, JSON.stringify(usageSecond));
  await actAs(db, WAITER);
  await expectError("get_plan_usage", { target_tenant_id: tenant, target_branch_id: second.branchId }, "plan_usage_denied", "branch staff do not reach a branch they were not assigned to");
  check("branch creation is audited with the tenant", (await one("select count(*)::int n from public.audit_logs where tenant_id = $1 and action = 'tenant.branch_created'", [tenant])).n === 2);
}
const freshTableB = async (label) => (await one("insert into public.restaurant_tables (tenant_id, branch_id, area_id, label) values ($1,$2,$3,$4) returning id", [tenantB, branchB, areaB, label])).id;
const tableB2 = await freshTableB("B Masa 2");
const tableB3 = await freshTableB("B Masa 3");
const tableB4 = await freshTableB("B Masa 4");
await actAs(db, OWNER_B);
check("a running trial is writable", (await rpc("get_plan_usage", { target_tenant_id: tenantB, target_branch_id: branchB })).writable === true);
// the last day counts until 23:59:59 Istanbul time (0042): early on the end date the business still works
await db.query("update public.subscriptions set ends_at = ((now() at time zone 'Europe/Istanbul')::date::timestamp at time zone 'Europe/Istanbul') + interval '1 second' where tenant_id = $1", [tenantB]);
check("on the end date the business is still writable (00:00:01)", (await rpc("get_plan_usage", { target_tenant_id: tenantB, target_branch_id: branchB })).writable === true);
await db.query("update public.subscriptions set ends_at = ((now() at time zone 'Europe/Istanbul')::date::timestamp at time zone 'Europe/Istanbul') - interval '1 second' where tenant_id = $1", [tenantB]);
check("from 00:00:00 of the next day it is read-only (end date 23:59:59 passed)", (await rpc("get_plan_usage", { target_tenant_id: tenantB, target_branch_id: branchB })).writable === false);
await db.query("update public.subscriptions set ends_at = now() - interval '1 day' where tenant_id = $1", [tenantB]);
const expired = await rpc("get_plan_usage", { target_tenant_id: tenantB, target_branch_id: branchB });
check("an ended trial is reported as read-only", expired.writable === false && expired.status === "trial", JSON.stringify(expired));

const ordersOf = async (tenantId) => (await one("select count(*)::int n from public.orders where tenant_id = $1", [tenantId])).n;
const ordersBefore = await ordersOf(tenantB);
await expectError("open_order", { target_tenant_id: tenantB, target_branch_id: branchB, target_table_id: tableB2, target_guest_count: 1, target_items: [{ productId: productB, quantity: 1 }], target_idempotency_key: key() }, "tenant_read_only", "no new orders in read-only mode");
let menuWriteBlocked = false;
try {
  await db.query("insert into public.menu_categories (tenant_id, branch_id, name) values ($1, $2, 'Yeni') ", [tenantB, branchB]);
} catch (error) {
  menuWriteBlocked = String(error.message).includes("tenant_read_only");
}
check("the menu cannot be changed in read-only mode", menuWriteBlocked);
await expectError("save_option_group", { target_tenant_id: tenantB, target_branch_id: branchB, target_group_id: null, target_name: "Porsiyon", target_kind: "variant", target_required: true, target_max_select: null, target_is_active: true, target_choices: [{ name: "Tam", priceDeltaMinor: 0 }], target_product_ids: [] }, "tenant_read_only", "options cannot be changed in read-only mode");
await expectError("set_tenant_theme", { target_tenant_id: tenantB, target_branch_id: branchB, target_theme: "burgundy" }, "tenant_read_only", "settings cannot be changed in read-only mode");
check("nothing was written while read-only", (await ordersOf(tenantB)) === ordersBefore);
check("the owner can still read everything", (await countAs(OWNER_B, "orders")) === ordersBefore && (await countAs(OWNER_B, "products")) === 1);
await actAs(db, WAITER);
const t18 = await table("Masa 18");
const stillWorks = await openOn(t18, [{ productId: cola, quantity: 1 }]);
check("other businesses are not affected", Boolean(stillWorks.orderId));

// only a platform administrator can activate the next period
await actAs(db, OWNER_B);
await expectError("update_tenant_subscription", { target_tenant_id: tenantB, target_plan_code: "START", target_status: "active", target_starts_at: new Date().toISOString(), target_ends_at: null, target_notes: null, target_user_limit: 5, target_branch_limit: 1, target_table_limit: 15, target_station_limit: 1 }, "platform_admin_required", "a business cannot activate itself");
await actAs(db, PLATFORM);
await rpc("update_tenant_subscription", { target_tenant_id: tenantB, target_plan_code: "START", target_status: "active", target_starts_at: new Date().toISOString(), target_ends_at: new Date(Date.now() + 30 * 86400000).toISOString(), target_notes: "ilk ay odendi", target_user_limit: 5, target_branch_limit: 1, target_table_limit: 15, target_station_limit: 1 });
await actAs(db, OWNER_B);
check("the business is writable again once the platform activates it", (await rpc("get_plan_usage", { target_tenant_id: tenantB, target_branch_id: branchB })).writable === true);
const reopened = await rpc("open_order", { target_tenant_id: tenantB, target_branch_id: branchB, target_table_id: tableB3, target_guest_count: 1, target_items: [{ productId: productB, quantity: 1 }], target_idempotency_key: key() });
check("and orders work again", Boolean(reopened.orderId));

// an activated period that runs out turns read-only by itself; the platform can still help
await db.query("update public.subscriptions set ends_at = now() - interval '1 day' where tenant_id = $1 and plan_code = 'START'", [tenantB]);
await expectError("open_order", { target_tenant_id: tenantB, target_branch_id: branchB, target_table_id: tableB4, target_guest_count: 1, target_items: [{ productId: productB, quantity: 1 }], target_idempotency_key: key() }, "tenant_read_only", "an ended paid period is read-only too");
await actAs(db, PLATFORM);
await db.query("insert into public.menu_categories (tenant_id, branch_id, name) values ($1, $2, 'Platform duzeltmesi')", [tenantB, branchB]);
check("a platform administrator can still write to an expired business", (await one("select count(*)::int n from public.menu_categories where tenant_id = $1 and name = 'Platform duzeltmesi'", [tenantB])).n === 1);

// --- result ------------------------------------------------------------------
console.log(`passed: ${passed}`);
if (failures.length) {
  console.log("FAILURES:");
  for (const failure of failures) console.log(" -", failure);
  process.exit(1);
}
console.log("ALL OK");
