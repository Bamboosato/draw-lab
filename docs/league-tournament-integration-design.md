# リーグ・トーナメント連携機能 設計書

- **対象:** `draw-lab` のリーグからトーナメントを作成する機能
- **文書種別:** 連携機能 設計書
- **バージョン:** 0.1.0
- **作成日:** 2026-09-01
- **更新日:** 2026-10-06
- **要件正:** `docs/league-tournament-integration-requirements.md`
- **関連要件:** `docs/requirements.md`、`docs/league-requirements.md`
- **関連設計:** `docs/league-design.md`、`docs/logic-spec.md`、`docs/screen-spec.md`

本書は、リーグから順位区分別のトーナメントを作成する機能を、既存のリーグ機能とトーナメント機能の責務を分離したまま実装するための設計を定める。

スナップショット連携は実装済みであり、現在の実装ファイルは[実装状況](implementation-status.md)を参照する。第15章は連携全体ではなく、現在未対応の拡張範囲を示す。

---

## 1. 設計方針

### 1.1 主モデルを統合しない

`League` と `Tournament` は引き続き別の主モデル、別の保存領域、別のライフサイクルとして扱う。

```text
League
  └─ LeagueParticipant / LeagueGroup / LeagueStanding

Tournament
  └─ Entrant / GeneratedDraw

League → 連携アダプター → Tournament
```

リーグ固有の試合結果、勝点、順位表を `Tournament` の中核モデルへ直接追加しない。連携に必要な情報は、共通DTOとトーナメント単位の連携レコードを介して扱う。

### 1.2 一方向スナップショット

- 作成開始時にリーグのデータを読み込む。
- トーナメント側へ参加者・基本情報・グループ・順位のスナップショットを保存する。
- 以後のリーグ変更は既存トーナメントへ反映しない。
- リーグの最新状態から作成し直す場合は、新しいトーナメントを作成する。

### 1.3 1トーナメント1順位区分

基本情報画面は1つのトーナメントを編集する画面であるため、順位区分も1つだけ保持する。

```text
Tournament A: 1-2位
Tournament B: 3-4位
```

複数区分の一括作成や、1画面で複数表を管理する親子構造は初期実装に含めない。

---

## 2. システム構成

```text
TournamentListPage
        |
        | 「リーグから作成」
        v
Tournament BasicInfoPage
        |
        | source league / rank range
        v
LeagueToTournamentSetup
        |
        v
Tournament EntrantsPage
        |
        | common data + group/rank editing
        v
Tournament generation service
  - rank range filtering
  - existing team/region avoidance
  - league group/rank placement
        |
        v
GeneratedDraw / Tournament preview

LeagueRepository ── read only ──┐
                                ├─ LeagueToTournamentAdapter
TournamentRepository ──────────┘
TournamentIntegrationRepository
```

連携処理はReactコンポーネントから分離し、次の責務に分割する。

| 責務 | 推奨モジュール | 内容 |
|---|---|---|
| 共通型 | `src/domain/competitionTypes.ts` | 基本情報、共通参加者情報 |
| 連携型 | `src/domain/leagueTournamentTypes.ts` | 出典、順位区分、配置メタデータ |
| 変換 | `src/domain/leagueTournamentAdapter.ts` | LeagueからTournament用データへの変換 |
| 抽出 | `src/domain/leagueTournamentSelection.ts` | 順位区分に該当する参加者の抽出 |
| 配置 | `src/domain/leagueTournamentPlacement.ts` | グループ・順位の配置スコア |
| UIフロー | `src/app/leagueTournamentFlow.ts` | 作成モード、保存、変更確認 |
| 保存 | `src/storage/tournamentIntegrationRepository.ts` | トーナメントとの連携レコード |

---

## 3. 共通データ形式

### 3.1 基本情報

リーグとトーナメント間の変換用に、共通の基本情報DTOを定義する。保存中の主モデルをこのDTOへ置き換えることはしない。

```ts
type CompetitionParticipantType = "individual" | "doubles" | "team";

type CompetitionBasicInfo = {
  title: string;
  date: string;
  venue: string;
  eventName: string;
  participantType: CompetitionParticipantType;
};
```

トーナメントの既存値との変換は次のとおりとする。

```text
League individual → Tournament singles
League doubles   → Tournament doubles
League team      → Tournament team
```

### 3.2 共通参加者情報

