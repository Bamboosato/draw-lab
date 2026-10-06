# 実装状況と文書の対応

確認日: 2026-10-06

アプリ機能の確認元: GitHub `main`と一致する`a1ecba6afc9c68b9444072fcf15acd7bc41fc508`のコード・既存テスト。依存性CIの追加と依存更新は[監査の検証記録](dependency-security.md)を参照。

本書は、1.0.0リリース後の追加機能を含む現在の実装を整理する。要件を変更する文書ではなく、要件・設計から実装を確認するための案内とする。アプリと各設計文書の版番号は別に管理する。

## 実装済みの機能

ソースはリポジトリルートからの相対パス。同じセルでディレクトリを省略したファイルは、直前のファイルと同じディレクトリにある。

| 機能 | 実装箇所 | 要件・設計 |
|---|---|---|
| 共通ホーム、件数・状態・最近更新 | `src/pages/HomePage.tsx`、`src/app/homeViewModel.ts` | [共通要件](requirements.md)、[画面仕様](screen-spec.md) |
| ルーティング、手順の制限、文書タイトル | `src/app/App.tsx`、`tournamentFlow.ts`、`leagueFlow.ts`、`documentTitle.ts` | [画面仕様](screen-spec.md) |
| 基本情報・シングルス / ダブルス / チーム名簿 | `src/pages/BasicInfoPage.tsx`、`EntrantsPage.tsx`、`src/domain/validation.ts` | [トーナメント要件](requirements.md)、[ロジック仕様](logic-spec.md) |
| 4〜128ドロー、シード・BYE・偏り回避・乱数再現 | `src/domain/types.ts`、`drawGenerator.ts`、`seedPlacement.ts`、`byePlacement.ts`、`scoring.ts`、`random.ts` | [トーナメント要件](requirements.md)、[ロジック仕様](logic-spec.md) |
| 自動再生成、完了と編集再開 | `src/app/tournamentModel.ts`、`TournamentProvider.tsx`、`src/pages/PreviewPage.tsx` | [トーナメント要件](requirements.md)、[画面仕様](screen-spec.md) |
| 対戦確定、勝敗・ゲーム数・備考・WO、勝ち上がり | `src/domain/tournamentMatches.ts`、`matchScoring.ts`、`src/pages/TournamentMatchesPage.tsx` | [トーナメント要件](requirements.md)、[ロジック仕様](logic-spec.md) |
| 片山 / 両山、ページ分割・表示設定、スコア・WO表示 | `src/domain/outputOptions.ts`、`bracketViewModel.ts`、`src/components/DrawPreview.tsx`、`src/styles/print.css` | [出力形式要件](output-format-options-requirements.md)、[画面仕様](screen-spec.md) |
| モバイルメニュー、100〜300%拡大、ピンチ・ドラッグ | `src/components/AppShell.tsx`、`BracketZoom.tsx`、`src/styles/globals.css` | [画面仕様](screen-spec.md) |
| リーグ名簿、選出・補欠・入替、グループ分け | `src/pages/LeagueParticipantsPage.tsx`、`LeagueGroupsPage.tsx`、`src/app/leagueModel.ts`、`src/domain/leagueGrouping.ts` | [リーグ要件](league-requirements.md)、[設計](league-design.md) |
| リーグ候補カード、有効選択・確定、結果・自動順位・訂正順位 | `src/pages/LeagueMatchesPage.tsx`、`LeagueDashboardPage.tsx`、`src/domain/leagueLogic.ts`、`matchScoring.ts` | [リーグ要件](league-requirements.md)、[設計](league-design.md) |
| 結果付き / 手書き用リーグPDF、詳細表示・WO | `src/domain/leaguePrint.ts`、`src/components/LeagueMatrixPrintDocument.tsx`、`src/styles/print.css` | [リーグ要件](league-requirements.md)、[設計](league-design.md) |
| リーグから順位区分別トーナメント作成、グループ・順位配置 | `src/components/LeagueTournamentCreateDialog.tsx`、`src/app/leagueTournamentAdapter.ts`、`leagueTournamentPlacement.ts` | [連携要件](league-tournament-integration-requirements.md)、[設計](league-tournament-integration-design.md) |
| IndexedDB、旧localStorage移行、連携情報の一括保存 | `src/storage/appDatabase.ts`、`tournamentRepository.ts`、`leagueRepository.ts`、`tournamentIntegrationRepository.ts`、`localStorageMigration.ts` | [保存要件](requirements.md)、[ロジック仕様](logic-spec.md)、[連携設計](league-tournament-integration-design.md) |
| 個別JSON、種別ごとの全件バックアップ・復元 | `src/app/tournamentPersistence.ts`、`src/storage/leagueJson.ts`、`src/pages/JsonImportPage.tsx`、`LeagueJsonImportPage.tsx` | [JSON要件](requirements.md)、[リーグ設計](league-design.md)、[連携設計](league-tournament-integration-design.md) |
| PWA、オフライン起動、更新・インストール案内 | `vite.config.ts`、`pwa/`、`src/components/PwaStatus.tsx`、`PwaInstallGuide.tsx` | [共通要件](requirements.md)、[画面仕様](screen-spec.md) |
| CIの依存性監査、開発依存の期限付き例外、監査JSON保存 | `.github/workflows/ci.yml`、`scripts/security-audit.mjs`、`scripts/security-audit-policy.mjs`、`./security-audit-exception.json` | [依存性セキュリティ監査](dependency-security.md) |

