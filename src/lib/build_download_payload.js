import { cookieInvokeArgs } from "./cookies_prefs";

export function buildDownloadPayload({
  formData,
  downloadPath,
  formatId,
  url,
  title,
  sourceExt,
}) {
  const cookies = cookieInvokeArgs();
  return {
    ...formData,
    output_dir: downloadPath || "",
    format: formatId,
    url,
    title,
    output_ext: sourceExt === formData.output_ext ? null : formData.output_ext,
    ...cookies,
  };
}