```ts
type CommonParticipantMember = {
  name: string;
  affiliation?: string;
};

type CommonParticipantUnit = {
  id: string;
  participantType: CompetitionParticipantType;
  displayName: string;
  members: CommonParticipantMember[];
  affiliation?: string;
  region?: string;
  note?: string;
};
```

`id` はDTO内の参照用IDであり、リーグとトーナメントをまたぐグローバルIDとはしない。トーナメント側の `Entrant.id` は新規発行する。

項目の意味を混同しないため、次を分離する。

- `displayName`: 表示名。チーム種目ではトーナメント表へ表示するチーム名。
- `members`: 参加単位を構成するメンバー。
- `affiliation`: 同じ所属を避けるために利用する所属情報。
- `region`: 地区情報。
- `note`: 備考。
- `group`: リーグ由来のグループ。共通参加者情報ではなく配置メタデータ。
- `rank`: リーグ由来の順位。シード番号やランキングとは別の情報。

### 3.3 連携セット

基本情報画面から名簿入力画面へ渡す一時的なデータ形式を定義する。

```ts
type RankRange = {
  min: number;
  max: number;
};

type LeagueSourceRef = {
  leagueId: string;
  leagueUpdatedAt: string;
  matchSelectionStatus: "confirmed";
};

type LeagueParticipantPlacement = {
  sourceParticipantId: string;
  sourceGroupId?: string;
  sourceGroupName?: string;
  sourceGroupOrder?: number;
  rank?: number;
  rankOrigin?: "league" | "tournament-manual";
};

type LeagueToTournamentSetup = {
  kind: "league-to-tournament";
  schemaVersion: 1;
  source: LeagueSourceRef;
  basicInfo: CompetitionBasicInfo;
  rankRange: RankRange;
  participants: Array<CommonParticipantUnit & {
    placement: LeagueParticipantPlacement;
  }>;
};
```

`participants` にはリーグの選択済み参加者をすべて含める。順位区分による抽出は、名簿入力後のトーナメント生成時に行う。これにより、元リーグの順位が未入力でも、トーナメント名簿画面で手動入力できる。

---

## 4. 保存データ設計

### 4.1 連携レコード

既存の `Tournament` と `League` の中核型へリーグ固有項目を大量に追加せず、トーナメントIDに紐づく連携レコードを別保存する。

```ts
type TournamentIntegrationRecord = {
  tournamentId: string;
  kind: "league-to-tournament";
  schemaVersion: 1;
  source: LeagueSourceRef;
  sourceGroupSizes?: number[];
  rankRange: RankRange;
  participants: Array<{
    tournamentEntrantId: string;
    sourceParticipantId?: string;
    sourceGroupId?: string;
    sourceGroupName?: string;
    sourceGroupOrder?: number;
    groupKey?: string;
    groupLabel?: string;
    rank?: number;
    rankOrigin?: "league" | "tournament-manual";
  }>;
  createdAt: string;
  updatedAt: string;
};
```

役割を次のように分ける。

| 情報 | 保存先 | 理由 |
|---|---|---|
| 表示名、メンバー、所属、地区、備考 | `Tournament.entrants` | 通常のトーナメント名簿として編集・生成するため |
| 引継ぎ元リーグID | 連携レコード | 出典情報であり、Tournament本体の生成項目ではないため |
| 順位区分 | 連携レコード | 1トーナメントの抽出条件として保持するため |
| リーグ参加者ID | 連携レコード | 出典との対応関係を確認するため |
| グループ・順位 | 連携レコード | 配置用メタデータとして編集・参照するため |
| 生成結果 | `Tournament.generatedDraw` | 既存のトーナメント生成・表示を利用するため |

`groupKey` は配置判定用の安定したキー、`groupLabel` は画面表示用の名称とする。リーグのグループ名が変更されても、作成済みスナップショットの表示は変更しない。

`sourceGroupSizes` は引継ぎ時点の各グループ人数を保持する。順位区分の終了順位は、すべてのグループで該当順位を扱えるよう、これらの最小値以下に制限する。

### 4.2 IndexedDB

既存の `tournaments`、`leagues` object storeは変更せず、連携レコード用の `tournamentIntegrations` object storeを追加する。

```text
Database: draw-lab
Version: 3
Stores:
  tournaments
  leagues
  metadata
  tournamentIntegrations  keyPath: tournamentId
```

