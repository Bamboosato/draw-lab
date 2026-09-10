const APP_NAME = "DrawLab";

export function getDocumentTitle(competitionTitle?: string): string {
  const normalizedTitle = competitionTitle?.trim();
  return normalizedTitle ? `${APP_NAME}　＞${normalizedTitle}` : APP_NAME;
}
