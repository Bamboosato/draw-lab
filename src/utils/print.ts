export function buildTournamentPrintFilename(title?: string): string {
  return `${title?.trim() || "トーナメント"}_トーナメント表`;
}

export function buildLeaguePrintFilename(title: string | undefined, groupName: string): string {
  return `${title?.trim() || "リーグ"}_リーグ表-グループ${groupName}`;
}

export function printWithFilename(filename: string): void {
  const previousTitle = document.title;
  const printTitle = filename.trim();
  let restored = false;

  const restoreTitle = () => {
    if (restored) return;
    restored = true;
    document.title = previousTitle;
    window.removeEventListener("afterprint", restoreTitle);
  };

  if (printTitle) document.title = printTitle;
  window.addEventListener("afterprint", restoreTitle, { once: true });

  try {
    window.print();
  } catch (error) {
    restoreTitle();
    throw error;
  }
}