保存操作:

- トーナメントの保存と連携レコードの保存を同一トランザクションで行う。
- 通常のトーナメントには連携レコードを作成しない。
- 連携トーナメントの削除時は連携レコードも削除する。
- 連携トーナメントの複製時は、参加者IDの対応を新しい `Entrant.id` へ再構成する。
- 連携レコードだけが残る孤児データを起動時または削除処理で整理する。

既存DBのアップグレード時は、既存の3ストアのデータを変更せず、新しいobject storeだけを追加する。

### 4.3 JSON

既存トーナメントJSONの後方互換性を維持するため、連携情報は任意の追加プロパティとして扱う。

```ts
type TournamentJsonEnvelopeV2 = {
  kind: "draw-lab-tournament";
  schemaVersion: number;
  exportedAt: string;
  tournament: Tournament;
  integration?: TournamentIntegrationRecord;
};
```

全大会バックアップでは、トーナメントと連携レコードをIDで対応させる。

```ts
type TournamentBackupJsonEnvelopeV2 = {
  kind: "draw-lab-tournament-backup";
  schemaVersion: number;
  exportedAt: string;
  tournaments: Tournament[];
  integrations?: TournamentIntegrationRecord[];
};
```

インポート時の方針:

- 旧形式で `integration` がないデータは通常トーナメントとして扱う。
- トーナメントID、参加者IDが再発行される場合は、連携レコード内のトーナメント参加者IDも再マッピングする。
- 引継ぎ元リーグが現在のDBに存在しなくても、コピー済みのトーナメント名簿・順位・グループ・プレビューを利用できる。
- 出典リーグが存在しない場合は「引継ぎ元リーグは現在の保存領域にありません」と表示するが、トーナメントの利用は妨げない。
- 不正な参照、重複した `tournamentEntrantId`、不正な順位区分はインポートしない。

---

## 5. 画面設計

### 5.1 作成開始

既存のトーナメント一覧の追加アクションメニューに、次の項目を追加する。

```text
リーグから作成
```

押下時は、リーグ・順位区分指定ダイアログを表示する。ダイアログで確定した後に `Tournament` と連携レコードを作成し、基本情報画面へ遷移する。キャンセル時は空の `Tournament` を作成しない。

連携作成モードは、次のいずれかで判定できるようにする。

- 連携レコードが存在する。
- 作成開始時に `mode=from-league` をルーティング状態として渡す。

再読込後もモードを失わないよう、基本情報を保存した時点で連携レコードを保存する。

### 5.2 基本情報画面

既存の基本情報項目に、連携用の項目を追加する。

```text
作成方法       リーグから作成
引継ぎ元リーグ [選択]
状態           対戦カード確定
定員           32名
グループ数     4グループ
選択済み       32名
順位区分       [1]位 ～ [2]位
ドローサイズ   8ドロー
```

仕様:

- 引継ぎ元候補は `matchSelectionStatus === "confirmed"` のリーグだけとする。
- `status === "completed"` でも対戦カード確定済みなら候補に含める。
- リーグ選択後に状態、定員、グループ数、選択済み人数を表示する。
- グループ数0の場合は「未作成」と表示する。
- 1トーナメントにつき順位区分は1つだけ指定する。
- 順位区分は選択式とし、開始順位はグループ内の人数まで、終了順位は開始順位以上かつグループ内の人数以下から選択する。画面では `N-M位` と表示する。
- 一覧の作成アクションでは、引継ぎ元と順位区分をダイアログで先に指定する。状態、定員、グループ数、選択済み人数はコンパクトな概要で表示する。
- 初回作成時は、リーグの基本情報を初期値としてコピーする。大会名は`リーグ名（N-M位）`、ドローサイズは`グループ数 × 順位数`とする。
- 基本情報画面で引継ぎ元を変更しても、大会名、開催日、会場、種目名、ドローサイズ、シード数、生成オプションは自動更新しない。手動編集済みかどうかも判定しない。
- `participantType` はリーグから決定し、連携作成モードでは変更不可とする。
- ドローサイズ、シード数、その他の通常トーナメント設定は既存項目として表示する。

