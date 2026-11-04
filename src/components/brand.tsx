import Link from "next/link";

type BrandProps = {
  compact?: boolean;
  href?: string;
  inverse?: boolean;
};

export function Brand({ compact = false, href = "/", inverse = false }: BrandProps) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-3 rounded-xl focus-visible:outline-offset-4"
      aria-label="MK Adisyon ana sayfa"
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl text-sm font-black tracking-tight shadow-sm ${
          inverse ? "bg-white text-[#17211d]" : "bg-[#17211d] text-white"
        }`}
      >
        MK
      </span>
      {!compact && (
        <span className="leading-none">
          <span className={`block text-[15px] font-black tracking-[0.14em] ${inverse ? "text-white" : "text-[#17211d]"}`}>
            ADİSYON
          </span>
          <span className={`mt-1 block text-[10px] font-semibold tracking-[0.12em] ${inverse ? "text-white/60" : "text-[#68736e]"}`}>
            DIGITAL SYSTEMS
          </span>
        </span>
      )}
    </Link>
  );
}
