export function isFinished(status) {
  return status === "finished";
}

export function isActive(status) {
  return (
    status === "downloading" ||
    status === "starting" ||
    status === "downloaded" ||
    status === "converting" ||
    status === "queued" ||
    status === "retrying"
  );
}

/** Map backend status codes to i18n keys under download.status.* */
export function statusTranslationKey(status) {
  if (!status) return "unknown";
  if (status.startsWith("error")) return "error";
  switch (status) {
    case "starting":
      return "starting";
    case "queued":
      return "queued";
    case "downloading":
    case "downloaded":
      return "downloading";
    case "converting":
      return "converting";
    case "finished":
      return "finished";
    case "paused":
      return "paused";
    case "cancelled":
      return "cancelled";
    case "retrying":
      return "retrying";
    case "interrupted":
      return "interrupted";
    default:
      return "unknown";
  }
}