順位区分の入力チェックは、画面入力時と保存時の両方で行う。範囲を変更した場合は生成済みドローを無効化する。順位区分変更時の大会名とドローサイズは、直前の順位区分から自動生成された値と一致している場合だけ新しい区分から再計算し、手動編集済みの場合は保持する。新しい区分の算出値が既存のドローサイズ候補外なら、ドローサイズは現在値を保持する。引継ぎ元変更時は、この自動更新を行わず、現在の大会名・ドローサイズを保持する。

### 5.3 名簿入力画面

連携作成モードでは、既存の種目別名簿列に加えて、配置情報を表示する。

```text
No | 選手名/チーム名 | メンバー | 所属 | 地区 | グループ | 順位 | 操作
```

仕様:

- リーグの選択済み参加者を初期コピーする。
- グループ・順位はコピー済みの値を初期表示する。
- 未入力値は空欄で表示する。
- グループ・順位は直接編集できる。
- 引継ぎ元が存在しない復元データでも、保存済みの連携レコードを使って表示する。
- 参加者を削除した場合、対応する連携メタデータも削除する。
- 参加者を追加した場合、出典参加者IDは持たない新規行として扱う。
- 参加者の共通情報を編集しても、引継ぎ元リーグは変更しない。

グループの入力は、リーグから引き継いだグループを選択できるほか、未作成の場合は手動入力できる方式とする。手動入力で同じグループ名を入力した参加者は、同じ配置グループとして扱う。

順位は正の整数を入力する。順位の空欄は編集中は許可し、生成前に警告またはエラーとして扱う。

### 5.4 オプション設定画面

既存のオプション設定を利用する。

- 同一所属回避を継続する。
- 同一地区回避を継続する。
- リーグ由来のグループ・順位回避は、連携レコードから自動的に有効にする。
- 順位をシード番号へ自動変換しない。
- シード番号を手動指定した場合は、既存のシード配置ロジックを優先する。

### 5.5 プレビュー画面

既存プレビューを利用し、次の情報を追加表示できるようにする。

- 引継ぎ元リーグ名
- 順位区分
- リーグ由来トーナメントであること

トーナメント一覧では順位区分を識別できる初期大会名を設定する。例:

```text
春季大会（リーグ 1-2位）
```

ユーザーが大会名を変更しても、連携レコードの順位区分は変更しない。

---

## 6. 変換処理

### 6.1 引継ぎ元の選定

```ts
function getLeagueSources(leagues: League[]): League[] {
  return leagues.filter(
    (league) => league.matchSelectionStatus === "confirmed",
  );
}
```

候補リーグの表示には、画面用のViewModelを使用する。

```ts
type LeagueSourceOption = {
  id: string;
  label: string;
  statusLabel: string;
  capacity: number;
  groupCount: number;
  selectedCount: number;
  participantType: CompetitionParticipantType;
  updatedAt: string;
};
```

`groups.length` は保存されたグループ数、`selection.selectedParticipantIds.length` は選択済み人数として表示する。定員と選択済み人数を同じ項目として扱わない。

### 6.2 基本情報変換

```ts
function toCompetitionBasicInfo(league: League): CompetitionBasicInfo {
  return {
    title: league.title,
    date: league.date ?? "",
    venue: league.venue ?? "",
    eventName: league.eventName ?? "",
    participantType: league.participantType,
  };
}
```

トーナメントの `matchType` へ変換するときだけ、`individual` を `singles` へ変換する。

### 6.3 参加者変換

```ts
function toCommonParticipant(
  league: League,
  participant: LeagueParticipant,
): CommonParticipantUnit {
  return {
    id: participant.id,
    participantType: participant.participantType,
    displayName: participant.displayName,
    members: participant.memberNames
      .filter((name) => name.trim())
      .map((name) => ({ name })),
    affiliation: participant.team || undefined,
    region: participant.region || undefined,
    note: participant.note || undefined,
  };
}
```

トーナメント固有の変換では、既存の種目別フィールドへ設定する。

- 個人: 選手名、所属、地区、備考。
- ダブルス: ペア名、選手1、選手2、所属情報、地区、備考。
- チーム: 表示用チーム名、1名以上のメンバー、所属、地区、備考。

チーム種目では `displayName` を `teamName` として扱い、`affiliation` は既存の同所属回避用フィールドへ設定する。チーム名の重複やメンバー名の重複は検査しない。

### 6.4 グループ・順位変換

リーグのグループは `participantId` から逆引きする。

