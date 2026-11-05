import { companyLines, legalUpdatedAt } from "@/lib/legal";
import type { LegalDocument } from "@/lib/legal-content";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent-d4)]">Yasal</p>
      <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] text-[color:var(--c-ink)] sm:text-5xl">{doc.title}</h1>
      <p className="mt-3 text-sm font-semibold text-[#4f5a55]">Son güncelleme: {dateFormatter.format(new Date(`${legalUpdatedAt}T12:00:00Z`))}</p>
      <p className="mt-6 text-base leading-7 text-[#33413b]">{doc.intro}</p>

      <nav aria-label="İçindekiler" className="mt-8 rounded-2xl border border-[#e1e6e3] bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#4f5a55]">İçindekiler</p>
        <ol className="mt-3 grid gap-1.5 text-sm font-semibold sm:grid-cols-2">
          {doc.sections.map((section) => (
            <li key={section.id}><a href={`#${section.id}`} className="text-[color:var(--c-accent-d4)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">{section.heading}</a></li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-10">
        {doc.sections.map((section) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-baslik`} className="scroll-mt-8">
            <h2 id={`${section.id}-baslik`} className="text-2xl font-black tracking-tight text-[color:var(--c-ink)]">{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-base leading-7 text-[#33413b]">{paragraph}</p>
            ))}
            {section.items && (
              <ul className="mt-3 list-disc space-y-2 pl-6 text-base leading-7 text-[#33413b]">
                {section.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
            {section.table && (
              <div role="region" aria-label={`${section.heading} tablosu`} tabIndex={0} className="mt-4 overflow-x-auto rounded-2xl border border-[#e1e6e3] bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--c-accent-d3)]">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#e8ecea] bg-[#f6f8f7]">
                      {section.table.head.map((cell) => <th key={cell} scope="col" className="p-3 text-xs font-black uppercase tracking-[0.08em] text-[#4f5a55]">{cell}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {section.table.rows.map((row) => (
                      <tr key={row[0]} className="border-b border-[#f0f3f1] align-top last:border-0">
                        {row.map((cell, index) => index === 0
                          ? <th key={cell} scope="row" className="p-3 font-black text-[#17211d]">{cell}</th>
                          : <td key={cell} className="p-3 leading-6 text-[#33413b]">{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>

      <aside aria-label="Şirket bilgileri" className="mt-14 rounded-2xl border border-[#e1e6e3] bg-white p-5 text-sm leading-6 text-[#33413b]">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#4f5a55]">Hizmeti sunan</p>
        {companyLines().map((line) => <p key={line} className="mt-1 font-semibold">{line}</p>)}
      </aside>
    </article>
  );
}
