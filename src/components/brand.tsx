import Image from "next/image";
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
    >
      <span
        className={`grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-sm ${
          inverse ? "" : "ring-1 ring-[#dfe5e1]"
        }`}
      >
        {/* The 192 px app icon is sharp at 48 px on normal and high-density screens. */}
        <Image
          src="/icons/app-icon-192.png"
          alt={compact ? "MK Adisyon" : ""}
          width={48}
          height={48}
          priority
        />
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