```ts
type LeaguePlacementLookup = Map<string, {
  sourceGroupId: string;
  sourceGroupName: string;
  sourceGroupOrder: number;
  rank?: number;
}>;
```

順位は、訂正順位があれば `LeagueStanding.manualRank`、なければ勝点、直接対決、セット率、ゲーム率、グループ内の参加者順から計算した `LeagueStanding.rank` を使用する。訂正順位は自動順位とは別に保持し、入力済みの場合は確定順位として扱う。

- `manualRank` がある場合は訂正順位として優先して引き継ぐ。
- `manualRank` がない場合は自動計算した `rank` を引き継ぐ。
- 旧JSONなどで `rank` が未保持の場合は、現在の対戦結果・スコアとグループ内の参加者順から自動順位を再計算する。
- `rankOrigin` はリーグからコピーした値を `league` とする。
- 名簿入力画面で編集した値は `tournament-manual` とする。

---

## 7. 順位区分抽出

### 7.1 抽出関数

```ts
function isRankInRange(rank: number | undefined, range: RankRange): boolean {
  return rank !== undefined
    && rank >= range.min
    && rank <= range.max;
}
```

生成時は、通常のトーナメントとして有効な参加者を求めた後、連携レコードの順位区分で絞り込む。

```text
Tournament.entrants
  ↓ 通常の種目別バリデーション
有効な参加者
  ↓ rankRangeで抽出
順位区分の対象参加者
  ↓ drawSize、seed、BYE、配置
GeneratedDraw
```

### 7.2 欠落データ

- 順位未入力者は自動補完しない。
- 順位未入力者は区分抽出の対象外とし、人数を警告する。
- 対象参加者が0名または1名の場合はエラーとする。
- 未入力者がいても対象参加者が2名以上なら、警告確認後に生成できる。
- グループ未入力者はグループに関する配置制約の対象外とする。
- 順位重複は警告とし、best effortで配置する。

この扱いにより、順位未入力のリーグを選択して名簿入力を開始できる一方、順位がまったくない状態で不意に全員を順位区分へ含めることを防ぐ。

### 7.3 ドローサイズ・シード・BYE

- 抽出対象人数を既存の有効参加者数として扱う。
- ドローサイズが対象人数未満なら既存エラーとする。
- ドローサイズが対象人数を上回る場合は既存のBYE計算を利用する。
- 順位はシード番号へ変換しない。
- シード番号を指定した場合は既存のシード配置を利用する。
- 順位区分変更、順位変更、グループ変更、参加者変更は生成結果を古くする。

---

## 8. グループ・順位配置ロジック

### 8.1 既存ロジックとの合成

現在のトーナメント配置は、初戦の同所属・同地区、同四半分、同半分のペナルティを計算する。連携由来の制約は、これに追加する初戦ペナルティとして実装する。

```ts
type LeaguePlacementContext = {
  mode: "multi-group" | "single-group";
  byEntrantId: Map<string, {
    groupKey?: string;
    rank?: number;
  }>;
};
```

通常トーナメントでは `LeaguePlacementContext` を渡さず、既存結果を変更しない。

### 8.2 複数グループ

2つ以上のグループキーが存在する場合は `multi-group` とする。

初戦の対戦相手に対し、次の順序でペナルティを加える。

1. 同一グループかつ同一順位: 最大ペナルティ
2. 同一グループ: 中程度のペナルティ
3. 同一順位: 中程度のペナルティ
4. 同じ所属チーム: 既存ペナルティ
5. 同じ地区: 既存ペナルティ

ここでいう「同一順位、同一グループ」は、同一順位かつ同一グループの組み合わせを指す。すべての条件を満たせない場合は、総ペナルティの小さい候補を採用する。

### 8.3 単一グループ

グループが1つ、またはグループ情報がない場合は `single-group` とする。

順位が両方入力されている初戦候補について、順位差が小さいほど大きなペナルティを加える。

```ts
function rankProximityPenalty(a: number, b: number): number {
  const distance = Math.abs(a - b);
  return RANK_PROXIMITY_WEIGHT / Math.max(1, distance);
}
```

同順位が最大となり、順位差が大きいほど小さくなる。片方でも順位が未入力の場合は、このペナルティを加えない。

### 8.4 同点・制約不足

