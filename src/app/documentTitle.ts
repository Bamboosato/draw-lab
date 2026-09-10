const APP_NAME = "DrawLab";
export type DocumentTitleCompetition = "トーナメント" | "リーグ";
export type DocumentTitleStatus = "編集中" | "運用中" | "完了";

export function getDocumentTitle(
  competition?: DocumentTitleCompetition,
  competitionTitle?: string,
  status?: DocumentTitleStatus,
): string {
  if (!competition) {
    return APP_NAME;
  }

  const normalizedTitle = competitionTitle?.trim();
  if (!normalizedTitle) {
    return status
      ? `${APP_NAME}　${competition}｜${status}`
      : `${APP_NAME}　${competition}`;
  }

  return status
    ? `${APP_NAME}　${competition}＞${normalizedTitle}｜${status}`
    : `${APP_NAME}　${competition}＞${normalizedTitle}`;
}
