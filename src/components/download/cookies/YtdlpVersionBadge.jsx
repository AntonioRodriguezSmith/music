/**
 * Small read-only badge showing the installed yt-dlp version. Renders nothing
 * until a version string is available.
 */
export default function YtdlpVersionBadge({ version }) {
  if (!version) return null;
  return (
    <p className="text-[10px] text-[#555] truncate" title={version}>
      yt-dlp {version}
    </p>
  );
}