- 既存の乱数ユーティリティを使用し、同点候補を乱数シードで決定する。
- すべての制約を満たすことを保証しない。
- 生成後に「best effortで配置した」ことを警告として表示できるよう、配置診断結果を返せる構造にする。
- 通常の所属チーム・地区回避が連携機能によって無効にならないようにする。

### 8.5 所属チームとチーム名

チーム種目では、トーナメント表へ表示する `teamName` と、同じチームを避けるための所属情報を分ける。配置ロジックは既存の所属情報を参照し、表示用チーム名の文字列一致を判定条件にしない。

---

## 9. 生成処理の責務

### 9.1 全体フロー

```text
1. Tournamentを読み込む
2. 連携レコードを読み込む
3. Tournamentを通常どおり正規化する
4. 通常の種目別バリデーションを行う
5. 連携レコードの順位区分を検証する
6. 順位区分に該当する参加者を抽出する
7. 順位未入力などの警告を集約する
8. 対象者数、ドローサイズ、シード数を検証する
9. 既存のシード配置を実行する
10. 既存のBYE配置を実行する
11. グループ・順位を含む配置コンテキストで未配置者を配置する
12. GeneratedDrawを作成する
13. 生成入力シグネチャへ連携レコードを含める
14. 生成結果と診断結果を返す
```

### 9.2 既存生成関数との境界

既存の通常トーナメント呼び出しを壊さないため、連携コンテキストは任意引数とする。

```ts
type GenerateDrawInput = {
  tournament: Tournament;
  randomSeed?: string | number;
  now?: string;
  placementContext?: LeaguePlacementContext;
};
```

連携コンテキストがない場合は、現在のチーム・地区配置と同じ動作をする。

### 9.3 生成入力シグネチャ

次の変更を生成済みドローの無効化対象とする。

- 引継ぎ元リーグIDの変更
- 順位区分の変更
- 対象参加者の変更
- グループの変更
- 順位の変更
- 通常の名簿、ドローサイズ、シード、オプションの変更

連携レコードの正規化表現を既存の `generationInputSignature` の計算入力へ追加する。これにより、連携情報だけが変更された状態で古いドローがプレビューされることを防ぐ。

---

## 10. 保存・状態管理

### 10.1 Provider境界

リーグの取得は `useLeagues()` または `LeagueRepository` に限定し、トーナメントProviderへリーグ一覧を常時混在させない。

連携作成用のサービスまたはフックが、必要なリーグを読み込んで変換する。

```text
useLeagues()
  ↓ read
leagueTournamentAdapter
  ↓ setup
TournamentProvider / TournamentIntegrationRepository
```

### 10.2 保存タイミング

- 基本情報保存時: 引継ぎ元、順位区分、基本的な連携レコードを保存する。
- 名簿保存時: `Tournament.entrants` と参加者配置メタデータを同時に更新する。
- 生成時: `GeneratedDraw` と生成シグネチャを保存する。
- 連携元変更時: 既存の生成結果を破棄し、名簿と配置メタデータを置換する。

### 10.3 リーグ側変更との関係

リーグを変更しても、既存トーナメントの名簿・グループ・順位は変更しない。作成済みトーナメントの画面では、必要に応じて次を表示する。

```text
引継ぎ元: 春季リーグ
作成時点: 2026-09-01 10:00
```

最新リーグとの差分確認や自動再連携は初期版の対象外とする。

---

## 11. 画面遷移・ルーティング

既存のトーナメントルートを利用する。

| パス | 画面 | 連携時の追加状態 |
|---|---|---|
| `/tournaments` | トーナメント一覧 | 追加アクション |
| `/tournaments/:id/edit/basic` | 基本情報 | リーグ選択、順位区分 |
| `/tournaments/:id/edit/entrants` | 名簿入力 | グループ、順位 |
| `/tournaments/:id/edit/options` | オプション | 既存設定を利用 |
| `/tournaments/:id/preview` | プレビュー | 出典・区分を表示 |

初回遷移時だけURLクエリで作成モードを渡してもよいが、保存後は連携レコードを正とする。URLだけに依存してはならない。

---

## 12. エラー・警告の設計

連携固有のエラーコードを通常のトーナメント入力エラーと分離する。

