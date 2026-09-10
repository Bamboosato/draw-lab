const APP_NAME = "DrawLab";
export type DocumentTitleStatus = "編集中" | "運用中" | "完了";

export function getDocumentTitle(
  competitionTitle?: string,
  status?: DocumentTitleStatus,
): string {
  const normalizedTitle = competitionTitle?.trim();
  if (!normalizedTitle) {
    return APP_NAME;
  }

  return status
    ? `${APP_NAME}　＞${normalizedTitle}｜${status}`
    : `${APP_NAME}　＞${normalizedTitle}`;
}
