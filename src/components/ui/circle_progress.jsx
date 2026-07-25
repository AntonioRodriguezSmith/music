import { parsePercentage } from "../../lib/parse_percentage";

export default function CircularProgressBar({ download }) {
  const pct = parsePercentage(download.percentage);
  return (
    <div className="relative size-8 my-0.5">
      <svg className="size-full -rotate-90" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
        <circle cx="18" cy="18" r="16" fill="none" className="stroke-current text-gray-200" strokeWidth="2" />
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          className="stroke-current text-black"
          strokeWidth="2"
          strokeDasharray="100"
          strokeDashoffset={100 - pct}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