```ts
type LeagueTournamentIssueCode =
  | "SOURCE_LEAGUE_REQUIRED"
  | "SOURCE_LEAGUE_NOT_CONFIRMED"
  | "RANK_RANGE_INVALID"
  | "RANK_RANGE_NO_ENTRANTS"
  | "RANK_RANGE_TOO_FEW_ENTRANTS"
  | "RANK_INPUT_MISSING"
  | "PLACEMENT_GROUP_MISSING"
  | "PLACEMENT_RANK_DUPLICATED"
  | "SOURCE_REFERENCE_MISSING";
```

エラーは生成を停止し、警告は内容を表示したうえでユーザー確認後に生成できる構造とする。

---

## 13. テスト設計

### 13.1 先行するテスト観点

| 観点 | 主な確認内容 |
|---|---|
| 機能 | 基本情報でのリーグ選択、順位区分、名簿補完、生成 |
| データ | 共通DTO変換、ID対応、スナップショット、JSON、DB更新 |
| UI | 一覧メニュー、リーグ概要、グループ・順位列、警告、個別プレビュー |
| 非機能 | 決定性、保存失敗、リーグ削除後、負荷、ローカル完結 |
| 状態 | 未入力、部分入力、生成済み変更、リーグ変更、再読込、復元 |

### 13.2 単体テスト

#### アダプター

- individual / doubles / team の基本情報変換。
- チーム名と所属の分離。
- メンバー空欄の除外。
- 選択済み参加者だけの抽出。
- グループ作成済み・未作成の変換。
- `manualRank` あり・なしの変換。
- IDを新規発行し、出典IDを別に保持すること。

#### 順位区分

- `1-1位`、`1-2位`、最大順位を含む区分。
- 下限・上限の不正。
- 順位未入力者の警告。
- 対象者0名、1名、2名。
- ドローサイズちょうど、超過、BYE発生。

#### 配置

- 複数グループで同一グループ・同一順位の初戦対戦を優先的に回避する。
- 単一グループで順位差の小さい初戦対戦を優先的に回避する。
- 同順位、グループ未入力、順位未入力の扱い。
- 所属チーム・地区回避の既存挙動が維持される。
- 制約不足時にエラーではなくbest effort結果を返す。
- 同一入力・同一乱数シードで結果が一致する。

#### シグネチャ

- 順位区分変更で生成結果が古くなる。
- グループ変更で生成結果が古くなる。
- 順位変更で生成結果が古くなる。
- 通常トーナメントに連携コンテキストがない場合、既存シグネチャが変わらない。

### 13.3 UI・E2Eテスト

対象ケースを優先して実施する。

- トーナメント一覧の追加メニューから基本情報へ遷移する。
- 対戦カード未確定リーグが選択候補に出ない。
- リーグ選択後に状態、定員、グループ数、選択済み人数が表示される。
- 順位区分を1つ指定できる。
- 順位未入力の参加者を名簿入力画面で編集できる。
- 名簿入力後、指定順位区分のトーナメントだけが生成対象になる。
- 作成したトーナメントが一覧に別項目で表示され、個別にプレビューできる。
- リーグを削除した後も、作成済みトーナメントを表示・プレビューできる。
- 既存の通常トーナメント作成・リーグ作成に回帰がない。

E2Eでは、毎回テスト用リーグの初期化、対戦カード確定、参加者選択、順位入力状態を明示的に準備する。単一実機・単一ブラウザに対するスクリプトを並列実行しない。

---

## 14. 実装順序

1. 共通DTOと連携レコードの型定義
2. Leagueからの基本情報・参加者・グループ・順位変換
3. 連携レコード用IndexedDB storeとRepository
4. 基本情報画面のリーグ選択・概要表示・順位区分入力
5. 名簿入力画面のグループ・順位列と手動編集
6. 順位区分抽出と連携固有バリデーション
7. 生成入力シグネチャへの連携情報追加
8. グループ・順位配置スコア
9. JSON入出力とID再マッピング
10. 一覧・基本情報・名簿・プレビューのUIテスト
11. 既存機能の回帰確認

UI実装と生成ロジックは、可能な限り別コミットへ分離する。

---

## 15. 設計上の未実装範囲

初期版では次を実装しない。

- 複数順位区分の一括作成
- リーグから作成したトーナメントの自動再同期
- 順位による自動シード
- リーググループごとの自動的な別トーナメント作成
- リーグ結果とトーナメント結果の連携
- リーグと決勝トーナメントをまとめる親大会モデル

これらは、1トーナメント1順位区分の基本構造とスナップショット連携を実装した後の拡張候補とする。