初期の推奨案にある`src/renderers/`は現在使用していない。生成と描画の責務を分離し、描画用ViewModelは`src/domain/bracketViewModel.ts`、SVG描画は`src/components/DrawPreview.tsx`に置く。リーグ設計の`leagueValidation`、`leagueSelection`、`leagueSchedule`などの責務は、主に`src/domain/leagueLogic.ts`と`src/app/leagueModel.ts`へ分割されている。

## データ形式と復元範囲

IndexedDBは`draw-lab`、バージョン3。`tournaments`、`leagues`、`metadata`、`tournamentIntegrations`を持つ。

| JSON | 出力形式 | 収録内容 | 復元 |
|---|---|---|---|
| 個別大会 | `schemaVersion: 1`、`tournament`、任意の`integration` | トーナメント1件と連携スナップショット | IDを再採番して追加 |
| 全大会 | `schemaVersion: 1`、`tournaments`、任意の`integrations` | 全トーナメントと連携スナップショット | トーナメント・連携情報を同一トランザクションで全置換 |
| 個別リーグ | `kind: draw-lab-league`、`schemaVersion: 2`、`league` | リーグ1件 | IDを再採番して追加 |
| 全リーグ | `kind: draw-lab-league-backup`、`schemaVersion: 2`、`leagues` | 全リーグ | リーグを全置換 |

全大会バックアップはリーグ本体を含まない。全リーグバックアップはトーナメントと連携情報を含まない。アプリ全体の移行には両方が必要であり、一方の復元で他方を変更しない。リーグJSONの入力は旧バージョン1も受け入れる。連携情報がない旧トーナメントバックアップの復元では連携storeを空にする。

WOは通常のBYE枠とは別の試合記録である。チェックだけでは勝者を選択せず、勝者選択済みのカードで記録する。記録済みゲーム数は保持するが、リーグ順位のセット率・ゲーム率からWO試合を除外する。

## 現在の制約・未対応範囲

- クラウド保存、認証、共有URL、共同編集、サーバーサイドPDF生成、Excelファイルの直接入出力は未対応。
- リーグ連携は対戦カード確定済みのリーグを候補とし、1トーナメント1順位区分のスナップショットを作成する。複数区分の一括作成、自動再同期、結果の相互反映、親大会モデルは未対応。
- スマートフォンのメニューと表閲覧に対応するが、大規模名簿編集の主対象はPC。画面拡大は印刷へ反映しない。
- ドローサイズは4 / 8 / 16 / 32 / 64 / 128。片山の実効ページ数は1、両山は1ページ4ドロー以上の範囲で最大32ページ。印刷側の設定により厳密なページ数は変わり得る。
- 1 / 3 / 5セットのゲーム数記録と勝者の補助的な自動選択に対応する。手動結果をスコア変更で上書きせず、競技団体規則に基づく完全なスコア妥当性検証は行わない。
- ブラウザ保存はOrigin単位。オフライン起動には初回オンライン読み込みとキャッシュ準備が必要で、未キャッシュ環境での初回オフライン利用は対象外。

## 文書確認・検証の観点

文書変更の検証は、次の観点を先に定めて行う。

| 観点 | 確認する意図 |
|---|---|
| 機能 | 実装済み機能を未実装・将来予定として扱っていないこと |
| 非機能 | Origin、ブラウザ対応、オフライン前提、印刷設定による制約を正しく説明すること |
| データ | DB・JSON版、型の省略可能項目、参照ID、バックアップと全置換の対象が一致すること |
| UI | 画面名・ルート・操作・モバイルメニュー・画面専用ズームが画面仕様と一致すること |
| 正常系 | 生成、結果反映、保存・復元、リーグから作成の説明を既存テストで裏付けること |
| 異常系 | 入力エラー、不正JSON、保存・復元失敗の扱いを成功と混同しないこと |
| 境界値 | 4 / 128ドロー、出力ページ数、100 / 300%倍率、順位区分の範囲を区別すること |
| 状態遷移 | 未生成→生成、未確定→確定、運用→完了→編集再開、全置換の確認・キャンセルを区別すること |

以下は依存性CI導入前の文書照合時の検証記録。文書のみを変更し、生成・結果・状態遷移、保存・JSON、リーグ順位・連携、出力設定、メニュー・倍率操作を裏付ける既存テストに範囲を絞った。

- Vitest: 関連17ファイル・230件成功。対象は`drawGenerator`、`validation`、`tournamentModel`、`tournamentMatches`、`tournamentBackup`、`tournamentIntegrationRepository`、`leagueLogic`、`leagueModel`、`leagueJson`、`leagueRepository`、`leagueTournamentAdapter`、`leagueTournamentPlacement`、`outputOptions`、`BracketZoom`、`AppShell`、`leaguePrint`、`print`の既存テスト。
- `npm run typecheck`成功。
- Markdown内の相対リンク57件、対応表の実装参照55件について参照先の存在を確認。文書のモデル項目・省略可能性をTypeScript定義と比較。
- `git diff --check`成功。

この文書照合時は実ブラウザE2E・クロスブラウザ・全E2Eを未実施とした。その後の依存更新では単体テスト全件と画面遷移の実ブラウザ確認を実施し、[監査の検証記録](dependency-security.md)へ記載する。PDFレイアウト・PWAの更新／オフライン挙動は再検証していない。
