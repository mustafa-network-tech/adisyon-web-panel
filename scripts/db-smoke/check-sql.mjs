import { parse, parsePlPgSQL } from "libpg-query";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const migrations = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const files = process.argv.length > 2 ? process.argv.slice(2) : fs.readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort().map((f) => migrations + f);
let failed = false;
for (const f of files) {
  const sql = fs.readFileSync(f, "utf8");
  try {
    const tree = await parse(sql);
    let n = 0;
    for (const stmt of tree.stmts) {
      const cf = stmt.stmt.CreateFunctionStmt;
      if (!cf) continue;
      const lang = cf.options.find((o) => o.DefElem.defname === "language")?.DefElem.arg.String.sval;
      if (lang !== "plpgsql") continue;
      const body = cf.options.find((o) => o.DefElem.defname === "as").DefElem.arg.List.items[0].String.sval;
      const params = (cf.parameters || [])
        .filter((p) => p.FunctionParameter.name)
        .map((p) => `${p.FunctionParameter.name} text`)
        .join(", ");
      const rt = (cf.returnType?.names || []).map((x) => x.String.sval).filter((x) => x !== 'pg_catalog').join('.');
      const ret = rt === 'trigger' ? 'trigger' : rt === 'void' ? 'void' : 'text';
      await parsePlPgSQL(`create function _chk(${params}) returns ${ret} language plpgsql as $b$${body}$b$;`);
      n++;
    }
    console.log("OK  ", f.split("/").pop(), "plpgsql bodies:", n);
  } catch (e) {
    console.log("FAIL", f, e.message);
    failed = true;
  }
}
if (failed) process.exit(1);
